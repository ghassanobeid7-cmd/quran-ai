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
  const cleaned = String(text || "").trim();
  if (!cleaned) {
    return notice;
  }
  if (cleaned.includes(notice)) {
    return cleaned;
  }
  return `${cleaned} ${notice}`;
}

function formatMoreLines(text) {
  let output = String(text || "").replace(/\s+/g, " ").trim();
  if (!output) {
    return output;
  }

  return output;
}

function getSectionText(entry) {
  if (typeof entry === "string") {
    return entry;
  }
  if (entry && Array.isArray(entry.tafsir_sections)) {
    return String(entry.tafsir_sections[0]?.tafsir || "").replace(/\s+/g, " ").trim();
  }
  return "";
}

function splitTransitionText(text, surahs) {
  const cleaned = String(text || "").trim();
  if (!cleaned || surahs.length < 2) {
    return null;
  }

  const transitionRegex = /(?:\n|\s)(?:ثم\s+)?(?:تفتتح|تبدأ)\s+سورة\s+/u;
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
    const sName = cleanSurahName(surah.name);
    let lastPage = 1;

    for (const ayah of surah.ayahs) {
      const page = Number(ayah.page);
      lastPage = page;

      if (!pageSurahs.has(page)) {
        pageSurahs.set(page, []);
      }

      const arr = pageSurahs.get(page);
      if (!arr.some((s) => s.surah_number === surah.number)) {
        arr.push({ surah_number: surah.number, surah: sName });
      }
    }

    surahLastPage.set(surah.number, lastPage);
  }

  for (let page = 101; page <= 150; page += 1) {
    const key = String(page);
    const pageEntry = tafsirPage[key];
    const pageText = getSectionText(pageEntry);
    const surahs = pageSurahs.get(page) || [];

    if (!surahs.length) {
      continue;
    }

    const sections = [];
    const splitText = splitTransitionText(pageText, surahs);

    if (surahs.length === 1) {
      const s = surahs[0];
      let tafsir = formatMoreLines(pageText);
      const isEnding = surahLastPage.get(s.surah_number) === page;
      if (isEnding) {
        tafsir = addEndNotice(tafsir, s.surah);
      }
      sections.push({
        surah: s.surah,
        surah_number: s.surah_number,
        tafsir
      });
    } else {
      for (let i = 0; i < surahs.length; i += 1) {
        const s = surahs[i];
        let source = pageText;

        if (splitText && splitText[i]) {
          source = splitText[i];
        }

        let tafsir = formatMoreLines(source);
        const isEnding = surahLastPage.get(s.surah_number) === page;
        if (isEnding) {
          tafsir = addEndNotice(tafsir, s.surah);
        }

        sections.push({
          surah: s.surah,
          surah_number: s.surah_number,
          tafsir
        });
      }
    }

    tafsirPage[key] = { page, tafsir_sections: sections };
  }

  await fs.writeFile(TAFSIR_PATH, `${JSON.stringify(tafsirPage, null, 2)}\n`, "utf8");
  console.log("تم إصلاح الصفحات 101-150 بصيغة tafsir_sections مع تنظيم أسطر التفسير.");
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exitCode = 1;
});
