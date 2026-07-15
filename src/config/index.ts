import "dotenv/config";

const config = {
  kbbiUrl: "https://kbbi.kemendikdasmen.go.id/entri",
  wikiquoteProverbUrl: "https://id.wikiquote.org/wiki/Peribahasa_Indonesia",
  wikiquoteIndonesianFigureUrl: "https://id.wikiquote.org/wiki/Kategori:Tokoh_Indonesia",
  baseUrl: process.env.BASE_URL || "http://localhost:3000",
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
};

export default config;
