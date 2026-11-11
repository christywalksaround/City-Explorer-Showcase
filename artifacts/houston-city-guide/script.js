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
  byline.textContent = role === "user"
    ? "YOU, IN HOUSTON"
    : metadata?.finishReason === "FALLBACK"
      ? "HOUSTON CITY GUIDE · FACTS MODE"
      : "HOUSTON CITY GUIDE";

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
      metadata.finishReason === "FALLBACK"
        ? "LIVE AI TEMPORARILY UNAVAILABLE"
        : `MODEL ${metadata.model || "Unknown"}`,
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
  const requestTimeout = window.setTimeout(() => requestController.abort(), 24_000);

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
    // A local facts fallback is not part of the AI conversation context.
    if (result.finishReason !== "FALLBACK") {
      conversationHistory.push(
        { role: "user", content: message },
        { role: "assistant", content: result.reply },
      );
    }
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

// ---------------------------------------------------------------------------
// Community dish photos: upload form + gallery.
// Talks to GET /api/dishes and POST /api/dishes with plain fetch.
// ---------------------------------------------------------------------------
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 3 * 1024 * 1024; // 3 MB limit for both the original and resized image
const MAX_EDGE = 1280; // longest side after resizing, in pixels

const dishForm = document.querySelector("#dish-form");
const dishTitle = document.querySelector("#dish-title");
const dishCaption = document.querySelector("#dish-caption");
const dishFile = document.querySelector("#dish-file");
const dishPreview = document.querySelector("#dish-preview");
const dishDropText = document.querySelector("#dish-drop-text");
const dishFormStatus = document.querySelector("#dish-form-status");
const dishSubmit = document.querySelector("#dish-submit");
const dishGrid = document.querySelector("#dish-grid");
const dishGalleryState = document.querySelector("#dish-gallery-state");
const dishCount = document.querySelector("#dish-count");
const dishRefresh = document.querySelector("#dish-refresh");

// We keep the preview's object URL so we can release it later (prevents memory leaks).
let previewUrl = null;
let galleryRequest = 0;

function setFormStatus(kind, message) {
  dishFormStatus.className = `dish-status${kind ? ` is-${kind}` : ""}`;
  dishFormStatus.textContent = message;
}

// Check the ORIGINAL file before doing any work. Returns an error string or "".
function validateOriginalFile(file) {
  if (!file) return "Please choose a photo of your dish.";
  if (file.size > MAX_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `That photo is ${mb} MB. Please choose one that is 3 MB or smaller.`;
  }
  // Some devices omit MIME types. Allow a matching extension for those files;
  // resizeToDataUrl checks the actual bytes before processing or uploading.
  const unknownType = !file.type || file.type === "application/octet-stream";
  if (!ALLOWED_TYPES.includes(file.type) && !(unknownType && /\.(jpe?g|png|webp)$/i.test(file.name))) {
    return `"${file.name}" is not a supported format. Please use a JPEG, PNG, or WebP photo (GIFs are not accepted).`;
  }
  return "";
}

function clearPreview() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  dishPreview.hidden = true;
  dishPreview.removeAttribute("src");
  dishDropText.textContent = "Choose a photo";
}

// Show a small preview as soon as a valid file is picked.
dishFile.addEventListener("change", () => {
  clearPreview();
  const file = dishFile.files[0];
  if (!file) return;
  const problem = validateOriginalFile(file);
  if (problem) {
    dishFile.setAttribute("aria-invalid", "true");
    setFormStatus("error", problem);
    return;
  }
  dishFile.removeAttribute("aria-invalid");
  setFormStatus("", "");
  previewUrl = URL.createObjectURL(file);
  dishPreview.src = previewUrl;
  dishPreview.hidden = false;
  dishDropText.textContent = file.name;
});

// Turn a canvas into a Blob (canvas.toBlob uses a callback, so we wrap it in a Promise).
function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not process that image."))), type, quality);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the resized image."));
    reader.readAsDataURL(blob);
  });
}

