import { Component, inject, input, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductService, Product } from '../../services/product';
import { CartService } from '../../services/cart';
import { CurrencyPipe } from '@angular/common';
import { form, required, FormField, FormRoot, min, max } from '@angular/forms/signals';
import { rxResource } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';

@Component({
  selector: 'app-product',
  imports: [RouterLink, CurrencyPipe, FormField, FormRoot],
  templateUrl: './product.html',
  styleUrl: './product.css',
})
export class ProductComponent {
  private productService = inject(ProductService);
  private cartService = inject(CartService);

  // Set by `withComponentInputBinding()` from URL parameter `:id`
  readonly id = input<string>();

  readonly productResource = rxResource({
    params: () => this.id(),
    stream: ({ params: id }) => {
      if (!id) return of(undefined);
      return this.productService.getProductBySlug(id);
    },
  });

  // Selected image linked to default image of the product
  readonly selectedImage = linkedSignal(() => this.productResource.value()?.images[0] || '');

  isReturnModalOpen = false;

  // Accordion State
  detailsOpen = true;
  shippingOpen = false;

  // Signal Form model linked to product default color
  readonly model = linkedSignal<{ color: string; quantity: number }>(() => {
    const p = this.productResource.value();
    if (!p) {
      return { color: '', quantity: 1 };
    }
    const hasBrown = p.colors.some(c => c.name === 'Brown');
    const defaultColor = hasBrown ? 'Brown' : (p.colors[0]?.name || '');
    return {
      color: defaultColor,
      quantity: 1,
    };
  });

  readonly cartForm = form(
    this.model,
    (f) => {
      required(f.color, { message: 'Color selection is required.' });
      min(f.quantity, 1);
      max(f.quantity, 10);
    },
    {
      experimentalWebMcpTool: {
        name: 'add_to_cart',
        description: 'Add this premium leather bag to your shopping cart with chosen color and quantity',
      },
      submission: {
        action: async (formValue) => {
          const product = this.productResource.value();
          if (!product) {
            throw new Error('Product not loaded');
          }
          const chosenColor = formValue.color().value();
          const chosenQty = formValue.quantity().value();
          this.cartService.addToCart(product, chosenColor, chosenQty);
        }
      }
    }
  );

  selectColor(colorName: string) {
    this.model.update(m => ({ ...m, color: colorName }));
  }

  selectImage(img: string) {
    this.selectedImage.set(img);
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
