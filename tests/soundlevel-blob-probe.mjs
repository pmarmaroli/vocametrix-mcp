#!/usr/bin/env node
// Probe: does /api/soundLevel consume/delete the blob?

import { readFileSync } from "node:fs";

const ARGS = {
  url: process.argv[2] === "--url" ? process.argv[3] : "http://localhost:3458/mcp",
  wav: "D:\\Github\\aphasix-model-fine-tuning\\data\\phase3_short_words\\713 Batch de 25\\batch_ABEILLE\\wavs\\abeille___2025-11-20___001.wav",
};

let rpcId = 0;
async function rpc(method, params) {
  const id = ++rpcId;
  const resp = await fetch(ARGS.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const ctype = resp.headers.get("content-type") ?? "";
  let text = "";
  if (ctype.includes("text/event-stream")) {
    const reader = resp.body.getReader(); const dec = new TextDecoder(); let buf = "", done = false;
    while (!done) {
      const { value, done: d } = await reader.read(); done = d;
      if (value) buf += dec.decode(value, { stream: true });
      let b;
      while ((b = buf.indexOf("\n\n")) !== -1) {
        const block = buf.slice(0, b); buf = buf.slice(b + 2);
        const dl = block.split("\n").find(l => l.startsWith("data:"));
        if (dl) text = dl.slice(5).trim();
      }
    }
  } else { text = await resp.text(); }
  return JSON.parse(text);
}
const textOf = (r) => r?.content?.find?.(c => c.type === "text")?.text ?? "";

async function probe(label, url) {
  const r = await fetch(url, { method: "HEAD" });
  console.log(`  ${label}: HTTP ${r.status}`);
}

async function main() {
  console.log(`url: ${ARGS.url}`);
  await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "probe", version: "0.1.0" } });
  const b64 = readFileSync(ARGS.wav).toString("base64");
  const upRes = await rpc("tools/call", { name: "vocametrix_upload_audio", arguments: { audioBase64: b64 } });
  const blobUrl = JSON.parse(textOf(upRes.result)).blobUrl;
  console.log("Uploaded, blobUrl ready");

  await probe("HEAD pre-soundLevel", blobUrl);

  const r1 = await rpc("tools/call", { name: "vocametrix_measure_sound_level", arguments: { audioPath: blobUrl, startSec: 0.1, endSec: 1.0 } });
  console.log(`measure_sound_level result: ${textOf(r1.result).slice(0, 200)}`);

  await probe("HEAD post-soundLevel", blobUrl);

  const r2 = await rpc("tools/call", { name: "vocametrix_detect_phonemes", arguments: { audioPath: blobUrl } });
  console.log(`detect_phonemes result: ${textOf(r2.result).slice(0, 200)}`);

  await probe("HEAD post-detect_phonemes", blobUrl);
}
main().catch(e => { console.error("fatal:", e); process.exit(1); });
