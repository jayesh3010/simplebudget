import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import cors from 'cors';
import express from 'express';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const EXPENSE_TYPES = ['Debit', 'Credit'];
export const PAYMENT_KINDS = ['Credit card', 'Debit card', 'Cash', 'Bank transfer', 'Other'];

// Starting data for a fresh database. Edit seed/seed-data.json to change it.
const seedData = JSON.parse(
  readFileSync(new URL('../seed/seed-data.json', import.meta.url), 'utf8'),
);
export const DEFAULT_CATEGORIES = seedData.categories;
export const DEFAULT_PAYMENT_TYPES = seedData.paymentTypes;

// Each seed only runs when its collection is empty, so it never overwrites
// or duplicates data the user already has.
export async function seedCategories(store) {
  const existing = await store.listCategories();
  if (existing.length > 0) return;
  for (const c of DEFAULT_CATEGORIES) {
    await store.saveCategory({ id: randomUUID(), ...c });
  }
}

export async function seedPaymentTypes(store) {
  const existing = await store.listPaymentTypes();
  if (existing.length > 0) return;
  for (const p of DEFAULT_PAYMENT_TYPES) {
    await store.savePaymentType({ id: randomUUID(), ...p });
  }
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function parseMonth(value) {
  if (typeof value !== 'string' || !MONTH_RE.test(value)) {
    throw new HttpError(400, 'month must be in YYYY-MM format');
  }
  return value;
}

// Expenses saved before the type field existed are debits.
// Expenses saved before paymentTypeId existed have no payment type.
function withDefaults(expense) {
  return { subCategory: '', paymentTypeId: '', ...expense, type: expense.type ?? 'Debit' };
}

// A credit (refund, cashback) reduces what was spent in its category.
function signedAmount(expense) {
  return expense.type === 'Credit' ? -expense.amount : expense.amount;
}

function parseCategoryBody(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 50) {
    throw new HttpError(400, 'name is required (max 50 characters)');
  }
  const monthlyLimit = Number(body?.monthlyLimit);
  if (!Number.isFinite(monthlyLimit) || monthlyLimit < 0) {
    throw new HttpError(400, 'monthlyLimit must be a number of 0 or more');
  }
  return { name, monthlyLimit: round2(monthlyLimit) };
}

function parsePaymentTypeBody(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 50) {
    throw new HttpError(400, 'name is required (max 50 characters)');
  }
  const kind = body?.kind ?? 'Other';
  if (!PAYMENT_KINDS.includes(kind)) {
    throw new HttpError(400, `kind must be one of: ${PAYMENT_KINDS.join(', ')}`);
  }
  const provider = typeof body?.provider === 'string' ? body.provider.trim().slice(0, 50) : '';
  return { name, kind, provider };
}

