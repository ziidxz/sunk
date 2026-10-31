(function () {
  "use strict";

  var checks = Array.prototype.slice.call(document.querySelectorAll("[data-sample-toggle]"));
  var monthly = document.getElementById("sample-monthly");
  var yearly = document.getElementById("sample-yearly");
  var kept = document.getElementById("sample-kept");

  function money(minor) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD"
    }).format(minor / 100);
  }

  function update() {
    var total = 0;
    var active = 0;
    checks.forEach(function (input) {
      var row = input.closest(".sample-row");
      if (input.checked) {
        total += Number(input.getAttribute("data-minor")) || 0;
        active++;
      }
      if (row) row.classList.toggle("is-off", !input.checked);
    });

    if (!monthly || !yearly || !kept) return;
    monthly.textContent = money(total);
    yearly.textContent = money(total * 12) + " a year";

    kept.classList.toggle("is-idle", active === checks.length);
    if (active === checks.length) {
      kept.textContent = "Nothing cancelled. Untick a row to see what it would give back.";
    } else if (active === 0) {
      kept.textContent = "All five cancelled. That keeps " + money(109164) + " a year.";
    } else {
      kept.textContent = "Cancelling the unticked rows keeps " + money(109164 - total * 12) + " a year.";
    }
  }

  checks.forEach(function (input) {
    input.addEventListener("change", update);
  });

  update();

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
