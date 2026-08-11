const navToggle = document.querySelector("[data-nav-toggle]");
const primaryNav = document.querySelector("[data-primary-nav]");
const siteHeader = document.querySelector("[data-site-header]");
const yearNodes = document.querySelectorAll("[data-current-year]");
const sellForms = Array.from(document.querySelectorAll(".sell-form"));
const salesActivity = document.querySelector("[data-sales-activity]");
const listingsSection = document.querySelector("[data-listings-section]");
const testimonialCarousel = document.querySelector("[data-testimonial-carousel]");
const testimonialsSection = document.querySelector("[data-testimonials-section]");
const LISTINGS_VISIBLE_LIMIT = 6;
const RECENT_ACTIVITY_VISIBLE_LIMIT = 8;
const TESTIMONIAL_VISIBLE_LIMIT = 8;
const TESTIMONIAL_AUTOPLAY_MS = 4000;
const WHATNOT_PROFILE = Object.freeze({
  rating: 5,
  reviewCount: 64,
  soldCount: 652,
});
const WHATNOT_TESTIMONIALS = Object.freeze([
  {
    id: "whatnot-awesome-community",
    source: "Whatnot",
    label: "Verified Whatnot buyer",
    comment: "Awesome community, fun rips, and awesome singles.",
    rating: 5,
  },
  {
    id: "whatnot-fast-delivery",
    source: "Whatnot",
    label: "Verified Whatnot buyer",
    comment: "Fast delivery, packaged perfectly and accurately.",
    rating: 5,
  },
  {
    id: "whatnot-packaged-well",
    source: "Whatnot",
    label: "Verified Whatnot buyer",
    comment: "Great card and well packaged.",
    rating: 5,
  },
  {
    id: "whatnot-streams",
    source: "Whatnot",
    label: "Verified Whatnot buyer",
    comment: "Cards came really quick and streams are always a good time. Would highly recommend tuning in.",
    rating: 5,
  },
  {
    id: "whatnot-kind-seller",
    source: "Whatnot",
    label: "Verified Whatnot buyer",
    comment: "The seller was so kind and even included a really nice note. Packaging was excellent and everything arrived safely.",
    rating: 5,
  },
  {
    id: "whatnot-super-quick",
    source: "Whatnot",
    label: "Verified Whatnot buyer",
    comment: "Super quick shipping, great packaging - too easy!",
    rating: 5,
  },
]);
const sectionLinks = primaryNav
  ? Array.from(primaryNav.querySelectorAll('a[href^="#"]'))
  : [];
const anchorLinks = Array.from(document.querySelectorAll('a[href*="#"]'));
let activeScrollAnimation = 0;
let restoreScrollBehavior = null;
let testimonialCarouselIndex = 0;
let testimonialCarouselCount = 0;
let testimonialCarouselTimer = 0;
let listingsFeedCache = null;
let listingsFilter = "all";

yearNodes.forEach((node) => {
  node.textContent = String(new Date().getFullYear());
});

function updateHeaderState() {
  if (!siteHeader) return;
  siteHeader.classList.toggle("is-scrolled", window.scrollY > 8);
}

function setNavOpen(isOpen) {
  if (!navToggle || !primaryNav) return;

  document.body.classList.toggle("nav-open", isOpen);
  primaryNav.classList.toggle("is-open", isOpen);
  navToggle.setAttribute("aria-expanded", String(isOpen));
  navToggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
}

