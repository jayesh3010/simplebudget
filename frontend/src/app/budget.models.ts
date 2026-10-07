export interface Category {
  id: string;
  name: string;
  monthlyLimit: number;
}

export type ExpenseType = 'Debit' | 'Credit';

export type PaymentKind = 'Credit card' | 'Debit card' | 'Cash' | 'Bank transfer' | 'Other';

export interface PaymentType {
  id: string;
  name: string;
  kind: PaymentKind;
  provider: string;
}

export type PaymentTypeInput = Omit<PaymentType, 'id'>;

export interface Expense {
  id: string;
  categoryId: string;
  amount: number;
  type: ExpenseType;
  subCategory: string;
  paymentTypeId: string; // '' when none; may point to a deleted payment type
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
  paymentTypeId: string;
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
