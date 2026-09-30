import { afterEach, beforeEach, expect, test } from "bun:test";
import { downloadImagesIndividual } from "./download";
import type { QueueImage } from "./image-types";
const originalWindow = Reflect.get(globalThis, "window");
let files: Map<string, Blob>;
const image = { id: "one", status: "done", compressedName: "photo.webp", compressedBlob: new Blob(["new"]) } as QueueImage;
beforeEach(() => {
  files = new Map([["photo.webp", new Blob(["old"])]]);
  const directory = {
    getFileHandle: async (name: string, options: { create: boolean }) => {
      if (!options.create && !files.has(name)) throw new DOMException("Missing", "NotFoundError");
      return { createWritable: async () => ({ write: async (blob: Blob) => { files.set(name, blob); }, close: async () => {} }) };
    }
  };
  Object.defineProperty(globalThis, "window", { value: { showDirectoryPicker: async () => directory }, configurable: true, writable: true });
});
afterEach(() => { if (originalWindow === undefined) Reflect.deleteProperty(globalThis, "window"); else Reflect.set(globalThis, "window", originalWindow); });
test("browser keeps both names and preserves existing contents", async () => {
  expect(await downloadImagesIndividual([image], { chooseLocation: true, conflictPolicy: "rename" })).toEqual(["one"]);
  expect(await files.get("photo.webp")!.text()).toBe("old");
  expect(await files.get("photo-2.webp")!.text()).toBe("new");
});
test("browser skips a conflict and reports the ignored row", async () => {
  const skipped: string[] = [];
  expect(await downloadImagesIndividual([image], { chooseLocation: true, conflictPolicy: "skip", onSkipped: (id) => skipped.push(id) })).toEqual([]);
  expect(skipped).toEqual(["one"]);
  expect(await files.get("photo.webp")!.text()).toBe("old");
});
test("browser replaces only when chosen explicitly", async () => {
  await downloadImagesIndividual([image], { chooseLocation: true, conflictPolicy: "overwrite" });
  expect(await files.get("photo.webp")!.text()).toBe("new");
});
test("browser asks before changing an existing file", async () => {
  const prompts: string[] = [];
  await downloadImagesIndividual([image], { chooseLocation: true, conflictPolicy: "ask", resolveConflict: async (name) => { prompts.push(name); return "rename"; } });
  expect(prompts).toEqual(["photo.webp"]);
  expect(await files.get("photo.webp")!.text()).toBe("old");
  expect(files.has("photo-2.webp")).toBe(true);
});