export function createApp(store, { corsOrigin } = {}) {
  const app = express();
  app.use(cors(corsOrigin ? { origin: corsOrigin } : undefined));
  app.use(express.json());

  const api = express.Router();

  api.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // ---- Categories (each has its own monthly limit) ----

  api.get('/categories', async (_req, res) => {
    res.json(await store.listCategories());
  });

  api.post('/categories', async (req, res) => {
    const data = parseCategoryBody(req.body);
    const all = await store.listCategories();
    if (all.some((c) => c.name.toLowerCase() === data.name.toLowerCase())) {
      throw new HttpError(409, `Category "${data.name}" already exists`);
    }
    const saved = await store.saveCategory({ id: randomUUID(), ...data });
    res.status(201).json(saved);
  });

  api.put('/categories/:id', async (req, res) => {
    const existing = await store.getCategory(req.params.id);
    if (!existing) throw new HttpError(404, 'Category not found');
    const data = parseCategoryBody(req.body);
    const all = await store.listCategories();
    if (all.some((c) => c.id !== existing.id && c.name.toLowerCase() === data.name.toLowerCase())) {
      throw new HttpError(409, `Category "${data.name}" already exists`);
    }
    res.json(await store.saveCategory({ ...existing, ...data }));
  });

  api.delete('/categories/:id', async (req, res) => {
    if ((await store.countExpensesForCategory(req.params.id)) > 0) {
      throw new HttpError(409, 'Category has expenses; delete those first');
    }
    if (!(await store.deleteCategory(req.params.id))) {
      throw new HttpError(404, 'Category not found');
    }
    res.status(204).end();
  });

  // ---- Payment types (how an expense was paid, e.g. a specific card) ----

  api.get('/payment-types', async (_req, res) => {
    res.json(await store.listPaymentTypes());
  });

  api.post('/payment-types', async (req, res) => {
    const data = parsePaymentTypeBody(req.body);
    const all = await store.listPaymentTypes();
    if (all.some((p) => p.name.toLowerCase() === data.name.toLowerCase())) {
      throw new HttpError(409, `Payment type "${data.name}" already exists`);
    }
    const saved = await store.savePaymentType({ id: randomUUID(), ...data });
    res.status(201).json(saved);
  });

  api.put('/payment-types/:id', async (req, res) => {
    const existing = await store.getPaymentType(req.params.id);
    if (!existing) throw new HttpError(404, 'Payment type not found');
    const data = parsePaymentTypeBody(req.body);
    const all = await store.listPaymentTypes();
    if (all.some((p) => p.id !== existing.id && p.name.toLowerCase() === data.name.toLowerCase())) {
      throw new HttpError(409, `Payment type "${data.name}" already exists`);
    }
    res.json(await store.savePaymentType({ ...existing, ...data }));
  });

  // Expenses that used a deleted payment type keep their id and simply show
  // no payment type, so deleting one never touches expense history.
  api.delete('/payment-types/:id', async (req, res) => {
    if (!(await store.deletePaymentType(req.params.id))) {
      throw new HttpError(404, 'Payment type not found');
    }
    res.status(204).end();
  });

  // ---- Expenses ----

  api.get('/expenses', async (req, res) => {
    const expenses = await store.listExpenses(parseMonth(req.query.month));
    res.json(expenses.map(withDefaults));
  });

  api.post('/expenses', async (req, res) => {
    const { categoryId, description, subCategory, date, type = 'Debit', paymentTypeId = '' } = req.body ?? {};
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new HttpError(400, 'amount must be a number greater than 0');
    }
    if (typeof date !== 'string' || !DATE_RE.test(date)) {
      throw new HttpError(400, 'date must be in YYYY-MM-DD format');
    }
    if (!EXPENSE_TYPES.includes(type)) {
      throw new HttpError(400, 'type must be either Debit or Credit');
    }
    if (typeof categoryId !== 'string' || !(await store.getCategory(categoryId))) {
      throw new HttpError(400, 'categoryId must be an existing category');
    }
    if (paymentTypeId !== '' && paymentTypeId !== null
        && (typeof paymentTypeId !== 'string' || !(await store.getPaymentType(paymentTypeId)))) {
      throw new HttpError(400, 'paymentTypeId must be an existing payment type or empty');
    }
    const expense = {
      id: randomUUID(),
      categoryId,
      amount: round2(amount),
      subCategory: typeof subCategory === 'string' ? subCategory.trim().slice(0, 100) : '',
      description: typeof description === 'string' ? description.trim().slice(0, 200) : '',
      type,
      paymentTypeId: paymentTypeId ?? '',
      date,
      month: date.slice(0, 7),
      createdAt: new Date().toISOString(),
    };
    res.status(201).json(await store.saveExpense(expense));
  });

  api.delete('/expenses/:id', async (req, res) => {
    const month = parseMonth(req.query.month);
    if (!(await store.deleteExpense(req.params.id, month))) {
      throw new HttpError(404, 'Expense not found');
    }
    res.status(204).end();
  });

  // ---- Monthly summary: spent vs limit per category ----

  api.get('/summary', async (req, res) => {
    const month = parseMonth(req.query.month);
    const [categories, expenses] = await Promise.all([
      store.listCategories(),
      store.listExpenses(month),
    ]);
    const spentByCategory = new Map();
    for (const e of expenses.map(withDefaults)) {
      spentByCategory.set(e.categoryId, (spentByCategory.get(e.categoryId) ?? 0) + signedAmount(e));
    }
    const rows = categories.map((c) => {
      const spent = round2(spentByCategory.get(c.id) ?? 0);
      return {
        categoryId: c.id,
        name: c.name,
        limit: c.monthlyLimit,
        spent,
        remaining: round2(c.monthlyLimit - spent),
        overLimit: spent > c.monthlyLimit,
      };
    });
    const totalLimit = round2(rows.reduce((s, r) => s + r.limit, 0));
    const totalSpent = round2(rows.reduce((s, r) => s + r.spent, 0));
    res.json({
      month,
      categories: rows,
      totalLimit,
      totalSpent,
      totalRemaining: round2(totalLimit - totalSpent),
    });
  });

  app.use('/api', api);

  app.use((_req, _res, next) => next(new HttpError(404, 'Not found')));

  // Express 5 forwards rejected promises from async handlers here.
  app.use((err, _req, res, _next) => {
    const status = err.status ?? 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
  });

  return app;
}
