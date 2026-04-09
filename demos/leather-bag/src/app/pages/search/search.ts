import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { ProductService, Product } from '../../services/product';
import { CurrencyPipe, NgClass } from '@angular/common';

@Component({
  selector: 'app-search',
  imports: [RouterLink, CurrencyPipe],
  templateUrl: './search.html',
  styleUrl: './search.css',
})
export class Search implements OnInit {
  private route = inject(ActivatedRoute);
  private productService = inject(ProductService);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);

  query = '';
  products: Product[] = [];
  filteredProducts: Product[] = [];
  isMobileFilterOpen = false;

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.query = params['q'] || '';
      this.loadProducts();
    });
  }

  onSearch(event: Event) {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const query = new FormData(form).get('query');
    this.router.navigate([], { relativeTo: this.route, queryParams: { q: query }, queryParamsHandling: 'merge' });
  }

  loadProducts() {
    this.productService.getProducts().subscribe(allProducts => {
      this.products = allProducts;
      this.applyFilters();
    });
  }

  applyFilters(event?: Event) {
    if (event) event.preventDefault();
    
    // In a real app, we'd read values from the form.
    // Here we'll just mock it or minimally filter by search query
    const q = this.query.toLowerCase();
    if (q) {
      this.filteredProducts = this.products.filter(p => 
        p.name.toLowerCase().includes(q) || 
        p.description.toLowerCase().includes(q) ||
        p.finish.toLowerCase().includes(q)
      );
    } else {
      this.filteredProducts = this.products;
    }
    this.cdr.detectChanges();
  }

  toggleMobileFilters() {
    this.isMobileFilterOpen = !this.isMobileFilterOpen;
  }
}
