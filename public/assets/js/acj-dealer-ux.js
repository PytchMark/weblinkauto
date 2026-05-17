/**
 * Dealer portal UX integration.
 */
(function () {
  "use strict";

  function boot() {
    const UX = window.ACJPortalUX;
    const STATE = window.__DEALER_STATE;
    if (!UX || !STATE || typeof window.setTab !== "function") {
      setTimeout(boot, 60);
      return;
    }

    const $ = (id) => document.getElementById(id);
    const selected = new Set();

    UX.init({
      commands: () => [
        { label: "Dashboard", run: () => window.setTab("dashboard") },
        { label: "Inventory", run: () => window.setTab("inventory") },
        { label: "Requests", run: () => window.setTab("requests") },
        { label: "Add vehicle", run: () => $("newVehicleBtn")?.click() },
        {
          label: "Search inventory",
          run: () => {
            window.setTab("inventory");
            $("invSearch")?.focus();
          },
        },
      ],
    });

    function renderAttention() {
      const el = $("attentionGrid");
      if (!el) return;
      const vehicles = (STATE.vehicles || []).filter((v) => v.archived !== true);
      const pendingReq = (STATE.requests || []).filter((r) => String(r.status || "").toLowerCase() === "new").length;
      const noPhotos = vehicles.filter((v) => !String(v.cloudinaryImageUrls || "").trim()).length;
      const hiddenMp = STATE.dealerProfile?.marketplaceEligible
        ? vehicles.filter((v) => v.showInMarketplace === false).length
        : 0;
      el.innerHTML = [
        `<div class="acj-attention-card alert" data-go="requests"><div class="n">${pendingReq}</div><div class="l">Pending requests</div></div>`,
        `<div class="acj-attention-card warn" data-go="inventory"><div class="n">${noPhotos}</div><div class="l">Missing photos</div></div>`,
        STATE.dealerProfile?.marketplaceEligible
          ? `<div class="acj-attention-card" data-go="inventory"><div class="n">${hiddenMp}</div><div class="l">Hidden from marketplace</div></div>`
          : "",
      ].join("");
      el.innerHTML = el.innerHTML.replace(/<div class="n">/g, '<div class="n">').replace(/<\/div>/g, "");
      el.querySelectorAll(".acj-attention-card").forEach((c) => {
        c.style.cursor = "pointer";
        c.onclick = () => window.setTab(c.dataset.go || "dashboard");
      });
    }

    function renderOnboarding() {
      const box = $("onboardingBox");
      if (!box || !STATE.dealerProfile) return;
      const p = STATE.dealerProfile;
      const hasLogo = !!p.logoUrl;
      const hasVehicle = (STATE.vehicles || []).some((v) => v.archived !== true);
      const mpDone = !p.marketplaceEligible || (STATE.vehicles || []).some((v) => v.archived !== true && v.showInMarketplace !== false);
      if (hasLogo && hasVehicle && mpDone) {
        box.style.display = "none";
        return;
      }
      box.style.display = "";
      box.innerHTML = `<h3>Getting started</h3><div class="acj-onboard-steps">
        <div class="acj-onboard-step ${hasLogo ? "done" : ""}"><span class="dot">${hasLogo ? "✓" : "1"}</span>Upload logo in Settings</div>
        <div class="acj-onboard-step ${hasVehicle ? "done" : ""}"><span class="dot">${hasVehicle ? "✓" : "2"}</span>Add your first vehicle</div>
        ${p.marketplaceEligible ? `<div class="acj-onboard-step ${mpDone ? "done" : ""}"><span class="dot">${mpDone ? "✓" : "3"}</span>List on marketplace</div>` : ""}
      </div>`;
      box.innerHTML = box.innerHTML.replace(/<\/div>/g, "");
    }

    function updateBulkBar() {
      $("bulkBar")?.classList.toggle("is-visible", selected.size > 0);
      const c = $("bulkCount");
      if (c) c.textContent = String(selected.size);
    }

    async function bulkAction(action) {
      if (!selected.size) return;
      const res = await fetch("/api/dealer/vehicles/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + (localStorage.getItem("dealer.token") || ""),
        },
        body: JSON.stringify({ vehicleIds: [...selected], action }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed");
      UX.toast(`Updated ${data.updated} vehicle(s).`, "success");
      selected.clear();
      updateBulkBar();
      if (window.__dealerRefreshAll) await window.__dealerRefreshAll();
    }

    $("bulkMarkSold")?.addEventListener("click", () => bulkAction("mark_sold").catch((e) => UX.toast(e.message, "error")));
    $("bulkMpOn")?.addEventListener("click", () => bulkAction("marketplace_on").catch((e) => UX.toast(e.message, "error")));
    $("bulkMpOff")?.addEventListener("click", () => bulkAction("marketplace_off").catch((e) => UX.toast(e.message, "error")));
    $("bulkExport")?.addEventListener("click", () => {
      const rows = (STATE.vehicles || []).filter((v) => selected.has(v.vehicleId));
      if (!rows.length) return;
      const csv = ["vehicleId,title,price,status", ...rows.map((v) => `"${v.vehicleId}","${(v.title || "").replace(/"/g, '""')}",${v.price || 0},${v.status || ""}`)].join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      a.download = "inventory.csv";
      a.click();
    });

    window.__dealerAfterRender = function () {
      renderAttention();
      renderOnboarding();
    };

    window.__dealerArchiveWithUndo = function (vid) {
      UX.toast("Vehicle archived.", "success", {
        undoLabel: "Undo",
        undo: async () => {
          const res = await fetch(`/api/dealer/vehicles/${encodeURIComponent(vid)}/unarchive`, {
            method: "POST",
            headers: { Authorization: "Bearer " + (localStorage.getItem("dealer.token") || "") },
          });
          const data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error || "Undo failed");
          UX.toast("Restored.", "success");
          if (window.__dealerRefreshAll) await window.__dealerRefreshAll();
        },
      });
    };

    window.__dealerToggleSelect = function (vid, on) {
      if (on) selected.add(vid);
      else selected.delete(vid);
      updateBulkBar();
    };

    window.__dealerSlaBadge = (dt) => UX.slaBadge(dt);

    const drawer = $("drawer");
    if (drawer) {
      new MutationObserver(() => {
        if (drawer.getAttribute("aria-hidden") === "false") UX.trapFocus(document.querySelector(".drawer-panel"));
      }).observe(drawer, { attributes: true });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
