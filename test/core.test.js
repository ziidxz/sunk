const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/core.js");

test("formats money with the right decimals", () => {
  assert.equal(C.formatMoney(1799, "USD"), "$17.99");
  assert.equal(C.formatMoney(90000, "IDR"), "Rp\u00a090.000");
  assert.equal(C.formatMoney(-500, "USD"), "-$5.00");
});

test("parses amounts from bank-style strings", () => {
  assert.equal(C.parseAmount("$1,234.56"), 1234.56);
  assert.equal(C.parseAmount("1.234,56"), 1234.56);
  assert.equal(C.parseAmount("(12.50)"), -12.50);
  assert.equal(C.parseAmount("-7"), -7);
  assert.equal(C.parseAmount("USD 0.99"), 0.99);
  assert.equal(C.parseAmount(""), null);
});

test("converts major units to minor units", () => {
  assert.equal(C.parseAmountToMinor("17.99", "USD"), 1799);
  assert.equal(C.parseAmountToMinor("90.000", "IDR"), 90000);
  assert.equal(C.parseAmountToMinor("12,5", "EUR"), 1250);
});

test("parses loose dates with explicit and inferred order", () => {
  assert.equal(C.parseDateLoose("2026-10-31", "auto"), "2026-10-31");
  assert.equal(C.parseDateLoose("31/10/2026", "auto"), "2026-10-31");
  assert.equal(C.parseDateLoose("10/31/2026", "auto"), "2026-10-31");
  assert.equal(C.parseDateLoose("05/06/2026", "MDY"), "2026-05-06");
  assert.equal(C.parseDateLoose("05/06/2026", "DMY"), "2026-06-05");
  assert.equal(C.parseDateLoose("31 Oct 2026", "auto"), "2026-10-31");
  assert.equal(C.parseDateLoose("Oct 31, 2026", "auto"), "2026-10-31");
  assert.equal(C.parseDateLoose("31/02/2026", "auto"), null);
});

test("adds cycles without rolling past the end of a month", () => {
  assert.equal(C.addCycle("2026-01-31", "monthly"), "2026-02-28");
  assert.equal(C.addCycle("2028-01-31", "monthly"), "2028-02-29");
  assert.equal(C.addCycle("2028-02-29", "yearly"), "2029-02-28");
  assert.equal(C.addCycle("2026-10-31", "weekly"), "2026-11-07");
  assert.equal(C.addCycle("2026-10-31", "quarterly"), "2027-01-31");
  assert.equal(C.addCycle("2026-10-31", "semiannual"), "2027-04-30");
});

test("computes monthly and yearly totals across cycles", () => {
  const subs = [
    { priceMinor: 1200, cycle: "monthly", status: "active" },
    { priceMinor: 12000, cycle: "yearly", status: "active" },
    { priceMinor: 300, cycle: "weekly", status: "active" },
    { priceMinor: 999, cycle: "monthly", status: "paused" }
  ];
  const t = C.totals(subs);
  assert.equal(t.count, 3);
  assert.equal(t.monthly, 1200 + 1000 + 1300);
  assert.equal(t.yearly, (1200 + 1000 + 1300) * 12);
});

test("lists upcoming renewals with overdue items first", () => {
  const subs = [
    { name: "Late", priceMinor: 100, cycle: "monthly", status: "active", nextDate: "2026-10-30" },
    { name: "Soon", priceMinor: 100, cycle: "monthly", status: "active", nextDate: "2026-11-02" },
    { name: "Later", priceMinor: 100, cycle: "monthly", status: "active", nextDate: "2026-12-30" }
  ];
  const list = C.upcoming(subs, "2026-10-31", 30);
  assert.equal(list.length, 2);
  assert.equal(list[0].sub.name, "Late");
  assert.equal(list[0].overdue, true);
  assert.equal(list[1].sub.name, "Soon");
  assert.equal(list[1].overdue, false);
});

test("finds a price increase from history", () => {
  const sub = {
    priceHistory: [
      { date: "2026-01-01", priceMinor: 1599 },
      { date: "2026-08-01", priceMinor: 1799 }
    ]
  };
  const change = C.priceChange(sub);
  assert.equal(change.from, 1599);
  assert.equal(change.to, 1799);
  assert.equal(change.delta, 200);
  assert.equal(C.priceChange({ priceHistory: [{ date: "2026-01-01", priceMinor: 100 }] }), null);
});

test("parses quoted CSV with commas, semicolons and CRLF", () => {
  const csv = 'Date,Description,Amount\r\n2026-01-01,"Netflix, Inc.",-17.99\r\n2026-02-01,Spotify,-10.99\r\n';
  const parsed = C.parseCSV(csv);
  assert.equal(parsed.delimiter, ",");
  assert.equal(parsed.rows.length, 3);
  assert.equal(parsed.rows[1][1], "Netflix, Inc.");
  assert.equal(parsed.rows[2][2], "-10.99");

  const euro = "Datum;Beschreibung;Betrag\n01.02.2026;Spotify;-10,99\n";
  const parsedEuro = C.parseCSV(euro);
  assert.equal(parsedEuro.delimiter, ";");
  assert.equal(parsedEuro.rows[1][2], "-10,99");
});

