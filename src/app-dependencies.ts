import IndonesianFigureController from "./features/figures/indonesian-figure.controller";
import { IndonesianFigureService } from "./features/figures/indonesian-figure.service";
import HealthController from "./features/health/health.controller";
import KbbiController from "./features/kbbi/kbbi.controller";
import { KbbiService } from "./features/kbbi/kbbi.service";
import { AiDefinitionService } from "./features/kbbi/ai-definition.service";
import ProverbController from "./features/proverbs/proverb.controller";
import { ProverbService } from "./features/proverbs/proverb.service";
import TranslateController from "./features/translate/translate.controller";
import { TranslateService } from "./features/translate/translate.service";
import WordController from "./features/word-visits/word.controller";
import { WordVisitService } from "./features/word-visits/word-visit.service";
import AiWordStudyController from "./features/ai-word-study/ai-word-study.controller";
import {
  ManagedAiWordStudyService,
  ManagedDefinitionProvider,
  ManagedTranslationProvider,
} from "./features/ai-word-study/managed-ai";
import config from "./config";

export type AppControllers = {
  aiWordStudyController?: AiWordStudyController;
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
  const aiWordStudyService = new ManagedAiWordStudyService();
  const aiDefinitionService = new AiDefinitionService(
    config.isSupabaseConfigured || config.aiProviders.length ? new ManagedDefinitionProvider() : undefined,
  );
  const translateService = new TranslateService(kbbiService, {
    aiDefinitionService,
    aiTranslationProvider:
      config.isSupabaseConfigured || config.aiProviders.length ? new ManagedTranslationProvider() : undefined,
  });

  return {
    controllers: {
      aiWordStudyController: new AiWordStudyController(aiWordStudyService),
      healthController: new HealthController(),
      indonesianFigureController: new IndonesianFigureController(indonesianFigureService),
      kbbiController: new KbbiController(kbbiService, wordVisitService, aiDefinitionService),
      proverbController: new ProverbController(proverbService),
      translateController: new TranslateController(translateService),
      wordController: new WordController(wordVisitService),
    },
  };
}
