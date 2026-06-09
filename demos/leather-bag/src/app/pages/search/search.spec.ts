import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { Injector, resource } from '@angular/core';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { Product, ProductService } from '../../services/product';
import { Search } from './search';

const mockProductService = (injector: Injector) => ({
  getProducts: () => of([]),
  products: resource<any, Product[]>({
    loader: () => Promise.resolve([]),
    injector,
  }),
});

describe('Search', () => {
  let component: Search;
  let fixture: ComponentFixture<Search>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ProductService,
          usFactory: (injector: Injector) => mockProductService(injector),
          deps: [Injector],
        },
        provideRouter([]),
      ],
    });

    fixture = TestBed.createComponent(Search);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
