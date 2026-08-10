export { GameModule } from "./app/GameModule";
export { GameCategoryPage } from "./block-stacking/pages/GameCategoryPage";
export { GameModePage } from "./block-stacking/pages/GameModePage";
export * from "./glyph-battle";
export type { GameCategory } from "./block-stacking/core/GameCategory";
export type { GameModuleProps, GameModuleUser, GameModuleConfig } from "./app/GameModule";
export type { GameModuleServices, SoloGameApi, BattleRoomGateway, BattleGameTransportFactory } from "./contracts";
export type { RecognitionVisionAdapter, RecognitionVisionAdapterFactory, RecognitionVisionAdapterOptions, RecognitionVisionFrame, RemoteRecognitionVisionTransport, RemoteRecognitionVisionTransportFactory } from "./recognition/vision";
export { createRemoteRecognitionVisionAdapterFactory, MediaPipeRecognitionVisionAdapter, RemoteRecognitionVisionAdapter } from "./recognition/vision";
export { BackendBattleRoomGateway, DevBattleRoomGateway } from "./block-stacking/battle/room";
export type { BattleRoomDetail, BattleRoomParticipant, BattleRoomSession, BattleRoomStatus, BattleRoomSummary, CreateRoomRequest } from "./block-stacking/battle/room";
export { DefaultSharedGameCameraSession, GameVideoTile, MeshBattleMediaSession, MockBattleMediaSession } from "./media";
export type { BattleMediaEvent, BattleMediaSession, GameVideoTileProps, MediaConnectionState, RemoteGameParticipant, SharedGameCameraSession } from "./media";
export { StandaloneGameHarness } from "./dev/StandaloneGameHarness";
export { SoloGamePage } from "./block-stacking/pages/SoloGamePage";
export { InputLock } from "./block-stacking/core/InputLock";
export { LetterRegistry } from "./block-stacking/core/LetterRegistry";
export { RemovalSystem } from "./block-stacking/core/RemovalSystem";
export { RemovalTargetSelector } from "./block-stacking/core/RemovalTargetSelector";
export { SymbolLetterQueues } from "./block-stacking/core/SymbolLetterQueues";
export { LetterBodyFactory } from "./block-stacking/physics/LetterBodyFactory";
export { MatterPhysicsWorld } from "./block-stacking/physics/MatterPhysicsWorld";
export { SettlementDetector } from "./block-stacking/physics/SettlementDetector";
export { LetterViewFactory } from "./block-stacking/render/LetterViewFactory";
export { PixiGameRenderer } from "./block-stacking/render/PixiGameRenderer";
export { RemovalEffect } from "./block-stacking/render/RemovalEffect";
export { ScoreTracker } from "./block-stacking/scoring/ScoreTracker";
export { HttpGameResultRepository, LocalGameResultRepository, ResilientGameResultRepository, toPersistedSymbolStatistics } from "./block-stacking/results";
export {
  GAME_SYMBOL_REGISTRY,
  GAME_SYMBOLS,
  isCurrentModelSupported,
  isCurrentlyPlayable,
  metadataForSymbol,
  symbolsForCategory,
} from "./block-stacking/metadata/symbolRegistry";
export { GameRuntime } from "./block-stacking/runtime/GameRuntime";
export { GameRuntime as GameController } from "./block-stacking/runtime/GameRuntime";
export { DEFAULT_GAME_CONFIG } from "./block-stacking/core/types";
export { DEFAULT_PHYSICS_CONFIG } from "./block-stacking/physics/types";
export { DEFAULT_RENDERER_CONFIG } from "./block-stacking/render/types";
export { DEFAULT_SOLO_GAME_CONFIG } from "./block-stacking/runtime/types";
export { DEFAULT_SCORING_CONFIG } from "./block-stacking/scoring/types";
export type {
  GameConfig,
  GameEvent,
  GameSnapshot,
  InputLockConfig,
  InputLockSnapshot,
  LetterEntity,
  LetterState,
  RemovalTarget,
} from "./block-stacking/core/types";
export type {
  LetterBodySpec,
  PhysicsConfig,
  PhysicsEvent,
  PhysicsLetterState,
  PhysicsWorld,
  SettlementSample,
} from "./block-stacking/physics/types";
export type {
  GameRenderer,
  RemovalEffectFinishedEvent,
  RendererConfig,
} from "./block-stacking/render/types";
export type { GameRunState, GameRuntimeSnapshot, SoloGameConfig } from "./block-stacking/runtime/types";
export type { IncorrectComboPolicy, ScoreSnapshot, ScoringConfig } from "./block-stacking/scoring/types";
export type {
  FetchLike,
  GameResultRepository,
  GameResultSubmission,
  HttpGameResultRepositoryOptions,
  PersistedGameMode,
  PersistedSymbolStatistic,
  RequestHeadersProvider,
  StoredGameResult,
} from "./block-stacking/results";
export type { GameSymbolMetadata, SymbolCategory, SymbolDifficulty, SymbolFeedbackMode } from "./block-stacking/metadata/symbolRegistry";
export { HttpSoloGameApi, MockSoloGameApi, SoloGameApiError, SoloSessionCoordinator, toCompleteSoloSessionRequest, toSoloSymbolStatistics } from "./block-stacking/solo/api";
export type { CompleteSoloSessionRequest, SoloGameResult, SoloPlayMode, SoloSymbolStatistic, StartSoloSessionRequest, StartSoloSessionResponse } from "./block-stacking/solo/api";
