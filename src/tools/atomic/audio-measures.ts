import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ApiClient } from "../../client.js";
import { translateError } from "../../errors.js";
import { audioPath } from "../../schemas/common.js";

function ok(data: unknown): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function registerAudioMeasureTools(server: McpServer, client: ApiClient): void {
  // ── Sound Level ──────────────────────────────────────────────────────────────
  server.tool(
    "vocametrix_measure_sound_level",
    "Measure sound level in dB SPL over a specified time window in an audio file. " +
    "Useful for environmental noise assessment, vocal loudness measurement, and calibration tasks. " +
    "Note: startSec must be > 0 (use 0.001 for the start of the file).",
    {
      audioPath: audioPath,
      startSec: z.number().min(0.001).default(0.001).describe("Start time in seconds (minimum 0.001)"),
      endSec: z.number().positive().optional().describe("End time in seconds (defaults to end of file)"),
    },
    async ({ audioPath: path, startSec, endSec }) => {
      try {
        const blobURL = await client.uploadBlobUrl(path);
        const body: Record<string, unknown> = { blobURL, start_sec: startSec };
        if (endSec !== undefined) body["end_sec"] = endSec;
        const result = await client.post("/api/soundLevel", body);
        return ok(result);
      } catch (e) { return translateError(e); }
    },
  );

  // ── eGeMAPS ─────────────────────────────────────────────────────────────────
  server.tool(
    "vocametrix_extract_egemaps",
    "Extract the full openSMILE eGeMAPSv02 feature set (88 acoustic features) from an audio file. " +
    "Features include F0, jitter, shimmer, HNR, MFCCs, formants, spectral flux, and loudness. " +
    "Commonly used as input to machine-learning voice pathology classifiers.",
    {
      audioPath: audioPath,
    },
    async ({ audioPath: path }) => {
      try {
        const fileId = await client.uploadFileId(path);
        const result = await client.get("/api/gemaps-extract", { svFileId: fileId });
        return ok(result);
      } catch (e) { return translateError(e); }
    },
  );

  // ── Phoneme Detection ────────────────────────────────────────────────────────
  server.tool(
    "vocametrix_detect_phonemes",
    "Detect phonemes in an audio recording using a deep-learning classifier. " +
    "Returns phoneme labels with confidence scores. " +
    "Currently supports French (fr) and Estonian (et) phoneme inventories.",
    {
      audioPath: audioPath,
      language: z.enum(["fr", "et"]).default("fr").describe("Phoneme inventory language: fr = French, et = Estonian"),
    },
    async ({ audioPath: path, language }) => {
      try {
        const fileId = await client.uploadFileId(path);
        const result = await client.post("/api/classify-phoneme", { fileId, language });
        return ok(result);
      } catch (e) { return translateError(e); }
    },
  );

  // ── Stuttering Classification ────────────────────────────────────────────────
  server.tool(
    "vocametrix_classify_stuttering",
    "Classify stuttering disfluency patterns in a speech recording (async, ~30–120 seconds). " +
    "Returns disfluency types (repetitions, prolongations, blocks), severity score, and fluency rate. " +
    "The tool polls the result automatically — no separate status call needed.",
    {
      audioPath: audioPath,
      pollIntervalMs: z.number().int().min(1000).max(30000).default(5000)
        .describe("Polling interval in ms while waiting for result (default 5000)"),
      timeoutMs: z.number().int().min(10000).max(900000).default(620000)
        .describe("Maximum wait time in ms before giving up (default 620000 = ~10 min)"),
    },
    async ({ audioPath: path, pollIntervalMs, timeoutMs }) => {
      try {
        const fileId = await client.uploadFileId(path);
        const startResult = await client.post("/api/classify-stuttering", { fileId }) as { session_id: string };
        const sessionId = startResult.session_id;

        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          await new Promise(r => setTimeout(r, pollIntervalMs));
          const status = await client.get(`/api/therapy-status/${sessionId}`) as Record<string, unknown>;
          const state = String(status["status"] ?? status["state"] ?? "");
          if (["completed", "succeeded", "done"].includes(state)) break;
          if (["failed", "error"].includes(state)) {
            return { content: [{ type: "text" as const, text: `Classification failed: ${JSON.stringify(status)}` }], isError: true as const };
          }
        }

        const result = await client.get(`/api/therapy-result/${sessionId}`);
        return ok(result);
      } catch (e) { return translateError(e); }
    },
  );
}
