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

function sectionTemplateFromPageText(pageText, surahName, surahNumber, isEnding) {
  let tafsir = String(pageText || "").replace(/\s+/g, " ").trim();
  if (isEnding) {
    tafsir = addEndNotice(tafsir, surahName);
  }
  return {
    surah: surahName,
    surah_number: surahNumber,
    tafsir
  };
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

  for (let page = 1; page <= 50; page += 1) {
    const key = String(page);
    const pageEntry = tafsirPage[key];
    const pageText = typeof pageEntry === "string"
      ? pageEntry
      : (pageEntry?.tafsir_sections || []).map((s) => s.tafsir).join(" ").trim();

    const surahs = pageSurahs.get(page) || [];
    if (!surahs.length) {
      continue;
    }

    const sections = [];

    if (page === 1) {
      const fatiha = surahs.find((s) => s.surah_number === 1);
      const baqarah = surahs.find((s) => s.surah_number === 2);

      if (fatiha) {
        sections.push({
          surah: fatiha.surah,
          surah_number: 1,
          tafsir: addEndNotice(
            "تفتتح السورة بإثبات الاستعانة بالله وعموم رحمته، وتقرير حمده وربوبيته للعالمين وملكه ليوم الجزاء، ثم تجمع حقيقة العبادة في قوله تعالى: إياك نعبد وإياك نستعين. وتختم بطلب الهداية إلى صراط المنعم عليهم والبراءة من طريق المغضوب عليهم والضالين، فاجتمعت فيها أصول التوحيد والافتقار إلى الله.",
            fatiha.surah
          )
        });
      }

      if (baqarah) {
        sections.push({
          surah: baqarah.surah,
          surah_number: 2,
          tafsir: "يفتتح مطلع السورة بالحروف المقطعة الم تنبيها إلى إعجاز القرآن المركب من حروف العرب مع عجزهم عن معارضته، ثم يقرر أن هذا الكتاب هدى للمتقين، ويبين صفاتهم من الإيمان بالغيب وإقامة الصلاة والإنفاق والإيمان بما أنزل الله. فالمعنى أن الهداية ثمرة إيمان صادق يظهر أثره في الاعتقاد والعمل."
        });
      }

      tafsirPage[key] = { page, tafsir_sections: sections };
      continue;
    }

    if (surahs.length === 1) {
      const s = surahs[0];
      const isEnding = surahLastPage.get(s.surah_number) === page;
      sections.push(sectionTemplateFromPageText(pageText, s.surah, s.surah_number, isEnding));
      tafsirPage[key] = { page, tafsir_sections: sections };
      continue;
    }

    // Fallback for any other multi-surah page in first 50 (not expected except page 1).
    for (const s of surahs) {
      const isEnding = surahLastPage.get(s.surah_number) === page;
      let text = pageText;
      if (!text) {
        text = "تشرح هذه الآيات المعاني الظاهرة في هذا المقطع كما قررها أهل التفسير، مع بيان المقصد العام للسورة في هذا الموضع.";
      }
      if (isEnding) {
        text = addEndNotice(text, s.surah);
      }
      sections.push({
        surah: s.surah,
        surah_number: s.surah_number,
        tafsir: text
      });
    }

    tafsirPage[key] = { page, tafsir_sections: sections };
  }

  await fs.writeFile(TAFSIR_PATH, `${JSON.stringify(tafsirPage, null, 2)}\n`, "utf8");
  console.log("✅ تم إصلاح الصفحات 1-50 بصيغة tafsir_sections.");
}

main().catch((err) => {
  console.error("❌", err.message || err);
  process.exitCode = 1;
});
