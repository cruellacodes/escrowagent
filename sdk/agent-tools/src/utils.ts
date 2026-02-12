import type { z } from "zod";

/**
 * Convert a Zod schema to JSON Schema for MCP tool definitions.
 * Simple conversion — covers the types we use.
 */
export function zodToJsonSchema(schema: z.ZodType): Record<string, any> {
  return zodTypeToJson(schema);
}

function zodTypeToJson(schema: z.ZodType): Record<string, any> {
  const def = (schema as any)._def;

  if (!def) return { type: "object" };

  switch (def.typeName) {
    case "ZodObject": {
      const shape = def.shape();
      const properties: Record<string, any> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        const prop = zodTypeToJson(value as z.ZodType);
        const description = (value as any)._def?.description;
        if (description) prop.description = description;
        properties[key] = prop;

        // Check if required (not optional)
        if ((value as any)._def?.typeName !== "ZodOptional") {
          required.push(key);
        }
      }

      return {
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
      };
    }
    case "ZodString":
      return { type: "string" };
    case "ZodNumber":
      return { type: "number" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodEnum":
      return { type: "string", enum: def.values };
    case "ZodArray":
      return { type: "array", items: zodTypeToJson(def.type) };
    case "ZodOptional":
      return zodTypeToJson(def.innerType);
    case "ZodDefault":
      return { ...zodTypeToJson(def.innerType), default: def.defaultValue() };
    default:
      return { type: "string" };
  }
}
