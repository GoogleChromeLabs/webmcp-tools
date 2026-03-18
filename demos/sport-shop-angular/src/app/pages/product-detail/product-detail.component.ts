/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ProductService } from '../../services/product.service';
import { CartService } from '../../services/cart.service';
import { Product } from '../../models/product.model';
import { AiSidebarComponent } from '../../components/ai-sidebar/ai-sidebar.component';
import { CommonModule, DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-product-detail',
  imports: [CommonModule, AiSidebarComponent, DecimalPipe],
  templateUrl: './product-detail.component.html',
})
export class ProductDetailComponent implements OnInit {
  product?: Product;
  giftReason: string = '';
  aiMessage: string = '';

  constructor(
    private route: ActivatedRoute,
    private productService: ProductService,
    private cartService: CartService
  ) {}

  ngOnInit() {
    this.route.params.subscribe(params => {
      const id = params['id'];
      this.product = this.productService.getProductById(id);
      this.updateGiftFinder();
    });
  }

  addToCart() {
    if (this.product) {
      this.cartService.addToCart(this.product);
    }
  }

  private updateGiftFinder() {
      if (this.product?.id === 'franklin-glove') {
          this.giftReason = "Perfect for 12-year-olds finding their position. High quality that stays well within your $50 budget.";
          this.aiMessage = "I see you're looking at the Field Master. It's our #1 recommendation for young athletes. Would you like to see matching baseballs?";
      } else if (this.product) {
          this.aiMessage = `Great choice! The ${this.product.name} is a top performer in our ${this.product.category} collection.`;
      }
  }
}
