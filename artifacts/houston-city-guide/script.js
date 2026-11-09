// The guide works entirely in the browser; notes disappear when the page reloads.
const likeForm = document.querySelector("#like-form");
const likeInput = document.querySelector("#like-input");
const likesList = document.querySelector("#likes-list");
const emptyMessage = document.querySelector("#list-empty");
const itemCount = document.querySelector("#item-count");
const bird = document.querySelector(".bird");
const birdButtons = document.querySelectorAll(".bird-image-button, .bird-prompt");

// Keep the item count and empty-state message in sync with the visible list.
function updateListStatus() {
  const total = likesList.children.length;
  itemCount.textContent = `${total} ${total === 1 ? "ITEM" : "ITEMS"}`;
  emptyMessage.hidden = total > 0;
}

// Add a note using textContent so user-entered text is always treated as text.
likeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const note = likeInput.value.trim();

  // Ignore blank or whitespace-only submissions.
  if (!note) {
    likeInput.focus();
    return;
  }

  const item = document.createElement("li");
  const noteText = document.createElement("span");
  noteText.className = "like-text";
  noteText.textContent = note;

  const removeButton = document.createElement("button");
  removeButton.className = "remove-like";
  removeButton.type = "button";
  removeButton.textContent = "×";
  removeButton.setAttribute("aria-label", `Remove ${note}`);
  removeButton.addEventListener("click", () => {
    item.remove();
    updateListStatus();
  });

  item.append(noteText, removeButton);
  likesList.append(item);
  likeInput.value = "";
  updateListStatus();
  likeInput.focus();
});

// A short class animation makes the bird wobble when it is clicked.
function shakeBird() {
  bird.classList.remove("shake");
  // Reading the layout lets a fast repeat click restart the animation.
  void bird.offsetWidth;
  bird.classList.add("shake");
}

birdButtons.forEach((button) => {
  button.addEventListener("click", shakeBird);
});

bird.addEventListener("animationend", () => {
  bird.classList.remove("shake");
});

updateListStatus();

// The conversation lives only for this visit; each turn sends prior successful turns.
const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const chatTranscript = document.querySelector("#chat-transcript");
const chatStatus = document.querySelector("#chat-status");
const chatSend = document.querySelector("#chat-send");
const temperatureInput = document.querySelector("#temperature");
const topPInput = document.querySelector("#top-p");
const maxTokensInput = document.querySelector("#max-output-tokens");
const systemPromptDetails = document.querySelector(".system-prompt");
const systemPromptContent = document.querySelector("#system-prompt-content");
const conversationHistory = [];
let systemPromptLoaded = false;

function currentSettings() {
  return {
    temperature: Number(temperatureInput.value),
    topP: Number(topPInput.value),
    maxOutputTokens: Number(maxTokensInput.value),
  };
}

function updateSettingReadouts() {
  document.querySelector("#temperature-value").value = Number(temperatureInput.value).toFixed(2);
  document.querySelector("#top-p-value").value = Number(topPInput.value).toFixed(2);
  document.querySelector("#max-output-tokens-value").value = maxTokensInput.value;
}

[temperatureInput, topPInput, maxTokensInput].forEach((input) => {
  input.addEventListener("input", updateSettingReadouts);
});
updateSettingReadouts();

function addMessage(role, content, metadata = null, wasCutOff = false) {
  const message = document.createElement("article");
  message.className = `chat-message ${role === "user" ? "user-message" : "assistant-message"}`;

  const byline = document.createElement("span");
  byline.className = "message-byline";
  byline.textContent = role === "user" ? "YOU, IN HOUSTON" : "HOUSTON CITY GUIDE";

  const body = document.createElement("p");
  body.textContent = content;
  message.append(byline, body);

  if (metadata) {
    const meta = document.createElement("div");
    meta.className = "answer-meta";
    const settingSummary = metadata.settings
      ? `TEMP ${metadata.settings.temperature} · TOP-P ${metadata.settings.topP} · MAX ${metadata.settings.maxOutputTokens}`
      : "Settings unavailable";
    const usage = metadata.usage || {};
    [
      `MODEL ${metadata.model || "Unknown"}`,
      settingSummary,
      `TOKENS IN ${usage.promptTokens ?? "—"} · OUT ${usage.outputTokens ?? "—"} · TOTAL ${usage.totalTokens ?? "—"}`,
      metadata.finishReason ? `FINISH ${metadata.finishReason}` : "",
    ].filter(Boolean).forEach((label) => {
      const item = document.createElement("span");
      item.textContent = label;
      meta.append(item);
    });
    message.append(meta);
  }

  if (wasCutOff) {
    const cutoff = document.createElement("p");
    cutoff.className = "answer-cutoff";
    cutoff.textContent = "This answer may have been cut short. Try asking for a shorter answer or raise the output limit in Prompt Lab.";
    message.append(cutoff);
  }

  chatTranscript.append(message);
  chatTranscript.scrollTop = chatTranscript.scrollHeight;
}

