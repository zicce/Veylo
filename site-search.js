(() => {
  const FILTERS = [
    { value: "all", label: "Everywhere" },
    { value: "products", label: "Products" },
    { value: "pages", label: "Pages" },
  ];

  const SEARCH_ITEMS = [
    {
      type: "page",
      label: "Page",
      title: "Home",
      url: "/",
      keywords: ["aven", "home", "main", "landing", "disconnect"],
      weight: 120,
    },
    {
      type: "page",
      label: "Page",
      title: "Store",
      url: "/store/",
      keywords: ["store", "shop", "products", "catalog", "buy"],
      weight: 110,
    },
    {
      type: "page",
      label: "Page",
      title: "Reviews",
      url: "/reviews/",
      keywords: ["reviews", "vouches", "feedback", "opinions"],
      weight: 100,
    },
    {
      type: "page",
      label: "Page",
      title: "Status",
      url: "/status/",
      keywords: ["status", "undetected", "in stock", "products"],
      weight: 95,
    },
    {
      type: "page",
      label: "Page",
      title: "Forum",
      url: "/forum/",
      keywords: ["forum", "info", "information", "guides"],
      weight: 90,
    },
    {
      type: "product",
      label: "Product",
      title: "Valorant External",
      url: "/store/product/valorant-external/",
      keywords: ["valorant", "external", "cheat", "aim", "esp"],
      weight: 130,
    },
    {
      type: "product",
      label: "Product",
      title: "Valorant XRay",
      url: "/store/product/valorant-xray/",
      keywords: ["valorant", "xray", "wallhack", "vision"],
      weight: 125,
    },
    {
      type: "product",
      label: "Product",
      title: "HWID Spoofer",
      url: "/store/product/hwid-spoofer/",
      keywords: ["hwid", "spoofer", "spoof", "bypass"],
      weight: 122,
    },
    {
      type: "product",
      label: "Product",
      title: "Valorant Accounts",
      url: "/store/product/valorant-accounts/",
      keywords: ["valorant", "accounts", "ranked", "account"],
      weight: 121,
    },
    {
      type: "page",
      label: "Page",
      title: "Valorant Category",
      url: "/store/category/valorant/",
      keywords: ["valorant", "category", "store", "products"],
      weight: 85,
    },
    {
      type: "page",
      label: "Page",
      title: "HWID Spoofer Category",
      url: "/store/category/hwid-spoofer/",
      keywords: ["hwid", "spoofer", "category", "store"],
      weight: 84,
    },
    {
      type: "page",
      label: "Page",
      title: "Accounts Category",
      url: "/store/category/accounts/",
      keywords: ["accounts", "valorant", "category", "store"],
      weight: 83,
    },
    {
      type: "page",
      label: "Page",
      title: "Valorant Information",
      url: "/valorant-hacks-cheats-aimbot-esp/",
      keywords: ["valorant", "info", "information", "guide", "forum"],
      weight: 88,
    },
    {
      type: "page",
      label: "Page",
      title: "HWID Spoofer Information",
      url: "/hwid-spoofer/",
      keywords: ["hwid", "spoofer", "info", "information", "forum"],
      weight: 87,
    },
    {
      type: "page",
      label: "Page",
      title: "Contact",
      url: "/contact/",
      keywords: ["contact", "support", "discord", "help"],
      weight: 80,
    },
    {
      type: "page",
      label: "Page",
      title: "Cookies",
      url: "/cookies/",
      keywords: ["cookies", "privacy", "policy"],
      weight: 70,
    },
    {
      type: "page",
      label: "Page",
      title: "Terms",
      url: "/terms/",
      keywords: ["terms", "tos", "policy", "rules"],
      weight: 69,
    },
  ];

  const STYLE_ID = "dc-site-search-style";
  const MAX_RESULTS = 6;

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function scoreItem(item, queryTerms, rawQuery) {
    if (!queryTerms.length) {
      return item.weight;
    }

    const title = normalize(item.title);
    const haystack = normalize([item.title].concat(item.keywords || []).join(" "));
    let score = 0;

    for (const term of queryTerms) {
      if (!haystack.includes(term)) {
        return -1;
      }

      if (title === term) {
        score += 150;
      } else if (title.startsWith(term)) {
        score += 100;
      } else if (title.includes(term)) {
        score += 70;
      } else {
        score += 30;
      }
    }

    if (rawQuery && title.startsWith(rawQuery)) {
      score += 40;
    } else if (rawQuery && title.includes(rawQuery)) {
      score += 20;
    }

    return score + item.weight;
  }

  function matchesFilter(item, filterValue) {
    if (filterValue === "products") {
      return item.type === "product";
    }
    if (filterValue === "pages") {
      return item.type === "page";
    }
    return true;
  }

  function createSuggestionElement(item, isActive) {
    const link = document.createElement("a");
    link.className = "dcSearchSuggestions__item";
    if (isActive) {
      link.classList.add("is-active");
    }
    link.href = item.url;

    const meta = document.createElement("span");
    meta.className = "dcSearchSuggestions__meta";
    meta.textContent = item.label;

    const title = document.createElement("span");
    title.className = "dcSearchSuggestions__title";
    title.textContent = item.title;

    link.appendChild(meta);
    link.appendChild(title);
    return link;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      "#elSearchWrapper, #elSearch { overflow: visible !important; }",
      "#elSearch form { position: relative; }",
      ".dcSearchSuggestions { position: absolute; left: 0; right: 0; top: calc(100% + 8px); z-index: 1200; display: none; background: #1A1D24; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; box-shadow: 0 18px 40px rgba(0,0,0,0.35); overflow: hidden; }",
      ".dcSearchSuggestions.is-open { display: block; }",
      ".dcSearchSuggestions__item, .dcSearchSuggestions__empty { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; color: #ffffff; text-decoration: none; }",
      ".dcSearchSuggestions__item + .dcSearchSuggestions__item { border-top: 1px solid rgba(255,255,255,0.06); }",
      ".dcSearchSuggestions__item:hover, .dcSearchSuggestions__item.is-active { background: rgba(253,122,18,0.12); }",
      ".dcSearchSuggestions__meta { color: #fd7a12; font-size: 12px; font-weight: 600; flex: 0 0 auto; }",
      ".dcSearchSuggestions__title { color: #ffffff; font-size: 14px; font-weight: 500; text-align: right; flex: 1 1 auto; }",
      ".dcSearchSuggestions__empty { color: #939cb1; justify-content: center; }",
    ].join("");
    document.head.appendChild(style);
  }

  function detectDefaultFilter(form) {
    const selected = form.querySelector("input[name='type']:checked");
    const value = selected ? String(selected.value || "") : "";

    if (value === "nexus_package_item" || value.indexOf("nexus_package_item") !== -1) {
      return "products";
    }
    if (value === "cms_pages_pageitem") {
      return "pages";
    }
    return "all";
  }

  function rewriteFilterMenu(form, currentFilter) {
    const details = form.querySelector(".cSearchFilter");
    const summary = details ? details.querySelector(".cSearchFilter__text") : null;
    const menu = details ? details.querySelector(".cSearchFilter__menu") : null;

    if (!details || !summary || !menu) {
      return null;
    }

    summary.textContent = FILTERS.find((filter) => filter.value === currentFilter).label;
    menu.innerHTML = "";

    FILTERS.forEach((filter) => {
      const item = document.createElement("li");
      const label = document.createElement("label");
      const radio = document.createElement("input");
      const text = document.createElement("span");

      radio.type = "radio";
      radio.name = "type";
      radio.value = filter.value;
      radio.checked = filter.value === currentFilter;

      text.className = "cSearchFilter__menuText";
      text.textContent = filter.label;

      label.appendChild(radio);
      label.appendChild(text);
      item.appendChild(label);
      menu.appendChild(item);
    });

    return { details, summary, menu };
  }

  function initSearchForm(form) {
    const input = form.querySelector("input[type='search'][name='q']");
    if (!input) {
      return;
    }

    const defaultFilter = detectDefaultFilter(form);
    const filterUi = rewriteFilterMenu(form, defaultFilter);
    if (!filterUi) {
      return;
    }

    const panel = document.createElement("div");
    panel.className = "dcSearchSuggestions";
    form.appendChild(panel);

    const state = {
      filter: defaultFilter,
      activeIndex: -1,
      results: [],
    };

    function renderSuggestions() {
      const rawQuery = normalize(input.value);
      const queryTerms = rawQuery ? rawQuery.split(/\s+/).filter(Boolean) : [];

      state.results = SEARCH_ITEMS
        .filter((item) => matchesFilter(item, state.filter))
        .map((item) => ({
          item,
          score: scoreItem(item, queryTerms, rawQuery),
        }))
        .filter((entry) => entry.score >= 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, MAX_RESULTS)
        .map((entry) => entry.item);

      panel.innerHTML = "";

      if (!state.results.length) {
        if (!rawQuery) {
          panel.classList.remove("is-open");
          return;
        }

        const empty = document.createElement("div");
        empty.className = "dcSearchSuggestions__empty";
        empty.textContent = "No results found";
        panel.appendChild(empty);
        panel.classList.add("is-open");
        return;
      }

      if (state.activeIndex >= state.results.length) {
        state.activeIndex = -1;
      }

      state.results.forEach((result, index) => {
        const suggestion = createSuggestionElement(result, index === state.activeIndex);
        suggestion.dataset.index = String(index);
        panel.appendChild(suggestion);
      });

      panel.classList.add("is-open");
    }

    function hideSuggestions() {
      panel.classList.remove("is-open");
      state.activeIndex = -1;
    }

    function syncSummary() {
      const selected = FILTERS.find((filter) => filter.value === state.filter);
      filterUi.summary.textContent = selected ? selected.label : "Everywhere";
    }

    function goToResult(index) {
      const result = state.results[index];
      if (!result) {
        return;
      }
      window.location.href = result.url;
    }

    filterUi.menu.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }

      state.filter = target.value;
      state.activeIndex = -1;
      syncSummary();
      filterUi.details.open = false;
      renderSuggestions();
      input.focus();
    });

    input.addEventListener("focus", () => {
      if (!normalize(input.value)) {
        hideSuggestions();
        return;
      }
      renderSuggestions();
    });

    input.addEventListener("input", () => {
      state.activeIndex = -1;
      renderSuggestions();
    });

    input.addEventListener("keydown", (event) => {
      if (!panel.classList.contains("is-open") && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        renderSuggestions();
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!state.results.length) {
          return;
        }
        state.activeIndex = (state.activeIndex + 1) % state.results.length;
        renderSuggestions();
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (!state.results.length) {
          return;
        }
        state.activeIndex = state.activeIndex <= 0 ? state.results.length - 1 : state.activeIndex - 1;
        renderSuggestions();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (state.activeIndex >= 0) {
          goToResult(state.activeIndex);
          return;
        }
        if (state.results.length) {
          goToResult(0);
        }
        return;
      }

      if (event.key === "Escape") {
        hideSuggestions();
        filterUi.details.open = false;
      }
    });

    panel.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const suggestion = target.closest(".dcSearchSuggestions__item");
      if (!suggestion) {
        return;
      }

      event.preventDefault();
      const index = Number(suggestion.getAttribute("data-index"));
      if (!Number.isNaN(index)) {
        goToResult(index);
      }
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (state.activeIndex >= 0) {
        goToResult(state.activeIndex);
        return;
      }
      if (state.results.length) {
        goToResult(0);
      }
    });

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof Node && !form.contains(target)) {
        hideSuggestions();
      }
    });

    syncSummary();
  }

  function init() {
    ensureStyle();
    document.querySelectorAll("#elSearch form").forEach(initSearchForm);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
