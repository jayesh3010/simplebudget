export interface Category {
  id: string;
  name: string;
  monthlyLimit: number;
}

export type ExpenseType = 'Debit' | 'Credit';

export interface Expense {
  id: string;
  categoryId: string;
  amount: number;
  type: ExpenseType;
  subCategory: string;
  description: string;
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  createdAt: string;
}

export interface NewExpense {
  categoryId: string;
  amount: number;
  type: ExpenseType;
  subCategory: string;
  description: string;
  date: string;
}

export interface CategorySummary {
  categoryId: string;
  name: string;
  limit: number;
  spent: number;
  remaining: number;
  overLimit: boolean;
}

export interface MonthSummary {
  month: string;
  categories: CategorySummary[];
  totalLimit: number;
  totalSpent: number;
  totalRemaining: number;
}
