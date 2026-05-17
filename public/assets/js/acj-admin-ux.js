/**
 * Admin portal UX — extends inline admin app.
 */
(function () {
  "use strict";

  function boot() {
    if (!window.ACJPortalUX || !window.__ADMIN_APP) {
      setTimeout(boot, 60);
      return;
    }
    const app = window.__ADMIN_APP;
    const UX = window.ACJPortalUX;

    if (typeof window.API_BASE === "undefined") window.API_BASE = "";

    UX.init({
      commands: () => [
        { label: "Dealers", run: () => app.setTab("dealers") },
        { label: "Quality queue", run: () => app.setTab("quality") },
        { label: "Inventory", run: () => app.setTab("inventory") },
        { label: "Audit log", run: () => app.setTab("audit") },
        { label: "Applications", run: () => app.setTab("applications") },
      ],
    });

    app.patchSellSubmissionStatus = async function (id, status) {
      const res = await fetch(`${window.API_BASE}/api/admin/sell-submissions/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { ...app.authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await app.safeJson(res);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Update failed");
      app.toast("Submission updated.", "success");
      await app.refresh();
    };

    const origRefresh = app.refresh.bind(app);
    app.refresh = async function () {
      const tab = app.state.tab;
      if (tab === "quality" || tab === "audit") {
        app.ui.dashStatus.textContent = "Loading…";
        try {
          if (tab === "quality") await app.loadQualityQueue();
          else await app.loadAuditLog();
          app.ui.dashStatus.textContent = "Ready.";
        } catch (e) {
          app.ui.dashStatus.textContent = "Error.";
          app.toast(e.message, "error");
        }
        return;
      }
      if (tab === "sellSubmissions") {
        app.ui.dashStatus.textContent = "Loading…";
        try {
          if (!app.state.apiOnline) {
            app.seedDemoIfNeeded();
            app.render();
            return;
          }
          const res = await fetch(app.API.sellSubmissions(app.ui.statusFilter.value), {
            headers: app.authHeaders(),
          });
          const data = await app.safeJson(res);
          if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed");
          app.state.sellSubmissions = data.submissions || [];
          app.ui.dashStatus.textContent = "Ready.";
          app.render();
        } catch (e) {
          app.ui.dashStatus.textContent = "Error.";
          app.toast(e.message, "error");
        }
        return;
      }
      const tbody = app.ui.tbody;
      if (tbody && tab !== "summary") UX.showTableSkeleton(tbody, 6, 6);
      return origRefresh();
    };

    app.loadQualityQueue = async function () {
      const res = await fetch(`${window.API_BASE}/api/admin/vehicles/quality-queue`, {
        headers: app.authHeaders(),
      });
      const data = await app.safeJson(res);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed");
      app.state.qualityQueue = data.vehicles || [];
      app.renderQuality();
    };

    app.loadAuditLog = async function () {
      const res = await fetch(`${window.API_BASE}/api/admin/audit-log?limit=200`, {
        headers: app.authHeaders(),
      });
      const data = await app.safeJson(res);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed");
      app.state.auditLog = data.entries || [];
      app.renderAudit();
    };

    app.renderQuality = function () {
      app.ui.tableTitle.textContent = "Quality review queue";
      app.ui.mainTable.classList.remove("hidden");
      app.ui.summaryPanel.classList.add("hidden");
      app.buildTableHeaders("quality");
      const rows = app.state.qualityQueue || [];
      app.ui.count.textContent = String(rows.length);
      app.ui.tbody.innerHTML = "";
      if (!rows.length) {
        app.ui.tbody.innerHTML = UX.emptyState({
          icon: "✓",
          title: "Queue clear",
          message: "No free-plan vehicles awaiting ACJ quality review.",
        });
        return;
      }
      rows.forEach((r) => {
        const tr = document.createElement("tr");
        tr.appendChild(app.cell(`<div style="font-weight:900">${app.esc(r.title || r.make || "—")}</div><div class="mono" style="color:var(--muted)">${app.esc(r.vehicleId)}</div>`));
        tr.appendChild(app.cell(`<span class="badgeMini">${app.esc(r.dealerName || r.dealerId)}</span>`));
        tr.appendChild(app.cell(app.money(r.price)));
        tr.appendChild(app.cell(`<span class="badgeMini">${app.esc(r.dealerPlan || "free")}</span>`));
        const td = document.createElement("td");
        const ok = document.createElement("button");
        ok.className = "btn btn-primary";
        ok.type = "button";
        ok.textContent = "Approve";
        ok.addEventListener("click", () => app.patchQuality(r.vehicleId, true));
        td.appendChild(ok);
        tr.appendChild(td);
        app.ui.tbody.appendChild(tr);
      });
    };

    app.renderAudit = function () {
      app.ui.tableTitle.textContent = "Audit log";
      app.ui.mainTable.classList.remove("hidden");
      app.ui.summaryPanel.classList.add("hidden");
      app.ui.theadRow.innerHTML = "";
      ["When", "Actor", "Action", "Entity", "Detail"].forEach((c) => {
        const th = document.createElement("th");
        th.textContent = c;
        app.ui.theadRow.appendChild(th);
      });
      const rows = app.state.auditLog || [];
      app.ui.count.textContent = String(rows.length);
      app.ui.tbody.innerHTML = "";
      rows.forEach((e) => {
        const tr = document.createElement("tr");
        tr.appendChild(app.cell(`<span class="mono">${app.esc((e.createdAt || "").slice(0, 19))}</span>`));
        tr.appendChild(app.cell(`<span class="badgeMini">${app.esc(e.actorRole)} ${app.esc(e.actorId)}</span>`));
        tr.appendChild(app.cell(app.esc(e.action)));
        tr.appendChild(app.cell(`${app.esc(e.entityType)} ${app.esc(e.entityId)}`));
        tr.appendChild(app.cell(`<span style="color:var(--muted);font-size:11px">${app.esc(JSON.stringify(e.detail || {}))}</span>`));
        app.ui.tbody.appendChild(tr);
      });
    };

    app.patchQuality = async function (vehicleId, verified) {
      const res = await fetch(`${window.API_BASE}/api/admin/vehicles/${encodeURIComponent(vehicleId)}/quality`, {
        method: "PATCH",
        headers: { ...app.authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ acjQualityVerified: verified }),
      });
      const data = await app.safeJson(res);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed");
      app.toast(verified ? "Approved for marketplace." : "Review revoked.", "success");
      await app.loadQualityQueue();
    };

    const origSetTab = app.setTab.bind(app);
    app.setTab = function (tab) {
      origSetTab(tab);
      document.querySelectorAll(".admin-rail .nav button[data-tab]").forEach((btn) => {
        btn.setAttribute("aria-current", btn.dataset.tab === tab ? "page" : "false");
      });
    };

    const origBuildHeaders = app.buildTableHeaders.bind(app);
    app.buildTableHeaders = function (tab) {
      if (tab === "quality" || tab === "audit") return;
      if (tab === "dealers") {
        app.ui.theadRow.innerHTML = "";
        [
          ["name", "Dealer"],
          ["dealerId", "Dealer ID"],
          ["status", "Status"],
          ["plan", "Plan"],
          ["health", "Health"],
          ["whatsapp", "WhatsApp"],
          ["", "Actions"],
        ].forEach(([k, label]) => {
          const th = document.createElement("th");
          if (k) th.setAttribute("data-sort", k);
          th.textContent = label;
          app.ui.theadRow.appendChild(th);
        });
        return;
      }
      if (tab === "inventory") {
        app.ui.theadRow.innerHTML = "";
        const th0 = document.createElement("th");
        th0.innerHTML = '<input type="checkbox" id="invSelectAll" title="Select all" />';
        app.ui.theadRow.appendChild(th0);
        [
          ["vehicleId", "Vehicle"],
          ["dealerId", "Dealer"],
          ["status", "Status"],
          ["price", "Price"],
          ["updatedAt", "Updated"],
        ].forEach(([k, label]) => {
          const th = document.createElement("th");
          th.setAttribute("data-sort", k);
          th.textContent = label;
          app.ui.theadRow.appendChild(th);
        });
        setTimeout(() => {
          document.getElementById("invSelectAll")?.addEventListener("change", (e) => {
            document.querySelectorAll("input[data-vehicle-id]").forEach((cb) => {
              cb.checked = e.target.checked;
            });
          });
        }, 0);
        return;
      }
      origBuildHeaders(tab);
    };

    const origRender = app.render.bind(app);
    app.render = function () {
      if (app.state.tab === "quality" || app.state.tab === "audit") return;
      if (app.state.tab === "sellSubmissions") {
        app.ui.tbody.innerHTML = "";
        const rows = app.state.sellSubmissions || [];
        app.ui.count.textContent = String(rows.length);
        if (!rows.length) {
          app.ui.tbody.innerHTML = UX.emptyState({
            icon: "🚗",
            title: "No sell submissions",
            message: "Buyer sell-your-car requests will appear here.",
          });
          return;
        }
        rows.forEach((r) => {
          const tr = document.createElement("tr");
          const veh = [r.year, r.make, r.model].filter(Boolean).join(" ");
          tr.appendChild(app.cell(`<div style="font-weight:900">${app.esc(veh || "—")}</div>`));
          tr.appendChild(app.cell(`<span class="mono">${app.esc(r.contactName)}</span>`));
          tr.appendChild(app.cell(r.priceHope ? `J$ ${Number(r.priceHope).toLocaleString()}` : "—"));
          tr.appendChild(app.cell(app.statusPill(r.status)));
          tr.appendChild(app.cell(`<span class="mono">${app.esc((r.createdAt || "").slice(0, 19))}</span>`));
          const tdAct = document.createElement("td");
          const wrap = document.createElement("div");
          wrap.style.display = "flex";
          wrap.style.gap = "6px";
          const bOk = document.createElement("button");
          bOk.className = "btn btn-primary";
          bOk.textContent = "Approve";
          bOk.disabled = (r.status || "").toLowerCase() !== "pending";
          bOk.onclick = (e) => {
            e.stopPropagation();
            app.patchSellSubmissionStatus(r.id, "approved");
          };
          const bNo = document.createElement("button");
          bNo.className = "btn btn-danger";
          bNo.textContent = "Reject";
          bNo.disabled = (r.status || "").toLowerCase() !== "pending";
          bNo.onclick = (e) => {
            e.stopPropagation();
            app.patchSellSubmissionStatus(r.id, "rejected");
          };
          wrap.appendChild(bOk);
          wrap.appendChild(bNo);
          tdAct.appendChild(wrap);
          tr.appendChild(tdAct);
          app.ui.tbody.appendChild(tr);
        });
        app.ui.tbody.innerHTML = app.ui.tbody.innerHTML.replace(/<div /g, "<div ").replace(/<\/div>/g, "");
        return;
      }
      origRender();
      if (app.state.tab === "dealers") {
        app.ui.tbody.querySelectorAll("tr").forEach((tr, i) => {
          const d = (app.state.dealers || [])[i];
          if (!d) return;
          const vc = (app.state.vehicles || []).filter((v) => v.dealerId === d.dealerId).length;
          const healthCell = tr.children[4];
          if (healthCell) healthCell.innerHTML = UX.healthDotHtml(d, vc);
        });
      }
      if (app.state.tab === "inventory") {
        app.ui.tbody.innerHTML = "";
        (app.state.vehicles || []).forEach((r) => {
          const tr = document.createElement("tr");
          const td0 = document.createElement("td");
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.dataset.vehicleId = r.vehicleId;
          td0.appendChild(cb);
          tr.appendChild(td0);
          tr.appendChild(app.cell(`<div class="mono">${app.esc(r.vehicleId)}</div>`));
          tr.appendChild(app.cell(`<span class="badgeMini">${app.esc(r.dealerId)}</span>`));
          tr.appendChild(app.cell(`<span class="badgeMini">${app.esc(r.status)}</span>`));
          tr.appendChild(app.cell(`<div style="font-weight:900">${app.money(r.price)}</div>`));
          tr.appendChild(app.cell(`<span class="mono">${app.esc(r.updatedAt || "")}</span>`));
          app.ui.tbody.appendChild(tr);
        });
      }
    };

    app.state.qualityQueue = [];
    app.state.auditLog = [];

    const origBuildStatus = app.buildStatusFilterOptions.bind(app);
    app.buildStatusFilterOptions = function (tab) {
      origBuildStatus(tab);
      if (tab === "quality" || tab === "audit") app.ui.statusFilterWrap?.classList.add("hidden");
    };

    const origSetTabInner = app.setTab;
    app.setTab = function (tab) {
      app.ui.tabQuality?.classList.toggle("active", tab === "quality");
      app.ui.tabAudit?.classList.toggle("active", tab === "audit");
      if (tab === "quality") {
        app.state.tab = tab;
        app.ui.tableTitle.textContent = "Quality review";
        app.ui.dealerActions?.classList.add("hidden");
        app.ui.summaryControls?.classList.add("hidden");
        app.ui.summaryPanel?.classList.add("hidden");
        app.ui.mainTable?.classList.remove("hidden");
        app.refresh();
        return;
      }
      if (tab === "audit") {
        app.state.tab = tab;
        app.ui.tableTitle.textContent = "Audit log";
        app.ui.dealerActions?.classList.add("hidden");
        app.ui.summaryControls?.classList.add("hidden");
        app.ui.summaryPanel?.classList.add("hidden");
        app.ui.mainTable?.classList.remove("hidden");
        app.refresh();
        return;
      }
      origSetTabInner(tab);
      document.querySelectorAll(".admin-rail .nav button[data-tab]").forEach((btn) => {
        btn.setAttribute("aria-current", btn.dataset.tab === tab ? "page" : "false");
      });
      if (window.ACJPortal?.animateAdminWorkspace) {
        requestAnimationFrame(() => window.ACJPortal.animateAdminWorkspace());
      }
    };
    if (window.ACJPortal?.refreshIcons) window.ACJPortal.refreshIcons();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
