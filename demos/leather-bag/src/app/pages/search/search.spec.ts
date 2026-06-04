import { describe, beforeEach, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { Search } from './search';
import { ProductService } from '../../services/product';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

try {
  TestBed.initTestEnvironment(
    BrowserTestingModule,
    platformBrowserTesting()
  );
} catch {
  // Already initialized
}

const mockProductService = {
  getProducts: () => of([])
};

describe('Search', () => {
  let component: Search;
  let fixture: ComponentFixture<Search>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Search],
      providers: [
        { provide: ProductService, useValue: mockProductService },
        provideHttpClient(),
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Search);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
