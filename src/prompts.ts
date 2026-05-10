import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer): void {
  // ── Interpret Voice Assessment ───────────────────────────────────────────────
  server.prompt(
    "interpret_voice_assessment",
    "Generate a clinical SLP-style interpretation of voice assessment results. " +
    "Provide the JSON output from vocametrix_full_voice_assessment or individual metric tools.",
    {
      assessment_json: z.string().describe("JSON output from vocametrix_full_voice_assessment or individual metric tools"),
      patient_context: z.string().optional().describe("Optional: patient age, gender, diagnosis, chief complaint"),
      report_language: z.string().optional().default("English").describe("Language for the report"),
    },
    ({ assessment_json, patient_context, report_language }) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `You are an expert speech-language pathologist with specialization in voice disorders.
Interpret the following voice assessment results in clinical language.

${patient_context ? `## Patient Context\n${patient_context}\n` : ""}

## Assessment Data
\`\`\`json
${assessment_json}
\`\`\`

## Instructions
Write a clinical interpretation report in ${report_language ?? "English"} that includes:
1. **Summary**: One paragraph with the overall voice quality status
2. **Key Findings**: Each metric with its value, normal range, and clinical significance
3. **Severity Classification**: Overall dysphonia severity (normal / mild / moderate / severe)
4. **Clinical Implications**: What the pattern suggests (e.g. breathiness, pressed phonation, vocal fatigue)
5. **Recommendations**: Suggested next steps (further assessment, voice therapy approach, referral)

Use validated thresholds. Be specific about which values are outside normal ranges and by how much.
Avoid jargon without explanation. The report should be readable by both clinicians and informed patients.`,
        },
      }],
    }),
  );

  // ── Compare Pre/Post Therapy ─────────────────────────────────────────────────
  server.prompt(
    "compare_pre_post_therapy",
    "Generate a narrative comparison between two voice assessments (pre- and post-therapy). " +
    "Quantifies improvement and interprets clinical significance.",
    {
      pre_assessment_json: z.string().describe("JSON from assessment before therapy"),
      post_assessment_json: z.string().describe("JSON from assessment after therapy"),
      therapy_duration: z.string().optional().describe("Duration of therapy (e.g. '8 weeks, 2 sessions/week')"),
      therapy_type: z.string().optional().describe("Type of therapy (e.g. 'resonance therapy', 'vocal hygiene + LSVT')"),
    },
    ({ pre_assessment_json, post_assessment_json, therapy_duration, therapy_type }) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `You are an expert speech-language pathologist. Compare these two voice assessments and narrate the therapy outcome.

## Pre-therapy Assessment
\`\`\`json
${pre_assessment_json}
\`\`\`

## Post-therapy Assessment
\`\`\`json
${post_assessment_json}
\`\`\`

${therapy_duration ? `## Therapy Duration\n${therapy_duration}\n` : ""}
${therapy_type ? `## Therapy Type\n${therapy_type}\n` : ""}

## Instructions
Write a therapy outcome report that includes:
1. **Overall Progress**: Was therapy effective? What changed most?
2. **Metric-by-Metric Comparison**: Table showing pre vs post values with % change and clinical significance
3. **Clinically Significant Changes**: Which improvements cross validated treatment thresholds?
4. **Remaining Concerns**: Which metrics are still outside normal ranges?
5. **Recommendations**: Continue current approach / modify therapy / discharge criteria met?

Be quantitative. Highlight changes that are clinically meaningful (not just statistically different).
Note if any metrics worsened and what that might indicate.`,
        },
      }],
    }),
  );

  // ── Generate Session Report ──────────────────────────────────────────────────
  server.prompt(
    "generate_session_report",
    "Generate a structured therapy session report from pronunciation assessment data. " +
    "Suitable for clinical documentation and patient progress notes.",
    {
      pronunciation_json: z.string().describe("JSON from vocametrix_assess_pronunciation"),
      patient_name: z.string().optional().describe("Patient name or ID"),
      session_number: z.string().optional().describe("Session number (e.g. 'Session 3 of 10')"),
      target_text: z.string().optional().describe("The reference text that was read"),
    },
    ({ pronunciation_json, patient_name, session_number, target_text }) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Generate a structured therapy session report for clinical documentation.

${patient_name ? `Patient: ${patient_name}` : ""}
${session_number ? `Session: ${session_number}` : ""}
${target_text ? `Target text: "${target_text}"` : ""}

## Pronunciation Assessment Data
\`\`\`json
${pronunciation_json}
\`\`\`

Write a SOAP-format progress note (Subjective, Objective, Assessment, Plan) including:
- O: Objective scores (accuracy, fluency, completeness, prosody) with interpretation
- Word-level errors: which words had the lowest accuracy and why (phoneme breakdown)
- A: Clinical assessment of the session performance
- P: Targets for next session based on weakest phonemes
Keep it concise (< 300 words). Use standard clinical abbreviations.`,
        },
      }],
    }),
  );
}
