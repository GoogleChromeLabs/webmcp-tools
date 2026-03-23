/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Type declarations for the WebMCP declarative API.
 * Extends standard HTML elements with WebMCP attributes.
 * @see https://webmachinelearning.github.io/webmcp/
 */

declare global {
  /**
   * Extends the base HTMLElement with WebMCP declarative attributes.
   * This is used for standard DOM interactions in any web framework.
   */
  interface HTMLElement {
    /** Unique identifier for the declarative tool. */
    toolname?: string;

    /** Natural-language description of what the tool does. */
    tooldescription?: string;

    /** Natural-language description of a specific input parameter. */
    toolparamdescription?: string;

    /** If present, the form will automatically submit when parameters are filled. */
    toolautosubmit?: string;
  }
}

// Ensure this is treated as a module that augments global types.
export {};
