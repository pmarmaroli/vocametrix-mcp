import { z } from "zod";

export const audioPath = z
  .string()
  .describe(
    "Audio file input. Accepted formats: " +
    "(1) absolute local file path (e.g. /home/user/audio.wav) for stdio/local mode; " +
    "(2) a blobUrl (https://...) returned by vocametrix_upload_audio — use this when the user " +
    "provided an audio file in the conversation (call vocametrix_upload_audio first to upload it)."
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
