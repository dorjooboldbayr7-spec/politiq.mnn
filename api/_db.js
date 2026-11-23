// Upstash Redis (Vercel Storage) REST холболт. Нэмэлт сан суулгах шаардлагагүй.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(...cmd) {
  if (!URL_ || !TOKEN) throw new Error("NO_DB");
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

// Админы бүх мэдээ (зураггүйгээр)
async function listPosts() {
  const flat = (await redis("HGETALL", "posts")) || [];
  const out = [];
  for (let i = 0; i < flat.length; i += 2) {
    try { out.push(JSON.parse(flat[i + 1])); } catch {}
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

module.exports = { redis, listPosts, hasDb: () => Boolean(URL_ && TOKEN) };
