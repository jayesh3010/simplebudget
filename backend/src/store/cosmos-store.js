import { CosmosClient } from '@azure/cosmos';
import { newestFirst } from './sort.js';

// Three containers:
//   categories    partition key /id     { id, name, monthlyLimit }
//   paymentTypes  partition key /id     { id, name, kind, provider }
//   expenses      partition key /month  { id, categoryId, amount, type, subCategory, paymentTypeId, description, date, month }
// Partitioning expenses by month keeps the common "show this month" query
// inside a single partition.
export class CosmosStore {
  constructor({ endpoint, key, database }) {
    this.client = new CosmosClient({ endpoint, key });
    this.databaseId = database;
  }

  async init() {
    const { database } = await this.client.databases.createIfNotExists({ id: this.databaseId });
    ({ container: this.categories } = await database.containers.createIfNotExists({
      id: 'categories',
      partitionKey: { paths: ['/id'] },
    }));
    ({ container: this.paymentTypes } = await database.containers.createIfNotExists({
      id: 'paymentTypes',
      partitionKey: { paths: ['/id'] },
    }));
    ({ container: this.expenses } = await database.containers.createIfNotExists({
      id: 'expenses',
      partitionKey: { paths: ['/month'] },
    }));
  }

  async listCategories() {
    const { resources } = await this.categories.items
      .query('SELECT c.id, c.name, c.monthlyLimit FROM c')
      .fetchAll();
    return resources.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getCategory(id) {
    const { resource } = await this.categories.item(id, id).read();
    return resource ? strip(resource) : null;
  }

  async saveCategory(category) {
    const { resource } = await this.categories.items.upsert(category);
    return strip(resource);
  }

  async deleteCategory(id) {
    try {
      await this.categories.item(id, id).delete();
      return true;
    } catch (err) {
      if (err.code === 404) return false;
      throw err;
    }
  }

  async listPaymentTypes() {
    const { resources } = await this.paymentTypes.items
      .query('SELECT p.id, p.name, p.kind, p.provider FROM p')
      .fetchAll();
    return resources.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getPaymentType(id) {
    const { resource } = await this.paymentTypes.item(id, id).read();
    return resource ? strip(resource) : null;
  }

  async savePaymentType(paymentType) {
    const { resource } = await this.paymentTypes.items.upsert(paymentType);
    return strip(resource);
  }

  async deletePaymentType(id) {
    try {
      await this.paymentTypes.item(id, id).delete();
      return true;
    } catch (err) {
      if (err.code === 404) return false;
      throw err;
    }
  }

  async listExpenses(month) {
    const { resources } = await this.expenses.items
      .query(
        {
          // Sorted in code: ORDER BY on two fields needs a composite index,
          // and a month's expenses are few enough to sort here.
          query: 'SELECT * FROM e WHERE e.month = @month',
          parameters: [{ name: '@month', value: month }],
        },
        { partitionKey: month },
      )
      .fetchAll();
    return resources.map(strip).sort(newestFirst);
  }

  async countExpensesForCategory(categoryId) {
    const { resources } = await this.expenses.items
      .query({
        query: 'SELECT VALUE COUNT(1) FROM e WHERE e.categoryId = @categoryId',
        parameters: [{ name: '@categoryId', value: categoryId }],
      })
      .fetchAll();
    return resources[0] ?? 0;
  }

  async saveExpense(expense) {
    const { resource } = await this.expenses.items.create(expense);
    return strip(resource);
  }

  async deleteExpense(id, month) {
    try {
      await this.expenses.item(id, month).delete();
      return true;
    } catch (err) {
      if (err.code === 404) return false;
      throw err;
    }
  }
}

// Drop Cosmos system properties (_rid, _etag, ...) before returning to clients.
function strip(doc) {
  return Object.fromEntries(Object.entries(doc).filter(([k]) => !k.startsWith('_')));
}
