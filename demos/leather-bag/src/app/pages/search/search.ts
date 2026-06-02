import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { ProductService, Product } from '../../services/product';
import { CurrencyPipe } from '@angular/common';
import { CartService } from '../../services/cart';
import { SearchStateService } from '../../services/search-state';

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
  private cartService = inject(CartService);
  private searchStateService = inject(SearchStateService);

  query = '';
  products: Product[] = [];
  filteredProducts: Product[] = [];
  isMobileFilterOpen = false;
  maxPrice = 1500;
  selectedColors: string[] = [];
  selectedFinishes: string[] = [];

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.query = params['q'] || '';
      
      const colorParam = params['color'];
      this.selectedColors = Array.isArray(colorParam) ? colorParam : (colorParam ? [colorParam] : []);
      
      const finishParam = params['finish'];
      this.selectedFinishes = Array.isArray(finishParam) ? finishParam : (finishParam ? [finishParam] : []);
      
      this.maxPrice = Number(params['maxPrice']) || 1500;
      
      this.loadProducts();
    });
  }

  onSearch(event: Event) {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const query = new FormData(form).get('query');
    this.router.navigate([], { relativeTo: this.route, queryParams: { q: query || null }, queryParamsHandling: 'merge' });
  }

  loadProducts() {
    this.productService.getProducts().subscribe(allProducts => {
      this.products = allProducts;
      this.filterProductsLocally();
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
        q: this.query || null,
        color: colors.length > 0 ? colors : null,
        finish: finishes.length > 0 ? finishes : null,
        maxPrice: maxPrice !== 1500 ? maxPrice : null
      },
      queryParamsHandling: 'merge'
    });
  }

  filterProductsLocally() {
    const q = this.query.toLowerCase().trim();
    const searchTerms = q ? q.split(/\s+/) : [];
    
    this.filteredProducts = this.products.filter(p => {
      const matchesQuery = searchTerms.length === 0 || searchTerms.every(term => 
        p.name.toLowerCase().includes(term) || 
        p.description.toLowerCase().includes(term) ||
        p.finish.toLowerCase().includes(term) ||
        (p.category && p.category.toLowerCase().includes(term))
      );
        
      const matchesColor = this.selectedColors.length === 0 || 
        p.colors.some(c => this.selectedColors.includes(c.name));
        
      const matchesFinish = this.selectedFinishes.length === 0 || 
        this.selectedFinishes.includes(p.finish);
        
      const matchesPrice = p.price <= this.maxPrice;
      
      return matchesQuery && matchesColor && matchesFinish && matchesPrice;
    });
    
    this.cdr.detectChanges();
    this.searchStateService.filteredProducts.set(this.filteredProducts);
  }

  toggleMobileFilters() {
    this.isMobileFilterOpen = !this.isMobileFilterOpen;
  }

  onQuickAddToCart(product: Product, event: Event) {
    event.preventDefault();
    const color = product.colors[0]?.name || 'Default';
    this.cartService.addToCart(product, color, 1);
  }
}
