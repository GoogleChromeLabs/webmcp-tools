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

  addToCart(event?: any) {
    if (event) event.preventDefault();
    if (this.product) {
      // Default to 1 if quantity is not provided or invalid
      const qty = parseInt(this.quantity?.toString() || '1', 10) || 1;
      this.cartService.addToCart(this.product, this.selectedColor, qty);
      
      if (event && event.respondWith) {
        event.respondWith(Promise.resolve({ 
          success: true, 
          message: `Added ${qty} ${this.selectedColor} ${this.product.name} to cart` 
        }));
      }
    }
  }

  openReturnModal(event: any) {
    event.preventDefault();
    
    const policyText = `At LUXE LEATHER, we stand behind the quality of our craftsmanship.
30-Day Guarantee: If you are not entirely satisfied with your purchase, you may return any unused item in its original condition and packaging within 30 days of receipt for a full refund or exchange.
Exclusions: Bespoke or personalized items are meticulously crafted to your specifications and are therefore final sale.
Process: To initiate a return, please visit our returns portal or contact our concierge team. Please note that return shipping costs are the responsibility of the customer unless the item arrived damaged or defective.`;

    if (event.respondWith) {
      event.respondWith(Promise.resolve({ policy: policyText }));
    } else {
      this.isReturnModalOpen = true;
    }
  }

  closeReturnModal() {
    this.isReturnModalOpen = false;
  }
}
