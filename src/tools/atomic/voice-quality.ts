import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ApiClient } from "../../client.js";
import { translateError } from "../../errors.js";
import { ok } from "../../utils/mcp.js";
import { audioPath, gender, age } from "../../schemas/common.js";

export function registerVoiceQualityTools(server: McpServer, client: ApiClient): void {
  // ── AVQI ────────────────────────────────────────────────────────────────────
  server.tool(
    "vocametrix_calculate_avqi",
    "Calculate the Acoustic Voice Quality Index (AVQI v2.03 or v3.01), a clinically validated dysphonia score. " +
    "AVQI > 2.43 (French) / 2.97 (English) indicates dysphonia. " +
    "Requires a sustained vowel recording (e.g. /a/ held for 3+ seconds). " +
    "Connected speech is optional but improves accuracy.",
    {
      sustainedVowelPath: audioPath.describe("Sustained vowel WAV file (e.g. /a/ held 3+ s)"),
      connectedSpeechPath: audioPath.optional().describe("Connected speech WAV file (optional, improves AVQI accuracy)"),
      version: z.enum(["v02.03", "v03.01"]).default("v03.01").describe("AVQI algorithm version"),
    },
    async ({ sustainedVowelPath, connectedSpeechPath, version }) => {
      try {
        const svId = await client.uploadFileId(sustainedVowelPath);
        const params: Record<string, string> = { svFileId: svId, version };
        if (connectedSpeechPath) {
          params["csFileId"] = await client.uploadFileId(connectedSpeechPath);
        }
        const result = await client.get("/api/calculate-avqi", params);
        return ok(result);
      } catch (e) { return translateError(e); }
    },
  );

  // ── DSI ─────────────────────────────────────────────────────────────────────
  server.tool(
    "vocametrix_calculate_dsi",
    "Calculate the Dysphonia Severity Index (DSI). " +
    "DSI > 1.6 = normal voice; DSI < –1.6 = severe dysphonia. " +
    "Requires a sustained vowel WAV file plus voice-range parameters (MPT, F0 range, minimum intensity).",
    {
      sustainedVowelPath: audioPath.describe("Sustained vowel WAV file"),
      mpt: z.number().positive().describe("Maximum Phonation Time in seconds"),
      maximumF0: z.number().positive().describe("Highest fundamental frequency in Hz"),
      minimumIntensity: z.number().describe("Softest intensity in dB SPL"),
      patientAge: age,
      patientGender: gender,
      version: z.string().optional().default("v01"),
    },
    async ({ sustainedVowelPath, mpt, maximumF0, minimumIntensity, patientAge, patientGender, version }) => {
      try {
        const svId = await client.uploadFileId(sustainedVowelPath);
        const result = await client.get("/api/calculate-dsi", {
          svFileId: svId,
          mpt: String(mpt),
          maximumF0: String(maximumF0),
          minimumIntensity: String(minimumIntensity),
          age: String(patientAge),
          gender: patientGender,
          version: version ?? "v01",
        });
        return ok(result);
      } catch (e) { return translateError(e); }
    },
  );

  // ── CPP ─────────────────────────────────────────────────────────────────────
  server.tool(
    "vocametrix_calculate_cpp",
    "Calculate Cepstral Peak Prominence (CPP) from a sustained vowel. " +
    "Higher CPP = better voice quality. Typical normal CPP: 20–28 dB. " +
    "Clinically sensitive to breathiness and hoarseness.",
    {
      sustainedVowelPath: audioPath,
    },
    async ({ sustainedVowelPath }) => {
      try {
        const svId = await client.uploadFileId(sustainedVowelPath);
        const result = await client.get("/api/calculate-cpp", { svFileId: svId });
        return ok(result);
      } catch (e) { return translateError(e); }
    },
  );

  // ── HNR ─────────────────────────────────────────────────────────────────────
  server.tool(
    "vocametrix_calculate_hnr",
    "Calculate multi-band Harmonics-to-Noise Ratio (HNR) across frequency bands (80–8000 Hz) " +
    "with age- and gender-specific norms. Higher HNR = cleaner voice. " +
    "Normal HNR (500 Hz band): > 20 dB. Requires a sustained vowel.",
    {
      sustainedVowelPath: audioPath,
      patientAge: age,
      patientGender: gender,
    },
    async ({ sustainedVowelPath, patientAge, patientGender }) => {
      try {
        const svId = await client.uploadFileId(sustainedVowelPath);
        const result = await client.get("/api/calculate-hnr-multiband", {
          svFileId: svId,
          age: String(patientAge),
          gender: patientGender,
        });
        return ok(result);
      } catch (e) { return translateError(e); }
    },
  );

  // ── Jitter / Shimmer ────────────────────────────────────────────────────────
  server.tool(
    "vocametrix_calculate_jitter_shimmer",
    "Calculate jitter (period perturbation, PPQ5) and shimmer (amplitude perturbation) from a sustained vowel. " +
    "Normal jitter < 1.04%; normal shimmer < 3.81 dB. " +
    "Elevated values indicate irregular vibration — associated with dysphonia.",
    {
      sustainedVowelPath: audioPath,
    },
    async ({ sustainedVowelPath }) => {
      try {
        const svId = await client.uploadFileId(sustainedVowelPath);
        const result = await client.get("/api/jitter-shimmer", { svFileId: svId });
        return ok(result);
      } catch (e) { return translateError(e); }
    },
  );

  // ── VRP / Ambitus ────────────────────────────────────────────────────────────
  server.tool(
    "vocametrix_calculate_voice_range_profile",
    "Calculate the Voice Range Profile (VRP / ambitus / glissando) from a glissando recording. " +
    "Returns frequency range (lowest to highest pitch) and intensity range with age/gender interpretation. " +
    "Useful for singers and voice rehabilitation assessment.",
    {
      glissandoPath: audioPath.describe("Glissando (pitch sweep) WAV recording"),
      patientAge: age.default(30),
      patientGender: gender.default("1"),
    },
    async ({ glissandoPath, patientAge, patientGender }) => {
      try {
        const svId = await client.uploadFileId(glissandoPath);
        const result = await client.get("/api/calculate-ambitus", {
          svFileId: svId,
          age: String(patientAge),
          gender: patientGender,
        });
        return ok(result);
      } catch (e) { return translateError(e); }
    },
  );

  // ── Prosody Similarity ───────────────────────────────────────────────────────
  server.tool(
    "vocametrix_calculate_prosody_similarity",
    "Compare prosodic patterns between a model (reference) recording and a learner recording. " +
    "Returns similarity scores for pitch contour, intensity, duration, and pause patterns. " +
    "Useful for accent coaching, speech imitation training, and L2 pronunciation.",
    {
      modelPath: audioPath.describe("Model (reference/teacher) WAV recording"),
      learnerPath: audioPath.describe("Learner (student) WAV recording to compare"),
    },
    async ({ modelPath, learnerPath }) => {
      try {
        const modelId = await client.uploadFileId(modelPath);
        const learnerId = await client.uploadFileId(learnerPath);
        const result = await client.get("/api/calculate-prosody-similarity", {
          svFileId: modelId,
          csFileId: learnerId,
        });
        return ok(result);
      } catch (e) { return translateError(e); }
    },
  );
}
