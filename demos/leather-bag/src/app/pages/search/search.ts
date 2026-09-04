import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CartService } from '../../services/cart';
import { Product } from '../../services/product';
import { SearchStateService } from '../../services/search-state';

@Component({
  selector: 'app-search',
  imports: [RouterLink, CurrencyPipe],
  templateUrl: './search.html',
  styleUrl: './search.css',
})
export class Search {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cartService = inject(CartService);
  private searchStateService = inject(SearchStateService);

  protected readonly filteredProducts = this.searchStateService.filteredProducts;
  protected readonly query = this.searchStateService.query;

  protected readonly isMobileFilterOpen = signal(false);
  protected readonly maxPrice = this.searchStateService.maxPrice;
  protected readonly selectedColors = this.searchStateService.selectedColors;
  protected readonly selectedFinishes = this.searchStateService.selectedFinishes;

  constructor() {
    this.route.queryParams.subscribe((params) => {
      this.query.set(params['q'] || '');

      const colorParam = params['color'];
      this.selectedColors.set(
        Array.isArray(colorParam) ? colorParam : colorParam ? [colorParam] : [],
      );

      const finishParam = params['finish'];
      this.selectedFinishes.set(
        Array.isArray(finishParam) ? finishParam : finishParam ? [finishParam] : [],
      );

      this.maxPrice.set(Number(params['maxPrice']) || 1500);
    });
  }

  onSearch(event: Event) {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const query = new FormData(form).get('query');
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: query || null },
      queryParamsHandling: 'merge',
    });
  }

  applyFilters(event?: Event) {
    if (event) event.preventDefault();

    const form = document.querySelector('.filters-form') as HTMLFormElement;
    if (!form) return;

    const formData = new FormData(form);
    const colors = formData.getAll('color') as string[];
    const finishes = formData.getAll('finish') as string[];
    const maxPrice = Number(formData.get('maxPrice')) || 1500;

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: this.query() || null,
        color: colors.length > 0 ? colors : null,
        finish: finishes.length > 0 ? finishes : null,
        maxPrice: maxPrice !== 1500 ? maxPrice : null,
      },
      queryParamsHandling: 'merge',
    });
  }

  toggleMobileFilters() {
    this.isMobileFilterOpen.set(!this.isMobileFilterOpen);
  }

  onQuickAddToCart(product: Product, event: Event) {
    event.preventDefault();
    const color = product.colors[0]?.name || 'Default';
    this.cartService.addToCart(product, color, 1);
  }
}
