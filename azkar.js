const STORAGE_KEY = "quranTasbihState";
const ADHKAR_TAB_KEY = "quranAdhkarTab";
const DEFAULT_PHRASE = "سبحان الله";

const state = loadState();

const tasbihPadBtn = document.getElementById("tasbihPadBtn");
const tasbihCountEl = document.getElementById("tasbihCount");
const tasbihMessageEl = document.getElementById("tasbihMessage");
const tasbihPhraseEl = document.getElementById("tasbihPhrase");
const tasbihResetBtn = document.getElementById("tasbihResetBtn");
const dhikrPresetButtons = document.querySelectorAll(".dhikr-preset");
const adhkarTabs = document.querySelectorAll(".adhkar-tab");
const adhkarMorningPanel = document.getElementById("adhkarMorning");
const adhkarEveningPanel = document.getElementById("adhkarEvening");

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { count: 0, phrase: DEFAULT_PHRASE };
    }

    const parsed = JSON.parse(raw);
    return {
      count: Math.max(0, Number(parsed.count) || 0),
      phrase: String(parsed.phrase || DEFAULT_PHRASE)
    };
  } catch {
    return { count: 0, phrase: DEFAULT_PHRASE };
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      count: state.count,
      phrase: state.phrase
    })
  );
}

function flashMessage(message) {
  tasbihMessageEl.textContent = message;
  tasbihMessageEl.classList.remove("flash-up");
  void tasbihMessageEl.offsetWidth;
  tasbihMessageEl.classList.add("flash-up");

  window.clearTimeout(flashMessage.timer);
  flashMessage.timer = window.setTimeout(() => {
    if (tasbihMessageEl.textContent === message) {
      tasbihMessageEl.textContent = "";
    }
  }, 1800);
}

function animateTap() {
  tasbihCountEl.classList.remove("count-pop");
  void tasbihCountEl.offsetWidth;
  tasbihCountEl.classList.add("count-pop");

  tasbihPhraseEl.classList.remove("is-animated");
  void tasbihPhraseEl.offsetWidth;
  tasbihPhraseEl.classList.add("is-animated");

  tasbihPadBtn.classList.remove("is-tapped");
  void tasbihPadBtn.offsetWidth;
  tasbihPadBtn.classList.add("is-tapped");
}

function render() {
  tasbihCountEl.textContent = String(state.count);
  tasbihPhraseEl.textContent = state.phrase;

  dhikrPresetButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.phrase === state.phrase);
  });
}

function increment() {
  state.count += 1;
  saveState();
  render();
  animateTap();

  if (navigator.vibrate) {
    navigator.vibrate(10);
  }
}

function resetCounter() {
  if (!window.confirm("هل تريد تصفير العداد؟")) {
    return;
  }

  state.count = 0;
  saveState();
  render();
  flashMessage("تم تصفير العداد");
}

function setPhrase(phrase) {
  state.phrase = phrase;
  saveState();
  render();
  animateTap();
  flashMessage(`تم اختيار: ${phrase}`);
}

function setAdhkarTab(tabName) {
  const morningActive = tabName !== "evening";

  adhkarTabs.forEach((tab) => {
    const isActive = tab.dataset.tab === (morningActive ? "morning" : "evening");
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  adhkarMorningPanel.classList.toggle("active", morningActive);
  adhkarMorningPanel.hidden = !morningActive;

  adhkarEveningPanel.classList.toggle("active", !morningActive);
  adhkarEveningPanel.hidden = morningActive;

  localStorage.setItem(ADHKAR_TAB_KEY, morningActive ? "morning" : "evening");
}

tasbihPadBtn.addEventListener("click", increment);

tasbihResetBtn.addEventListener("click", resetCounter);

dhikrPresetButtons.forEach((button) => {
  button.addEventListener("click", () => setPhrase(button.dataset.phrase));
});

adhkarTabs.forEach((tab) => {
  tab.addEventListener("click", () => setAdhkarTab(tab.dataset.tab));
});

window.addEventListener("keydown", (event) => {
  if (event.key === " ") {
    event.preventDefault();
    increment();
  }

  if (event.key.toLowerCase() === "r") {
    resetCounter();
  }
});

render();
setAdhkarTab(localStorage.getItem(ADHKAR_TAB_KEY) || "morning");
