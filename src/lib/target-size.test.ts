import { describe, expect, test } from "bun:test";
import { encodeToTarget } from "./target-size";
import { numberedFileName, uniqueFileName } from "./file-names";

describe("maximum weight", () => {
  test("selects the highest fitting quality and keeps dimensions", async () => {
    const result = await encodeToTarget({ width: 100, height: 100 }, 3500, { lossless: false, preserveDimensions: true }, async (_, quality) => ({ size: 1000 + quality * 100, quality }));
    expect(result.output.quality).toBe(25);
    expect(result.output.size).toBeLessThanOrEqual(3500);
    expect(result.dimensions).toEqual({ width: 100, height: 100 });
  });
  test("lossless formats reduce dimensions to fit the actual output", async () => {
    const result = await encodeToTarget({ width: 100, height: 50 }, 1024, { lossless: true, preserveDimensions: false }, async (dimensions) => ({ size: dimensions.width * dimensions.height }));
    expect(result.output.size).toBeLessThanOrEqual(1024);
    expect(result.dimensions.width).toBeLessThan(100);
  });
  test("fails honestly if original dimensions cannot fit", async () => {
    await expect(encodeToTarget({ width: 100, height: 50 }, 1024, { lossless: false, preserveDimensions: true }, async () => ({ size: 5000 }))).rejects.toThrow("Não foi possível atingir");
  });
  test("rejects invalid targets", async () => {
    await expect(encodeToTarget({ width: 100, height: 50 }, NaN, { lossless: false, preserveDimensions: true }, async () => ({ size: 1 }))).rejects.toThrow("inválido");
  });
});
test("same names never replace another ZIP entry", () => {
  const used = new Set<string>();
  expect(["a.webp", "a.webp", "a-2.webp", "a.webp"].map((name) => uniqueFileName(name, used))).toEqual(["a.webp", "a-2.webp", "a-2-2.webp", "a-3.webp"]);
  expect(numberedFileName("photo", 2)).toBe("photo-2");
});
