import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp, seedCategories, seedPaymentTypes } from '../src/app.js';
import { MemoryStore } from '../src/store/memory-store.js';

let server;
let base;

before(async () => {
  const store = new MemoryStore();
  await seedCategories(store);
  server = createApp(store).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://localhost:${server.address().port}/api`;
});

after(() => server.close());

const call = async (method, path, body) => {
  const res = await fetch(base + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
};

test('seeds default categories with limits', async () => {
  const { status, body } = await call('GET', '/categories');
  assert.equal(status, 200);
  assert.ok(body.length >= 5);
  assert.ok(body.every((c) => typeof c.monthlyLimit === 'number'));
});

test('summary tracks spent vs limit per category for a month', async () => {
  const { body: cat } = await call('POST', '/categories', { name: 'Coffee', monthlyLimit: 20 });
  await call('POST', '/expenses', { categoryId: cat.id, amount: 12.5, date: '2026-10-02', description: 'Beans' });
  await call('POST', '/expenses', { categoryId: cat.id, amount: 9, date: '2026-10-05' });
  await call('POST', '/expenses', { categoryId: cat.id, amount: 4, date: '2026-09-30' });

  const { body } = await call('GET', '/summary?month=2026-10');
  const row = body.categories.find((r) => r.categoryId === cat.id);
  assert.deepEqual(
    { spent: row.spent, limit: row.limit, remaining: row.remaining, overLimit: row.overLimit },
    { spent: 21.5, limit: 20, remaining: -1.5, overLimit: true },
  );

  const { body: sept } = await call('GET', '/expenses?month=2026-09');
  assert.equal(sept.length, 1);
});

test('updates a category limit', async () => {
  const { body: cat } = await call('POST', '/categories', { name: 'Books', monthlyLimit: 30 });
  const { status, body } = await call('PUT', `/categories/${cat.id}`, { name: 'Books', monthlyLimit: 45 });
  assert.equal(status, 200);
  assert.equal(body.monthlyLimit, 45);
});

test('deletes an expense', async () => {
  const { body: cats } = await call('GET', '/categories');
  const { body: exp } = await call('POST', '/expenses', { categoryId: cats[0].id, amount: 3, date: '2026-08-01' });
  assert.equal((await call('DELETE', `/expenses/${exp.id}?month=2026-08`)).status, 204);
  assert.equal((await call('GET', '/expenses?month=2026-08')).body.length, 0);
});

test('rejects invalid input', async () => {
  const { body: cats } = await call('GET', '/categories');
  assert.equal((await call('POST', '/expenses', { categoryId: cats[0].id, amount: -5, date: '2026-10-01' })).status, 400);
  assert.equal((await call('POST', '/expenses', { categoryId: 'nope', amount: 5, date: '2026-10-01' })).status, 400);
  assert.equal((await call('GET', '/summary?month=2026-13')).status, 400);
  assert.equal((await call('POST', '/categories', { name: 'Rent', monthlyLimit: 1 })).status, 409);
});

test('refuses to delete a category that has expenses', async () => {
  const { body: cat } = await call('POST', '/categories', { name: 'Gym', monthlyLimit: 50 });
  await call('POST', '/expenses', { categoryId: cat.id, amount: 30, date: '2026-10-01' });
  assert.equal((await call('DELETE', `/categories/${cat.id}`)).status, 409);
});

test('stores sub-category and debit/credit type, defaulting to Debit', async () => {
  const { body: cats } = await call('GET', '/categories');
  const { status, body } = await call('POST', '/expenses', {
    categoryId: cats[0].id, amount: 7, date: '2026-07-01', subCategory: '  Corner Shop ',
  });
  assert.equal(status, 201);
  assert.equal(body.type, 'Debit');
  assert.equal(body.subCategory, 'Corner Shop');

  const { body: credit } = await call('POST', '/expenses', {
    categoryId: cats[0].id, amount: 2, date: '2026-07-02', type: 'Credit',
  });
  assert.equal(credit.type, 'Credit');
  assert.equal(credit.subCategory, '');
});

test('rejects a type other than Debit or Credit', async () => {
  const { body: cats } = await call('GET', '/categories');
  for (const type of ['debit', 'Refund', '', 5]) {
    const res = await call('POST', '/expenses', { categoryId: cats[0].id, amount: 1, date: '2026-07-01', type });
    assert.equal(res.status, 400, `type ${JSON.stringify(type)}`);
  }
});

test('credits reduce spent in the monthly summary', async () => {
  const { body: cat } = await call('POST', '/categories', { name: 'Clothes', monthlyLimit: 100 });
  await call('POST', '/expenses', { categoryId: cat.id, amount: 80, date: '2026-06-03', type: 'Debit' });
  await call('POST', '/expenses', { categoryId: cat.id, amount: 30, date: '2026-06-10', type: 'Credit' });
  const { body } = await call('GET', '/summary?month=2026-06');
  const row = body.categories.find((r) => r.categoryId === cat.id);
  assert.equal(row.spent, 50);
  assert.equal(row.remaining, 50);
});

test('reads expenses saved without a type as Debit', async () => {
  const store = new MemoryStore();
  await store.saveCategory({ id: 'c1', name: 'Old', monthlyLimit: 10 });
  await store.saveExpense({
    id: 'e1', categoryId: 'c1', amount: 4, description: '', date: '2026-05-01', month: '2026-05',
    createdAt: '2026-05-01T00:00:00.000Z',
  });
  const legacy = createApp(store).listen(0);
  await new Promise((resolve) => legacy.once('listening', resolve));
  try {
    const url = `http://localhost:${legacy.address().port}/api`;
    const expenses = await (await fetch(`${url}/expenses?month=2026-05`)).json();
    assert.equal(expenses[0].type, 'Debit');
    assert.equal(expenses[0].subCategory, '');
    assert.equal(expenses[0].paymentTypeId, '');
    const summary = await (await fetch(`${url}/summary?month=2026-05`)).json();
    assert.equal(summary.categories[0].spent, 4);
  } finally {
    legacy.close();
  }
});

test('adds, updates and removes payment types', async () => {
  const { status, body: card } = await call('POST', '/payment-types', {
    name: ' Amex Gold ', kind: 'Credit card', provider: ' American Express ',
  });
  assert.equal(status, 201);
  assert.deepEqual({ name: card.name, kind: card.kind, provider: card.provider },
    { name: 'Amex Gold', kind: 'Credit card', provider: 'American Express' });

  const { body: updated } = await call('PUT', `/payment-types/${card.id}`, {
    name: 'Amex Platinum', kind: 'Credit card', provider: 'American Express',
  });
  assert.equal(updated.name, 'Amex Platinum');
  assert.ok((await call('GET', '/payment-types')).body.some((p) => p.name === 'Amex Platinum'));

  assert.equal((await call('DELETE', `/payment-types/${card.id}`)).status, 204);
  assert.equal((await call('DELETE', `/payment-types/${card.id}`)).status, 404);
  assert.ok(!(await call('GET', '/payment-types')).body.some((p) => p.id === card.id));
});

test('rejects invalid or duplicate payment types', async () => {
  await call('POST', '/payment-types', { name: 'Cash', kind: 'Cash' });
  assert.equal((await call('POST', '/payment-types', { name: 'cash', kind: 'Cash' })).status, 409);
  assert.equal((await call('POST', '/payment-types', { name: '', kind: 'Cash' })).status, 400);
  assert.equal((await call('POST', '/payment-types', { name: 'Visa', kind: 'Cheque' })).status, 400);
  assert.equal((await call('PUT', '/payment-types/nope', { name: 'X' })).status, 404);
});

test('expenses take an optional payment type that survives its deletion', async () => {
  const { body: cats } = await call('GET', '/categories');
  const { body: debit } = await call('POST', '/payment-types', { name: 'HDFC Debit', kind: 'Debit card', provider: 'HDFC' });

  const { body: plain } = await call('POST', '/expenses', { categoryId: cats[0].id, amount: 1, date: '2026-04-01' });
  assert.equal(plain.paymentTypeId, '');
  const { status, body: paid } = await call('POST', '/expenses', {
    categoryId: cats[0].id, amount: 2, date: '2026-04-02', paymentTypeId: debit.id,
  });
  assert.equal(status, 201);
  assert.equal(paid.paymentTypeId, debit.id);
  assert.equal((await call('POST', '/expenses', {
    categoryId: cats[0].id, amount: 2, date: '2026-04-02', paymentTypeId: 'nope',
  })).status, 400);

  assert.equal((await call('DELETE', `/payment-types/${debit.id}`)).status, 204);
  const { body: april } = await call('GET', '/expenses?month=2026-04');
  assert.equal(april.length, 2);
});

test('seeds starter payment types only into an empty store', async () => {
  const store = new MemoryStore();
  await seedPaymentTypes(store);
  const seeded = await store.listPaymentTypes();
  assert.deepEqual(seeded.map((p) => p.name), ['Bank transfer', 'Cash']);

  await seedPaymentTypes(store);
  assert.equal((await store.listPaymentTypes()).length, 2);
});
