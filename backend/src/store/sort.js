// Expenses newest first: by date, then by when they were entered.
export function newestFirst(a, b) {
  return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
}
