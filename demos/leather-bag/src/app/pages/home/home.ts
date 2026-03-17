import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  constructor(private router: Router) {}

  onSearch(event: Event) {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const query = new FormData(form).get('query');
    this.router.navigate(['/search'], { queryParams: { q: query } });
  }
}