function easeInOutCubic(progress) {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function getScrollOffset() {
  const headerHeight = siteHeader ? siteHeader.getBoundingClientRect().height : 0;
  return Math.ceil(headerHeight + 16);
}

function focusScrollTarget(target) {
  const hadTabIndex = target.hasAttribute("tabindex");

  if (!hadTabIndex) {
    target.setAttribute("tabindex", "-1");
  }

  try {
    target.focus({ preventScroll: true });
  } catch {
    target.focus();
  }

  if (!hadTabIndex) {
    target.addEventListener(
      "blur",
      () => {
        target.removeAttribute("tabindex");
      },
      { once: true }
    );
  }
}

function animateScrollTo(targetTop, onComplete) {
  const startTop = window.scrollY;
  const distance = targetTop - startTop;
  const root = document.documentElement;
  const previousScrollBehavior = root.style.scrollBehavior;

  if (Math.abs(distance) < 2) {
    if (onComplete) onComplete();
    return;
  }

  if (activeScrollAnimation) {
    cancelAnimationFrame(activeScrollAnimation);
    if (restoreScrollBehavior) restoreScrollBehavior();
  }

  const duration = Math.min(900, Math.max(460, Math.abs(distance) * 0.42));
  const startTime = performance.now();

  root.style.scrollBehavior = "auto";
  restoreScrollBehavior = () => {
    root.style.scrollBehavior = previousScrollBehavior;
    restoreScrollBehavior = null;
  };

  function finish() {
    if (restoreScrollBehavior) restoreScrollBehavior();
    activeScrollAnimation = 0;
    if (onComplete) onComplete();
  }

  function step(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const nextTop = startTop + distance * easeInOutCubic(progress);

    window.scrollTo(0, nextTop);
    updateHeaderState();

    if (progress < 1) {
      activeScrollAnimation = requestAnimationFrame(step);
    } else {
      finish();
    }
  }

  activeScrollAnimation = requestAnimationFrame(step);
}

function getSamePageAnchorTarget(link) {
  const href = link.getAttribute("href");

  if (!href || href === "#") return null;

  let url;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return null;
  }

  const currentPath = window.location.pathname.replace(/\/index\.html$/, "/");
  const linkPath = url.pathname.replace(/\/index\.html$/, "/");

  if (url.origin !== window.location.origin || linkPath !== currentPath) {
    return null;
  }

  const targetId = decodeURIComponent(url.hash.slice(1));
  return targetId ? document.getElementById(targetId) : null;
}

function getSellingCheckboxes(form) {
  return Array.from(form.querySelectorAll('input[name="selling[]"]'));
}

function validateSellingGroup(form, showMessage) {
  const sellingGroup = form.querySelector("[data-selling-group]");
  const sellingCheckboxes = getSellingCheckboxes(form);

  if (!sellingGroup || sellingCheckboxes.length === 0) return true;

  const hasSelection = sellingCheckboxes.some((checkbox) => checkbox.checked);
  sellingCheckboxes[0].setCustomValidity(
    hasSelection ? "" : "Select at least one collection category."
  );
  sellingGroup.classList.toggle("is-invalid", showMessage && !hasSelection);

  return hasSelection;
}

function getFormWizardSteps(form) {
  return Array.from(form.children).filter((child) => child instanceof HTMLFieldSetElement);
}

function getWizardStepName(fieldset, index) {
  const fallbackNames = ["Seller", "Items", "Collection"];
  const legendText = fieldset.querySelector("legend")?.textContent || fallbackNames[index] || `Step ${index + 1}`;

  return legendText
    .replace("Choose at least one", "")
    .replace(/\s+/g, " ")
    .trim();
}

function validateWizardStep(form, fieldset) {
  const controls = Array.from(fieldset.querySelectorAll("input, textarea, select"));

  if (fieldset.matches("[data-selling-group]") && !validateSellingGroup(form, true)) {
    getSellingCheckboxes(form)[0]?.reportValidity();
    return false;
  }

  const invalidControl = controls.find((control) => !control.checkValidity());

  if (invalidControl) {
    invalidControl.reportValidity();
    return false;
  }

  return true;
}

