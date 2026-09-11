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
import AiWordStudyController from "./features/ai-word-study/ai-word-study.controller";
import { AiWordStudyService } from "./features/ai-word-study/ai-word-study.service";
import { createOpenAiCompatibleWordStudyProvider } from "./features/ai-word-study/openai-word-study.provider";
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
  const translateService = new TranslateService(kbbiService);
  const aiWordStudyProviders = config.aiProviders.map((provider) =>
    createOpenAiCompatibleWordStudyProvider(
      provider.id,
      provider.apiKey,
      provider.models,
      provider.defaultModel,
      config.upstream.openAiTimeoutMs,
      provider.baseUrl,
    ),
  );
  const aiWordStudyService = new AiWordStudyService(aiWordStudyProviders, config.defaultAiProvider);

  return {
    controllers: {
      aiWordStudyController: new AiWordStudyController(aiWordStudyService),
      healthController: new HealthController(),
      indonesianFigureController: new IndonesianFigureController(indonesianFigureService),
      kbbiController: new KbbiController(kbbiService, wordVisitService),
      proverbController: new ProverbController(proverbService),
      translateController: new TranslateController(translateService),
      wordController: new WordController(wordVisitService),
    },
  };
}