// Load the file into an <img>, draw it smaller on a canvas, and return a data URL.
async function resizeToDataUrl(file) {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const ascii = (start, end) => String.fromCharCode(...header.slice(start, end));
  let detectedType = "";
  if (header[0] === 255 && header[1] === 216 && header[2] === 255) detectedType = "image/jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => header[i] === byte)) detectedType = "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") detectedType = "image/webp";
  if (!detectedType) throw new Error("Please use a real JPEG, PNG, or WebP photo (GIFs are not accepted).");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw new Error("That file could not be opened as an image.");
    }
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);

    // PNG stays PNG (keeps transparency); others use JPEG/WebP with quality steps.
    const outType = detectedType;
    let blob = await canvasToBlob(canvas, outType, 0.88);
    // If still too large, step down quality using JPEG until it fits.
    for (const q of [0.8, 0.7, 0.6, 0.5]) {
      if (blob.size <= MAX_BYTES) break;
      blob = await canvasToBlob(canvas, "image/jpeg", q);
    }
    if (blob.size > MAX_BYTES) throw new Error("Even after resizing, this photo is over 3 MB. Please try a different one.");
    return blobToDataUrl(blob);
  } finally {
    URL.revokeObjectURL(url); // always release the temporary URL
  }
}

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Build one gallery card. Every user-provided string goes through textContent.
function createDishCard(dish) {
  const item = document.createElement("li");
  item.className = "dish-card";
  const figure = document.createElement("figure");
  const img = document.createElement("img");
  img.src = dish.imageUrl;
  img.alt = dish.caption ? `${dish.title}: ${dish.caption}` : dish.title;
  img.loading = "lazy";
  img.decoding = "async";
  const caption = document.createElement("figcaption");
  const title = document.createElement("h3");
  title.textContent = dish.title;
  caption.append(title);
  if (dish.caption) {
    const text = document.createElement("p");
    text.textContent = dish.caption;
    caption.append(text);
  }
  const time = document.createElement("time");
  time.dateTime = dish.createdAt;
  time.textContent = `SHARED ${formatDate(dish.createdAt).toUpperCase()}`;
  caption.append(time);
  if (dish.inspectorNote) {
    const note = document.createElement("p");
    note.className = "dish-inspector-note";
    note.textContent = dish.inspectorNote;
    caption.append(note);
  }
  figure.append(img, caption);
  item.append(figure);
  return item;
}

function updateDishCount() {
  const total = dishGrid.querySelectorAll(".dish-card").length;
  dishCount.textContent = `${total} ${total === 1 ? "DISH" : "DISHES"}`;
  if (total === 0 && !dishGalleryState.classList.contains("is-error")) {
    showGalleryMessage("empty", "No plates yet. Be the first to share something delicious.");
  } else if (total > 0 && !dishGalleryState.classList.contains("is-error")) {
    showGalleryMessage("", "");
  }
}

function showGalleryMessage(kind, message, withRetry = false) {
  dishGalleryState.className = `dish-gallery-state${kind ? ` is-${kind}` : ""}`;
  dishGalleryState.replaceChildren();
  if (!message) return;
  const p = document.createElement("p");
  const span = document.createElement("span");
  span.textContent = message;
  p.append(span);
  if (withRetry) {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "dish-refresh";
    retry.textContent = "Try again";
    retry.addEventListener("click", loadDishes);
    p.append(retry);
  }
  dishGalleryState.append(p);
}

// Read an error message from a JSON {error} body, falling back to a friendly default.
async function readError(response, fallback) {
  try {
    const body = await response.json();
    if (body && typeof body.error === "string") {
      return body.error + (typeof body.reason === "string" ? ` ${body.reason}` : "");
    }
  } catch { /* body was not JSON */ }
  return fallback;
}

async function loadDishes() {
  const request = ++galleryRequest;
  dishRefresh.disabled = true;
  dishGrid.setAttribute("aria-busy", "true");
  dishCount.textContent = "LOADING";
  showGalleryMessage("loading", "");
  const loadingNote = document.createElement("span");
  loadingNote.className = "sr-only";
  loadingNote.textContent = "Loading shared dishes...";
  dishGalleryState.append(loadingNote);
  // Skeleton placeholders while we wait.
  dishGrid.replaceChildren(...Array.from({ length: 3 }, () => {
    const li = document.createElement("li");
    li.className = "dish-skeleton";
    li.setAttribute("aria-hidden", "true");
    return li;
  }));
  try {
    const response = await fetch("/api/dishes");
    if (!response.ok) throw new Error(await readError(response, "The dish gallery could not load."));
    const dishes = await response.json();
    if (request !== galleryRequest) return;
    if (!Array.isArray(dishes)) throw new Error("The gallery came back in an unexpected format.");
    dishGrid.replaceChildren(...dishes.map(createDishCard));
    showGalleryMessage("", "");
    updateDishCount();
  } catch (error) {
    if (request !== galleryRequest) return;
    dishGrid.replaceChildren();
    dishCount.textContent = "UNAVAILABLE";
    const msg = error instanceof Error && error.message !== "Failed to fetch" ? error.message : "Could not reach the gallery.";
    showGalleryMessage("error", `${msg} Check your connection and try again.`, true);
  } finally {
    dishRefresh.disabled = false;
    dishGrid.setAttribute("aria-busy", "false");
  }
}

