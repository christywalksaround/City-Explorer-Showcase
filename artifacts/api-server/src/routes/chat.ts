import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import {
  GetCityGuideSystemPromptResponse,
  SendCityGuideChatBody,
  SendCityGuideChatResponse,
} from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import {
  buildCityGuideFallbackReply,
  buildCityGuideSystemPrompt,
  cityGuideSettings,
} from "../city";

const router: IRouter = Router();
const GEMINI_MODEL_TIMEOUT_MS = 10_000;

router.get("/chat/system-prompt", (_req, res): void => {
  const response = GetCityGuideSystemPromptResponse.parse({
    systemPrompt: buildCityGuideSystemPrompt(),
  });
  res.json(response);
});

router.post("/chat", async (req, res): Promise<void> => {
  const parsed = SendCityGuideChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Please send a question and valid Prompt Lab settings.",
    });
    return;
  }

  const message = parsed.data.message.trim();
  if (!message) {
    res.status(400).json({
      error: "Please enter a question for the city guide.",
    });
    return;
  }

  const apiKey = process.env["GEMINI_API_KEY"]?.trim();
  if (!apiKey) {
    res.status(503).json({
      error: "Add a GEMINI_API_KEY secret to enable the AI city guide.",
    });
    return;
  }

  const settings = {
    ...cityGuideSettings.defaults,
    ...parsed.data.settings,
  };

  const history = (parsed.data.history ?? []).map((item) => ({
    role: item.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: item.content.trim() }],
  }));

  try {
    const ai = new GoogleGenAI({ apiKey });
    const contents = [
      ...history,
      { role: "user" as const, parts: [{ text: message }] },
    ];
    const models = [
      cityGuideSettings.model,
      ...cityGuideSettings.fallbackModels,
    ];
    let modelUsed = cityGuideSettings.model;
    let result:
      | Awaited<ReturnType<typeof ai.models.generateContent>>
      | undefined;

    for (const [index, model] of models.entries()) {
      const requestSignal = AbortSignal.timeout(GEMINI_MODEL_TIMEOUT_MS);
      try {
        result = await ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: buildCityGuideSystemPrompt(),
            temperature: settings.temperature,
            topP: settings.topP,
            maxOutputTokens: settings.maxOutputTokens,
            // Keep this lightweight city-guide chat from spending the answer budget on reasoning.
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            abortSignal: requestSignal,
            httpOptions: { timeout: GEMINI_MODEL_TIMEOUT_MS },
          },
        });
        modelUsed = model;
        break;
      } catch (error) {
        const providerStatus =
          typeof error === "object" && error !== null
            ? (error as { status?: unknown }).status
            : undefined;
        const timedOut =
          error instanceof Error &&
          (error.name === "TimeoutError" || error.name === "AbortError");
        const hasFallback = index < models.length - 1;
        // A deadline is already the slow path; return the local facts backup
        // rather than waiting through another full provider timeout.
        if (
          !hasFallback ||
          timedOut ||
          (providerStatus !== 429 && providerStatus !== 503)
        ) {
          throw error;
        }

        // Briefly wait before trying the backup after a timeout or capacity error.
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    if (!result) throw new Error("Gemini did not return an answer.");

    const usageMetadata = result.usageMetadata;
    const finishReason = String(
      result.candidates?.[0]?.finishReason ?? "STOP",
    );
    const response = SendCityGuideChatResponse.parse({
      reply:
        result.text?.trim() ||
        "I'm not sure about that one. I can help with Houston's food, facts, and local highlights.",
      usage: {
        promptTokens: usageMetadata?.promptTokenCount ?? 0,
        outputTokens:
          (usageMetadata?.candidatesTokenCount ?? 0) +
          (usageMetadata?.thoughtsTokenCount ?? 0),
        totalTokens: usageMetadata?.totalTokenCount ?? 0,
      },
      settings,
      model: modelUsed,
      finishReason,
    });

    res.json(response);
  } catch (error) {
    const apiError =
      typeof error === "object" && error !== null
        ? (error as { status?: unknown })
        : undefined;
    const errorMessage =
      error instanceof Error
        ? error.message
            .replaceAll(apiKey, "[redacted]")
            .replace(/([?&](?:key|api_key)=)[^&\s]+/gi, "$1[redacted]")
            .slice(0, 500)
        : "Unknown provider error";

    const providerStatus =
      typeof apiError?.status === "number" ? apiError.status : undefined;
    const providerUnavailable =
      providerStatus === 429 ||
      providerStatus === 503 ||
      providerStatus === 504;
    const timedOut =
      providerStatus === 504 ||
      (error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError"));

    req.log.error(
      {
        errorType: error instanceof Error ? error.name : "UnknownError",
        errorMessage,
        ...(providerStatus !== undefined ? { providerStatus } : {}),
      },
      "Gemini city-guide request failed",
    );
    if (providerUnavailable || timedOut) {
      res.json(
        SendCityGuideChatResponse.parse({
          reply: buildCityGuideFallbackReply(message),
          usage: { promptTokens: 0, outputTokens: 0, totalTokens: 0 },
          settings,
          model: "Houston facts backup",
          finishReason: "FALLBACK",
        }),
      );
      return;
    }

    res.status(timedOut ? 504 : providerUnavailable ? 503 : 502).json({
      error: timedOut
        ? "The city guide took too long to respond. Please try again."
        : providerUnavailable
        ? "The city guide is busy right now. Please try again in a moment."
        : "The city guide could not reach Gemini. Please try again.",
    });
  }
});

export default router;
