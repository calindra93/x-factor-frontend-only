// Static imports to ensure bundler includes all dynamically-loaded modules
// Must match turnEngine/index.ts pattern for the Supabase Deno bundler
import '../_shared/turnProcessorCore.ts';
import '../_shared/economyMath.ts';
import '../_shared/careerProgressionLogic.ts';
import '../_shared/careerProgressionPipeline.ts';
import '../_shared/runawaySongMechanic.ts';
import '../_shared/fansUpdateModule.ts';
import '../_shared/turnProcessorEra.ts';
import '../_shared/notificationsGenerator.ts';
import '../_shared/monthlyListenersModule.ts';
import '../_shared/fanWarTickModule.ts';
import '../_shared/brandDealsModule.ts';
import '../_shared/fanSentimentEngine.ts';
import '../_shared/socialMediaModule.ts';
import '../_shared/touringManager.ts';
import '../_shared/touringExpansionConfig.ts';
import '../_shared/careerTrendsModule.ts';
import '../_shared/newsGenerationModule.ts';
import '../_shared/socialMediaMath.ts';
import '../_shared/thumbnailGenerator.ts';
import '../_shared/socialMediaRevenueMath.ts';
import '../_shared/insightsReportGenerator.ts';
import '../_shared/platformAlgorithmModel.ts';
import '../_shared/gameDataGenerators.ts';
import '../_shared/sentimentModifiers.ts';
import '../_shared/festivalGlobalModule.ts';
import '../_shared/sampleAchievementsModule.ts';
import '../_shared/sampleRoyaltyModule.ts';
import '../_shared/remixContestModule.ts';
import '../_shared/genreTraits.ts';
import '../_shared/playerActivity.ts';
import '../_shared/algorithmMoodModule.ts';
import '../_shared/trendEvolutionModule.ts';
import '../_shared/soundburstRadioModule.ts';
import '../_shared/segmentSentimentTriggers.ts';
import '../_shared/fandomSegmentsSentimentModule.ts';
import '../_shared/eventThumbnails.ts';
import '../_shared/certificationModule.ts';
import '../_shared/applecoreEditorialModule.ts';
import '../_shared/turnScheduler.ts';
import '../_shared/turnEngineState.js';
// turnEngine.ts is now safe to statically import — Deno.serve is in turnEngine/index.ts, not here
import '../_shared/turnEngine.ts';
// Worker-specific: the shared worker logic
import '../_shared/turnWorkerProcessor.ts';