test("normalizes merchant noise without deleting the brand", () => {
  assert.equal(C.normalizeMerchant("SQ *NETFLIX.COM 1234"), "netflix com");
  assert.equal(C.normalizeMerchant("PAYPAL *SPOTIFY 8844"), "spotify");
  assert.equal(C.normalizeMerchant("POS DEBIT APPLE MUSIC"), "apple music");
  assert.equal(C.normalizeMerchant("SPOTIFY"), "spotify");
  assert.equal(C.normalizeMerchant("PP*SPOTIFY 9911"), "spotify");
});

test("keeps brands that begin with a processor prefix", () => {
  assert.equal(C.displayName("SPOTIFY"), "Spotify");
  assert.equal(C.displayName("SQ *SQUARE SPACE"), "Square Space");
  assert.equal(C.displayName("PP *SPOTIFY"), "Spotify");
});

test("detects a monthly subscription and rolls the next date forward", () => {
  const txns = [
    { date: "2026-01-05", description: "NETFLIX.COM", amountMinor: -1599 },
    { date: "2026-02-05", description: "NETFLIX.COM", amountMinor: -1599 },
    { date: "2026-03-05", description: "NETFLIX.COM", amountMinor: -1799 },
    { date: "2026-03-07", description: "CORNER STORE", amountMinor: -420 }
  ];
  const found = C.detectRecurring(txns, { today: "2026-10-31", currency: "USD" });
  assert.equal(found.length, 1);
  assert.equal(found[0].name, "Netflix.com");
  assert.equal(found[0].cycle, "monthly");
  assert.equal(found[0].priceMinor, 1799);
  assert.equal(found[0].previousPriceMinor, 1599);
  assert.equal(found[0].firstDate, "2026-01-05");
  assert.equal(found[0].priceChanged, true);
  assert.equal(found[0].nextDate, "2026-11-05");
  assert.ok(found[0].confidence > 0.5);
});

test("detects a yearly charge and ignores one-off purchases", () => {
  const txns = [
    { date: "2024-06-12", description: "DOMAIN RENEWAL", amountMinor: -1200 },
    { date: "2025-06-12", description: "DOMAIN RENEWAL", amountMinor: -1200 },
    { date: "2026-06-12", description: "DOMAIN RENEWAL", amountMinor: -1400 },
    { date: "2026-10-01", description: "HARDWARE SHOP", amountMinor: -8900 }
  ];
  const found = C.detectRecurring(txns, { today: "2026-10-31" });
  assert.equal(found.length, 1);
  assert.equal(found[0].cycle, "yearly");
  assert.equal(found[0].nextDate, "2027-06-12");
});

test("respects a positive-expense CSV", () => {
  const txns = [
    { date: "2026-01-10", description: "GYM", amountMinor: 3900 },
    { date: "2026-02-10", description: "GYM", amountMinor: 3900 },
    { date: "2026-03-10", description: "GYM", amountMinor: 3900 }
  ];
  const auto = C.detectRecurring(txns, { today: "2026-10-31" });
  assert.equal(auto.length, 1);
  assert.equal(auto[0].cycle, "monthly");
});

test("exports a valid ICS calendar with alarms and escaped text", () => {
  const subs = [{
    id: "abc",
    name: "Music, Video",
    priceMinor: 1099,
    currency: "USD",
    cycle: "monthly",
    nextDate: "2026-11-05",
    status: "active",
    trialEndsAt: "2026-11-02"
  }];
  const ics = C.toICS(subs, { alarmDays: 3, stamp: "20261031T120000Z" });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.includes("SUMMARY:Music\\, Video renews ($10.99)"));
  assert.ok(ics.includes("RRULE:FREQ=MONTHLY"));
  assert.ok(ics.includes("TRIGGER:-P3D"));
  assert.ok(ics.includes("SUMMARY:Trial ends: Music\\, Video"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
});

test("sample ledger totals add up", () => {
  const subs = C.sampleSubs("2026-10-31");
  const t = C.totals(subs);
  assert.equal(t.count, 5);
  assert.equal(t.monthly, 1799 + 1099 + 2000 + 299 + 3900);
  assert.equal(t.yearly, (1799 + 1099 + 2000 + 299 + 3900) * 12);
});

test("expands every renewal inside a month", () => {
  const subs = [{
    name: "Music",
    priceMinor: 1000,
    cycle: "weekly",
    status: "active",
    nextDate: "2026-10-29"
  }];
  const list = C.occurrencesBetween(subs, "2026-11-01", "2026-11-30");
  assert.deepEqual(list.map((x) => x.date), ["2026-11-05", "2026-11-12", "2026-11-19", "2026-11-26"]);
});

test("labels due dates in plain language", () => {
  assert.equal(C.dueLabel("2026-10-30", "2026-10-31"), "Overdue by 1 day");
  assert.equal(C.dueLabel("2026-10-31", "2026-10-31"), "Today");
  assert.equal(C.dueLabel("2026-11-01", "2026-10-31"), "Tomorrow");
  assert.equal(C.dueLabel("2026-11-10", "2026-10-31"), "In 10 days");
});

test("writes a cancellation email with the price and cycle", () => {
  const text = C.cancellationEmail({
    name: "Streaming TV",
    priceMinor: 1799,
    currency: "USD",
    cycle: "monthly"
  });
  assert.ok(text.includes("Streaming TV"));
  assert.ok(text.includes("$17.99/month"));
  assert.ok(text.includes("confirm the cancellation in writing"));
});
