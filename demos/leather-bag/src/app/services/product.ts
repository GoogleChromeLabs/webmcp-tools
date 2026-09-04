import { HttpClient, httpResource } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

export interface Product {
  id: string;
  name: string;
  slug: string;
  price: number;
  category: string;
  shortDescription: string;
  description: string;
  images: string[];
  colors: { id: string; name: string; hex: string }[];
  finish: string;
  rating: number;
  reviewsCount: number;
  dimensions?: any;
  materials?: string;
  careInstructions?: string;
  isNewArrival: boolean;
  isFeatured: boolean;
}

export interface ProductData {
  products: Product[];
}

@Service()
export class ProductService {
  private http = inject(HttpClient);
  // Using absolute path ensures we don't get 404 when deeply nested in routes like /product/slug
  private apiUrl = 'assets/data/products.json';

  products = httpResource(
    () => ({
      url: this.apiUrl,
    }),
    {
      parse: (data: unknown) => (data as ProductData).products,
    },
  );

  getProductBySlug(slug: string): Observable<Product | undefined> {
    return this.getProducts().pipe(map((products) => products.find((p) => p.slug === slug)));
  }

  private getProducts(): Observable<Product[]> {
    return this.http.get<ProductData>(this.apiUrl).pipe(map((data) => data.products));
  }
}
