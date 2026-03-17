import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Header } from './layout/header/header';
import { Footer } from './layout/footer/footer';
import { CartService } from './services/cart';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, Footer],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  protected readonly title = signal('leather-bag');
  private cartService = inject(CartService);
  toastMessage = '';
  showToast = false;

  ngOnInit() {
    this.cartService.cartUpdate$.subscribe(msg => {
      this.toastMessage = msg;
      this.showToast = true;
      setTimeout(() => this.showToast = false, 3000);
    });
  }

  closeToast() {
    this.showToast = false;
  }
}
