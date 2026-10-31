(function (root) {
  "use strict";

  var KEY = "sunk.v1";

  function defaults() {
    return {
      version: 1,
      currency: "USD",
      subs: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function normalize(data) {
    var out = defaults();
    if (!data || typeof data !== "object") return out;
    if (typeof data.currency === "string" && root.SunkCore.CURRENCIES[data.currency]) {
      out.currency = data.currency;
    }
    if (Array.isArray(data.subs)) {
      out.subs = data.subs.map(function (sub) {
        return root.SunkCore.normalizeSub(sub);
      });
    }
    if (typeof data.createdAt === "string") out.createdAt = data.createdAt;
    if (typeof data.updatedAt === "string") out.updatedAt = data.updatedAt;
    return out;
  }

  function load() {
    try {
      var raw = root.localStorage.getItem(KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return normalize(parsed);
    } catch (err) {
      return null;
    }
  }

  function save(state) {
    state.updatedAt = new Date().toISOString();
    root.localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  }

  function clear() {
    root.localStorage.removeItem(KEY);
  }

  root.SunkStore = {
    KEY: KEY,
    defaults: defaults,
    normalize: normalize,
    load: load,
    save: save,
    clear: clear
  };
})(typeof window !== "undefined" ? window : globalThis);
