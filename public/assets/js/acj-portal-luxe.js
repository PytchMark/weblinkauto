/**
 * Portal luxe — dark sidebar icons, GSAP tab transitions.
 */
(function (global) {
  "use strict";

  const STROKE =
    'stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

  const ICONS = {
    dashboard: `<svg viewBox="0 0 24 24" ${STROKE}><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>`,
    inventory: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M7 17h10M5 11l2-4h10l2 4"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/></svg>`,
    requests: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/></svg>`,
    performance: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15l3-4 3 2 4-6"/></svg>`,
    settings: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
    dealers: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5"/><path d="M17 14c2 0 4 1.2 4 3"/></svg>`,
    applications: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M12 13v5M9.5 15.5h5"/></svg>`,
    sellSubmissions: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M12 3 3 7v6c0 5 4 8 9 8s9-3 9-8V7z"/><path d="M9 12l2 2 4-4"/></svg>`,
    summary: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M12 3v18"/><path d="M3 12h18"/><circle cx="12" cy="12" r="9"/></svg>`,
  };

  function icon(name) {
    return ICONS[name] || ICONS.dashboard;
  }

  function prefersReducedMotion() {
    return global.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function hasGsap() {
    return !!global.gsap;
  }

  function injectSheen() {
    if (document.querySelector(".acj-portal-sheen")) return;
    const sheen = document.createElement("div");
    sheen.className = "acj-portal-sheen";
    sheen.setAttribute("aria-hidden", "true");
    document.body.prepend(sheen);
  }

  function wrapDealerNavButtons() {
    document.querySelectorAll(".acj-portal-luxe .nav button[data-tab]").forEach((btn) => {
      if (btn.querySelector(".nav-item")) return;
      const key = btn.getAttribute("data-tab");
      const wrap = document.createElement("span");
      wrap.className = "nav-item";
      const ic = document.createElement("span");
      ic.className = "nav-icon";
      ic.setAttribute("aria-hidden", "true");
      ic.innerHTML = icon(key);
      const text = document.createElement("span");
      text.className = "nav-text";
      while (btn.firstChild) text.appendChild(btn.firstChild);
      wrap.appendChild(ic);
      wrap.appendChild(text);
      btn.appendChild(wrap);
    });
  }

  function injectAdminTabIcons() {
    document.querySelectorAll(".acj-portal-luxe .tabs .tab[data-tab], .acj-portal-luxe .admin-rail .nav button[data-tab]").forEach((btn) => {
      if (btn.querySelector(".tab-icon")) return;
      const ic = document.createElement("span");
      ic.className = "tab-icon";
      ic.setAttribute("aria-hidden", "true");
      ic.innerHTML = icon(btn.dataset.tab);
      btn.insertBefore(ic, btn.firstChild);
    });
  }

  function staggerCards() {
    document
      .querySelectorAll(".acj-portal-luxe .kpi, .acj-portal-luxe .chart-card, .acj-portal-luxe .grid > .panel")
      .forEach((el, i) => {
        el.style.animationDelay = `${0.12 + i * 0.05}s`;
      });
  }

  function animatePanel(panel) {
    if (!panel) return;
    panel.style.display = "block";
    panel.classList.add("acj-tab-panel");
    if (prefersReducedMotion() || !hasGsap()) return;

    const gsap = global.gsap;
    gsap.killTweensOf(panel);
    gsap.set(panel, { visibility: "visible" });
    gsap.fromTo(
      panel,
      { autoAlpha: 0, y: 16 },
      { autoAlpha: 1, y: 0, duration: 0.4, ease: "power3.out" }
    );

    const blocks = panel.querySelectorAll(
      ".panel-head, .kpis .kpi, .chart-card, .table-tools, .table-wrap, .panel-body > .charts"
    );
    if (blocks.length) {
      gsap.from(blocks, {
        autoAlpha: 0,
        y: 10,
        duration: 0.32,
        stagger: 0.05,
        delay: 0.07,
        ease: "power2.out",
      });
    }
  }

  function switchDealerTab(panel) {
    if (!panel) return;
    animatePanel(panel);
  }

  function getAdminWorkspaceEl() {
    const summary = document.getElementById("summaryPanel");
    if (summary && !summary.classList.contains("hidden")) return summary;
    return document.getElementById("mainTable");
  }

  function animateAdminWorkspace() {
    const target = getAdminWorkspaceEl();
    if (!target) return;
    target.classList.add("portal-workspace-target");
    if (prefersReducedMotion() || !hasGsap()) return;

    const gsap = global.gsap;
    gsap.killTweensOf(target);
    gsap.fromTo(
      target,
      { autoAlpha: 0, y: 14 },
      { autoAlpha: 1, y: 0, duration: 0.38, ease: "power3.out" }
    );
    const blocks = target.querySelectorAll(".kpi, .table-head, .table-title, thead");
    if (blocks.length) {
      gsap.from(blocks, {
        autoAlpha: 0,
        y: 8,
        duration: 0.28,
        stagger: 0.04,
        delay: 0.08,
        ease: "power2.out",
      });
    }
  }

  function markDealerTabs() {
    document.querySelectorAll(".acj-portal-luxe .tab[id^='tab-']").forEach((el) => {
      el.classList.add("acj-tab-panel");
    });
  }

  function init() {
    if (!document.body.classList.contains("acj-portal-luxe")) return;
    injectSheen();
    wrapDealerNavButtons();
    injectAdminTabIcons();
    markDealerTabs();
    staggerCards();
  }

  global.ACJPortal = {
    switchDealerTab,
    animateAdminWorkspace,
    refreshIcons: () => {
      wrapDealerNavButtons();
      injectAdminTabIcons();
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