function initSellForm(form) {
  const steps = getFormWizardSteps(form);
  const submitButton = form.querySelector(".form-submit");
  const submitNote = form.querySelector(".submit-note");
  const consentRow = form.querySelector(".consent-row");

  getSellingCheckboxes(form).forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      validateSellingGroup(form, false);
    });
  });

  form.addEventListener("submit", (event) => {
    if (!validateSellingGroup(form, true)) {
      event.preventDefault();
      getSellingCheckboxes(form)[0]?.reportValidity();
    }
  });

  if (steps.length < 2 || !submitButton || form.dataset.wizardReady === "true") return;

  form.dataset.wizardReady = "true";
  form.classList.add("is-wizard");

  const stepper = document.createElement("div");
  stepper.className = "form-wizard-stepper";
  stepper.setAttribute("aria-label", "Collection enquiry steps");
  stepper.innerHTML = steps
    .map(
      (step, index) => `
        <button type="button" data-wizard-step-button="${index}">
          <span>${index + 1}</span>
          ${escapeHtml(getWizardStepName(step, index))}
        </button>
      `
    )
    .join("");

  const formSummary = form.querySelector(".form-summary");
  const formNote = form.querySelector(".form-note");
  (formSummary || formNote || form).insertAdjacentElement("afterend", stepper);

  const wizardActions = document.createElement("div");
  wizardActions.className = "form-wizard-actions";
  wizardActions.innerHTML = `
    <button class="button button-secondary" type="button" data-wizard-back>Back</button>
    <button class="button button-primary" type="button" data-wizard-next>Continue</button>
  `;
  submitButton.insertAdjacentElement("beforebegin", wizardActions);

  const backButton = wizardActions.querySelector("[data-wizard-back]");
  const nextButton = wizardActions.querySelector("[data-wizard-next]");
  const stepButtons = Array.from(stepper.querySelectorAll("[data-wizard-step-button]"));
  let currentStep = 0;

  function updateWizard() {
    steps.forEach((step, index) => {
      step.hidden = index !== currentStep;
    });

    stepButtons.forEach((button, index) => {
      const isActive = index === currentStep;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-current", isActive ? "step" : "false");
      button.disabled = index > currentStep + 1;
    });

    if (backButton) backButton.hidden = currentStep === 0;
    if (nextButton) nextButton.hidden = currentStep === steps.length - 1;
    submitButton.hidden = currentStep !== steps.length - 1;
    if (submitNote) submitNote.hidden = currentStep !== steps.length - 1;
    if (consentRow) consentRow.hidden = currentStep !== steps.length - 1;
  }

  function goToStep(nextStep) {
    const requestedStep = Math.max(0, Math.min(steps.length - 1, nextStep));

    if (requestedStep > currentStep && !validateWizardStep(form, steps[currentStep])) return;

    currentStep = requestedStep;
    updateWizard();
  }

  backButton?.addEventListener("click", () => goToStep(currentStep - 1));
  nextButton?.addEventListener("click", () => goToStep(currentStep + 1));
  stepButtons.forEach((button, index) => {
    button.addEventListener("click", () => goToStep(index));
  });

  updateWizard();
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-AU").format(Number(value || 0));
}

function formatCurrency(price) {
  const value = Number(price?.value);
  const currency = typeof price?.currency === "string" ? price.currency : "AUD";

  if (!Number.isFinite(value) || value <= 0) return "Price on eBay";

  try {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency,
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value);
  } catch {
    return `$${value.toFixed(value % 1 === 0 ? 0 : 2)}`;
  }
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });
}

function getStarsMarkup(value) {
  const rating = Math.max(0, Math.min(5, Number(value) || 0));
  const roundedStars = Math.round(rating);
  const stars = Array.from({ length: 5 }, (_, index) => (index < roundedStars ? "★" : "☆")).join("");

  return `
    <span class="testimonial-stars" aria-hidden="true">${stars}</span>
    <span class="testimonial-score">${rating.toFixed(1)}</span>
  `;
}

