/**
 * ACJ Marketplace mode for storefront
 */
(function () {
  const MARKETPLACE_ALIASES = new Set(["marketplace", "market"]);

  function isMarketplaceAlias(raw) {
    return MARKETPLACE_ALIASES.has(String(raw || "").trim().toLowerCase());
  }

  window.ACJMarketplaceInit = function (api) {
    const {
      ui,
      state,
      esc,
      money,
      fetchOk,
      toast,
      normalizeVehicle,
      isPublicVehicle,
      parseImageUrls,
      setBranding,
      updateDealerBar,
      scrollToInventory,
      normalizeStatus,
      openDetailDrawer,
    } = api;

    state.viewMode = state.viewMode || "dealer";
    state.marketplaceConfig = state.marketplaceConfig || null;
    state.mpFilters = state.mpFilters || {
      make: "",
      model: "",
      minPrice: "",
      maxPrice: "",
      fuel: "",
      transmission: "",
      financingOnly: false,
      sort: "newest",
    };

    const mp = {
      marketplaceBtn: document.getElementById("marketplaceBtn"),
      mpFilterMake: document.getElementById("mpFilterMake"),
      mpFilterModel: document.getElementById("mpFilterModel"),
      mpFilterMinPrice: document.getElementById("mpFilterMinPrice"),
      mpFilterMaxPrice: document.getElementById("mpFilterMaxPrice"),
      mpFilterFuel: document.getElementById("mpFilterFuel"),
      mpFilterTransmission: document.getElementById("mpFilterTransmission"),
      mpFilterFinancing: document.getElementById("mpFilterFinancing"),
      mpFilterSort: document.getElementById("mpFilterSort"),
      mpApplyFilters: document.getElementById("mpApplyFilters"),
      mpClearFilters: document.getElementById("mpClearFilters"),
      reserveModalOverlay: document.getElementById("reserveModalOverlay"),
      reserveModalClose: document.getElementById("reserveModalClose"),
      reserveForm: document.getElementById("reserveForm"),
      reserveVehicleLabel: document.getElementById("reserveVehicleLabel"),
      reserveDepositLabel: document.getElementById("reserveDepositLabel"),
      reserveName: document.getElementById("reserveName"),
      reservePhone: document.getElementById("reservePhone"),
      reserveEmail: document.getElementById("reserveEmail"),
      reserveNotes: document.getElementById("reserveNotes"),
      reserveSubmitBtn: document.getElementById("reserveSubmitBtn"),
      reserveError: document.getElementById("reserveError"),
      reserveSuccess: document.getElementById("reserveSuccess"),
      calcModalOverlay: document.getElementById("calcModalOverlay"),
      calcModalClose: document.getElementById("calcModalClose"),
      calcPrice: document.getElementById("calcPrice"),
      calcDown: document.getElementById("calcDown"),
      calcTerm: document.getElementById("calcTerm"),
      calcRate: document.getElementById("calcRate"),
      calcPayment: document.getElementById("calcPayment"),
      calcRun: document.getElementById("calcRun"),
      sellFab: document.getElementById("sellFab"),
      sellModalOverlay: document.getElementById("sellModalOverlay"),
      sellModalClose: document.getElementById("sellModalClose"),
      sellForm: document.getElementById("sellForm"),
      sellSuccess: document.getElementById("sellSuccess"),
      sellError: document.getElementById("sellError"),
    };

    function setMarketplaceMode(on) {
      state.viewMode = on ? "marketplace" : "dealer";
      document.body.classList.toggle("mp-mode", on);
      if (on) {
        document.title = "ACJ Marketplace · Auto Concierge Jamaica";
        if (ui.heroTitle) {
          ui.heroTitle.textContent =
            "ACJ Marketplace — verified dealers & quality-checked vehicles";
        }
        if (ui.heroLead) {
          ui.heroLead.textContent =
            "Browse inventory from ACJ-verified dealers on the commission program. Every listing is reviewed — not open classifieds. Reserve with confidence; financing where marked.";
        }
        if (ui.heroDealerName) ui.heroDealerName.textContent = "ACJ Marketplace";
        if (ui.heroDealerSub) ui.heroDealerSub.textContent = "Verified dealers · Quality-checked listings";
        if (ui.kpiDealer) ui.kpiDealer.textContent = "Marketplace";
        if (ui.dealerSub) ui.dealerSub.textContent = "All verified free-plan dealers";
        if (ui.dealerName) ui.dealerName.textContent = "ACJ Marketplace";
        if (ui.verifiedBadge) ui.verifiedBadge.style.display = "inline-flex";
        if (ui.btnAboutDealer) ui.btnAboutDealer.disabled = true;
        if (ui.discoveryPanel) ui.discoveryPanel.classList.remove("show");
        if (history.replaceState) {
          history.replaceState(null, "", "/marketplace");
        }
      } else {
        setBranding();
      }
    }

    function timeAgo(iso) {
      if (!iso) return "";
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      const days = Math.floor((Date.now() - d.getTime()) / 86400000);
      if (days <= 0) return "Listed today";
      if (days === 1) return "1 day ago";
      return days + " days ago";
    }

    function specIcon(d) {
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="${d}"/></svg>`;
    }

    function bindImageScrub(card, images) {
      const media = card.querySelector(".media");
      const img = card.querySelector(".media img");
      const scrub = card.querySelector(".photo-scrub");
      const more = card.querySelector(".photo-more");
      if (!media || !img || !images.length) return;

      let touchIndex = 0;
      function showIndex(i) {
        const idx = Math.max(0, Math.min(images.length - 1, i));
        img.src = images[idx];
        if (scrub) {
          scrub.querySelectorAll("span").forEach((seg, si) => {
            seg.classList.toggle("on", si === idx);
          });
        }
        if (more) more.textContent = idx > 0 ? idx + 1 + " / " + images.length + " photos" : "";
      }

      media.addEventListener("mousemove", (e) => {
        if (images.length < 2) return;
        const rect = media.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        showIndex(Math.floor(ratio * images.length));
      });
      media.addEventListener("mouseleave", () => showIndex(0));
      media.addEventListener("click", (e) => {
        if (images.length < 2 && !("ontouchstart" in window)) return;
        if ("ontouchstart" in window) {
          e.stopPropagation();
          touchIndex = (touchIndex + 1) % images.length;
          showIndex(touchIndex);
        }
      });
    }

    function buildMarketplaceCard(v, index) {
      const title = [v.year, v.make, v.model].filter(Boolean).join(" ") || v.title || "Vehicle";
      const price = money(v.price);
      const deposit = v.reservationDeposit ? money(v.reservationDeposit) : "";
      const st = normalizeStatus(v.status);
      const images = parseImageUrls(v.raw?.cloudinaryImageUrls || v.imageUrl || "");
      const img0 = images[0] || v.imageUrl || "";
      const posted = timeAgo(v.listedAt || v.raw?.listedAt);
      const specs = [
        v.mileage
          ? {
              icon: specIcon("M5 12h14M12 8v8"),
              t: Number(v.mileage).toLocaleString() + " km",
            }
          : null,
        v.fuel ? { icon: specIcon("M12 2v4M12 18v4M4.93 4.93l2.83 2.83M19.07 19.07l-2.83-2.83"), t: v.fuel } : null,
        v.transmission
          ? { icon: specIcon("M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"), t: v.transmission }
          : null,
      ].filter(Boolean);

      const ribbon = window.ACJStatusRibbon?.usesStatusRibbon?.(v);
      const ribbonHtml = window.ACJStatusRibbon?.statusRibbonHtml?.(v, esc) || "";
      const card = document.createElement("div");
      card.className = "card card--mp";
      card.style.transitionDelay = index * 16 + "ms";
      card.innerHTML = `
        <div class="media${ribbon ? " has-status-ribbon" : ""}">
          ${img0 ? `<img src="${esc(img0)}" alt="${esc(title)}" loading="lazy" />` : ""}
          ${images.length > 1 ? `<span class="photo-more"></span>` : ""}
          ${ribbonHtml || `<div class="badge ${esc(st.cls)}">${esc(st.label)}</div>`}
          ${
            images.length > 1
              ? `<div class="photo-scrub">${images.map((_, i) => `<span class="${i === 0 ? "on" : ""}"></span>`).join("")}</div>`
              : ""
          }
        </div>
        <div class="card-body">
          ${posted ? `<div class="posted-age">${esc(posted)}</div>` : ""}
          <div class="veh-title">${esc(title)}</div>
          <div class="price">${esc(price)}</div>
          ${deposit ? `<div class="reserve-line">Reserve for: <em>${esc(deposit)}</em></div>` : ""}
          ${v.financingAvailable ? `<span class="financing-badge">Financing available</span>` : ""}
          <div class="spec-row">${specs.map((s) => `<span class="spec-i">${s.icon}${esc(s.t)}</span>`).join("")}</div>
          ${
            v.dealerName
              ? `<div class="dealer-chip">${v.dealerLogoUrl ? `<img src="${esc(v.dealerLogoUrl)}" alt="" />` : ""}<span>${esc(v.dealerName)}</span></div>`
              : ""
          }
          <div class="card-actions">
            <div class="btn-row">
              <button type="button" class="btn btn-primary btn-gloss" data-action="reserve">Reserve</button>
              <button type="button" class="btn btn-outline" data-action="calc">Loan calc</button>
            </div>
            <button type="button" class="btn btn-ghost" data-action="detail" style="width:100%">View details</button>
          </div>
        </div>
      `;
      const vehiclePayload = { ...v };
      card.querySelector('[data-action="reserve"]')?.addEventListener("click", () => openReserveModal(vehiclePayload));
      card.querySelector('[data-action="calc"]')?.addEventListener("click", () => openCalcModal(vehiclePayload));
      card.querySelector('[data-action="detail"]')?.addEventListener("click", () => openDetailDrawer(vehiclePayload));
      const media = card.querySelector(".media");
      if (media && openDetailDrawer) {
        media.addEventListener("dblclick", () => openDetailDrawer(vehiclePayload));
      }
      bindImageScrub(card, images);
      return card;
    }

    function applyMpFilters() {
      let list = [...state.vehicles];
      const f = state.mpFilters;
      if (f.make) list = list.filter((v) => String(v.make || "").toLowerCase() === f.make.toLowerCase());
      if (f.model) list = list.filter((v) => String(v.model || "").toLowerCase().includes(f.model.toLowerCase()));
      if (f.fuel) list = list.filter((v) => String(v.fuel || "").toLowerCase() === f.fuel.toLowerCase());
      if (f.transmission) {
        list = list.filter((v) => String(v.transmission || "").toLowerCase() === f.transmission.toLowerCase());
      }
      if (f.financingOnly) list = list.filter((v) => v.financingAvailable);
      const minP = Number(f.minPrice);
      const maxP = Number(f.maxPrice);
      if (Number.isFinite(minP) && minP > 0) list = list.filter((v) => Number(v.price) >= minP);
      if (Number.isFinite(maxP) && maxP > 0) list = list.filter((v) => Number(v.price) <= maxP);

      const q = String(ui.searchInput?.value || "").trim().toLowerCase();
      if (q) {
        list = list.filter((v) => {
          const blob = [v.vehicleId, v.title, v.make, v.model, v.year, v.dealerName].filter(Boolean).join(" ").toLowerCase();
          return blob.includes(q);
        });
      }

      if (f.sort === "price_asc") list.sort((a, b) => Number(a.price) - Number(b.price));
      else if (f.sort === "price_desc") list.sort((a, b) => Number(b.price) - Number(a.price));
      else {
        list.sort((a, b) => {
          const da = new Date(a.listedAt || a.raw?.listedAt || 0).getTime();
          const db = new Date(b.listedAt || b.raw?.listedAt || 0).getTime();
          return db - da;
        });
      }

      state.filtered = list;
      renderMarketplace();
    }

    function populateFilterOptions() {
      const makes = [...new Set(state.vehicles.map((v) => v.make).filter(Boolean))].sort();
      if (mp.mpFilterMake) {
        mp.mpFilterMake.innerHTML =
          '<option value="">All makes</option>' + makes.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join("");
      }
    }

    function renderMarketplace() {
      const list = state.filtered;
      ui.grid.innerHTML = "";
      ui.kpiLive.textContent = String(list.length || 0);
      if (!list.length) {
        ui.grid.innerHTML = `<div class="empty-state"><div style="font-weight:900;margin-bottom:6px">No listings match</div><div>Try clearing filters or check back as new verified stock is added.</div></div>`;
        return;
      }
      list.forEach((v, i) => {
        const card = buildMarketplaceCard(v, i);
        ui.grid.appendChild(card);
        requestAnimationFrame(() => card.classList.add("show"));
      });
      if (window.ACJMotion) ACJMotion.staggerChildren("#grid", ".card");
      window.ACJStatusRibbon?.startReservedCountdownTimer?.();
    }

    async function loadMarketplace() {
      setMarketplaceMode(true);
      state.dealerIds = [];
      state.dealers = [];
      setLoadingMp();
      try {
        const [configRes, dataRes] = await Promise.all([
          fetchOk("/api/public/marketplace/config", { method: "GET" }),
          fetchOk("/api/public/marketplace/vehicles", { method: "GET" }),
        ]);
        state.marketplaceConfig = configRes.config || {};
        const rows = (dataRes.vehicles || []).map((v) => {
          const n = normalizeVehicle(v);
          n.financingAvailable = v.financingAvailable === true;
          n.listedAt = v.listedAt || "";
          n.reservationDeposit = v.reservationDeposit || 0;
          n.dealerName = v.dealerName || "";
          n.dealerLogoUrl = v.dealerLogoUrl || "";
          n.raw = v;
          return n;
        }).filter(isPublicVehicle);
        state.vehicles = rows;
        state.filtered = [...rows];
        state.lastRefreshed = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
        if (ui.lastRefresh) ui.lastRefresh.textContent = "Last refreshed " + state.lastRefreshed;
        updateDealerBar();
        populateFilterOptions();
        applyMpFilters();
        scrollToInventory();
      } catch (e) {
        console.error(e);
        state.vehicles = [];
        state.filtered = [];
        ui.grid.innerHTML = `<div class="empty-state"><strong>Could not load marketplace</strong><br>${esc(e.message || "Try again")}</div>`;
        toast("Marketplace unavailable. Try again.", "error");
      }
    }

    function setLoadingMp() {
      ui.grid.innerHTML = "";
      for (let i = 0; i < 6; i++) {
        const card = document.createElement("div");
        card.className = "card show skeleton-card";
        card.innerHTML = `<div class="media"></div><div class="card-body"><div class="skeleton-block" style="height:14px"></div></div>`;
        ui.grid.appendChild(card);
      }
    }

    function openReserveModal(vehicle) {
      state.reserveVehicle = vehicle;
      if (mp.reserveVehicleLabel) {
        mp.reserveVehicleLabel.textContent = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || vehicle.title;
      }
      if (mp.reserveDepositLabel) {
        const dep = vehicle.reservationDeposit ? money(vehicle.reservationDeposit) : money(0);
        const pct = state.marketplaceConfig?.reservationDepositPct || 3.3;
        mp.reserveDepositLabel.textContent = `Estimated hold: ${dep} (${pct}% of price). ACJ will contact you — no online payment in v1.`;
      }
      if (mp.reserveError) mp.reserveError.textContent = "";
      if (mp.reserveSuccess) mp.reserveSuccess.style.display = "none";
      if (mp.reserveModalOverlay) {
        mp.reserveModalOverlay.classList.add("show");
        mp.reserveModalOverlay.style.display = "";
      }
    }

    function closeReserveModal() {
      if (mp.reserveModalOverlay) {
        mp.reserveModalOverlay.classList.remove("show");
        mp.reserveModalOverlay.style.display = "none";
      }
      state.reserveVehicle = null;
    }

    async function submitReserve(e) {
      e.preventDefault();
      const vehicle = state.reserveVehicle;
      if (!vehicle?.dealerId) return;
      const name = mp.reserveName?.value?.trim();
      const phone = mp.reservePhone?.value?.trim();
      if (!name || !phone) {
        if (mp.reserveError) mp.reserveError.textContent = "Name and phone are required.";
        return;
      }
      mp.reserveSubmitBtn.disabled = true;
      try {
        await fetchOk("/api/public/dealer/" + encodeURIComponent(vehicle.dealerId) + "/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestType: "vehicle_reservation",
            vehicleId: vehicle.vehicleId,
            customerName: name,
            phone,
            email: mp.reserveEmail?.value?.trim() || "",
            notes: mp.reserveNotes?.value?.trim() || "",
          }),
        });
        if (mp.reserveSuccess) mp.reserveSuccess.style.display = "block";
        if (mp.reserveError) mp.reserveError.textContent = "";
        toast("Reservation request sent. ACJ will follow up.", "success");
        mp.reserveForm?.reset();
        setTimeout(closeReserveModal, 1800);
      } catch (err) {
        if (mp.reserveError) mp.reserveError.textContent = err.message || "Could not submit.";
      } finally {
        mp.reserveSubmitBtn.disabled = false;
      }
    }

    function openCalcModal(vehicle) {
      if (mp.calcPrice) mp.calcPrice.value = vehicle.price || "";
      runCalc();
      if (mp.calcModalOverlay) {
        mp.calcModalOverlay.classList.add("show");
        mp.calcModalOverlay.style.display = "";
      }
    }

    function closeCalcModal() {
      if (mp.calcModalOverlay) {
        mp.calcModalOverlay.classList.remove("show");
        mp.calcModalOverlay.style.display = "none";
      }
    }

    function runCalc() {
      const price = Number(mp.calcPrice?.value) || 0;
      const down = Number(mp.calcDown?.value) || 0;
      const months = Number(mp.calcTerm?.value) || 60;
      const annual = Number(mp.calcRate?.value) || 12;
      const principal = Math.max(0, price - down);
      const r = annual / 100 / 12;
      let payment = 0;
      if (principal > 0 && months > 0) {
        if (r <= 0) payment = principal / months;
        else payment = (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
      }
      if (mp.calcPayment) mp.calcPayment.textContent = "J$ " + Math.round(payment).toLocaleString() + " / month";
    }

    function openSellModal() {
      if (mp.sellModalOverlay) {
        mp.sellModalOverlay.classList.add("show");
        mp.sellModalOverlay.style.display = "";
      }
      if (mp.sellSuccess) mp.sellSuccess.style.display = "none";
      if (mp.sellError) mp.sellError.textContent = "";
    }

    function closeSellModal() {
      if (mp.sellModalOverlay) {
        mp.sellModalOverlay.classList.remove("show");
        mp.sellModalOverlay.style.display = "none";
      }
    }

    async function submitSell(e) {
      e.preventDefault();
      const fd = new FormData(mp.sellForm);
      try {
        await fetchOk("/api/public/sell-submissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            year: fd.get("year"),
            make: fd.get("make"),
            model: fd.get("model"),
            mileage: fd.get("mileage"),
            priceHope: fd.get("priceHope"),
            contactName: fd.get("contactName"),
            contactPhone: fd.get("contactPhone"),
            contactEmail: fd.get("contactEmail"),
            notes: fd.get("notes"),
          }),
        });
        if (mp.sellSuccess) mp.sellSuccess.style.display = "block";
        mp.sellForm?.reset();
        toast("Submitted — we review in 3–7 business days.", "success");
      } catch (err) {
        if (mp.sellError) mp.sellError.textContent = err.message || "Submit failed.";
      }
    }

    function readFiltersFromUi() {
      state.mpFilters = {
        make: mp.mpFilterMake?.value || "",
        model: mp.mpFilterModel?.value?.trim() || "",
        minPrice: mp.mpFilterMinPrice?.value || "",
        maxPrice: mp.mpFilterMaxPrice?.value || "",
        fuel: mp.mpFilterFuel?.value || "",
        transmission: mp.mpFilterTransmission?.value || "",
        financingOnly: mp.mpFilterFinancing?.checked === true,
        sort: mp.mpFilterSort?.value || "newest",
      };
    }

    mp.marketplaceBtn?.addEventListener("click", () => loadMarketplace());
    mp.mpApplyFilters?.addEventListener("click", () => {
      readFiltersFromUi();
      applyMpFilters();
    });
    mp.mpClearFilters?.addEventListener("click", () => {
      state.mpFilters = { make: "", model: "", minPrice: "", maxPrice: "", fuel: "", transmission: "", financingOnly: false, sort: "newest" };
      if (mp.mpFilterMake) mp.mpFilterMake.value = "";
      if (mp.mpFilterModel) mp.mpFilterModel.value = "";
      if (mp.mpFilterMinPrice) mp.mpFilterMinPrice.value = "";
      if (mp.mpFilterMaxPrice) mp.mpFilterMaxPrice.value = "";
      if (mp.mpFilterFuel) mp.mpFilterFuel.value = "";
      if (mp.mpFilterTransmission) mp.mpFilterTransmission.value = "";
      if (mp.mpFilterFinancing) mp.mpFilterFinancing.checked = false;
      if (mp.mpFilterSort) mp.mpFilterSort.value = "newest";
      applyMpFilters();
    });
    mp.reserveModalClose?.addEventListener("click", closeReserveModal);
    mp.reserveModalOverlay?.addEventListener("click", (e) => {
      if (e.target === mp.reserveModalOverlay) closeReserveModal();
    });
    mp.reserveForm?.addEventListener("submit", submitReserve);
    mp.calcModalClose?.addEventListener("click", closeCalcModal);
    mp.calcModalOverlay?.addEventListener("click", (e) => {
      if (e.target === mp.calcModalOverlay) closeCalcModal();
    });
    mp.calcRun?.addEventListener("click", runCalc);
    mp.sellFab?.addEventListener("click", openSellModal);
    mp.sellModalClose?.addEventListener("click", closeSellModal);
    mp.sellModalOverlay?.addEventListener("click", (e) => {
      if (e.target === mp.sellModalOverlay) closeSellModal();
    });
    mp.sellForm?.addEventListener("submit", submitSell);

    api.resolveDealerInput = function (raw) {
      if (isMarketplaceAlias(raw)) return { marketplace: true };
      return null;
    };

    api.loadMarketplace = loadMarketplace;
    api.isMarketplaceMode = () => state.viewMode === "marketplace";
    api.applyMpFilters = applyMpFilters;

  };
})();
