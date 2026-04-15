import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const QURAN_PATH = path.join(ROOT, "data", "quran.json");
const TAFSIR_PATH = path.join(ROOT, "data", "tafsir_page.json");

function cleanSurahName(name) {
  return String(name || "")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/^سورة\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function addEndNotice(text, surahName) {
  const notice = `وبهذا تنتهي سورة ${surahName}. ◆`;
  const cleaned = String(text || "")
    .replace(/◆\s*انتهت سورة\s+[^◆]+◆/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return notice;
  }
  if (cleaned.includes(notice)) {
    return cleaned;
  }
  return `${cleaned} ${notice}`;
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function getSectionText(entry) {
  if (typeof entry === "string") {
    return normalizeText(entry);
  }
  if (entry && Array.isArray(entry.tafsir_sections)) {
    return normalizeText(entry.tafsir_sections.map((section) => section?.tafsir || "").join(" "));
  }
  return "";
}

function splitTransitionText(text) {
  const cleaned = normalizeText(text);
  if (!cleaned) {
    return null;
  }

  const transitionRegex = /(?:\sثم\s+|\s)(?:تفتتح|تبدأ|يبدأ|◆\s*بداية)\s+(?:مطلع\s+)?سورة\s+/u;
  const transitionIndex = cleaned.search(transitionRegex);
  if (transitionIndex <= 0) {
    return null;
  }

  const before = cleaned.slice(0, transitionIndex).trim();
  const after = cleaned.slice(transitionIndex).trim();
  if (!before || !after) {
    return null;
  }

  return [before, after];
}

async function main() {
  const quran = JSON.parse(await fs.readFile(QURAN_PATH, "utf8"));
  const tafsirPage = JSON.parse(await fs.readFile(TAFSIR_PATH, "utf8"));

  const pageSurahs = new Map();
  const surahLastPage = new Map();

  for (const surah of quran.surahs) {
    const surahName = cleanSurahName(surah.name);
    let lastPage = 1;

    for (const ayah of surah.ayahs) {
      const page = Number(ayah.page);
      lastPage = page;

      if (!pageSurahs.has(page)) {
        pageSurahs.set(page, []);
      }

      const pageEntries = pageSurahs.get(page);
      if (!pageEntries.some((item) => item.surah_number === surah.number)) {
        pageEntries.push({ surah_number: surah.number, surah: surahName });
      }
    }

    surahLastPage.set(surah.number, lastPage);
  }

  for (let page = 251; page <= 300; page += 1) {
    const key = String(page);
    const pageEntry = tafsirPage[key];
    const pageText = getSectionText(pageEntry);
    const surahs = pageSurahs.get(page) || [];

    if (!surahs.length) {
      continue;
    }

    const sections = [];
    const splitText = surahs.length > 1 ? splitTransitionText(pageText) : null;

    if (surahs.length === 1) {
      const surah = surahs[0];
      let tafsir = normalizeText(pageText);
      if (surahLastPage.get(surah.surah_number) === page) {
        tafsir = addEndNotice(tafsir, surah.surah);
      }
      sections.push({
        surah: surah.surah,
        surah_number: surah.surah_number,
        tafsir
      });
    } else {
      for (let index = 0; index < surahs.length; index += 1) {
        const surah = surahs[index];
        const source = splitText && splitText[index] ? splitText[index] : pageText;
        let tafsir = normalizeText(source);
        if (surahLastPage.get(surah.surah_number) === page) {
          tafsir = addEndNotice(tafsir, surah.surah);
        }
        sections.push({
          surah: surah.surah,
          surah_number: surah.surah_number,
          tafsir
        });
      }
    }

    tafsirPage[key] = { page, tafsir_sections: sections };
  }

  await fs.writeFile(TAFSIR_PATH, `${JSON.stringify(tafsirPage, null, 2)}\n`, "utf8");
  console.log("تم إصلاح الصفحات 251-300 بصيغة tafsir_sections مع نص سطر واحد.");
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exitCode = 1;
});
