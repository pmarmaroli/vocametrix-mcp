# MCP Tool Guidance Design
**Date:** 2026-05-12
**Status:** Approved

## Problem

MCP tool descriptions tell Claude *what* a tool does but not *how to verify the user has the right input*. A naive user saying "analyze my voice" could have Claude silently pass the wrong audio type (e.g. a conversation recording to `calculate_jitter_shimmer`) and receive garbage results — with no education about what recording is needed or how to produce it.

Two failure modes to fix:
1. Claude passes wrong audio type without questioning it
2. Claude doesn't explain to a non-expert what recording type is needed and how to produce it

## Approach: Descriptions + MCP Resource (Approach B)

- **MCP Resource** `vocametrix://recording-guide`: centralizes all recording-type knowledge in one place
- **`BEFORE CALLING:` blocks** in every tool description that requires a specific recording type: instructs Claude to verify and educate before calling
- **Schema changes** for AVQI and ABI: add required `language` parameter, fix scientifically incorrect optional CS field

Approach C (ML audio-type classifier → `vocametrix_check_recording_type`) deferred to future work — requires a new ML model and backend endpoint.

---

## Section 1: Recording Guide Resource

**URI:** `vocametrix://recording-guide`
**File:** `src/resources/recording-guide.ts`

Content covers four recording types used across the API:

### Sustained Vowel (SV)
Say /a/ continuously at comfortable pitch and volume. No pitch slides, no breathing noise, minimal background noise. Duration: minimum 3 s; 5+ s required for AVQI and ABI.

### Connected Speech (CS)
Read the language-specific reference sentence aloud at natural pace. Used only by AVQI and ABI. The sentence is phonetically balanced for clinical voice analysis — spontaneous or free speech is **not** a valid substitute.

| Language | Reference sentence |
|---|---|
| English (`en`) | "When the sunlight strikes raindrops in the air, they act like a prism and form a rainbow." |
| French (`fr`) | "Quand Renée périt, un chat esseulé grogna fort. À cet instant, Vic sortit contempler le jour naissant." |
| Dutch (`nl`) | "De noordenwind en de zon waren erover aan het redetwisten wie de sterkste was van hen beiden." |
| Spanish (`es`) | "Carmen tiene dos libros grandes. Elena toma doce platos nuevos. Teresa hace siete regalos pequeños." |
| German (`de`) | "Der Nordwind und die Sonne stritten sich einmal, wer von ihnen beiden wohl der Stärkere wäre, als ein Wanderer, der in einen warmen Mantel gehüllt war, des Weges daherkam." |
| Italian (`it`) | "Si bisticciavano un giorno il vento della tramontana e il sole, l'uno pretendendo d'esser più forte dell'altro." |

### Glissando
Slide continuously from lowest to highest comfortable pitch on any vowel, without stopping. Duration: 5–10 s. Used by Voice Range Profile only.

### Sustained /s/ and /z/
Two separate recordings — first the voiceless /s/ (hissing sound), then the voiced /z/ (buzzing sound). Duration: 3–5 s each. Used by S/Z Ratio only.

---

## Section 2: Schema Changes (AVQI and ABI)

### `vocametrix_calculate_avqi`

**Current issues:**
- `connectedSpeechPath` is optional — scientifically wrong. AVQI algorithm concatenates SV + CS before computing 6 acoustic parameters. CS is structurally required (Maryn et al.; Barsties & Maryn).
- `version` is user-exposed — should be derived from language. User has no way to know which version applies to their language.
- No `language` parameter — CS sentence and AVQI version both depend on language.

**Changes:**
- Add `language: z.enum(["en","fr","nl","es","de","it"])` — **required**
- Change `connectedSpeechPath` from `.optional()` to **required**
- Remove `version` from schema — derive internally: `en/nl/de → v02.03`, `fr/es/it → v03.01`

### `vocametrix_calculate_abi`

