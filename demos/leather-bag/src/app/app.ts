import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Footer } from './layout/footer/footer';
import { Header } from './layout/header/header';
import { CartService } from './services/cart';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, Footer],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = signal('leather-bag');
  private cartService = inject(CartService);
  toastMessage = signal('');
  showToast = signal(false);

  constructor() {
    this.cartService.cartUpdate$.subscribe((msg) => {
      this.toastMessage.set(msg);
      this.showToast.set(true);
      setTimeout(() => this.showToast.set(false), 3000);
    });
  }

  closeToast() {
    this.showToast.set(false);
  }
}
