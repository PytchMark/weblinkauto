(function (global) {
  "use strict";

  const reducedMotionQuery = global.matchMedia("(prefers-reduced-motion: reduce)");

  const MOTION = {
    reveal: { duration: 0.42, y: 14, ease: "power3.out", start: "top 90%" },
    stagger: { duration: 0.36, y: 12, stagger: 0.04, ease: "power3.out", start: "top 88%" },
    hero: { duration: 0.52, y: 18, stagger: 0.07, ease: "power3.out" },
    modal: { overlay: 0.18, panel: 0.24 },
  };

  function prefersReducedMotion() {
    return reducedMotionQuery.matches;
  }

  function whenReady(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
  }

  function ensureGsap() {
    return global.gsap && global.ScrollTrigger;
  }

  function registerScrollTrigger() {
    if (!ensureGsap()) return false;
    global.gsap.registerPlugin(global.ScrollTrigger);
    return true;
  }

  function resolveNodes(selectorOrNodes) {
    if (!selectorOrNodes) return [];
    if (typeof selectorOrNodes === "string") {
      return Array.from(document.querySelectorAll(selectorOrNodes));
    }
    if (selectorOrNodes instanceof Element) return [selectorOrNodes];
    if (Array.isArray(selectorOrNodes)) return selectorOrNodes.filter(Boolean);
    return [];
  }

  function markVisible(nodes) {
    nodes.forEach((node) => node.classList.add("is-visible"));
  }

  function killAll() {
    if (global.ScrollTrigger) global.ScrollTrigger.killAll();
    if (global.lenis && typeof global.lenis.destroy === "function") {
      global.lenis.destroy();
      global.lenis = null;
    }
  }

  function initLenis(options) {
    if (prefersReducedMotion() || !global.Lenis) return null;
    const lenis = new global.Lenis({
      duration: 0.85,
      smoothWheel: true,
      ...options,
    });

    global.lenis = lenis;

    if (ensureGsap()) {
      lenis.on("scroll", global.ScrollTrigger.update);
      global.gsap.ticker.add((time) => {
        lenis.raf(time * 1000);
      });
      global.gsap.ticker.lagSmoothing(0);
    } else {
      function raf(time) {
        lenis.raf(time);
        global.requestAnimationFrame(raf);
      }
      global.requestAnimationFrame(raf);
    }

    return lenis;
  }

  /** Fade/slide each matched element when it enters the viewport (no page-wide delay stack). */
  function revealOnScroll(selector, options) {
    const nodes = resolveNodes(selector);
    if (!nodes.length) return;

    if (!registerScrollTrigger() || prefersReducedMotion()) {
      markVisible(nodes);
      return;
    }

    const duration = options?.duration ?? MOTION.reveal.duration;
    const y = options?.y ?? MOTION.reveal.y;
    const ease = options?.ease ?? MOTION.reveal.ease;
    const start = options?.start ?? MOTION.reveal.start;

    nodes.forEach((node) => {
      global.gsap.fromTo(
        node,
        { autoAlpha: 0, y },
        {
          autoAlpha: 1,
          y: 0,
          duration,
          ease,
          scrollTrigger: {
            trigger: node,
            start,
            once: true,
            toggleActions: "play none none none",
          },
          onComplete: () => node.classList.add("is-visible"),
        }
      );
    });
  }

  /** Stagger children inside each parent when the parent scrolls into view. */
  function revealGroup(parentSelector, childSelector, options) {
    const parents = resolveNodes(parentSelector);
    if (!parents.length) return;

    if (!registerScrollTrigger() || prefersReducedMotion()) {
      parents.forEach((parent) => markVisible(Array.from(parent.querySelectorAll(childSelector))));
      return;
    }

    const duration = options?.duration ?? MOTION.stagger.duration;
    const y = options?.y ?? MOTION.stagger.y;
    const stagger = options?.stagger ?? MOTION.stagger.stagger;
    const ease = options?.ease ?? MOTION.stagger.ease;
    const start = options?.start ?? MOTION.stagger.start;

    parents.forEach((parent) => {
      const children = Array.from(parent.querySelectorAll(childSelector));
      if (!children.length) return;

      global.gsap.fromTo(
        children,
        { autoAlpha: 0, y },
        {
          autoAlpha: 1,
          y: 0,
          duration,
          stagger,
          ease,
          scrollTrigger: {
            trigger: parent,
            start,
            once: true,
            toggleActions: "play none none none",
          },
          onComplete: () => children.forEach((child) => child.classList.add("is-visible")),
        }
      );
    });
  }

  function pinSection(selector, config) {
    const node = document.querySelector(selector);
    if (!node || !registerScrollTrigger() || prefersReducedMotion()) return;

    global.ScrollTrigger.create({
      trigger: node,
      start: config?.start ?? "top top",
      end: config?.end ?? "+=120%",
      pin: true,
      pinSpacing: true,
      anticipatePin: 1,
    });
  }

  function parallaxLayer(selector, speed) {
    const nodes = Array.from(document.querySelectorAll(selector));
    if (!nodes.length || !registerScrollTrigger() || prefersReducedMotion()) return;

    nodes.forEach((node) => {
      global.gsap.to(node, {
        yPercent: speed ?? 12,
        ease: "none",
        scrollTrigger: {
          trigger: node.parentElement || node,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      });
    });
  }

  function staggerChildren(parentSelector, childSelector, options) {
    const parents = resolveNodes(parentSelector);
    const parent = parents[0] || null;
    if (!parent) return;
    const children = Array.from(parent.querySelectorAll(childSelector));
    if (!children.length) return;

    if (!registerScrollTrigger() || prefersReducedMotion()) {
      markVisible(children);
      return;
    }

    global.gsap.fromTo(
      children,
      { autoAlpha: 0, y: options?.y ?? MOTION.stagger.y },
      {
        autoAlpha: 1,
        y: 0,
        duration: options?.duration ?? MOTION.stagger.duration,
        stagger: options?.stagger ?? MOTION.stagger.stagger,
        ease: options?.ease ?? MOTION.stagger.ease,
        scrollTrigger: {
          trigger: parent,
          start: options?.start ?? MOTION.stagger.start,
          once: true,
          toggleActions: "play none none none",
        },
        onComplete: () => markVisible(children),
      }
    );
  }

  function heroIntro(selectors, options) {
    const selectorList = Array.isArray(selectors) ? selectors : [selectors];
    const nodes = selectorList.flatMap((sel) => Array.from(document.querySelectorAll(sel)));

    if (!nodes.length) return;

    if (!ensureGsap() || prefersReducedMotion()) {
      markVisible(nodes);
      return;
    }

    registerScrollTrigger();
    global.gsap.from(nodes, {
      autoAlpha: 0,
      y: options?.y ?? MOTION.hero.y,
      duration: options?.duration ?? MOTION.hero.duration,
      stagger: options?.stagger ?? MOTION.hero.stagger,
      ease: options?.ease ?? MOTION.hero.ease,
      onComplete: () => markVisible(nodes),
    });
  }

  function pulseOnce(selector) {
    const node = document.querySelector(selector);
    if (!node || !ensureGsap() || prefersReducedMotion()) return;

    global.gsap.fromTo(
      node,
      { scale: 1 },
      {
        scale: 1.03,
        duration: 0.28,
        yoyo: true,
        repeat: 1,
        ease: "power2.inOut",
        scrollTrigger: {
          trigger: node,
          start: "top 82%",
          once: true,
        },
      }
    );
  }

  function modalTimeline(overlay, panel, open) {
    if (!ensureGsap() || prefersReducedMotion()) {
      overlay.classList.toggle("show", open);
      overlay.setAttribute("aria-hidden", open ? "false" : "true");
      return;
    }

    if (open) {
      overlay.classList.add("show");
      overlay.setAttribute("aria-hidden", "false");
      global.gsap.fromTo(
        overlay,
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: MOTION.modal.overlay, ease: "power2.out" }
      );
      global.gsap.fromTo(
        panel,
        { y: 16, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: MOTION.modal.panel, ease: "power3.out" }
      );
      return;
    }

    global.gsap.to(panel, {
      y: 12,
      autoAlpha: 0,
      duration: 0.16,
      ease: "power2.in",
      onComplete: () => {
        overlay.classList.remove("show");
        overlay.setAttribute("aria-hidden", "true");
        global.gsap.set(overlay, { autoAlpha: 0 });
        global.gsap.set(panel, { clearProps: "all" });
      },
    });
    global.gsap.to(overlay, { autoAlpha: 0, duration: 0.16, ease: "power2.in" });
  }

  const ACJMotion = {
    prefersReducedMotion,
    whenReady,
    initLenis,
    revealOnScroll,
    revealGroup,
    pinSection,
    parallaxLayer,
    staggerChildren,
    heroIntro,
    pulseOnce,
    modalTimeline,
    killAll,
  };

  global.ACJMotion = ACJMotion;
})(window);
