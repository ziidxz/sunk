const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Window } = require("happy-dom");

const root = path.join(__dirname, "..", "site");
const landingHtml = fs.readFileSync(path.join(root, "index.html"), "utf8")
  .replace(/<script[\s\S]*?<\/script>/g, "");
const landingJs = fs.readFileSync(path.join(root, "landing.js"), "utf8");

function bootLanding() {
  const win = new Window({ url: "https://ziidxz.github.io/sunk/" });
  win.document.write(landingHtml);
  new Function("window", "document", landingJs)(win, win.document);
  return win;
}

function id(win, name) {
  return win.document.getElementById(name);
}

test("landing sample totals follow the ticked rows", () => {
  const win = bootLanding();
  assert.equal(id(win, "sample-monthly").textContent, "$90.97");
  assert.equal(id(win, "sample-yearly").textContent, "$1,091.64 a year");

  const checks = win.document.querySelectorAll("[data-sample-toggle]");
  assert.equal(checks.length, 5);

  checks[0].checked = false;
  checks[0].dispatchEvent(new win.Event("change", { bubbles: true }));
  assert.equal(id(win, "sample-monthly").textContent, "$72.98");
  assert.equal(id(win, "sample-yearly").textContent, "$875.76 a year");
  assert.match(id(win, "sample-kept").textContent, /\$215\.88/);

  checks.forEach((box) => {
    box.checked = false;
    box.dispatchEvent(new win.Event("change", { bubbles: true }));
  });
  assert.equal(id(win, "sample-monthly").textContent, "$0.00");
  assert.match(id(win, "sample-kept").textContent, /\$1,091\.64/);
});

test("public pages keep the price and the order path together", () => {
  const landing = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const order = fs.readFileSync(path.join(root, "order.html"), "utf8");
  const terms = fs.readFileSync(path.join(root, "terms.html"), "utf8");

  assert.match(landing, /\$12/);
  assert.match(order, /\$12/);
  assert.match(order, /under 130 KB/);
  assert.match(order, /mailto:ziidcxz@gmail\.com/);
  assert.match(order, /14 days/);
  assert.match(terms, /14 days/);
  assert.match(terms, /non-transferable/);
});

test("public copy uses no em dash", () => {
  for (const name of fs.readdirSync(root)) {
    if (!name.endsWith(".html") && !name.endsWith(".txt")) continue;
    const text = fs.readFileSync(path.join(root, name), "utf8");
    assert.equal(text.includes("\u2014"), false, name + " contains an em dash");
  }
});
