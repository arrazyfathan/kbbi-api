import HealthController from "./controllers/health.controller";
import IndonesianFigureController from "./controllers/indonesian-figure.controller";
import KbbiController from "./controllers/kbbi.controller";
import ProverbController from "./controllers/proverb.controller";
import WordController from "./controllers/word.controller";
import { IndonesianFigureService } from "./services/indonesian-figure.service";
import { KbbiService } from "./services/kbbi.service";
import { ProverbService } from "./services/proverb.service";
import { WordVisitService } from "./services/word-visit.service";

export type AppControllers = {
  healthController: HealthController;
  indonesianFigureController: IndonesianFigureController;
  kbbiController: KbbiController;
  proverbController: ProverbController;
  wordController: WordController;
};

export type AppDependencies = {
  controllers: AppControllers;
};

export function createAppDependencies(): AppDependencies {
  const kbbiService = new KbbiService();
  const wordVisitService = new WordVisitService();
  const proverbService = new ProverbService();
  const indonesianFigureService = new IndonesianFigureService();

  return {
    controllers: {
      healthController: new HealthController(),
      indonesianFigureController: new IndonesianFigureController(indonesianFigureService),
      kbbiController: new KbbiController(kbbiService, wordVisitService),
      proverbController: new ProverbController(proverbService),
      wordController: new WordController(wordVisitService),
    },
  };
}
