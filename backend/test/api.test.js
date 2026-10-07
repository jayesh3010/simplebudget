import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp, seedCategories } from '../src/app.js';
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
