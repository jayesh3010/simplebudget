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
});