function getRatingMeta(testimonial) {
  const numericRating = Number(testimonial?.rating);

  if (Number.isFinite(numericRating) && numericRating > 0) {
    const className = numericRating >= 4 ? "positive" : numericRating >= 3 ? "neutral" : "negative";
    const formattedRating = numericRating.toFixed(1);

    return {
      className,
      label: `${formattedRating} star`,
      ariaLabel: `${formattedRating} out of 5 ${testimonial?.source || "marketplace"} review`,
      markup: getStarsMarkup(numericRating),
      summary: `${formattedRating} star review`,
    };
  }

  const rating = String(testimonial?.commentType || "positive").toLowerCase();

  if (rating === "negative") {
    return {
      className: "negative",
      label: "Negative",
      ariaLabel: "Negative marketplace feedback",
      markup: '<b aria-hidden="true">-</b>Negative',
      summary: "negative seller feedback",
    };
  }

  if (rating === "neutral") {
    return {
      className: "neutral",
      label: "Neutral",
      ariaLabel: "Neutral marketplace feedback",
      markup: '<b aria-hidden="true">•</b>Neutral',
      summary: "neutral seller feedback",
    };
  }

  return {
    className: "positive",
    label: "Positive",
    ariaLabel: "Positive marketplace feedback",
    markup: '<b aria-hidden="true">+</b>Positive',
    summary: "positive seller feedback",
  };
}

function getSafeImageUrls(images) {
  if (!Array.isArray(images)) return [];

  return images
    .map((imageUrl) => {
      try {
        const url = new URL(String(imageUrl || ""), window.location.href);
        return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
      } catch {
        return "";
      }
    })
    .filter(Boolean)
    .slice(0, 3);
}

function getBestListingImageUrl(imageUrl) {
  if (!imageUrl) return "";

  try {
    const url = new URL(String(imageUrl), window.location.href);
    const isEbayImage = /(^|\.)ebayimg\.com$/i.test(url.hostname);

    if (!["http:", "https:"].includes(url.protocol)) return "";

    if (isEbayImage) {
      url.pathname = url.pathname.replace(/\/s-l\d+(?=\.|\/)/gi, "/s-l1600");
    }

    return url.toString();
  } catch {
    return "";
  }
}

function getListingsLimit() {
  const limit = Number(listingsSection?.dataset.listingsLimit || LISTINGS_VISIBLE_LIMIT);

  return Number.isFinite(limit) && limit > 0 ? limit : LISTINGS_VISIBLE_LIMIT;
}

function getListingCategory(listing) {
  const text = `${listing?.title || ""} ${listing?.condition || ""} ${listing?.buyingOption || ""}`.toLowerCase();

  if (/\b(psa|cgc|bgs|graded|slab)\b/.test(text)) return "graded";
  if (/\b(sealed|booster box|elite trainer|etb|tin|blister|collection box)\b/.test(text)) return "sealed";
  if (/\b(bulk|lot|bundle|choose your lot|cards bulk)\b/.test(text)) return "bulk";

  return "singles";
}

function getFilteredListings(listings) {
  if (listingsFilter === "all") return listings;

  return listings.filter((listing) => getListingCategory(listing) === listingsFilter);
}

