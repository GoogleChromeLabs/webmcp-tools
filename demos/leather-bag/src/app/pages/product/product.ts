import { CurrencyPipe } from '@angular/common';
import { Component, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  applyEach,
  disabled,
  form,
  FormField,
  FormRoot,
  max,
  min,
  required,
} from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { CartService } from '../../services/cart';
import { ProductService } from '../../services/product';

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
  // TODO: Make that a required input
  // There is currently a bug in Angular itself, which is responsible for reading that required input too early when the `experimentalWebMcpTool` is configured on the form
  // which then throws NG0950 Input "id" is required but no value is available yet
  readonly id = input<string>('');

  readonly productResource = rxResource({
    params: () => this.id(),
    stream: ({ params: id }) => this.productService.getProductBySlug(id),
  });

  // Selected image linked to default image of the product
  readonly selectedImage = linkedSignal(() => this.productResource.value()?.images[0] || '');

  isReturnModalOpen = signal(false);

  // Accordion State
  detailsOpen = signal(true);
  shippingOpen = signal(false);

  // Signal Form model linked to product default color
  readonly model = linkedSignal<{ variations: Array<{ color: string; quantity: number }> }>(() => {
    const p = this.productResource.value();
    if (!p) {
      return { variations: [{ color: '', quantity: 1 }] };
    }
    const hasBrown = p.colors.some((c) => c.name === 'Brown');
    const defaultColor = hasBrown ? 'Brown' : p.colors[0]?.name || '';
    return {
      variations: [
        {
          color: defaultColor,
          quantity: 1,
        },
      ],
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
        description: 'Add item to the shopping cart with chosen variations (color and quantity)',
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
        },
      },
    },
  );

  addVariation() {
    this.model.update((m) => {
      const p = this.productResource.value();
      const hasBrown = p?.colors.some((c) => c.name === 'Brown');
      const defaultColor = hasBrown ? 'Brown' : p?.colors[0]?.name || '';
      return {
        variations: [...m.variations, { color: defaultColor, quantity: 1 }],
      };
    });
  }

  removeVariation(index: number) {
    this.model.update((m) => {
      const variations = m.variations.filter((_, i) => i !== index);
      return { variations };
    });
  }

  selectColor(index: number, colorName: string) {
    this.model.update((m) => {
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
    this.model.update((m) => {
      const variations = [...m.variations];
      if (variations[index]) {
        variations[index] = { ...variations[index], quantity: variations[index].quantity + 1 };
      }
      return { variations };
    });
  }

  decrementQuantity(index: number) {
    this.model.update((m) => {
      const variations = [...m.variations];
      if (variations[index]) {
        variations[index] = { ...variations[index], quantity: variations[index].quantity - 1 };
      }
      return { variations };
    });
  }

  openReturnModal(event: Event) {
    event.preventDefault();
    this.isReturnModalOpen.set(true);
  }

  closeReturnModal() {
    this.isReturnModalOpen.set(false);
  }
}
