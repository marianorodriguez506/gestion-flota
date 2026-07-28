function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Metodo no permitido." });
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  return json(res, 200, { publicKey, configured: Boolean(publicKey) });
};
