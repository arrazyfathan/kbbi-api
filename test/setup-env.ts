process.env.PORT = "3000";
process.env.BASE_URL = "http://localhost:3000";
process.env.RATE_LIMIT_GLOBAL_WINDOW_MS = "900000";
process.env.RATE_LIMIT_GLOBAL_MAX = "300";
process.env.RATE_LIMIT_SCRAPER_WINDOW_MS = "900000";
process.env.RATE_LIMIT_SCRAPER_MAX = "30";
process.env.WIKIQUOTE_CACHE_TTL_MS = "3600000";
process.env.KBBI_FETCH_TIMEOUT_MS = "45000";
process.env.OPENAI_TIMEOUT_MS = "30000";
process.env.AI_RATE_LIMIT_WINDOW_MS = "900000";
process.env.AI_RATE_LIMIT_MAX = "10";

delete process.env.OPENAI_API_KEY;
delete process.env.OPENAI_MODEL;
delete process.env.OPENAI_BASE_URL;
delete process.env.AI_PROVIDERS;
delete process.env.AI_DEFAULT_PROVIDER;

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_ANON_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.VISITOR_HASH_SALT;
