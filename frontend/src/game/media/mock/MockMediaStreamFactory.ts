export interface MockMediaStreamFactoryOptions {
  readonly createCanvas?: () => HTMLCanvasElement;
  readonly requestFrame?: (callback: FrameRequestCallback) => number;
  readonly cancelFrame?: (handle: number) => void;
  readonly now?: () => Date;
}

export class MockMediaStreamFactory {
  private readonly animationHandles = new Map<MediaStream, number>();
  private readonly createCanvas: () => HTMLCanvasElement;
  private readonly requestFrame: (callback: FrameRequestCallback) => number;
  private readonly cancelFrame: (handle: number) => void;
  private readonly now: () => Date;

  constructor(options: MockMediaStreamFactoryOptions = {}) {
    this.createCanvas = options.createCanvas ?? (() => document.createElement("canvas"));
    this.requestFrame = options.requestFrame ?? requestAnimationFrame;
    this.cancelFrame = options.cancelFrame ?? cancelAnimationFrame;
    this.now = options.now ?? (() => new Date());
  }

  create(label: string): MediaStream {
    const canvas = this.createCanvas();
    canvas.width = 640;
    canvas.height = 360;
    const context = canvas.getContext("2d");
    if (!context || typeof canvas.captureStream !== "function") throw new Error("Canvas captureStream is not supported.");
    const stream = canvas.captureStream(15);
    let offset = 0;
    const draw = () => {
      context.fillStyle = "#101827";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#6ee7b7";
      context.beginPath();
      context.arc(40 + (offset % 560), 180, 28, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#ffffff";
      context.font = "bold 28px sans-serif";
      context.fillText(label, 24, 48);
      context.font = "20px monospace";
      context.fillText(this.now().toLocaleTimeString(), 24, 80);
      offset += 2;
      this.animationHandles.set(stream, this.requestFrame(draw));
    };
    draw();
    return stream;
  }

  stop(stream: MediaStream): void {
    const handle = this.animationHandles.get(stream);
    if (handle !== undefined) this.cancelFrame(handle);
    this.animationHandles.delete(stream);
    stream.getTracks().forEach((track) => track.stop());
  }
}
