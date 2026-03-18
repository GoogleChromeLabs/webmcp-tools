/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-ai-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-sidebar.component.html',
  styles: [`
    .hide-scrollbar::-webkit-scrollbar { display: none; }
    .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  `]
})
export class AiSidebarComponent {
  @Input() message: string = "I'm here to help you find the perfect gear. Ask me anything about our products!";
  @Input() query: string = "";

  userInput: string = "";

  sendMessage() {
    if (this.userInput.trim()) {
      this.message = "WebMCP Sports is having some technical problems, because this feature was not implemented on purpose, try again later";
      this.userInput = "";
    }
  }
}
