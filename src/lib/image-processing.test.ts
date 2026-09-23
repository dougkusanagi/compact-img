import { describe, expect, test } from "bun:test";
import { getTargetDimensions } from "./image-processing";

describe("getTargetDimensions", () => {
  test("preserves original dimensions when requested", () => {
    expect(getTargetDimensions(400, 200, true, 100, 100, true)).toEqual({ width: 400, height: 200 });
  });

  test("keeps aspect ratio and does not enlarge smaller images", () => {
    expect(getTargetDimensions(400, 200, false, 100, 100, true)).toEqual({ width: 100, height: 50 });
    expect(getTargetDimensions(40, 20, false, 100, 100, true)).toEqual({ width: 40, height: 20 });
  });

  test("limits each axis independently when aspect ratio is disabled", () => {
    expect(getTargetDimensions(40, 200, false, 100, 100, false)).toEqual({ width: 40, height: 100 });
  });

  test("never returns a dimension below one pixel", () => {
    expect(getTargetDimensions(1000, 1, false, 1, 1, true)).toEqual({ width: 1, height: 1 });
  });
});
