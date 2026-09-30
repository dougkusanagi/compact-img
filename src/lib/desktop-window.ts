import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

let decorationUpdate: Promise<void> = Promise.resolve();

// Serialize route changes so an older async update cannot override the latest layout.
export function setCustomWindowTitlebar(enabled: boolean) {
  if (!isTauri()) return Promise.resolve();
  decorationUpdate = decorationUpdate.catch(() => {}).then(() => getCurrentWindow().setDecorations(!enabled));
  return decorationUpdate;
}
