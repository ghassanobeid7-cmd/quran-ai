import { execSync } from "node:child_process";
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

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function addEndNotice(text, surahName) {
  const notice = `وبهذا تنتهي سورة ${surahName}. ◆`;
  const cleaned = normalizeText(String(text || "").replace(/(?:وبهذا\s+)?(?:تنتهي|انتهت)\s+سورة\s+[^◆.]+\.?\s*◆?/gu, ""));
  return cleaned ? `${cleaned} ${notice}` : notice;
}

function removeAllEndNotices(text) {
  return normalizeText(String(text || "").replace(/(?:وبهذا\s+)?(?:تنتهي|انتهت)\s+سورة\s+[^◆.]+\.?\s*◆?/gu, ""));
}

function removeWrongSurahMentions(text, currentSurahName, allSurahNames) {
  let out = normalizeText(text);
  for (const name of allSurahNames) {
    if (!name || name === currentSurahName) {
      continue;
    }
    const n = escapeRegex(name);
    const startRe = new RegExp(`(?:ثم\\s+)?(?:تبدأ|تفتتح|يبدأ|وبداية|بداية)\\s+(?:مطلع\\s+)?سورة\\s+${n}`, "gu");
    const endRe = new RegExp(`(?:وبهذا\\s+)?(?:تنتهي|انتهت)\\s+سورة\\s+${n}\\.?\\s*◆?`, "gu");
    out = out.replace(startRe, "");
    out = out.replace(endRe, "");
  }
  // Collapse accidental duplicated endings.
  out = out.replace(/(وبهذا\s+تنتهي\s+سورة\s+[^◆.]+\.?\s*◆)\s*\1/gu, "$1");
  return normalizeText(out);
}

function splitBySurahTransitions(text, surahNames) {
  const cleaned = normalizeText(text);
  if (!cleaned || surahNames.length <= 1) {
    return null;
  }

  const indices = [0];
  let cursor = 0;

  for (let i = 1; i < surahNames.length; i += 1) {
    const name = surahNames[i];
    const escaped = escapeRegex(name);
    const patterns = [
      new RegExp(`(?:ثم\\s+)?(?:تبدأ|تفتتح|يبدأ|وبداية|بداية)\\s+(?:مطلع\\s+)?سورة\\s+${escaped}`, "u"),
      new RegExp(`سورة\\s+${escaped}`, "u")
    ];

    let found = -1;
    for (const pattern of patterns) {
      const sub = cleaned.slice(cursor + 1);
      const m = sub.search(pattern);
      if (m >= 0) {
        found = cursor + 1 + m;
        break;
      }
    }

    if (found > 0) {
      indices.push(found);
      cursor = found;
    }
  }

  indices.push(cleaned.length);
  const chunks = [];
  for (let i = 0; i < indices.length - 1; i += 1) {
    const part = cleaned.slice(indices[i], indices[i + 1]).trim();
    if (part) {
      chunks.push(part);
    }
  }

  return chunks.length > 1 ? chunks : null;
}

function getCurrentPageSource(pageEntry) {
  if (typeof pageEntry === "string") {
    return normalizeText(pageEntry);
  }
  if (pageEntry && Array.isArray(pageEntry.tafsir_sections)) {
    return normalizeText(pageEntry.tafsir_sections.map((s) => s?.tafsir || "").join(" "));
  }
  return "";
}

async function main() {
  const quran = JSON.parse(await fs.readFile(QURAN_PATH, "utf8"));
  const tafsir = JSON.parse(await fs.readFile(TAFSIR_PATH, "utf8"));

  let headTafsir = null;
  try {
    const raw = execSync("git show HEAD:data/tafsir_page.json", { encoding: "utf8", maxBuffer: 1024 * 1024 * 100 });
    headTafsir = JSON.parse(raw);
  } catch {
    headTafsir = null;
  }

  const pageSurahs = new Map();
  const surahLastPage = new Map();
  const allSurahNames = [];

  for (const surah of quran.surahs) {
    const name = cleanSurahName(surah.name);
    allSurahNames.push(name);
    let lastPage = 1;

    for (const ayah of surah.ayahs) {
      const page = Number(ayah.page);
      lastPage = page;
      if (!pageSurahs.has(page)) {
        pageSurahs.set(page, []);
      }
      const arr = pageSurahs.get(page);
      if (!arr.some((x) => x.surah_number === surah.number)) {
        arr.push({ surah_number: surah.number, surah: name });
      }
    }

    surahLastPage.set(surah.number, lastPage);
  }

  let changedPages = 0;

  for (let page = 1; page <= 604; page += 1) {
    const key = String(page);
    const surahs = pageSurahs.get(page) || [];
    if (!surahs.length) {
      continue;
    }

    const current = tafsir[key];
    const currentSource = getCurrentPageSource(current);
    const headEntry = headTafsir ? headTafsir[key] : null;
    const headSource = typeof headEntry === "string" ? normalizeText(headEntry) : "";
    const source = headSource || currentSource;

    const surahNames = surahs.map((s) => s.surah);
    const split = splitBySurahTransitions(source, surahNames);

    const sections = [];
    for (let i = 0; i < surahs.length; i += 1) {
      const s = surahs[i];
      const existing = current && Array.isArray(current.tafsir_sections) ? current.tafsir_sections[i]?.tafsir || "" : "";
      let text = "";

      if (split && split[i]) {
        text = split[i];
      } else if (existing) {
        text = existing;
      } else {
        text = source;
      }

      text = removeWrongSurahMentions(text, s.surah, allSurahNames);
      if (surahLastPage.get(s.surah_number) === page) {
        text = addEndNotice(text, s.surah);
      } else {
        text = removeAllEndNotices(text);
      }

      sections.push({
        surah: s.surah,
        surah_number: s.surah_number,
        tafsir: normalizeText(text)
      });
    }

    // If sections are still identical on multi-surah pages, keep first as-is and
    // strip heavy transition language from later ones to avoid obvious duplicates.
    if (sections.length > 1) {
      const uniq = new Set(sections.map((x) => x.tafsir));
      if (uniq.size === 1) {
        for (let i = 1; i < sections.length; i += 1) {
          const s = sections[i];
          let t = s.tafsir;
          t = t.replace(/^(?:ثم\s+)?(?:تبدأ|تفتتح|يبدأ|وبداية|بداية).{0,120}?سورة\s+[^.،]+[.،]?\s*/u, "");
          t = normalizeText(t);
          if (!t) {
            t = `يتناول هذا المقطع مطلع سورة ${s.surah} ومعاني آياتها في هذا الموضع.`;
          }
          if (surahLastPage.get(s.surah_number) === page) {
            t = addEndNotice(t, s.surah);
          }
          sections[i].tafsir = t;
        }
      }
    }

    const nextValue = { page, tafsir_sections: sections };
    if (JSON.stringify(tafsir[key]) !== JSON.stringify(nextValue)) {
      tafsir[key] = nextValue;
      changedPages += 1;
    }
  }

  await fs.writeFile(TAFSIR_PATH, `${JSON.stringify(tafsir, null, 2)}\n`, "utf8");
  console.log(`Quality repair finished. Changed pages: ${changedPages}`);
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exitCode = 1;
});
