---
name: Gemini model selection
description: Project-specific notes for choosing models with the direct Google GenAI API key.
---

When using the direct Google GenAI SDK with `GEMINI_API_KEY`, verify model IDs against that key's `models.list` results and confirm `generateContent` support. Replit AI Integration model availability does not guarantee the same model works through the direct API. During implementation, `gemini-2.5-flash` was rejected for new API users and `gemini-3-flash-preview` was not supported on API v1; `gemini-3.8-flash` and `gemini-3.7-flash` were listed.

**Why:** The SDK can fail at runtime even when a model appears in a different integration's supported-model list.

Provider calls can also return `DEADLINE_EXCEEDED` after a long wait. A configured backup may time out too, so apply a per-model deadline and treat provider 504s as retryable only when a backup exists.

**How to apply:** Keep `GEMINI_MODEL` configurable, use a verified default, cap each attempt, and return a clear temporary-unavailable response when all verified models time out or are at capacity.
