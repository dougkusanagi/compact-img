import { afterEach, beforeEach, expect, test } from "bun:test";
import { mockWindows, clearMocks } from "@tauri-apps/api/mocks";
import { setCustomWindowTitlebar } from "./desktop-window";
import { saveCompressedImage } from "./desktop";

const originalWindow = Reflect.get(globalThis, "window");
let calls: { command: string; args: unknown; options?: { headers: Record<string, string> } }[];
beforeEach(() => {
  Object.defineProperty(globalThis, "window", { value: { crypto: globalThis.crypto }, configurable: true, writable: true });
  Reflect.set(globalThis, "isTauri", true);
  mockWindows("main");
  calls = [];
});
afterEach(() => {
  clearMocks();
  Reflect.deleteProperty(globalThis, "isTauri");
  if (originalWindow === undefined) Reflect.deleteProperty(globalThis, "window");
  else Reflect.set(globalThis, "window", originalWindow);
});
function ipc(callback: (command: string, args: unknown, options?: { headers: Record<string, string> }) => Promise<unknown>) {
  const internals = Reflect.get(window, "__TAURI_INTERNALS__");
  internals.invoke = (command: string, args: unknown, options?: { headers: Record<string, string> }) => {
    calls.push({ command, args, options });
    return callback(command, args, options);
  };
}
test("rapid layout switches serialize native decoration changes", async () => {
  ipc(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
  await Promise.all([setCustomWindowTitlebar(true), setCustomWindowTitlebar(false), setCustomWindowTitlebar(true)]);
  expect(calls.map((call) => call.command)).toEqual(Array(3).fill("plugin:window|set_decorations"));
  expect(calls.map((call) => (call.args as { value: boolean }).value)).toEqual([false, true, false]);
});
test("desktop asks on conflict and sends only the explicit replacement decision", async () => {
  ipc(async (_, __, options) => {
    if (options?.headers["x-conflict-policy"] === "ask") throw "FILE_EXISTS:/tmp/output.webp";
    return "/tmp/output-2.webp";
  });
  const path = await saveCompressedImage({ blob: new Blob(["encoded"]), fileName: "output.webp", sourcePath: "/tmp/original.png", conflictPolicy: "ask", resolveConflict: async (path) => { expect(path).toBe("/tmp/output.webp"); return "rename"; } });
  expect(path).toBe("/tmp/output-2.webp");
  expect(calls.map((call) => call.options?.headers["x-conflict-policy"])).toEqual(["ask", "rename"]);
});
test("cancelling a conflict never retries writing", async () => {
  ipc(async () => { throw "FILE_EXISTS:/tmp/output.webp"; });
  await expect(saveCompressedImage({ blob: new Blob(["encoded"]), fileName: "output.webp", resolveConflict: async () => "cancel" })).rejects.toMatchObject({ name: "AbortError" });
  expect(calls).toHaveLength(1);
});
test("skip remains a skipped result rather than reporting success", async () => {
  ipc(async () => null);
  expect(await saveCompressedImage({ blob: new Blob(["encoded"]), fileName: "output.webp", conflictPolicy: "skip" })).toBeNull();
});
