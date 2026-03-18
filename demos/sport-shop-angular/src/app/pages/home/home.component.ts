/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ProductService } from '../../services/product.service';
import { Product } from '../../models/product.model';
import { HeroComponent } from '../../components/hero/hero.component';
import { ProductCardComponent } from '../../components/product-card/product-card.component';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-home',
  imports: [CommonModule, HeroComponent, ProductCardComponent],
  templateUrl: './home.component.html',
})
export class HomeComponent implements OnInit {
  trendingGear: Product[] = [];
  categories = [
    { name: 'BASKETBALL', image: '/assets/products/nano-banana-basketball-category.png' },
    { name: 'SOCCER', image: '/assets/products/nano-banana-soccer-category.png' },
    { name: 'BASEBALL', image: '/assets/products/nano-banana-baseball-category.png' },
    { name: 'RUNNING', image: '/assets/products/nano-banana-running-category.png' }
  ];

  constructor(
    private productService: ProductService,
    private router: Router
  ) { }

  ngOnInit() {
    const allProducts = this.productService.getProducts();
    const diverseProducts: Product[] = [];
    const sportCategories = ['BASKETBALL', 'SOCCER', 'BASEBALL', 'RUNNING'];

    sportCategories.forEach(cat => {
      const product = allProducts.find(p => p.category === cat);
      if (product) {
        diverseProducts.push(product);
      }
    });

    this.trendingGear = diverseProducts;
  }

  onCategoryClick(category: string) {
    this.router.navigate(['/search'], { queryParams: { category } });
  }
}
