import express, { Application, NextFunction, Request, Response } from "express";
import cors from "cors";
import apiRouter from "./routes/api.routes";
import config from "./config";
import logger from "./lib/logger";
import { errorMiddleware } from "./middlewares/error.middleware";
import { requestLoggerMiddleware } from "./middlewares/request-logger.middleware";
import { globalRateLimiter } from "./middlewares/rate-limit.middleware";
import { notFoundError } from "./lib/api-error";

class App {
  public app: Application;

  constructor() {
    this.app = express();
    this.app.set("trust proxy", 1);
    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  public listen() {
    const port = config.port;
    this.app.listen(port, () => {
      logger.info({ port }, `Server is running at http://localhost:${port}`);
    });
  }

  private initializeMiddlewares() {
    this.app.use(requestLoggerMiddleware);
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(globalRateLimiter);
  }

  private initializeRoutes() {
    this.app.use(apiRouter);
  }

  private initializeErrorHandling() {
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      next(notFoundError("Endpoint not found"));
    });
    this.app.use(errorMiddleware);
  }
}

export default App;
