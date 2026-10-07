# SimpleBudge

A simple single-user budget app (no login). Record expenses by category, set a
monthly limit for each category, and see spent vs limit for any month.

- `frontend/`: Angular 21 app (standalone components, signals)
- `backend/`: Node.js + Express 5 REST API
- Storage: Azure Cosmos DB (NoSQL API), with an in-memory fallback for local dev

## Requirements

- Node.js 22.12+ (or 20.19+) and npm
- Optional: an Azure Cosmos DB account or the
  [Cosmos DB emulator](https://learn.microsoft.com/azure/cosmos-db/emulator)

## Run locally

```bash
# 1. API (http://localhost:3000)
cd backend
npm install
cp .env.example .env      # leave COSMOS_* empty to use the in-memory store
npm start

# 2. Web app (http://localhost:4200), in a second terminal
cd frontend
npm install
npm start
```

`ng serve` proxies `/api` to `http://localhost:3000` (see `frontend/proxy.conf.json`).
On first start the API creates five sample categories (Groceries, Rent,
Transport, Utilities, Entertainment) with limits you can edit in the app.

## Using Azure Cosmos DB

Set these in `backend/.env`:

| Variable          | Meaning                                         |
|-------------------|-------------------------------------------------|
| `COSMOS_ENDPOINT` | Account URI, e.g. `https://<account>.documents.azure.com:443/` |
| `COSMOS_KEY`      | Account primary key (keep it out of git)        |
| `COSMOS_DATABASE` | Database name, default `simplebudge`            |

On startup the API creates the database and three containers if they don't exist:

| Container    | Partition key | Document                                              |
|--------------|---------------|-------------------------------------------------------|
| `categories` | `/id`         | `{ id, name, monthlyLimit }`                          |
| `paymentTypes` | `/id`       | `{ id, name, kind, provider }`                        |
| `expenses`   | `/month`      | `{ id, categoryId, amount, type, subCategory, paymentTypeId, description, date, month, createdAt }` |

Expenses are partitioned by month (`YYYY-MM`) so the monthly view reads a single partition.
`type` is `Debit` or `Credit`; a credit (refund, cashback) reduces the month's spent
total for its category. Expenses saved before `type` existed are read as `Debit`.
`subCategory` is optional free text, for example the vendor.
`paymentTypeId` is optional and points to a payment type (a card, cash, a bank
account). `kind` is one of `Credit card`, `Debit card`, `Cash`, `Bank transfer`,
`Other`; `provider` is optional free text such as the bank. Deleting a payment
type leaves its expenses as they are; they just show no payment type.

## API

| Method | Path                               | Body / query                                  |
|--------|------------------------------------|-----------------------------------------------|
| GET    | `/api/categories`                  |                                               |
| POST   | `/api/categories`                  | `{ name, monthlyLimit }`                      |
| PUT    | `/api/categories/:id`              | `{ name, monthlyLimit }`                      |
| DELETE | `/api/categories/:id`              | refused (409) while it has expenses           |
| GET    | `/api/payment-types`               |                                               |
| POST   | `/api/payment-types`               | `{ name, kind?, provider? }`                  |
| PUT    | `/api/payment-types/:id`           | `{ name, kind?, provider? }`                  |
| DELETE | `/api/payment-types/:id`           | expenses that used it keep their history      |
| GET    | `/api/expenses?month=YYYY-MM`      |                                               |
| POST   | `/api/expenses`                    | `{ categoryId, amount, date: YYYY-MM-DD, type?: Debit\|Credit (default Debit), subCategory?, paymentTypeId?, description? }` |
| DELETE | `/api/expenses/:id?month=YYYY-MM`  |                                               |
| GET    | `/api/summary?month=YYYY-MM`       | spent, limit and remaining per category, plus totals |

## Tests

```bash
cd backend && npm test             # API tests against the in-memory store
cd frontend && npx ng test --watch=false
```
