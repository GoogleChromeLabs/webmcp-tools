<!--
Copyright 2026 Google LLC
SPDX-License-Identifier: Apache-2.0
-->

# Angular WebMCP Patterns

This guide explains how to expose WebMCP tools in Angular applications following the official [Angular WebMCP Guide](https://angular.dev/ai/webmcp).

---

## 1. Application-Level Tools

To register tools available throughout the application lifecycle, use `provideExperimentalWebMcpTools` in your root application configuration. The `execute` callback runs within the Angular dependency injection context, allowing you to use `inject()` directly.

### `app.config.ts`

```typescript
import { ApplicationConfig, inject, provideExperimentalWebMcpTools } from "@angular/core";
import { CatalogService } from "./services/catalog.service";

export const appConfig: ApplicationConfig = {
  providers: [
    provideExperimentalWebMcpTools([
      {
        name: "searchCatalog",
        description: "Searches the store catalog for items matching a search query.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search keywords" },
            maxResults: { type: "number", description: "Maximum number of items to return" },
          },
          required: ["query"],
          additionalProperties: false,
        },
        execute: async ({ query, maxResults }) => {
          const catalogService = inject(CatalogService);
          const results = await catalogService.search(query, maxResults ?? 10);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  total_count: results.length,
                  items: results,
                }),
              },
            ],
          };
        },
      },
    ]),
  ],
};
```

---

## 2. Route-Scoped Tools with Auto-Cleanup

To expose tools only when the user is on a specific route, declare `provideExperimentalWebMcpTools` in the route definition and configure `withExperimentalAutoCleanupInjectors()` in the router config. This ensures tools automatically unregister when the user navigates away.

### `app.config.ts`

```typescript
import { ApplicationConfig } from "@angular/core";
import { provideRouter, withExperimentalAutoCleanupInjectors } from "@angular/router";
import { routes } from "./app.routes";

export const appConfig: ApplicationConfig = {
  providers: [provideRouter(routes, withExperimentalAutoCleanupInjectors())],
};
```

### `app.routes.ts`

```typescript
import { Routes } from "@angular/router";
import { provideExperimentalWebMcpTools } from "@angular/core";

export const routes: Routes = [
  {
    path: "dashboard",
    loadComponent: () => import("./dashboard.component").then((m) => m.DashboardComponent),
    providers: [
      provideExperimentalWebMcpTools([
        {
          name: "exportDashboardReports",
          description: "Exports the active dashboard analytics report.",
          inputSchema: { type: "object", properties: {} },
          execute: () => ({
            content: [{ type: "text", text: "Dashboard report exported successfully." }],
          }),
        },
      ]),
    ],
  },
];
```

---

## 3. Dynamic Service Tools with `declareExperimentalWebMcpTool`

For stateful services, you can register tools directly in an injection context. The tool is automatically unregistered when the service context is destroyed.

```typescript
import { Injectable, signal, declareExperimentalWebMcpTool } from "@angular/core";

@Injectable({ providedIn: "root" })
export class CartService {
  readonly itemCount = signal(0);

  constructor() {
    declareExperimentalWebMcpTool({
      name: "getCartStatus",
      description: "Returns the current number of items in the shopping cart.",
      inputSchema: { type: "object", properties: {} },
      execute: () => ({
        content: [{ type: "text", text: `Cart contains ${this.itemCount()} items.` }],
      }),
    });
  }
}
```

---

## 4. Implicit Tools from Signal Forms

Angular can automatically turn a [Signal Form](https://angular.dev/guide/forms/signals) into an AI-ready WebMCP tool without manually defining JSON schemas.

### 1. Enable Feature in `main.ts` / Root

```typescript
import { bootstrapApplication } from "@angular/platform-browser";
import { provideExperimentalWebMcpForms } from "@angular/forms/signals";
import { AppComponent } from "./app/app.component";

bootstrapApplication(AppComponent, {
  providers: [provideExperimentalWebMcpForms()],
});
```

### 2. Configure Form with `experimentalWebMcpTool`

```typescript
import { Component, signal } from "@angular/core";
import { form, required, minLength } from "@angular/forms/signals";

@Component({
  selector: "app-user-registration",
  templateUrl: "./user-registration.html",
})
export class UserRegistrationComponent {
  // Angular infers parameter types from initial signal values
  private readonly model = signal({
    firstName: "",
    lastName: "",
    email: "",
    hobbies: ["Coding"], // Non-empty array required for type inference
  });

  readonly userForm = form(
    this.model,
    (f) => {
      required(f.firstName, { message: "First name is mandatory" });
      required(f.lastName, { message: "Last name is mandatory" });
      required(f.email, { message: "Email is required" });
    },
    {
      // Automatically exposes the WebMCP tool
      experimentalWebMcpTool: {
        name: "registerUser",
        description: "Registers a new user account with personal details.",
      },
      submission: {
        action: async (formValue) => {
          console.log("Submitting registration:", formValue);
          // Return response or handle submission
        },
      },
    },
  );
}
```

> **Note on Schema Inference**: Angular requires concrete initial values (`''`, `0`, `false`) and non-empty arrays (`['sample']`) to infer types. Do not initialize with `null` or `undefined`.
