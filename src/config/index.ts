import "dotenv/config";

const config = {
  kbbiUrl: "https://kbbi.kemendikdasmen.go.id/entri",
  baseUrl: process.env.BASE_URL || "http://localhost:3000",
};

export default config;
