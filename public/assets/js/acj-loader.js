(function (global) {
  const REDUCED =
    global.matchMedia &&
    global.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const MIN_MS = 600;
  const MAX_MS = 900;
  const INTERNAL_PREFIXES = ["/landing", "/storefront", "/dealer", "/admin"];
  const STATUS_LINES = [
    "Loading your dealer hub…",
    "Preparing inventory tools…",
    "Almost ready…",
  ];

  let root = null;
  let statusEl = null;
  let statusTimer = null;
  let statusIndex = 0;
  let shownAt = 0;
  let hideTimer = null;

  function ensureRoot() {
    if (root) return root;
    root = document.createElement("div");
    root.className = "acj-page-loader";
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "polite");
    root.setAttribute("aria-label", "Loading");

    const inner = document.createElement("div");
    inner.className = "acj-page-loader-inner";

    const logo = document.createElement("img");
    logo.className = "acj-page-loader-logo";
    logo.src =
      "https://res.cloudinary.com/dd8pjjxsm/image/upload/v1770298701/ChatGPT_Image_Sep_6_2025_08_27_53_AM_raorxf.png";
    logo.alt = "";
    logo.width = 56;
    logo.height = 56;

    const rings = document.createElement("div");
    rings.className = "acj-page-loader-rings";
    rings.setAttribute("aria-hidden", "true");

    statusEl = document.createElement("p");
    statusEl.className = "acj-page-loader-status";
    statusEl.setAttribute("aria-hidden", "true");

    inner.appendChild(logo);
    inner.appendChild(rings);
    inner.appendChild(statusEl);
    root.appendChild(inner);
    document.body.appendChild(root);

    return root;
  }

  function startStatusCycle() {
    if (!statusEl || REDUCED) {
      if (statusEl) statusEl.textContent = "";
      return;
    }
    clearInterval(statusTimer);
    statusIndex = 0;
    const tick = () => {
      statusEl.textContent = STATUS_LINES[statusIndex % STATUS_LINES.length];
      statusIndex += 1;
    };
    tick();
    statusTimer = setInterval(tick, 420);
  }

  function stopStatusCycle() {
    clearInterval(statusTimer);
    if (statusEl) statusEl.textContent = "";
  }

  function show(isNav) {
    shownAt = Date.now();
    const el = ensureRoot();
    el.classList.remove("is-hidden");
    el.classList.toggle("is-nav", Boolean(isNav));
    el.setAttribute("aria-hidden", "false");
    startStatusCycle();
  }

  function hide() {
    const el = root || ensureRoot();
    stopStatusCycle();
    el.classList.remove("is-nav");
    el.classList.add("is-hidden");
    el.setAttribute("aria-hidden", "true");
  }

  function hideAfterMin() {
    const elapsed = Date.now() - shownAt;
    const wait = REDUCED ? 0 : Math.max(0, MIN_MS - elapsed);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, wait);
  }

  function isInternalNav(href) {
    if (!href || href.startsWith("#")) return false;
    try {
      const url = new URL(href, global.location.origin);
      if (url.origin !== global.location.origin) return false;
      return INTERNAL_PREFIXES.some(
        (p) => url.pathname === p || url.pathname.startsWith(p + "/")
      );
    } catch {
      return false;
    }
  }

  function onInternalNav(event) {
    const a = event.target.closest && event.target.closest("a[href]");
    if (!a) return;
    if (a.target === "_blank" || a.hasAttribute("download")) return;
    const href = a.getAttribute("href");
    if (!isInternalNav(href)) return;
    event.preventDefault();
    show(true);
    global.setTimeout(() => {
      global.location.href = href;
    }, REDUCED ? 0 : 120);
  }

  function bootFirstVisit() {
    show(false);
    const done = () => hideAfterMin();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", done, { once: true });
    } else {
      done();
    }
    global.setTimeout(hide, REDUCED ? 0 : MAX_MS);
  }

  document.addEventListener("click", onInternalNav, true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootFirstVisit, { once: true });
  } else {
    bootFirstVisit();
  }

  global.ACJLoader = {
    show,
    hide,
    onInternalNav,
  };
})(window);
