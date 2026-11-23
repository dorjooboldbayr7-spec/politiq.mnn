// /api/admin — админы мэдээ нэмэх, засах, устгах. Нууц үг: Vercel-ийн ADMIN_PASSWORD
const crypto = require("crypto");
const { redis, listPosts, hasDb } = require("./_db");

const CATS = ["Улс төр", "Эдийн засаг", "Нийгэм", "Спорт", "Технологи", "Эрүүл мэнд", "Байгаль орчин"];

function ok(req) {
  const pass = process.env.ADMIN_PASSWORD || "";
  const got = String(req.headers["x-admin-password"] || "");
  if (!pass || got.length !== pass.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(pass));
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!process.env.ADMIN_PASSWORD) return res.status(500).json({ error: "Vercel дээр ADMIN_PASSWORD тохируулаагүй байна" });
  if (!hasDb()) return res.status(500).json({ error: "Vercel дээр Upstash Redis холбогдоогүй байна" });
  if (!ok(req)) return res.status(401).json({ error: "Нууц үг буруу" });

  try {
    if (req.method === "GET") return res.status(200).json(await listPosts());

    if (req.method === "POST" || req.method === "PUT") {
      const d = req.body || {};
      const t = String(d.t || "").trim();
      const b = String(d.body || "").split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
      if (!t || !b.length) return res.status(400).json({ error: "Гарчиг болон текст заавал хэрэгтэй" });
      const c = CATS.includes(d.c) ? d.c : "Нийгэм";

      let post;
      if (req.method === "PUT") {
        const old = await redis("HGET", "posts", String(d.id || ""));
        if (!old) return res.status(404).json({ error: "Мэдээ олдсонгүй" });
        post = { ...JSON.parse(old), t, c, b, pin: Boolean(d.pin) };
      } else {
        post = { id: "p-" + Date.now().toString(36) + crypto.randomBytes(2).toString("hex"),
                 t, c, b, at: new Date().toISOString(), pin: Boolean(d.pin), s: [] };
      }
      if (d.image && /^data:image\/(jpeg|png|webp);base64,/.test(d.image)) {
        if (d.image.length > 950000) return res.status(400).json({ error: "Зураг хэт том байна" });
        await redis("SET", "img:" + post.id, d.image);
        post.img = "/api/img?id=" + post.id + "&v=" + Date.now().toString(36);
      }
      if (post.pin) {
        // Нэг л мэдээ онцлох байна
        for (const p of await listPosts()) if (p.pin && p.id !== post.id) {
          p.pin = false; await redis("HSET", "posts", p.id, JSON.stringify(p));
        }
      }
      await redis("HSET", "posts", post.id, JSON.stringify(post));
      return res.status(200).json(post);
    }

    if (req.method === "DELETE") {
      const id = String((req.query && req.query.id) || "");
      await redis("HDEL", "posts", id);
      await redis("DEL", "img:" + id);
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    res.status(500).json({ error: "Серверийн алдаа: " + e.message });
  }
};
