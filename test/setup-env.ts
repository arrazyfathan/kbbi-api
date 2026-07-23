process.env.PORT = "3000";
process.env.BASE_URL = "http://localhost:3000";
process.env.RATE_LIMIT_GLOBAL_WINDOW_MS = "900000";
process.env.RATE_LIMIT_GLOBAL_MAX = "300";
process.env.RATE_LIMIT_SCRAPER_WINDOW_MS = "900000";
process.env.RATE_LIMIT_SCRAPER_MAX = "30";
process.env.WIKIQUOTE_CACHE_TTL_MS = "3600000";

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_ANON_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.VISITOR_HASH_SALT;
