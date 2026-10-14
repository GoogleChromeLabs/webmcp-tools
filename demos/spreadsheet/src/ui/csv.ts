/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** CSV and TSV with RFC 4180 quoting: clipboard exchange with other spreadsheets, import and export. */

export function parseDelimited(text: string, delimiter: "," | "\t"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      [row, field] = [[], ""];
    } else field += ch;
  }
  if (field !== "" || row.length) rows.push([...row, field]);
  return rows;
}

/** The delimiter a file most likely uses. */
export const sniffDelimiter = (text: string): "," | "\t" =>
  (text.split("\n", 1)[0].match(/\t/g)?.length ?? 0) >
  (text.split("\n", 1)[0].match(/,/g)?.length ?? 0)
    ? "\t"
    : ",";

export function toDelimited(rows: string[][], delimiter: "," | "\t"): string {
  const special = new RegExp(`["\\r\\n${delimiter}]`);
  return rows
    .map((row) =>
      row
        .map((field) => (special.test(field) ? `"${field.replaceAll('"', '""')}"` : field))
        .join(delimiter),
    )
    .join("\r\n");
}

/**
 * Text that starts with = + - or @ would run as a formula when the file is opened in another
 * spreadsheet (CSV injection), so exported text cells like that get a leading apostrophe.
 */
export const safeCsvText = (text: string): string =>
  /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
