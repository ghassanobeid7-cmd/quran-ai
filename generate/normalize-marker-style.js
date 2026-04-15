import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const QURAN_PATH = path.join(ROOT, "data", "quran.json");
const TAFSIR_PATH = path.join(ROOT, "data", "tafsir_page.json");

function cleanSurahName(name) {
  return String(name || "")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/^\s*سورة\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function normalizeMarkers(text, surahName, isEnding) {
  let t = normalizeText(text);

  // Remove marker wrappers around transitions, keep sentence content.
  t = t.replace(/◆\s*(تبدأ|تفتتح|يبدأ|بداية)\s+/gu, "$1 ");
  t = t.replace(/◆\s*(وبهذا\s+)?(تنتهي|انتهت)\s+سورة\s+/gu, "$1$2 سورة ");

  // Collapse repeated marker chars.
  t = t.replace(/◆+/gu, "◆");

  // Standardize end notice when present.
  t = t.replace(/(?:وبهذا\s+)?(?:تنتهي|انتهت)\s+سورة\s+([^◆.]+)\.?\s*◆?/gu, (m, sName) => {
    const cleaned = cleanSurahName(sName);
    return `وبهذا تنتهي سورة ${cleaned}. ◆`;
  });

  // Remove markers not part of end notice.
  t = t.replace(/◆(?!\s*$)/gu, "");
  t = normalizeText(t);

  if (isEnding) {
    // Ending section: keep exactly one end notice and a single trailing marker.
    t = t.replace(/(?:وبهذا\s+)?(?:تنتهي|انتهت)\s+سورة\s+[^◆.]+\.?\s*◆?/gu, "");
    t = t.replace(/◆/gu, "");
    t = normalizeText(t);
    t = `${t} وبهذا تنتهي سورة ${surahName}. ◆`;
    t = normalizeText(t);
  } else {
    // Non-ending sections should not keep end notice or marker symbols.
    t = t.replace(/(?:وبهذا\s+)?(?:تنتهي|انتهت)\s+سورة\s+[^◆.]+\.?\s*◆?/gu, "");
    t = t.replace(/◆/gu, "");
    t = normalizeText(t);
  }

  return t;
}

async function main() {
  const quran = JSON.parse(await fs.readFile(QURAN_PATH, "utf8"));
  const tafsir = JSON.parse(await fs.readFile(TAFSIR_PATH, "utf8"));

  const surahLastPage = new Map();
  for (const surah of quran.surahs) {
    let lastPage = 1;
    for (const ayah of surah.ayahs) {
      lastPage = Number(ayah.page);
    }
    surahLastPage.set(surah.number, lastPage);
  }

  let changed = 0;
  for (let page = 1; page <= 604; page += 1) {
    const entry = tafsir[String(page)];
    if (!entry || !Array.isArray(entry.tafsir_sections)) {
      continue;
    }

    for (const section of entry.tafsir_sections) {
      const before = String(section.tafsir || "");
      const surahName = cleanSurahName(section.surah || "");
      const isEnding = surahLastPage.get(Number(section.surah_number)) === page;
      const after = normalizeMarkers(before, surahName, isEnding);
      if (before !== after) {
        section.tafsir = after;
        changed += 1;
      }
    }
  }

  await fs.writeFile(TAFSIR_PATH, `${JSON.stringify(tafsir, null, 2)}\n`, "utf8");
  console.log(`Marker normalization changed sections: ${changed}`);
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exitCode = 1;
});
