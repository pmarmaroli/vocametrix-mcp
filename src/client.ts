import { readFileSync } from "fs";
import { VocametrixClient } from "vocametrix";

const BASE_URL = "https://platform.vocametrix.com";

export interface ApiClient {
  sdk: VocametrixClient;
  apiKey: string;
  /**
   * Upload audio and return a fileId (for Praat-based endpoints).
   * Accepts: local file path, HTTP/HTTPS URL, data URL, or raw base64 string.
   */
  uploadFileId(audioInput: string, email?: string): Promise<string>;
  /**
   * Upload audio to Azure Blob and return the blobURL (for streaming endpoints).
   * If audioInput is already an HTTP/HTTPS URL, it is returned as-is.
   * Accepts: local file path, HTTP/HTTPS URL, data URL, or raw base64 string.
   */
  uploadBlobUrl(audioInput: string): Promise<string>;
  /**
   * Upload raw base64-encoded audio to Azure Blob and return the blobUrl.
   * Use this from the vocametrix_upload_audio tool.
   */
  uploadAudioFromBase64(base64: string): Promise<{ blobUrl: string }>;
  /** Call a Vocametrix API endpoint directly with X-API-Key auth */
  get(path: string, params?: Record<string, string>): Promise<unknown>;
  post(path: string, body: unknown): Promise<unknown>;
}

export function createClient(explicitKey?: string): ApiClient {
  const apiKey = explicitKey ?? process.env["VOCAMETRIX_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "VOCAMETRIX_API_KEY is required. " +
      "Get a key at https://www.vocametrix.com/registration",
    );
  }

  const sdk = new VocametrixClient({ apiKey });
  const authHeaders = { "X-API-Key": apiKey };

  async function apiFetch(url: string, init: RequestInit): Promise<unknown> {
    const resp = await fetch(url, {
      ...init,
      headers: { ...authHeaders, ...(init.headers as Record<string, string> | undefined) },
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`HTTP ${String(resp.status)}: ${body}`);
    }
    return resp.json();
  }

  async function resolveToBuffer(input: string): Promise<Buffer> {
    // (1) HTTPS / HTTP URL — fetch it
    if (input.startsWith("http://") || input.startsWith("https://")) {
      const resp = await fetch(input);
      if (!resp.ok) throw new Error(`Failed to download audio from URL: HTTP ${resp.status}`);
      return Buffer.from(await resp.arrayBuffer());
    }
    // (2) data: URL — decode payload
    if (input.startsWith("data:")) {
      const comma = input.indexOf(",");
      if (comma === -1) throw new Error("Invalid data URL");
      return Buffer.from(input.slice(comma + 1), "base64");
    }
    // (3) Raw base64 (no data: prefix). Heuristic: long, only valid base64 chars.
    //     Min length ~512 chars (≈ 384 raw bytes), which is far above any plausible
    //     filename or identifier and well below the smallest real audio payload.
    if (input.length >= 512 && /^[A-Za-z0-9+/=\s]+$/.test(input)) {
      return Buffer.from(input.replace(/\s/g, ""), "base64");
    }
    // (4) Absolute local path — only meaningful when the MCP server runs locally
    //     (stdio mode on the user's machine). On the hosted/remote server this will
    //     ENOENT, so we refuse it with an actionable hint instead of a cryptic error.
    if (input.startsWith("/") || /^[A-Za-z]:[\\/]/.test(input)) {
      if (process.env["VOCAMETRIX_MCP_LOCAL_FS"] === "1") {
        return readFileSync(input);
      }
      throw new Error(
        `Local file paths are only readable in stdio/local mode. ` +
        `Received: "${input.slice(0, 120)}". ` +
        `On the hosted Vocametrix MCP server, you MUST first call vocametrix_upload_audio ` +
        `with the file content base64-encoded, then pass the returned blobUrl as audioPath.`
      );
    }
    // (5) Anything else — almost certainly an opaque attachment reference passed by
    //     the LLM (e.g. an upload identifier from the chat client). Refuse with a
    //     message that tells the LLM exactly what to do next.
    throw new Error(
      `audioPath value "${input.slice(0, 120)}" is not a fetchable URL, a data URL, ` +
      `raw base64, or an absolute path. This is most likely an opaque attachment ` +
      `identifier from the chat client, which the remote Vocametrix MCP server cannot ` +
      `resolve. To process an attached audio file: (1) read the file content, ` +
      `(2) base64-encode it, (3) call vocametrix_upload_audio with the base64 string, ` +
      `(4) pass the returned blobUrl as audioPath to the analysis tool.`
    );
  }

  async function uploadBufferToBlob(data: Buffer): Promise<string> {
    const json = await apiFetch(`${BASE_URL}/api/get-blob-url`, {
      method: "POST",
    }) as { uploadURL: string; blobURL: string };
    const put = await fetch(json.uploadURL, {
      method: "PUT",
      body: data,
      headers: { "x-ms-blob-type": "BlockBlob", "Content-Type": "audio/wav" },
    });
    if (!put.ok) throw new Error(`Azure upload failed: ${String(put.status)}`);
    return json.blobURL;
  }

  async function uploadBufferToFileId(data: Buffer, email: string): Promise<string> {
    const form = new FormData();
    form.append("audio", new Blob([data], { type: "audio/wav" }), "audio.wav");
    form.append("email", email);
    const json = await apiFetch(`${BASE_URL}/api/assignFileId`, {
      method: "POST",
      body: form,
    }) as { fileId: string };
    return json.fileId;
  }

  return {
    sdk,
    apiKey,

    async uploadFileId(audioInput, email = "mcp@vocametrix.com") {
      const data = await resolveToBuffer(audioInput);
      return uploadBufferToFileId(data, email);
    },

    async uploadBlobUrl(audioInput) {
      // Always upload to a fresh blob, even when audioInput is already an HTTPS URL.
      // Some Vocametrix endpoints (e.g. /api/soundLevel) delete the blob after processing,
      // so passing the same URL to a second tool would 404. A fresh upload per tool call
      // guarantees the blob exists for the duration of that call.
      const data = await resolveToBuffer(audioInput);
      return uploadBufferToBlob(data);
    },

    async uploadAudioFromBase64(base64) {
      const data = base64.startsWith("data:")
        ? Buffer.from(base64.slice(base64.indexOf(",") + 1), "base64")
        : Buffer.from(base64, "base64");
      const blobUrl = await uploadBufferToBlob(data);
      return { blobUrl };
    },

    async get(path, params) {
      const url = new URL(`${BASE_URL}${path}`);
      if (params) {
        for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
      }
      return apiFetch(url.toString(), { method: "GET" });
    },

    async post(path, body) {
      return apiFetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
  };
}