function updateListingFilterState(totalVisible, totalFiltered) {
  if (!listingsSection) return;

  const buttons = Array.from(listingsSection.querySelectorAll("[data-listings-filter]"));
  const countNode = listingsSection.querySelector("[data-listings-filter-count]");

  buttons.forEach((button) => {
    const isActive = button.getAttribute("data-listings-filter") === listingsFilter;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  if (countNode) {
    countNode.textContent = `${formatNumber(totalVisible)} shown from ${formatNumber(totalFiltered)} matching listing${totalFiltered === 1 ? "" : "s"}.`;
  }
}

function getTestimonialCardMarkup(testimonial, extraClassName = "") {
  const rating = getRatingMeta(testimonial);
  const images = getSafeImageUrls(testimonial.images);
  const source = escapeHtml(testimonial.source || "eBay");
  const imagesMarkup = images.length > 0
    ? `
      <div class="testimonial-images" aria-label="Public marketplace feedback images">
        ${images
          .map((imageUrl) => `
            <img
              src="${escapeHtml(imageUrl)}"
              alt=""
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
            >
          `)
          .join("")}
      </div>
    `
    : "";

  return `
    <article class="testimonial-card${extraClassName ? ` ${extraClassName}` : ""}">
      <div class="testimonial-card-header">
        <span>${escapeHtml(testimonial.label || "Verified eBay buyer")}</span>
        <strong class="testimonial-rating testimonial-rating-${rating.className}" aria-label="${escapeHtml(rating.ariaLabel)}">
          ${rating.markup}
        </strong>
      </div>
      ${imagesMarkup}
      <blockquote>${escapeHtml(testimonial.comment)}</blockquote>
      <p>Public ${rating.summary} through ${source}.</p>
    </article>
  `;
}

function getMergedTestimonials(ebayTestimonials) {
  const verifiedEbayTestimonials = Array.isArray(ebayTestimonials) ? ebayTestimonials : [];
  const featuredWhatnot = WHATNOT_TESTIMONIALS.slice(0, 4);
  const featuredEbay = verifiedEbayTestimonials.slice(0, 4);
  const fallbackWhatnot = WHATNOT_TESTIMONIALS.slice(featuredWhatnot.length);

  return [...featuredWhatnot, ...featuredEbay, ...fallbackWhatnot].slice(0, TESTIMONIAL_VISIBLE_LIMIT);
}

function updateTestimonialCarousel() {
  if (!testimonialCarousel || testimonialCarouselCount === 0) return;

  const track = testimonialCarousel.querySelector("[data-testimonial-track]");
  const dots = Array.from(testimonialCarousel.querySelectorAll("[data-testimonial-dot]"));
  const prevButton = testimonialCarousel.querySelector("[data-testimonial-prev]");
  const nextButton = testimonialCarousel.querySelector("[data-testimonial-next]");

  if (track) {
    track.style.setProperty("--testimonial-index", String(testimonialCarouselIndex));
  }

  dots.forEach((dot, index) => {
    const isActive = index === testimonialCarouselIndex;
    dot.classList.toggle("is-active", isActive);
    dot.setAttribute("aria-current", isActive ? "true" : "false");
  });

  if (prevButton) prevButton.disabled = testimonialCarouselCount < 2;
  if (nextButton) nextButton.disabled = testimonialCarouselCount < 2;
}

function stopTestimonialCarouselAutoplay() {
  if (!testimonialCarouselTimer) return;

  clearInterval(testimonialCarouselTimer);
  testimonialCarouselTimer = 0;
}

function shouldAutoAdvanceTestimonials() {
  return Boolean(
    testimonialCarousel &&
    testimonialCarouselCount > 1 &&
    !document.hidden
  );
}

function startTestimonialCarouselAutoplay() {
  stopTestimonialCarouselAutoplay();

  if (!shouldAutoAdvanceTestimonials()) return;

  testimonialCarouselTimer = window.setInterval(() => {
    if (shouldAutoAdvanceTestimonials()) {
      moveTestimonialCarousel(1);
    }
  }, TESTIMONIAL_AUTOPLAY_MS);
}

function moveTestimonialCarousel(direction) {
  if (testimonialCarouselCount < 2) return;

  testimonialCarouselIndex =
    (testimonialCarouselIndex + direction + testimonialCarouselCount) % testimonialCarouselCount;
  updateTestimonialCarousel();
}

function renderTestimonialCarousel(testimonials) {
  if (!testimonialCarousel) return;

  const track = testimonialCarousel.querySelector("[data-testimonial-track]");
  const dots = testimonialCarousel.querySelector("[data-testimonial-dots]");
  const prevButton = testimonialCarousel.querySelector("[data-testimonial-prev]");
  const nextButton = testimonialCarousel.querySelector("[data-testimonial-next]");

  if (!track || testimonials.length === 0) {
    testimonialCarousel.hidden = true;
    return;
  }

  testimonialCarousel.hidden = false;
  testimonialCarouselCount = testimonials.length;
  testimonialCarouselIndex = Math.min(testimonialCarouselIndex, testimonialCarouselCount - 1);
  track.style.setProperty("--testimonial-count", String(testimonialCarouselCount));
  track.innerHTML = testimonials
    .map((testimonial) => getTestimonialCardMarkup(testimonial, "testimonial-card-carousel"))
    .join("");

  if (dots) {
    dots.innerHTML = testimonials
      .map((_, index) => `
        <button
          type="button"
          aria-label="Show testimonial ${index + 1}"
          data-testimonial-dot
          data-testimonial-index="${index}"
        ></button>
      `)
      .join("");
  }

  if (prevButton && !prevButton.dataset.carouselBound) {
    prevButton.addEventListener("click", () => {
      moveTestimonialCarousel(-1);
      startTestimonialCarouselAutoplay();
    });
    prevButton.dataset.carouselBound = "true";
  }

  if (nextButton && !nextButton.dataset.carouselBound) {
    nextButton.addEventListener("click", () => {
      moveTestimonialCarousel(1);
      startTestimonialCarouselAutoplay();
    });
    nextButton.dataset.carouselBound = "true";
  }

  if (dots && !dots.dataset.carouselBound) {
    dots.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;

      const dot = event.target.closest("[data-testimonial-dot]");
      if (!dot) return;

      testimonialCarouselIndex = Number(dot.dataset.testimonialIndex || 0);
      updateTestimonialCarousel();
      startTestimonialCarouselAutoplay();
    });
    dots.dataset.carouselBound = "true";
  }

  updateTestimonialCarousel();
  startTestimonialCarouselAutoplay();
}

