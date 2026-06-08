const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, net, protocol } = require("electron");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true
    }
  }
]);

const outDir = path.join(__dirname, "..", "out");

function resolveStaticFile(requestUrl) {
  const url = new URL(requestUrl);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(outDir, pathname));

  if (!filePath.startsWith(outDir)) {
    return path.join(outDir, "index.html");
  }

  return filePath;
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: "#ffffff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await win.loadURL("app://compact-img/");
}

app.whenReady().then(async () => {
  protocol.handle("app", (request) => {
    const filePath = resolveStaticFile(request.url);
    return net.fetch(pathToFileURL(filePath).toString());
  });

  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
