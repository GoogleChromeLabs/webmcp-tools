import { describe, beforeEach, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProductComponent } from './product';
import { ProductService, Product } from '../../services/product';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideExperimentalWebMcpForms } from '@angular/forms/signals';
import { Component } from '@angular/core';
import { By } from '@angular/platform-browser';
import { Subject } from 'rxjs';


const mockProduct: Product = {
  id: '1',
  name: 'Luxe Tote',
  slug: 'luxe-tote',
  price: 495,
  category: 'Bags',
  shortDescription: 'Short desc',
  description: 'Full desc',
  images: ['image1.jpg'],
  colors: [{ id: '1', name: 'Brown', hex: '#8B4513' }],
  finish: 'Smooth',
  rating: 4.8,
  reviewsCount: 12,
  isNewArrival: false,
  isFeatured: true
};

@Component({
  imports: [ProductComponent],
  template: `<app-product [id]="productId"></app-product>`
})
class TestHostComponent {
  productId = 'luxe-tote';
}

describe('ProductComponent', () => {
  let component: ProductComponent;
  let hostFixture: ComponentFixture<TestHostComponent>;
  let productSubject: Subject<Product | undefined>;

  beforeEach(async () => {
    productSubject = new Subject<Product | undefined>();
    const mockProductService = {
      getProductBySlug: (slug: string) => productSubject.asObservable()
    };

    await TestBed.configureTestingModule({
      imports: [ProductComponent, TestHostComponent],
      providers: [
        { provide: ProductService, useValue: mockProductService },
        provideHttpClient(),
        provideRouter([]),
        provideExperimentalWebMcpForms(),
      ],
    }).compileComponents();

    hostFixture = TestBed.createComponent(TestHostComponent);
    hostFixture.detectChanges();
    const productEl = hostFixture.debugElement.query(By.directive(ProductComponent));
    component = productEl.componentInstance;
  });

  it('should create', async () => {
    productSubject.next(mockProduct);
    hostFixture.detectChanges();
    await hostFixture.whenStable();
    expect(component).toBeTruthy();
  });

  it('should disable form when loading and enable it when resolved', async () => {
    // 1. Initial state (resource is loading)
    expect(component.productResource.isLoading()).toBe(true);
    expect(component.cartForm().disabled()).toBe(true);

    // 2. Emit the product to finish loading
    productSubject.next(mockProduct);
    hostFixture.detectChanges();
    await hostFixture.whenStable();

    // 3. Loaded state
    expect(component.productResource.isLoading()).toBe(false);
    expect(component.cartForm().disabled()).toBe(false);
  });
});
