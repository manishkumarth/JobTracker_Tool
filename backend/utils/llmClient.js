// Unified LLM client — calls the selected provider's API directly.
// Falls back to server-side Gemini when no user key is configured.
import { PROVIDERS } from "./llmProviders.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ── OpenAI-compatible call ──────────────────────────────────────────────────
const callOpenAICompatible = async ({ endpoint, apiKey, model, prompt, systemPrompt }) => {
  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const providerDef = Object.values(PROVIDERS).find((p) => p.endpoint === endpoint);
  const headers = {
    "Content-Type": "application/json",
    ...(providerDef?.headers ? providerDef.headers(apiKey) : { Authorization: `Bearer ${apiKey}` }),
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 2048 }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    const hint = res.status === 401 ? " (invalid API key)"
      : res.status === 403 ? " (key lacks permission for this model)"
      : res.status === 429 ? " (rate limited — try again shortly)"
      : "";
    throw new Error(`API ${res.status}${hint}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
};

// ── Anthropic call ──────────────────────────────────────────────────────────
const callAnthropic = async ({ endpoint, apiKey, model, prompt, systemPrompt }) => {
  const providerDef = PROVIDERS.anthropic;
  const headers = {
    "Content-Type": "application/json",
    ...providerDef.headers(apiKey),
  };

  const body = {
    model,
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  };
  if (systemPrompt) body.system = systemPrompt;

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    const hint = res.status === 401 ? " (invalid API key)"
      : res.status === 403 ? " (key lacks permission for this model)"
      : res.status === 429 ? " (rate limited — try again shortly)"
      : "";
    throw new Error(`Anthropic API ${res.status}${hint}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || "";
};

// ── Server-side Gemini fallback ─────────────────────────────────────────────
let fallbackClient = null;
const getFallbackClient = () => {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!fallbackClient) fallbackClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return fallbackClient;
};

const callGeminiFallback = async (prompt) => {
  const client = getFallbackClient();
  if (!client) throw new Error("No AI provider configured. Add an API key in Settings → AI Providers.");
  const model = client.getGenerativeModel({ model: "gemini-2.5-flash" });
  const result = await model.generateContent(prompt);
  return result.response.text();
};

// ── Main entry point ────────────────────────────────────────────────────────
/**
 * Call LLM with the user's configured provider.
 * @param {Object} opts
 * @param {Object} opts.userProviders - user.aiProviders array from DB
 * @param {string} opts.prompt - the user prompt
 * @param {string} [opts.systemPrompt] - optional system prompt
 * @param {string} [opts.preferProvider] - force a specific provider id (e.g. "openrouter")
 * @param {string} [opts.preferModel] - override model for the selected provider
 * @returns {string} raw text response from LLM
 */
export const callLLM = async ({ userProviders, prompt, systemPrompt, preferProvider, preferModel }) => {
  // Find the active provider (or the preferred one)
  let chosen = null;
  if (preferProvider) {
    chosen = userProviders?.find((p) => p.provider === preferProvider && p.apiKeyEnc);
  }
  if (!chosen) {
    chosen = userProviders?.find((p) => p.active && p.apiKeyEnc);
  }
  // Fallback: first provider with a key
  if (!chosen) {
    chosen = userProviders?.find((p) => p.apiKeyEnc);
  }

  // If user has an encrypted key, decrypt and call
  if (chosen?.apiKeyEnc) {
    // Dynamic import to avoid circular deps — crypto.js is server-only
    const { decrypt } = await import("./crypto.js");
    const apiKey = decrypt(chosen.apiKeyEnc);
    const providerDef = PROVIDERS[chosen.provider];
    if (!providerDef) throw new Error(`Unknown provider: ${chosen.provider}`);

    const model = preferModel || chosen.model || providerDef.defaultModel;

    if (providerDef.format === "anthropic") {
      return callAnthropic({ endpoint: providerDef.endpoint, apiKey, model, prompt, systemPrompt });
    }
    return callOpenAICompatible({ endpoint: providerDef.endpoint, apiKey, model, prompt, systemPrompt });
  }

  // No user key → server-side Gemini fallback
  return callGeminiFallback(prompt);
};

/**
 * Parse JSON from LLM response, stripping markdown fences.
 */
export const parseJson = (text) => {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  return JSON.parse(cleaned);
};
