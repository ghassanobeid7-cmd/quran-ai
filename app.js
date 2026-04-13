const STORAGE_KEYS = {
  bookmarks: "qt_bookmarks",
  khatma: "qt_khatma",
  settings: "qt_settings"
};

const state = {
  quran: null,
  tafsirAyah: {},
  tafsirPage: {},
  mode: "page",
  currentSurahIndex: 0,
  currentAyahIndex: 0,
  currentPage: 1,
  activeView: "homeView",
  bookmarks: [],
  khatma: { readAyahs: 0 },
  settings: {
    fontSize: 30,
    theme: "dark-gold",
    reciter: "ar.alafasy"
  },
  touchStartX: 0,
  touchStartY: 0
};

const BASMALA_TEXT = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ";

const readerEl = document.getElementById("reader");
const appShellEl = document.getElementById("appShell");
const surahSidebarEl = document.getElementById("surahSidebar");
const toggleSidebarBtnEl = document.getElementById("toggleSidebar");
const currentTitleEl = document.getElementById("currentTitle");
const currentMetaEl = document.getElementById("currentMeta");
const modeToggleEl = document.getElementById("modeToggle");
const bookmarkToggleEl = document.getElementById("bookmarkToggle");
const surahListEl = document.getElementById("surahList");
const surahSearchEl = document.getElementById("surahSearch");
const textSearchEl = document.getElementById("textSearch");
const searchResultsEl = document.getElementById("searchResults");
const bookmarksListEl = document.getElementById("bookmarksList");
const khatmaProgressEl = document.getElementById("khatmaProgress");
const fontSizeRangeEl = document.getElementById("fontSizeRange");
const themeSelectEl = document.getElementById("themeSelect");
const reciterSelectEl = document.getElementById("reciterSelect");
const pageInputEl = document.getElementById("pageInput");
const jumpBtnEl = document.getElementById("jumpBtn");

init().catch((error) => {
  const errorMessage = error?.message || String(error) || "خطأ غير معروف";
  readerEl.innerHTML = `<p>تعذر تحميل البيانات: ${errorMessage}</p>`;
});

async function init() {
  loadFromStorage();
  applySettings();
  bindEvents();
  await cleanupDevCaches();
  await preloadEverything();
  renderSurahList();
  renderCurrent();
  updateBookmarksView();
  updateKhatmaView();
  registerServiceWorker();
}

async function cleanupDevCaches() {
  const host = window.location.hostname;
  const isLocalHost = host === "localhost" || host === "127.0.0.1";

  if (!isLocalHost) {
    return;
  }

  if ("serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    } catch {
      // Ignore cleanup issues on development hosts.
    }
  }

  if ("caches" in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("quran-tafsir-v"))
          .map((key) => caches.delete(key))
      );
    } catch {
      // Ignore cache cleanup failures in development.
    }
  }
}

function loadFromStorage() {
  const bookmarks = readJSON(STORAGE_KEYS.bookmarks, []);
  const khatma = readJSON(STORAGE_KEYS.khatma, { readAyahs: 0 });
  const settings = readJSON(STORAGE_KEYS.settings, state.settings);

  state.bookmarks = bookmarks;
  state.khatma = khatma;
  state.settings = { ...state.settings, ...settings };
}

