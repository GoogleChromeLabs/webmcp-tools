/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="node" />

import assert from "node:assert/strict";
import { test } from "node:test";
import { columnIndex, columnName, formatRef, parseRef, quoteSheet } from "./address.ts";
import { formatPattern, formatValue, generalNumber } from "./format.ts";
import { parseInput } from "./input.ts";
import { normalizeFormula, rewriteFormula, shiftRelative, shiftStructure } from "./rewrite.ts";

test("column letters round-trip", () => {
  for (const [index, name] of [
    [0, "A"],
    [25, "Z"],
    [26, "AA"],
    [51, "AZ"],
    [701, "ZZ"],
  ] as const) {
    assert.equal(columnName(index), name);
    assert.equal(columnIndex(name), index);
  }
});

test("references parse and print", () => {
  for (const text of ["B2", "$A$1:C9", "A:C", "3:5", "Sheet2!B2", "'Q1 Sales'!A1:B2", "'It''s'!A1"])
    assert.equal(formatRef(parseRef(text)!), text);
  assert.equal(parseRef("A0"), null);
  assert.equal(parseRef("SUM"), null);
  assert.equal(quoteSheet("Sales"), "Sales");
  assert.equal(quoteSheet("Q1"), "'Q1'");
  assert.equal(quoteSheet("My Sheet"), "'My Sheet'");
});

test("typed input becomes values with implied formats", () => {
  assert.deepEqual(parseInput("42"), { value: 42 });
  assert.deepEqual(parseInput("1,234.5"), {
    value: 1234.5,
    format: { numFmt: "number", decimals: 1 },
  });
  assert.deepEqual(parseInput("12%"), { value: 0.12, format: { numFmt: "percent", decimals: 0 } });
  assert.deepEqual(parseInput("-$1,200.50"), {
    value: -1200.5,
    format: { numFmt: "currency", currency: "USD", decimals: 2 },
  });
  assert.deepEqual(parseInput("€5"), { value: 5, format: { numFmt: "currency", currency: "EUR" } });
  assert.deepEqual(parseInput("2026-10-13"), { value: 46308, format: { numFmt: "date" } });
  assert.deepEqual(parseInput("10/13/2026"), { value: 46308, format: { numFmt: "date" } });
  assert.deepEqual(parseInput("2:30 PM"), { value: 14.5 / 24, format: { numFmt: "time" } });
  assert.deepEqual(parseInput("true"), { value: true });
  assert.deepEqual(parseInput("'00123"), { value: "00123" });
  assert.deepEqual(parseInput("=sum(A1:A3)"), { value: null, formula: "=sum(A1:A3)" });
  assert.deepEqual(parseInput("2026-02-30"), { value: "2026-02-30" });
  assert.deepEqual(parseInput("hello"), { value: "hello" });
});

test("values display by format", () => {
  assert.equal(generalNumber(0.1 + 0.2), "0.3");
  assert.equal(generalNumber(1 / 3), "0.3333333333");
  assert.equal(generalNumber(1e20), "1E+20");
  assert.equal(formatValue(1234.5, { numFmt: "currency" }), "$1,234.50");
  assert.equal(formatValue(0.125, { numFmt: "percent", decimals: 1 }), "12.5%");
  assert.equal(formatValue(46308, { numFmt: "date" }), "2026-10-13");
  assert.equal(formatValue(true), "TRUE");
  assert.equal(formatPattern(1234.5, "$#,##0.00"), "$1,234.50");
  assert.equal(formatPattern(0.256, "0.0%"), "25.6%");
  assert.equal(formatPattern(7, "000"), "007");
  assert.equal(formatPattern(46308.75, "mmm d, yyyy h:mm AM/PM"), "Oct 13, 2026 6:00 PM");
  assert.equal(formatPattern(46308, "dddd"), "Tuesday");
});

test("formulas are rewritten reference by reference", () => {
  assert.equal(rewriteFormula("=A1+$B$1+B$2", shiftRelative(2, 1)), "=B3+$B$1+C$2");
  assert.equal(rewriteFormula("=A1", shiftRelative(-1, 0)), "=#REF!");
  // Insert 2 rows at row 3 (index 2): refs at or below move down, ranges stretch.
  assert.equal(
    rewriteFormula("=SUM(A1:A5) + A2 + A3", shiftStructure("S", "S", "row", 2, 2)),
    "=SUM(A1:A7) + A2 + A5",
  );
  // Delete row 3: a reference to it breaks, ranges shrink, refs below move up.
  assert.equal(
    rewriteFormula("=A3 + SUM(A1:A5) + A9", shiftStructure("S", "S", "row", 2, -1)),
    "=#REF! + SUM(A1:A4) + A8",
  );
  // References to other sheets are left alone.
  assert.equal(rewriteFormula("=Other!A3", shiftStructure("S", "S", "row", 0, 1)), "=Other!A3");
  assert.equal(normalizeFormula("=sum(a1:b2"), "=SUM(A1:B2)");
});
