// Vercel серверийн функц: /api/news
// news.mn болон iKon.mn-ээс хамгийн сүүлийн Монголын мэдээг татаж, ангилж буцаана.
// Дэлхийн мэдээ, шар мэдээ, сурталчилгааг алгасна. 2 минут кэшлэнэ.

const NEWSMN = "https://news.mn/wp-json/wp/v2/posts?per_page=30";
const IKON = "https://ikon.mn/rss";

const MAP = ["Технологи", "Эрүүл мэнд", "Байгаль орчин", "Улс төр", "Эдийн засаг", "Спорт", "Нийгэм"];
const SKIP_CAT = ["Шар мэдээ", "Дуулиан", "Дэлхий", "Энтертайнмент"];
const KW = [
  ["Спорт", /тэмцээн|медаль|аварга|шигшээ|барилдаан|FIBA|бөх/i],
  ["Технологи", /хиймэл оюун|технологи|AI|апп|утас|вирус|кибер/i],
  ["Эрүүл мэнд", /эмнэлэг|өвчин|томуу|вакцин|эрүүл мэнд/i],
  ["Эдийн засаг", /банк|төсөв|ханш|инфляц|мөнгөний бодлого|экспорт|зээл|ногдол ашиг/i],
  ["Улс төр", /УИХ|Ерөнхийлөгч|Засгийн газар|сайд|нам|сонгууль|хууль/i],
];
const SKIP_TITLE = /амиа хорло|урамшуулалт аян|тохирлын эзэд|хямдрал|худалдаанд гарлаа/i;
const FOREIGN = /АНУ|ОХУ|Орос|Хятад|БНХАУ|Япон|Солонгос|БНСУ|Европ|Украин|Трамп|Путин|Ши Жиньпин|Итали|Дани|Польш|Мексик|Финланд|Эстони|Бразил|Франц|Герман|Англи|Израиль|Иран|Энэтхэг|Турк|Маск/;

const decode = (s) =>
  String(s || "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<\/?(strong|em|b|i|a|span|u)(\s[^>]*)?>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&hellip;/g, "…")
    .replace(/\s*\[…\]\s*$/, "…")
    .replace(/\s+/g, " ")
    .trim();

function parseTime(ct) {
  const now = Date.now();
  const m = /(\d+)\s*(минут|цаг)/.exec(ct || "");
  if (m) return new Date(now - Number(m[1]) * (m[2] === "цаг" ? 3600e3 : 60e3)).toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(ct || "")) return ct + "T12:00:00+08:00";
  return new Date(now).toISOString();
}

async function fromNewsMn() {
  const r = await fetch(NEWSMN, { headers: { accept: "application/json" } });
  if (!r.ok) return [];
  const posts = await r.json();
  const out = [];
  for (const p of posts) {
    const names = (p.category || []).map((c) => c.name);
    const t = decode(p.title && p.title.rendered);
    if (!t || names.some((n) => SKIP_CAT.includes(n)) || SKIP_TITLE.test(t) || FOREIGN.test(t)) continue;
    const c = MAP.find((m) => names.includes(m));
    if (!c) continue;
    out.push({ id: "newsmn-" + p.id, t, c, at: parseTime(p.current_time),
      b: [decode(p.excerpt && p.excerpt.rendered)], s: [["News.mn", "https://news.mn/r/" + p.id + "/"]] });
  }
  return out;
}

async function fromIkon() {
  const r = await fetch(IKON);
  if (!r.ok) return [];
  const xml = await r.text();
  const out = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const get = (tag) => ((new RegExp("<" + tag + ">([\\s\\S]*?)</" + tag + ">").exec(m[1]) || [])[1] || "");
    const t = decode(get("title"));
    const link = decode(get("link"));
    if (!t || !link || SKIP_TITLE.test(t) || FOREIGN.test(t)) continue;
    const c = (KW.find(([, re]) => re.test(t)) || ["Нийгэм"])[0];
    // iKon.mn-ээс бүтэн текстээр нийтлэх зөвшөөрөл авсан тул догол мөр бүрийг бүтнээр нь авна
    const raw = get("description").replace(/<!\[CDATA\[|\]\]>/g, "");
    let b = raw.split(/<\/p>|<br\s*\/?>\s*<br\s*\/?>/i).map(decode).filter((x) => x && !/^ШУУД ҮЗЭХ:?$/.test(x));
    if (!b.length) b = [decode(raw)];
    out.push({ id: "ikon-" + link.split("/").pop(), t, c,
      at: new Date(get("pubDate") || Date.now()).toISOString(), b, s: [["iKon.mn", link]] });
  }
  return out;
}

module.exports = async (req, res) => {
  const results = await Promise.allSettled([fromNewsMn(), fromIkon()]);
  const items = results.flatMap((x) => (x.status === "fulfilled" ? x.value : []));
  items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=600");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(200).send(JSON.stringify(items.slice(0, 40)));
};
