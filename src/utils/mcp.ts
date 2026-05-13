export function ok(data: unknown): { content: [{ type: "text"; text: string }] } {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text", text }] };
}

export const READONLY_TOOL = { readOnlyHint: true, idempotentHint: true, openWorldHint: true } as const;
export const STATEFUL_TOOL = { readOnlyHint: false, idempotentHint: false, openWorldHint: true } as const;
export const DESTRUCTIVE_TOOL = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true } as const;
