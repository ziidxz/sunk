import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const src = join(root, "src");
const site = join(root, "site");
const docs = join(root, "docs");
const dist = join(root, "dist");
const SITE_URL = "https://ziidxz.github.io/sunk";

const APP_FILES = [
  "index.html",
  "theme.css",
  "app.css",
  "core.js",
  "store.js",
  "ui.js",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
  "manifest.webmanifest",
  "sw.js"
];

function clean(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

function kb(bytes) {
  return (bytes / 1024).toFixed(1) + " KB";
}

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    const source = join(from, name);
    const target = join(to, name);
    if (statSync(source).isDirectory()) copyTree(source, target);
    else cpSync(source, target);
  }
}

function inlineScript(code) {
  return code.replace(/<\/script/gi, "<\\/script");
}

clean(docs);
clean(dist);

// 1. Public site.
copyTree(site, docs);
writeFileSync(join(docs, ".nojekyll"), "");

// 2. Hosted app under /app/.
mkdirSync(join(docs, "app"), { recursive: true });
for (const name of APP_FILES) {
  cpSync(join(src, name), join(docs, "app", name));
}

// Shared favicon and social image at the site root.
cpSync(join(src, "icon.svg"), join(docs, "favicon.svg"));
cpSync(join(src, "icon-512.png"), join(docs, "icon-512.png"));

// 3. Single-file offline edition.
const icon = readFileSync(join(src, "icon.svg"), "utf8");
const touch = readFileSync(join(src, "apple-touch-icon.png")).toString("base64");
const theme = readFileSync(join(src, "theme.css"), "utf8");
const appCss = readFileSync(join(src, "app.css"), "utf8");
const core = readFileSync(join(src, "core.js"), "utf8");
const store = readFileSync(join(src, "store.js"), "utf8");
const ui = readFileSync(join(src, "ui.js"), "utf8");

let html = readFileSync(join(src, "index.html"), "utf8");

html = html.replace(
  '<link rel="icon" href="icon.svg" type="image/svg+xml">',
  '<link rel="icon" href="data:image/svg+xml,' + encodeURIComponent(icon) + '">'
);
html = html.replace(
  '<link rel="apple-touch-icon" href="apple-touch-icon.png">',
  '<link rel="apple-touch-icon" href="data:image/png;base64,' + touch + '">'
);
html = html.replace('  <link rel="manifest" href="manifest.webmanifest">\n', "");
html = html.replace(
  '  <link rel="stylesheet" href="theme.css">',
  "  <style>\n" + theme + "\n  </style>"
);
html = html.replace(
  '  <link rel="stylesheet" href="app.css">',
  "  <style>\n" + appCss + "\n  </style>"
);

html = html.replace('class="wordmark" href="../"', 'class="wordmark" href="#ledger"');
html = html.replace(
  '<a href="../privacy.html">Privacy</a> <a href="../terms.html">Terms</a> <a href="../order.html">Offline edition</a> <a href="../">Home</a>',
  '<a href="' + SITE_URL + '/privacy.html">Privacy</a> <a href="' + SITE_URL +
    '/terms.html">Terms</a> <a href="' + SITE_URL + '/order.html">Offline edition</a> <a href="' +
    SITE_URL + '/">Home</a>'
);

html = html.replace(
  '  <script src="core.js"></script>',
  '  <script id="sunk-edition">window.SUNK_EDITION = "pro";</script>\n  <script id="sunk-core">\n' + inlineScript(core) + "\n  </script>"
);
html = html.replace(
  '  <script src="store.js"></script>',
  '  <script id="sunk-store">\n' + inlineScript(store) + "\n  </script>"
);
html = html.replace(
  '  <script src="ui.js"></script>',
  '  <script id="sunk-ui">\n' + inlineScript(ui) + "\n  </script>"
);

html = html.replace(
  "<head>",
  "<head>\n  <!-- Sunk offline edition. One file, no network required after download. -->"
);

html = html.replace(
  /href="(https:\/\/ziidxz\.github\.io\/sunk\/[^"]*)"/g,
  'href="$1" target="_blank" rel="noopener noreferrer"'
);

const offlinePath = join(dist, "sunk-offline.html");
writeFileSync(offlinePath, html);
const offlineSize = statSync(offlinePath).size;

const readme = readFileSync(join(here, "OFFLINE-README.txt"), "utf8")
  .replaceAll("__SIZE__", kb(offlineSize))
  .replaceAll("__DATE__", "31 October 2026")
  .replaceAll("__SITE__", SITE_URL + "/");
writeFileSync(join(dist, "README.txt"), readme);

// 4. Link check for the published site.
const problems = [];
const skip = /^(?:[a-z]+:|#|\/\/|data:)/i;

function checkHtml(file) {
  const body = readFileSync(file, "utf8");
  const pattern = /(?:href|src)="([^"]+)"/g;
  let match;
  while ((match = pattern.exec(body))) {
    const raw = match[1];
    if (skip.test(raw)) continue;
    const cleanPath = raw.split("#")[0].split("?")[0];
    if (!cleanPath) continue;
    let target = join(dirname(file), cleanPath);
    if (cleanPath.endsWith("/")) target = join(target, "index.html");
    else if (existsSync(target) && statSync(target).isDirectory()) target = join(target, "index.html");
    if (!existsSync(target)) {
      problems.push(relative(docs, file) + " -> " + raw);
    }
  }
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) walk(file);
    else if (name.endsWith(".html")) checkHtml(file);
  }
}

walk(docs);

if (problems.length) {
  console.error("Broken local links:");
  problems.forEach((line) => console.error("  " + line));
  process.exitCode = 1;
} else {
  const hostedIndex = statSync(join(docs, "index.html")).size;
  console.log("site      docs/  (" + kb(hostedIndex) + " landing page)");
  console.log("app       docs/app/");
  console.log("offline   dist/sunk-offline.html  (" + kb(offlineSize) + ")");
  console.log("readme    dist/README.txt");
  console.log("links     all local links resolve");
}
