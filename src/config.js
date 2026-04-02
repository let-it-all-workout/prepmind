const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const root = path.join(__dirname, "..");

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";

module.exports = {
  publicDir: path.join(root, "public"),
  uploadsDir: path.join(root, "uploads"),
  port: Number(process.env.PORT) || 3000,
  supabaseUrl,
  supabaseAnonKey,
  supabaseAuth:
    supabaseUrl && supabaseAnonKey
      ? createClient(supabaseUrl, supabaseAnonKey)
      : null,
  orimise: {
    apiKey: process.env.ORIMISE_API_KEY || "",
    endpoint: process.env.ORIMISE_ENDPOINT || "",
    baseUrl: process.env.ORIMISE_BASE_URL || "",
    chatPath: process.env.ORIMISE_CHAT_PATH || "/chat/completions",
    defaultModel: process.env.ORIMISE_MODEL || "",
    studyModel: process.env.ORIMISE_MODEL_STUDY || "",
    quizModel: process.env.ORIMISE_MODEL_QUIZ || "",
    gradeModel: process.env.ORIMISE_MODEL_GRADE || "",
  },
};
