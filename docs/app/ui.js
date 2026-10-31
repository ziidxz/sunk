(function (root) {
  "use strict";

  var doc = root.document;
  var C = root.SunkCore;
  var Store = root.SunkStore;
  if (!doc || !C || !Store) return;

  var PRO = root.SUNK_EDITION === "pro";
  var PRICE = "$12";
  var SITE_BASE = PRO ? "https://ziidxz.github.io/sunk/" : "../";
  var THEME_KEY = "sunk.theme";
  var VIEWS = ["ledger", "calendar", "import", "settings"];
  var MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  var saved = Store.load();
  var state = saved || Store.defaults();
  state.subs = (state.subs || []).map(function (sub) { return C.normalizeSub(sub); });

  if (!saved && /(?:^|[?&])demo=1(?:&|$)/.test(String(root.location.search || ""))) {
    state.subs = C.sampleSubs();
    state.currency = "USD";
  }

  var view = "ledger";
  var filter = "active";
  var editingId = null;
  var calendarCursor = null;
  var importModel = null;
  var storageOK = true;
  var toastTimer = 0;

  // ---------- small helpers ----------

  function $(id) {
    return doc.getElementById(id);
  }

  function docLink(name) {
    return SITE_BASE + name;
  }

  function append(node, children) {
    if (children === null || children === undefined || children === false) return;
    if (Array.isArray(children)) {
      children.forEach(function (child) { append(node, child); });
      return;
    }
    if (typeof children === "string" || typeof children === "number") {
      node.appendChild(doc.createTextNode(String(children)));
    } else {
      node.appendChild(children);
    }
  }

  function make(tag, props, children) {
    var node = doc.createElement(tag);
    var deferred = {};
    if (props) {
      Object.keys(props).forEach(function (key) {
        var value = props[key];
        if (value === null || value === undefined || value === false) return;
        if (key === "text") {
          node.textContent = String(value);
        } else if (key === "class") {
          node.className = String(value);
        } else if (key === "on") {
          Object.keys(value).forEach(function (event) {
            node.addEventListener(event, value[event]);
          });
        } else if (key === "dataset") {
          Object.keys(value).forEach(function (name) { node.dataset[name] = String(value[name]); });
        } else if (key === "value" || key === "checked" || key === "disabled") {
          deferred[key] = value;
        } else {
          node.setAttribute(key, value === true ? "" : String(value));
        }
      });
    }
    append(node, children);
    Object.keys(deferred).forEach(function (key) {
      node[key] = deferred[key];
    });
    return node;
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function uid() {
    return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function factor() {
    return Math.pow(10, C.currency(state.currency).decimals);
  }

  function fmt(minor) {
    return C.formatMoney(minor, state.currency);
  }

  function major(minor) {
    return ((Number(minor) || 0) / factor()).toFixed(C.currency(state.currency).decimals);
  }

  function dateLabel(iso) {
    var date = C.parseISO(iso);
    if (!date) return String(iso || "");
    try {
      return new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC"
      }).format(date);
    } catch (err) {
      return iso;
    }
  }

  function isSample(sub) {
    return String(sub.id || "").indexOf("sample-") === 0;
  }

  function activeSubs() {
    return state.subs.filter(function (sub) { return sub.status === "active"; });
  }

  function nonCancelled() {
    return state.subs.filter(function (sub) { return sub.status !== "cancelled"; });
  }

  function atLimit() {
    return !PRO && nonCancelled().length >= C.FREE_LIMIT;
  }

  function findSub(id) {
    for (var i = 0; i < state.subs.length; i++) {
      if (state.subs[i].id === id) return state.subs[i];
    }
    return null;
  }

  function safeUrl(value) {
    var text = String(value || "").trim();
    if (!/^https?:\/\/\S+$/i.test(text)) return "";
    return text;
  }

  function persist() {
    try {
      Store.save(state);
      storageOK = true;
    } catch (err) {
      storageOK = false;
    }
    var warning = $("storage-warning");
    if (warning) warning.hidden = storageOK;
  }

  function toast(message) {
    var node = $("toast");
    if (!node) return;
    node.textContent = message;
    node.hidden = false;
    if (toastTimer) root.clearTimeout(toastTimer);
    toastTimer = root.setTimeout(function () { node.hidden = true; }, 3600);
  }

  function navigate(name) {
    if (String(root.location.hash || "") === "#" + name) {
      route();
    } else {
      root.location.hash = name;
    }
  }

  function commit(options) {
    persist();
    refresh();
    if (view === "settings") renderSettings();
    if (options && options.after) options.after();
  }

  // ---------- theme ----------

  function storedTheme() {
    try {
      var value = root.localStorage.getItem(THEME_KEY);
      if (value === "light" || value === "dark") return value;
    } catch (err) {}
    return "";
  }

  function resolveTheme() {
    var chosen = storedTheme();
    if (chosen) return chosen;
    var query = root.matchMedia ? root.matchMedia("(prefers-color-scheme: dark)") : null;
    return query && query.matches ? "dark" : "light";
  }

  function applyTheme() {
    var theme = resolveTheme();
    doc.documentElement.setAttribute("data-theme", theme);
    var toggle = $("theme-toggle");
    if (toggle) {
      var next = theme === "dark" ? "light" : "dark";
      toggle.textContent = next === "dark" ? "Dark" : "Light";
      toggle.setAttribute("aria-label", "Switch to " + next + " theme");
    }
    var meta = doc.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#17140f" : "#f4efe4");
  }

  function setTheme(mode) {
    try {
      if (mode === "system") root.localStorage.removeItem(THEME_KEY);
      else root.localStorage.setItem(THEME_KEY, mode);
    } catch (err) {}
    applyTheme();
    if (view === "settings") renderSettings();
  }

  // ---------- summary ----------

  function renderSummary() {
    var today = C.todayISO();
    var totals = C.totals(state.subs);
    $("monthly-total").textContent = fmt(totals.monthly);
    $("yearly-total").textContent = fmt(totals.yearly) + " a year";
    $("active-count").textContent = String(totals.count);
    $("upcoming-count").textContent = String(C.upcoming(state.subs, today, 30).length);
    $("hike-count").textContent = String(activeSubs().filter(function (sub) {
      return C.priceChange(sub) !== null;
    }).length);

    var stopped = state.subs.filter(function (sub) {
      return sub.status === "cancelled";
    }).reduce(function (sum, sub) {
      return sum + C.annualMinor(sub);
    }, 0);
    var stoppedNode = $("stopped-total");
    if (stoppedNode) {
      stoppedNode.hidden = stopped <= 0;
      if (stopped > 0) stoppedNode.textContent = "Already stopped: " + fmt(stopped) + " a year";
    }
  }

  // ---------- alerts ----------

  function renderAlerts() {
    var host = $("alerts");
    var today = C.todayISO();
    var items = [];
    clear(host);

    var overdue = C.upcoming(state.subs, today, 0).filter(function (item) {
      return item.overdue;
    });
    if (overdue.length) {
      items.push({
        kind: "Overdue",
        text: overdue.length === 1
          ? overdue[0].sub.name + " was due " + dateLabel(overdue[0].date) + "."
          : overdue.length + " renewals are past their date, starting with " + overdue[0].sub.name + ".",
        sub: overdue[0].sub,
        label: "Open"
      });
    }

    C.trialsEnding(state.subs, today, 7).forEach(function (sub) {
      var label = C.dueLabel(sub.trialEndsAt, today);
      items.push({
        kind: "Trial",
        text: sub.name + " trial ends " + (label === "Today" || label === "Tomorrow" ? label.toLowerCase() : label) + ".",
        sub: sub,
        label: "Open"
      });
    });

    activeSubs().forEach(function (sub) {
      var change = C.priceChange(sub);
      if (!change) return;
      items.push({
        kind: "Price rise",
        text: sub.name + " went from " + fmt(change.from) + " to " + fmt(change.to) +
          " " + C.cycleShort(sub.cycle) + ".",
        sub: sub,
        label: "Open"
      });
    });

    if (atLimit()) {
      items.push({
        kind: "Free edition",
        text: "All " + C.FREE_LIMIT + " free slots are in use. The offline edition is unlimited.",
        href: docLink("order.html"),
        label: "See it"
      });
    }

    items.slice(0, 4).forEach(function (item) {
      var row = make("li", { class: "alert" }, [
        make("span", { class: "alert-kind", text: item.kind }),
        make("p", { text: item.text })
      ]);
      if (item.sub) {
        row.appendChild(make("button", {
          type: "button",
          class: "button quiet",
          text: item.label,
          on: { click: function () { openSubDialog(item.sub.id); } }
        }));
      } else if (item.href) {
        row.appendChild(make("a", { class: "button quiet", href: item.href, text: item.label }));
      }
      host.appendChild(row);
    });

    if (items.length > 4) {
      host.appendChild(make("li", { class: "alert" }, [
        make("p", { class: "muted", text: "+" + (items.length - 4) + " more items below." })
      ]));
    }
  }

  // ---------- ledger ----------

  function sortedSubs() {
    var rank = { active: 0, paused: 1, cancelled: 2 };
    return state.subs.slice().sort(function (a, b) {
      var byStatus = (rank[a.status] || 0) - (rank[b.status] || 0);
      if (byStatus !== 0) return byStatus;
      if (a.status === "active") {
        if (!a.nextDate && b.nextDate) return 1;
        if (a.nextDate && !b.nextDate) return -1;
        if (a.nextDate && b.nextDate && a.nextDate !== b.nextDate) return a.nextDate < b.nextDate ? -1 : 1;
      }
      return String(a.name).localeCompare(String(b.name));
    });
  }

  function renderLedger() {
    var body = $("ledger-body");
    var today = C.todayISO();
    clear(body);

    var list = sortedSubs().filter(function (sub) {
      if (filter === "all") return true;
      return sub.status === filter;
    });

    list.forEach(function (sub) {
      body.appendChild(ledgerRow(sub, today));
    });

    var empty = state.subs.length === 0;
    $("empty-state").hidden = !empty;
    $("ledger-wrap").hidden = empty;

    var line = $("ledger-empty-filter");
    if (!empty && list.length === 0) {
      line.hidden = false;
      line.textContent = filter === "active"
        ? "Nothing active. Switch to Everything to see paused and cancelled entries."
        : "No entries match this filter.";
    } else {
      line.hidden = true;
    }

    $("sample-notice").hidden = !state.subs.some(isSample);
  }

  function ledgerRow(sub, today) {
    var nameCell = make("td", { class: "cell-name" });
    nameCell.appendChild(make("button", {
      type: "button",
      class: "sub-name",
      text: sub.name,
      on: { click: function () { openSubDialog(sub.id); } }
    }));
    var meta = [sub.category || "Other"];
    if (sub.status !== "active") meta.push(C.statusLabel(sub.status));
    if (isSample(sub)) meta.push("Sample");
    nameCell.appendChild(make("span", { class: "sub-meta", text: meta.join(" \u00b7 ") }));

    var cycleCell = make("td", { "data-label": "Cycle" }, [
      make("span", { text: C.cycleLabel(sub.cycle) })
    ]);

    var priceCell = make("td", { class: "cell-price", "data-label": "Price" });
    priceCell.appendChild(make("span", { class: "price-main", text: fmt(sub.priceMinor) + " " + C.cycleShort(sub.cycle) }));
    if (sub.cycle !== "monthly") {
      priceCell.appendChild(make("span", {
        class: "price-sub",
        text: "\u2248 " + fmt(Math.round(C.monthlyMinor(sub))) + " a month"
      }));
    }
    var change = C.priceChange(sub);
    if (change) {
      priceCell.appendChild(make("span", {
        class: "hike",
        text: "Up " + fmt(change.delta) + " since " + dateLabel(change.since)
      }));
    }

    var dueCell = make("td", { "data-label": "Next charge" });
    if (sub.status === "active") {
      if (sub.nextDate) {
        var overdue = sub.nextDate < today;
        dueCell.appendChild(make("span", {
          class: "due" + (overdue ? " overdue" : ""),
          text: C.dueLabel(sub.nextDate, today)
        }));
        dueCell.appendChild(make("span", { class: "due-date", text: dateLabel(sub.nextDate) }));
      } else {
        dueCell.appendChild(make("span", { class: "due muted", text: "No date set" }));
      }
    } else {
      dueCell.appendChild(make("span", {
        class: "due muted",
        text: sub.status === "paused" ? "Paused" : "Stopped"
      }));
    }

    var actions = make("td", { class: "cell-actions", "data-label": "Actions" });
    var group = make("div", { class: "row-actions" }, [
      make("button", {
        type: "button",
        class: "button quiet",
        text: "Edit",
        "aria-label": "Edit " + sub.name,
        on: { click: function () { openSubDialog(sub.id); } }
      }),
      make("button", {
        type: "button",
        class: "button quiet",
        text: sub.status === "active" ? "Cancel" : "Resume",
        "aria-label": (sub.status === "active" ? "Mark " : "Resume ") + sub.name +
          (sub.status === "active" ? " as cancelled" : ""),
        on: { click: function () { toggleSub(sub); } }
      })
    ]);
    actions.appendChild(group);

    return make("tr", {}, [nameCell, cycleCell, priceCell, dueCell, actions]);
  }

  function toggleSub(sub) {
    if (sub.status !== "active") {
      if (atLimit()) {
        showUpgrade("Resuming " + sub.name + " would put the free edition over its five-subscription limit.");
        return;
      }
      sub.status = "active";
      commit();
      toast(sub.name + " is back on the ledger.");
      return;
    }

    var yearly = C.annualMinor(sub);
    confirmAction({
      title: "Mark " + sub.name + " as cancelled?",
      text: "It stops counting toward the monthly total. " +
        (yearly > 0 ? "That returns " + fmt(yearly) + " a year. " : "") +
        "Sunk only records the change. Cancel with the service itself as well.",
      confirmLabel: "Mark cancelled"
    }).then(function (ok) {
      if (!ok) return;
      sub.status = "cancelled";
      commit();
      toast(yearly > 0 ? "Cancelled. That returns " + fmt(yearly) + " a year." : "Marked as cancelled.");
    });
  }

  // ---------- dialog ----------

  function confirmAction(options) {
    return new Promise(function (resolve) {
      var dialog = $("confirm-dialog");
      $("confirm-title").textContent = options.title || "Are you sure?";
      $("confirm-text").textContent = options.text || "";
      $("confirm-yes").textContent = options.confirmLabel || "Continue";
      $("confirm-no").textContent = options.cancelLabel || "Keep it";
      $("confirm-yes").className = "button " + (options.danger === false ? "primary" : "danger");
      dialog.returnValue = "";

      function onClose() {
        dialog.removeEventListener("close", onClose);
        resolve(dialog.returnValue === "yes");
      }
      dialog.addEventListener("close", onClose);
      if (!dialog.open) dialog.showModal();
    });
  }

  function setFormError(message) {
    var node = $("sub-error");
    clear(node);
    node.hidden = false;
    node.appendChild(doc.createTextNode(message));
    if (!PRO && atLimit()) {
      node.appendChild(doc.createTextNode(" "));
      node.appendChild(make("a", { href: docLink("order.html"), text: "See the offline edition." }));
    }
  }

  function clearFormError() {
    var node = $("sub-error");
    node.hidden = true;
    clear(node);
  }

  function openSubDialog(id) {
    var sub = id ? findSub(id) : null;
    editingId = sub ? sub.id : null;

    $("sub-dialog-title").textContent = sub ? "Edit " + sub.name : "Add a subscription";
    $("sub-name").value = sub ? sub.name : "";
    $("sub-price").value = sub ? major(sub.priceMinor) : "";
    $("sub-cycle").value = sub ? sub.cycle : "monthly";
    $("sub-next").value = sub ? sub.nextDate || "" : "";
    $("sub-trial").value = sub ? sub.trialEndsAt || "" : "";
    $("sub-status").value = sub ? sub.status : "active";
    $("sub-cancel-url").value = sub ? sub.cancelUrl || "" : "";
    $("sub-notes").value = sub ? sub.notes || "" : "";
    $("form-currency").textContent = state.currency;

    var category = $("sub-category");
    var wanted = sub && sub.category ? sub.category : "Other";
    var exists = Array.prototype.some.call(category.options, function (option) {
      return option.value === wanted;
    });
    if (!exists) {
      var option = doc.createElement("option");
      option.value = wanted;
      option.textContent = wanted;
      category.appendChild(option);
    }
    category.value = wanted;

    $("sub-delete").hidden = !sub;
    clearFormError();

    var returnNode = $("sub-return");
    if (sub && sub.status === "active") {
      returnNode.hidden = false;
      returnNode.textContent = "If you cancel this, " + fmt(C.annualMinor(sub)) + " a year stops leaving.";
    } else if (sub && sub.status === "paused") {
      returnNode.hidden = false;
      returnNode.textContent = "This is paused and does not count toward the total.";
    } else if (sub && sub.status === "cancelled") {
      returnNode.hidden = false;
      returnNode.textContent = "This is cancelled, so it no longer counts toward the total.";
    } else {
      returnNode.hidden = true;
      returnNode.textContent = "";
    }

    var linkNode = $("sub-cancel-link");
    clear(linkNode);
    var url = sub ? safeUrl(sub.cancelUrl) : "";
    if (url) {
      linkNode.hidden = false;
      linkNode.appendChild(doc.createTextNode("Cancellation page: "));
      linkNode.appendChild(make("a", {
        href: url,
        target: "_blank",
        rel: "noopener noreferrer",
        text: url
      }));
    } else {
      linkNode.hidden = true;
    }

    var dialog = $("sub-dialog");
    if (!dialog.open) dialog.showModal();
    root.setTimeout(function () { $("sub-name").focus(); }, 0);
  }

  function closeSubDialog() {
    var dialog = $("sub-dialog");
    if (dialog.open) dialog.close();
    editingId = null;
  }

  function onSubSubmit(event) {
    event.preventDefault();
    clearFormError();

    var name = String($("sub-name").value || "").trim();
    var price = C.parseAmountToMinor($("sub-price").value, state.currency);
    var nextDate = String($("sub-next").value || "");
    var trialEndsAt = String($("sub-trial").value || "");
    var cancelUrl = String($("sub-cancel-url").value || "").trim();

    if (!name) return setFormError("Give the subscription a name.");
    if (price === null || price < 0) return setFormError("Enter a price, for example 17.99.");
    if (!nextDate || !C.parseISO(nextDate)) return setFormError("Choose the next charge date.");
    if (trialEndsAt && !C.parseISO(trialEndsAt)) return setFormError("Check the trial end date.");
    if (cancelUrl && !safeUrl(cancelUrl)) {
      return setFormError("The cancellation link must start with http:// or https://.");
    }

    var existing = editingId ? findSub(editingId) : null;
    if (!existing && atLimit()) {
      return setFormError("The free edition holds " + C.FREE_LIMIT + " subscriptions.");
    }

    var today = C.todayISO();
    var sub = existing || C.blankSub();

    if (!existing) {
      sub.id = uid();
      sub.createdAt = today;
      sub.priceHistory = [{ date: today, priceMinor: price }];
    } else if (price !== sub.priceMinor) {
      var history = Array.isArray(sub.priceHistory) ? sub.priceHistory.slice() : [];
      if (!history.length) {
        history.push({ date: sub.createdAt || today, priceMinor: sub.priceMinor });
      }
      history.push({ date: today, priceMinor: price });
      sub.priceHistory = history;
    }

    sub.name = name;
    sub.priceMinor = price;
    sub.currency = state.currency;
    sub.cycle = $("sub-cycle").value;
    sub.nextDate = nextDate;
    sub.trialEndsAt = trialEndsAt;
    sub.status = $("sub-status").value;
    sub.category = $("sub-category").value;
    sub.cancelUrl = cancelUrl;
    sub.notes = String($("sub-notes").value || "").slice(0, 500).trim();

    if (!existing) state.subs.push(sub);

    persist();
    closeSubDialog();
    refresh();
    toast(existing ? "Saved." : "Added to the ledger.");
  }

  function onSubDelete() {
    var sub = editingId ? findSub(editingId) : null;
    if (!sub) return;
    confirmAction({
      title: "Delete " + sub.name + "?",
      text: "This removes the entry and its price history from the ledger. It cannot be undone.",
      confirmLabel: "Delete"
    }).then(function (ok) {
      if (!ok) return;
      state.subs = state.subs.filter(function (item) { return item.id !== sub.id; });
      persist();
      closeSubDialog();
      refresh();
      toast("Deleted.");
    });
  }

  // ---------- upgrade ----------

  function buildUpgradeDialog() {
    var dialog = make("dialog", { id: "upgrade-dialog", "aria-labelledby": "upgrade-title" });
    var close = function () { if (dialog.open) dialog.close(); };
    dialog.appendChild(make("div", { class: "dialog-head" }, [
      make("h2", { class: "serif", id: "upgrade-title", text: "The offline edition" }),
      make("button", { type: "button", class: "button quiet", text: "Close", on: { click: close } })
    ]));
    dialog.appendChild(make("p", { id: "upgrade-lead" }));
    dialog.appendChild(make("p", {
      text: "One HTML file you keep. Open it from your downloads, a USB stick, or an email attachment. It works without a network connection and saves in the browser you open it with."
    }));
    dialog.appendChild(make("ul", {}, [
      make("li", { text: "Unlimited subscriptions" }),
      make("li", { text: "Import a bank CSV and let Sunk find repeating charges" }),
      make("li", { text: "Renewal and trial reminders as an .ics file" }),
      make("li", { text: "Everything in the free edition, including JSON backups" })
    ]));
    dialog.appendChild(make("p", {
      class: "hint",
      text: "One payment of " + PRICE + ". No account, no recurring charge, no bank login."
    }));
    dialog.appendChild(make("div", { class: "dialog-actions" }, [
      make("span", { class: "spacer" }),
      make("button", { type: "button", class: "button ghost", text: "Not now", on: { click: close } }),
      make("a", { class: "button primary", href: docLink("order.html"), text: "See the offline edition" })
    ]));
    doc.body.appendChild(dialog);
    return dialog;
  }

  function showUpgrade(context) {
    var dialog = $("upgrade-dialog") || buildUpgradeDialog();
    var lead = $("upgrade-lead");
    if (lead) {
      lead.textContent = context ||
        "The free web edition holds five subscriptions. The offline edition is one file you own.";
    }
    if (!dialog.open) dialog.showModal();
  }

  // ---------- calendar ----------

  function currentMonth() {
    if (!calendarCursor) {
      var now = new Date();
      calendarCursor = { year: now.getFullYear(), month: now.getMonth() };
    }
    return calendarCursor;
  }

  function renderCalendar() {
    var cursor = currentMonth();
    var monthKey = cursor.year + "-" + pad2(cursor.month + 1);
    var firstISO = C.makeISO(cursor.year, cursor.month + 1, 1);
    var first = C.parseISO(firstISO);
    var offset = first ? first.getUTCDay() : 0;
    var daysInMonth = new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate();
    var cells = Math.ceil((offset + daysInMonth) / 7) * 7;
    var gridStart = C.addDays(firstISO, -offset);
    var gridEnd = C.addDays(gridStart, cells - 1);
    var occurrences = C.occurrencesBetween(state.subs, gridStart, gridEnd);
    var byDate = {};
    occurrences.forEach(function (item) {
      if (!byDate[item.date]) byDate[item.date] = [];
      byDate[item.date].push(item);
    });

    $("calendar-month").textContent = MONTHS[cursor.month] + " " + cursor.year;

    var grid = $("calendar-grid");
    clear(grid);
    WEEKDAYS.forEach(function (day) {
      grid.appendChild(make("div", { class: "calendar-dow", text: day }));
    });

    var today = C.todayISO();
    for (var i = 0; i < cells; i++) {
      var iso = C.addDays(gridStart, i);
      var inMonth = iso.slice(0, 7) === monthKey;
      var cell = make("div", {
        class: "calendar-cell" + (inMonth ? "" : " outside") + (iso === today ? " today" : ""),
        "aria-label": dateLabel(iso)
      });
      cell.appendChild(make("span", { class: "cal-daynum", text: String(Number(iso.slice(8))) }));
      var events = byDate[iso] || [];
      events.slice(0, 3).forEach(function (item) {
        cell.appendChild(calChip(item, iso));
      });
      if (events.length > 3) {
        cell.appendChild(make("span", { class: "cal-more", text: "+" + (events.length - 3) + " more" }));
      }
      grid.appendChild(cell);
    }

    var monthEvents = occurrences.filter(function (item) {
      return item.date.slice(0, 7) === monthKey;
    });
    var renewals = monthEvents.filter(function (item) { return !item.trial; });
    var trialCount = monthEvents.length - renewals.length;
    var monthTotal = renewals.reduce(function (sum, item) {
      return sum + (Number(item.sub.priceMinor) || 0);
    }, 0);
    var pieces = [];
    if (renewals.length) {
      pieces.push(renewals.length + (renewals.length === 1 ? " renewal" : " renewals"));
      pieces.push(fmt(monthTotal));
    }
    if (trialCount) pieces.push(trialCount + (trialCount === 1 ? " trial ends" : " trials end"));
    $("calendar-total").textContent = pieces.length
      ? pieces.join(" \u00b7 ")
      : "No renewals this month.";

    var list = $("calendar-list");
    clear(list);
    if (!monthEvents.length) {
      list.appendChild(make("p", { class: "empty-line", text: "Nothing renews this month." }));
    } else {
      var lastDate = "";
      monthEvents.forEach(function (item) {
        if (item.date !== lastDate) {
          lastDate = item.date;
          list.appendChild(make("div", { class: "cal-day" }, [
            make("h3", { text: dateLabel(item.date) })
          ]));
        }
        var day = list.lastChild;
        day.appendChild(calEvent(item));
      });
    }

    var hint = $("calendar-hint");
    if (!activeSubs().length) {
      hint.textContent = "Add a subscription and its next charge will appear here.";
    } else if (!PRO) {
      hint.textContent = "The offline edition exports these dates as a calendar file with reminders.";
    } else {
      hint.textContent = "Reminders are exported with a three-day warning before each charge.";
    }
  }

  function calChip(item, iso) {
    var sub = item.sub;
    var label = item.trial ? "Trial: " + sub.name : sub.name;
    var button = make("button", {
      type: "button",
      class: "cal-chip" + (item.trial ? " trial" : ""),
      title: (item.trial ? "Trial ends: " : "Renews: ") + sub.name + " on " + dateLabel(iso),
      on: { click: function () { openSubDialog(sub.id); } }
    }, [
      make("span", { class: "cal-name", text: label }),
      make("span", { class: "cal-price", text: item.trial ? "trial" : fmt(sub.priceMinor) })
    ]);
    return button;
  }

  function calEvent(item) {
    var sub = item.sub;
    return make("button", {
      type: "button",
      class: "cal-event" + (item.trial ? " trial" : ""),
      on: { click: function () { openSubDialog(sub.id); } }
    }, [
      make("span", { class: "cal-name", text: item.trial ? "Trial ends: " + sub.name : sub.name }),
      make("span", { class: "cal-price", text: item.trial ? "trial" : fmt(sub.priceMinor) })
    ]);
  }

  function shiftMonth(delta) {
    var cursor = currentMonth();
    var next = new Date(Date.UTC(cursor.year, cursor.month + delta, 1));
    calendarCursor = { year: next.getUTCFullYear(), month: next.getUTCMonth() };
    renderCalendar();
  }

  // ---------- file helpers ----------

  function readFileText(file) {
    if (file && typeof file.text === "function") return file.text();
    return new Promise(function (resolve, reject) {
      var reader = new root.FileReader();
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.onerror = function () { reject(reader.error || new Error("Could not read the file.")); };
      reader.readAsText(file);
    });
  }

  function download(filename, content, type) {
    var blob = new root.Blob([content], { type: type });
    var url = root.URL.createObjectURL(blob);
    var link = doc.createElement("a");
    link.href = url;
    link.download = filename;
    doc.body.appendChild(link);
    link.click();
    link.remove();
    root.setTimeout(function () { root.URL.revokeObjectURL(url); }, 1000);
  }

  function exportICS() {
    if (!PRO) {
      showUpgrade("Calendar reminders are part of the offline edition.");
      return;
    }
    if (!activeSubs().length) {
      toast("Add a subscription first.");
      return;
    }
    download("sunk-renewals.ics", C.toICS(state.subs, { alarmDays: 3 }), "text/calendar;charset=utf-8");
    toast("Calendar file downloaded.");
  }

  function exportBackup() {
    var payload = {
      app: "Sunk",
      version: C.DATA_VERSION,
      exportedAt: new Date().toISOString(),
      currency: state.currency,
      subs: state.subs
    };
    download("sunk-backup-" + C.todayISO() + ".json", JSON.stringify(payload, null, 2), "application/json");
    toast("Backup downloaded.");
  }

  function restoreBackup(file) {
    if (!file) return;
    readFileText(file).then(function (text) {
      var parsed;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        toast("That file is not valid JSON.");
        return;
      }
      if (!parsed || !Array.isArray(parsed.subs)) {
        toast("That file is not a Sunk backup.");
        return;
      }
      var incoming = Store.normalize(parsed);
      confirmAction({
        title: "Replace this ledger?",
        text: "The backup has " + incoming.subs.length + " entries. This ledger has " +
          state.subs.length + ". Restoring replaces everything here.",
        confirmLabel: "Restore"
      }).then(function (ok) {
        if (!ok) return;
        state = incoming;
        persist();
        refresh();
        navigate("ledger");
        toast("Backup restored.");
      });
    }).catch(function () { toast("Could not read that file."); });
  }

  // ---------- import ----------

  var H_DATE = /date|datum|fecha|tanggal|posted|posting/;
  var H_DESC = /description|merchant|payee|memo|details|narrative|reference|name|beschreibung|keterangan/;
  var H_AMOUNT = /amount|betrag|montant|importe|jumlah|value|sum|total/;
  var H_DEBIT = /debit|withdraw|money out|paid out|soll/;
  var H_CREDIT = /credit|deposit|money in|paid in|haben/;

  function colKind(cell) {
    var text = String(cell || "").trim().toLowerCase();
    if (!text) return "";
    if (H_DEBIT.test(text)) return "debit";
    if (H_CREDIT.test(text)) return "credit";
    if (H_DATE.test(text)) return "date";
    if (H_AMOUNT.test(text)) return "amount";
    if (H_DESC.test(text)) return "desc";
    return "";
  }

  function findHeaderRow(rows) {
    var limit = Math.min(rows.length, 8);
    for (var i = 0; i < limit; i++) {
      var kinds = rows[i].map(colKind);
      var hasDate = kinds.indexOf("date") >= 0;
      var hasDesc = kinds.indexOf("desc") >= 0;
      var hasMoney = kinds.indexOf("amount") >= 0 || kinds.indexOf("debit") >= 0 || kinds.indexOf("credit") >= 0;
      if (hasDate && hasDesc && hasMoney) return i;
    }
    return -1;
  }

  function detectColumns(header, rows) {
    var map = { date: -1, desc: -1, amount: -1, debit: -1, credit: -1 };
    var colCount = 0;
    if (header) colCount = header.length;
    rows.slice(0, 10).forEach(function (row) {
      if (row.length > colCount) colCount = row.length;
    });

    if (header) {
      header.forEach(function (cell, index) {
        var kind = colKind(cell);
        if (kind && map[kind] === -1) map[kind] = index;
      });
    }
    if (map.debit >= 0 || map.credit >= 0) map.amount = -1;

    var dateScore = [];
    var amountScore = [];
    var textScore = [];
    for (var index = 0; index < colCount; index++) {
      dateScore[index] = 0;
      amountScore[index] = 0;
      textScore[index] = 0;
      rows.slice(0, 25).forEach(function (row) {
        var cell = row[index];
        if (cell === null || cell === undefined) return;
        var text = String(cell).trim();
        if (!text) return;
        if (C.parseDateLoose(text, "auto")) {
          dateScore[index]++;
          return;
        }
        if (C.parseAmountToMinor(text, state.currency) !== null && /\d/.test(text)) {
          amountScore[index]++;
          return;
        }
        if (/[A-Za-z]/.test(text)) textScore[index]++;
      });
    }

    function best(scores, exclude) {
      var winner = -1;
      var high = 0;
      scores.forEach(function (score, index) {
        if (exclude.indexOf(index) >= 0) return;
        if (score > high) {
          high = score;
          winner = index;
        }
      });
      return winner;
    }

    if (map.date < 0) map.date = best(dateScore, []);
    if (map.desc < 0) map.desc = best(textScore, [map.date, map.amount]);
    if (map.amount < 0 && map.debit < 0 && map.credit < 0) {
      map.amount = best(amountScore, [map.date, map.desc]);
    }
    if (map.date < 0) map.date = 0;
    if (map.desc < 0) map.desc = map.date === 1 ? 0 : 1;
    if (map.amount < 0 && map.debit < 0 && map.credit < 0) map.amount = 2;

    return { map: map, colCount: Math.max(colCount, 3) };
  }

  function columnLabel(header, index) {
    var label = header && header[index] ? String(header[index]).trim() : "";
    return label || "Column " + (index + 1);
  }

  function readMappedRow(row) {
    var map = importModel.map;
    var date = map.date >= 0 ? C.parseDateLoose(row[map.date], importModel.dateOrder) : null;
    var desc = map.desc >= 0 ? String(row[map.desc] === undefined || row[map.desc] === null ? "" : row[map.desc]).trim() : "";
    var amount = null;
    if (map.amount >= 0) {
      amount = C.parseAmountToMinor(row[map.amount], state.currency);
    } else {
      var debit = map.debit >= 0 ? C.parseAmountToMinor(row[map.debit], state.currency) : null;
      var credit = map.credit >= 0 ? C.parseAmountToMinor(row[map.credit], state.currency) : null;
      if (debit !== null && debit !== 0) amount = -Math.abs(debit);
      else if (credit !== null && credit !== 0) amount = Math.abs(credit);
    }
    return { date: date, desc: desc, amount: amount };
  }

  function onImportFile(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    readFileText(file).then(function (text) {
      var parsed = C.parseCSV(text);
      if (!parsed.rows.length) {
        toast("That file is empty.");
        return;
      }
      var headerRow = findHeaderRow(parsed.rows);
      var header = headerRow >= 0 ? parsed.rows[headerRow] : null;
      var dataRows = parsed.rows.slice(headerRow + 1).filter(function (row) {
        return row.some(function (cell) { return String(cell).trim() !== ""; });
      });
      if (!dataRows.length) {
        toast("No transaction rows found in that file.");
        return;
      }
      var detected = detectColumns(header, dataRows);
      importModel = {
        fileName: file.name || "statement.csv",
        header: header,
        rows: dataRows,
        colCount: detected.colCount,
        map: detected.map,
        dateOrder: $("import-order") ? $("import-order").value : "auto",
        proposals: null,
        scanned: 0,
        skipped: 0
      };
      renderMapping();
      var results = $("import-results");
      if (results) clear(results);
      var mapping = $("import-mapping");
      if (mapping && mapping.scrollIntoView) mapping.scrollIntoView({ block: "nearest" });
    }).catch(function () {
      toast("Could not read that file.");
    });
  }

  function selectFor(key, noneLabel, options, selected) {
    var select = make("select", { id: "import-col-" + key });
    if (noneLabel) {
      select.appendChild(make("option", { value: "", text: noneLabel }));
    }
    options.forEach(function (option) {
      select.appendChild(make("option", { value: String(option.value), text: option.label }));
    });
    select.value = selected === undefined || selected === null ? "" : String(selected);
    select.addEventListener("change", function () {
      var value = select.value;
      if (key === "amount") {
        if (value === "") {
          importModel.map.amount = -1;
        } else {
          importModel.map.amount = Number(value);
          importModel.map.debit = -1;
          importModel.map.credit = -1;
        }
      } else if (key === "debit" || key === "credit") {
        importModel.map[key] = value === "" ? -1 : Number(value);
        if (value !== "") importModel.map.amount = -1;
      } else {
        importModel.map[key] = Number(value);
      }
      renderMapping();
    });
    return select;
  }

  function renderMapping() {
    var host = $("import-mapping");
    if (!host || !importModel) return;
    clear(host);

    var options = [];
    for (var i = 0; i < importModel.colCount; i++) {
      options.push({ value: i, label: columnLabel(importModel.header, i) });
    }
    var map = importModel.map;

    var step = make("div", { class: "import-step" }, [
      make("h2", { text: "2. Match the columns" }),
      make("p", {
        text: "Read " + importModel.rows.length + " rows from " + importModel.fileName +
          ". Adjust anything the preview gets wrong."
      }),
      make("div", { class: "import-grid" }, [
        make("label", { class: "field" }, [
          make("span", { text: "Date column" }),
          selectFor("date", "", options, map.date)
        ]),
        make("label", { class: "field" }, [
          make("span", { text: "Description column" }),
          selectFor("desc", "", options, map.desc)
        ]),
        make("label", { class: "field" }, [
          make("span", { text: "Amount column" }),
          selectFor("amount", "Use debit and credit columns", options, map.amount)
        ]),
        make("label", { class: "field" }, [
          make("span", { text: "Debit column" }),
          selectFor("debit", "Not used", options, map.debit)
        ]),
        make("label", { class: "field" }, [
          make("span", { text: "Credit column" }),
          selectFor("credit", "Not used", options, map.credit)
        ])
      ])
    ]);

    var preview = make("div", { id: "import-preview", class: "import-preview" });
    step.appendChild(preview);
    host.appendChild(step);

    var actions = make("div", { class: "import-actions" }, [
      make("button", { type: "button", class: "button primary", text: "Find recurring charges", on: { click: scanImport } }),
      make("button", {
        type: "button",
        class: "button quiet",
        text: "Choose another file",
        on: { click: resetImport }
      })
    ]);
    host.appendChild(actions);

    renderPreview();
  }

  function renderPreview() {
    var host = $("import-preview");
    if (!host || !importModel) return;
    clear(host);

    var table = make("table", { class: "preview-table" }, [
      make("caption", { text: "First rows after matching. Dates use the selected order." }),
      make("thead", {}, [
        make("tr", {}, [
          make("th", { scope: "col", text: "Date" }),
          make("th", { scope: "col", text: "Description" }),
          make("th", { scope: "col", text: "Amount" })
        ])
      ])
    ]);
    var tbody = make("tbody");
    importModel.rows.slice(0, 4).forEach(function (row) {
      var mapped = readMappedRow(row);
      tbody.appendChild(make("tr", {}, [
        make("td", { text: mapped.date ? dateLabel(mapped.date) : "Not a date" }),
        make("td", { text: mapped.desc || "Empty" }),
        make("td", {
          class: mapped.amount === null ? "error" : "tabular",
          text: mapped.amount === null ? "Not an amount" : fmt(mapped.amount)
        })
      ]));
    });
    table.appendChild(tbody);
    host.appendChild(table);
  }

  function scanImport() {
    if (!importModel) return;
    var transactions = [];
    var skipped = 0;
    importModel.rows.forEach(function (row) {
      var mapped = readMappedRow(row);
      if (!mapped.date || !mapped.desc || mapped.amount === null || mapped.amount === 0) {
        skipped++;
        return;
      }
      transactions.push({
        date: mapped.date,
        description: mapped.desc,
        amountMinor: mapped.amount
      });
    });

    importModel.scanned = transactions.length;
    importModel.skipped = skipped;
    importModel.proposals = C.detectRecurring(transactions, {
      today: C.todayISO(),
      currency: state.currency
    });
    renderProposals();
  }

  function renderProposals() {
    var host = $("import-results");
    if (!host || !importModel) return;
    clear(host);

    if (!importModel.scanned) {
      host.appendChild(make("div", { class: "import-step" }, [
        make("h2", { text: "Nothing readable yet" }),
        make("p", { text: "No rows had a date, a description and an amount. Check the column choices above, then try again." })
      ]));
      return;
    }

    var proposals = importModel.proposals || [];
    var step = make("div", { class: "import-step" }, [
      make("h2", { text: "3. Confirm what to add" }),
      make("p", {
        text: "Read " + importModel.scanned + " charges and skipped " + importModel.skipped +
          " incomplete rows. " + (proposals.length
            ? proposals.length + " repeating charges found. Uncheck anything that is not a subscription."
            : "No repeating charges found.")
      })
    ]);

    if (!proposals.length) {
      step.appendChild(make("p", {
        class: "hint",
        text: "Try a longer statement, at least three months, or change the date order above. Sunk needs two charges from the same merchant with a steady gap."
      }));
      host.appendChild(step);
      return;
    }

    var existingNames = state.subs.map(function (sub) { return String(sub.name).toLowerCase(); });
    var list = make("ul", { class: "proposal-list" });
    proposals.forEach(function (proposal, index) {
      var duplicate = existingNames.indexOf(String(proposal.name).toLowerCase()) >= 0;
      var item = make("li", { class: "proposal", "data-index": String(index) });
      var check = make("input", {
        type: "checkbox",
        "aria-label": "Add " + proposal.name,
        checked: !duplicate && proposal.confidence >= 0.5
      });
      item.appendChild(check);
      item.appendChild(make("label", { class: "proposal-main" }, [
        make("input", {
          type: "text",
          class: "proposal-name",
          value: proposal.name,
          maxlength: "60",
          "aria-label": "Name for the imported subscription"
        }),
        make("span", {
          class: "proposal-meta",
          text: "Last charge " + dateLabel(proposal.lastDate) + " \u00b7 " +
            proposal.occurrences + " charges \u00b7 next " + dateLabel(proposal.nextDate) +
            (duplicate ? " \u00b7 already on the ledger" : "")
        })
      ]));
      item.appendChild(make("input", {
        type: "text",
        class: "proposal-price",
        inputmode: "decimal",
        value: major(proposal.priceMinor),
        "aria-label": "Price for " + proposal.name
      }));
      var cycle = make("select", { class: "proposal-cycle", "aria-label": "Billing cycle for " + proposal.name });
      C.CYCLES.forEach(function (name) {
        cycle.appendChild(make("option", { value: name, text: C.cycleLabel(name) }));
      });
      cycle.value = proposal.cycle;
      item.appendChild(cycle);
      item.appendChild(make("span", {
        class: "confidence" + (proposal.confidence >= 0.75 ? " high" : ""),
        text: Math.round(proposal.confidence * 100) + "% match"
      }));
      list.appendChild(item);
    });
    step.appendChild(list);
    step.appendChild(make("div", { class: "import-actions" }, [
      make("button", { type: "button", class: "button primary", text: "Add selected", on: { click: addProposals } }),
      make("button", { type: "button", class: "button quiet", text: "Start over", on: { click: resetImport } })
    ]));
    host.appendChild(step);
  }

  function addProposals() {
    if (!importModel) return;
    var items = doc.querySelectorAll("#import-results .proposal");
    var drafts = [];
    var problem = "";

    Array.prototype.forEach.call(items, function (item) {
      var check = item.querySelector('input[type="checkbox"]');
      if (!check || !check.checked) return;
      var index = Number(item.getAttribute("data-index"));
      var proposal = importModel.proposals[index];
      if (!proposal) return;
      var name = String(item.querySelector(".proposal-name").value || "").trim();
      var price = C.parseAmountToMinor(item.querySelector(".proposal-price").value, state.currency);
      var cycle = item.querySelector(".proposal-cycle").value;
      if (!name) {
        problem = "Give every selected charge a name.";
        return;
      }
      if (price === null || price < 0) {
        problem = "Check the price on " + name + ".";
        return;
      }
      var sub = C.blankSub();
      sub.id = uid();
      sub.name = name.slice(0, 60);
      sub.priceMinor = price;
      sub.currency = state.currency;
      sub.cycle = cycle;
      sub.nextDate = proposal.nextDate;
      sub.status = "active";
      sub.category = "Other";
      sub.createdAt = C.todayISO();
      sub.priceHistory = [{ date: proposal.lastDate, priceMinor: price }];
      if (proposal.priceChanged && proposal.firstDate) {
        sub.priceHistory = [
          { date: proposal.firstDate, priceMinor: proposal.previousPriceMinor },
          { date: proposal.lastDate, priceMinor: price }
        ];
      }
      drafts.push(sub);
    });

    if (problem) {
      toast(problem);
      return;
    }
    if (!drafts.length) {
      toast("Select at least one charge.");
      return;
    }

    state.subs = state.subs.concat(drafts);
    importModel = null;
    persist();
    refresh();
    navigate("ledger");
    toast("Added " + drafts.length + (drafts.length === 1 ? " subscription." : " subscriptions."));
  }

  function resetImport() {
    importModel = null;
    var file = $("import-file");
    if (file) file.value = "";
    var mapping = $("import-mapping");
    if (mapping) clear(mapping);
    var results = $("import-results");
    if (results) clear(results);
  }

  function renderImport() {
    var host = $("import-body");
    if (!host) return;
    clear(host);

    if (!PRO) {
      host.appendChild(make("div", { class: "upgrade" }, [
        make("h2", { text: "Import is in the offline edition" }),
        make("p", {
          text: "Point Sunk at a bank CSV and it finds repeating charges: same merchant, steady gap, knowable cycle. Nothing leaves your browser."
        }),
        make("ul", {}, [
          make("li", { text: "Unlimited subscriptions" }),
          make("li", { text: "CSV import with recurring charge detection" }),
          make("li", { text: "Calendar reminders as an .ics file" }),
          make("li", { text: "One HTML file that runs offline" })
        ]),
        make("a", { class: "button primary", href: docLink("order.html"), text: "Offline edition, " + PRICE })
      ]));
      return;
    }

    host.appendChild(make("div", { class: "import-step" }, [
      make("h2", { text: "1. Pick a CSV file" }),
      make("p", {
        text: "Download a statement from your bank or card as CSV. Sunk reads it here; the file is never uploaded. Three months of history gives the best results."
      }),
      make("div", { class: "import-grid" }, [
        make("label", { class: "file-field" }, [
          make("span", { text: "Statement file" }),
          make("input", { type: "file", id: "import-file", accept: ".csv,text/csv", on: { change: onImportFile } })
        ]),
        make("label", { class: "field" }, [
          make("span", { text: "Date order" }),
          make("select", {
            id: "import-order",
            value: importModel ? importModel.dateOrder : "auto",
            on: {
              change: function (event) {
                if (!importModel) return;
                importModel.dateOrder = event.target.value;
                renderPreview();
              }
            }
          }, [
            make("option", { value: "auto", text: "Readable dates (31/10 or 10/31)" }),
            make("option", { value: "MDY", text: "Month first (10/31/2026)" }),
            make("option", { value: "DMY", text: "Day first (31/10/2026)" })
          ])
        ])
      ])
    ]));

    host.appendChild(make("div", { id: "import-mapping" }));
    host.appendChild(make("div", { id: "import-results" }));

    if (importModel) {
      renderMapping();
      if (importModel.proposals) renderProposals();
    }
  }

  // ---------- settings ----------

  function settingsSection(title, description, children) {
    var section = make("section", { class: "settings-section" }, [
      make("h2", { text: title })
    ]);
    if (description) section.appendChild(make("p", { text: description }));
    (children || []).forEach(function (child) { section.appendChild(child); });
    return section;
  }

  function renderSettings() {
    var host = $("settings-body");
    if (!host) return;
    clear(host);

    var currency = make("select", { id: "settings-currency" });
    Object.keys(C.CURRENCIES).forEach(function (code) {
      currency.appendChild(make("option", { value: code, text: code }));
    });
    currency.value = state.currency;
    currency.addEventListener("change", onCurrencyChange);

    host.appendChild(settingsSection(
      "Money",
      "The ledger holds one currency at a time.",
      [
        make("label", { class: "field" }, [
          make("span", { text: "Currency" }),
          currency
        ]),
        make("p", {
          class: "hint",
          text: "Changing this relabels every amount; it does not convert them. Only switch if the numbers were entered in the new currency."
        })
      ]
    ));

    var theme = make("select", { id: "settings-theme" });
    [
      { value: "system", label: "Follow the device" },
      { value: "light", label: "Paper (light)" },
      { value: "dark", label: "Ink (dark)" }
    ].forEach(function (option) {
      theme.appendChild(make("option", { value: option.value, text: option.label }));
    });
    theme.value = storedTheme() || "system";
    theme.addEventListener("change", function () { setTheme(theme.value); });

    host.appendChild(settingsSection(
      "Appearance",
      "Paper is the default. Ink is for night use. Both honour reduced motion and keyboard focus.",
      [make("label", { class: "field" }, [make("span", { text: "Theme" }), theme])]
    ));

    var restoreInput = make("input", {
      type: "file",
      id: "settings-restore",
      accept: ".json,application/json",
      class: "sr-only",
      on: {
        change: function (event) {
          var file = event.target.files && event.target.files[0];
          event.target.value = "";
          restoreBackup(file);
        }
      }
    });

    host.appendChild(settingsSection(
      "Backup",
      "A JSON file holds every entry and every price change. It stays on your device and works in either edition.",
      [
        make("div", { class: "settings-actions" }, [
          make("button", { type: "button", class: "button ghost", text: "Download JSON backup", on: { click: exportBackup } }),
          make("label", { class: "button ghost", for: "settings-restore", text: "Restore a backup" }),
          restoreInput
        ]),
        make("p", { class: "hint", text: "Restoring replaces the current ledger. Keep the downloaded file somewhere you will find it." })
      ]
    ));

    var reminderChildren = [];
    if (PRO) {
      reminderChildren.push(make("button", {
        type: "button",
        class: "button ghost",
        text: "Download .ics reminders",
        on: { click: exportICS }
      }));
    } else {
      reminderChildren.push(make("a", {
        class: "button ghost",
        href: docLink("order.html"),
        text: "See the offline edition"
      }));
    }
    reminderChildren.push(make("p", {
      class: "hint",
      text: PRO
        ? "Each renewal and trial becomes a calendar event with a three-day warning."
        : "Calendar files are part of the offline edition. The calendar view here is free."
    }));

    host.appendChild(settingsSection(
      "Reminders",
      "Put every renewal and trial into the calendar you already use.",
      reminderChildren
    ));

    var dataChildren = [];
    if (state.subs.length === 0) {
      dataChildren.push(make("div", { class: "settings-actions" }, [
        make("button", { type: "button", class: "button ghost", text: "Load the sample ledger", on: { click: loadSample } })
      ]));
    }
    dataChildren.push(make("div", { class: "settings-actions" }, [
      make("button", {
        type: "button",
        class: "button danger",
        text: "Clear all entries",
        disabled: state.subs.length === 0,
        on: { click: clearAll }
      })
    ]));
    dataChildren.push(make("p", {
      class: "hint",
      text: "Clearing site data in the browser also deletes the ledger. Download a backup first."
    }));

    var size = JSON.stringify(state).length;
    host.appendChild(settingsSection(
      "Data",
      state.subs.length + (state.subs.length === 1 ? " entry" : " entries") +
        ", about " + Math.max(1, Math.round(size / 1024)) + " KB in this browser.",
      dataChildren
    ));

    var editionText = PRO
      ? "Offline edition. This file runs without a network connection and keeps working as long as you keep it."
      : "Free web edition. Up to " + C.FREE_LIMIT + " subscriptions, kept in this browser. No account, no bank login, no analytics.";
    var editionChildren = [make("p", { class: "hint", text: editionText })];
    if (!PRO) {
      editionChildren.push(make("p", {
        class: "hint",
        text: "The offline edition is " + PRICE + " once: unlimited entries, CSV import, calendar files, one HTML file you own."
      }));
      editionChildren.push(make("a", { class: "button ghost", href: docLink("order.html"), text: "See the offline edition" }));
    }
    editionChildren.push(make("p", { class: "hint" }, [
      make("a", { href: docLink("privacy.html"), text: "Privacy" }),
      doc.createTextNode(" \u00b7 "),
      make("a", { href: docLink("terms.html"), text: "Terms" }),
      doc.createTextNode(" \u00b7 Version 1.0.0")
    ]));

    host.appendChild(settingsSection("Edition", "", editionChildren));
  }

  function onCurrencyChange(event) {
    var next = event.target.value;
    if (next === state.currency) return;
    confirmAction({
      title: "Change the ledger currency?",
      text: "Every amount will be relabelled in " + next + ". Sunk does not convert values. Only change this if the numbers were entered in " + next + " already.",
      confirmLabel: "Relabel amounts",
      danger: false
    }).then(function (ok) {
      if (!ok) {
        if (view === "settings") renderSettings();
        return;
      }
      state.currency = next;
      state.subs.forEach(function (sub) { sub.currency = next; });
      persist();
      refresh();
      renderSettings();
      toast("Ledger currency is now " + next + ".");
    });
  }

  function clearAll() {
    confirmAction({
      title: "Clear the whole ledger?",
      text: "This removes all " + state.subs.length + " entries from this browser. A downloaded backup is the only copy after this.",
      confirmLabel: "Clear everything"
    }).then(function (ok) {
      if (!ok) return;
      state.subs = [];
      persist();
      refresh();
      renderSettings();
      toast("Ledger cleared.");
    });
  }

  // ---------- sample ----------

  function loadSample() {
    function load() {
      state.subs = C.sampleSubs();
      state.currency = "USD";
      persist();
      refresh();
      navigate("ledger");
      toast("Sample ledger loaded in USD.");
    }
    if (state.subs.length === 0) {
      load();
      return;
    }
    confirmAction({
      title: "Replace this ledger with the sample?",
      text: "All current entries will be removed. Download a backup first if you want to keep them.",
      confirmLabel: "Replace with sample"
    }).then(function (ok) {
      if (ok) load();
    });
  }

  function clearSample() {
    confirmAction({
      title: "Clear the sample entries?",
      text: "The five sample subscriptions will be removed. Any entries you added stay.",
      confirmLabel: "Clear sample"
    }).then(function (ok) {
      if (!ok) return;
      state.subs = state.subs.filter(function (sub) { return !isSample(sub); });
      persist();
      refresh();
      toast("Sample cleared.");
    });
  }

  // ---------- routing ----------

  function route() {
    var hash = String(root.location.hash || "").replace(/^#\/?/, "");
    view = VIEWS.indexOf(hash) >= 0 ? hash : "ledger";

    VIEWS.forEach(function (name) {
      var section = $("view-" + name);
      if (section) section.hidden = name !== view;
    });

    Array.prototype.forEach.call(doc.querySelectorAll(".tabs a"), function (link) {
      if (link.getAttribute("data-view") === view) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });

    refresh();

    if (view === "calendar") renderCalendar();
    if (view === "import") renderImport();
    if (view === "settings") renderSettings();
  }

  function refresh() {
    renderSummary();
    renderAlerts();
    renderLedger();
    if (view === "calendar") renderCalendar();
  }

  // ---------- boot ----------

  function bind() {
    $("add-button").addEventListener("click", function () {
      if (atLimit()) {
        showUpgrade();
        return;
      }
      openSubDialog(null);
    });
    $("empty-add").addEventListener("click", function () {
      if (atLimit()) {
        showUpgrade();
        return;
      }
      openSubDialog(null);
    });
    $("theme-toggle").addEventListener("click", function () {
      setTheme(doc.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
    });
    $("filter-status").value = filter;
    $("filter-status").addEventListener("change", function (event) {
      filter = event.target.value;
      renderLedger();
    });
    $("clear-sample").addEventListener("click", clearSample);
    $("load-sample").addEventListener("click", loadSample);

    $("sub-form").addEventListener("submit", onSubSubmit);
    $("sub-close").addEventListener("click", closeSubDialog);
    $("sub-cancel").addEventListener("click", closeSubDialog);
    $("sub-delete").addEventListener("click", onSubDelete);

    $("calendar-prev").addEventListener("click", function () { shiftMonth(-1); });
    $("calendar-next").addEventListener("click", function () { shiftMonth(1); });
    $("calendar-today").addEventListener("click", function () {
      calendarCursor = null;
      renderCalendar();
    });
    $("calendar-export").addEventListener("click", exportICS);

    root.addEventListener("hashchange", route);

    var query = root.matchMedia ? root.matchMedia("(prefers-color-scheme: dark)") : null;
    if (query) {
      var onScheme = function () {
        if (!storedTheme()) applyTheme();
      };
      if (query.addEventListener) query.addEventListener("change", onScheme);
      else if (query.addListener) query.addListener(onScheme);
    }
  }

  function checkStorage() {
    try {
      root.localStorage.setItem("sunk.probe", "1");
      root.localStorage.removeItem("sunk.probe");
      storageOK = true;
    } catch (err) {
      storageOK = false;
    }
    var warning = $("storage-warning");
    if (warning) warning.hidden = storageOK;
  }

  function registerWorker() {
    if (PRO) return;
    if (!/^https?:$/.test(String(root.location.protocol || ""))) return;
    var nav = root.navigator;
    if (!nav || !nav.serviceWorker || typeof nav.serviceWorker.register !== "function") return;
    nav.serviceWorker.register("sw.js").catch(function () {});
  }

  applyTheme();
  bind();
  checkStorage();
  persist();
  route();
  registerWorker();
})(typeof window !== "undefined" ? window : this);
