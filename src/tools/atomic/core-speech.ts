import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { ApiClient } from "../../client.js";
import { translateError } from "../../errors.js";
import { ok, READONLY_TOOL, GENERIC_OUTPUT_SCHEMA } from "../../utils/mcp.js";
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
    READONLY_TOOL,
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
  ).update({ outputSchema: GENERIC_OUTPUT_SCHEMA });

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
    READONLY_TOOL,
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
  ).update({ outputSchema: GENERIC_OUTPUT_SCHEMA });

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
    READONLY_TOOL,
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
  ).update({ outputSchema: GENERIC_OUTPUT_SCHEMA });

  // ── TTS ─────────────────────────────────────────────────────────────────────
  server.tool(
    "vocametrix_synthesize_speech",
    "Synthesize speech from text using Azure neural text-to-speech. " +
    "Returns filePath (saved WAV file) and dataUrl (data URI for immediate audio playback). " +
    "Use dataUrl as the src of an HTML audio element to let the user play the audio. " +
    "Supports all Azure Neural voice names for the requested locale. " +
    "BEFORE CALLING: Detect the language of the text. Set speakerLocale to the matching BCP-47 code " +
    "(e.g. 'es-ES' for Spanish, 'fr-FR' for French, 'de-DE' for German) and set voiceName to a " +
    "natural neural voice for that locale (e.g. 'es-ES-ElviraNeural', 'fr-FR-DeniseNeural', " +
    "'de-DE-KatjaNeural'). Do not leave speakerLocale as en-US when the text is not English.",
    {
      text: z.string().min(1).max(1000).describe("Text to synthesize (max 1000 characters)"),
      speakerLocale: locale,
      voiceName: z.string().optional().describe('Azure Neural voice name, e.g. "fr-FR-DeniseNeural", "en-US-JennyNeural"'),
    },
    READONLY_TOOL,
    async ({ text, speakerLocale, voiceName }) => {
      try {
        const body: Record<string, string> = { text, language: speakerLocale };
        if (voiceName) body["voice"] = voiceName;
        const result = await client.post("/api/text-to-speech", body) as Record<string, unknown>;
        const audioBase64 = result["audio"] as string | undefined;
        if (!audioBase64) return ok(result);
        const format = (result["format"] as string | undefined) ?? "wav";
        const filePath = join(tmpdir(), `vocametrix-tts-${randomUUID()}.${format}`);
        writeFileSync(filePath, Buffer.from(audioBase64, "base64"));
        const mimeType = format === "mp3" ? "audio/mpeg" : "audio/wav";
        const dataUrl = `data:${mimeType};base64,${audioBase64}`;
        return ok({ filePath, dataUrl, format, voice: result["voice"], textLength: result["textLength"] });
      } catch (e) { return translateError(e); }
    },
  ).update({ outputSchema: GENERIC_OUTPUT_SCHEMA });

}
