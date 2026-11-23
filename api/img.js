// /api/img?id=... — админы оруулсан зургийг харуулна
const { redis } = require("./_db");
module.exports = async (req, res) => {
  try {
    const data = await redis("GET", "img:" + String((req.query && req.query.id) || ""));
    const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(data || "");
    if (!m) return res.status(404).send("Not found");
    res.setHeader("Content-Type", m[1]);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.status(200).send(Buffer.from(m[2], "base64"));
  } catch { res.status(404).send("Not found"); }
};
