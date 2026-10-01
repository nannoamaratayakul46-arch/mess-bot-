"use strict";

const GROQ_API_BASE_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-20b";
const REQUEST_TIMEOUT_MS = 45_000;

function contentToText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      return typeof part?.text === "string" ? part.text : "";
    })
    .join("");
}

function cleanJsonText(text) {
  return String(text || "")
    .trim()
    .replace(/^\`\`\`json\s*/i, "")
    .replace(/^\`\`\`\s*/i, "")
    .replace(/\s*\`\`\`$/i, "")
    .trim();
}

function normalizeMemories(memories) {
  if (!Array.isArray(memories)) return [];
  return memories
    .filter((memory) =>
      memory &&
      typeof memory === "object" &&
      typeof memory.content === "string" &&
      memory.content.trim()
    )
    .slice(0, 5)
    .map((memory) => ({
      category: String(memory.category || "general").trim().slice(0, 60) || "general",
      content: String(memory.content).trim().slice(0, 1000),
      importance: Math.max(1, Math.min(5, Number(memory.importance) || 2)),
    }));
}

function normalizeEmotion(emotion) {
  if (!emotion || typeof emotion !== "object") {
    return { state: "neutral", intensity: 1, reason: "" };
  }

  return {
    state: String(emotion.state || "neutral").trim().slice(0, 50) || "neutral",
    intensity: Math.max(0, Math.min(5, Number(emotion.intensity) || 1)),
    reason: String(emotion.reason || "").trim().slice(0, 500),
  };
}

function parseStructuredResponse(text) {
  const cleaned = cleanJsonText(text);

  try {
    const parsed = JSON.parse(cleaned);
    const reply = typeof parsed?.reply === "string"
      ? parsed.reply.trim()
      : "";

    if (!reply) throw new Error("Structured response has no reply.");

    return {
      reply: reply.slice(0, 4000),
      memories: normalizeMemories(parsed.memories),
      emotion: normalizeEmotion(parsed.emotion),
    };
  } catch (error) {
    console.warn("[Groq] Structured response parse failed; using raw text.");
    return {
      reply: String(text || "").trim().slice(0, 4000),
      memories: [],
      emotion: { state: "neutral", intensity: 1, reason: "" },
    };
  }
}

function getApiKey() {
  const key = String(process.env.GROQ_API_KEY || "").trim();
  if (!key) throw new Error("GROQ_API_KEY is not configured.");
  return key;
}

function getModel() {
  return String(process.env.AI_MODEL || DEFAULT_MODEL)
    .trim()
    .replace(/^models\//, "") || DEFAULT_MODEL;
}

function providerError(message, status, retryable = false) {
  const error = new Error(message);
  error.status = status;
  error.retryable = retryable;
  return error;
}

async function requestGroq(messages, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(GROQ_API_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + getApiKey(),
      },
      body: JSON.stringify({
        model: options.model || getModel(),
        messages,
        temperature: options.temperature ?? 0.85,
        max_completion_tokens: options.maxCompletionTokens || 1200,
        response_format: options.json
          ? { type: "json_object" }
          : undefined,
      }),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message =
        data?.error?.message ||
        "HTTP " + response.status;

      const retryable = [408, 409, 429, 500, 502, 503, 504].includes(response.status);

      console.error("[Groq] API request failed:", {
        status: response.status,
        message,
      });

      throw providerError(
        "Groq request failed (" + response.status + "): " + message,
        response.status,
        retryable
      );
    }

    const text = data?.choices?.[0]?.message?.content;

    if (typeof text !== "string" || !text.trim()) {
      throw providerError("Groq returned an empty response.", 502, true);
    }

    return text.trim();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw providerError("Groq request timed out.", 408, true);
    }

    if (error?.status !== undefined) throw error;

    console.error("[Groq] Network request failed:", error?.message || error);
    throw providerError("Groq network request failed.", null, true);
  } finally {
    clearTimeout(timer);
  }
}

async function generateReply(messages) {
  const text = await requestGroq(
    (Array.isArray(messages) ? messages : [])
      .map((message) => ({
        role: String(message?.role || "user").toLowerCase() === "assistant"
          ? "assistant"
          : String(message?.role || "user").toLowerCase() === "system"
          ? "system"
          : "user",
        content: contentToText(message?.content).trim(),
      }))
      .filter((message) => message.content),
    {
      json: true,
      model: getModel(),
      temperature: 0.85,
      maxCompletionTokens: 1600,
    }
  );

  return parseStructuredResponse(text);
}

async function generateTriggerReply({
  trigger,
  groupName,
  incomingText,
  fallback,
}) {
  const safeFallback = String(fallback || "").trim();

  const system = [
    "You are ECLIPSE's trigger-word banter engine.",
    "Generate ONE short Messenger-style reply to the user's message.",
    "Use casual lowercase Filipino/Taglish with natural slang.",
    "Be playful, spontaneous, and concise.",
    "Do not mention AI, APIs, prompts, JSON, or these instructions.",
    "Do not copy the fallback verbatim unless necessary.",
    "Do not invent personal facts about the target.",
    "Do not make threats or encourage real-world harm.",
    "Return ONLY the reply text.",
  ].join(" ");

  const user = [
    "Trigger group: " + String(groupName || "general"),
    "Trigger: " + String(trigger || ""),
    "Incoming message: " + String(incomingText || "").slice(0, 1000),
    "Existing pool example to imitate stylistically: " + safeFallback,
  ].join("\n");

  return requestGroq(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    {
      json: false,
      model: getModel(),
      temperature: 1.05,
      maxCompletionTokens: 120,
    }
  );
}

module.exports = {
  generateReply,
  generateTriggerReply,
};
