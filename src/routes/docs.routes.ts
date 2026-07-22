import { readFileSync } from "node:fs";
import path from "node:path";
import { Router } from "express";

const router = Router();
const openApiPath = path.resolve(process.cwd(), "docs/openapi.yaml");
const openApiYaml = readFileSync(openApiPath, "utf8");
const swaggerHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Swagger UI - New KBBI API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.32.10/swagger-ui.css" />
    <style>
      body {
        margin: 0;
        background: #ffffff;
      }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5.32.10/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/swagger-ui-dist@5.32.10/swagger-ui-standalone-preset.js"></script>
    <script>
      window.addEventListener("load", () => {
        window.ui = SwaggerUIBundle({
          url: "/docs/openapi.yaml",
          dom_id: "#swagger-ui",
          presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
          layout: "StandaloneLayout",
        });
      });
    </script>
  </body>
</html>`;

router.get("/docs/openapi.yaml", (req, res) => {
  res.type("application/yaml").send(openApiYaml);
});

router.get(["/docs", "/docs/"], (req, res) => {
  res.type("html").send(swaggerHtml);
});

export default router;
