import type { ImageDimensions } from "./image-types";

/** Find the highest quality that actually fits; resize only if permitted. */
export async function encodeToTarget<T extends { size: number }>(
  dimensions: ImageDimensions,
  targetBytes: number,
  options: { lossless: boolean; preserveDimensions: boolean },
  encode: (dimensions: ImageDimensions, quality: number) => Promise<T>
): Promise<{ output: T; dimensions: ImageDimensions }> {
  if (!Number.isFinite(targetBytes) || targetBytes < 1024) throw new Error("Peso máximo inválido. Use pelo menos 1 KB.");
  let current = { ...dimensions };
  for (let attempt = 0; attempt < 18; attempt++) {
    const high = await encode(current, 100);
    if (high.size <= targetBytes) return { output: high, dimensions: current };
    let smallest = high;
    if (!options.lossless) {
      smallest = await encode(current, 1);
      if (smallest.size <= targetBytes) {
        let best = smallest;
        let lowQuality = 2;
        let highQuality = 99;
        while (lowQuality <= highQuality) {
          const quality = Math.floor((lowQuality + highQuality) / 2);
          const candidate = await encode(current, quality);
          if (candidate.size <= targetBytes) { best = candidate; lowQuality = quality + 1; }
          else highQuality = quality - 1;
        }
        return { output: best, dimensions: current };
      }
    }
    if (options.preserveDimensions || (current.width === 1 && current.height === 1)) break;
    const scale = Math.max(0.1, Math.min(0.8, Math.sqrt(targetBytes / smallest.size) * 0.9));
    current = { width: Math.max(1, Math.floor(current.width * scale)), height: Math.max(1, Math.floor(current.height * scale)) };
  }
  throw new Error("Não foi possível atingir o peso máximo. Permita reduzir as dimensões, aumente o limite ou escolha outro formato.");
}
