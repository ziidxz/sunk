(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SunkCore = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  var FREE_LIMIT = 5;
  var DATA_VERSION = 1;

  var CURRENCIES = {
    USD: { code: "USD", symbol: "$", decimals: 2, locale: "en-US" },
    EUR: { code: "EUR", symbol: "\u20ac", decimals: 2, locale: "de-DE" },
    GBP: { code: "GBP", symbol: "\u00a3", decimals: 2, locale: "en-GB" },
    IDR: { code: "IDR", symbol: "Rp", decimals: 0, locale: "id-ID" },
    JPY: { code: "JPY", symbol: "\u00a5", decimals: 0, locale: "ja-JP" },
    AUD: { code: "AUD", symbol: "A$", decimals: 2, locale: "en-AU" },
    CAD: { code: "CAD", symbol: "C$", decimals: 2, locale: "en-CA" },
    SGD: { code: "SGD", symbol: "S$", decimals: 2, locale: "en-SG" },
    INR: { code: "INR", symbol: "\u20b9", decimals: 2, locale: "en-IN" },
    PHP: { code: "PHP", symbol: "\u20b1", decimals: 2, locale: "en-PH" },
    MYR: { code: "MYR", symbol: "RM", decimals: 2, locale: "ms-MY" },
    BRL: { code: "BRL", symbol: "R$", decimals: 2, locale: "pt-BR" },
    MXN: { code: "MXN", symbol: "MX$", decimals: 2, locale: "es-MX" },
    ZAR: { code: "ZAR", symbol: "R", decimals: 2, locale: "en-ZA" },
    CHF: { code: "CHF", symbol: "CHF", decimals: 2, locale: "de-CH" },
    SEK: { code: "SEK", symbol: "kr", decimals: 2, locale: "sv-SE" },
    PLN: { code: "PLN", symbol: "z\u0142", decimals: 2, locale: "pl-PL" }
  };

  var CYCLES = ["weekly", "biweekly", "monthly", "quarterly", "semiannual", "yearly"];

  function currency(code) {
    return CURRENCIES[code] || CURRENCIES.USD;
  }

  function moneyFactor(code) {
    return Math.pow(10, currency(code).decimals);
  }

  function formatMoney(minor, code) {
    var c = currency(code);
    var value = (Number(minor) || 0) / moneyFactor(code);
    try {
      return new Intl.NumberFormat(c.locale, {
        style: "currency",
        currency: c.code,
        minimumFractionDigits: c.decimals,
        maximumFractionDigits: c.decimals
      }).format(value);
    } catch (err) {
      return c.symbol + value.toFixed(c.decimals);
    }
  }

  function parseAmount(value) {
    if (value === null || value === undefined) return null;
    var s = String(value).trim();
    if (!s) return null;
    var negative = false;
    if (/^\(.*\)$/.test(s)) {
      negative = true;
      s = s.slice(1, -1);
    }
    s = s.replace(/[^\d.,\-]/g, "");
    if (s.charAt(0) === "-") {
      negative = true;
      s = s.slice(1);
    }
    if (!s) return null;
    var lastComma = s.lastIndexOf(",");
    var lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
    var n = parseFloat(s);
    if (!isFinite(n)) return null;
    return negative ? -n : n;
  }

  function parseAmountToMinor(value, code) {
    var c = currency(code);
    if (c.decimals === 0) {
      var s = String(value === null || value === undefined ? "" : value).trim();
      var negative = /^\(.*\)$/.test(s) || s.charAt(0) === "-";
      s = s.replace(/[^\d.,]/g, "");
      if (!s) return null;
      var parts = s.split(/[.,]/);
      var n;
      if (parts.length > 1 && parts[parts.length - 1].length !== 3) {
        var last = parts.pop();
        n = parseFloat(parts.join("") + "." + last);
      } else {
        n = parseFloat(s.replace(/[.,]/g, ""));
      }
      if (!isFinite(n)) return null;
      return Math.round(negative ? -n : n);
    }
    var major = parseAmount(value);
    if (major === null) return null;
    return Math.round(major * moneyFactor(code));
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function todayISO(now) {
    var d = now || new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function makeISO(year, month, day) {
    var d = new Date(Date.UTC(year, month - 1, day));
    if (
      d.getUTCFullYear() !== year ||
      d.getUTCMonth() !== month - 1 ||
      d.getUTCDate() !== day
    ) {
      return null;
    }
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
  }

  function parseISO(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    if (!m) return null;
    var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    if (
      d.getUTCFullYear() !== Number(m[1]) ||
      d.getUTCMonth() !== Number(m[2]) - 1 ||
      d.getUTCDate() !== Number(m[3])
    ) {
      return null;
    }
    return d;
  }

  function addDays(iso, days) {
    var d = parseISO(iso);
    if (!d) return iso;
    d.setUTCDate(d.getUTCDate() + days);
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
  }

  function addMonths(iso, months) {
    var d = parseISO(iso);
    if (!d) return iso;
    var day = d.getUTCDate();
    var target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
    var last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(day, last));
    return target.getUTCFullYear() + "-" + pad2(target.getUTCMonth() + 1) + "-" + pad2(target.getUTCDate());
  }

  function addCycle(iso, cycle, times) {
    var n = times === undefined ? 1 : times;
    if (n === 0) return iso;
    switch (cycle) {
      case "weekly": return addDays(iso, 7 * n);
      case "biweekly": return addDays(iso, 14 * n);
      case "monthly": return addMonths(iso, n);
      case "quarterly": return addMonths(iso, 3 * n);
      case "semiannual": return addMonths(iso, 6 * n);
      case "yearly": return addMonths(iso, 12 * n);
      default: return iso;
    }
  }

  function daysBetween(fromISO, toISO) {
    var a = parseISO(fromISO);
    var b = parseISO(toISO);
    if (!a || !b) return 0;
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }

  function cycleLabel(cycle) {
    switch (cycle) {
      case "weekly": return "Every week";
      case "biweekly": return "Every 2 weeks";
      case "monthly": return "Every month";
      case "quarterly": return "Every 3 months";
      case "semiannual": return "Every 6 months";
      case "yearly": return "Every year";
      default: return "Every month";
    }
  }

  function cycleShort(cycle) {
    switch (cycle) {
      case "weekly": return "/week";
      case "biweekly": return "/2 weeks";
      case "monthly": return "/month";
      case "quarterly": return "/quarter";
      case "semiannual": return "/6 months";
      case "yearly": return "/year";
      default: return "/month";
    }
  }

  function monthlyMinor(sub) {
    var price = Math.abs(Number(sub.priceMinor) || 0);
    switch (sub.cycle) {
      case "weekly": return (price * 52) / 12;
      case "biweekly": return (price * 26) / 12;
      case "monthly": return price;
      case "quarterly": return price / 3;
      case "semiannual": return price / 6;
      case "yearly": return price / 12;
      default: return price;
    }
  }

  function annualMinor(sub) {
    return monthlyMinor(sub) * 12;
  }

  function activeSubs(subs) {
    return (subs || []).filter(function (s) { return s && s.status === "active"; });
  }

  function totals(subs) {
    var active = activeSubs(subs);
    var monthly = 0;
    var yearly = 0;
    active.forEach(function (s) {
      monthly += monthlyMinor(s);
      yearly += annualMinor(s);
    });
    return {
      count: active.length,
      monthly: Math.round(monthly),
      yearly: Math.round(yearly)
    };
  }

  function upcoming(subs, fromISO, days) {
    var limit = addDays(fromISO, days === undefined ? 30 : days);
    var out = [];
    activeSubs(subs).forEach(function (s) {
      if (!s.nextDate) return;
      if (s.nextDate <= limit) {
        out.push({
          sub: s,
          date: s.nextDate,
          overdue: s.nextDate < fromISO,
          days: daysBetween(fromISO, s.nextDate)
        });
      }
    });
    out.sort(function (a, b) {
      if (a.date === b.date) return String(a.sub.name).localeCompare(String(b.sub.name));
      return a.date < b.date ? -1 : 1;
    });
    return out;
  }

  function priceChange(sub) {
    var history = (sub.priceHistory || []).slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });
    if (history.length < 2) return null;
    var current = history[history.length - 1];
    var previous = history[history.length - 2];
    if (!current || !previous) return null;
    if (current.priceMinor <= previous.priceMinor) return null;
    return {
      from: previous.priceMinor,
      to: current.priceMinor,
      since: current.date,
      delta: current.priceMinor - previous.priceMinor
    };
  }

  function trialsEnding(subs, fromISO, days) {
    var limit = addDays(fromISO, days === undefined ? 30 : days);
    return activeSubs(subs).filter(function (s) {
      return s.trialEndsAt && s.trialEndsAt >= fromISO && s.trialEndsAt <= limit;
    }).sort(function (a, b) {
      return a.trialEndsAt < b.trialEndsAt ? -1 : 1;
    });
  }

  function occurrencesBetween(subs, fromISO, toISO) {
    var out = [];
    activeSubs(subs).forEach(function (sub) {
      if (!sub.nextDate) return;
      var date = sub.nextDate;
      var guard = 0;
      while (date < fromISO && guard < 400) {
        date = addCycle(date, sub.cycle);
        guard++;
      }
      while (date <= toISO && guard < 420) {
        out.push({ date: date, sub: sub, trial: false });
        date = addCycle(date, sub.cycle);
        guard++;
      }
      if (sub.trialEndsAt && sub.trialEndsAt >= fromISO && sub.trialEndsAt <= toISO) {
        out.push({ date: sub.trialEndsAt, sub: sub, trial: true });
      }
    });
    out.sort(function (a, b) {
      if (a.date === b.date) return String(a.sub.name).localeCompare(String(b.sub.name));
      return a.date < b.date ? -1 : 1;
    });
    return out;
  }

  function median(values) {
    if (!values.length) return 0;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function parseDateLoose(value, format) {
    var s = String(value === null || value === undefined ? "" : value).trim();
    if (!s) return null;

    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (m) return makeISO(Number(m[1]), Number(m[2]), Number(m[3]));

    m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(s);
    if (m) {
      var a = Number(m[1]);
      var b = Number(m[2]);
      var y = Number(m[3]);
      if (y < 100) y += y > 70 ? 1900 : 2000;
      var day;
      var month;
      if (format === "MDY") {
        month = a;
        day = b;
      } else if (format === "DMY") {
        day = a;
        month = b;
      } else if (a > 12) {
        day = a;
        month = b;
      } else if (b > 12) {
        month = a;
        day = b;
      } else {
        day = a;
        month = b;
      }
      return makeISO(y, month, day);
    }

    var names = {
      jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
      apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
      aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10,
      october: 10, nov: 11, november: 11, dec: 12, december: 12
    };

    m = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})$/.exec(s);
    if (m && names[m[2].toLowerCase()]) {
      return makeISO(Number(m[3]), names[m[2].toLowerCase()], Number(m[1]));
    }

    m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
    if (m && names[m[1].toLowerCase()]) {
      return makeISO(Number(m[3]), names[m[1].toLowerCase()], Number(m[2]));
    }

    var parsed = Date.parse(s);
    if (!isNaN(parsed)) {
      var d = new Date(parsed);
      return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
    }
    return null;
  }

  function parseCSV(text) {
    var source = String(text || "").replace(/^\uFEFF/, "");
    var sample = source.split(/\r?\n/).slice(0, 6).join("\n");
    var counts = { ",": 0, ";": 0, "\t": 0, "|": 0 };
    var inQuotes = false;
    for (var i = 0; i < sample.length; i++) {
      var ch = sample.charAt(i);
      if (ch === '"') {
        if (inQuotes && sample.charAt(i + 1) === '"') i++;
        else inQuotes = !inQuotes;
      } else if (!inQuotes && counts[ch] !== undefined) {
        counts[ch]++;
      }
    }
    var delimiter = ",";
    var best = -1;
    Object.keys(counts).forEach(function (key) {
      if (counts[key] > best) {
        best = counts[key];
        delimiter = key;
      }
    });

    var rows = [];
    var row = [];
    var field = "";
    inQuotes = false;
    for (var j = 0; j < source.length; j++) {
      var c = source.charAt(j);
      if (inQuotes) {
        if (c === '"') {
          if (source.charAt(j + 1) === '"') {
            field += '"';
            j++;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === delimiter) {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (c === "\r") {
        if (source.charAt(j + 1) === "\n") j++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += c;
      }
    }
    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }
    while (rows.length) {
      var last = rows[rows.length - 1];
      var empty = last.every(function (v) { return String(v).trim() === ""; });
      if (!empty) break;
      rows.pop();
    }
    return { delimiter: delimiter, rows: rows };
  }

  function normalizeMerchant(text) {
    var s = String(text || "").toLowerCase();
    s = s.replace(/^(sq|tst|sp|pp)\s*\*\s*/, " ");
    s = s.replace(/^(paypal|google pay|apple pay|amzn mktp)(?:\s*\*\s*|\s+)/, " ");
    s = s.replace(/\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b/g, " ");
    s = s.replace(/\b\d{4,}\b/g, " ");
    s = s.replace(/\b(ref|txn|transaction|auth|card|pos|debit|credit|payment|purchase|recurring|subscription|order|invoice)\b/g, " ");
    s = s.replace(/[*#]/g, " ");
    s = s.replace(/[^a-z0-9&+ ]/g, " ");
    s = s.replace(/\s+/g, " ").trim();
    return s;
  }

  function displayName(raw) {
    var s = String(raw || "").trim();
    s = s.replace(/^(SQ|TST|SP|PP)\s*\*\s*/i, "");
    s = s.replace(/^(PAYPAL|GOOGLE PAY|APPLE PAY|AMZN MKTP)(?:\s*\*\s*|\s+)/i, "");
    s = s.replace(/[*#]/g, " ");
    s = s.replace(/\s+\d{3,}.*$/, "");
    s = s.replace(/\s{2,}/g, " ").trim();
    if (!s) return "Unknown merchant";
    if (s === s.toUpperCase()) {
      s = s.toLowerCase().replace(/\b[a-z]/g, function (ch) { return ch.toUpperCase(); });
    }
    s = s.replace(/\.(Com|Net|Org|Io|Co|App|Dev|Ai|Uk|Au|Id|Sg|Us)\b/g, function (m) {
      return m.toLowerCase();
    });
    s = s.charAt(0).toUpperCase() + s.slice(1);
    if (s.length > 48) s = s.slice(0, 47).trim() + "\u2026";
    return s;
  }

  function classifyInterval(days) {
    if (days >= 5 && days <= 9) return "weekly";
    if (days >= 12 && days <= 16) return "biweekly";
    if (days >= 25 && days <= 35) return "monthly";
    if (days >= 80 && days <= 100) return "quarterly";
    if (days >= 165 && days <= 200) return "semiannual";
    if (days >= 330 && days <= 400) return "yearly";
    return null;
  }

  function cycleTolerance(cycle) {
    switch (cycle) {
      case "weekly": return 2;
      case "biweekly": return 3;
      case "monthly": return 5;
      case "quarterly": return 12;
      case "semiannual": return 25;
      case "yearly": return 35;
      default: return 5;
    }
  }

  function cycleBaseDays(cycle) {
    switch (cycle) {
      case "weekly": return 7;
      case "biweekly": return 14;
      case "monthly": return 30;
      case "quarterly": return 91;
      case "semiannual": return 182;
      case "yearly": return 365;
      default: return 30;
    }
  }

  function detectRecurring(transactions, options) {
    var opts = options || {};
    var today = opts.today || todayISO();
    var minOccurrences = opts.minOccurrences || 2;
    var expenseSign = opts.expenseSign || "auto";
    var txns = (transactions || []).filter(function (t) {
      return t && t.date && t.description && typeof t.amountMinor === "number" && isFinite(t.amountMinor);
    });

    if (expenseSign === "auto") {
      var negatives = 0;
      var positives = 0;
      txns.forEach(function (t) { if (t.amountMinor < 0) negatives++; else if (t.amountMinor > 0) positives++; });
      expenseSign = negatives >= positives ? "negative" : "positive";
    }

    var expenses = txns.filter(function (t) {
      return expenseSign === "negative" ? t.amountMinor < 0 : t.amountMinor > 0;
    });

    var groups = {};
    expenses.forEach(function (t) {
      var key = normalizeMerchant(t.description);
      if (!key) return;
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });

    var proposals = [];
    Object.keys(groups).forEach(function (key) {
      var list = groups[key].slice().sort(function (a, b) {
        return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
      });
      if (list.length < minOccurrences) return;

      var intervals = [];
      for (var i = 1; i < list.length; i++) {
        var gap = daysBetween(list[i - 1].date, list[i].date);
        if (gap > 0) intervals.push(gap);
      }
      if (!intervals.length) return;
      var med = median(intervals);
      if (med < 5) return;
      var cycle = classifyInterval(med);
      if (!cycle) return;

      var tol = cycleTolerance(cycle);
      var base = cycleBaseDays(cycle);
      var good = intervals.filter(function (gap) { return Math.abs(gap - base) <= tol; }).length;
      var regularity = good / intervals.length;
      if (regularity < 0.6) return;

      var amounts = list.map(function (t) { return Math.abs(t.amountMinor); });
      var price = Math.round(amounts[amounts.length - 1]);
      if (price <= 0) return;
      var earlier = amounts.slice(0, -1);
      var baseline = earlier.length ? Math.round(median(earlier)) : price;
      var minAmount = Math.min.apply(null, amounts);
      var maxAmount = Math.max.apply(null, amounts);
      var spread = minAmount > 0 ? maxAmount / minAmount : 1;

      var last = list[list.length - 1];
      var next = addCycle(last.date, cycle);
      var guard = 0;
      while (next < today && guard < 36) {
        next = addCycle(next, cycle);
        guard++;
      }

      var confidence = 0.4 + Math.min(list.length, 4) * 0.12 + regularity * 0.18;
      confidence -= Math.min(0.25, (spread - 1) * 0.5);
      confidence = Math.max(0.05, Math.min(0.99, confidence));

      var counts = {};
      var labels = {};
      list.forEach(function (t) {
        var name = displayName(t.description);
        counts[name] = (counts[name] || 0) + 1;
        labels[name] = t.description;
      });
      var name = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];

      proposals.push({
        merchantKey: key,
        name: name,
        priceMinor: price,
        cycle: cycle,
        nextDate: next,
        lastDate: last.date,
        firstDate: list[0].date,
        occurrences: list.length,
        confidence: Math.round(confidence * 100) / 100,
        previousPriceMinor: baseline,
        priceChanged: price > baseline * 1.03,
        currency: opts.currency || "USD",
        category: "Other",
        sampleDescription: labels[name] || name
      });
    });

    proposals.sort(function (a, b) {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return a.name.localeCompare(b.name);
    });
    return proposals;
  }

  function icsEscape(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r?\n/g, "\\n");
  }

  function icsFold(line) {
    if (line.length <= 74) return line;
    var out = [];
    var rest = line;
    out.push(rest.slice(0, 74));
    rest = rest.slice(74);
    while (rest.length > 0) {
      out.push(" " + rest.slice(0, 73));
      rest = rest.slice(73);
    }
    return out.join("\r\n");
  }

  function icsDate(iso) {
    return String(iso || "").replace(/-/g, "");
  }

  function icsRule(cycle) {
    switch (cycle) {
      case "weekly": return "FREQ=WEEKLY";
      case "biweekly": return "FREQ=WEEKLY;INTERVAL=2";
      case "monthly": return "FREQ=MONTHLY";
      case "quarterly": return "FREQ=MONTHLY;INTERVAL=3";
      case "semiannual": return "FREQ=MONTHLY;INTERVAL=6";
      case "yearly": return "FREQ=YEARLY";
      default: return "FREQ=MONTHLY";
    }
  }

  function toICS(subs, options) {
    var opts = options || {};
    var alarmDays = opts.alarmDays === undefined ? 3 : opts.alarmDays;
    var stamp = opts.stamp || new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    var lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Sunk//Subscription Ledger//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Sunk renewals"
    ];

    activeSubs(subs).forEach(function (sub) {
      if (!sub.nextDate) return;
      var price = formatMoney(sub.priceMinor, sub.currency || opts.currency || "USD");
      var summary = sub.name + " renews (" + price + ")";
      lines.push("BEGIN:VEVENT");
      lines.push("UID:sunk-" + String(sub.id || sub.name).replace(/[^A-Za-z0-9-]/g, "-") + "@sunk.local");
      lines.push("DTSTAMP:" + stamp);
      lines.push("DTSTART;VALUE=DATE:" + icsDate(sub.nextDate));
      lines.push("DTEND;VALUE=DATE:" + icsDate(addDays(sub.nextDate, 1)));
      lines.push("SUMMARY:" + icsEscape(summary));
      lines.push("RRULE:" + icsRule(sub.cycle));
      if (alarmDays > 0) {
        lines.push("BEGIN:VALARM");
        lines.push("TRIGGER:-P" + alarmDays + "D");
        lines.push("ACTION:DISPLAY");
        lines.push("DESCRIPTION:" + icsEscape(sub.name + " renews in " + alarmDays + " days"));
        lines.push("END:VALARM");
      }
      lines.push("END:VEVENT");

      if (sub.trialEndsAt) {
        lines.push("BEGIN:VEVENT");
        lines.push("UID:sunk-trial-" + String(sub.id || sub.name).replace(/[^A-Za-z0-9-]/g, "-") + "@sunk.local");
        lines.push("DTSTAMP:" + stamp);
        lines.push("DTSTART;VALUE=DATE:" + icsDate(sub.trialEndsAt));
        lines.push("DTEND;VALUE=DATE:" + icsDate(addDays(sub.trialEndsAt, 1)));
        lines.push("SUMMARY:" + icsEscape("Trial ends: " + sub.name));
        lines.push("BEGIN:VALARM");
        lines.push("TRIGGER:-P1D");
        lines.push("ACTION:DISPLAY");
        lines.push("DESCRIPTION:" + icsEscape("The " + sub.name + " trial ends tomorrow"));
        lines.push("END:VALARM");
        lines.push("END:VEVENT");
      }
    });

    lines.push("END:VCALENDAR");
    return lines.map(icsFold).join("\r\n") + "\r\n";
  }

  function sampleSubs(today) {
    var base = today || todayISO();
    return [
      {
        id: "sample-streaming",
        name: "Streaming TV",
        priceMinor: 1799,
        currency: "USD",
        cycle: "monthly",
        nextDate: addDays(base, 3),
        status: "active",
        category: "Entertainment",
        cancelUrl: "",
        notes: "Sample entry. Replace it with your own.",
        trialEndsAt: "",
        createdAt: addDays(base, -220),
        priceHistory: [
          { date: addDays(base, -220), priceMinor: 1599 },
          { date: addDays(base, -95), priceMinor: 1799 }
        ],
        lastUsed: ""
      },
      {
        id: "sample-music",
        name: "Music",
        priceMinor: 1099,
        currency: "USD",
        cycle: "monthly",
        nextDate: addDays(base, 9),
        status: "active",
        category: "Entertainment",
        cancelUrl: "",
        notes: "Sample entry.",
        trialEndsAt: "",
        createdAt: addDays(base, -400),
        priceHistory: [{ date: addDays(base, -400), priceMinor: 1099 }],
        lastUsed: ""
      },
      {
        id: "sample-ai",
        name: "AI assistant",
        priceMinor: 2000,
        currency: "USD",
        cycle: "monthly",
        nextDate: addDays(base, 14),
        status: "active",
        category: "Work",
        cancelUrl: "",
        notes: "Sample entry.",
        trialEndsAt: "",
        createdAt: addDays(base, -75),
        priceHistory: [{ date: addDays(base, -75), priceMinor: 2000 }],
        lastUsed: ""
      },
      {
        id: "sample-cloud",
        name: "Cloud storage",
        priceMinor: 299,
        currency: "USD",
        cycle: "monthly",
        nextDate: addDays(base, 21),
        status: "active",
        category: "Utilities",
        cancelUrl: "",
        notes: "Sample entry.",
        trialEndsAt: "",
        createdAt: addDays(base, -800),
        priceHistory: [{ date: addDays(base, -800), priceMinor: 299 }],
        lastUsed: ""
      },
      {
        id: "sample-fitness",
        name: "Fitness studio",
        priceMinor: 3900,
        currency: "USD",
        cycle: "monthly",
        nextDate: addDays(base, 26),
        status: "active",
        category: "Health",
        cancelUrl: "",
        notes: "Sample entry.",
        trialEndsAt: addDays(base, 12),
        createdAt: addDays(base, -30),
        priceHistory: [{ date: addDays(base, -30), priceMinor: 3900 }],
        lastUsed: ""
      }
    ];
  }

  function blankSub() {
    return {
      id: "",
      name: "",
      priceMinor: 0,
      currency: "USD",
      cycle: "monthly",
      nextDate: "",
      status: "active",
      category: "Other",
      cancelUrl: "",
      notes: "",
      trialEndsAt: "",
      createdAt: "",
      priceHistory: [],
      lastUsed: ""
    };
  }

  function normalizeSub(raw) {
    var sub = blankSub();
    Object.keys(sub).forEach(function (key) {
      if (raw && raw[key] !== undefined && raw[key] !== null) sub[key] = raw[key];
    });
    if (CYCLES.indexOf(sub.cycle) === -1) sub.cycle = "monthly";
    if (["active", "paused", "cancelled"].indexOf(sub.status) === -1) sub.status = "active";
    sub.priceMinor = Math.max(0, Math.round(Number(sub.priceMinor) || 0));
    if (!sub.nextDate) sub.nextDate = "";
    if (!Array.isArray(sub.priceHistory)) sub.priceHistory = [];
    if (!sub.currency) sub.currency = "USD";
    return sub;
  }

  function statusLabel(status) {
    if (status === "paused") return "Paused";
    if (status === "cancelled") return "Cancelled";
    return "Active";
  }

  function dueLabel(dateISO, today) {
    var days = daysBetween(today, dateISO);
    if (days < 0) return "Overdue by " + Math.abs(days) + (Math.abs(days) === 1 ? " day" : " days");
    if (days === 0) return "Today";
    if (days === 1) return "Tomorrow";
    return "In " + days + " days";
  }

  function cancellationEmail(sub, currencyCode) {
    var price = formatMoney(sub.priceMinor, sub.currency || currencyCode || "USD");
    return [
      "Hello,",
      "",
      "I would like to cancel my subscription to " + sub.name + " (" + price + cycleShort(sub.cycle) + ").",
      "Please stop all future charges and confirm the cancellation in writing.",
      "If a refund is due for the current period, please include it.",
      "",
      "Thank you."
    ].join("\n");
  }

  return {
    FREE_LIMIT: FREE_LIMIT,
    DATA_VERSION: DATA_VERSION,
    CURRENCIES: CURRENCIES,
    CYCLES: CYCLES,
    currency: currency,
    formatMoney: formatMoney,
    parseAmount: parseAmount,
    parseAmountToMinor: parseAmountToMinor,
    todayISO: todayISO,
    makeISO: makeISO,
    parseISO: parseISO,
    addDays: addDays,
    addMonths: addMonths,
    addCycle: addCycle,
    daysBetween: daysBetween,
    cycleLabel: cycleLabel,
    cycleShort: cycleShort,
    monthlyMinor: monthlyMinor,
    annualMinor: annualMinor,
    activeSubs: activeSubs,
    totals: totals,
    upcoming: upcoming,
    priceChange: priceChange,
    trialsEnding: trialsEnding,
    occurrencesBetween: occurrencesBetween,
    median: median,
    parseDateLoose: parseDateLoose,
    parseCSV: parseCSV,
    normalizeMerchant: normalizeMerchant,
    displayName: displayName,
    detectRecurring: detectRecurring,
    toICS: toICS,
    sampleSubs: sampleSubs,
    blankSub: blankSub,
    normalizeSub: normalizeSub,
    statusLabel: statusLabel,
    dueLabel: dueLabel,
    cancellationEmail: cancellationEmail
  };
});
