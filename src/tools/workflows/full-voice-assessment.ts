import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ApiClient } from "../../client.js";
import { translateError } from "../../errors.js";
import { age, gender } from "../../schemas/common.js";

export function registerFullVoiceAssessment(server: McpServer, client: ApiClient): void {
  server.tool(
    "vocametrix_full_voice_assessment",
    "Run a comprehensive clinical voice assessment in a single call. " +
    "Executes AVQI, CPP, multi-band HNR, jitter/shimmer, and spectral analysis in parallel, " +
    "then returns a unified JSON report with all metrics and clinical severity interpretation. " +
    "Requires both a sustained vowel recording (e.g. /a/ held 3+ s) and a connected speech recording. " +
    "This is the tool an SLP would use for a full voice quality screening.",
    {
      sustainedVowelPath: z.string().describe("Absolute path to sustained vowel WAV (e.g. /a/ held 3+ seconds)"),
      connectedSpeechPath: z.string().describe("Absolute path to connected speech WAV (patient reading a passage)"),
      patientAge: age,
      patientGender: gender,
    },
    async ({ sustainedVowelPath, connectedSpeechPath, patientAge, patientGender }) => {
      try {
        // Upload both files (shared across multiple endpoints)
        const [svId, csId] = await Promise.all([
          client.uploadFileId(sustainedVowelPath),
          client.uploadFileId(connectedSpeechPath),
        ]);

        const ageStr = String(patientAge);
        const g = patientGender;

        // Run all analyses in parallel
        const [avqi, cpp, hnr, jitterShimmer, spectral] = await Promise.all([
          client.get("/api/calculate-avqi", { svFileId: svId, csFileId: csId, version: "v03.01" }),
          client.get("/api/calculate-cpp", { svFileId: svId }),
          client.get("/api/calculate-hnr-multiband", { svFileId: svId, age: ageStr, gender: g }),
          client.get("/api/jitter-shimmer", { svFileId: svId }),
          client.get("/api/calculate-spectral-advanced", { svFileId: svId, age: ageStr, gender: g }),
        ]);

        const report = {
          summary: "Full Voice Assessment Report",
          patient: { age: patientAge, gender: patientGender },
          avqi,
          cpp,
          hnr,
          jitterShimmer,
          spectral,
        };

        return { content: [{ type: "text" as const, text: JSON.stringify(report, null, 2) }] };
      } catch (e) { return translateError(e); }
    },
  );
}
