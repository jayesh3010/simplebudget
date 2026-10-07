import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Category, Expense, MonthSummary, NewExpense } from './budget.models';

// Relative URL: in development `ng serve` proxies /api to the Express server
// (see proxy.conf.json).
const API = '/api';

@Injectable({ providedIn: 'root' })
export class BudgetApi {
  private readonly http = inject(HttpClient);

  getCategories(): Observable<Category[]> {
    return this.http.get<Category[]>(`${API}/categories`);
  }

  createCategory(name: string, monthlyLimit: number): Observable<Category> {
    return this.http.post<Category>(`${API}/categories`, { name, monthlyLimit });
  }

  updateCategory(category: Category): Observable<Category> {
    return this.http.put<Category>(`${API}/categories/${category.id}`, category);
  }

  deleteCategory(id: string): Observable<void> {
    return this.http.delete<void>(`${API}/categories/${id}`);
  }

  getExpenses(month: string): Observable<Expense[]> {
    return this.http.get<Expense[]>(`${API}/expenses`, { params: { month } });
  }

  addExpense(expense: NewExpense): Observable<Expense> {
    return this.http.post<Expense>(`${API}/expenses`, expense);
  }

  deleteExpense(expense: Expense): Observable<void> {
    return this.http.delete<void>(`${API}/expenses/${expense.id}`, {
      params: { month: expense.month },
    });
  }

  getSummary(month: string): Observable<MonthSummary> {
    return this.http.get<MonthSummary>(`${API}/summary`, { params: { month } });
  }
}
