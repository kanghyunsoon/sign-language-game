export interface SharedGameCameraSession {
  start(): Promise<MediaStream>;
  getStream(): MediaStream | null;
  getVideoTrack(): MediaStreamTrack | null;
  stop(): void;
}

export interface SharedGameCameraSessionOptions {
  readonly constraints?: MediaStreamConstraints;
  readonly getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
}

const DEFAULT_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    width: { ideal: 640 },
    height: { ideal: 360 },
    frameRate: { ideal: 15, max: 20 },
    facingMode: "user",
  },
};

export const DEFAULT_GAME_CAMERA_CONSTRAINTS = DEFAULT_CONSTRAINTS;

export class DefaultSharedGameCameraSession implements SharedGameCameraSession {
  private readonly constraints: MediaStreamConstraints;
  private readonly acquire: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  private stream: MediaStream | null = null;
  private starting: Promise<MediaStream> | null = null;
  private generation = 0;

  constructor(options: SharedGameCameraSessionOptions = {}) {
    this.constraints = options.constraints ?? DEFAULT_CONSTRAINTS;
    this.acquire = options.getUserMedia ?? ((constraints) => navigator.mediaDevices.getUserMedia(constraints));
  }

  start(): Promise<MediaStream> {
    if (this.hasLiveVideoTrack(this.stream)) return Promise.resolve(this.stream as MediaStream);
    if (this.starting) return this.starting;

    const generation = this.generation;
    this.starting = this.acquire(this.constraints).then((stream) => {
      if (generation !== this.generation) {
        stopTracks(stream);
        throw new Error("Camera start was cancelled.");
      }
      if (!this.hasLiveVideoTrack(stream)) {
        stopTracks(stream);
        throw new Error("Camera stream does not contain a live video track.");
      }
      this.stream = stream;
      return stream;
    }).finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  getVideoTrack(): MediaStreamTrack | null {
    return this.stream?.getVideoTracks().find((track) => track.readyState === "live") ?? null;
  }

  stop(): void {
    this.generation += 1;
    stopTracks(this.stream);
    this.stream = null;
  }

  private hasLiveVideoTrack(stream: MediaStream | null): boolean {
    return stream?.getVideoTracks().some((track) => track.readyState === "live") ?? false;
  }
}

function stopTracks(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}
