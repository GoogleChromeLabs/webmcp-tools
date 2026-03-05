/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "node:assert";
import { describe, it } from "node:test";
import { sanitizeSchema } from "../evaluator/mappers.js";

describe("mappers", () => {
  describe("sanitizeSchema", () => {
    it("should strip oneOf and anyOf from schemas", () => {
      const input = {
        type: "object",
        properties: {
          guests: {
            type: "string",
            oneOf: [{ const: "1", title: "1 Person" }],
            enum: ["1", "2"],
          },
          nested: {
            anyOf: [{ type: "string" }],
          },
        },
      };

      const output = sanitizeSchema(input);

      assert.deepStrictEqual(output, {
        type: "object",
        properties: {
          guests: {
            type: "string",
            enum: ["1", "2"],
          },
          nested: {},
        },
      });
    });

    it("should safely handle null or raw schemas", () => {
      assert.deepStrictEqual(sanitizeSchema(null), null);
      assert.deepStrictEqual(sanitizeSchema("string"), "string");
      assert.deepStrictEqual(sanitizeSchema({}), {});
    });
  });
});
