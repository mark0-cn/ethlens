let transcript = [];
let meeting = null;
let meetingBaseUrl = null;
let videoAdapter = null;
let videoSources = [];

const state = {
  activeIndex: -1,
  followPlayback: true,
  initialSeekApplied: false,
  language: "bilingual",
  search: "",
  transcriptReady: false,
  toastTimer: null
};

const elements = {
  displayTime: document.querySelector("#display-time"),
  followPlayback: document.querySelector("#follow-playback"),
  mobileMenu: document.querySelector("#mobile-menu"),
  primaryNav: document.querySelector(".primary-nav"),
  returnLive: document.querySelector("#return-live"),
  searchCount: document.querySelector("#search-count"),
  themeToggle: document.querySelector("#theme-toggle"),
  toast: document.querySelector("#toast"),
  transcriptList: document.querySelector("#transcript-list"),
  transcriptSearch: document.querySelector("#transcript-search"),
  video: document.querySelector("#meeting-video"),
  frame: document.querySelector("#meeting-frame"),
  videoDuration: document.querySelector("#video-duration"),
  videoError: document.querySelector("#video-error"),
  videoLoading: document.querySelector("#video-loading"),
  videoErrorTitle: document.querySelector("#video-error-title"),
  videoErrorMessage: document.querySelector("#video-error-message"),
  videoOpenExternal: document.querySelector("#video-open-external"),
  videoSyncStatus: document.querySelector("#video-sync-status"),
  videoSourceControl: document.querySelector("#video-source-control"),
  currentTopic: document.querySelector("#current-topic"),
  meetingKicker: document.querySelector("#meeting-kicker"),
  meetingTitle: document.querySelector("#meeting-title"),
  meetingSubtitle: document.querySelector("#meeting-subtitle"),
  meetingDate: document.querySelector("#meeting-date"),
  meetingAgenda: document.querySelector("#meeting-agenda"),
  translationHealthLabel: document.querySelector("#translation-health-label"),
  meetingSummary: document.querySelector("#meeting-summary"),
  summaryToggle: document.querySelector("#summary-toggle"),
  summaryTitle: document.querySelector("#summary-title"),
  summaryBadge: document.querySelector("#summary-badge"),
  summaryStats: document.querySelector("#summary-stats"),
  summaryContent: document.querySelector("#summary-content")
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlight(value, query) {
  const escaped = escapeHtml(value);
  if (!query) return escaped;
  return escaped.replace(new RegExp(`(${escapeRegExp(query)})`, "gi"), "<mark>$1</mark>");
}

function parseTimecode(timecode) {
  const match = /^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/.exec(timecode.trim());
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
}

function formatTime(seconds, includeHours = true) {
  const safeSeconds = Number.isFinite(seconds) && seconds >= 0 ? seconds : 0;
  const totalSeconds = Math.floor(safeSeconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (!includeHours && hours === 0) {
    return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function cleanCaption(text) {
  return String(text || "")
    .replace(/<[^>]+>/g, "")
    .replace(/^>>\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSrt(text) {
  return text
    .replace(/\r/g, "")
    .trim()
    .split(/\n\n+/)
    .flatMap(block => {
      const lines = block.split("\n");
      const id = Number(lines[0]?.trim());
      const timing = lines[1]?.trim().match(/^(\d{2}:\d{2}:\d{2},\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2},\d{3})/);
      if (!Number.isFinite(id) || !timing) return [];

      const rawText = lines.slice(2).join(" ").trim();
      return [{
        id,
        startSeconds: parseTimecode(timing[1]),
        endSeconds: parseTimecode(timing[2]),
        rawText,
        text: cleanCaption(rawText)
      }];
    });
}

function getMeetingSlug() {
  const querySlug = new URLSearchParams(window.location.search).get("meeting");
  const routeMatch = /^\/meetings\/([^/]+)\/?$/.exec(window.location.pathname);
  return decodeURIComponent(querySlug || routeMatch?.[1] || "acde-241");
}

function resolveAsset(path) {
  return new URL(path, meetingBaseUrl).href;
}

async function loadMeeting() {
  const indexResponse = await fetch("/data/meetings/index.json");
  if (!indexResponse.ok) throw new Error("Meeting index could not be loaded");
  const index = await indexResponse.json();
  const entry = index.find(item => item.slug === getMeetingSlug());
  if (!entry?.manifest) throw new Error("Meeting was not found");

  const manifestUrl = new URL(entry.manifest, `${window.location.origin}/`);
  const manifestResponse = await fetch(manifestUrl.href);
  if (!manifestResponse.ok) throw new Error("Meeting manifest could not be loaded");
  meeting = await manifestResponse.json();
  meetingBaseUrl = new URL("./", manifestUrl.href);
  document.title = `EthLens · ${meeting.title}`;
  renderMeetingMetadata();
}

function renderMeetingMetadata() {
  elements.meetingKicker.textContent = meeting.kicker || `${meeting.series || "ETHEREUM"} PROTOCOL CALL`;
  elements.meetingTitle.textContent = meeting.title;
  elements.meetingSubtitle.textContent = meeting.subtitle || "Ethereum 协议会议";
  elements.meetingDate.textContent = meeting.dateLabel || meeting.date || "日期待定";
  elements.currentTopic.textContent = meeting.topic || "协议进展";
  elements.meetingAgenda.hidden = !meeting.agendaUrl;
  if (meeting.agendaUrl) elements.meetingAgenda.href = meeting.agendaUrl;
  elements.translationHealthLabel.textContent = meeting.translationStatus === "reviewed" ? "译文已校对" : "译文处理中";
  renderMeetingSummary();
}

function renderSummaryText(item) {
  let text = escapeHtml(item.text || "");

  if (item.link?.href) {
    const label = escapeHtml(item.link.label || item.link.href);
    const link = `<a class="summary-link" href="${escapeHtml(item.link.href)}" target="_blank" rel="noreferrer">${label}</a>`;
    text = text.includes(label) ? text.replace(label, link) : `${link} ${text}`;
  }

  if (item.status) {
    const status = escapeHtml(item.status);
    const badge = `<span class="summary-item-status">${status}</span>`;
    text = text.includes(status) ? text.replace(status, badge) : `${text} ${badge}`;
  }

  if (item.date) {
    text += ` <span class="summary-target-date">${escapeHtml(item.date)}</span>`;
  }

  return text;
}

function renderSummaryItem(item) {
  const owner = item.owner ? `<span class="summary-owner">${escapeHtml(item.owner)}：</span>` : "";
  const seek = Number(item.seek);
  const hasSeek = Number.isFinite(seek);
  const timestamp = hasSeek ? `<span class="summary-time">${formatTime(seek)}</span>` : "";
  const seekAttributes = hasSeek
    ? ` data-summary-seek="${seek}" tabindex="0" role="button" aria-label="跳转到 ${formatTime(seek)}"`
    : "";

  return `
    <li class="summary-item"${seekAttributes}>
      <span class="summary-item-text">${owner}${renderSummaryText(item)}</span>${timestamp}
    </li>
  `;
}

function renderSummaryHighlightSection(section) {
  return `
    <div class="summary-section" data-summary-kind="highlights">
      <h3>${escapeHtml(section.title || "Highlights")}</h3>
      <ul class="summary-list summary-highlights-list">${(section.items || []).map(renderSummaryItem).join("")}</ul>
    </div>
  `;
}

function renderSummarySideSection(section) {
  const kind = section.kind || "actions";
  const wrapperClass = kind === "decisions" ? "summary-side-card" : "summary-side-section";
  return `
    <div class="${wrapperClass}" data-summary-kind="${escapeHtml(kind)}">
      <h3>${escapeHtml(section.title || "")}</h3>
      <ul class="summary-list summary-side-list">${(section.items || []).map(renderSummaryItem).join("")}</ul>
    </div>
  `;
}

function setSummaryExpanded(expanded) {
  elements.summaryToggle.setAttribute("aria-expanded", String(expanded));
  elements.summaryContent.hidden = !expanded;
  elements.meetingSummary.classList.toggle("expanded", expanded);
}

function renderMeetingSummary() {
  const summary = meeting.summary;
  if (!summary?.sections?.length) {
    elements.meetingSummary.hidden = true;
    return;
  }

  const counts = summary.counts || {};
  elements.summaryTitle.textContent = summary.title || "Summary";
  elements.summaryStats.textContent = `${counts.highlights || 0} 个要点 · ${counts.decisions || 0} 项决策 · ${counts.actionItems || 0} 个行动项`;
  elements.summaryBadge.hidden = !summary.badge;
  elements.summaryBadge.textContent = summary.badge || "";
  const highlights = summary.sections.filter(section => (section.kind || "highlights") === "highlights");
  const sideSections = summary.sections.filter(section => (section.kind || "highlights") !== "highlights");
  elements.summaryContent.innerHTML = `
    <div class="summary-content-inner">
      <div class="summary-layout">
        <div class="summary-highlights-column">
          <div class="summary-highlights-stack">${highlights.map(renderSummaryHighlightSection).join("")}</div>
        </div>
        <div class="summary-side-column">
          <div class="summary-side-stack">${sideSections.map(renderSummarySideSection).join("")}</div>
        </div>
      </div>
    </div>
  `;
  elements.meetingSummary.hidden = false;
  setSummaryExpanded(Boolean(summary.defaultExpanded));
  refreshIcons();
}

async function loadTranscript() {
  const subtitleUrls = {
    en: resolveAsset(meeting.subtitles.en),
    zh: meeting.subtitles.zh ? resolveAsset(meeting.subtitles.zh) : null
  };
  const responses = await Promise.all([
    fetch(subtitleUrls.en),
    subtitleUrls.zh ? fetch(subtitleUrls.zh) : Promise.resolve(null)
  ]);
  if (!responses[0].ok || (responses[1] && !responses[1].ok)) {
    throw new Error("Subtitle files could not be loaded");
  }

  const englishCues = parseSrt(await responses[0].text());
  const chineseCues = responses[1] ? parseSrt(await responses[1].text()) : [];
  const chineseById = new Map(chineseCues.map(cue => [cue.id, cue]));

  transcript = englishCues.map(englishCue => {
    const chineseCue = chineseById.get(englishCue.id);
    return {
      id: englishCue.id,
      startSeconds: englishCue.startSeconds,
      endSeconds: englishCue.endSeconds,
      display: formatTime(englishCue.startSeconds),
      en: englishCue.text,
      zh: chineseCue?.text || "",
      speakerChanged: englishCue.rawText.trim().startsWith(">>")
    };
  }).filter(segment => segment.en || segment.zh);

  state.transcriptReady = true;
}

function getVideoSource(provider) {
  return videoSources.find(source => source.provider === provider);
}

function getBilibiliUrl(source) {
  if (source.url) return source.url;
  if (!source.bvid) return "";
  const page = Number(source.page) > 0 ? Number(source.page) : 1;
  return `https://www.bilibili.com/video/${encodeURIComponent(source.bvid)}?p=${page}`;
}

function getBilibiliEmbedUrl(source, startTime = 0) {
  const page = Number(source.page) > 0 ? Number(source.page) : 1;
  const params = new URLSearchParams({
    bvid: source.bvid,
    page: String(page),
    autoplay: "0",
    danmaku: "0"
  });
  if (Number.isFinite(startTime) && startTime > 0) params.set("t", String(Math.floor(startTime)));
  return `https://player.bilibili.com/player.html?${params.toString()}`;
}

class LocalVideoAdapter {
  constructor(video, frame) {
    this.provider = "local";
    this.video = video;
    this.frame = frame;
  }

  mount(source) {
    this.frame.hidden = true;
    this.frame.src = "about:blank";
    this.video.hidden = false;
    this.video.src = resolveAsset(source.src);
    this.video.load();
  }

  getCurrentTime() {
    return this.video.currentTime || 0;
  }

  getDuration() {
    return Number.isFinite(this.video.duration) ? this.video.duration : 0;
  }

  seek(seconds) {
    this.video.currentTime = seconds;
  }

  play() {
    return this.video.play();
  }

  pause() {
    this.video.pause();
  }

  destroy() {
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
  }
}

class BilibiliVideoAdapter {
  constructor(frame, onTimeUpdate) {
    this.provider = "bilibili";
    this.frame = frame;
    this.currentTime = 0;
    this.duration = 0;
    this.source = null;
    this.onTimeUpdate = onTimeUpdate;
    this.messageHandler = event => {
      if (this.frame.contentWindow && event.source !== this.frame.contentWindow) return;
      const data = typeof event.data === "string" ? this.parseMessage(event.data) : event.data;
      const currentTime = Number(data?.currentTime ?? data?.time ?? data?.data?.currentTime);
      const duration = Number(data?.duration ?? data?.data?.duration);
      if (Number.isFinite(currentTime)) this.currentTime = Math.max(0, currentTime);
      if (Number.isFinite(duration) && duration > 0) this.duration = duration;
      if (Number.isFinite(currentTime)) this.onTimeUpdate();
    };
    window.addEventListener("message", this.messageHandler);
  }

  parseMessage(value) {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  mount(source) {
    this.source = source;
    this.frame.hidden = false;
    this.frame.src = getBilibiliEmbedUrl(source);
    elements.video.hidden = true;
  }

  getCurrentTime() {
    return this.currentTime;
  }

  getDuration() {
    return this.duration;
  }

  send(method, value) {
    if (!this.frame.contentWindow) return;
    this.frame.contentWindow.postMessage({ method, value }, "*");
  }

  seek(seconds) {
    this.currentTime = seconds;
    if (this.source) this.frame.src = getBilibiliEmbedUrl(this.source, seconds);
    this.onTimeUpdate();
  }

  play() {
    this.send("play");
    return Promise.resolve();
  }

  pause() {
    this.send("pause");
  }

  destroy() {
    window.removeEventListener("message", this.messageHandler);
    this.frame.src = "about:blank";
    this.frame.hidden = true;
  }
}

function showVideoError(title, message, externalUrl = "") {
  elements.videoErrorTitle.textContent = title;
  elements.videoErrorMessage.textContent = message;
  elements.videoOpenExternal.hidden = !externalUrl;
  elements.videoOpenExternal.href = externalUrl || "#";
  elements.videoLoading.hidden = true;
  elements.videoError.hidden = false;
}

function renderVideoSources() {
  videoSources = (meeting.video?.sources || []).filter(source => {
    if (source.available === false) return false;
    if (source.provider === "local") return Boolean(source.src);
    if (source.provider === "bilibili") return Boolean(source.bvid);
    return false;
  });
  const defaultProvider = meeting.video?.default || videoSources[0]?.provider;
  elements.videoSourceControl.hidden = videoSources.length < 2;
  elements.videoSourceControl.innerHTML = videoSources.map(source => `
    <button type="button" class="source-button${source.provider === defaultProvider ? " active" : ""}" data-provider="${source.provider}" aria-pressed="${source.provider === defaultProvider}">
      ${source.label || source.provider}
    </button>
  `).join("");
  elements.videoSourceControl.querySelectorAll("[data-provider]").forEach(button => {
    button.addEventListener("click", () => activateVideoSource(button.dataset.provider));
  });
  if (!videoSources.length) throw new Error("No playable video source");
}

function markVideoReady() {
  elements.videoLoading.classList.add("ready");
  elements.videoLoading.hidden = false;
  elements.videoError.hidden = true;
}

function getPlaybackTime() {
  return videoAdapter?.getCurrentTime() || 0;
}

function getPlaybackDuration() {
  return videoAdapter?.getDuration() || 0;
}

function activateVideoSource(provider, autoplay = false) {
  const source = getVideoSource(provider);
  if (!source) return;
  if (videoAdapter) videoAdapter.destroy();
  state.initialSeekApplied = false;
  elements.videoLoading.hidden = false;
  elements.videoLoading.classList.remove("ready");
  elements.videoError.hidden = true;

  if (provider === "bilibili") {
    videoAdapter = new BilibiliVideoAdapter(elements.frame, syncWithVideo);
    videoAdapter.mount(source);
    elements.videoOpenExternal.hidden = false;
    elements.videoOpenExternal.href = getBilibiliUrl(source);
    elements.videoSyncStatus.hidden = false;
    elements.videoSyncStatus.textContent = "B 站嵌入播放器不提供实时进度回传；需要字幕跟随播放时，请切换到本地 MP4。点击字幕仍可跳转到 B 站对应时间。";
    elements.videoLoading.classList.add("ready");
    applyInitialVideoTime(true);
  } else {
    videoAdapter = new LocalVideoAdapter(elements.video, elements.frame);
    videoAdapter.mount(source);
    elements.videoOpenExternal.hidden = true;
    elements.videoSyncStatus.hidden = true;
  }

  elements.videoSourceControl.querySelectorAll("[data-provider]").forEach(button => {
    const isActive = button.dataset.provider === provider;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  const initialSeconds = getInitialSeconds();
  if (initialSeconds > 0 && provider === "local") seekToSeconds(initialSeconds, false);
  if (autoplay) videoAdapter.play().catch(() => showToast("已切换视频源，点击播放器开始播放"));
}

function getInitialSeconds() {
  const seconds = Number(new URLSearchParams(window.location.search).get("t"));
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : 0;
}

function getActiveIndex(seconds) {
  if (!transcript.length) return -1;

  let low = 0;
  let high = transcript.length - 1;
  let answer = 0;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (transcript[middle].startSeconds <= seconds) {
      answer = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return answer;
}

function renderTranscript() {
  const query = state.search.trim();
  const normalizedQuery = query.toLocaleLowerCase();
  const matches = transcript
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => {
      if (!normalizedQuery) return true;
      return `${segment.en} ${segment.zh}`.toLocaleLowerCase().includes(normalizedQuery);
    });

  elements.searchCount.textContent = query ? `${matches.length} 条` : `${transcript.length} 条`;

  if (!matches.length) {
    elements.transcriptList.innerHTML = '<div class="transcript-empty">没有找到匹配内容</div>';
    return;
  }

  elements.transcriptList.innerHTML = matches.map(({ segment, index }) => `
    <div class="transcript-row${index === state.activeIndex ? " active" : ""}" data-index="${index}" data-testid="transcript-${index}" tabindex="0" aria-label="跳转到 ${segment.display}">
      <span class="transcript-time">${formatTime(segment.startSeconds, false)}</span>
      ${segment.speakerChanged ? '<div class="speaker-line"><span class="speaker-tag">发言者切换</span></div>' : ""}
      <p class="source-text" lang="en">${highlight(segment.en, query)}</p>
      <p class="translation-text" lang="zh-CN">${highlight(segment.zh, query)}</p>
      <button class="copy-row" type="button" data-copy-index="${index}" aria-label="复制 ${segment.display} 的链接" title="复制时间戳链接">
        <i data-lucide="link-2" aria-hidden="true"></i>
      </button>
    </div>
  `).join("");

  refreshIcons();
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons({ attrs: { "aria-hidden": "true" } });
}

function updateActiveSegment(index, shouldScroll = state.followPlayback) {
  if (index < 0 || index >= transcript.length) return;
  const changed = state.activeIndex !== index;
  state.activeIndex = index;

  const previous = elements.transcriptList.querySelector(".transcript-row.active");
  if (previous) previous.classList.remove("active");

  const active = elements.transcriptList.querySelector(`[data-index="${index}"]`);
  if (active) {
    active.classList.add("active");
    if (changed && shouldScroll && !state.search) {
      const targetTop = active.offsetTop - elements.transcriptList.clientHeight / 2 + active.offsetHeight / 2;
      elements.transcriptList.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    }
  }
}

function syncWithVideo() {
  const currentTime = getPlaybackTime();
  elements.displayTime.textContent = formatTime(currentTime);
  const duration = getPlaybackDuration();
  if (duration > 0) elements.videoDuration.textContent = formatTime(duration);
  if (state.transcriptReady) updateActiveSegment(getActiveIndex(currentTime));
}

function seekToSeconds(seconds, autoplay = true, explicitIndex = null) {
  if (!videoAdapter) return;
  const duration = getPlaybackDuration();
  const safeSeconds = Math.max(0, Math.min(seconds, duration || seconds));
  videoAdapter.seek(safeSeconds);
  updateActiveSegment(explicitIndex ?? getActiveIndex(safeSeconds), true);
  updateUrl(safeSeconds);

  if (autoplay) {
    videoAdapter.play().catch(() => {
      showToast("已定位到字幕时间，点击播放器开始播放");
    });
  }
}

function updateUrl(seconds) {
  const url = new URL(window.location.href);
  url.searchParams.set("t", String(Number(seconds.toFixed(3))));
  url.searchParams.set("lang", state.language);
  history.replaceState(null, "", url);
}

async function copySegmentLink(index) {
  const segment = transcript[index];
  const url = new URL(window.location.href);
  url.searchParams.set("t", String(Number(segment.startSeconds.toFixed(3))));
  url.searchParams.set("lang", state.language);

  try {
    await navigator.clipboard.writeText(url.toString());
    showToast(`已复制 ${formatTime(segment.startSeconds, false)} 的中英字幕链接`);
  } catch {
    showToast("浏览器未允许复制，请从地址栏复制链接");
  }
}

function showToast(message) {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  state.toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 2400);
}

function selectLanguage(language, updateLocation = true) {
  state.language = language;
  document.body.dataset.language = language;
  document.querySelectorAll("[data-language]").forEach(button => {
    const isActive = button.dataset.language === language;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  if (updateLocation) updateUrl(getPlaybackTime() || getInitialSeconds());
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("ethlens-theme", theme);
  const isDark = theme === "dark";
  elements.themeToggle.setAttribute("aria-label", isDark ? "切换浅色模式" : "切换深色模式");
  elements.themeToggle.innerHTML = `<i data-lucide="${isDark ? "sun" : "moon"}" aria-hidden="true"></i>`;
  refreshIcons();
}

function applyInitialVideoTime(force = false) {
  if (state.initialSeekApplied || !videoAdapter) return;
  if (!force && videoAdapter.provider === "local" && elements.video.readyState < 1) return;
  state.initialSeekApplied = true;
  const duration = getPlaybackDuration();
  const initialSeconds = Math.min(getInitialSeconds(), duration || getInitialSeconds());
  videoAdapter.seek(initialSeconds);
  if (duration > 0) elements.videoDuration.textContent = formatTime(duration);
  markVideoReady();
  syncWithVideo();
}

function bindEvents() {
  elements.video.addEventListener("loadedmetadata", applyInitialVideoTime);
  elements.video.addEventListener("canplay", markVideoReady);
  elements.video.addEventListener("timeupdate", syncWithVideo);
  elements.video.addEventListener("seeked", syncWithVideo);
  elements.video.addEventListener("error", () => {
    showVideoError("本地视频读取失败", "请确认 MP4 文件仍位于 media/videos 目录中。");
  });
  elements.frame.addEventListener("load", () => {
    if (videoAdapter?.provider === "bilibili") markVideoReady();
  });

  elements.transcriptSearch.addEventListener("input", event => {
    state.search = event.target.value;
    renderTranscript();
  });

  elements.followPlayback.addEventListener("change", event => {
    state.followPlayback = event.target.checked;
    elements.returnLive.hidden = state.followPlayback;
    if (state.followPlayback) updateActiveSegment(state.activeIndex, true);
  });

  elements.returnLive.addEventListener("click", () => {
    state.followPlayback = true;
    elements.followPlayback.checked = true;
    elements.returnLive.hidden = true;
    updateActiveSegment(state.activeIndex, true);
  });

  elements.transcriptList.addEventListener("click", event => {
    const copyButton = event.target.closest("[data-copy-index]");
    if (copyButton) {
      event.stopPropagation();
      copySegmentLink(Number(copyButton.dataset.copyIndex));
      return;
    }

    const row = event.target.closest("[data-index]");
    if (row) {
      const index = Number(row.dataset.index);
      seekToSeconds(transcript[index].startSeconds, true, index);
    }
  });

  elements.transcriptList.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target.matches("[data-index]")) {
      const index = Number(event.target.dataset.index);
      event.preventDefault();
      seekToSeconds(transcript[index].startSeconds, true, index);
    }
  });

  document.querySelectorAll("[data-language]").forEach(button => {
    button.addEventListener("click", () => selectLanguage(button.dataset.language));
  });

  elements.summaryToggle.addEventListener("click", () => {
    setSummaryExpanded(elements.summaryToggle.getAttribute("aria-expanded") !== "true");
  });

  elements.summaryContent.addEventListener("click", event => {
    if (event.target.closest("a")) return;
    const item = event.target.closest("[data-summary-seek]");
    if (!item) return;
    seekToSeconds(Number(item.dataset.summarySeek));
    document.querySelector(".workspace").scrollIntoView({ block: "start", behavior: "smooth" });
  });

  elements.summaryContent.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const item = event.target.closest("[data-summary-seek]");
    if (!item) return;
    event.preventDefault();
    seekToSeconds(Number(item.dataset.summarySeek));
    document.querySelector(".workspace").scrollIntoView({ block: "start", behavior: "smooth" });
  });

  elements.themeToggle.addEventListener("click", () => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });

  elements.mobileMenu.addEventListener("click", () => {
    const isOpen = elements.primaryNav.classList.toggle("mobile-open");
    elements.mobileMenu.setAttribute("aria-expanded", String(isOpen));
  });

  document.addEventListener("keydown", event => {
    if (event.key === "/" && document.activeElement !== elements.transcriptSearch) {
      event.preventDefault();
      elements.transcriptSearch.focus();
    }
    if (event.key === "Escape") {
      elements.transcriptSearch.blur();
      elements.primaryNav.classList.remove("mobile-open");
    }
  });
}

async function initialize() {
  const params = new URLSearchParams(window.location.search);
  const requestedLanguage = params.get("lang");
  const savedTheme = localStorage.getItem("ethlens-theme");
  const preferredTheme = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";

  setTheme(savedTheme || preferredTheme);
  selectLanguage(["bilingual", "zh", "en"].includes(requestedLanguage) ? requestedLanguage : "bilingual", false);
  bindEvents();

  try {
    await loadMeeting();
    renderVideoSources();
    const initialProvider = getVideoSource(meeting.video?.default)?.provider || videoSources[0].provider;
    activateVideoSource(initialProvider);
    await loadTranscript();
    renderTranscript();
    updateActiveSegment(getActiveIndex(getPlaybackTime() || getInitialSeconds()), getInitialSeconds() > 0);
  } catch {
    elements.searchCount.textContent = "";
    elements.transcriptList.innerHTML = '<div class="transcript-empty">会议资料读取失败，请确认 manifest 和字幕文件仍在会议目录中。</div>';
    showVideoError("会议视频暂时不可用", "请返回会议档案检查这场会议的资源配置。");
  }

  refreshIcons();
}

initialize();
