import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ApiClient } from "../../client.js";
import { translateError } from "../../errors.js";
import { ok } from "../../utils/mcp.js";
import { audioPath, gender, age } from "../../schemas/common.js";

export function registerVoiceQualityTools(server: McpServer, client: ApiClient): void {
  // ── AVQI ────────────────────────────────────────────────────────────────────
  const AVQI_VERSION: Record<string, "v02.03" | "v03.01"> = {
    en: "v02.03", nl: "v02.03", de: "v02.03",
    fr: "v03.01", es: "v03.01", it: "v03.01",
  };

  server.tool(
    "vocametrix_calculate_avqi",
    "Calculate the Acoustic Voice Quality Index (AVQI), a clinically validated dysphonia score. " +
    "AVQI combines acoustic parameters from a sustained vowel AND connected speech (concatenated). " +
    "AVQI version is chosen automatically from the patient language (en/nl/de → v02.03; fr/es/it → v03.01). " +
    "Dysphonia thresholds: > 2.43 (French/Dutch) / > 2.97 (English). " +
    "BEFORE CALLING: (1) Ask for or infer the patient language (en/fr/nl/es/de/it). " +
    "(2) Show the user the correct connected speech sentence for that language " +
    "(read vocametrix://recording-guide to get it) and ask them to record it. " +
    "(3) Confirm they also have a sustained /a/ vowel recording of 5+ s. " +
    "Only call once both recordings are confirmed ready.",
    {
      sustainedVowelPath: audioPath.describe("Sustained vowel WAV file (/a/ held 5+ s)"),
      connectedSpeechPath: audioPath.describe("Connected speech WAV file — patient reads the language-specific reference sentence (see vocametrix://recording-guide)"),
      language: z.enum(["en", "fr", "nl", "es", "de", "it"]).describe("Patient language — determines AVQI version and the reference sentence for connected speech"),
    },
    async ({ sustainedVowelPath, connectedSpeechPath, language }) => {
      try {
        const svId = await client.uploadFileId(sustainedVowelPath);
        const csId = await client.uploadFileId(connectedSpeechPath);
        const version = AVQI_VERSION[language] ?? "v03.01";
        const result = await client.get("/api/calculate-avqi", {
          svFileId: svId,
          csFileId: csId,
          version,
        });
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
