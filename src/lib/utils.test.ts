import { describe, expect, test } from "bun:test";
import { formatBytes, formatPercent, getReduction, replaceExtension } from "./utils";

describe("image result helpers", () => {
  test("uses the expected output suffix and extension", () => {
    expect(replaceExtension("holiday.photo.PNG", "jpeg")).toBe("holiday.photo-compactado.jpg");
    expect(replaceExtension("image", "webp")).toBe("image-compactado.webp");
  });

  test("reports reduction and never shows negative savings", () => {
    expect(getReduction(100, 75)).toBe(25);
    expect(getReduction(100, 120)).toBe(0);
    expect(getReduction(0, 10)).toBeUndefined();
  });

  test("formats invalid and typical values", () => {
    expect(formatBytes(Number.NaN)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatPercent(Number.NaN)).toBe("-");
    expect(formatPercent(12.34)).toBe("12.3%");
  });
});
