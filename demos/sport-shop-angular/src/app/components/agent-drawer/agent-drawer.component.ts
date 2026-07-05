/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Component, ElementRef, ViewChild, AfterViewChecked, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgentService, ChatMessage } from '../../services/agent.service';
import { MarkdownPipe } from '../../pipes/markdown.pipe';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-agent-drawer',
  standalone: true,
  imports: [CommonModule, FormsModule, MarkdownPipe],
  templateUrl: './agent-drawer.component.html',
  styles: [`
    .hide-scrollbar::-webkit-scrollbar { display: none; }
    .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

    .agent-fab {
      position: fixed !important;
      bottom: 1.5rem !important;
      left: 1.5rem !important;
      z-index: 9999 !important;
      transition: left 300ms cubic-bezier(0.4, 0, 0.2, 1) !important;
    }

    .agent-fab-shifted {
      left: 25rem !important;
    }

    .agent-drawer-panel {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      bottom: 0 !important;
      width: 24rem !important;
      height: 100vh !important;
      z-index: 9999 !important;
      transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1) !important;
      box-shadow: 4px 0 24px rgba(28, 27, 27, 0.08) !important;
    }

    .agent-drawer-open {
      transform: translateX(0) !important;
    }

    .agent-drawer-closed {
      transform: translateX(-100%) !important;
    }

    .key-masked {
      -webkit-text-security: disc !important;
      text-security: disc !important;
    }

    ::ng-deep .markdown-body {
      word-break: break-word;
    }
    ::ng-deep .markdown-body p {
      margin-bottom: 0.5rem;
    }
    ::ng-deep .markdown-body p:last-child {
      margin-bottom: 0;
    }
    ::ng-deep .markdown-body ul {
      list-style-type: disc;
      padding-left: 1.25rem;
      margin-bottom: 0.5rem;
    }
    ::ng-deep .markdown-body ol {
      list-style-type: decimal;
      padding-left: 1.25rem;
      margin-bottom: 0.5rem;
    }
    ::ng-deep .markdown-body li {
      margin-bottom: 0.25rem;
    }
    ::ng-deep .markdown-body code {
      background-color: rgba(0, 0, 0, 0.06);
      padding: 0.125rem 0.375rem;
      border-radius: 0.25rem;
      font-family: monospace;
      font-size: 0.85em;
    }
    ::ng-deep .markdown-body pre {
      background-color: #1e1e1e;
      color: #f8f8f2;
      padding: 0.75rem;
      border-radius: 0.5rem;
      overflow-x: auto;
      font-family: monospace;
      font-size: 0.8em;
      margin: 0.5rem 0;
    }
    ::ng-deep .markdown-body pre code {
      background-color: transparent;
      padding: 0;
      color: inherit;
    }
    ::ng-deep .markdown-body a {
      color: var(--color-primary);
      text-decoration: underline;
      font-weight: 600;
    }
    ::ng-deep .markdown-body h1,
    ::ng-deep .markdown-body h2,
    ::ng-deep .markdown-body h3,
    ::ng-deep .markdown-body h4 {
      font-family: var(--font-headline);
      font-weight: 700;
      margin-top: 0.5rem;
      margin-bottom: 0.25rem;
    }
    ::ng-deep .markdown-body strong {
      font-weight: 700;
    }
    ::ng-deep .markdown-body table {
      width: 100%;
      border-collapse: collapse;
      margin: 0.5rem 0;
      font-size: 0.85em;
    }
    ::ng-deep .markdown-body th,
    ::ng-deep .markdown-body td {
      border: 1px solid rgba(0, 0, 0, 0.1);
      padding: 0.35rem 0.5rem;
      text-align: left;
    }
    ::ng-deep .markdown-body th {
      background-color: rgba(0, 0, 0, 0.04);
      font-weight: 700;
    }

    @media (max-width: 768px) {
      .agent-drawer-panel {
        width: 100vw !important;
      }
      .agent-fab-shifted {
        left: 1.5rem !important;
      }
    }
  `]
})
export class AgentDrawerComponent implements OnInit, AfterViewChecked {
  @ViewChild('chatContainer') private chatContainer!: ElementRef;

  isOpen$: Observable<boolean>;
  apiKey$: Observable<string>;
  messages$: Observable<ChatMessage[]>;
  isLoading$: Observable<boolean>;

  inputPrompt: string = '';
  apiKeyInput: string = '';
  showApiKeySetup: boolean = false;
  showKeyPassword: boolean = false;

  quickPrompts: string[] = [
    'Find basketball items under $50',
    'What promotions are available?',
    'Search for soccer gear',
    'Open my shopping cart'
  ];

  constructor(public agentService: AgentService) {
    this.isOpen$ = this.agentService.isOpen$;
    this.apiKey$ = this.agentService.apiKey$;
    this.messages$ = this.agentService.messages$;
    this.isLoading$ = this.agentService.isLoading$;
  }

  ngOnInit() {
    this.apiKey$.subscribe(key => {
      this.apiKeyInput = key;
      if (!key) {
        this.showApiKeySetup = true;
      }
    });
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    try {
      if (this.chatContainer) {
        this.chatContainer.nativeElement.scrollTop = this.chatContainer.nativeElement.scrollHeight;
      }
    } catch (err) { }
  }

  toggleDrawer() {
    this.agentService.toggleOpen();
  }

  closeDrawer() {
    this.agentService.close();
  }

  saveApiKey() {
    if (this.apiKeyInput.trim()) {
      this.agentService.setApiKey(this.apiKeyInput);
      this.showApiKeySetup = false;
    }
  }

  toggleApiKeySettings() {
    this.showApiKeySetup = !this.showApiKeySetup;
  }

  logoutKey() {
    this.agentService.logout();
    this.apiKeyInput = '';
    this.showApiKeySetup = true;
  }

  sendMessage() {
    if (this.inputPrompt.trim()) {
      const prompt = this.inputPrompt;
      this.inputPrompt = '';
      this.agentService.sendMessage(prompt);
    }
  }

  useQuickPrompt(prompt: string) {
    this.inputPrompt = prompt;
    this.sendMessage();
  }

  clearChat() {
    this.agentService.clearChat();
  }
}
