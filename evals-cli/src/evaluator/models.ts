import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { Config, WebmcpConfig } from "../types/config.js";

export function getModel(config: Config | WebmcpConfig) {
  const modelId = config.model || "google:gemini-2.5-flash";

  if (config.backend === "openai" || modelId.startsWith("openai:")) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) console.warn("Warning: OPENAI_API_KEY is missing for OpenAI provider.");
    return createOpenAI({ apiKey })(modelId.replace("openai:", ""));
  }

  if (config.backend === "anthropic" || modelId.startsWith("anthropic:")) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) console.warn("Warning: ANTHROPIC_API_KEY is missing for Anthropic provider.");
    return createAnthropic({ apiKey })(modelId.replace("anthropic:", ""));
  }

  if (config.backend === "ollama" || modelId.startsWith("ollama:")) {
    const ollama = createOpenAI({
      baseURL: process.env.OLLAMA_HOST || "http://127.0.0.1:11434/v1",
      apiKey: "ollama", // Required by standard but ignored by Ollama locally
    });
    return ollama(modelId.replace("ollama:", ""));
  }

  // Default to Google
  const apiKey = process.env.GOOGLE_AI || process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) console.warn("Warning: Missing Google/Gemini API key");
  const google = createGoogleGenerativeAI({ apiKey });
  return google(modelId.replace("google:", ""));
}
