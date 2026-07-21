import { createContext, useContext, type PropsWithChildren } from "react";

import { mediaPipeRecognitionVisionAdapterFactory } from "./MediaPipeRecognitionVisionAdapter";
import type { RecognitionVisionAdapterFactory } from "./RecognitionVisionAdapter";

const RecognitionVisionContext = createContext<RecognitionVisionAdapterFactory>(mediaPipeRecognitionVisionAdapterFactory);

export interface RecognitionVisionProviderProps extends PropsWithChildren {
  readonly factory?: RecognitionVisionAdapterFactory;
}

export function RecognitionVisionProvider({ children, factory = mediaPipeRecognitionVisionAdapterFactory }: RecognitionVisionProviderProps) {
  return <RecognitionVisionContext.Provider value={factory}>{children}</RecognitionVisionContext.Provider>;
}

export function useRecognitionVisionAdapterFactory(): RecognitionVisionAdapterFactory {
  return useContext(RecognitionVisionContext);
}