function getListingCardMarkup(listing) {
  const title = listing.title || "Vaulture eBay listing";
  const imageUrl = getBestListingImageUrl(listing.image);
  const imageMarkup = imageUrl
    ? `
      <img
        src="${escapeHtml(imageUrl)}"
        alt=""
        loading="lazy"
        decoding="async"
        referrerpolicy="no-referrer"
      >
    `
    : `<span class="listing-image-fallback">Vaulture</span>`;
  const condition = listing.condition || listing.buyingOption || "eBay listing";
  const buyingOption = listing.buyingOption || "View listing";

  return `
    <article class="listing-card">
      <a
        class="listing-card-link"
        href="${escapeHtml(listing.url)}"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="View ${escapeHtml(title)} on eBay"
      >
        <span class="listing-card-media">${imageMarkup}</span>
        <span class="listing-card-source">${escapeHtml(listing.source || "eBay")}</span>
        <h3>${escapeHtml(title)}</h3>
        <span class="listing-card-meta">${escapeHtml(condition)} · ${escapeHtml(buyingOption)}</span>
        <strong>${formatCurrency(listing.price)}</strong>
        <span class="listing-card-action">View on eBay</span>
      </a>
    </article>
  `;
}

function renderListings(feed) {
  if (!listingsSection) return;

  const feedNode = listingsSection.querySelector("[data-listings-feed]");
  const summaryNode = listingsSection.querySelector("[data-listings-summary]");
  const updatedNode = listingsSection.querySelector("[data-listings-updated]");
  listingsFeedCache = feed;

  const allListings = Array.isArray(feed?.listings)
    ? feed.listings
      .filter((listing) => listing?.url && listing?.title)
    : [];
  const filteredListings = getFilteredListings(allListings);
  const listings = filteredListings.slice(0, getListingsLimit());

  if (!feedNode) return;

  if (listings.length === 0) {
    listingsSection.classList.add("is-empty");
    if (summaryNode) {
      summaryNode.textContent = "Current public eBay listings appear below when available. Checkout stays on eBay.";
    }
    if (updatedNode) {
      updatedNode.textContent = "Only public eBay listing details are shown.";
    }
    feedNode.innerHTML = `
      <article class="listing-empty-card">
        <span>eBay store</span>
        <h3>${allListings.length > 0 ? "No listings match this filter." : "Current listings are loading."}</h3>
        <p>You can still browse the full Vaulture eBay store.</p>
        <a
          class="text-link"
          href="https://www.ebay.com.au/usr/vaultureau"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open eBay store
        </a>
      </article>
    `;
    updateListingFilterState(0, filteredListings.length);
    return;
  }

  listingsSection.classList.remove("is-empty");

  if (summaryNode) {
    const totalMatched = Number(feed?.summary?.totalMatched || listings.length);
    summaryNode.textContent = `${formatNumber(totalMatched)} current eBay listing${totalMatched === 1 ? "" : "s"} found for Vaulture. Checkout stays on eBay.`;
  }

  if (updatedNode) {
    updatedNode.textContent = "Only public eBay listing details are shown. Checkout stays on eBay.";
  }

  feedNode.innerHTML = listings.map((listing) => getListingCardMarkup(listing)).join("");
  updateListingFilterState(listings.length, filteredListings.length);
}

