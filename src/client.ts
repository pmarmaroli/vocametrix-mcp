import { readFileSync } from "fs";
import { VocametrixClient } from "vocametrix";

const BASE_URL = "https://platform.vocametrix.com";

export interface ApiClient {
  sdk: VocametrixClient;
  apiKey: string;
  /** Upload audio file and return a fileId (for Praat-based endpoints) */
  uploadFileId(audioPath: string, email?: string): Promise<string>;
  /** Upload audio file to Azure Blob and return the blobURL (for streaming endpoints) */
  uploadBlobUrl(audioPath: string): Promise<string>;
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

  return {
    sdk,
    apiKey,

    async uploadFileId(audioPath, email = "mcp@vocametrix.com") {
      const data = readFileSync(audioPath);
      const form = new FormData();
      form.append("audio", new Blob([data], { type: "audio/wav" }), "audio.wav");
      form.append("email", email);
      const json = await apiFetch(`${BASE_URL}/api/assignFileId`, {
        method: "POST",
        body: form,
      }) as { fileId: string };
      return json.fileId;
    },

    async uploadBlobUrl(audioPath) {
      const json = await apiFetch(`${BASE_URL}/api/get-blob-url`, {
        method: "POST",
      }) as { uploadURL: string; blobURL: string };

      const data = readFileSync(audioPath);
      const put = await fetch(json.uploadURL, {
        method: "PUT",
        body: data,
        headers: { "x-ms-blob-type": "BlockBlob", "Content-Type": "audio/wav" },
      });
      if (!put.ok) throw new Error(`Azure upload failed: ${String(put.status)}`);
      return json.blobURL;
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
