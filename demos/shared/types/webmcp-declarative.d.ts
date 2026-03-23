/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Type declarations for the WebMCP declarative API.
 * Extends standard HTML elements and React components with WebMCP attributes.
 * @see https://webmachinelearning.github.io/webmcp/
 *
 * NOTE: This file is intentionally NOT a module (no top-level import/export)
 * to ensure its ambient declarations are globally visible.
 */

/**
 * Extends the base HTMLElement with WebMCP declarative attributes.
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

/**
 * Augment React's attribute types to support WebMCP attributes in TSX.
 */
declare namespace React {
  interface HTMLAttributes<T> {
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
