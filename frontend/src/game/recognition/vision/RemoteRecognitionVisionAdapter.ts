import type { PoseDetection } from "../active-player";
import type { RecognitionVisionAdapter, RecognitionVisionAdapterFactory, RecognitionVisionAdapterOptions, RecognitionVisionFrame, TrackedHand } from "./RecognitionVisionAdapter";

/** Transport owns frame encoding and the remote protocol. */
export interface RemoteRecognitionVisionTransport {
  connect(options: RecognitionVisionAdapterOptions): Promise<void>;
  detectHands(frame: RecognitionVisionFrame): Promise<readonly TrackedHand[]>;
  detectPoses(frame: RecognitionVisionFrame): Promise<readonly PoseDetection[]>;
  disconnect(): void;
}

export type RemoteRecognitionVisionTransportFactory = () => RemoteRecognitionVisionTransport;

export class RemoteRecognitionVisionAdapter implements RecognitionVisionAdapter {
  private readonly transport: RemoteRecognitionVisionTransport;

  constructor(
    private readonly options: RecognitionVisionAdapterOptions,
    createTransport: RemoteRecognitionVisionTransportFactory,
  ) {
    this.transport = createTransport();
  }

  initialize(): Promise<void> {
    return this.transport.connect(this.options);
  }

  detectHands(frame: RecognitionVisionFrame): Promise<readonly TrackedHand[]> {
    return this.transport.detectHands(frame);
  }

  detectPoses(frame: RecognitionVisionFrame): Promise<readonly PoseDetection[]> {
    return this.options.enablePoseTracking ? this.transport.detectPoses(frame) : Promise.resolve([]);
  }

  getExecutionMode() {
    return "REMOTE" as const;
  }

  close(): void {
    this.transport.disconnect();
  }
}

export function createRemoteRecognitionVisionAdapterFactory(
  createTransport: RemoteRecognitionVisionTransportFactory,
): RecognitionVisionAdapterFactory {
  return { create: (options) => new RemoteRecognitionVisionAdapter(options, createTransport) };
}
