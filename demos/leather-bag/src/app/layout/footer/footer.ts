import { Component } from '@angular/core';

@Component({
  selector: 'app-footer',
  imports: [],
  templateUrl: './footer.html',
  styleUrl: './footer.css',
})
export class Footer {
  isReturnModalOpen = false;

  openReturnModal(event: any) {
    event.preventDefault();
    
    const policyText = `At LUXE LEATHER, we stand behind the quality of our craftsmanship.
30-Day Guarantee: If you are not entirely satisfied with your purchase, you may return any unused item in its original condition and packaging within 30 days of receipt for a full refund or exchange.
Exclusions: Bespoke or personalized items are meticulously crafted to your specifications and are therefore final sale.
Process: To initiate a return, please visit our returns portal or contact our concierge team. Please note that return shipping costs are the responsibility of the customer unless the item arrived damaged or defective.`;

    if (event.respondWith) {
      event.respondWith(Promise.resolve({ policy: policyText }));
    } else {
      this.isReturnModalOpen = true;
    }
  }

  closeReturnModal() {
    this.isReturnModalOpen = false;
  }
}
