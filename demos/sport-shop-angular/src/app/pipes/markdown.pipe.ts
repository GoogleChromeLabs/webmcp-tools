/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';

@Pipe({
  name: 'markdown',
  standalone: true
})
export class MarkdownPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(value: string | undefined | null): SafeHtml {
    if (!value) return '';
    try {
      const parsed = marked.parse(value, { async: false }) as string;
      return this.sanitizer.bypassSecurityTrustHtml(parsed);
    } catch (e) {
      console.error('Error parsing markdown:', e);
      return value;
    }
  }
}