function readJSON(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

async function fetchJSONWithFallback(urlCandidates) {
  let lastError = null;

  for (const url of urlCandidates) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status} عند تحميل ${url}`);
        continue;
      }

      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("تعذر تحميل ملف JSON");
}

async function preloadEverything() {
  const quranPathCandidates = [
    "data/quran.json",
    "./data/quran.json",
    "/data/quran.json"
  ];
  const tafsirPathCandidates = [
    "data/tafsir_page.json",
    "./data/tafsir_page.json",
    "/data/tafsir_page.json"
  ];

  try {
    const [quran, tafsirPage] = await Promise.all([
      fetchJSONWithFallback(quranPathCandidates),
      fetchJSONWithFallback(tafsirPathCandidates)
    ]);
    state.quran = quran;
    state.tafsirPage = tafsirPage;
  } catch (error) {
    throw new Error(`تعذر تحميل ملفات البيانات الأساسية. ${error?.message || ""}`.trim());
  }

  const warmAssets = [
    "./",
    "index.html",
    "style.css",
    "app.js",
    "sw.js",
    "manifest.json",
    "icons/icon-192.svg",
    "icons/icon-512.svg"
  ];

  if ("caches" in window) {
    const cache = await caches.open("quran-tafsir-v5");
    await Promise.all(
      warmAssets.map(async (url) => {
        try {
          await cache.add(url);
        } catch {
          // Ignore duplicates and offline install races.
        }
      })
    );
  }
}

function bindEvents() {
  document.getElementById("prevBtn").addEventListener("click", () => navigate(-1));
  document.getElementById("nextBtn").addEventListener("click", () => navigate(1));
  jumpBtnEl.addEventListener("click", jumpToPageFromInput);
  pageInputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      jumpToPageFromInput();
    }
  });
  document.getElementById("audioBtn").addEventListener("click", playCurrentAyah);
  document.getElementById("markReadBtn").addEventListener("click", markRead);
  toggleSidebarBtnEl.addEventListener("click", () => {
    setSidebarOpen(!appShellEl.classList.contains("sidebar-open"));
  });

  modeToggleEl.addEventListener("click", () => {
    window.location.href = "azkar.html";
  });

  bookmarkToggleEl.addEventListener("click", toggleBookmark);

  surahSearchEl.addEventListener("input", renderSurahList);
  textSearchEl.addEventListener("input", runTextSearch);

  fontSizeRangeEl.value = String(state.settings.fontSize);
  themeSelectEl.value = state.settings.theme;
  reciterSelectEl.value = state.settings.reciter;

  fontSizeRangeEl.addEventListener("input", (event) => {
    state.settings.fontSize = Number(event.target.value);
    persistSettings();
  });

  themeSelectEl.addEventListener("change", (event) => {
    state.settings.theme = event.target.value;
    persistSettings();
  });

  reciterSelectEl.addEventListener("change", (event) => {
    state.settings.reciter = event.target.value;
    persistSettings();
  });

  document.querySelectorAll(".mobile-nav button").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.href) {
        window.location.href = button.dataset.href;
        return;
      }
      switchView(button.dataset.view);
    });
  });

  document.addEventListener("keydown", handleKeyboard);

  readerEl.addEventListener("touchstart", (event) => {
    const touch = event.changedTouches[0];
    state.touchStartX = touch.clientX;
    state.touchStartY = touch.clientY;
  });

  readerEl.addEventListener("touchend", (event) => {
    const touch = event.changedTouches[0];
    const dx = touch.clientX - state.touchStartX;
    const dy = touch.clientY - state.touchStartY;

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30 && state.mode === "page") {
      navigate(dx < 0 ? 1 : -1);
    }

    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 30 && state.mode === "ayah") {
      moveSurah(dy < 0 ? 1 : -1);
    }
  });

  document.addEventListener("click", (event) => {
    if (!appShellEl.classList.contains("sidebar-open")) {
      return;
    }

    if (surahSidebarEl.contains(event.target) || toggleSidebarBtnEl.contains(event.target)) {
      return;
    }

    setSidebarOpen(false);
  });
}

function setSidebarOpen(isOpen) {
  appShellEl.classList.toggle("sidebar-open", isOpen);
  toggleSidebarBtnEl.setAttribute("aria-expanded", String(isOpen));
}

function switchView(viewId) {
  state.activeView = viewId;
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === viewId);
  });

  document.querySelectorAll(".mobile-nav button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewId);
  });
}

function applySettings() {
  document.documentElement.style.setProperty("--font-size", `${state.settings.fontSize}px`);
  document.documentElement.dataset.theme = state.settings.theme;
}

function persistSettings() {
  applySettings();
  writeJSON(STORAGE_KEYS.settings, state.settings);
}

function normalizeArabic(input) {
  return String(input || "")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[\u0622\u0623\u0625]/g, "ا")
    .replace(/\u0629/g, "ه")
    .replace(/\u0649/g, "ي")
    .replace(/\u0624/g, "و")
    .replace(/\u0626/g, "ي")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function jumpToSurah(surahIndex) {
  const safeIndex = Math.min(state.quran.surahs.length - 1, Math.max(0, surahIndex));
  const surah = state.quran.surahs[safeIndex];
  state.currentSurahIndex = safeIndex;
  state.currentAyahIndex = 0;
  state.currentPage = Number(surah?.ayahs?.[0]?.page) || state.currentPage;
  state.mode = "page";
  modeToggleEl.textContent = "المسبحة";
  switchView("homeView");
  renderCurrent();
}

function renderSurahList() {
  const query = surahSearchEl.value.trim();
  const normalizedQuery = normalizeArabic(query);
  const filtered = state.quran.surahs
    .map((surah, surahIndex) => ({ surah, surahIndex }))
    .filter(({ surah }) => {
      if (!normalizedQuery) {
        return true;
      }

      const normalizedName = normalizeArabic(surah.name).replace(/^سوره\s*/g, "");
      const normalizedEnglish = normalizeArabic(surah.englishName);
      const normalizedNumber = String(surah.number);

      return (
        normalizedName.includes(normalizedQuery) ||
        normalizeArabic(surah.name).includes(normalizedQuery) ||
        normalizedEnglish.includes(normalizedQuery) ||
        normalizedNumber === normalizedQuery
      );
    });

  surahListEl.innerHTML = "";

  if (!filtered.length) {
    const li = document.createElement("li");
    li.className = "surah-item";
    li.textContent = "لا توجد سورة مطابقة";
    surahListEl.appendChild(li);
    return;
  }

  filtered.forEach(({ surah, surahIndex }) => {
    const li = document.createElement("li");
    li.className = "surah-item";
    li.innerHTML = `
      <strong>${surah.name}</strong>
      <div>${surah.ayahs.length} آية • ${surah.revelationType}</div>
    `;
    li.addEventListener("click", () => {
      jumpToSurah(surahIndex);
      setSidebarOpen(false);
    });
    surahListEl.appendChild(li);
  });
}

function getCurrentAyah() {
  const surah = state.quran.surahs[state.currentSurahIndex];
  return {
    surah,
    ayah: surah.ayahs[state.currentAyahIndex]
  };
}

function renderCurrent() {
  if (state.mode === "ayah") {
    renderAyahMode();
  } else {
    renderPageMode();
  }
  updateBookmarkButton();
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function splitLeadingBasmala(rawText, surahNumber, ayahNumberInSurah) {
  const text = String(rawText || "").replace(/^\uFEFF/, "").trim();

  // In Al-Fatiha, basmala is part of the ayah text and should remain inline.
  if (Number(surahNumber) === 1 && Number(ayahNumberInSurah) === 1) {
    return { hasBasmala: false, body: text };
  }

  if (!text.startsWith(BASMALA_TEXT)) {
    return { hasBasmala: false, body: text };
  }

  return {
    hasBasmala: true,
    body: text.slice(BASMALA_TEXT.length).trim()
  };
}

function renderAyahMode() {
  const { surah, ayah } = getCurrentAyah();
  const ayahKey = `${surah.number}:${ayah.numberInSurah}`;
  const tafsir = state.tafsirAyah[ayahKey] || "لا يوجد تفسير متاح حالياً لهذه الآية.";
  const ayahSplit = splitLeadingBasmala(ayah.text, surah.number, ayah.numberInSurah);
  const ayahTextHtml = ayahSplit.body
    ? `<p>${escapeHtml(ayahSplit.body)} <span class="ayah-number">(${ayah.numberInSurah})</span></p>`
    : `<p><span class="ayah-number">(${ayah.numberInSurah})</span></p>`;

  currentTitleEl.textContent = surah.name;
  currentMetaEl.textContent = `آية ${ayah.numberInSurah} - صفحة ${ayah.page}`;
  state.currentPage = ayah.page;

  readerEl.innerHTML = `
    ${ayahSplit.hasBasmala ? `<div class="basmala-display">${BASMALA_TEXT}</div>` : ""}
    ${ayahTextHtml}
    <div class="tafsir-box">${tafsir}</div>
  `;
}

function renderPageMode() {
  const pageAyahs = [];
  state.quran.surahs.forEach((surah, surahIndex) => {
    surah.ayahs.forEach((ayah, ayahIndex) => {
      if (Number(ayah.page) === Number(state.currentPage)) {
        pageAyahs.push({ surah, ayah, surahIndex, ayahIndex });
      }
    });
  });

  if (pageAyahs.length) {
    state.currentSurahIndex = pageAyahs[0].surahIndex;
    state.currentAyahIndex = pageAyahs[0].ayahIndex;
  }

  currentTitleEl.textContent = `الصفحة ${state.currentPage}`;
  currentMetaEl.textContent = `${pageAyahs.length} آية`;

  const textHtml = pageAyahs
    .map((item, index) => {
      const ayahSplit = splitLeadingBasmala(item.ayah.text, item.surah.number, item.ayah.numberInSurah);
      const parts = [];
      const isFirstInSurah = index === 0 || pageAyahs[index - 1].surah.number !== item.surah.number;

      if (isFirstInSurah) {
        parts.push(`<div class="surah-inline-title">${escapeHtml(item.surah.name)}</div>`);
        if (Number(item.surah.number) !== 9) {
          parts.push(`<div class="basmala-display">${BASMALA_TEXT}</div>`);
        }
      }

      if (ayahSplit.hasBasmala) {
        // Basmala already rendered at surah start for page mode.
      }

      if (ayahSplit.body) {
        parts.push(`${escapeHtml(ayahSplit.body)} <span class="ayah-number">(${item.ayah.numberInSurah})</span>`);
      }

      return parts.join(" ");
    })
    .filter(Boolean)
    .join(" ");

  const tafsir = state.tafsirPage[String(state.currentPage)] || "لا يوجد تفسير متاح لهذه الصفحة.";
  const tafsirHtml = String(tafsir)
    .split(/\n/)
    .map((line) => {
      const safeLine = line
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      if (!safeLine.trim()) {
        return "<br>";
      }

      if (safeLine.startsWith("◆ ")) {
        return `<div class="tafsir-marker">${safeLine}</div>`;
      }

      if (safeLine.startsWith("تنبيه:")) {
        return `<div class="tafsir-note">${safeLine}</div>`;
      }

      return `<div class="tafsir-line">${safeLine}</div>`;
    })
    .join("");

  readerEl.innerHTML = `
    <div class="page-ayahs">${textHtml || "لا توجد آيات في هذه الصفحة ضمن البيانات الحالية."}</div>
    <div class="tafsir-box">${tafsirHtml}</div>
  `;
}

function navigate(step) {
  if (state.mode === "ayah") {
    const surah = state.quran.surahs[state.currentSurahIndex];
    const nextAyahIndex = state.currentAyahIndex + step;

    if (nextAyahIndex < 0) {
      moveSurah(-1, true);
      return;
    }

    if (nextAyahIndex >= surah.ayahs.length) {
      moveSurah(1, false);
      return;
    }

    state.currentAyahIndex = nextAyahIndex;
  } else {
    const maxPage = getMaxPage();
    state.currentPage = Math.min(maxPage, Math.max(1, state.currentPage + step));
  }

  renderCurrent();
}

function jumpToPageFromInput() {
  const pageNum = Number.parseInt(pageInputEl.value, 10);
  if (Number.isNaN(pageNum)) {
    return;
  }

  const maxPage = getMaxPage();
  state.currentPage = Math.min(maxPage, Math.max(1, pageNum));
  pageInputEl.value = String(state.currentPage);
  state.mode = "page";
  modeToggleEl.textContent = "المسبحة";
  renderCurrent();
}

function getMaxPage() {
  const quranMax = Number(state.quran?.meta?.totalPages) || 604;
  const tafsirKeys = Object.keys(state.tafsirPage || {})
    .map((key) => Number.parseInt(key, 10))
    .filter(Number.isFinite);
  const tafsirMax = tafsirKeys.length ? Math.max(...tafsirKeys) : 0;
  return Math.max(quranMax, tafsirMax, 1);
}

function moveSurah(step, fromEnd = false) {
  const nextSurahIndex = state.currentSurahIndex + step;
  if (nextSurahIndex < 0 || nextSurahIndex >= state.quran.surahs.length) {
    return;
  }

  state.currentSurahIndex = nextSurahIndex;
  const surah = state.quran.surahs[state.currentSurahIndex];
  state.currentAyahIndex = fromEnd ? surah.ayahs.length - 1 : 0;
  renderCurrent();
}

function runTextSearch() {
  const query = textSearchEl.value.trim();
  const normalizedQuery = normalizeArabic(query);
  searchResultsEl.innerHTML = "";

  if (!query) {
    return;
  }

  const surahMatches = state.quran.surahs
    .map((surah, surahIndex) => ({ surah, surahIndex }))
    .filter(({ surah }) => {
      const normalizedName = normalizeArabic(surah.name).replace(/^سوره\s*/g, "");
      return (
        normalizedName.includes(normalizedQuery) ||
        normalizeArabic(surah.name).includes(normalizedQuery) ||
        normalizeArabic(surah.englishName).includes(normalizedQuery) ||
        String(surah.number) === normalizedQuery
      );
    })
    .slice(0, 12);

  surahMatches.forEach(({ surah, surahIndex }) => {
    const li = document.createElement("li");
    li.className = "result-item";
    li.textContent = `سورة: ${surah.name} — انتقال إلى بداية السورة`;
    li.addEventListener("click", () => jumpToSurah(surahIndex));
    searchResultsEl.appendChild(li);
  });

  const results = [];
  state.quran.surahs.forEach((surah, surahIndex) => {
    surah.ayahs.forEach((ayah, ayahIndex) => {
      if (normalizeArabic(ayah.text).includes(normalizedQuery)) {
        results.push({ surah, ayah, surahIndex, ayahIndex });
      }
    });
  });

  results.slice(0, 200).forEach((item) => {
    const li = document.createElement("li");
    li.className = "result-item";
    li.textContent = `${item.surah.name} - آية ${item.ayah.numberInSurah}: ${item.ayah.text}`;
    li.addEventListener("click", () => {
      state.mode = "page";
      modeToggleEl.textContent = "المسبحة";
      state.currentSurahIndex = item.surahIndex;
      state.currentAyahIndex = item.ayahIndex;
      state.currentPage = Number(item.ayah.page) || state.currentPage;
      switchView("homeView");
      renderCurrent();
    });
    searchResultsEl.appendChild(li);
  });

  if (!surahMatches.length && !results.length) {
    const li = document.createElement("li");
    li.className = "result-item";
    li.textContent = "لا توجد نتائج مطابقة";
    searchResultsEl.appendChild(li);
  }
}

function toggleBookmark() {
  const { surah, ayah } = getCurrentAyah();
  const key = `${surah.number}:${ayah.numberInSurah}`;
  const existingIndex = state.bookmarks.findIndex((item) => item.key === key);

  if (existingIndex >= 0) {
    state.bookmarks.splice(existingIndex, 1);
  } else {
    state.bookmarks.push({
      key,
      surahId: surah.number,
      ayahInSurah: ayah.numberInSurah,
      label: `${surah.name} - آية ${ayah.numberInSurah}`
    });
  }

  writeJSON(STORAGE_KEYS.bookmarks, state.bookmarks);
  updateBookmarksView();
  updateBookmarkButton();
}

function updateBookmarkButton() {
  const { surah, ayah } = getCurrentAyah();
  const key = `${surah.number}:${ayah.numberInSurah}`;
  const exists = state.bookmarks.some((item) => item.key === key);
  bookmarkToggleEl.style.color = exists ? "var(--accent)" : "var(--text)";
}

function updateBookmarksView() {
  bookmarksListEl.innerHTML = "";

  if (!state.bookmarks.length) {
    bookmarksListEl.innerHTML = "<li class='result-item'>لا توجد إشارات حالياً.</li>";
    return;
  }

  state.bookmarks.forEach((bookmark) => {
    const li = document.createElement("li");
    li.className = "result-item";
    li.textContent = bookmark.label;
    li.addEventListener("click", () => {
      jumpToBookmark(bookmark);
    });
    bookmarksListEl.appendChild(li);
  });
}

function jumpToBookmark(bookmark) {
  state.mode = "page";
  modeToggleEl.textContent = "المسبحة";
  state.currentSurahIndex = bookmark.surahId - 1;
  state.currentAyahIndex = bookmark.ayahInSurah - 1;
  switchView("homeView");
  renderCurrent();
}

function markRead() {
  const { ayah } = getCurrentAyah();
  state.khatma.readAyahs = Math.max(state.khatma.readAyahs, ayah.number);
  writeJSON(STORAGE_KEYS.khatma, state.khatma);
  updateKhatmaView();
}

function updateKhatmaView() {
  const total = state.quran?.meta?.totalAyahs || 6236;
  const read = state.khatma.readAyahs;
  const percent = ((read / total) * 100).toFixed(2);
  khatmaProgressEl.textContent = `أنهيت ${read} من ${total} آية (${percent}%).`;
}

function playCurrentAyah() {
  const { surah, ayah } = getCurrentAyah();
  const surahPart = String(surah.number).padStart(3, "0");
  const ayahPart = String(ayah.numberInSurah).padStart(3, "0");
  const url = `https://everyayah.com/data/Alafasy_128kbps/${surahPart}${ayahPart}.mp3`;
  const audio = new Audio(url);
  audio.play().catch(() => {
    alert("تعذر تشغيل الصوت. تأكد من الاتصال أو جرّب لاحقاً.");
  });
}

function handleKeyboard(event) {
  if (event.key === "ArrowRight") {
    navigate(1);
  } else if (event.key === "ArrowLeft") {
    navigate(-1);
  } else if (event.key === "ArrowUp" && state.mode === "ayah") {
    navigate(-1);
  } else if (event.key === "ArrowDown" && state.mode === "ayah") {
    navigate(1);
  } else if (event.key === "/") {
    event.preventDefault();
    switchView("searchView");
    textSearchEl.focus();
  } else if (event.key.toLowerCase() === "b") {
    toggleBookmark();
  }
}

function registerServiceWorker() {
  const host = window.location.hostname;
  const isLocalHost = host === "localhost" || host === "127.0.0.1";
  if (isLocalHost) {
    return;
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // Service worker registration failure should not break reading.
    });
  }
}
