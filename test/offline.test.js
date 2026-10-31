const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Window } = require("happy-dom");

const file = path.join(__dirname, "..", "dist", "sunk-offline.html");
const html = fs.readFileSync(file, "utf8");

function scripts() {
  const found = {};
  const pattern = /<script id="(sunk-[a-z]+)">([\s\S]*?)<\/script>/g;
  let match;
  while ((match = pattern.exec(html))) found[match[1]] = match[2];
  return found;
}

function boot() {
  const code = scripts();
  assert.ok(code["sunk-core"], "core script is inlined");
  const win = new Window({ url: "https://local.test/sunk-offline.html" });
  const markup = html.replace(/<script[\s\S]*?<\/script>/g, "");
  win.document.write(markup);
  for (const id of ["sunk-edition", "sunk-core", "sunk-store", "sunk-ui"]) {
    new Function("window", "module", "exports", "require", code[id])(win, undefined, undefined, undefined);
  }
  return win;
}

function id(win, name) {
  return win.document.getElementById(name);
}

test("offline edition is one file with no external assets", () => {
  assert.equal(/<script[^>]+src=/.test(html), false, "no external scripts");
  assert.equal(/<link[^>]+stylesheet/.test(html), false, "no external stylesheets");
  assert.equal(/<link[^>]+manifest/.test(html), false, "no manifest request");
  assert.equal(/https:\/\/ziidxz\.github\.io\/sunk\/privacy\.html/.test(html), true);
  assert.ok(html.length > 100000, "bundle carries the app");
});

test("offline edition boots as pro and ignores the free limit", async () => {
  const win = boot();
  assert.equal(win.SUNK_EDITION, "pro");
  assert.ok(win.SunkCore);
  assert.ok(win.SunkStore);
  assert.equal(id(win, "view-ledger").hidden, false);

  for (let i = 1; i <= 6; i++) {
    id(win, "add-button").click();
    id(win, "sub-name").value = "Service " + i;
    id(win, "sub-price").value = "10.00";
    id(win, "sub-next").value = "2026-11-" + String(i + 10).padStart(2, "0");
    id(win, "sub-save").click();
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  assert.equal(id(win, "sub-dialog").open, false);
  assert.equal(id(win, "upgrade-dialog"), null, "no upgrade dialog in pro");
  assert.equal(id(win, "ledger-body").children.length, 6);
  assert.equal(id(win, "monthly-total").textContent, "$60.00");
  assert.equal(JSON.parse(win.localStorage.getItem("sunk.v1")).subs.length, 6);
});

test("offline edition exposes import and exports a calendar file", async () => {
  const win = boot();
  win.location.hash = "#import";
  win.dispatchEvent(new win.Event("hashchange"));
  assert.ok(id(win, "import-file"), "CSV input is available");
  assert.equal(id(win, "view-import").hidden, false);

  id(win, "add-button").click();
  id(win, "sub-name").value = "Annual backup";
  id(win, "sub-price").value = "120.00";
  id(win, "sub-cycle").value = "yearly";
  id(win, "sub-next").value = "2027-01-04";
  id(win, "sub-save").click();
  await new Promise((resolve) => setTimeout(resolve, 5));

  const downloads = [];
  win.URL.createObjectURL = () => "blob:offline-test";
  win.URL.revokeObjectURL = () => {};
  win.HTMLAnchorElement.prototype.click = function () {
    downloads.push(this.download);
  };

  win.location.hash = "#calendar";
  win.dispatchEvent(new win.Event("hashchange"));
  id(win, "calendar-export").click();
  assert.deepEqual(downloads, ["sunk-renewals.ics"]);
  assert.match(id(win, "calendar-total").textContent, /renewal|No renewals/);
});
