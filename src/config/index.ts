import "dotenv/config";

const config = {
  kbbiUrl: "https://kbbi.kemendikdasmen.go.id/entri",
  wikiquoteProverbUrl: "https://id.wikiquote.org/wiki/Peribahasa_Indonesia",
  baseUrl: process.env.BASE_URL || "http://localhost:3000",
};

export default config;
