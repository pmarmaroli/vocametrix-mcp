import { z } from "zod";

export const GENERIC_OUTPUT_SCHEMA = { result: z.unknown() };

export function ok(data: unknown) {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: { result: data },
  };
}

export const READONLY_TOOL = { readOnlyHint: true, idempotentHint: true, openWorldHint: true } as const;
export const STATEFUL_TOOL = { readOnlyHint: false, idempotentHint: false, openWorldHint: true } as const;
export const DESTRUCTIVE_TOOL = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true } as const;
