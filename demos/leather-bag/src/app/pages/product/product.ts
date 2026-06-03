import { Component, OnInit, inject, ChangeDetectorRef, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ProductService, Product } from '../../services/product';
import { CartService } from '../../services/cart';
import { CurrencyPipe } from '@angular/common';
import { form, required, FormField, FormRoot, min, max } from '@angular/forms/signals';

@Component({
  selector: 'app-product',
  imports: [RouterLink, CurrencyPipe, FormField, FormRoot],
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
  isReturnModalOpen = false;

  // Accordion State
  detailsOpen = true;
  shippingOpen = false;

  // Signal Form for cart options
  readonly model = signal({
    color: '',
    quantity: 1
  });

  readonly cartForm = form(
    this.model,
    (f) => {
      required(f.color, { message: 'Color selection is required.' });
      min(f.quantity, 1);
      max(f.quantity, 10);
    },
    {
      // Opt-in to implicit WebMCP tool add_to_cart with custom schema and submission action
      experimentalWebMcpTool: {
        name: 'add_to_cart',
        description: 'Add this premium leather bag to your shopping cart with chosen color and quantity',
      },
      submission: {
        action: async (formValue) => {
          if (!this.product) {
            throw new Error('Product not loaded');
          }
          const chosenColor = formValue.color().value();
          const chosenQty = formValue.quantity().value();
          this.cartService.addToCart(this.product, chosenColor, chosenQty);
        }
      }
    }
  );

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const slug = params.get('id');
      if (slug) {
        this.productService.getProductBySlug(slug).subscribe(p => {
          this.product = p;
          if (p) {
            const hasBrown = p.colors.some(c => c.name === 'Brown');
            const defaultColor = hasBrown ? 'Brown' : (p.colors[0]?.name || '');
            this.selectedColor = defaultColor;
            this.selectedImage = p.images[0] || '';
            
            // Initialize form model
            this.model.set({
              color: defaultColor,
              quantity: 1
            });
          }
          this.cdr.detectChanges();
        });
      }
    });
  }

  selectColor(colorName: string) {
    this.selectedColor = colorName;
    this.model.update(m => ({ ...m, color: colorName }));
  }

  selectImage(img: string) {
    this.selectedImage = img;
  }

  incrementQuantity() {
    this.model.update(m => ({ ...m, quantity: m.quantity + 1 }));
  }

  decrementQuantity() {
    this.model.update(m => ({ ...m, quantity: m.quantity - 1 }));
  }



  openReturnModal(event: Event) {
    event.preventDefault();
    this.isReturnModalOpen = true;
  }

  closeReturnModal() {
    this.isReturnModalOpen = false;
  }
}
