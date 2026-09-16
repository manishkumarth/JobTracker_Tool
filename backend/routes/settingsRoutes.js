import express from "express";
import User from "../models/User.js";
import { encrypt, decrypt } from "../utils/crypto.js";
import authMiddleware from "../middleware/auth.js";
import { PROVIDER_LIST } from "../utils/llmProviders.js";

const router = express.Router();
router.use(authMiddleware);

// GET /api/settings/providers — list providers with masked keys
router.get("/providers", async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("aiProviders");
    const saved = user.aiProviders || [];

    // Return provider list + user's saved configs (keys masked)
    const result = PROVIDER_LIST.map((def) => {
      const userEntry = saved.find((s) => s.provider === def.id);
      return {
        provider: def.id,
        name: def.name,
        models: def.models,
        defaultModel: def.defaultModel,
        model: userEntry?.model || "",
        active: userEntry?.active || false,
        connected: !!userEntry?.apiKeyEnc,
        // Never send the actual key — just indicate if one is set
      };
    });

    res.json({ providers: result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/settings/providers — save/update a provider key
router.put("/providers", async (req, res) => {
  try {
    const { provider, apiKey, model, active } = req.body;
    if (!provider) return res.status(400).json({ message: "provider is required" });

    const def = PROVIDER_LIST.find((p) => p.id === provider);
    if (!def) return res.status(400).json({ message: `Unknown provider: ${provider}` });

    const user = await User.findById(req.userId);
    if (!user.aiProviders) user.aiProviders = [];

    const idx = user.aiProviders.findIndex((p) => p.provider === provider);
    const entry = {
      provider,
      apiKeyEnc: apiKey ? encrypt(apiKey) : (idx >= 0 ? user.aiProviders[idx].apiKeyEnc : ""),
      model: model || (idx >= 0 ? user.aiProviders[idx].model : def.defaultModel),
      active: active ?? (idx >= 0 ? user.aiProviders[idx].active : false),
    };

    if (idx >= 0) user.aiProviders[idx] = entry;
    else user.aiProviders.push(entry);

    // If this provider is set active, deactivate others
    if (entry.active) {
      user.aiProviders.forEach((p, i) => {
        if (i !== (idx >= 0 ? idx : user.aiProviders.length - 1)) p.active = false;
      });
    }

    await user.save();
    res.json({ message: "Provider saved", connected: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/settings/providers/:provider — remove a provider key
router.delete("/providers/:provider", async (req, res) => {
  try {
    const { provider } = req.params;
    const user = await User.findById(req.userId);
    if (!user.aiProviders) user.aiProviders = [];

    const idx = user.aiProviders.findIndex((p) => p.provider === provider);
    if (idx === -1) return res.status(404).json({ message: "Provider not found" });

    user.aiProviders.splice(idx, 1);
    await user.save();
    res.json({ message: "Provider removed" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/settings/providers/:provider/activate — set active provider
router.post("/providers/:provider/activate", async (req, res) => {
  try {
    const { provider } = req.params;
    const user = await User.findById(req.userId);
    if (!user.aiProviders) user.aiProviders = [];

    const entry = user.aiProviders.find((p) => p.provider === provider);
    if (!entry) return res.status(404).json({ message: "Provider not connected" });

    user.aiProviders.forEach((p) => { p.active = false; });
    entry.active = true;
    await user.save();
    res.json({ message: "Active provider updated" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/settings/providers/test — test a provider key
router.post("/providers/test", async (req, res) => {
  try {
    const { provider, apiKey } = req.body;
    if (!provider || !apiKey) return res.status(400).json({ message: "provider and apiKey are required" });

    const def = PROVIDER_LIST.find((p) => p.id === provider);
    if (!def) return res.status(400).json({ message: `Unknown provider: ${provider}` });

    // Quick test call
    const providerDef = (await import("../utils/llmProviders.js")).PROVIDERS[provider];
    const headers = {
      "Content-Type": "application/json",
      ...(providerDef.headers ? providerDef.headers(apiKey) : {}),
    };

    let testBody;
    if (providerDef.format === "anthropic") {
      testBody = { model: def.defaultModel, max_tokens: 32, messages: [{ role: "user", content: "Say 'ok'" }] };
    } else {
      testBody = { model: def.defaultModel, messages: [{ role: "user", content: "Say 'ok'" }], max_tokens: 32 };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(providerDef.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(testBody),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return res.status(400).json({ message: `API returned ${response.status}: ${errText.slice(0, 150)}` });
    }

    res.json({ message: "Connection successful", provider, model: def.defaultModel });
  } catch (err) {
    res.status(500).json({ message: err.message || "Test failed" });
  }
});

export default router;
