const { supabaseAuth } = require("../config");

function bearerToken(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return null;
}

async function requireAuth(req, res, next) {
  if (!supabaseAuth) {
    return res.status(503).json({
      error:
        "Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env",
    });
  }
  const token = bearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "Authentication required." });
  }
  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ error: "Invalid or expired session." });
  }
  req.user = user;
  return next();
}

module.exports = { bearerToken, requireAuth };
