# MCP Tool Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a recording-guide MCP resource and enrich all tool descriptions with `BEFORE CALLING:` instructions so Claude always educates users about the correct recording type before calling voice analysis tools.

**Architecture:** Static MCP resource centralises recording-type knowledge. Tool descriptions carry `BEFORE CALLING:` blocks that reference the resource and instruct Claude to verify inputs. Two tools (AVQI, ABI) also get schema changes — AVQI gets a required `language` param, CS becomes required, and the `version` param is removed (derived internally from language).

**Tech Stack:** TypeScript 5, `@modelcontextprotocol/sdk` ^1.29, Zod ^3.23. No test framework installed — verification is `npm run typecheck` + `npm run build`.

**Spec:** `docs/superpowers/specs/2026-05-12-mcp-tool-guidance-design.md`

---

## File Map

| File | Change |
|---|---|
| `src/resources.ts` | Add `vocametrix://recording-guide` static resource inside existing `registerResources()` |
| `src/tools/atomic/voice-quality.ts` | AVQI: schema (language required, CS required, drop version) + description. CPP, HNR, Jitter/Shimmer, DSI: description only |
| `src/tools/atomic/advanced-voice.ts` | ABI: add language + description. Spectral, Formants, GNE, H1-H2, Voice Dynamics, S/Z, VRP, Prosody: description only |
| `src/tools/atomic/audio-measures.ts` | eGeMAPS, Stuttering: description only |

---

## Task 1: Add `vocametrix://recording-guide` resource

**Files:**
- Modify: `src/resources.ts` (add after the `api-docs` resource registration, before the closing brace of `registerResources`)

- [ ] **Step 1: Add the RECORDING_GUIDE constant and register the resource**

In `src/resources.ts`, add the constant after the closing `};` of the `THRESHOLDS` object (around line 155) and register it inside `registerResources()`:

```typescript
// Add this constant after THRESHOLDS (before API_DOCS):
const RECORDING_GUIDE = `# Vocametrix Recording Guide

This guide defines the audio recording types required by Vocametrix voice analysis tools.
Always ensure the user has the correct recording type before calling a tool.

---

## Sustained Vowel (SV)

Say the vowel /a/ continuously at comfortable pitch and volume.
- No pitch slides or glides
- No background noise, coughing, or breathing artefacts
- Minimum duration: 3 seconds
- Required duration: 5+ seconds for AVQI and ABI

Used by: AVQI, ABI, DSI, CPP, HNR, Jitter/Shimmer, Spectral, Formants, GNE, H1-H2,
         Voice Dynamics, eGeMAPS

---

## Connected Speech (CS)

The patient reads a language-specific reference sentence aloud at a natural pace.
This is a phonetically balanced clinical sentence — spontaneous or free speech is NOT valid.
Minimum duration: 3 seconds of actual speech.

Used by: AVQI (required), ABI (required)

| Language | Code | Reference sentence |
|---|---|---|
| English | en | "When the sunlight strikes raindrops in the air, they act like a prism and form a rainbow." |
| French  | fr | "Quand Renée périt, un chat esseulé grogna fort. À cet instant, Vic sortit contempler le jour naissant." |
| Dutch   | nl | "De noordenwind en de zon waren erover aan het redetwisten wie de sterkste was van hen beiden." |
| Spanish | es | "Carmen tiene dos libros grandes. Elena toma doce platos nuevos. Teresa hace siete regalos pequeños." |
| German  | de | "Der Nordwind und die Sonne stritten sich einmal, wer von ihnen beiden wohl der Stärkere wäre, als ein Wanderer, der in einen warmen Mantel gehüllt war, des Weges daherkam." |
| Italian | it | "Si bisticciavano un giorno il vento della tramontana e il sole, l'uno pretendendo d'esser più forte dell'altro." |

---

## Glissando

Slide continuously from the lowest to the highest comfortable pitch on any vowel, without stopping.
Duration: 5–10 seconds.

Used by: Voice Range Profile (VRP / Ambitus)

---

## Sustained /s/ and /z/

