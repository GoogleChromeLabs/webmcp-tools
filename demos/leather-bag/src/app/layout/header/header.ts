import { Component, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CartService } from '../../services/cart';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class Header implements OnInit {
  private cartService = inject(CartService);
  cartCount = 0;

  ngOnInit() {
    this.cartService.totalCount$.subscribe(count => {
      this.cartCount = count;
    });
  }
}
