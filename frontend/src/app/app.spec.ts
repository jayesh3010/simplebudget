import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('shows spent vs limit for each category', async () => {
    const fixture = TestBed.createComponent(App);
    const http = TestBed.inject(HttpTestingController);
    const month = fixture.componentInstance.month();

    http.expectOne('/api/categories').flush([{ id: 'c1', name: 'Groceries', monthlyLimit: 400 }]);
    http.expectOne(`/api/expenses?month=${month}`).flush([]);
    http.expectOne(`/api/summary?month=${month}`).flush({
      month,
      categories: [
        { categoryId: 'c1', name: 'Groceries', limit: 400, spent: 450, remaining: -50, overLimit: true },
      ],
      totalLimit: 400,
      totalSpent: 450,
      totalRemaining: -50,
    });
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.limits .name')?.textContent).toContain('Groceries');
    expect(el.querySelector('.limits .figures')?.textContent).toContain('450.00 / 400.00');
    expect(el.querySelector('.limits .bar')?.classList).toContain('over');
  });

  it('shows sub-category and debit/credit in the expense list', async () => {
    const fixture = TestBed.createComponent(App);
    const http = TestBed.inject(HttpTestingController);
    const month = fixture.componentInstance.month();
    const base = { categoryId: 'c1', description: '', month, createdAt: '' };

    http.expectOne('/api/categories').flush([{ id: 'c1', name: 'Groceries', monthlyLimit: 400 }]);
    http.expectOne(`/api/expenses?month=${month}`).flush([
      { ...base, id: 'e1', amount: 20, type: 'Debit', subCategory: 'Corner Shop', date: `${month}-02` },
      { ...base, id: 'e2', amount: 5, type: 'Credit', subCategory: 'Refund desk', date: `${month}-01` },
    ]);
    http.expectOne(`/api/summary?month=${month}`).flush({
      month, categories: [], totalLimit: 0, totalSpent: 15, totalRemaining: -15,
    });
    await fixture.whenStable();

    const rows = [...(fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr')].map((r) =>
      [...r.querySelectorAll('td')].map((td) => td.textContent!.trim()),
    );
    expect(rows[0].slice(1, 6)).toEqual(['Groceries', 'Corner Shop', '', 'Debit', '20.00']);
    expect(rows[1].slice(1, 6)).toEqual(['Groceries', 'Refund desk', '', 'Credit', '+5.00']);
  });

  it('sends sub-category and type when adding an expense', async () => {
    const fixture = TestBed.createComponent(App);
    const http = TestBed.inject(HttpTestingController);
    const app = fixture.componentInstance;
    const month = app.month();
    http.expectOne('/api/categories').flush([{ id: 'c1', name: 'Groceries', monthlyLimit: 400 }]);
    http.expectOne(`/api/expenses?month=${month}`).flush([]);
    http.expectOne(`/api/summary?month=${month}`).flush({
      month, categories: [], totalLimit: 0, totalSpent: 0, totalRemaining: 0,
    });

    app.newExpense = { ...app.newExpense, amount: 12, type: 'Credit', subCategory: 'Amazon' };
    app.addExpense();
    const req = http.expectOne('/api/expenses');
    expect(req.request.body).toEqual(
      expect.objectContaining({ categoryId: 'c1', amount: 12, type: 'Credit', subCategory: 'Amazon' }),
    );
  });
});