Two SEPARATE recordings:
1. Sustained /s/ — voiceless hissing sound (like a snake), 3–5 seconds
2. Sustained /z/ — voiced buzzing sound (like a bee), 3–5 seconds

Used by: S/Z Ratio
`;
```

Then inside `registerResources()`, add after the existing `api-docs` resource:

```typescript
  // Recording guide resource
  server.resource(
    "recording-guide",
    "vocametrix://recording-guide",
    { description: "Recording protocols for all Vocametrix voice analysis tools: sustained vowel, connected speech (with language-specific sentences), glissando, and S/Z recordings" },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        mimeType: "text/plain",
        text: RECORDING_GUIDE,
      }],
    }),
  );
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Verify build succeeds**

```bash
npm run build
```

Expected: compiles to `dist/` with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/resources.ts
git commit -m "feat: add vocametrix://recording-guide MCP resource"
```

---

## Task 2: Fix AVQI schema — language required, CS required, version derived internally

**Files:**
- Modify: `src/tools/atomic/voice-quality.ts` (lines 9–31)

- [ ] **Step 1: Add the version-lookup map and rewrite the AVQI tool registration**

Replace the entire AVQI block (from `// ── AVQI` through the closing `);` of that tool) with:

```typescript
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
        const version = AVQI_VERSION[language];
        const result = await client.get("/api/calculate-avqi", {
          svFileId: svId,
          csFileId: csId,
          version,
        });
        return ok(result);
      } catch (e) { return translateError(e); }
    },
  );
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run typecheck
```

Expected: no errors. If you see "version is possibly undefined", the `AVQI_VERSION` map covers all 6 enum values so TypeScript should be satisfied — if not, add `?? "v03.01"` as fallback: `const version = AVQI_VERSION[language] ?? "v03.01";`

- [ ] **Step 3: Commit**

```bash
git add src/tools/atomic/voice-quality.ts
git commit -m "fix: AVQI requires language + CS, version derived internally"
```

---

## Task 3: Add language to ABI and add BEFORE CALLING to AVQI + ABI descriptions

> AVQI description was already updated in Task 2. This task covers ABI only.

**Files:**
- Modify: `src/tools/atomic/advanced-voice.ts` (lines 132–153)

- [ ] **Step 1: Replace the ABI tool registration**

Replace the entire ABI block (from `// ── ABI` through its closing `);`) with:

```typescript
  // ── ABI ─────────────────────────────────────────────────────────────────────
  server.tool(
    "vocametrix_calculate_abi",
    "Calculate the Acoustic Breathiness Index (ABI) combining connected speech and sustained vowel. " +
    "ABI aggregates CPPS, jitter, GNE approximation, HNR (6 kHz), H1-H2, shimmer, and period SD. " +
    "Sensitive to the full spectrum from breathy to pressed phonation. " +
    "BEFORE CALLING: (1) Ask for or infer the patient language (en/fr/nl/es/de/it). " +
    "(2) Show the user the correct connected speech sentence for that language " +
    "(read vocametrix://recording-guide to get it) and ask them to record it. " +
    "(3) Confirm they also have a sustained /a/ vowel recording of 5+ s. " +
    "Only call once both recordings are confirmed ready.",
    {
      connectedSpeechPath: audioPath.describe("Connected speech WAV file — patient reads the language-specific reference sentence (see vocametrix://recording-guide)"),
      sustainedVowelPath: audioPath.describe("Sustained vowel /a/ WAV file (5+ s)"),
      language: z.enum(["en", "fr", "nl", "es", "de", "it"]).describe("Patient language — determines the correct connected speech reference sentence"),
    },
    async ({ connectedSpeechPath, sustainedVowelPath }) => {
      try {
        const csId = await client.uploadFileId(connectedSpeechPath);
        const svId = await client.uploadFileId(sustainedVowelPath);
        const result = await client.get("/api/calculate-abi", {
          csFileId: csId,
          svFileId: svId,
        });
        return ok(result);
      } catch (e) { return translateError(e); }
    },
  );
```

Note: `language` is destructured but not used in the handler body — it exists solely as LLM guidance. TypeScript will warn about unused destructuring. Add `language: _language` or use `{ connectedSpeechPath, sustainedVowelPath, language: _language }` to silence it cleanly:

