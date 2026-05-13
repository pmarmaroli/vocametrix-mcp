import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ApiClient } from "../../client.js";
import { translateError } from "../../errors.js";
import { ok, READONLY_TOOL, GENERIC_OUTPUT_SCHEMA } from "../../utils/mcp.js";

export function registerUploadTool(server: McpServer, client: ApiClient): void {
  server.tool(
    "vocametrix_upload_audio",
    "Upload an audio file to Vocametrix cloud storage. " +
    "Call this tool FIRST whenever the user provides an audio file in the conversation. " +
    "Encode the file content as a base64 string and pass it here. " +
    "Returns a blobUrl and fileId — pass the blobUrl as the audioPath parameter in all subsequent Vocametrix tools.",
    {
      audioBase64: z.string().describe(
        "Base64-encoded audio file content (raw base64 or data URL format: data:audio/wav;base64,...). " +
        "Read the uploaded file and encode it to base64 before calling this tool."
      ),
    },
    READONLY_TOOL,
    async ({ audioBase64 }) => {
      try {
        const result = await client.uploadAudioFromBase64(audioBase64);
        return ok(result);
      } catch (e) { return translateError(e); }
    },
  ).update({ outputSchema: GENERIC_OUTPUT_SCHEMA });
}
