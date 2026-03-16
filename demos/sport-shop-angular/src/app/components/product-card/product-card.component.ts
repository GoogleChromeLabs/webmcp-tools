import { Component, Input } from '@angular/core';
import { Product } from '../../models/product.model';
import { CartService } from '../../services/cart.service';
import { RouterModule } from '@angular/router';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-product-card',
  imports: [RouterModule, DecimalPipe],
  templateUrl: './product-card.component.html'
})
export class ProductCardComponent {
  @Input() product!: Product;

  constructor(private cartService: CartService) {}

  onAddToCart(event: Event) {
    event.stopPropagation();
    this.cartService.addToCart(this.product);
  }
}