```typescript
    async ({ connectedSpeechPath, sustainedVowelPath, language: _language }) => {
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/tools/atomic/advanced-voice.ts
git commit -m "fix: ABI requires language param for CS sentence guidance"
```

---

## Task 4: Add BEFORE CALLING to 10 SV-only tools

Tools in this task: `calculate_cpp`, `calculate_hnr`, `calculate_jitter_shimmer`, `calculate_dsi` (in `voice-quality.ts`), `calculate_spectral`, `calculate_formants`, `calculate_gne`, `calculate_h1_h2`, `calculate_voice_dynamics` (in `advanced-voice.ts`), `extract_egemaps` (in `audio-measures.ts`).

The change for each is identical: append the SV `BEFORE CALLING:` block to the existing description string. Only the description string changes — no schema or handler changes.

**Standard suffix to append to each tool's description:**

```
" BEFORE CALLING: Confirm the user has a sustained vowel recording " +
"(/a/ held at comfortable pitch for 3+ s, minimal background noise). " +
"If not, explain what it is and ask them to record one. " +
"Do not pass connected speech or conversational audio."
```

- [ ] **Step 1: Update `src/tools/atomic/voice-quality.ts` — CPP, HNR, Jitter/Shimmer, DSI**

**CPP** — find the description string starting with `"Calculate Cepstral Peak Prominence"` and append:
```typescript
    "Calculate Cepstral Peak Prominence (CPP) from a sustained vowel. " +
    "Higher CPP = better voice quality. Typical normal CPP: 20–28 dB. " +
    "Clinically sensitive to breathiness and hoarseness. " +
    "BEFORE CALLING: Confirm the user has a sustained vowel recording " +
    "(/a/ held at comfortable pitch for 3+ s, minimal background noise). " +
    "If not, explain what it is and ask them to record one. " +
    "Do not pass connected speech or conversational audio.",
```

**HNR** — find the description string starting with `"Calculate multi-band Harmonics-to-Noise Ratio"` and append:
```typescript
    "Calculate multi-band Harmonics-to-Noise Ratio (HNR) across frequency bands (80–8000 Hz) " +
    "with age- and gender-specific norms. Higher HNR = cleaner voice. " +
    "Normal HNR (500 Hz band): > 20 dB. Requires a sustained vowel. " +
    "BEFORE CALLING: Confirm the user has a sustained vowel recording " +
    "(/a/ held at comfortable pitch for 3+ s, minimal background noise). " +
    "If not, explain what it is and ask them to record one. " +
    "Do not pass connected speech or conversational audio.",
```

**Jitter/Shimmer** — find the description starting with `"Calculate jitter"` and append:
```typescript
    "Calculate jitter (period perturbation, PPQ5) and shimmer (amplitude perturbation) from a sustained vowel. " +
    "Normal jitter < 1.04%; normal shimmer < 3.81 dB. " +
    "Elevated values indicate irregular vibration — associated with dysphonia. " +
    "BEFORE CALLING: Confirm the user has a sustained vowel recording " +
    "(/a/ held at comfortable pitch for 3+ s, minimal background noise). " +
    "If not, explain what it is and ask them to record one. " +
    "Do not pass connected speech or conversational audio.",
```

**DSI** — find the description starting with `"Calculate the Dysphonia Severity Index"` and append:
```typescript
    "Calculate the Dysphonia Severity Index (DSI). " +
    "DSI > 1.6 = normal voice; DSI < –1.6 = severe dysphonia. " +
    "Requires a sustained vowel WAV file plus voice-range parameters (MPT, F0 range, minimum intensity). " +
    "BEFORE CALLING: Confirm the user has a sustained vowel recording " +
    "(/a/ held at comfortable pitch for 3+ s, minimal background noise). " +
    "If not, explain what it is and ask them to record one. " +
    "Do not pass connected speech or conversational audio.",
```

- [ ] **Step 2: Update `src/tools/atomic/advanced-voice.ts` — Spectral, Formants, GNE, H1-H2, Voice Dynamics**

