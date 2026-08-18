/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Logger {
  log(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
  dir(obj: any, options?: any): void;
}

class ConsoleLogger implements Logger {
  private debugEnabled = false;

  setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  log(message: string, ...args: any[]): void {
    console.log(message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    console.warn(message, ...args);
  }

  error(message: string, ...args: any[]): void {
    console.error(message, ...args);
  }

  debug(message: string, ...args: any[]): void {
    if (this.debugEnabled) {
      console.log(message, ...args);
    }
  }

  dir(obj: any, options?: any): void {
    if (this.debugEnabled) {
      console.dir(obj, options);
    }
  }
}

export { ConsoleLogger };
export const logger = new ConsoleLogger();
