import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { ProductService, Product } from '../../services/product';
import { CurrencyPipe, NgClass } from '@angular/common';
import { CartService } from '../../services/cart';

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
      this.loadProducts();
    });
  }

  onSearch(event: any) {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const query = new FormData(form).get('query');
    this.router.navigate([], { relativeTo: this.route, queryParams: { q: query }, queryParamsHandling: 'merge' });
    
    if (event.respondWith) {
      event.respondWith(Promise.resolve({ success: true, message: `Filtered results for ${query}` }));
    }
  }

  loadProducts() {
    this.productService.getProducts().subscribe(allProducts => {
      this.products = allProducts;
      this.applyFilters();
    });
  }

  applyFilters(event?: Event) {
    if (event) event.preventDefault();
    
    const target = event ? event.target as HTMLElement : null;
    const form = target ? (target.closest('form') as HTMLFormElement) : document.querySelector('.filters-form') as HTMLFormElement;
    if (!form) return;
    
    const formData = new FormData(form);
    this.selectedColors = formData.getAll('color') as string[];
    this.selectedFinishes = formData.getAll('finish') as string[];
    this.maxPrice = Number(formData.get('maxPrice')) || 1500;
    
    const q = this.query.toLowerCase();
    
    this.filteredProducts = this.products.filter(p => {
      const matchesQuery = !q || 
        p.name.toLowerCase().includes(q) || 
        p.description.toLowerCase().includes(q) ||
        p.finish.toLowerCase().includes(q);
        
      const matchesColor = this.selectedColors.length === 0 || 
        p.colors.some(c => this.selectedColors.includes(c.name));
        
      const matchesFinish = this.selectedFinishes.length === 0 || 
        this.selectedFinishes.includes(p.finish);
        
      const matchesPrice = p.price <= this.maxPrice;
      
      return matchesQuery && matchesColor && matchesFinish && matchesPrice;
    });
    
    if (event && (event as any).respondWith) {
      (event as any).respondWith(Promise.resolve({ success: true, count: this.filteredProducts.length }));
    }
    
    this.cdr.detectChanges();
  }

  toggleMobileFilters() {
    this.isMobileFilterOpen = !this.isMobileFilterOpen;
  }

  onViewProduct(event: any) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const id = formData.get('identifier') as string;
    
    let product: Product | undefined;
    
    const index = parseInt(id, 10);
    if (!isNaN(index) && index >= 0 && index < this.filteredProducts.length) {
      product = this.filteredProducts[index];
    } else {
      const searchTerms = id.toLowerCase().trim().split(/\s+/);
      product = this.products.find(p => {
        const nameLower = p.name.toLowerCase();
        return searchTerms.every((term: string) => nameLower.includes(term));
      });
    }
    
    if (product) {
      this.router.navigate(['/product', product.slug]);
      if (event.respondWith) {
        event.respondWith(Promise.resolve({ success: true, message: `Navigating to product page for ${product.name}` }));
      }
    } else {
      if (event.respondWith) {
        event.respondWith(Promise.resolve({ success: false, message: `Product not found for identifier: ${id}` }));
      }
    }
  }

  onAddSearchResultToCart(event: any) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const id = formData.get('identifier') as string;
    const colorInput = formData.get('color') as string;
    
    let product: Product | undefined;
    
    const index = parseInt(id, 10);
    if (!isNaN(index) && index >= 0 && index < this.filteredProducts.length) {
      product = this.filteredProducts[index];
    } else {
      const searchTerms = id.toLowerCase().trim().split(/\s+/);
      product = this.products.find(p => {
        const nameLower = p.name.toLowerCase();
        return searchTerms.every((term: string) => nameLower.includes(term));
      });
    }
    
    if (product) {
      let color = colorInput;
      if (!color) {
        const hasBrown = product.colors.some(c => c.name === 'Brown');
        color = hasBrown ? 'Brown' : (product.colors[0]?.name || 'Default');
      }
      
      this.cartService.addToCart(product, color, 1);
      
      if (event.respondWith) {
        event.respondWith(Promise.resolve({ success: true, message: `Added ${product.name} (${color}) to cart` }));
      }
    } else {
      if (event.respondWith) {
        event.respondWith(Promise.resolve({ success: false, message: `Product not found for identifier: ${id}` }));
      }
    }
  }

  onQuickAddToCart(product: Product, event: any) {
    event.preventDefault();
    
    const color = product.colors[0]?.name || 'Default';
    this.cartService.addToCart(product, color, 1);
    
    if (event.respondWith) {
      event.respondWith(Promise.resolve({ 
        success: true, 
        message: `Quickly added ${product.name} to cart` 
      }));
    }
  }
}
