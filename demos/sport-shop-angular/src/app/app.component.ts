/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './components/header/header.component';
import { FooterComponent } from './components/footer/footer.component';
import { CartModalComponent } from './components/cart-modal/cart-modal.component';
import { UiService } from './services/ui.service';
import { WebmcpService } from './services/webmcp.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, HeaderComponent, FooterComponent, CartModalComponent],
  templateUrl: './app.component.html',
})
export class AppComponent {
  constructor(
    private webmcp: WebmcpService,
    public uiService: UiService
  ) { }
}
