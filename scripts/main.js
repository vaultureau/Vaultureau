const navToggle = document.querySelector("[data-nav-toggle]");
const primaryNav = document.querySelector("[data-primary-nav]");
const siteHeader = document.querySelector("[data-site-header]");
const yearNodes = document.querySelectorAll("[data-current-year]");
const sellForm = document.querySelector(".sell-form");
const sellingGroup = document.querySelector("[data-selling-group]");
const sellingCheckboxes = Array.from(document.querySelectorAll('input[name="selling[]"]'));
const salesActivity = document.querySelector("[data-sales-activity]");
const sectionLinks = primaryNav
  ? Array.from(primaryNav.querySelectorAll('a[href^="#"]'))
  : [];
const anchorLinks = Array.from(document.querySelectorAll('a[href*="#"]'));
let activeScrollAnimation = 0;
let restoreScrollBehavior = null;

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

function validateSellingGroup(showMessage) {
  if (!sellingGroup || sellingCheckboxes.length === 0) return true;

  const hasSelection = sellingCheckboxes.some((checkbox) => checkbox.checked);
  sellingCheckboxes[0].setCustomValidity(
    hasSelection ? "" : "Select at least one collection category."
  );
  sellingGroup.classList.toggle("is-invalid", showMessage && !hasSelection);

  return hasSelection;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-AU").format(Number(value || 0));
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

function formatRelativeTime(dateValue) {
  const date = new Date(dateValue);
  const diffMs = date.getTime() - Date.now();
  const units = [
    ["year", 31536000000],
    ["month", 2592000000],
    ["week", 604800000],
    ["day", 86400000],
    ["hour", 3600000],
    ["minute", 60000],
  ];

  if (Number.isNaN(date.getTime())) return "recently";

  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms || unit === "minute") {
      return new Intl.RelativeTimeFormat("en-AU", { numeric: "auto" }).format(Math.round(diffMs / ms), unit);
    }
  }

  return "recently";
}

function formatMonthLabel(monthValue) {
  const [year, month] = String(monthValue || "").split("-").map(Number);
  if (!year || !month) return "Month";

  return new Intl.DateTimeFormat("en-AU", {
    month: "short",
    year: "2-digit",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function renderSalesChart(monthly) {
  const chart = document.querySelector("[data-sales-chart]");
  if (!chart) return;

  const months = Array.isArray(monthly) ? monthly.slice(-24) : [];

  if (months.length === 0) {
    chart.innerHTML = '<p class="activity-empty">Waiting for the first eBay sync.</p>';
    return;
  }

  const maxOrders = Math.max(...months.map((month) => Number(month.orders || 0)), 1);
  chart.style.setProperty("--chart-columns", String(Math.max(months.length, 6)));
  chart.innerHTML = months
    .map((month) => {
      const orders = Number(month.orders || 0);
      const height = Math.max(orders / maxOrders * 100, orders > 0 ? 8 : 0);
      const monthKey = String(month.month || "month");
      const label = formatMonthLabel(monthKey);

      return `
        <div class="sales-chart-bar" style="--bar-height: ${height.toFixed(2)}" aria-label="${orders} orders in ${escapeHtml(label)}">
          <span></span>
          <small>${escapeHtml(label)}</small>
        </div>
      `;
    })
    .join("");
}

function renderRecentSales(recent) {
  const feed = document.querySelector("[data-sales-feed]");
  if (!feed) return;

  const sales = Array.isArray(recent) ? recent.slice(0, 6) : [];

  if (sales.length === 0) {
    feed.innerHTML = `
      <article class="activity-empty-card">
        <span>Sync ready</span>
        <p>Anonymous purchase updates will appear here after GitHub Actions pulls your eBay orders.</p>
      </article>
    `;
    return;
  }

  feed.innerHTML = sales
    .map((sale) => {
      const quantityLabel = Number(sale.quantity || 1) > 1 ? `${sale.quantity} items` : "1 item";

      return `
        <article class="recent-sale-card">
          <span>Anonymous buyer - ${formatRelativeTime(sale.soldAt)}</span>
          <strong>${escapeHtml(sale.title || "a Vaulture eBay item")}</strong>
          <p>${quantityLabel} purchased through ${escapeHtml(sale.source || "eBay")}.</p>
        </article>
      `;
    })
    .join("");
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
    const activeMonths = Array.isArray(feed.monthly)
      ? feed.monthly.filter((month) => Number(month.orders || 0) > 0).length
      : 0;

    if (totalOrdersNode) totalOrdersNode.textContent = formatNumber(summary.totalOrders);
    if (monthCountNode) monthCountNode.textContent = formatNumber(activeMonths);
    if (totalItemsNode) totalItemsNode.textContent = formatNumber(summary.totalItems);

    if (updatedNode && feed.updatedAt) {
      const rangeDays = feed.range?.requestedDays;
      const rangeLabel = rangeDays ? ` Synced from the available eBay history window of up to ${formatNumber(rangeDays)} days.` : "";
      updatedNode.textContent = `Updated ${formatRelativeTime(feed.updatedAt)}.${rangeLabel} Buyer details and order information stay private.`;
    }

    renderSalesChart(feed.monthly || feed.weekly);
    renderRecentSales(feed.recent);
  } catch {
    renderSalesChart([]);
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

sellingCheckboxes.forEach((checkbox) => {
  checkbox.addEventListener("change", () => {
    validateSellingGroup(false);
  });
});

if (sellForm) {
  sellForm.addEventListener("submit", (event) => {
    if (!validateSellingGroup(true)) {
      event.preventDefault();
      sellingCheckboxes[0].reportValidity();
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

loadSalesActivity();

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
