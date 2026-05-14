(function (global) {
  "use strict";

  const reducedMotionQuery = global.matchMedia("(prefers-reduced-motion: reduce)");

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
      duration: 1.1,
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

  function revealOnScroll(selector, options) {
    const nodes = Array.from(document.querySelectorAll(selector));
    if (!nodes.length) return;

    if (!registerScrollTrigger() || prefersReducedMotion()) {
      nodes.forEach((node) => node.classList.add("is-visible"));
      return;
    }

    nodes.forEach((node, index) => {
      global.gsap.fromTo(
        node,
        { autoAlpha: 0, y: options?.y ?? 28 },
        {
          autoAlpha: 1,
          y: 0,
          duration: options?.duration ?? 0.7,
          delay: (options?.stagger ?? 0.08) * index,
          ease: options?.ease ?? "power2.out",
          scrollTrigger: {
            trigger: node,
            start: options?.start ?? "top 88%",
            toggleActions: "play none none reverse",
          },
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
    const parent = document.querySelector(parentSelector);
    if (!parent) return;
    const children = Array.from(parent.querySelectorAll(childSelector));
    if (!children.length) return;

    if (!registerScrollTrigger() || prefersReducedMotion()) {
      children.forEach((child) => child.classList.add("is-visible"));
      return;
    }

    global.gsap.fromTo(
      children,
      { autoAlpha: 0, y: options?.y ?? 20 },
      {
        autoAlpha: 1,
        y: 0,
        duration: options?.duration ?? 0.45,
        stagger: options?.stagger ?? 0.06,
        ease: "power2.out",
        scrollTrigger: {
          trigger: parent,
          start: options?.start ?? "top 85%",
        },
      }
    );
  }

  function heroIntro(selectors) {
    if (!ensureGsap() || prefersReducedMotion()) {
      selectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((node) => node.classList.add("is-visible"));
      });
      return;
    }

    registerScrollTrigger();
    global.gsap.from(selectors.join(","), {
      autoAlpha: 0,
      y: 24,
      duration: 0.8,
      stagger: 0.12,
      ease: "power2.out",
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
        duration: 0.35,
        yoyo: true,
        repeat: 1,
        ease: "power1.inOut",
        scrollTrigger: {
          trigger: node,
          start: "top 80%",
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
      global.gsap.fromTo(overlay, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.22, ease: "power1.out" });
      global.gsap.fromTo(panel, { y: 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.28, ease: "power2.out" });
      return;
    }

    global.gsap.to(panel, {
      y: 16,
      autoAlpha: 0,
      duration: 0.2,
      ease: "power1.in",
      onComplete: () => {
        overlay.classList.remove("show");
        overlay.setAttribute("aria-hidden", "true");
        global.gsap.set(overlay, { autoAlpha: 0 });
        global.gsap.set(panel, { clearProps: "all" });
      },
    });
    global.gsap.to(overlay, { autoAlpha: 0, duration: 0.2, ease: "power1.in" });
  }

  const ACJMotion = {
    prefersReducedMotion,
    whenReady,
    initLenis,
    revealOnScroll,
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
