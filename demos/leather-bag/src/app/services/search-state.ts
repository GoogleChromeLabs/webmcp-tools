import { computed, inject, Service, signal } from '@angular/core';
import { Product, ProductService } from './product';

@Service()
export class SearchStateService {
  readonly query = signal('');

  private readonly productsResource = inject(ProductService).products;

  public readonly maxPrice = signal(1500);
  public readonly selectedColors = signal<string[]>([]);
  public readonly selectedFinishes = signal<string[]>([]);

  public readonly filteredProducts = computed<Product[]>(() => {
    if (!this.productsResource.hasValue()) {
      return [];
    }

    const q = this.query().toLowerCase().trim();
    const searchTerms = q ? q.split(/\s+/) : [];

    return this.productsResource.value().filter((p) => {
      const matchesQuery =
        searchTerms.length === 0 ||
        searchTerms.every(
          (term) =>
            p.name.toLowerCase().includes(term) ||
            p.description.toLowerCase().includes(term) ||
            p.finish.toLowerCase().includes(term) ||
            (p.category && p.category.toLowerCase().includes(term)),
        );

      const matchesColor =
        this.selectedColors().length === 0 ||
        p.colors.some((c) => this.selectedColors().includes(c.name));

      const matchesFinish =
        this.selectedFinishes().length === 0 || this.selectedFinishes().includes(p.finish);

      const matchesPrice = p.price <= this.maxPrice();

      return matchesQuery && matchesColor && matchesFinish && matchesPrice;
    });
  });
}
