/**
 * Griffiths-style vehicle status ribbons (In Transit / Reserved countdown)
 */
(function (global) {
  function normalizeVehicleStatusKey(status) {
    const v = String(status || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
    if (v.includes("transit") || v === "in_transit") return "in_transit";
    if (v === "reserved") return "reserved";
    return v;
  }

  function formatExpectedArrival(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return (
      "Expected Arrival: " +
      d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    );
  }

  function formatReservedCountdown(untilIso) {
    if (!untilIso) return "";
    const end = new Date(untilIso).getTime();
    const diff = end - Date.now();
    if (diff <= 0) return "Reservation ended";
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `Ends in: ${d}d ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function statusRibbonHtml(vehicle, esc) {
    const safe = esc || ((s) => String(s ?? ""));
    const key = normalizeVehicleStatusKey(vehicle?.status);
    const arrival = vehicle?.expectedArrivalAt || vehicle?.raw?.expectedArrivalAt || "";
    const until = vehicle?.reservedUntil || vehicle?.raw?.reservedUntil || "";

    if (key === "in_transit") {
      const sub = formatExpectedArrival(arrival);
      return (
        '<div class="status-ribbon status-ribbon--transit" aria-label="In transit">' +
        '<div class="status-ribbon__band"><div class="status-ribbon__text">' +
        '<span class="status-ribbon__title">IN TRANSIT</span>' +
        (sub ? '<span class="status-ribbon__sub">' + safe(sub) + "</span>" : "") +
        "</div></div></div>"
      );
    }

    if (key === "reserved") {
      const sub = formatReservedCountdown(until);
      return (
        '<div class="status-ribbon status-ribbon--reserved" aria-label="Reserved" data-reserved-until="' +
        safe(until) +
        '">' +
        '<div class="status-ribbon__band"><div class="status-ribbon__text">' +
        '<span class="status-ribbon__title">RESERVED</span>' +
        '<span class="status-ribbon__sub reserved-countdown">' +
        safe(sub) +
        "</span></div></div></div>"
      );
    }

    return "";
  }

  function usesStatusRibbon(vehicle) {
    const key = normalizeVehicleStatusKey(vehicle?.status);
    return key === "in_transit" || key === "reserved";
  }

  function tickReservedCountdowns(root) {
    const scope = root || document;
    scope.querySelectorAll(".reserved-countdown").forEach((el) => {
      const ribbon = el.closest("[data-reserved-until]");
      const until = ribbon?.getAttribute("data-reserved-until");
      if (!until) return;
      el.textContent = formatReservedCountdown(until);
    });
  }

  let countdownTimer = null;
  function startReservedCountdownTimer() {
    if (countdownTimer) return;
    tickReservedCountdowns();
    countdownTimer = setInterval(() => tickReservedCountdowns(), 1000);
  }

  global.ACJStatusRibbon = {
    normalizeVehicleStatusKey,
    formatExpectedArrival,
    formatReservedCountdown,
    statusRibbonHtml,
    usesStatusRibbon,
    tickReservedCountdowns,
    startReservedCountdownTimer,
  };
})(typeof window !== "undefined" ? window : global);
