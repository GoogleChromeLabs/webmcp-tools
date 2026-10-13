/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="node" />

import assert from "node:assert/strict";
import { test } from "node:test";
import { isError, type Value } from "../engine/values.ts";
import { SpreadsheetError, Workbook, type Sheet } from "./workbook.ts";

/** A workbook with `rows` typed into Sheet1 from A1. */
function book(rows: string[][] = []): { wb: Workbook; sheet: Sheet } {
  const wb = new Workbook();
  const sheet = wb.active;
  if (rows.length) wb.setBlock(sheet, 0, 0, rows);
  return { wb, sheet };
}

/** Value of `formula` typed into Z1. */
function calc(formula: string, rows: string[][] = []): Value {
  const { wb, sheet } = book(rows);
  wb.setInput(sheet, 0, 25, formula);
  return wb.value(sheet, 0, 25);
}

const code = (v: Value) => (isError(v) ? v.code : v);

test("operators follow spreadsheet precedence", () => {
  assert.equal(calc("=2+3*4"), 14);
  assert.equal(calc("=-2^2"), 4);
  assert.equal(calc("=2^3^2"), 64);
  assert.equal(calc("=50%*2"), 1);
  assert.equal(calc('="a"&1+1'), "a2");
  assert.equal(code(calc("=1/0")), "#DIV/0!");
  assert.equal(calc('="abc"="ABC"'), true);
  assert.equal(calc('=1="1"'), false);
  assert.equal(code(calc("=foo")), "#NAME?");
  assert.equal(code(calc("=SUM(1")), 1); // the missing ")" is added
  assert.equal(code(calc("=1+")), "#ERROR!");
});

test("functions compute over ranges", () => {
  const data = [
    ["Fruit", "Qty", "Price"],
    ["Apple", "3", "1.2"],
    ["Pear", "5", "0.8"],
    ["Plum", "text", "2"],
  ];
  assert.equal(calc("=SUM(B2:B4)", data), 8); // text in a range is skipped
  assert.equal(calc("=AVERAGE(C2:C4)", data), 4 / 3);
  assert.equal(calc("=SUMPRODUCT(B2:B3,C2:C3)", data), 7.6);
  assert.equal(calc('=SUMIF(B2:B4,">3",C2:C4)', data), 0.8);
  assert.equal(calc('=COUNTIFS(A2:A4,"P*",C2:C4,">1")', data), 1);
  assert.equal(calc('=VLOOKUP("pear",A2:C4,3,FALSE)', data), 0.8);
  assert.equal(calc('=XLOOKUP("Plum",A2:A4,C2:C4)', data), 2);
  assert.equal(code(calc('=XLOOKUP("Kiwi",A2:A4,C2:C4)', data)), "#N/A");
  assert.equal(calc('=XLOOKUP("Kiwi",A2:A4,C2:C4,"none")', data), "none");
  assert.equal(calc('=INDEX(A1:C4,MATCH("Pear",A1:A4,0),2)', data), 5);
  assert.equal(calc("=VLOOKUP(4,B2:B3,1)", data), 3); // approximate: largest value <= 4
  assert.equal(calc('=IF(B2>2,"big","small")', data), "big");
  assert.equal(calc('=IFERROR(1/0,"oops")'), "oops");
  assert.equal(calc('=TEXTJOIN(", ",TRUE,A2:A4)', data), "Apple, Pear, Plum");
  assert.equal(calc('=TEXT(1234.5,"$#,##0.00")'), "$1,234.50");
  assert.equal(calc("=ROUND(2.5)"), 3);
  assert.equal(calc("=ROUND(-1.005,2)"), -1.01);
  assert.equal(calc("=MOD(-3,2)"), 1);
  assert.equal(calc("=MAX(B2:B4)", data), 5);
  assert.equal(calc("=MIN(4,2,8)"), 2);
  assert.equal(calc("=ROUND(PMT(0.05/12,360,300000),2)"), -1610.46);
  assert.equal(calc("=EOMONTH(DATE(2026,1,15),1)"), calc("=DATE(2026,2,28)"));
  assert.equal(calc("=EDATE(DATE(2026,1,31),1)"), calc("=DATE(2026,2,28)"));
  assert.equal(calc('=DATEDIF("2020-05-01","2026-10-13","Y")'), 6);
  assert.equal(calc("=WEEKDAY(DATE(2026,10,13))"), 3);
  assert.equal(code(calc("=SUM()")), "#N/A");
});

