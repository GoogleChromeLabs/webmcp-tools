import { ApplicationConfig, provideBrowserGlobalErrorListeners, inject } from '@angular/core';
import { provideRouter, withHashLocation, Router } from '@angular/router';

import { provideHttpClient } from '@angular/common/http';
import { provideExperimentalWebMcpTools } from '@angular/core';
import { provideExperimentalWebMcpForms } from '@angular/forms/signals';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withHashLocation()),
    provideHttpClient(),
    provideExperimentalWebMcpForms(),
    provideExperimentalWebMcpTools([
      {
        name: 'check_return_policy',
        description: 'Returns the detailed site-wide return and guarantee policy for LUXE LEATHER.',
        inputSchema: { type: 'object', properties: {} },
        execute: () => {
          return {
            content: [{
              type: 'text',
              text: `At LUXE LEATHER, we stand behind the quality of our craftsmanship.
30-Day Guarantee: If you are not entirely satisfied with your purchase, you may return any unused item in its original condition and packaging within 30 days of receipt for a full refund or exchange.
Exclusions: Bespoke or personalized items are meticulously crafted to your specifications and are therefore final sale.
Process: To initiate a return, please visit our returns portal or contact our concierge team. Please note that return shipping costs are the responsibility of the customer unless the item arrived damaged or defective.`
            }]
          };
        }
      },
      {
        name: 'search_store',
        description: 'Searches the Luxe Leather store catalog for products matching a query.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The search keywords (e.g. Satchel, Weekender, Walnut).' }
          },
          required: ['query'],
          additionalProperties: false
        },
        execute: ({ query }) => {
          const router = inject(Router);
          router.navigate(['/search'], { queryParams: { q: query } });
          return {
            content: [{ type: 'text', text: `Navigated search results for "${query}".` }]
          };
        }
      },
      {
        name: 'view_product',
        description: 'Navigates to the detailed page for a specific premium leather bag.',
        inputSchema: {
          type: 'object',
          properties: {
            slug: { type: 'string', description: 'The product slug/identifier (e.g. signature-satchel, weekender-tote, class-clutch).' }
          },
          required: ['slug'],
          additionalProperties: false
        },
        execute: ({ slug }) => {
          const router = inject(Router);
          router.navigate(['/product', slug]);
          return {
            content: [{ type: 'text', text: `Navigating to product details for "${slug}".` }]
          };
        }
      }
    ])
  ],
};
