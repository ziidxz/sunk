import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, "..", "site");
const SITE_URL = "https://ziidxz.github.io/sunk";

const keyFile = readdirSync(site).find((name) => /^[a-f0-9]{32}\.txt$/.test(name));
if (!keyFile) {
  console.error("No IndexNow key file in site/. Create one with:");
  console.error("  openssl rand -hex 16 > site/<key>.txt");
  process.exit(1);
}

const key = readFileSync(join(site, keyFile), "utf8").trim();
const args = process.argv.slice(2);
const urlList = args.length ? args : [
  SITE_URL + "/",
  SITE_URL + "/order.html",
  SITE_URL + "/privacy.html",
  SITE_URL + "/terms.html",
  SITE_URL + "/app/"
];

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    host: new URL(SITE_URL).host,
    key,
    keyLocation: SITE_URL + "/" + keyFile,
    urlList
  })
});

console.log("IndexNow " + response.status + " for " + urlList.length + " URLs");
if (response.status !== 200 && response.status !== 202) {
  console.error(await response.text());
  process.exit(1);
}
