import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ProductService, Product } from '../../services/product';
import { CartService } from '../../services/cart';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-product',
  imports: [RouterLink, CurrencyPipe, FormsModule],
  templateUrl: './product.html',
  styleUrl: './product.css',
})
export class ProductComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private productService = inject(ProductService);
  private cartService = inject(CartService);
  private cdr = inject(ChangeDetectorRef);

  product?: Product;
  selectedColor = '';
  selectedImage = '';
  quantity = 1;
  isReturnModalOpen = false;

  // Accorion State
  detailsOpen = true;
  shippingOpen = false;

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const slug = params.get('id');
      if (slug) {
        this.productService.getProductBySlug(slug).subscribe(p => {
          this.product = p;
          if (p) {
            this.selectedColor = p.colors[0]?.name || '';
            this.selectedImage = p.images[0] || '';
          }
          this.cdr.detectChanges();
        });
      }
    });
  }

  selectColor(colorName: string) {
    this.selectedColor = colorName;
  }

  selectImage(img: string) {
    this.selectedImage = img;
  }

  incrementQuantity() {
    if (this.quantity < 10) this.quantity++;
  }

  decrementQuantity() {
    if (this.quantity > 1) this.quantity--;
  }

  addToCart(event?: Event) {
    if (event) event.preventDefault();
    if (this.product) {
      this.cartService.addToCart(this.product, this.selectedColor, parseInt(this.quantity.toString(), 10));
    }
  }

  openReturnModal(event: Event) {
    event.preventDefault();
    this.isReturnModalOpen = true;
  }

  closeReturnModal() {
    this.isReturnModalOpen = false;
  }
}
