import { mkdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const models = [
  {
    path: resolve(root, "public", "mediapipe", "hand_landmarker.task"),
    url: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  },
  {
    path: resolve(root, "public", "mediapipe", "pose_landmarker_lite.task"),
    url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  },
];

await mkdir(resolve(root, "public", "mediapipe"), { recursive: true });
for (const model of models) {
  let modelReady = false;
  try {
    modelReady = (await stat(model.path)).size > 0;
  } catch {
    modelReady = false;
  }
  if (!modelReady) {
    const response = await fetch(model.url);
    if (!response.ok) throw new Error(`Failed to download MediaPipe model: ${response.status}`);
    await writeFile(model.path, Buffer.from(await response.arrayBuffer()));
  }
}
