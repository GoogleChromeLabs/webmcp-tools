import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { inputBinding, signal } from '@angular/core';
import { provideExperimentalWebMcpForms } from '@angular/forms/signals';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { Product, ProductService } from '../../services/product';
import { ProductComponent } from './product';

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
  isFeatured: true,
};

describe('ProductComponent', () => {
  let component: ProductComponent;
  let fixture: ComponentFixture<ProductComponent>;
  let productSubject: Subject<Product | undefined>;

  beforeEach(async () => {
    productSubject = new Subject<Product | undefined>();
    const mockProductService = {
      getProductBySlug: (slug: string) => productSubject.asObservable(),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: ProductService, useValue: mockProductService },
        provideRouter([]),
        provideExperimentalWebMcpForms(),
      ],
    });

    fixture = TestBed.createComponent(ProductComponent, {
      bindings: [inputBinding('id', signal('luxe-tote'))],
    });
    component = fixture.componentInstance;
  });

  it('should create', async () => {
    productSubject.next(mockProduct);
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should disable form when loading and enable it when resolved', async () => {
    // 1. Initial state (resource is loading)
    fixture.detectChanges();
    expect(component.productResource.isLoading()).toBe(true);
    expect(component.cartForm().disabled()).toBe(true);

    // 2. Emit the product to finish loading
    productSubject.next(mockProduct);
    await fixture.whenStable();

    // 3. Loaded state
    expect(component.productResource.status()).toBe('resolved');
    expect(component.productResource.isLoading()).toBe(false);
    expect(component.cartForm().disabled()).toBe(false);
  });
});