**Spectral** — append to existing description:
```typescript
    "Extract advanced spectral measures from a sustained vowel: center of gravity, skewness/kurtosis, " +
    "H1-H2 (breathiness indicator), H1-A1, H1-A3, LTAS slope and tilt, alpha ratio. " +
    "Returns age/gender-normalized norms and voice pattern classification. " +
    "BEFORE CALLING: Confirm the user has a sustained vowel recording " +
    "(/a/ held at comfortable pitch for 3+ s, minimal background noise). " +
    "If not, explain what it is and ask them to record one. " +
    "Do not pass connected speech or conversational audio.",
```

**Formants** — append to existing description:
```typescript
    "Compute F1–F4 formant statistics (mean, SD, range, CV, IQR) from a sustained vowel " +
    "with vowel-space stability and articulatory precision scores. " +
    "Useful for dysarthria assessment, vowel space analysis, and cleft palate evaluation. " +
    "BEFORE CALLING: Confirm the user has a sustained vowel recording " +
    "(/a/ held at comfortable pitch for 3+ s, minimal background noise). " +
    "If not, explain what it is and ask them to record one. " +
    "Do not pass connected speech or conversational audio.",
```

**GNE** — append to existing description:
```typescript
    "Calculate the Glottal-to-Noise Excitation (GNE) ratio from a sustained vowel. " +
    "GNE ranges 0–1; values < 0.5 suggest increased noise (breathiness/hoarseness). " +
    "Computed via native Praat algorithm for clinical reliability. " +
    "BEFORE CALLING: Confirm the user has a sustained vowel recording " +
    "(/a/ held at comfortable pitch for 3+ s, minimal background noise). " +
    "If not, explain what it is and ask them to record one. " +
    "Do not pass connected speech or conversational audio.",
```

**H1-H2** — append to existing description:
```typescript
    "Calculate the formant-corrected H1*–H2* voice source measure from a sustained vowel. " +
    "H1*–H2* is sensitive to breathiness: positive values indicate breathy voice, " +
    "negative values indicate pressed/tense voice. Normal range: −2 to +2 dB. " +
    "BEFORE CALLING: Confirm the user has a sustained vowel recording " +
    "(/a/ held at comfortable pitch for 3+ s, minimal background noise). " +
    "If not, explain what it is and ask them to record one. " +
    "Do not pass connected speech or conversational audio.",
```

**Voice Dynamics** — append to existing description:
```typescript
    "Compute intensity dynamics, pitch-intensity correlation, and composite scores for " +
    "voice control, projection, stability, effort, and monotonicity. " +
    "Useful for voice training, public speaking coaching, and vocal fatigue assessment. " +
    "BEFORE CALLING: Confirm the user has a sustained vowel recording " +
    "(/a/ held at comfortable pitch for 3+ s, minimal background noise). " +
    "If not, explain what it is and ask them to record one. " +
    "Do not pass connected speech or conversational audio.",
```

- [ ] **Step 3: Update `src/tools/atomic/audio-measures.ts` — eGeMAPS**

The `extract_egemaps` tool currently accepts a generic `audioPath` parameter but the API endpoint uses `svFileId`, indicating the algorithm expects a sustained vowel. Clarify in the description:

```typescript
    "Extract the full openSMILE eGeMAPSv02 feature set (88 acoustic features) from a sustained vowel. " +
    "Features include F0, jitter, shimmer, HNR, MFCCs, formants, spectral flux, and loudness. " +
    "Commonly used as input to machine-learning voice pathology classifiers. " +
    "BEFORE CALLING: Confirm the user has a sustained vowel recording " +
    "(/a/ held at comfortable pitch for 3+ s, minimal background noise). " +
    "If not, explain what it is and ask them to record one. " +
    "Do not pass connected speech or conversational audio.",
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npm run typecheck
```

Expected: no errors. These are description-only string changes — no type issues expected.

- [ ] **Step 5: Commit**

```bash
git add src/tools/atomic/voice-quality.ts src/tools/atomic/advanced-voice.ts src/tools/atomic/audio-measures.ts
git commit -m "feat: add BEFORE CALLING guidance to all SV-only tools"
```

---

