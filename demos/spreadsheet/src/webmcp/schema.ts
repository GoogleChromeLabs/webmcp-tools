/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * JSON Schema helpers for tool inputs. webmcp-types infers each tool's input type from its schema
 * (`ToolInput` in runtime.ts), but it only has types for the WebMCP API: no JSON Schema types and
 * no runtime checks. So these helpers build schemas that keep their literal types for that
 * inference, and `validate` checks what agents send against the same schema before a tool runs.
 */

interface Constraints {
  readonly default?: unknown;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minLength?: number;
  readonly minItems?: number;
  readonly maxItems?: number;
}

export const str = <const O extends Constraints & { readonly default?: string } = {}>(
  description: string,
  options?: O,
) =>
  ({ type: "string", description, ...options }) as {
    readonly type: "string";
    readonly description: string;
  } & O;

export const int = <const O extends Constraints & { readonly default?: number } = {}>(
  description: string,
  options?: O,
) =>
  ({ type: "integer", description, ...options }) as {
    readonly type: "integer";
    readonly description: string;
  } & O;

export const num = <const O extends Constraints & { readonly default?: number } = {}>(
  description: string,
  options?: O,
) =>
  ({ type: "number", description, ...options }) as {
    readonly type: "number";
    readonly description: string;
  } & O;

export const bool = <const O extends { readonly default?: boolean } = {}>(
  description: string,
  options?: O,
) =>
  ({ type: "boolean", description, ...options }) as {
    readonly type: "boolean";
    readonly description: string;
  } & O;

export const oneOf = <
  const T extends readonly string[],
  const O extends { readonly default?: T[number] } = {},
>(
  values: T,
  description: string,
  options?: O,
) =>
  ({ type: "string", enum: values, description, ...options }) as {
    readonly type: "string";
    readonly enum: T;
    readonly description: string;
  } & O;

export const list = <const I extends object, const O extends Constraints = {}>(
  items: I,
  description: string,
  options?: O,
) =>
  ({ type: "array", items, description, ...options }) as {
    readonly type: "array";
    readonly items: I;
    readonly description: string;
  } & O;

export const object = <
  const P extends Readonly<Record<string, object>>,
  const R extends readonly (keyof P & string)[] = [],
>(
  properties: P,
  required?: R,
) =>
  ({ type: "object", properties, ...(required?.length && { required }) }) as {
    readonly type: "object";
    readonly properties: P;
  } & (R extends readonly [] ? unknown : { readonly required: R });

// ---------- validation ----------

interface Schema extends Constraints {
  readonly type?: string;
  readonly enum?: readonly unknown[];
  readonly items?: Schema;
  readonly properties?: Readonly<Record<string, Schema>>;
  readonly required?: readonly string[];
}

class InputError extends Error {}

const label = (path: string) => `"${path}"`;

function check(schema: Schema, value: unknown, path: string): unknown {
  switch (schema.type) {
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new InputError(`${path ? label(path) : "The input"} must be an object.`);
      const properties = schema.properties ?? {};
      const known = Object.keys(properties);
      for (const key of Object.keys(value))
        if (!known.includes(key))
          throw new InputError(
            `Unknown parameter ${label(path ? `${path}.${key}` : key)}. ${known.length ? `Parameters: ${known.join(", ")}.` : "This takes no parameters."}`,
          );
      const out: Record<string, unknown> = {};
      for (const [key, property] of Object.entries(properties)) {
        const item = (value as Record<string, unknown>)[key];
        const where = path ? `${path}.${key}` : key;
        // Agents often send null for "not set", so null counts as missing.
        if (item === undefined || item === null) {
          if (schema.required?.includes(key))
            throw new InputError(`Missing required parameter ${label(where)}.`);
          if (property.default !== undefined) out[key] = property.default;
        } else out[key] = check(property, item, where);
      }
      return out;
    }
    case "array": {
      if (!Array.isArray(value)) throw new InputError(`${label(path)} must be an array.`);
      if (schema.minItems !== undefined && value.length < schema.minItems)
        throw new InputError(`${label(path)} needs at least ${schema.minItems} item(s).`);
      if (schema.maxItems !== undefined && value.length > schema.maxItems)
        throw new InputError(`${label(path)} takes at most ${schema.maxItems} items.`);
      return value.map((item, i) => check(schema.items ?? {}, item, `${path}[${i}]`));
    }
    case "string": {
      // A number, TRUE/FALSE or null where text is expected is read the way it would be typed.
      const text =
        typeof value === "number" && Number.isFinite(value)
          ? String(value)
          : typeof value === "boolean"
            ? value
              ? "TRUE"
              : "FALSE"
            : value === null
              ? ""
              : value;
      if (typeof text !== "string") throw new InputError(`${label(path)} must be text.`);
      if (schema.enum && !schema.enum.includes(text))
        throw new InputError(
          `${label(path)} must be one of: ${schema.enum.join(", ")}. Got "${text}".`,
        );
      if (schema.minLength !== undefined && text.length < schema.minLength)
        throw new InputError(`${label(path)} can't be empty.`);
      return text;
    }
    case "integer":
    case "number": {
      const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
      if (typeof n !== "number" || !Number.isFinite(n))
        throw new InputError(`${label(path)} must be a number.`);
      if (schema.type === "integer" && !Number.isInteger(n))
        throw new InputError(`${label(path)} must be a whole number.`);
      if (
        (schema.minimum !== undefined && n < schema.minimum) ||
        (schema.maximum !== undefined && n > schema.maximum)
      )
        throw new InputError(
          `${label(path)} must be ${schema.maximum === undefined ? `at least ${schema.minimum}` : schema.minimum === undefined ? `at most ${schema.maximum}` : `between ${schema.minimum} and ${schema.maximum}`}. Got ${n}.`,
        );
      return n;
    }
    case "boolean":
      if (value === "true" || value === "false") return value === "true";
      if (typeof value !== "boolean") throw new InputError(`${label(path)} must be true or false.`);
      return value;
    default:
      return value;
  }
}

/**
 * Checks agent input against a tool's schema: types, enums, ranges, required and unknown
 * parameters. Fills in defaults. Returns the cleaned input, or an error naming the parameter.
 */
export function validate(
  schema: object,
  input: unknown,
): { value: Record<string, unknown> } | { error: string } {
  try {
    return { value: check(schema as Schema, input ?? {}, "") as Record<string, unknown> };
  } catch (error) {
    if (error instanceof InputError) return { error: error.message };
    throw error;
  }
}
