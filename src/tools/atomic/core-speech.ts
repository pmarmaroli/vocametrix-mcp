import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ApiClient } from "../../client.js";
import { translateError } from "../../errors.js";
import { ok } from "../../utils/mcp.js";
import { audioPath, locale } from "../../schemas/common.js";

export function registerCoreSpeechTools(server: McpServer, client: ApiClient): void {
  // ── Pronunciation Assessment ─────────────────────────────────────────────────
  server.tool(
    "vocametrix_assess_pronunciation",
    "Score pronunciation accuracy at phoneme level against a reference text. " +
    "Returns accuracy, fluency, completeness, and prosody scores (0–100) plus per-word and per-phoneme breakdowns. " +
    "Supports 30+ locales (en-US, fr-FR, de-DE, zh-CN, ar-SA, etc.). " +
    "Audio should be a clear reading of the reference text.",
    {
      audioPath: audioPath.describe("WAV recording of the speaker reading the reference text"),
      referenceText: z.string().min(1).describe("The text the speaker was reading aloud"),
      speakerLocale: locale,
    },
    async ({ audioPath: path, referenceText, speakerLocale }) => {
      try {
        const blobURL = await client.uploadBlobUrl(path);
        const result = await client.post("/api/pronunciation-assessment", {
          blobURL,
          referenceText,
          locale: speakerLocale,
        });
        return ok(result);
      } catch (e) { return translateError(e); }
    },
  );

  // ── Pronunciation + Pitch ────────────────────────────────────────────────────
  server.tool(
    "vocametrix_assess_pronunciation_with_pitch",
    "Pronunciation assessment enriched with per-word F0 (pitch) contours. " +
    "In addition to accuracy/fluency/prosody scores, returns fundamental frequency (pitch) " +
    "statistics for each word — useful for tonal language analysis and prosody coaching.",
    {
      audioPath: audioPath,
      referenceText: z.string().min(1).describe("The text the speaker was reading aloud"),
      speakerLocale: locale,
    },
    async ({ audioPath: path, referenceText, speakerLocale }) => {
      try {
        const blobURL = await client.uploadBlobUrl(path);
        const result = await client.post("/api/pronunciation-assessment-with-pitch", {
          blobURL,
          referenceText,
          locale: speakerLocale,
        });
        return ok(result);
      } catch (e) { return translateError(e); }
    },
  );

  // ── Transcription ────────────────────────────────────────────────────────────
  server.tool(
    "vocametrix_transcribe_audio",
    "Transcribe an audio file using Azure Speech-to-Text with streaming progress. " +
    "Returns a transcriptionId and streams progress events via SSE until completion. " +
    "Returns the final transcript and word-level timing. " +
    "For long recordings, poll the progress events — transcription may take 30–120 seconds.",
    {
      audioPath: audioPath,
      speakerLocale: locale,
    },
    async ({ audioPath: path, speakerLocale }) => {
      try {
        const blobUrl = await client.uploadBlobUrl(path);
        const submitResult = await client.post("/api/offline-speech-to-text", {
          blobUrl,
          locale: speakerLocale,
        }) as { transcriptionId: string };

        const transcriptionId = submitResult.transcriptionId;
        const sseUrl = `https://platform.vocametrix.com/api/transcription-progress/${transcriptionId}`;

        const resp = await fetch(sseUrl, { headers: { "X-API-Key": client.apiKey } });
        if (!resp.ok || !resp.body) {
          return ok({ transcriptionId, status: "submitted", message: "Transcription submitted. Poll status with transcriptionId: " + transcriptionId });
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let lastEvent: unknown = null;

        for (;;) {
          const chunk = await reader.read() as { done: boolean; value: Uint8Array | undefined };
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value ?? new Uint8Array(0), { stream: true });
          let boundary: number;
          while ((boundary = buffer.indexOf("\n\n")) !== -1) {
            const block = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const dataLine = block.split("\n").find(l => l.startsWith("data:"))?.slice(5).trim();
            if (dataLine) {
              try {
                const event = JSON.parse(dataLine);
                lastEvent = event;
                const status = (event as Record<string, unknown>)["status"];
                if (status === "Succeeded" || String(status).toLowerCase() === "failed") break;
              } catch { /* ignore malformed */ }
            }
          }
        }

        return ok(lastEvent ?? { transcriptionId, status: "unknown" });
      } catch (e) { return translateError(e); }
    },
  );

  // ── TTS ─────────────────────────────────────────────────────────────────────
  server.tool(
    "vocametrix_synthesize_speech",
    "Synthesize speech from text using Azure neural text-to-speech. " +
    "Returns an audio URL and word-level timing data. " +
    "Supports all Azure Neural voice names for the requested locale.",
    {
      text: z.string().min(1).max(1000).describe("Text to synthesize (max 1000 characters)"),
      speakerLocale: locale,
      voiceName: z.string().optional().describe('Azure Neural voice name, e.g. "en-US-JennyNeural"'),
    },
    async ({ text, speakerLocale, voiceName }) => {
      try {
        const body: Record<string, string> = { text, locale: speakerLocale };
        if (voiceName) body["voiceName"] = voiceName;
        const result = await client.post("/api/text-to-speech", body);
        return ok(result);
      } catch (e) { return translateError(e); }
    },
  );

  // ── TTS with timing ──────────────────────────────────────────────────────────
  server.tool(
    "vocametrix_synthesize_speech_with_timing",
    "Synthesize speech via ElevenLabs v2 with per-character timing alignment. " +
    "Returns audio data and a character-level timing map — useful for lip-sync, subtitles, and karaoke. " +
    "Supports plain text or SSML markup.",
    {
      text: z.string().min(1).max(2500).describe("Text or SSML to synthesize (max 2500 characters)"),
      isSSML: z.boolean().optional().default(false).describe("Set true if input is SSML markup"),
    },
    async ({ text, isSSML }) => {
      try {
        const result = await client.post("/api/text-to-speech-with-timing", { text, isSSML });
        return ok(result);
      } catch (e) { return translateError(e); }
    },
  );
}
