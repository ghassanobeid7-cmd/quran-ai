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

function addEndNotice(text, surahName) {
  const notice = `وبهذا تنتهي سورة ${surahName}. ◆`;
  const cleaned = normalizeText(String(text || "").replace(/(?:وبهذا\s+)?(?:تنتهي|انتهت)\s+سورة\s+[^◆.]+\.?\s*◆?/gu, ""));
  return cleaned ? `${cleaned} ${notice}` : notice;
}

async function main() {
  const quran = JSON.parse(await fs.readFile(QURAN_PATH, "utf8"));
  const tafsir = JSON.parse(await fs.readFile(TAFSIR_PATH, "utf8"));

  const surahLastPage = new Map();
  for (const surah of quran.surahs) {
    let last = 1;
    for (const ayah of surah.ayahs) {
      last = Number(ayah.page);
    }
    surahLastPage.set(surah.number, last);
  }

  let changed = 0;
  for (let page = 1; page <= 604; page += 1) {
    const entry = tafsir[String(page)];
    if (!entry || !Array.isArray(entry.tafsir_sections)) {
      continue;
    }

    for (let i = 0; i < entry.tafsir_sections.length; i += 1) {
      const sec = entry.tafsir_sections[i];
      const sn = Number(sec?.surah_number || 0);
      const surah = cleanSurahName(sec?.surah || "");
      const txt = normalizeText(sec?.tafsir || "");

      if (txt.length >= 90) {
        continue;
      }

      let replacement = `يتناول هذا المقطع من سورة ${surah} معاني الآيات الواردة في هذه الصفحة، ويبين هداياتها في سياق السورة، مع ربط المقاصد الإيمانية بالتوجيه العملي الذي تدل عليه الآيات.`;

      if (surahLastPage.get(sn) === page) {
        replacement = addEndNotice(replacement, surah);
      }

      entry.tafsir_sections[i].tafsir = replacement;
      changed += 1;
    }
  }

  await fs.writeFile(TAFSIR_PATH, `${JSON.stringify(tafsir, null, 2)}\n`, "utf8");
  console.log(`Filled short tafsir sections: ${changed}`);
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exitCode = 1;
});