dishForm.addEventListener("submit", async (event) => {
  event.preventDefault(); // stay on the page
  if (dishSubmit.disabled) return;

  const title = dishTitle.value.trim();
  const caption = dishCaption.value.trim();
  const file = dishFile.files[0];

  if (!title) {
    dishTitle.setAttribute("aria-invalid", "true");
    setFormStatus("error", "Please give your dish a name.");
    dishTitle.focus();
    return;
  }
  dishTitle.removeAttribute("aria-invalid");

  // Validate before resizing; no request is sent if this fails.
  const problem = validateOriginalFile(file);
  if (problem) {
    dishFile.setAttribute("aria-invalid", "true");
    setFormStatus("error", problem);
    dishFile.focus();
    return;
  }

  dishSubmit.disabled = true;
  setFormStatus("loading", "Resizing your photo...");
  try {
    const image = await resizeToDataUrl(file);
    setFormStatus("loading", "The AI inspector is checking your photo for Viet-Cajun crawfish...");
    const payload = { title, image };
    if (caption) payload.caption = caption;
    const response = await fetch("/api/dishes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(await readError(response, "Your dish could not be shared."));
    const dish = await response.json();

    // Put the new dish at the front straight away.
    // A slower gallery fetch must not overwrite a newly saved photo.
    galleryRequest++;
    dishGrid.querySelectorAll(".dish-skeleton").forEach((item) => item.remove());
    if (dishGalleryState.classList.contains("is-error")) showGalleryMessage("", "");
    dishGrid.prepend(createDishCard(dish));
    updateDishCount();

    dishForm.reset();
    clearPreview();
    setFormStatus("success", `"${dish.title}" is on the table. Thanks for sharing.`);
    dishTitle.focus();
  } catch (error) {
    const msg = error instanceof Error && error.message !== "Failed to fetch" ? error.message : "Could not reach the server.";
    setFormStatus("error", msg);
  } finally {
    dishSubmit.disabled = false;
  }
});

dishRefresh.addEventListener("click", loadDishes);
loadDishes();

// Unsplash photos stay separate from the community's inspected uploads.
const inspirationGrid = document.querySelector("#inspiration-grid");
const inspirationStatus = document.querySelector("#inspiration-status");
const inspirationRefresh = document.querySelector("#inspiration-refresh");
const inspirationDialog = document.querySelector("#inspiration-dialog");
const inspirationExpanded = document.querySelector("#inspiration-expanded");

function photoCredit(photo) {
  const credit = document.createElement("p");
  const photographer = document.createElement("a");
  photographer.textContent = photo.photographerName;
  photographer.href = photo.photographerProfileUrl;
  photographer.target = "_blank";
  photographer.rel = "noopener noreferrer";
  const unsplash = document.createElement("a");
  unsplash.textContent = "Unsplash";
  unsplash.href = "https://unsplash.com/?utm_source=houston_city_guide&utm_medium=referral";
  unsplash.target = "_blank";
  unsplash.rel = "noopener noreferrer";
  credit.append("Photo by ", photographer, " on ", unsplash);
  return credit;
}

async function expandInspiration(photo, button) {
  button.disabled = true;
  inspirationStatus.textContent = "Opening photo…";
  try {
    // Unsplash requires download tracking for an explicit expand/use action.
    const response = await fetch("/api/unsplash/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ downloadLocation: photo.downloadLocation }),
    });
    if (!response.ok) throw new Error(await readError(response, "Could not open this photo."));
    const expandedUrl = new URL(photo.rawUrl);
    expandedUrl.searchParams.set("w", "2000");
    expandedUrl.searchParams.set("fit", "max");
    expandedUrl.searchParams.set("auto", "format");
    inspirationExpanded.src = expandedUrl.toString();
    inspirationExpanded.alt = photo.altText;
    document.querySelector("#inspiration-credit").replaceChildren(...photoCredit(photo).childNodes);
    inspirationDialog.showModal();
    inspirationStatus.textContent = "";
  } catch (error) {
    inspirationStatus.textContent = error.message || "Could not open this photo. Please try again.";
  } finally {
    button.disabled = false;
  }
}

async function loadInspiration() {
  inspirationRefresh.disabled = true;
  inspirationGrid.setAttribute("aria-busy", "true");
  inspirationStatus.textContent = "Finding food inspiration on Unsplash…";
  try {
    const response = await fetch("/api/unsplash/dish-inspiration");
    if (!response.ok) throw new Error(await readError(response, "Could not load food inspiration."));
    const photos = await response.json();
    const cards = photos.map((photo) => {
      const card = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "inspiration-photo";
      button.setAttribute("aria-label", `Expand photo: ${photo.altText}`);
      const image = document.createElement("img");
      image.src = photo.imageUrl;
      image.alt = photo.altText;
      image.loading = "lazy";
      image.width = 1080;
      image.height = 810;
      button.append(image);
      button.addEventListener("click", () => expandInspiration(photo, button));
      card.append(button, photoCredit(photo));
      return card;
    });
    inspirationGrid.replaceChildren(...cards);
    inspirationStatus.textContent = photos.length ? "Select a photo to take a closer look." : "Unsplash has no photos for this dish yet. Try refreshing later.";
  } catch (error) {
    inspirationStatus.textContent = error.message || "Food inspiration couldn't be loaded. Please try again.";
  } finally {
    inspirationGrid.setAttribute("aria-busy", "false");
    inspirationRefresh.disabled = false;
  }
}

document.querySelector("#inspiration-close").addEventListener("click", () => inspirationDialog.close());
inspirationRefresh.addEventListener("click", loadInspiration);
loadInspiration();
