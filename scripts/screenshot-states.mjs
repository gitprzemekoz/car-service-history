// Screenshots the dev-only dashboard kitchen sink at desktop and mobile widths with headless Edge.
// Zero dependencies on purpose. Run against a dev server: BASE_URL=http://localhost:4321 node scripts/screenshot-states.mjs <out-dir>
//
// Why DevTools protocol instead of `--screenshot --window-size`: headless Edge clamps the window to ~500px wide,
// so a 375px viewport is impossible from the CLI flags alone. Emulation sets the exact CSS width, and
// captureBeyondViewport grabs the full page height, so no window height has to be guessed.

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const EDGE_PATH = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const url = `${BASE_URL}/dev/dashboard-states`;

const shots = [
  { name: "desktop-1280.png", width: 1280, height: 800, mobile: false },
  { name: "mobile-375.png", width: 375, height: 812, mobile: true },
];

const outArg = process.argv[2];
if (!outArg) {
  console.error("Usage: node scripts/screenshot-states.mjs <out-dir>");
  process.exit(1);
}
const outDir = path.resolve(outArg);
await mkdir(outDir, { recursive: true });

// A fresh profile keeps headless Edge from attaching to an already running browser.
const profile = await mkdtemp(path.join(tmpdir(), "edge-shot-"));
const edge = spawn(
  EDGE_PATH,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

try {
  const port = await readDevToolsPort(profile);
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((t) => t.type === "page");
  if (!page) throw new Error("No page target found in headless Edge");
  const cdp = await connect(page.webSocketDebuggerUrl);

  await cdp.send("Page.enable");
  // Headless pages are unfocused by default; without this, autofocus shows no focus ring.
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  for (const shot of shots) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: shot.width,
      height: shot.height,
      deviceScaleFactor: 1,
      mobile: shot.mobile,
    });
    const loaded = cdp.once("Page.loadEventFired");
    await cdp.send("Page.navigate", { url });
    await loaded;
    await cdp.send("Runtime.evaluate", { expression: "document.fonts.ready", awaitPromise: true });
    await delay(300);

    const { cssContentSize } = await cdp.send("Page.getLayoutMetrics");
    const { data } = await cdp.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: shot.width, height: Math.ceil(cssContentSize.height), scale: 1 },
    });
    const file = path.join(outDir, shot.name);
    await writeFile(file, Buffer.from(data, "base64"));
    console.log(`wrote ${file}`);
  }
  cdp.close();
} finally {
  edge.kill();
  await delay(500);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

async function readDevToolsPort(dir) {
  for (let i = 0; i < 100; i++) {
    try {
      const [port] = (await readFile(path.join(dir, "DevToolsActivePort"), "utf8")).split("\n");
      if (port) return port.trim();
    } catch {
      // Not written yet.
    }
    await delay(100);
  }
  throw new Error(`Edge did not start a DevTools endpoint (EDGE_PATH=${EDGE_PATH})`);
}

async function connect(wsUrl) {
  const ws = new globalThis.WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  const waiters = new Map();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id !== undefined) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p?.reject(new Error(`${msg.error.message} (${msg.error.code})`));
      else p?.resolve(msg.result);
    } else if (waiters.has(msg.method)) {
      waiters.get(msg.method)(msg.params);
      waiters.delete(msg.method);
    }
  });
  return {
    send(method, params = {}) {
      const id = ++nextId;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    once(method) {
      return new Promise((resolve) => waiters.set(method, resolve));
    },
    close() {
      ws.close();
    },
  };
}
