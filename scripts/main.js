const navToggle = document.querySelector("[data-nav-toggle]");
const primaryNav = document.querySelector("[data-primary-nav]");
const siteHeader = document.querySelector("[data-site-header]");
const yearNodes = document.querySelectorAll("[data-current-year]");
const sellForm = document.querySelector(".sell-form");
const sellingGroup = document.querySelector("[data-selling-group]");
const sellingCheckboxes = Array.from(document.querySelectorAll('input[name="selling[]"]'));
const sectionLinks = primaryNav
  ? Array.from(primaryNav.querySelectorAll('a[href^="#"]'))
  : [];

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

function validateSellingGroup(showMessage) {
  if (!sellingGroup || sellingCheckboxes.length === 0) return true;

  const hasSelection = sellingCheckboxes.some((checkbox) => checkbox.checked);
  sellingCheckboxes[0].setCustomValidity(
    hasSelection ? "" : "Select at least one collection category."
  );
  sellingGroup.classList.toggle("is-invalid", showMessage && !hasSelection);

  return hasSelection;
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
