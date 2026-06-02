import { Routes } from '@angular/router';
import { Home } from './pages/home/home';
import { Search } from './pages/search/search';
import { ProductComponent } from './pages/product/product';
import { CartComponent } from './pages/cart/cart';
import { provideExperimentalWebMcpTools } from '@angular/core';
import { inject } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CartService } from './services/cart';
import { SearchStateService } from './services/search-state';

export const routes: Routes = [
  { path: '', component: Home },
  { 
    path: 'search', 
    component: Search,
    providers: [
      provideExperimentalWebMcpTools([
        {
          name: 'filter_results',
          description: 'Filters the search results on the search page by color, finish, and maximum price.',
          inputSchema: {
            type: 'object',
            properties: {
              colors: {
                type: 'array',
                items: { type: 'string', enum: ['Brown', 'Black', 'Tan', 'Cognac', 'Burgundy', 'Mahogany'] },
                description: 'List of colors to filter by (optional).'
              },
              finishes: {
                type: 'array',
                items: { type: 'string', enum: ['Full Grain', 'Suede', 'Pebbled', 'Vegetable Tanned'] },
                description: 'List of leather finishes to filter by (optional).'
              },
              maxPrice: {
                type: 'number',
                description: 'Maximum price limit (e.g. 1000).'
              }
            },
            additionalProperties: false
          },
          execute: ({ colors, finishes, maxPrice }: any) => {
            const router = inject(Router);
            const route = inject(ActivatedRoute);
            const newParams: any = { ...route.snapshot.queryParams };
            if (colors !== undefined) newParams.color = colors && colors.length > 0 ? colors : null;
            if (finishes !== undefined) newParams.finish = finishes && finishes.length > 0 ? finishes : null;
            if (maxPrice !== undefined) newParams.maxPrice = maxPrice;

            router.navigate(['/search'], { queryParams: newParams });
            return { content: [{ type: 'text', text: 'Filters successfully updated.' }] };
          }
        },
        {
          name: 'get_search_results',
          description: 'Returns the list of products currently shown on the search page, matching the active search query and filters.',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false
          },
          execute: () => {
            const searchState = inject(SearchStateService);
            const filtered = searchState.filteredProducts();

            const resultsText = filtered.map((p, idx) => {
              const colorsList = p.colors.map((c: { name: string }) => c.name).join(', ');
              return `[${idx}] ${p.name} - $${p.price}\nCategory: ${p.category}\nFinish: ${p.finish}\nColors: ${colorsList}\nDescription: ${p.description}\n---`;
            }).join('\n');

            return {
              content: [{
                type: 'text',
                text: filtered.length > 0 
                  ? `Found ${filtered.length} search results:\n\n${resultsText}`
                  : 'No search results found for the current search criteria.'
              }]
            };
          }
        },
        {
          name: 'add_search_result_to_cart',
          description: 'Add a product from search results to the cart by name or index. Optional color (defaults to Brown or first available).',
          inputSchema: {
            type: 'object',
            properties: {
              identifier: {
                type: 'string',
                description: 'Product name/keywords or index (e.g. 0, 1, "satchel") from search results.'
              },
              color: {
                type: 'string',
                description: 'Color of the product (optional).'
              }
            },
            required: ['identifier'],
            additionalProperties: false
          },
          execute: ({ identifier, color }: any) => {
            const searchState = inject(SearchStateService);
            const cartService = inject(CartService);
            const filtered = searchState.filteredProducts();

            let product;
            const index = parseInt(identifier, 10);
            if (!isNaN(index) && index >= 0 && index < filtered.length) {
              product = filtered[index];
            } else {
              const searchTerms = identifier.toLowerCase().trim().split(/\s+/);
              product = filtered.find(p => {
                const nameLower = p.name.toLowerCase();
                return searchTerms.every((term: string) => nameLower.includes(term));
              });
            }

            if (!product) {
              return { success: false, message: `Product not found for identifier: ${identifier}` };
            }

            let chosenColor = color;
            if (!chosenColor) {
              const hasBrown = product.colors.some((c: { name: string }) => c.name === 'Brown');
              chosenColor = hasBrown ? 'Brown' : (product.colors[0]?.name || 'Default');
            }

            cartService.addToCart(product, chosenColor, 1);
            return {
              content: [{ type: 'text', text: `Successfully added ${product.name} (${chosenColor}) to the cart.` }]
            };
          }
        }
      ])
    ]
  },
  { path: 'product/:id', component: ProductComponent },
  { path: 'cart', component: CartComponent },
  { path: '**', redirectTo: '' }
];
