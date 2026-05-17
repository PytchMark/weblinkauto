/**
 * ACJ Portal UX — command palette, toast+undo, mobile nav, dark mode, helpers.
 */
(function (global) {
  "use strict";

  const THEME_KEY = "acj-portal-theme";
  let hooks = {};
  let cmdIndex = 0;

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $all(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function ensureToastWrap() {
    let wrap = $("#acjPortalToastWrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "acjPortalToastWrap";
      wrap.className = "acj-portal-toast-wrap";
      wrap.setAttribute("aria-live", "polite");
      document.body.appendChild(wrap);
    }
    return wrap;
  }

  function toast(message, type = "success", options = {}) {
    const wrap = ensureToastWrap();
    const el = document.createElement("div");
    el.className = `acj-portal-toast ${type}`;
    const span = document.createElement("span");
    span.textContent = message;
    el.appendChild(span);
    if (options.undo && typeof options.undo === "function") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "acj-portal-toast-undo";
      btn.textContent = options.undoLabel || "Undo";
      btn.addEventListener("click", () => {
        options.undo();
        el.remove();
      });
      el.appendChild(btn);
    }
    wrap.appendChild(el);
    setTimeout(() => el.remove(), options.duration || 4200);
    return el;
  }

  function buildCommands() {
    return (hooks.commands ? hooks.commands() : []).filter((c) => c && c.label);
  }

  function openCommandPalette() {
    let root = $("#acjCmdPalette");
    if (!root) {
      root = document.createElement("div");
      root.id = "acjCmdPalette";
      root.className = "acj-cmd-palette";
root.innerHTML =
        '<div class="acj-cmd-panel" role="dialog" aria-label="Command palette">' +
        '<input class="acj-cmd-input" type="search" placeholder="Search actions…" autocomplete="off" />' +
        '<div class="acj-cmd-list" role="listbox"></div></div>';
      document.body.appendChild(root);
      root.addEventListener("click", (e) => {
        if (e.target === root) closeCommandPalette();
      });
    }
    const input = $(".acj-cmd-input", root);
    const list = $(".acj-cmd-list", root);
    cmdIndex = 0;
    function renderList(q) {
      const query = (q || "").trim().toLowerCase();
      const cmds = buildCommands().filter(
        (c) => !query || c.label.toLowerCase().includes(query) || (c.hint || "").toLowerCase().includes(query)
      );
      list.innerHTML = "";
      cmds.forEach((c, i) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "acj-cmd-item";
        btn.setAttribute("aria-selected", i === cmdIndex ? "true" : "false");
        btn.innerHTML = `<span>${c.label}</span>${c.hint ? `<kbd>${c.hint}</kbd>` : ""}`;
        btn.addEventListener("click", () => {
          closeCommandPalette();
          c.run();
        });
        list.appendChild(btn);
      });
    }
    input.oninput = () => {
      cmdIndex = 0;
      renderList(input.value);
    };
    input.onkeydown = (e) => {
      const items = $all(".acj-cmd-item", list);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        cmdIndex = Math.min(cmdIndex + 1, items.length - 1);
        renderList(input.value);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        cmdIndex = Math.max(cmdIndex - 1, 0);
        renderList(input.value);
      } else if (e.key === "Enter" && items[cmdIndex]) {
        e.preventDefault();
        items[cmdIndex].click();
      } else if (e.key === "Escape") closeCommandPalette();
    };
    renderList("");
    root.classList.add("is-open");
    setTimeout(() => input.focus(), 30);
  }

  function closeCommandPalette() {
    $("#acjCmdPalette")?.classList.remove("is-open");
  }

  function initMobileNav() {
    const sidebar = $(".sidebar") || $(".admin-rail");
    if (!sidebar) return;
    let backdrop = $("#portalMobileBackdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = "portalMobileBackdrop";
      backdrop.className = "portal-mobile-backdrop";
      backdrop.addEventListener("click", closeMobileNav);
      document.body.appendChild(backdrop);
    }
    if ($("#portalMobileToggle")) return;
    const headerActions = $(".head-actions") || $(".actions");
    if (!headerActions) return;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.id = "portalMobileToggle";
    toggle.className = "portal-mobile-toggle";
    toggle.setAttribute("aria-label", "Open menu");
    toggle.textContent = "☰";
    toggle.addEventListener("click", () => {
      const open = sidebar.classList.toggle("is-mobile-open");
      backdrop.classList.toggle("is-open", open);
    });
    headerActions.prepend(toggle);
  }

  function closeMobileNav() {
    $all(".sidebar, .admin-rail").forEach((el) => el.classList.remove("is-mobile-open"));
    $("#portalMobileBackdrop")?.classList.remove("is-open");
  }

  function applyTheme(theme) {
    document.body.classList.toggle("acj-theme-dark", theme === "dark");
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (_e) {}
    const btn = $("#themeToggle");
    if (btn) btn.textContent = theme === "dark" ? "☀ Light" : "◐ Night";
  }

  function initThemeToggle() {
    let theme = "light";
    try {
      theme = localStorage.getItem(THEME_KEY) || "light";
    } catch (_e) {}
    const host = $(".head-actions") || $(".actions");
    if (host && !$("#themeToggle")) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = "themeToggle";
      btn.className = "theme-toggle";
      btn.addEventListener("click", () => {
        applyTheme(document.body.classList.contains("acj-theme-dark") ? "light" : "dark");
      });
      host.insertBefore(btn, host.firstChild);
    }
    applyTheme(theme);
  }

  function initSidebarKeyboard() {
    const nav = $(".sidebar .nav") || $(".admin-rail .nav");
    if (!nav) return;
    const buttons = $all("button[data-tab]", nav);
    nav.addEventListener("keydown", (e) => {
      const idx = buttons.indexOf(document.activeElement);
      if (e.key === "ArrowDown" && idx < buttons.length - 1) {
        e.preventDefault();
        buttons[idx + 1].focus();
      } else if (e.key === "ArrowUp" && idx > 0) {
        e.preventDefault();
        buttons[idx - 1].focus();
      }
    });
  }

  function trapFocus(container) {
    if (!container) return () => {};
    const focusable = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    function onKey(e) {
      if (e.key !== "Tab") return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    container.addEventListener("keydown", onKey);
    first?.focus();
    return () => container.removeEventListener("keydown", onKey);
  }

  function showTableSkeleton(tbody, colCount, rows = 5) {
    if (!tbody) return;
    tbody.innerHTML = "";
    for (let r = 0; r < rows; r++) {
      const tr = document.createElement("tr");
      tr.className = "acj-skeleton-row";
      for (let c = 0; c < colCount; c++) {
        const td = document.createElement("td");
        td.innerHTML = `<div class="acj-skel" style="width:${55 + Math.random() * 35}%"></div>`;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  function emptyState({ icon = "◇", title, message, ctaLabel, ctaId }) {
    return `<tr><td colspan="99"><div class="acj-empty-state"><div class="acj-empty-icon" aria-hidden="true">${icon}</div><h3>${title}</h3><p>${message}</p>${ctaLabel ? `<button type="button" class="btn btn-primary" id="${ctaId || "acjEmptyCta"}">${ctaLabel}</button>` : ""}</div></td></tr>`;
  }

  function slaBadge(createdAt) {
    const dt = new Date(createdAt || 0);
    if (Number.isNaN(dt.getTime())) return '<span class="pill slate"><span class="d"></span>—</span>';
    const hours = (Date.now() - dt.getTime()) / 3600000;
    if (hours < 24) return '<span class="pill sla-new"><span class="d"></span>New</span>';
    if (hours < 72) return '<span class="pill sla-stale"><span class="d"></span>Stale</span>';
    return '<span class="pill sla-urgent"><span class="d"></span>Urgent</span>';
  }

  function dealerHealthScore(dealer, vehicleCount = 0) {
    let score = 50;
    if (String(dealer?.status || "").toLowerCase() === "active") score += 25;
    else score -= 30;
    if (vehicleCount >= 3) score += 20;
    else if (vehicleCount >= 1) score += 10;
    else score -= 15;
    const updated = new Date(dealer?.updatedAt || dealer?.createdAt || 0);
    if (!Number.isNaN(updated.getTime())) {
      const days = (Date.now() - updated.getTime()) / 86400000;
      if (days < 14) score += 10;
      else if (days > 60) score -= 15;
    }
    const level = score >= 70 ? "good" : score >= 45 ? "warn" : "bad";
    return { level, label: level === "good" ? "Healthy" : level === "warn" ? "Watch" : "At risk", score };
  }

  function healthDotHtml(dealer, vehicleCount) {
    const h = dealerHealthScore(dealer, vehicleCount);
    return `<span class="health-dot ${h.level}" title="Score ${h.score}">${h.label}</span>`;
  }

  function initSortableTable(table, config) {
    if (!table || !config) return;
    const thead = table.querySelector("thead");
    if (!thead) return;
    $all("th[data-sort]", thead).forEach((th) => {
      th.addEventListener("click", () => {
        if (typeof config.onSort === "function") config.onSort(th.getAttribute("data-sort"), th);
      });
    });
  }

  function initShortcuts() {
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openCommandPalette();
      }
      if (e.key === "Escape") {
        closeCommandPalette();
        closeMobileNav();
      }
    });
  }

  function init(h) {
    hooks = h || {};
    initThemeToggle();
    initMobileNav();
    initSidebarKeyboard();
    initShortcuts();
  }

  global.ACJPortalUX = {
    init,
    toast,
    openCommandPalette,
    closeCommandPalette,
    closeMobileNav,
    trapFocus,
    showTableSkeleton,
    emptyState,
    slaBadge,
    dealerHealthScore,
    healthDotHtml,
    initSortableTable,
    applyTheme,
  };
})();