## Task 5: Add BEFORE CALLING to special-pattern tools (S/Z, VRP, Prosody, Stuttering)

**Files:**
- Modify: `src/tools/atomic/advanced-voice.ts` — S/Z Ratio, VRP, Prosody Similarity
- Modify: `src/tools/atomic/audio-measures.ts` — Stuttering Classification

- [ ] **Step 1: Update S/Z Ratio description in `src/tools/atomic/advanced-voice.ts`**

```typescript
    "Calculate the S/Z phonation ratio (duration of sustained /s/ vs /z/). " +
    "Normal ratio ≈ 1.0. Ratio > 1.4 suggests vocal fold pathology (the /z/ is shorter). " +
    "Requires two separate recordings: one of sustained /s/ and one of sustained /z/. " +
    "BEFORE CALLING: Confirm the user has TWO separate recordings — " +
    "one of sustained /s/ (voiceless hiss, like a snake) and one of /z/ (voiced buzz, like a bee), " +
    "each 3–5 s. If not, explain the difference between them and ask the user to record both.",
```

- [ ] **Step 2: Update VRP description in `src/tools/atomic/advanced-voice.ts`**

```typescript
    "Calculate the Voice Range Profile (VRP / ambitus / glissando) from a glissando recording. " +
    "Returns frequency range (lowest to highest pitch) and intensity range with age/gender interpretation. " +
    "Useful for singers and voice rehabilitation assessment. " +
    "BEFORE CALLING: Confirm the user has a glissando recording — a continuous pitch sweep " +
    "from their lowest to highest comfortable pitch on any vowel, without stopping (5–10 s). " +
    "If not, explain what a glissando is and ask them to record one.",
```

- [ ] **Step 3: Update Prosody Similarity description in `src/tools/atomic/advanced-voice.ts`**

```typescript
    "Compare prosodic patterns between a model (reference) recording and a learner recording. " +
    "Returns similarity scores for pitch contour, intensity, duration, and pause patterns. " +
    "Useful for accent coaching, speech imitation training, and L2 pronunciation. " +
    "BEFORE CALLING: Confirm the user has TWO recordings — a model (reference/teacher) " +
    "recording and a learner recording of the same passage, both as natural speech WAV files. " +
    "If not, ask the user to provide or record both before proceeding.",
```

- [ ] **Step 4: Update Stuttering Classification description in `src/tools/atomic/audio-measures.ts`**

```typescript
    "Classify stuttering disfluency patterns in a speech recording (async, ~30–120 seconds). " +
    "Returns disfluency types (repetitions, prolongations, blocks), severity score, and fluency rate. " +
    "The tool polls the result automatically — no separate status call needed. " +
    "BEFORE CALLING: Confirm the user has a natural connected speech recording " +
    "(the patient speaking spontaneously or reading aloud). " +
    "A sustained vowel is not appropriate here — the recording must contain running speech.",
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Build final artifact**

```bash
npm run build
```

Expected: `dist/server.js` produced with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/tools/atomic/advanced-voice.ts src/tools/atomic/audio-measures.ts
git commit -m "feat: add BEFORE CALLING guidance to S/Z, VRP, prosody, stuttering tools"
```

---

## Self-Review Checklist

- [x] **Spec §1 (recording guide resource)** → Task 1 ✓
- [x] **Spec §2 AVQI (language, CS required, drop version)** → Task 2 ✓
- [x] **Spec §2 ABI (add language)** → Task 3 ✓
- [x] **Spec §3 standard SV pattern — 10 tools** → Task 4 (CPP, HNR, Jitter/Shimmer, DSI, Spectral, Formants, GNE, H1-H2, Voice Dynamics, eGeMAPS) ✓
- [x] **Spec §3 S/Z pattern** → Task 5 ✓
- [x] **Spec §3 VRP pattern** → Task 5 ✓
- [x] **Spec §3 Prosody Similarity pattern** → Task 5 ✓
- [x] **Spec §3 Stuttering pattern** → Task 5 ✓
- [x] **No placeholders, no TBDs** ✓
- [x] **TypeScript verification at every task** ✓
- [x] **`language` unused destructuring in ABI handler addressed** (use `_language`) ✓
