const MAX_INFERENCE_FRAME_EDGE = 256;

export async function createVideoFrameBitmap(video: HTMLVideoElement): Promise<ImageBitmap> {
  const sourceWidth = Math.max(1, video.videoWidth);
  const sourceHeight = Math.max(1, video.videoHeight);
  const scale = Math.min(1, MAX_INFERENCE_FRAME_EDGE / Math.max(sourceWidth, sourceHeight));

  if (scale === 1) {
    return createImageBitmap(video);
  }

  return createImageBitmap(video, 0, 0, sourceWidth, sourceHeight, {
    resizeWidth: Math.max(1, Math.round(sourceWidth * scale)),
    resizeHeight: Math.max(1, Math.round(sourceHeight * scale)),
    resizeQuality: "low",
  });
}
