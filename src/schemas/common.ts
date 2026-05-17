import { z } from "zod";

export const audioPath = z
  .string()
  .describe(
    "Audio source. MUST be one of: " +
    "(a) a Vocametrix blobUrl (https://...) returned by vocametrix_upload_audio — REQUIRED " +
    "whenever the user attached a file in the conversation; you MUST call " +
    "vocametrix_upload_audio FIRST and pass the returned blobUrl here; " +
    "(b) a publicly fetchable HTTPS URL pointing to a WAV file; " +
    "(c) an absolute local file path (only valid in stdio/local mode where the MCP server " +
    "runs on the same machine as the client — NEVER pass a local path when running against " +
    "the hosted/remote MCP server). " +
    "DO NOT pass internal file references, conversation attachment identifiers, opaque file " +
    "IDs, or filenames — the remote MCP server cannot resolve them and the call will fail."
  );

export const gender = z
  .enum(["1", "2", "3"])
  .describe("Speaker gender: 1 = Male, 2 = Female, 3 = Other");

export const age = z
  .number()
  .int()
  .min(0)
  .max(120)
  .describe("Speaker age in years (0–120)");

export const locale = z
  .string()
  .default("en-US")
  .describe('BCP-47 locale code, e.g. "en-US", "fr-FR", "es-ES"');

export const email = z
  .string()
  .email()
  .optional()
  .describe("Optional contact email used for upload tracking");

export const AVQI_VERSION: Record<string, "v02.03" | "v03.01"> = {
  en: "v02.03", nl: "v02.03", de: "v02.03",
  fr: "v03.01", es: "v03.01", it: "v03.01",
};