async function loadListings() {
  if (!listingsSection) return;

  try {
    const response = await fetch("data/listings-feed.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Listings feed unavailable.");

    renderListings(await response.json());
  } catch {
    renderListings({ listings: [], summary: {} });
  }
}

function renderRecentSales(recent) {
  const feed = document.querySelector("[data-sales-feed]");
  if (!feed) return;

  const sales = Array.isArray(recent) ? recent.slice(0, RECENT_ACTIVITY_VISIBLE_LIMIT) : [];

  if (sales.length === 0) {
    feed.innerHTML = `
      <article class="activity-empty-card">
        <span>Activity</span>
        <p>Anonymous purchase updates will appear here when available.</p>
      </article>
    `;
    return;
  }

  feed.innerHTML = sales
    .map((sale) => {
      const quantityLabel = Number(sale.quantity || 1) > 1 ? `${sale.quantity} items` : "1 item";

      return `
        <article class="recent-sale-card">
          <span>Anonymous purchase</span>
          <strong>${escapeHtml(sale.title || "a Vaulture eBay item")}</strong>
          <p>${quantityLabel} purchased through ${escapeHtml(sale.source || "eBay")}.</p>
        </article>
      `;
    })
    .join("");
}

function renderTestimonials(feed) {
  if (!testimonialsSection) return;

  const testimonialsList = testimonialsSection.querySelector("[data-testimonials-list]");
  const totalNode = testimonialsSection.querySelector("[data-testimonials-total]");
  const sourceNode = testimonialsSection.querySelector("[data-testimonials-source]");
  const ebayTestimonials = Array.isArray(feed?.testimonials)
    ? feed.testimonials
      .filter((testimonial) => testimonial && testimonial.comment)
    : [];
  const testimonials = getMergedTestimonials(ebayTestimonials);

  if (testimonials.length === 0) {
    testimonialsSection.hidden = true;
    if (testimonialCarousel) testimonialCarousel.hidden = true;
    return;
  }

  const summary = feed.summary || {};
  const ebayFeedbackCount = Number(summary.availableFeedback || summary.totalSynced || ebayTestimonials.length);
  const totalPublicReviews = ebayFeedbackCount + WHATNOT_PROFILE.reviewCount;

  testimonialsSection.hidden = false;

  if (totalNode) totalNode.textContent = formatNumber(totalPublicReviews);
  if (sourceNode) sourceNode.textContent = "eBay + Whatnot";

  renderTestimonialCarousel(testimonials);

  if (!testimonialsList) return;

  testimonialsList.innerHTML = testimonials
    .map((testimonial) => getTestimonialCardMarkup(testimonial))
    .join("");
}

async function loadTestimonials() {
  if (!testimonialsSection) return;

  try {
    const response = await fetch("data/testimonials.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Testimonials feed unavailable.");

    renderTestimonials(await response.json());
  } catch {
    renderTestimonials({ testimonials: [], summary: {} });
  }
}

