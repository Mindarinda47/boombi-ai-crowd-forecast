export type AiProvider = "gemini" | "groq";

type AiMessage = { role: "system" | "user"; content: string };

type StructuredAiRequest<T> = {
  name: string;
  schema: Record<string, unknown>;
  messages: AiMessage[];
  validate: (value: unknown) => value is T;
  imageUrl?: string | null;
  maxOutputTokens?: number;
};

export type StructuredAiResult<T> = {
  provider: AiProvider;
  value: T;
};

const supportedProviders = new Set<AiProvider>(["gemini", "groq"]);

function providerFrom(value: string | undefined, fallback: AiProvider): AiProvider {
  const normalized = value?.trim().toLowerCase() as AiProvider | undefined;
  return normalized && supportedProviders.has(normalized) ? normalized : fallback;
}

function providerHasKey(provider: AiProvider) {
  return provider === "gemini"
    ? Boolean(process.env.GEMINI_API_KEY?.trim())
    : Boolean(process.env.GROQ_API_KEY?.trim());
}

export function configuredAiProviders(): AiProvider[] {
  const primary = providerFrom(process.env.AI_PRIMARY_PROVIDER, "gemini");
  const fallback = providerFrom(process.env.AI_FALLBACK_PROVIDER, "groq");
  return [...new Set([primary, fallback])].filter(providerHasKey);
}

export function hasConfiguredAiProvider() {
  return configuredAiProviders().length > 0;
}

export function aiProviderSummary() {
  const providers = configuredAiProviders();
  if (providers.length === 0) return "API 키 등록 전";
  return providers.map((provider) => provider === "gemini" ? "Gemini" : "Groq").join(" → ");
}

function textFromGemini(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const steps = (payload as {
    steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  }).steps ?? [];
  return steps
    .filter((step) => step.type === "model_output")
    .flatMap((step) => step.content ?? [])
    .filter((content) => content.type === "text" && typeof content.text === "string")
    .map((content) => content.text)
    .join("");
}

function textFromGroq(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  return (payload as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content ?? "";
}

function parseJson(text: string) {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(normalized) as unknown;
}

function imageMimeType(imageUrl: string) {
  const pathname = new URL(imageUrl).pathname.toLowerCase();
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

function publicImageUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function promptParts(messages: AiMessage[]) {
  const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n");
  const user = messages.filter((message) => message.role === "user").map((message) => message.content).join("\n");
  return { system, user };
}

async function requestGemini<T>(request: StructuredAiRequest<T>) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("Gemini API key is unavailable");
  const { system, user } = promptParts(request.messages);
  const imageUrl = publicImageUrl(request.imageUrl);
  const input: Array<Record<string, unknown>> = [{ type: "text", text: user }];
  if (imageUrl) input.push({ type: "image", uri: imageUrl, mime_type: imageMimeType(imageUrl) });

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite",
      store: false,
      system_instruction: system,
      input,
      response_format: { type: "text", mime_type: "application/json", schema: request.schema },
    }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Gemini response: ${response.status}`);
  const value = parseJson(textFromGemini(await response.json()));
  if (!request.validate(value)) throw new Error(`Gemini returned invalid ${request.name}`);
  return value;
}

async function requestGroq<T>(request: StructuredAiRequest<T>) {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error("Groq API key is unavailable");
  const { system, user } = promptParts(request.messages);
  const imageUrl = publicImageUrl(request.imageUrl);
  const userContent: string | Array<Record<string, unknown>> = imageUrl
    ? [{ type: "text", text: user }, { type: "image_url", image_url: { url: imageUrl } }]
    : user;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL?.trim() || "qwen/qwen3.6-27b",
      messages: [
        {
          role: "system",
          content: `${system}\n반드시 아래 JSON Schema와 같은 필드와 자료형을 가진 JSON 객체만 출력하세요.\n${JSON.stringify(request.schema)}`,
        },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      reasoning_effort: "none",
      max_completion_tokens: request.maxOutputTokens ?? 1_200,
    }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Groq response: ${response.status}`);
  const value = parseJson(textFromGroq(await response.json()));
  if (!request.validate(value)) throw new Error(`Groq returned invalid ${request.name}`);
  return value;
}

export async function requestStructuredAi<T>(request: StructuredAiRequest<T>): Promise<StructuredAiResult<T>> {
  const providers = configuredAiProviders();
  if (providers.length === 0) throw new Error("AI provider is unavailable");

  let lastError: unknown;
  for (const provider of providers) {
    try {
      const value = provider === "gemini" ? await requestGemini(request) : await requestGroq(request);
      return { provider, value };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("AI providers failed");
}
