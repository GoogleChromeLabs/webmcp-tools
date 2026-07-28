/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './components/header/header.component';
import { FooterComponent } from './components/footer/footer.component';
import { CartModalComponent } from './components/cart-modal/cart-modal.component';
import { AgentDrawerComponent } from './components/agent-drawer/agent-drawer.component';
import { UiService } from './services/ui.service';
import { WebmcpService } from './services/webmcp.service';
import { AgentService } from './services/agent.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, HeaderComponent, FooterComponent, CartModalComponent, AgentDrawerComponent],
  templateUrl: './app.component.html',
  styles: [`
    .app-push-container {
      transition: margin-left 300ms cubic-bezier(0.4, 0, 0.2, 1);
    }
    .app-pushed {
      margin-left: 24rem;
    }
    @media (max-width: 768px) {
      .app-pushed {
        margin-left: 0;
      }
    }
  `]
})
export class AppComponent {
  constructor(
    private webmcp: WebmcpService,
    public uiService: UiService,
    public agentService: AgentService
  ) { }
}
