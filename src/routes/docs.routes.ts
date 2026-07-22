import { readFileSync } from "node:fs";
import path from "node:path";
import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import YAML from "yaml";

const router = Router();
const openApiPath = path.resolve(process.cwd(), "docs/openapi.yaml");
const openApiYaml = readFileSync(openApiPath, "utf8");
const openApiDocument = YAML.parse(openApiYaml);

router.get("/docs/openapi.yaml", (req, res) => {
  res.type("application/yaml").send(openApiYaml);
});

router.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

export default router;
