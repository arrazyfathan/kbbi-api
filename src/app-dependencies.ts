import IndonesianFigureController from "./features/figures/indonesian-figure.controller";
import { IndonesianFigureService } from "./features/figures/indonesian-figure.service";
import HealthController from "./features/health/health.controller";
import KbbiController from "./features/kbbi/kbbi.controller";
import { KbbiService } from "./features/kbbi/kbbi.service";
import ProverbController from "./features/proverbs/proverb.controller";
import { ProverbService } from "./features/proverbs/proverb.service";
import TranslateController from "./features/translate/translate.controller";
import { TranslateService } from "./features/translate/translate.service";
import WordController from "./features/word-visits/word.controller";
import { WordVisitService } from "./features/word-visits/word-visit.service";

export type AppControllers = {
  healthController: HealthController;
  indonesianFigureController: IndonesianFigureController;
  kbbiController: KbbiController;
  proverbController: ProverbController;
  translateController: TranslateController;
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
  const translateService = new TranslateService(kbbiService);

  return {
    controllers: {
      healthController: new HealthController(),
      indonesianFigureController: new IndonesianFigureController(indonesianFigureService),
      kbbiController: new KbbiController(kbbiService, wordVisitService),
      proverbController: new ProverbController(proverbService),
      translateController: new TranslateController(translateService),
      wordController: new WordController(wordVisitService),
    },
  };
}
