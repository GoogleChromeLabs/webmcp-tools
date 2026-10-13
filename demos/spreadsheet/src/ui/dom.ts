/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** DOM helpers. Text always goes in as text nodes, never as HTML. */

export function $<T extends HTMLElement = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element ${selector}`);
  return element;
}

type Props<K extends keyof HTMLElementTagNameMap> = Partial<
  Omit<HTMLElementTagNameMap[K], "dataset" | "style">
> & { dataset?: Record<string, string>; style?: Partial<CSSStyleDeclaration> };

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props<K> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const { dataset, style, ...rest } = props;
  const element = Object.assign(document.createElement(tag), rest);
  if (dataset) Object.assign(element.dataset, dataset);
  if (style) Object.assign(element.style, style);
  element.append(...children);
  return element;
}

const SVG_NS = "http://www.w3.org/2000/svg";

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number> = {},
  ...children: (Node | string)[]
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  element.append(...children);
  return element;
}

/** An icon from the sprite in index.html. */
export const icon = (name: string): SVGSVGElement =>
  svg("svg", { "aria-hidden": "true" }, svg("use", { href: `#i-${name}` }));

export const reducedMotion = (): boolean => matchMedia("(prefers-reduced-motion: reduce)").matches;
