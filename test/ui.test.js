const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Window } = require("happy-dom");

const root = path.join(__dirname, "..");
const html = fs
  .readFileSync(path.join(root, "src/index.html"), "utf8")
  .replace(/<script[\s\S]*?<\/script>/g, "");
const sources = {
  core: fs.readFileSync(path.join(root, "src/core.js"), "utf8"),
  store: fs.readFileSync(path.join(root, "src/store.js"), "utf8"),
  ui: fs.readFileSync(path.join(root, "src/ui.js"), "utf8")
};

function boot(options) {
  const settings = options || {};
  const win = new Window({ url: settings.url || "https://sunk.example/app/" });
  win.SUNK_EDITION = settings.pro ? "pro" : "free";
  win.document.write(html);
  evaluate(win, sources.core);
  evaluate(win, sources.store);
  evaluate(win, sources.ui);
  return win;
}

function evaluate(win, code) {
  // Shadow Node's CommonJS bindings so the browser UMD branch runs.
  const run = new Function("window", "module", "exports", "require", code);
  run(win, undefined, undefined, undefined);
}

function id(win, name) {
  return win.document.getElementById(name);
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

function go(win, name) {
  win.location.hash = "#" + name;
  win.dispatchEvent(new win.Event("hashchange"));
}

function loadSample(win) {
  id(win, "load-sample").click();
}

function fillSub(win, values) {
  id(win, "add-button").click();
  id(win, "sub-name").value = values.name;
  id(win, "sub-price").value = values.price;
  id(win, "sub-cycle").value = values.cycle || "monthly";
  id(win, "sub-next").value = values.nextDate;
  if (values.trial) id(win, "sub-trial").value = values.trial;
}

test("boots to an empty ledger and writes the initial state", () => {
  const win = boot();
  const stored = JSON.parse(win.localStorage.getItem("sunk.v1"));
  assert.equal(stored.subs.length, 0);
  assert.equal(id(win, "monthly-total").textContent, "$0.00");
  assert.equal(id(win, "empty-state").hidden, false);
  assert.equal(id(win, "ledger-body").children.length, 0);
  assert.equal(win.document.querySelectorAll(".tabs a[aria-current='page']").length, 1);
});

test("loads the sample ledger with correct totals and notice", () => {
  const win = boot();
  loadSample(win);
  assert.equal(id(win, "ledger-body").children.length, 5);
  assert.equal(id(win, "monthly-total").textContent, "$90.97");
  assert.equal(id(win, "active-count").textContent, "5");
  assert.equal(id(win, "sample-notice").hidden, false);
  assert.equal(id(win, "empty-state").hidden, true);
  assert.equal(id(win, "stopped-total").hidden, true);
  assert.match(id(win, "alerts").textContent, /Fitness studio trial ends/i);
  assert.equal(JSON.parse(win.localStorage.getItem("sunk.v1")).subs.length, 5);
});

test("adds a subscription through the form and escapes its name", async () => {
  const win = boot();
  fillSub(win, {
    name: "<img src=x onerror=alert(1)>",
    price: "12.50",
    nextDate: "2026-11-15"
  });
  id(win, "sub-save").click();
  await flush();

  assert.equal(id(win, "sub-dialog").open, false);
  assert.equal(id(win, "monthly-total").textContent, "$12.50");
  assert.equal(id(win, "ledger-body").children.length, 1);
  assert.equal(win.document.querySelectorAll("#ledger-body img").length, 0);
  assert.equal(id(win, "ledger-body").querySelector(".sub-name").textContent, "<img src=x onerror=alert(1)>");

  const stored = JSON.parse(win.localStorage.getItem("sunk.v1"));
  assert.equal(stored.subs[0].priceMinor, 1250);
  assert.equal(stored.subs[0].cycle, "monthly");
  assert.equal(stored.subs[0].nextDate, "2026-11-15");
  assert.equal(stored.subs[0].priceHistory.length, 1);
});

test("shows a validation error instead of saving an incomplete entry", () => {
  const win = boot();
  id(win, "add-button").click();
  id(win, "sub-form").dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
  assert.equal(id(win, "sub-error").hidden, false);
  assert.match(id(win, "sub-error").textContent, /name/i);
  assert.equal(id(win, "sub-dialog").open, true);
  assert.equal(id(win, "ledger-body").children.length, 0);
});

test("records a price increase in history when editing", async () => {
  const win = boot();
  fillSub(win, { name: "Music", price: "10.00", nextDate: "2026-11-20" });
  id(win, "sub-save").click();
  await flush();

  id(win, "ledger-body").querySelector(".sub-name").click();
  id(win, "sub-price").value = "12.00";
  id(win, "sub-save").click();
  await flush();

  const stored = JSON.parse(win.localStorage.getItem("sunk.v1"));
  assert.equal(stored.subs[0].priceMinor, 1200);
  assert.equal(stored.subs[0].priceHistory.length, 2);
  assert.equal(stored.subs[0].priceHistory[1].priceMinor, 1200);
  assert.equal(id(win, "monthly-total").textContent, "$12.00");
  assert.equal(id(win, "hike-count").textContent, "1");
});

test("blocks a sixth subscription in the free edition", () => {
  const win = boot();
  loadSample(win);
  id(win, "add-button").click();
  assert.equal(id(win, "upgrade-dialog").open, true);
  assert.equal(id(win, "sub-dialog").open, false);
  assert.match(id(win, "upgrade-lead").textContent, /five|5/i);
});

test("does not let a cancelled entry resume into a sixth free slot", async () => {
  const win = boot();
  loadSample(win);

  const cancel = Array.from(id(win, "ledger-body").querySelectorAll("button"))
    .find((button) => button.getAttribute("aria-label") === "Mark Streaming TV as cancelled");
  cancel.click();
  id(win, "confirm-yes").click();
  await flush();
  assert.equal(id(win, "active-count").textContent, "4");

  fillSub(win, { name: "Extra service", price: "5.00", nextDate: "2026-11-18" });
  id(win, "sub-save").click();
  await flush();
  assert.equal(id(win, "active-count").textContent, "5");
  assert.equal(id(win, "ledger-body").children.length, 5);

  const filter = id(win, "filter-status");
  filter.value = "all";
  filter.dispatchEvent(new win.Event("change", { bubbles: true }));
  assert.equal(id(win, "ledger-body").children.length, 6);

  const cancelled = Array.from(id(win, "ledger-body").querySelectorAll(".sub-name"))
    .find((button) => button.textContent === "Streaming TV");
  cancelled.click();
  id(win, "sub-status").value = "active";
  id(win, "sub-save").click();
  await flush();

  assert.equal(id(win, "sub-dialog").open, true);
  assert.match(id(win, "sub-error").textContent, /five|5/i);
  const stored = JSON.parse(win.localStorage.getItem("sunk.v1"));
  const streaming = stored.subs.find((sub) => sub.name === "Streaming TV");
  assert.equal(streaming.status, "cancelled");
  assert.equal(id(win, "active-count").textContent, "5");
});

test("marks a subscription cancelled and reports the returned money", async () => {
  const win = boot();
  loadSample(win);

  const cancel = Array.from(id(win, "ledger-body").querySelectorAll("button"))
    .find((button) => button.getAttribute("aria-label") === "Mark Streaming TV as cancelled");
  assert.ok(cancel, "cancel button exists");
  cancel.click();
  assert.equal(id(win, "confirm-dialog").open, true);

  id(win, "confirm-yes").click();
  await flush();

  assert.equal(id(win, "monthly-total").textContent, "$72.98");
  assert.equal(id(win, "active-count").textContent, "4");
  assert.equal(id(win, "stopped-total").hidden, false);
  assert.equal(id(win, "stopped-total").textContent, "Already stopped: $215.88 a year");
  const stored = JSON.parse(win.localStorage.getItem("sunk.v1"));
  const cancelled = stored.subs.find((sub) => sub.name === "Streaming TV");
  assert.equal(cancelled.status, "cancelled");
});

test("switches between paper and ink and stores the choice", () => {
  const win = boot();
  assert.equal(win.document.documentElement.getAttribute("data-theme"), "light");
  id(win, "theme-toggle").click();
  assert.equal(win.document.documentElement.getAttribute("data-theme"), "dark");
  assert.equal(win.localStorage.getItem("sunk.theme"), "dark");
  assert.equal(id(win, "theme-toggle").textContent, "Light");
  id(win, "theme-toggle").click();
  assert.equal(win.document.documentElement.getAttribute("data-theme"), "light");
  assert.equal(win.localStorage.getItem("sunk.theme"), "light");
});

test("renders renewal chips and a month total in the calendar", () => {
  const win = boot();
  loadSample(win);
  go(win, "calendar");
  assert.equal(id(win, "view-calendar").hidden, false);
  assert.equal(id(win, "view-ledger").hidden, true);

  let chips = id(win, "calendar-grid").querySelectorAll(".cal-chip");
  let guard = 0;
  while (chips.length === 0 && guard < 3) {
    id(win, "calendar-next").click();
    chips = id(win, "calendar-grid").querySelectorAll(".cal-chip");
    guard++;
  }
  assert.ok(chips.length > 0, "calendar shows renewal chips");
  assert.ok(id(win, "calendar-list").querySelectorAll(".cal-event").length > 0);
  assert.notEqual(id(win, "calendar-total").textContent, "No renewals this month.");
  assert.match(id(win, "calendar-total").textContent, /\$/);
});

test("gates CSV import in the free edition", () => {
  const win = boot();
  go(win, "import");
  assert.equal(id(win, "view-import").hidden, false);
  assert.equal(id(win, "import-file"), null);
  assert.match(id(win, "import-body").textContent, /offline edition/i);
});

test("imports recurring charges in the pro edition", async () => {
  const win = boot({ pro: true });
  go(win, "import");
  assert.ok(id(win, "import-file"), "pro edition shows the file input");

  const csv = [
    "Date,Description,Amount",
    "2026-01-05,NETFLIX.COM,-15.99",
    "2026-02-05,NETFLIX.COM,-15.99",
    "2026-03-05,NETFLIX.COM,-17.99",
    "2026-01-09,SPOTIFY,-10.99",
    "2026-02-09,SPOTIFY,-10.99",
    "2026-03-09,SPOTIFY,-10.99"
  ].join("\n");
  const input = id(win, "import-file");
  const file = new win.File([csv], "statement.csv", { type: "text/csv" });
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  input.dispatchEvent(new win.Event("change", { bubbles: true }));
  await flush();

  assert.equal(id(win, "import-col-date").value, "0");
  assert.equal(id(win, "import-col-desc").value, "1");
  assert.equal(id(win, "import-col-amount").value, "2");
  assert.equal(id(win, "import-preview").querySelectorAll("tbody tr").length, 4);

  id(win, "import-mapping").querySelector(".import-actions .button.primary").click();
  await flush();

  const proposals = id(win, "import-results").querySelectorAll(".proposal");
  assert.equal(proposals.length, 2);
  id(win, "import-results").querySelector(".import-actions .button.primary").click();
  await flush();

  const stored = JSON.parse(win.localStorage.getItem("sunk.v1"));
  assert.equal(stored.subs.length, 2);
  const netflix = stored.subs.find((sub) => sub.name === "Netflix.com");
  const spotify = stored.subs.find((sub) => sub.name === "Spotify");
  assert.ok(netflix);
  assert.ok(spotify);
  assert.equal(netflix.priceMinor, 1799);
  assert.equal(netflix.nextDate, "2026-11-05");
  assert.equal(netflix.priceHistory.length, 2);
  assert.equal(spotify.priceMinor, 1099);
  assert.equal(spotify.nextDate, "2026-11-09");
  assert.equal(id(win, "monthly-total").textContent, "$28.98");
  assert.equal(id(win, "ledger-body").children.length, 2);
});

test("changes the ledger currency only after confirmation", async () => {
  const win = boot();
  loadSample(win);
  go(win, "settings");
  const select = id(win, "settings-currency");
  assert.ok(select);
  select.value = "IDR";
  select.dispatchEvent(new win.Event("change", { bubbles: true }));
  assert.equal(id(win, "confirm-dialog").open, true);
  id(win, "confirm-yes").click();
  await flush();

  assert.match(id(win, "monthly-total").textContent, /Rp/);
  const stored = JSON.parse(win.localStorage.getItem("sunk.v1"));
  assert.equal(stored.currency, "IDR");
  assert.equal(stored.subs[0].currency, "IDR");
});

test("downloads a JSON backup and restores it", async () => {
  const win = boot();
  loadSample(win);

  const downloads = [];
  win.URL.createObjectURL = () => "blob:sunk-test";
  win.URL.revokeObjectURL = () => {};
  win.HTMLAnchorElement.prototype.click = function () {
    downloads.push({ name: this.download, href: this.href });
  };
  go(win, "settings");
  const exportButton = Array.from(id(win, "settings-body").querySelectorAll("button"))
    .find((button) => button.textContent === "Download JSON backup");
  exportButton.click();
  assert.equal(downloads.length, 1);
  assert.match(downloads[0].name, /^sunk-backup-\d{4}-\d{2}-\d{2}\.json$/);

  const backup = {
    app: "Sunk",
    version: 1,
    currency: "USD",
    subs: [{
      id: "restored-1",
      name: "Restored service",
      priceMinor: 500,
      currency: "USD",
      cycle: "monthly",
      nextDate: "2026-11-10",
      status: "active",
      category: "Other"
    }]
  };
  const input = id(win, "settings-restore");
  const file = new win.File([JSON.stringify(backup)], "backup.json", { type: "application/json" });
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  input.dispatchEvent(new win.Event("change", { bubbles: true }));
  await flush();
  assert.equal(id(win, "confirm-dialog").open, true);
  id(win, "confirm-yes").click();
  await flush();

  const stored = JSON.parse(win.localStorage.getItem("sunk.v1"));
  assert.equal(stored.subs.length, 1);
  assert.equal(stored.subs[0].name, "Restored service");
  assert.equal(id(win, "monthly-total").textContent, "$5.00");
});
