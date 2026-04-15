import { promises as fs } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const ROOT = process.cwd();
const QURAN_PATH = path.join(ROOT, "data", "quran.json");
const TAFSIR_PAGE_PATH = path.join(ROOT, "data", "tafsir_page.json");
const MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY غير مضبوط. عيّن المفتاح ثم أعد التشغيل.");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanSurahName(name) {
  return String(name || "").replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "").replace(/\s+/g, " ").trim();
}

function buildPageMap(quran) {
  const map = new Map();

  quran.surahs.forEach((surah) => {
    const surahName = cleanSurahName(surah.name);
    const totalAyahs = surah.ayahs.length;

    surah.ayahs.forEach((ayah) => {
      const page = Number(ayah.page);
      if (!map.has(page)) {
        map.set(page, []);
      }
      map.get(page).push({
        surahNumber: surah.number,
        surahName,
        ayahNumberInSurah: ayah.numberInSurah,
        ayahText: String(ayah.text || "").replace(/^\uFEFF/, "").trim(),
        totalAyahs
      });
    });
  });

  const normalized = new Map();
  Array.from(map.keys()).sort((a, b) => a - b).forEach((page) => {
    const items = map.get(page);
    const grouped = [];
    const bySurah = new Map();

    items.forEach((item) => {
      if (!bySurah.has(item.surahNumber)) {
        bySurah.set(item.surahNumber, {
          surah_number: item.surahNumber,
          surah: item.surahName,
          ayahs: [],
          endsOnPage: false
        });
        grouped.push(bySurah.get(item.surahNumber));
      }
      bySurah.get(item.surahNumber).ayahs.push({
        numberInSurah: item.ayahNumberInSurah,
        text: item.ayahText
      });
    });

    grouped.forEach((section) => {
      const lastAyah = section.ayahs[section.ayahs.length - 1];
      const meta = items.find((it) => it.surahNumber === section.surah_number);
      section.endsOnPage = Boolean(lastAyah && meta && lastAyah.numberInSurah === meta.totalAyahs);
    });

    normalized.set(page, grouped);
  });

  return normalized;
}

function buildSectionPrompt({ page, section }) {
  const ayahLines = section.ayahs.map((a) => `${a.numberInSurah}) ${a.text}`).join("\n");

  return [
    "أنت مفسّر قرآني من أهل السنة والجماعة.",
    "مصادرك الوحيدة: القرآن الكريم وتفسير السعدي (تيسير الكريم الرحمن).",
    "ممنوع الإضافة من عندك أو اختراع معانٍ.",
    "",
    "قواعد الكتابة الإلزامية:",
    "- العربية الفصحى السليمة بلا أخطاء إملائية أو نحوية.",
    "- شرح معنى الآيات نفسها فقط، بلا خروج ولا أمثلة حياتية.",
    "- بلا حشو ولا تكرار.",
    "- اكتب فقرة واحدة واضحة ومتماسكة في سطر واحد بلا فواصل أسطر.",
    "- احرص على مرجع واضح للضمائر.",
    "",
    `الصفحة: ${page}`,
    `السورة: ${section.surah} (${section.surah_number})`,
    "الآيات الموجودة في هذه الصفحة من هذه السورة:",
    ayahLines,
    "",
    "أعد النتيجة فقط بصيغة JSON التالية دون أي نص إضافي:",
    "{\"tafsir\":\"...\"}"
  ].join("\n");
}

async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024,
          topP: 0.9
        }
      })
    });

    if (!response.ok) {
      if (attempt === 4) {
        const body = await response.text();
        throw new Error(`Gemini HTTP ${response.status}: ${body}`);
      }
      await sleep(1500 * attempt);
      continue;
    }

    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n").trim();

    if (!text) {
      if (attempt === 4) {
        throw new Error("Gemini returned empty content.");
      }
      await sleep(1200 * attempt);
      continue;
    }

    return text;
  }

  throw new Error("Gemini call failed after retries.");
}

function parseSectionText(raw) {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  const candidate = match ? match[0] : cleaned;

  try {
    const parsed = JSON.parse(candidate);
    const tafsir = String(parsed?.tafsir || "").trim();
    if (!tafsir) {
      throw new Error("Empty tafsir");
    }
    return tafsir;
  } catch {
    // Fallback: use raw text when model returns non-JSON.
    return cleaned;
  }
}

function addEndOfSurahNotice(text, surahName) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return trimmed;
  }

  const notice = `وبهذا تنتهي سورة ${surahName}. ◆`;
  if (trimmed.includes(notice)) {
    return trimmed;
  }
  return `${trimmed} ${notice}`;
}

async function readJson(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content);
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function main() {
  const quran = await readJson(QURAN_PATH);
  const tafsirPage = await readJson(TAFSIR_PAGE_PATH);
  const pageMap = buildPageMap(quran);

  const rl = readline.createInterface({ input, output });

  try {
    for (let batchStart = 1; batchStart <= 604; batchStart += 50) {
      const batchEnd = Math.min(604, batchStart + 49);

      for (let page = batchStart; page <= batchEnd; page += 1) {
        const sections = pageMap.get(page) || [];
        if (!sections.length) {
          continue;
        }

        const pagePayload = {
          page,
          tafsir_sections: []
        };

        for (const section of sections) {
          const prompt = buildSectionPrompt({ page, section });
          const raw = await callGemini(prompt);
          let tafsir = parseSectionText(raw);

          if (section.endsOnPage) {
            tafsir = addEndOfSurahNotice(tafsir, section.surah);
          }

          pagePayload.tafsir_sections.push({
            surah: section.surah,
            surah_number: section.surah_number,
            tafsir
          });

          await sleep(500);
        }

        tafsirPage[String(page)] = pagePayload;
        await writeJson(TAFSIR_PAGE_PATH, tafsirPage);
        console.log(`✅ صفحة ${page}/${604}`);
      }

      if (batchEnd < 604) {
        const answer = (await rl.question(`تم الانتهاء من الصفحات ${batchStart}-${batchEnd}. هل تريد المتابعة حتى الصفحة ${Math.min(604, batchEnd + 50)}؟ (y/n) `)).trim().toLowerCase();
        if (answer !== "y") {
          console.log("🛑 تم الإيقاف بناءً على طلب المستخدم. تم حفظ البيانات.");
          break;
        }
      }
    }

    await writeJson(TAFSIR_PAGE_PATH, tafsirPage);
    console.log("✅ اكتمل الحفظ النهائي.");
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error("❌", error.message || error);
  process.exitCode = 1;
});
