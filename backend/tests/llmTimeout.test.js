import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-llm-timeout";

const { encrypt } = await import("../utils/crypto.js");
const { callLLM } = await import("../utils/llmClient.js");

const userProviders = [
  {
    provider: "openai",
    active: true,
    model: "gpt-4o-mini",
    apiKeyEnc: encrypt("sk-test-key"),
  },
];

/** Swap global fetch for a request that never settles, honouring AbortSignal. */
const stubHangingFetch = () => {
  const original = globalThis.fetch;
  let aborted = false;
  globalThis.fetch = (url, options = {}) =>
    new Promise((resolve, reject) => {
      const signal = options.signal;
      if (signal) {
        signal.addEventListener("abort", () => {
          aborted = true;
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      }
    });
  return {
    wasAborted: () => aborted,
    restore: () => {
      globalThis.fetch = original;
    },
  };
};

test("callLLM rejects promptly instead of hanging on a stuck provider", async () => {
  const stub = stubHangingFetch();
  const startedAt = Date.now();
  try {
    await assert.rejects(
      () => callLLM({ userProviders, prompt: "hi", timeoutMs: 120 }),
      /timed out/i
    );
  } finally {
    stub.restore();
  }
  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed < 3000, `expected a fast timeout, took ${elapsed}ms`);
  assert.equal(stub.wasAborted(), true, "underlying fetch should be aborted");
});

test("callLLM still returns a normal response when the provider answers", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: "hello" } }] }),
  });
  try {
    const text = await callLLM({ userProviders, prompt: "hi", timeoutMs: 5000 });
    assert.equal(text, "hello");
  } finally {
    globalThis.fetch = original;
  }
});
