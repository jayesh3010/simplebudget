import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, forkJoin } from 'rxjs';
import { BudgetApi } from './budget-api.service';
import { Category, Expense, ExpenseType, MonthSummary } from './budget.models';

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

@Component({
  selector: 'app-root',
  imports: [FormsModule, DecimalPipe],
  templateUrl: './app.html',
})
export class App {
  private readonly api = inject(BudgetApi);

  readonly month = signal(today().slice(0, 7));
  readonly categories = signal<Category[]>([]);
  readonly expenses = signal<Expense[]>([]);
  readonly summary = signal<MonthSummary | null>(null);
  readonly error = signal('');

  readonly categoryNames = computed(
    () => new Map(this.categories().map((c) => [c.id, c.name] as const)),
  );

  // Add-expense form
  readonly expenseTypes: ExpenseType[] = ['Debit', 'Credit'];
  newExpense = {
    categoryId: '',
    amount: null as number | null,
    type: 'Debit' as ExpenseType,
    subCategory: '',
    description: '',
    date: today(),
  };

  // Add-category form
  newCategory = { name: '', monthlyLimit: null as number | null };

  // Limit being edited: category id -> draft limit
  readonly editing = signal<{ id: string; limit: number } | null>(null);

  constructor() {
    this.reload();
  }

  changeMonth(month: string): void {
    if (!month) return;
    this.month.set(month);
    this.reload();
  }

  reload(): void {
    const month = this.month();
    this.run(
      forkJoin({
        categories: this.api.getCategories(),
        expenses: this.api.getExpenses(month),
        summary: this.api.getSummary(month),
      }),
      ({ categories, expenses, summary }) => {
        this.categories.set(categories);
        this.expenses.set(expenses);
        this.summary.set(summary);
        if (!this.newExpense.categoryId && categories.length) {
          this.newExpense.categoryId = categories[0].id;
        }
      },
    );
  }

  addExpense(): void {
    const { categoryId, amount, type, subCategory, description, date } = this.newExpense;
    if (!categoryId || !amount || amount <= 0 || !date) return;
    this.run(this.api.addExpense({ categoryId, amount, type, subCategory, description, date }), (saved) => {
      this.newExpense = { ...this.newExpense, amount: null, type: 'Debit', subCategory: '', description: '' };
      // Jump to the month the expense belongs to so it is visible.
      this.month.set(saved.month);
      this.reload();
    });
  }

  deleteExpense(expense: Expense): void {
    this.run(this.api.deleteExpense(expense), () => this.reload());
  }

  addCategory(): void {
    const { name, monthlyLimit } = this.newCategory;
    if (!name.trim() || monthlyLimit == null || monthlyLimit < 0) return;
    this.run(this.api.createCategory(name.trim(), monthlyLimit), () => {
      this.newCategory = { name: '', monthlyLimit: null };
      this.reload();
    });
  }

  startEdit(categoryId: string, limit: number): void {
    this.editing.set({ id: categoryId, limit });
  }

  saveLimit(): void {
    const edit = this.editing();
    const category = this.categories().find((c) => c.id === edit?.id);
    if (!edit || !category || edit.limit == null || edit.limit < 0) return;
    this.run(this.api.updateCategory({ ...category, monthlyLimit: edit.limit }), () => {
      this.editing.set(null);
      this.reload();
    });
  }

  deleteCategory(categoryId: string): void {
    this.run(this.api.deleteCategory(categoryId), () => this.reload());
  }

  percent(spent: number, limit: number): number {
    if (limit <= 0) return spent > 0 ? 100 : 0;
    return Math.min(100, Math.round((spent / limit) * 100));
  }

  private run<T>(request: Observable<T>, onSuccess: (value: T) => void): void {
    this.error.set('');
    request.subscribe({
      next: onSuccess,
      error: (err: HttpErrorResponse) =>
        this.error.set(err.error?.error ?? 'Could not reach the SimpleBudge API. Is the backend running?'),
    });
  }
}
