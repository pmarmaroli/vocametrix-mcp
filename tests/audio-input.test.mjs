// Unit tests for resolveAudioInputToBuffer — runs each branch of the function
// without hitting the network for the URL branch.
//
// Run with:
//   npm run build
//   node --test tests/audio-input.test.mjs
//
// Or via the convenience script:
//   npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Buffer } from "node:buffer";

import { resolveAudioInputToBuffer } from "../dist/utils/audio-input.js";

// ── helpers ──────────────────────────────────────────────────────────────────

function clearLocalFsFlag() {
  delete process.env["VOCAMETRIX_MCP_LOCAL_FS"];
}

function withLocalFsFlag(fn) {
  process.env["VOCAMETRIX_MCP_LOCAL_FS"] = "1";
  try { return fn(); } finally { clearLocalFsFlag(); }
}

// A long, valid base64 string (≥ 512 chars) that decodes to a known byte pattern.
// Built from a 400-byte buffer so the encoded length is ~536 chars.
const KNOWN_BYTES = Buffer.from(Array.from({ length: 400 }, (_, i) => i % 256));
const KNOWN_B64 = KNOWN_BYTES.toString("base64");

// ── data: URL branch ────────────────────────────────────────────────────────

test("data: URL — decodes payload correctly", async () => {
  const dataUrl = `data:audio/wav;base64,${KNOWN_B64}`;
  const buf = await resolveAudioInputToBuffer(dataUrl);
  assert.deepEqual(buf, KNOWN_BYTES);
});

test("data: URL — rejects malformed input (no comma)", async () => {
  await assert.rejects(
    () => resolveAudioInputToBuffer("data:audio/wav;base64"),
    /Invalid data URL/
  );
});

// ── raw base64 branch ───────────────────────────────────────────────────────

test("raw base64 ≥ 512 chars — decodes correctly", async () => {
  const buf = await resolveAudioInputToBuffer(KNOWN_B64);
  assert.deepEqual(buf, KNOWN_BYTES);
});

test("raw base64 with whitespace — strips whitespace before decoding", async () => {
  // Insert newlines every 60 chars (PEM-style wrapping)
  const wrapped = KNOWN_B64.match(/.{1,60}/g).join("\n");
  const buf = await resolveAudioInputToBuffer(wrapped);
  assert.deepEqual(buf, KNOWN_BYTES);
});

test("short alphanumeric string — NOT treated as base64 (rejected as opaque)", async () => {
  clearLocalFsFlag();
  // A short opaque ID that happens to match base64 charset
  await assert.rejects(
    () => resolveAudioInputToBuffer("file-abc123XYZ"),
    /not a fetchable URL.*opaque attachment identifier/s
  );
});

// ── local path branch ───────────────────────────────────────────────────────

test("absolute path WITHOUT VOCAMETRIX_MCP_LOCAL_FS — actionable error", async () => {
  clearLocalFsFlag();
  await assert.rejects(
    () => resolveAudioInputToBuffer("/var/data/audio.wav"),
    /Local file paths are only readable in stdio\/local mode.*vocametrix_upload_audio/s
  );
});

test("absolute path WITH VOCAMETRIX_MCP_LOCAL_FS=1 — reads from disk", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "vcmx-test-"));
  const filePath = join(tmp, "fixture.wav");
  writeFileSync(filePath, KNOWN_BYTES);
  try {
    await withLocalFsFlag(async () => {
      const buf = await resolveAudioInputToBuffer(filePath);
      assert.deepEqual(buf, KNOWN_BYTES);
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("Windows-style path WITHOUT flag — also rejected with same actionable error", async () => {
  clearLocalFsFlag();
  await assert.rejects(
    () => resolveAudioInputToBuffer("C:\\data\\audio.wav"),
    /Local file paths are only readable in stdio\/local mode/
  );
});

// ── opaque identifier branch ────────────────────────────────────────────────

test("opaque attachment identifier — error tells the LLM what to do", async () => {
  clearLocalFsFlag();
  await assert.rejects(
    () => resolveAudioInputToBuffer("attachment_01HXYZ"),
    /call vocametrix_upload_audio.*pass the returned blobUrl/s
  );
});

test("empty string — rejected as opaque, not crashing on path branch", async () => {
  clearLocalFsFlag();
  await assert.rejects(
    () => resolveAudioInputToBuffer(""),
    /opaque attachment identifier/
  );
});

// ── http(s) URL branch (stubbed) ────────────────────────────────────────────

test("https URL — calls fetch and returns its bytes", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(url, "https://example.invalid/audio.wav");
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => KNOWN_BYTES.buffer.slice(
        KNOWN_BYTES.byteOffset,
        KNOWN_BYTES.byteOffset + KNOWN_BYTES.byteLength
      ),
    };
  };
  try {
    const buf = await resolveAudioInputToBuffer("https://example.invalid/audio.wav");
    assert.deepEqual(buf, KNOWN_BYTES);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("https URL with non-2xx response — surfaces the HTTP status", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) });
  try {
    await assert.rejects(
      () => resolveAudioInputToBuffer("https://example.invalid/missing.wav"),
      /Failed to download audio from URL: HTTP 404/
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});
