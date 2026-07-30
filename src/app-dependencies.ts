import IndonesianFigureController from "./features/figures/indonesian-figure.controller";
import { IndonesianFigureService } from "./features/figures/indonesian-figure.service";
import HealthController from "./features/health/health.controller";
import KbbiController from "./features/kbbi/kbbi.controller";
import { KbbiService } from "./features/kbbi/kbbi.service";
import ProverbController from "./features/proverbs/proverb.controller";
import { ProverbService } from "./features/proverbs/proverb.service";
import WordController from "./features/word-visits/word.controller";
import { WordVisitService } from "./features/word-visits/word-visit.service";

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
