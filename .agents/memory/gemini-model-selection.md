---
name: Gemini model selection
description: Project-specific notes for choosing models with the direct Google GenAI API key.
---

When using the direct Google GenAI SDK with `GEMINI_API_KEY`, check that key's live model list, then confirm the candidate with a timed generation request. Catalog presence is not proof that generation works promptly. Replit AI Integration availability does not guarantee direct API availability.

**Why:** Multiple listed Flash models timed out while a Flash-Lite candidate returned real generated text in roughly a second with the same key. Repeatedly adjusting timeouts or returning canned facts did not restore the requested AI behavior.

Use one overall request deadline across provider attempts rather than restarting the full timeout for each backup.

**How to apply:** Keep `GEMINI_MODEL` configurable, verify actual generated text and latency before declaring success, and distinguish a facts-only fallback from a working AI answer.

Keep the user's Google API key rather than switching to Replit-managed Gemini.

**Why:** The user explicitly chose “Keep Google API key” when offered the managed alternative.

**How to apply:** Do not provision a credit-billed replacement without new approval. Direct `gemini-3.8-flash` rejected `MINIMAL` thinking with HTTP 400; SDK enum availability alone does not establish model support.

Inspector failures must retain a safe diagnostic category, never raw provider errors.

**Why:** A production upload failed while subsequent requests worked; the generic catch discarded the cause, preventing a reliable diagnosis.

**How to apply:** Log allowlisted failure categories without credentials or image payloads. Keep transient retries bounded by one deadline and never bypass inspection when the provider fails.