**Current issues:**
- No `language` parameter — CS sentence depends on language (same `LANGUAGE_SENTENCES` map as AVQI)

**Changes:**
- Add `language: z.enum(["en","fr","nl","es","de","it"])` — **required**
- `connectedSpeechPath` and `sustainedVowelPath` already required — no change

---

## Section 3: Description Enrichment Pattern

All tools that require a specific recording type get a `BEFORE CALLING:` block appended to their description. The block instructs Claude to:
1. Verify the user has the correct recording type
2. Explain what it is and how to produce it if the user doesn't know
3. For language-dependent tools: ask for or infer the patient's language, then show the correct CS sentence
4. Only call the tool once the user confirms they have the right recording

### Standard SV pattern (10 tools: `calculate_cpp`, `calculate_hnr`, `calculate_jitter_shimmer`, `calculate_dsi`, `calculate_spectral`, `calculate_formants`, `calculate_gne`, `calculate_h1_h2`, `calculate_voice_dynamics`, `extract_egemaps`)
```
BEFORE CALLING: Confirm the user has a sustained vowel recording (/a/ held at 
comfortable pitch for 3+ s, minimal background noise). If not, explain what it is 
and ask them to record one. Do not pass connected speech or conversational audio.
```

### Prosody Similarity pattern (`calculate_prosody_similarity`)
```
BEFORE CALLING: Confirm the user has TWO recordings — a model (reference/teacher) 
recording and a learner recording of the same passage, both as natural speech WAV files. 
If not, ask them to provide or record both before proceeding.
```

### Stuttering pattern (`classify_stuttering`)
```
BEFORE CALLING: Confirm the user has a natural connected speech recording (the patient 
speaking spontaneously or reading aloud). A sustained vowel is not appropriate here.
```

### AVQI / ABI pattern
```
BEFORE CALLING: (1) Ask for or infer the patient's language (en/fr/nl/es/de/it). 
(2) Show the user the correct connected speech sentence for that language 
(see vocametrix://recording-guide) and ask them to record it. (3) Confirm they also 
have a sustained /a/ vowel recording of 5+ s. Only call once both recordings are ready.
```

### S/Z Ratio pattern
```
BEFORE CALLING: Confirm the user has TWO separate recordings — one of sustained /s/ 
(voiceless hiss) and one of /z/ (voiced buzz), each 3–5 s. If not, explain the 
difference and ask them to record both before proceeding.
```

### Glissando pattern
```
BEFORE CALLING: Confirm the user has a glissando recording — a continuous pitch 
sweep from their lowest to highest comfortable pitch, 5–10 s. If not, explain 
what it is and ask them to record one.
```

---

## Section 4: File Change Map

| File | Type of change |
|---|---|
| `src/resources.ts` | **Modified** — add `vocametrix://recording-guide` static resource to existing `registerResources()` |
| `src/tools/atomic/voice-quality.ts` | **Modified** — AVQI schema (language, CS required, drop version) + description; CPP, HNR, Jitter/Shimmer, DSI descriptions |
| `src/tools/atomic/advanced-voice.ts` | **Modified** — ABI schema (add language) + description; Spectral, Formants, GNE, H1-H2, Voice Dynamics, S/Z, VRP, Prosody descriptions |
| `src/tools/atomic/audio-measures.ts` | **Modified** — eGeMAPS description (clarify SV required); Stuttering description (natural connected speech) |

**Not changed:** `core-speech.ts` (pronunciation, transcription, TTS — accept any audio or text), `ai-agents.ts` (no audio input), `therapy.ts`, workflow tools.

---

## Future Work

- **Approach C — Audio type validator**: Train an ML classifier to detect recording type (SV / CS / glissando / noise). Add `vocametrix_check_recording_type` tool. Tool descriptions reference it: "If unsure about audio type, call `vocametrix_check_recording_type` first." Requires new model + backend endpoint.
