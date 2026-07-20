import "dotenv/config";

function parsePositiveIntegerEnv(name: string, defaultValue: number): number {
  const value = process.env[name];

  if (!value) {
    return defaultValue;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

const config = {
  kbbiUrl: "https://kbbi.kemendikdasmen.go.id/entri",
  wikiquoteProverbUrl: "https://id.wikiquote.org/wiki/Peribahasa_Indonesia",
  wikiquoteIndonesianFigureUrl: "https://id.wikiquote.org/wiki/Kategori:Tokoh_Indonesia",
  baseUrl: process.env.BASE_URL || "http://localhost:3000",
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
  rateLimit: {
    global: {
      windowMs: parsePositiveIntegerEnv("RATE_LIMIT_GLOBAL_WINDOW_MS", 15 * 60 * 1000),
      max: parsePositiveIntegerEnv("RATE_LIMIT_GLOBAL_MAX", 300),
    },
    scraper: {
      windowMs: parsePositiveIntegerEnv("RATE_LIMIT_SCRAPER_WINDOW_MS", 15 * 60 * 1000),
      max: parsePositiveIntegerEnv("RATE_LIMIT_SCRAPER_MAX", 30),
    },
  },
};

export default config;
