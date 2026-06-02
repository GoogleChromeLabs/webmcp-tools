import { Injectable, signal } from '@angular/core';
import { Product } from './product';

@Injectable({
  providedIn: 'root'
})
export class SearchStateService {
  readonly filteredProducts = signal<Product[]>([]);
}