async function askCityGuide() {
  const message = chatInput.value.trim();
  if (!message || chatSend.disabled) {
    if (!message) chatInput.focus();
    return;
  }

  addMessage("user", message);
  chatInput.value = "";
  chatSend.disabled = true;
  chatStatus.className = "chat-status is-loading";
  chatStatus.textContent = "Finding a local answer...";
  const statusMessages = [
    "Checking one more local detail...",
    "Almost there—waiting on the city guide...",
    "The guide is taking longer than usual. I’ll keep trying briefly...",
  ];
  let elapsedMessage = 0;
  const statusTimer = window.setInterval(() => {
    if (elapsedMessage < statusMessages.length) {
      chatStatus.textContent = statusMessages[elapsedMessage];
      elapsedMessage += 1;
    }
  }, 7000);
  const requestController = new AbortController();
  const requestTimeout = window.setTimeout(() => requestController.abort(), 22_000);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: requestController.signal,
      body: JSON.stringify({
        message,
        // Keep the request within the API contract while preserving recent context.
        history: conversationHistory.slice(-40),
        settings: currentSettings(),
      }),
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error("The guide sent an unreadable response. Please try again.");
    }
    if (!response.ok) {
      throw new Error(typeof result.error === "string" ? result.error : "The city guide could not answer just now.");
    }
    if (typeof result.reply !== "string") {
      throw new Error("The city guide sent an incomplete answer. Please try again.");
    }

    addMessage(
      "assistant",
      result.reply,
      result,
      String(result.finishReason || "").toUpperCase().replace(/[-\s]/g, "_").includes("MAX_TOKENS"),
    );
    conversationHistory.push(
      { role: "user", content: message },
      { role: "assistant", content: result.reply },
    );
    chatStatus.className = "chat-status";
    chatStatus.textContent = "";
  } catch (error) {
    chatStatus.className = "chat-status";
    chatStatus.textContent =
      error instanceof Error && error.name === "AbortError"
        ? "The city guide is taking longer than usual. Please try again."
        : error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.";
  } finally {
    window.clearInterval(statusTimer);
    window.clearTimeout(requestTimeout);
    chatSend.disabled = false;
    chatInput.focus();
  }
}

// The button is type="button", so clicking it can never reload the page.
chatSend.addEventListener("click", askCityGuide);

// Keep form submission safe for assistive technology and browser shortcuts.
chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  askCityGuide();
});

chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    askCityGuide();
  }
});

systemPromptDetails.addEventListener("toggle", async () => {
  if (!systemPromptDetails.open || systemPromptLoaded) return;
  systemPromptContent.replaceChildren();
  const loading = document.createElement("p");
  loading.textContent = "Loading the field notes...";
  systemPromptContent.append(loading);

  try {
    const response = await fetch("/api/chat/system-prompt");
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error("The field notes could not be read.");
    }
    if (!response.ok) {
      throw new Error(typeof result.error === "string" ? result.error : "The field notes are unavailable right now.");
    }
    if (typeof result.systemPrompt !== "string") {
      throw new Error("The field notes came back in an unexpected format.");
    }
    const prompt = document.createElement("p");
    prompt.textContent = result.systemPrompt;
    systemPromptContent.replaceChildren(prompt);
    systemPromptLoaded = true;
  } catch (error) {
    const failure = document.createElement("p");
    failure.className = "system-prompt-error";
    failure.textContent = error instanceof Error ? error.message : "Unable to load the city guide's instructions. Close this panel and try again.";
    systemPromptContent.replaceChildren(failure);
  }
});
