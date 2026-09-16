// LLM Provider definitions — endpoint URLs, models, and request format helpers.

export const PROVIDERS = {
  openrouter: {
    name: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    format: "openai",
    defaultModel: "openai/gpt-4o-mini",
    models: [
      "openai/gpt-4o",
      "openai/gpt-4o-mini",
      "anthropic/claude-sonnet-4-20250514",
      "anthropic/claude-3-haiku-20240307",
      "google/gemini-2.5-flash",
      "google/gemini-1.5-pro",
      "meta-llama/llama-3.3-70b-instruct",
      "deepseek/deepseek-chat",
    ],
    headers: (apiKey) => ({
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": typeof window !== "undefined" ? window.location.origin : "http://localhost:5173",
      "X-Title": "JobTrackr",
    }),
  },
  openai: {
    name: "OpenAI",
    endpoint: "https://api.openai.com/v1/chat/completions",
    format: "openai",
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
    headers: (apiKey) => ({
      "Authorization": `Bearer ${apiKey}`,
    }),
  },
  anthropic: {
    name: "Anthropic",
    endpoint: "https://api.anthropic.com/v1/messages",
    format: "anthropic",
    defaultModel: "claude-sonnet-4-20250514",
    models: ["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022", "claude-3-haiku-20240307"],
    headers: (apiKey) => ({
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    }),
  },
  gemini: {
    name: "Google Gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    format: "openai",
    defaultModel: "gemini-2.5-flash",
    models: ["gemini-2.5-flash"],
    headers: (apiKey) => ({
      "Authorization": `Bearer ${apiKey}`,
    }),
  },
  groq: {
    name: "Groq",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    format: "openai",
    defaultModel: "llama-3.3-70b-versatile",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"],
    headers: (apiKey) => ({
      "Authorization": `Bearer ${apiKey}`,
    }),
  },
  deepseek: {
    name: "DeepSeek",
    endpoint: "https://api.deepseek.com/v1/chat/completions",
    format: "openai",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-coder"],
    headers: (apiKey) => ({
      "Authorization": `Bearer ${apiKey}`,
    }),
  },
  together: {
    name: "Together AI",
    endpoint: "https://api.together.xyz/v1/chat/completions",
    format: "openai",
    defaultModel: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
    models: [
      "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
      "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
      "mistralai/Mixtral-8x7B-Instruct-v0.1",
      "Qwen/Qwen2.5-72B-Instruct-Turbo",
    ],
    headers: (apiKey) => ({
      "Authorization": `Bearer ${apiKey}`,
    }),
  },
};

export const PROVIDER_LIST = Object.entries(PROVIDERS).map(([key, p]) => ({
  id: key,
  name: p.name,
  models: p.models,
  defaultModel: p.defaultModel,
}));
