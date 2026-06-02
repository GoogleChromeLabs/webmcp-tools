import { Component } from '@angular/core';

@Component({
  selector: 'app-footer',
  imports: [],
  templateUrl: './footer.html',
  styleUrl: './footer.css',
})
export class Footer {
  isReturnModalOpen = false;

  openReturnModal(event: Event) {
    event.preventDefault();
    this.isReturnModalOpen = true;
  }

  closeReturnModal() {
    this.isReturnModalOpen = false;
  }
}
