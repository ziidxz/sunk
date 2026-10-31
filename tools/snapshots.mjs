import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const out = join(process.env.TMPDIR || "/tmp", "sunk-snaps");
mkdirSync(out, { recursive: true });

const shell = readFileSync(join(root, "src/index.html"), "utf8");
const markup = shell
  .replace(/<script[\s\S]*?<\/script>/g, "")
  .replace(/<link[^>]*>/g, "");
const code = {
  core: readFileSync(join(root, "src/core.js"), "utf8"),
  store: readFileSync(join(root, "src/store.js"), "utf8"),
  ui: readFileSync(join(root, "src/ui.js"), "utf8")
};
const css = readFileSync(join(root, "src/theme.css"), "utf8") + "\n" +
  readFileSync(join(root, "src/app.css"), "utf8");

function boot(pro) {
  const win = new Window({ url: "https://sunk.example/app/" });
  win.SUNK_EDITION = pro ? "pro" : "free";
  win.document.write(markup);
  for (const name of ["core", "store", "ui"]) {
    new Function("window", "module", "exports", "require", code[name])(
      win, undefined, undefined, undefined
    );
  }
  return win;
}

function id(win, name) {
  return win.document.getElementById(name);
}

function go(win, view) {
  win.location.hash = "#" + view;
  win.dispatchEvent(new win.Event("hashchange"));
}

function pause(ms = 20) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function save(win, name) {
  const toast = win.document.getElementById("toast");
  if (toast) toast.hidden = true;
  let html = win.document.documentElement.outerHTML;
  html = html.replace(/<script[\s\S]*?<\/script>/g, "");
  html = html.replace("</head>", "<style>\n" + css + "\n</style>\n</head>");
  const file = join(out, name + ".html");
  writeFileSync(file, "<!doctype html>\n" + html);
  console.log(name + ".html");
}

async function addSample(win) {
  id(win, "load-sample").click();
  await pause();
}

async function main() {
  const free = boot(false);
  await addSample(free);
  save(free, "ledger-free");

  const pro = boot(true);
  await addSample(pro);
  save(pro, "ledger-pro");

  const calendar = boot(true);
  await addSample(calendar);
  go(calendar, "calendar");
  let guard = 0;
  while (id(calendar, "calendar-grid").querySelectorAll(".cal-chip").length === 0 && guard < 3) {
    id(calendar, "calendar-next").click();
    guard++;
  }
  save(calendar, "calendar");

  const settings = boot(true);
  await addSample(settings);
  go(settings, "settings");
  await pause();
  save(settings, "settings");

  const importer = boot(true);
  go(importer, "import");
  const csv = [
    "Date,Description,Amount",
    "2026-01-05,NETFLIX.COM,-15.99",
    "2026-02-05,NETFLIX.COM,-15.99",
    "2026-03-05,NETFLIX.COM,-17.99",
    "2026-04-05,NETFLIX.COM,-17.99",
    "2026-01-09,SPOTIFY,-10.99",
    "2026-02-09,SPOTIFY,-10.99",
    "2026-03-09,SPOTIFY,-10.99",
    "2026-01-12,ADOBE CREATIVE,-59.99",
    "2026-02-12,ADOBE CREATIVE,-59.99",
    "2026-03-12,ADOBE CREATIVE,-59.99"
  ].join("\n");
  const input = id(importer, "import-file");
  const file = new importer.File([csv], "statement.csv", { type: "text/csv" });
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  input.dispatchEvent(new importer.Event("change", { bubbles: true }));
  await pause(40);
  id(importer, "import-mapping").querySelector(".import-actions .button.primary").click();
  await pause(40);
  save(importer, "import");

  const dialog = boot(false);
  id(dialog, "add-button").click();
  id(dialog, "sub-name").value = "Streaming TV";
  id(dialog, "sub-price").value = "17.99";
  id(dialog, "sub-next").value = "2026-11-03";
  id(dialog, "sub-trial").value = "2026-11-10";
  id(dialog, "sub-category").value = "Entertainment";
  id(dialog, "sub-cancel-url").value = "https://example.com/account/billing";
  id(dialog, "sub-notes").value = "Shared with the flat. Cancel after the last episode.";
  save(dialog, "add-dialog");

  const upgrade = boot(false);
  await addSample(upgrade);
  id(upgrade, "add-button").click();
  save(upgrade, "upgrade-dialog");

  console.log("snapshots in " + out);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
