import { Component, inject, input, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductService, Product } from '../../services/product';
import { CartService } from '../../services/cart';
import { CurrencyPipe } from '@angular/common';
import { form, required, FormField, FormRoot, min, max, applyEach, disabled } from '@angular/forms/signals';
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
  readonly model = linkedSignal<{ variations: Array<{ color: string; quantity: number }> }>(() => {
    const p = this.productResource.value();
    if (!p) {
      return { variations: [{ color: '', quantity: 1 }] };
    }
    const hasBrown = p.colors.some(c => c.name === 'Brown');
    const defaultColor = hasBrown ? 'Brown' : (p.colors[0]?.name || '');
    return {
      variations: [{
        color: defaultColor,
        quantity: 1,
      }]
    };
  });

  readonly cartForm = form(
    this.model,
    (f) => {
      disabled(f, { when: () => this.productResource.isLoading() });
      applyEach(f.variations, (v) => {
        required(v.color, { message: 'Color selection is required.' });
        min(v.quantity, 1, { message: 'Quantity must be at least 1.' });
        max(v.quantity, 10, { message: 'Quantity cannot exceed 10.' });
      });
    },
    {
      experimentalWebMcpTool: {
        name: 'add_to_cart',
        description: 'Add this premium leather bag to your shopping cart with chosen variations (color and quantity)',
      },
      submission: {
        action: async (formValue) => {
          const product = this.productResource.value();
          if (!product) {
            throw new Error('Product not loaded');
          }
          const variations = formValue.variations().value();
          for (const v of variations) {
            this.cartService.addToCart(product, v.color, v.quantity);
          }
        }
      }
    }
  );

  addVariation() {
    this.model.update(m => {
      const p = this.productResource.value();
      const hasBrown = p?.colors.some(c => c.name === 'Brown');
      const defaultColor = hasBrown ? 'Brown' : (p?.colors[0]?.name || '');
      return {
        variations: [
          ...m.variations,
          { color: defaultColor, quantity: 1 }
        ]
      };
    });
  }

  removeVariation(index: number) {
    this.model.update(m => {
      const variations = m.variations.filter((_, i) => i !== index);
      return { variations };
    });
  }

  selectColor(index: number, colorName: string) {
    this.model.update(m => {
      const variations = [...m.variations];
      if (variations[index]) {
        variations[index] = { ...variations[index], color: colorName };
      }
      return { variations };
    });
  }

  selectImage(img: string) {
    this.selectedImage.set(img);
  }

  incrementQuantity(index: number) {
    this.model.update(m => {
      const variations = [...m.variations];
      if (variations[index]) {
        variations[index] = { ...variations[index], quantity: variations[index].quantity + 1 };
      }
      return { variations };
    });
  }

  decrementQuantity(index: number) {
    this.model.update(m => {
      const variations = [...m.variations];
      if (variations[index]) {
        variations[index] = { ...variations[index], quantity: variations[index].quantity - 1 };
      }
      return { variations };
    });
  }

  openReturnModal(event: Event) {
    event.preventDefault();
    this.isReturnModalOpen = true;
  }

  closeReturnModal() {
    this.isReturnModalOpen = false;
  }
}
