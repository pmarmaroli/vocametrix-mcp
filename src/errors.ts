import {
  VocametrixAuthError,
  VocametrixForbiddenError,
  VocametrixNotFoundError,
  VocametrixRateLimitError,
  VocametrixValidationError,
  VocametrixServerError,
  VocametrixError,
} from "vocametrix";

export interface McpToolError {
  [key: string]: unknown;
  content: [{ type: "text"; text: string }];
  isError: true;
}

export function translateError(err: unknown): McpToolError {
  let message: string;

  if (err instanceof VocametrixAuthError) {
    message =
      "Authentication failed: your API key is invalid or missing.\n" +
      "Get a key at https://www.vocametrix.com/registration";
  } else if (err instanceof VocametrixForbiddenError) {
    message =
      "Access forbidden: your account does not have permission for this operation.\n" +
      "Check your plan at https://www.vocametrix.com/pricing";
  } else if (err instanceof VocametrixRateLimitError) {
    const wait = err.retryAfter ? ` Retry in ${String(err.retryAfter)} seconds.` : "";
    message = `Rate limit reached.${wait} The SDK retries automatically up to 3 times.`;
  } else if (err instanceof VocametrixValidationError) {
    message = `Invalid parameters: ${err.message}`;
  } else if (err instanceof VocametrixNotFoundError) {
    message = `Resource not found: ${err.message}`;
  } else if (err instanceof VocametrixServerError) {
    message = `Vocametrix server error (${String(err.statusCode ?? 500)}): ${err.message}`;
  } else if (err instanceof VocametrixError) {
    message = `Vocametrix error: ${err.message}`;
  } else if (err instanceof Error) {
    message = `Unexpected error: ${err.message}`;
  } else {
    message = `Unexpected error: ${String(err)}`;
  }

  console.error("[vocametrix-mcp]", message);
  return { content: [{ type: "text", text: message }], isError: true };
}