test("circular references are errors, not hangs", () => {
  const { wb, sheet } = book([["=B1", "=A1"]]);
  const a1 = wb.value(sheet, 0, 0);
  assert.ok(isError(a1) && a1.message.includes("Circular"));
});

test("cross-sheet references follow renames and break on delete", () => {
  const { wb, sheet } = book([["5"]]);
  const other = wb.addSheet("Totals");
  wb.setInput(other, 0, 0, "=Sheet1!A1*2");
  assert.equal(wb.value(other, 0, 0), 10);
  wb.renameSheet(sheet, "Data");
  assert.equal(wb.cell(other, 0, 0)?.f, "=Data!A1*2");
  wb.deleteSheet(sheet);
  assert.equal(wb.cell(other, 0, 0)?.f, "=#REF!*2");
});

test("inserting and deleting rows keeps references on the same cells", () => {
  const { wb, sheet } = book([["1"], ["2"], ["3"], ["=SUM(A1:A3)"]]);
  wb.insertRows(sheet, 1, 1);
  assert.equal(wb.cell(sheet, 4, 0)?.f, "=SUM(A1:A4)");
  wb.setInput(sheet, 1, 0, "10");
  assert.equal(wb.value(sheet, 4, 0), 16);
  wb.deleteRows(sheet, 0, 2);
  assert.equal(wb.cell(sheet, 2, 0)?.f, "=SUM(A1:A2)");
  assert.equal(wb.value(sheet, 2, 0), 5);
});

test("copy shifts formulas; cut moves references with the cells", () => {
  const { wb, sheet } = book([["1", "=A1*2"], ["2"]]);
  wb.copy(sheet, { r1: 0, c1: 1, r2: 0, c2: 1 }, sheet, 1, 1, "all");
  assert.equal(wb.cell(sheet, 1, 1)?.f, "=A2*2");
  wb.setInput(sheet, 5, 0, "=A1+A2");
  wb.copy(sheet, { r1: 0, c1: 0, r2: 1, c2: 0 }, sheet, 0, 3, "all", true);
  assert.equal(wb.cell(sheet, 5, 0)?.f, "=D1+D2");
  assert.equal(wb.value(sheet, 5, 0), 3);
});

test("autofill continues series and fills formulas", () => {
  const { wb, sheet } = book([
    ["1", "Jan", "Item 9", "2026-10-13", "=A1*10"],
    ["3", "Feb"],
  ]);
  wb.autofill(sheet, { r1: 0, c1: 0, r2: 1, c2: 1 }, { r1: 0, c1: 0, r2: 3, c2: 1 });
  assert.equal(wb.value(sheet, 3, 0), 7);
  assert.equal(wb.value(sheet, 3, 1), "Apr");
  wb.autofill(sheet, { r1: 0, c1: 2, r2: 0, c2: 4 }, { r1: 0, c1: 2, r2: 2, c2: 4 });
  assert.equal(wb.value(sheet, 2, 2), "Item 11");
  assert.equal(wb.display(sheet, 2, 3), "2026-10-15");
  assert.equal(wb.cell(sheet, 2, 4)?.f, "=A3*10");
});

test("sort keeps headers and rows together; blanks go last", () => {
  const { wb, sheet } = book([
    ["Name", "Score"],
    ["Ann", "7"],
    ["Bob", ""],
    ["Cy", "9"],
  ]);
  wb.sort(sheet, { r1: 0, c1: 0, r2: 3, c2: 1 }, [{ col: 1, descending: true }], true);
  assert.deepEqual(
    [1, 2, 3].map((r) => wb.value(sheet, r, 0)),
    ["Cy", "Ann", "Bob"],
  );
  assert.equal(wb.value(sheet, 0, 0), "Name");
});

test("each edit is one undo step; failed edits roll back", () => {
  const { wb, sheet } = book([["1"]]);
  wb.transact("Two cells", () => {
    wb.setInput(sheet, 0, 0, "2");
    wb.setInput(sheet, 0, 1, "3");
  });
  assert.equal(wb.undoLabel, "Two cells");
  wb.undo();
  assert.deepEqual([wb.value(sheet, 0, 0), wb.value(sheet, 0, 1)], [1, null]);
  wb.redo();
  assert.equal(wb.value(sheet, 0, 1), 3);
  assert.throws(
    () =>
      wb.transact("Bad", () => {
        wb.setInput(sheet, 0, 0, "99");
        throw new SpreadsheetError("nope");
      }),
    SpreadsheetError,
  );
  assert.equal(wb.value(sheet, 0, 0), 2);
  assert.equal(wb.undoLabel, "Two cells");
});
