let meetings = [];
const state = { query: "", series: "all", toastTimer: null };

const elements = {
  list: document.querySelector("#meeting-list"),
  count: document.querySelector("#meeting-count"),
  search: document.querySelector("#meeting-search"),
  filter: document.querySelector("#series-filter"),
  themeToggle: document.querySelector("#theme-toggle"),
  mobileMenu: document.querySelector("#mobile-menu"),
  primaryNav: document.querySelector(".primary-nav")
};

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[character]);
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons({ attrs: { "aria-hidden": "true" } });
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.classList.add("visible");
  state.toastTimer = setTimeout(() => toast.classList.remove("visible"), 2400);
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("ethlens-theme", theme);
  const isDark = theme === "dark";
  elements.themeToggle.setAttribute("aria-label", isDark ? "切换浅色模式" : "切换深色模式");
  elements.themeToggle.innerHTML = `<i data-lucide="${isDark ? "sun" : "moon"}" aria-hidden="true"></i>`;
  refreshIcons();
}

function providerLabels(meeting) {
  return (meeting.videoProviders || ["local"]).map(provider => provider === "bilibili" ? "B 站" : "本地 MP4");
}

function renderFilters() {
  const series = ["all", ...new Set(meetings.map(meeting => meeting.series).filter(Boolean))];
  elements.filter.innerHTML = series.map(value => `
    <button type="button" class="filter-button${state.series === value ? " active" : ""}" data-series="${escapeHtml(value)}" aria-pressed="${state.series === value}">
      ${value === "all" ? "全部" : escapeHtml(value)}
    </button>
  `).join("");
  elements.filter.querySelectorAll("[data-series]").forEach(button => {
    button.addEventListener("click", () => {
      state.series = button.dataset.series;
      renderFilters();
      renderMeetings();
    });
  });
}

function getVisibleMeetings() {
  const query = state.query.trim().toLocaleLowerCase();
  return meetings.filter(meeting => {
    if (state.series !== "all" && meeting.series !== state.series) return false;
    if (!query) return true;
    return [meeting.title, meeting.subtitle, meeting.series, meeting.number, meeting.dateLabel]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query);
  });
}

function renderMeetings() {
  const visibleMeetings = getVisibleMeetings();
  elements.count.textContent = String(visibleMeetings.length);

  if (!visibleMeetings.length) {
    elements.list.innerHTML = '<div class="archive-empty"><strong>没有匹配的会议</strong><span>换一个关键词或清除筛选条件。</span></div>';
    return;
  }

  elements.list.innerHTML = visibleMeetings.map(meeting => `
    <article class="meeting-card">
      <div class="meeting-card-index">${escapeHtml(meeting.series || "CALL")}</div>
      <div class="meeting-card-content">
        <div class="meeting-card-topline">
          <span>${escapeHtml(meeting.dateLabel || meeting.date || "日期待定")}</span>
          <span class="meeting-card-status"><span class="health-dot" aria-hidden="true"></span>${meeting.translationStatus === "reviewed" ? "译文已校对" : "译文处理中"}</span>
        </div>
        <h2>${escapeHtml(meeting.title)}</h2>
        <p>${escapeHtml(meeting.subtitle || "Ethereum 协议会议")}</p>
        <div class="meeting-card-meta">
          <span>第 ${escapeHtml(meeting.number)} 次</span>
          <span>${providerLabels(meeting).map(escapeHtml).join(" · ")}</span>
        </div>
      </div>
      <a class="meeting-card-open" href="/meetings/${encodeURIComponent(meeting.slug)}" aria-label="打开 ${escapeHtml(meeting.title)}">
        <i data-lucide="arrow-up-right" aria-hidden="true"></i>
      </a>
    </article>
  `).join("");
  refreshIcons();
}

async function loadMeetings() {
  const response = await fetch("/data/meetings/index.json");
  if (!response.ok) throw new Error("Meeting index could not be loaded");
  meetings = await response.json();
  meetings.sort((a, b) => String(b.date).localeCompare(String(a.date)) || Number(b.number) - Number(a.number));
  renderFilters();
  renderMeetings();
}

function bindEvents() {
  elements.search.addEventListener("input", event => {
    state.query = event.target.value;
    renderMeetings();
  });

  elements.themeToggle.addEventListener("click", () => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });

  elements.mobileMenu.addEventListener("click", () => {
    const isOpen = elements.primaryNav.classList.toggle("mobile-open");
    elements.mobileMenu.setAttribute("aria-expanded", String(isOpen));
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") elements.primaryNav.classList.remove("mobile-open");
  });
}

async function initialize() {
  const savedTheme = localStorage.getItem("ethlens-theme");
  const preferredTheme = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  setTheme(savedTheme || preferredTheme);
  bindEvents();

  try {
    await loadMeetings();
  } catch {
    elements.count.textContent = "0";
    elements.list.innerHTML = '<div class="archive-empty"><strong>会议目录读取失败</strong><span>请确认 data/meetings/index.json 仍然存在。</span></div>';
    showToast("会议目录读取失败");
  }
  refreshIcons();
}

initialize();
