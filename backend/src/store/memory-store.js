import { newestFirst } from './sort.js';

// Keeps everything in memory. Used for local development and tests when
// Cosmos DB is not configured. Data is lost when the process exits.
export class MemoryStore {
  constructor() {
    this.categories = new Map();
    this.expenses = new Map();
  }

  async init() {}

  async listCategories() {
    return [...this.categories.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async getCategory(id) {
    return this.categories.get(id) ?? null;
  }

  async saveCategory(category) {
    this.categories.set(category.id, { ...category });
    return category;
  }

  async deleteCategory(id) {
    return this.categories.delete(id);
  }

  async listExpenses(month) {
    return [...this.expenses.values()]
      .filter((e) => e.month === month)
      .sort(newestFirst);
  }

  async countExpensesForCategory(categoryId) {
    return [...this.expenses.values()].filter((e) => e.categoryId === categoryId).length;
  }

  async saveExpense(expense) {
    this.expenses.set(expense.id, { ...expense });
    return expense;
  }

  async deleteExpense(id, month) {
    const existing = this.expenses.get(id);
    if (!existing || existing.month !== month) return false;
    return this.expenses.delete(id);
  }
}
