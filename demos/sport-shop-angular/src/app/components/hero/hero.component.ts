import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-hero',
  imports: [CommonModule, FormsModule],
  templateUrl: './hero.component.html',
  styleUrl: './hero.component.css'
})
export class HeroComponent {
  query: string = '';
  category: string = 'ALL';
  size: string = 'ALL';

  categories = ['ALL', 'BASKETBALL', 'SOCCER', 'BASEBALL', 'RUNNING'];
  sizes = ['ALL', 'adult', 'child'];

  constructor(private router: Router) {}

  onFindGift(event: Event, q?: string) {
    const searchParams: any = {
      q: q || this.query
    };

    if (this.category !== 'ALL') searchParams.category = this.category;
    if (this.size !== 'ALL') searchParams.size = this.size;

    if ((event as any).agentInvoked) {
      event.preventDefault();
      (event as any).respondWith(`Navigating to search results for ${JSON.stringify(searchParams)}`);
    }

    this.router.navigate(['/search'], { queryParams: searchParams });
  }
}
