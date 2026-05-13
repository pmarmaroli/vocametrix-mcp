import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ApiClient } from "../client.js";
import { registerUploadTool } from "./atomic/upload.js";
import { registerVoiceQualityTools } from "./atomic/voice-quality.js";
import { registerAdvancedVoiceTools } from "./atomic/advanced-voice.js";
import { registerCoreSpeechTools } from "./atomic/core-speech.js";
import { registerAudioMeasureTools } from "./atomic/audio-measures.js";
import { registerAiAgentTools } from "./atomic/ai-agents.js";
import { registerTherapyTools } from "./atomic/therapy.js";
import { registerFullVoiceAssessment } from "./workflows/full-voice-assessment.js";
import { registerBatchPronunciation } from "./workflows/batch-pronunciation.js";
import { registerFullTherapyWorkflow } from "./workflows/full-therapy-workflow.js";

export function registerAllTools(server: McpServer, client: ApiClient): void {
  registerUploadTool(server, client);
  registerVoiceQualityTools(server, client);
  registerAdvancedVoiceTools(server, client);
  registerCoreSpeechTools(server, client);
  registerAudioMeasureTools(server, client);
  registerAiAgentTools(server, client);
  registerTherapyTools(server, client);
  registerFullVoiceAssessment(server, client);
  registerBatchPronunciation(server, client);
  registerFullTherapyWorkflow(server, client);
}