async function loadSalesActivity() {
  if (!salesActivity) return;

  try {
    const response = await fetch("data/sales-feed.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Sales feed unavailable.");

    const feed = await response.json();
    const summary = feed.summary || {};
    const totalOrdersNode = document.querySelector("[data-sales-total-orders]");
    const monthCountNode = document.querySelector("[data-sales-month-count]");
    const totalItemsNode = document.querySelector("[data-sales-total-items]");
    const updatedNode = document.querySelector("[data-sales-updated]");
    const activityCards = Array.isArray(feed.recent)
      ? Math.min(feed.recent.length, RECENT_ACTIVITY_VISIBLE_LIMIT)
      : 0;

    if (totalOrdersNode) totalOrdersNode.textContent = formatNumber(summary.totalSales || summary.totalOrders);
    if (monthCountNode) monthCountNode.textContent = formatNumber(activityCards);
    if (totalItemsNode) totalItemsNode.textContent = formatNumber(summary.totalItems);

    if (updatedNode) {
      updatedNode.textContent = "Buyer details and order information stay private.";
    }

    renderRecentSales(feed.recent);
  } catch {
    renderRecentSales([]);
  }
}

if (navToggle && primaryNav) {
  navToggle.addEventListener("click", () => {
    setNavOpen(!primaryNav.classList.contains("is-open"));
  });

  primaryNav.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      setNavOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setNavOpen(false);
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 760) {
      setNavOpen(false);
    }
  });
}

sellForms.forEach((form) => initSellForm(form));

if (listingsSection) {
  listingsSection.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;

    const filterButton = event.target.closest("[data-listings-filter]");
    if (!filterButton) return;

    listingsFilter = filterButton.getAttribute("data-listings-filter") || "all";
    renderListings(listingsFeedCache || { listings: [], summary: {} });
  });
}

if (testimonialCarousel) {
  testimonialCarousel.addEventListener("mouseenter", stopTestimonialCarouselAutoplay);
  testimonialCarousel.addEventListener("mouseleave", startTestimonialCarouselAutoplay);
  testimonialCarousel.addEventListener("focusin", stopTestimonialCarouselAutoplay);
  testimonialCarousel.addEventListener("focusout", () => {
    window.setTimeout(() => {
      if (!testimonialCarousel.contains(document.activeElement)) {
        startTestimonialCarouselAutoplay();
      }
    }, 0);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopTestimonialCarouselAutoplay();
    } else {
      startTestimonialCarouselAutoplay();
    }
  });
}

function handleAnchorClick(event) {
  const link = event.currentTarget;

  if (!(link instanceof HTMLAnchorElement) || event.defaultPrevented) return;

  const target = getSamePageAnchorTarget(link);
  if (!target) return;

  event.preventDefault();
  setNavOpen(false);

  const targetTop = Math.max(
    target.getBoundingClientRect().top + window.scrollY - getScrollOffset(),
    0
  );

  history.pushState(null, "", link.hash);
  animateScrollTo(targetTop, () => {
    focusScrollTarget(target);
  });
}

anchorLinks.forEach((link) => {
  link.addEventListener("click", handleAnchorClick);
});

loadListings();
loadSalesActivity();
loadTestimonials();

if (sectionLinks.length > 0 && "IntersectionObserver" in window) {
  const sectionMap = new Map(
    sectionLinks
      .map((link) => [link.getAttribute("href"), link])
      .filter(([href]) => href && document.querySelector(href))
  );

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (!visible) return;

      sectionLinks.forEach((link) => link.removeAttribute("aria-current"));
      const activeLink = sectionMap.get(`#${visible.target.id}`);
      if (activeLink) {
        activeLink.setAttribute("aria-current", "true");
      }
    },
    {
      rootMargin: "-35% 0px -50% 0px",
      threshold: [0.1, 0.35, 0.6],
    }
  );

  sectionMap.forEach((_, href) => {
    const section = document.querySelector(href);
    if (section) observer.observe(section);
  });
}

updateHeaderState();
window.addEventListener("scroll", updateHeaderState, { passive: true });
