/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from "node:test";
import * as assert from "node:assert";
import { matchesArgument } from "../matcher.js";

describe("matcher", () => {
  describe("exact matching", () => {
    it("matches primitive values", () => {
      assert.strictEqual(matchesArgument(1, 1), true);
      assert.strictEqual(matchesArgument("hello", "hello"), true);
      assert.strictEqual(matchesArgument(true, true), true);
      assert.strictEqual(matchesArgument(null, null), true);

      assert.strictEqual(matchesArgument(1, 2), false);
      assert.strictEqual(matchesArgument("hello", "world"), false);
      assert.strictEqual(matchesArgument(true, false), false);
      assert.strictEqual(matchesArgument(null, undefined), false);
    });

    it("matches objects deeply", () => {
      assert.strictEqual(matchesArgument({ a: 1 }, { a: 1 }), true);
      assert.strictEqual(matchesArgument({ a: { b: 2 } }, { a: { b: 2 } }), true);

      assert.strictEqual(matchesArgument({ a: 1 }, { a: 2 }), false);
      assert.strictEqual(matchesArgument({ a: 1 }, { b: 1 }), false);
      assert.strictEqual(matchesArgument({ a: { b: 2 } }, { a: { b: 3 } }), false);
    });

    it("matches arrays deeply", () => {
      assert.strictEqual(matchesArgument([1, 2], [1, 2]), true);
      assert.strictEqual(matchesArgument([1, [2]], [1, [2]]), true);

      assert.strictEqual(matchesArgument([1, 2], [1, 3]), false);
      assert.strictEqual(matchesArgument([1, 2], [1, 2, 3]), false);
    });
  });

  describe("constraints", () => {
    describe("$pattern", () => {
      it("matches strings against regex", () => {
        assert.strictEqual(matchesArgument({ $pattern: "^2026-\\d{2}$" }, "2026-01"), true);
        assert.strictEqual(matchesArgument({ $pattern: "foo" }, "foobar"), true);

        assert.strictEqual(matchesArgument({ $pattern: "^2026-\\d{2}$" }, "2025-01"), false);
        assert.strictEqual(matchesArgument({ $pattern: "^foo$" }, "foobar"), false);
      });

      it("fails if actual is not a string", () => {
        assert.strictEqual(matchesArgument({ $pattern: ".*" }, 123), false);
        assert.strictEqual(matchesArgument({ $pattern: ".*" }, null), false);
      });

      describe("inline flag prefix", () => {
        it("honors (?i) for case-insensitive matching", () => {
          // The bare regex `^colour$` is case-sensitive in V8, and `(?i)` is
          // POSIX/Python syntax that V8 doesn't parse natively — without the
          // `buildPattern` shim this would throw SyntaxError.
          assert.strictEqual(matchesArgument({ $pattern: "(?i)^colou?r$" }, "Color"), true);
          assert.strictEqual(matchesArgument({ $pattern: "(?i)^colou?r$" }, "colour"), true);
          assert.strictEqual(matchesArgument({ $pattern: "(?i)^colou?r$" }, "COLOR"), true);
          assert.strictEqual(matchesArgument({ $pattern: "(?i)^colou?r$" }, "colourful"), false);
        });

        it("honors (?i) mid-substring", () => {
          assert.strictEqual(matchesArgument({ $pattern: "(?i)purple" }, "Purple Shoes"), true);
          assert.strictEqual(matchesArgument({ $pattern: "(?i)purple" }, "BUY PURPLE!"), true);
          assert.strictEqual(matchesArgument({ $pattern: "(?i)purple" }, "red"), false);
        });

        it("honors multiple inline flags, e.g. (?is)", () => {
          // `s` (dotall) lets `.` match newlines; `i` is case-insensitive.
          // Both should compose from a single prefix.
          assert.strictEqual(matchesArgument({ $pattern: "(?is)foo.bar" }, "FOO\nBAR"), true);
          assert.strictEqual(matchesArgument({ $pattern: "(?i)foo.bar" }, "FOO\nBAR"), false);
        });

        it("leaves patterns without an inline-flag prefix unchanged", () => {
          // Regression guard: patterns that don't start with `(?flags)` must
          // continue to work with case-sensitive default matching.
          assert.strictEqual(matchesArgument({ $pattern: "^Color$" }, "Color"), true);
          assert.strictEqual(matchesArgument({ $pattern: "^Color$" }, "color"), false);
        });

        it("throws on unsupported inline flags with a useful message", () => {
          // `x` (extended, POSIX/Perl free-spacing) is not supported by V8 —
          // silently accepting it would mislead authors into thinking
          // whitespace/comments in patterns get stripped.
          assert.throws(
            () => matchesArgument({ $pattern: "(?x) foo # bar" }, "foo"),
            /Unsupported inline flag "\(\?x\)"/,
          );
        });

        it("does not swallow a genuine SyntaxError from a malformed pattern", () => {
          // Malformed regexes still throw — the shim only handles the inline
          // flag prefix, not general error recovery.
          assert.throws(() => matchesArgument({ $pattern: "(?i)[unclosed" }, "anything"), SyntaxError);
        });
      });
    });

    describe("$contains", () => {
      it("matches strings containing substring", () => {
        assert.strictEqual(matchesArgument({ $contains: "bar" }, "foobar"), true);
        assert.strictEqual(matchesArgument({ $contains: "foo" }, "foo"), true);

        assert.strictEqual(matchesArgument({ $contains: "baz" }, "foobar"), false);
      });

      it("fails if actual is not a string", () => {
        assert.strictEqual(matchesArgument({ $contains: "foo" }, 123), false);
        assert.strictEqual(matchesArgument({ $contains: "foo" }, null), false);
      });
    });

    describe("numeric comparisons", () => {
      it("$gt", () => {
        assert.strictEqual(matchesArgument({ $gt: 10 }, 11), true);
        assert.strictEqual(matchesArgument({ $gt: 10 }, 10), false);
      });
      it("$gte", () => {
        assert.strictEqual(matchesArgument({ $gte: 10 }, 10), true);
        assert.strictEqual(matchesArgument({ $gte: 10 }, 9), false);
      });
      it("$lt", () => {
        assert.strictEqual(matchesArgument({ $lt: 10 }, 9), true);
        assert.strictEqual(matchesArgument({ $lt: 10 }, 10), false);
      });
      it("$lte", () => {
        assert.strictEqual(matchesArgument({ $lte: 10 }, 10), true);
        assert.strictEqual(matchesArgument({ $lte: 10 }, 11), false);
      });
      it("fails if actual is not a number", () => {
        assert.strictEqual(matchesArgument({ $gt: 10 }, "11"), false);
        assert.strictEqual(matchesArgument({ $gt: 10 }, null), false);
      });
    });

    describe("$type", () => {
      it("matches specific types", () => {
        assert.strictEqual(matchesArgument({ $type: "string" }, "foo"), true);
        assert.strictEqual(matchesArgument({ $type: "number" }, 123), true);
        assert.strictEqual(matchesArgument({ $type: "boolean" }, true), true);
        assert.strictEqual(matchesArgument({ $type: "object" }, {}), true);
        assert.strictEqual(matchesArgument({ $type: "array" }, []), true);
        assert.strictEqual(matchesArgument({ $type: "null" }, null), true);

        assert.strictEqual(matchesArgument({ $type: "string" }, 123), false);
        assert.strictEqual(matchesArgument({ $type: "number" }, "123"), false);
        assert.strictEqual(matchesArgument({ $type: "array" }, {}), false);
        assert.strictEqual(matchesArgument({ $type: "object" }, []), false);
      });
    });

    describe("$any", () => {
      it("matches anything", () => {
        assert.strictEqual(matchesArgument({ $any: true }, "foo"), true);
        assert.strictEqual(matchesArgument({ $any: true }, null), true);
        assert.strictEqual(matchesArgument({ $any: true }, undefined), true); // undefined usually shouldn't happen in JSON arguments but good to check
      });
    });

    describe("recursive constraints", () => {
      it("matches nested constraints", () => {
        const schema = {
          a: { $gt: 10 },
          b: { c: { $contains: "hello" } },
        };
        assert.strictEqual(matchesArgument(schema, { a: 11, b: { c: "hello world" } }), true);
        assert.strictEqual(matchesArgument(schema, { a: 10, b: { c: "hello world" } }), false);
        assert.strictEqual(matchesArgument(schema, { a: 11, b: { c: "bye world" } }), false);
      });

      it("matches array elements with constraints", () => {
        const schema = {
          list: [{ $gt: 10 }, { $type: "string" }],
        };
        assert.strictEqual(matchesArgument(schema, { list: [11, "foo"] }), true);
        assert.strictEqual(matchesArgument(schema, { list: [10, "foo"] }), false);
        assert.strictEqual(matchesArgument(schema, { list: [11, 123] }), false);
      });
    });
  });
});
