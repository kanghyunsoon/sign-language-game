import { FilesetResolver } from "@mediapipe/tasks-vision";
import simdLoaderUrl from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import simdBinaryUrl from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";
import noSimdLoaderUrl from "@mediapipe/tasks-vision/vision_wasm_nosimd_internal.js?url";
import noSimdBinaryUrl from "@mediapipe/tasks-vision/vision_wasm_nosimd_internal.wasm?url";
import moduleLoaderUrl from "@mediapipe/tasks-vision/vision_wasm_module_internal.js?url";
import moduleBinaryUrl from "@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url";

/** Resolve MediaPipe's dynamic loader through Vite's asset pipeline. */
export async function createVisionFileset(useModule = false): Promise<
  Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>
> {
  // Module workers cannot use importScripts(). MediaPipe's module loader
  // explicitly publishes ModuleFactory on globalThis and is therefore the
  // correct loader for our Vite module workers.
  if (useModule) {
    return { wasmLoaderPath: moduleLoaderUrl, wasmBinaryPath: moduleBinaryUrl };
  }

  // Preserve MediaPipe's own SIMD capability detection, but replace the
  // generated public paths with URLs managed by Vite. Vite 8 does not allow a
  // JavaScript file in public/ to be dynamically imported as source code.
  const detected = await FilesetResolver.forVisionTasks("");
  const useNoSimd = detected.wasmLoaderPath.includes("_nosimd_");

  return useNoSimd
    ? { wasmLoaderPath: noSimdLoaderUrl, wasmBinaryPath: noSimdBinaryUrl }
    : { wasmLoaderPath: simdLoaderUrl, wasmBinaryPath: simdBinaryUrl };
}
