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
