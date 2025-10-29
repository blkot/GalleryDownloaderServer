// ==UserScript==
// @name         Gallery Downloader – SimpCity Helper
// @namespace    https://github.com/xanta/gallerydownloaderserver
// @version      0.5.0
// @description  Decorate SimpCity threads with Gallery Downloader actions and normalised provider links.
// @author       You
// @match        https://simpcity.cr/threads/*
// @match        https://simpcity.su/threads/*
// @match        https://simpcity.gs/threads/*
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @connect      localhost
// @connect      127.0.0.1
// @connect      saint2.cr
// @connect      192.168.50.68
// ==/UserScript==

(function () {
  "use strict";

  const SUPPORTED_HOSTS = ["pixeldrain", "bunkr", "gofile", "cyberdrop", "redgifs", "saint2"];
  const SUPPORTED_IFRAME_HOSTS = ["saint2.", "cyberdrop.", "bunkr.", "gofile.", "pixeldrain."];
  const BUTTON_CLASS = "gdl-send-button";
  const CONTAINER_CLASS = "gdl-send-container";
  const TITLE_PARAM_KEY = "gdl_title";

  const config = {
    apiBase: GM_getValue("gdl_apiBase", "http://localhost:8080"),
    token: GM_getValue("gdl_token", "changeme"),
  };
  const PANEL_FILTER_STORAGE_KEY = "gdl_panel_filter_mode";

  const PANEL_STYLE = `
    #gdl-status-panel {
      position: fixed;
      top: 96px;
      left: 12px;
      width: 320px;
      max-height: calc(100vh - 120px);
      overflow: hidden;
      background: rgba(18, 18, 20, 0.9);
      color: #f1f1f1;
      border-radius: 8px;
      border: 1px solid rgba(0, 0, 0, 0.25);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
      font-family: "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      z-index: 2147483000;
      backdrop-filter: blur(6px);
    }
    #gdl-status-panel.collapsed {
      transform: translateX(-280px);
      transition: transform 0.25s ease-out;
    }
    #gdl-status-panel.expanded {
      transform: translateX(0);
      transition: transform 0.25s ease-out;
    }
    #gdl-status-panel .gdl-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      background: rgba(0, 0, 0, 0.35);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    #gdl-status-panel .gdl-panel-title {
      font-size: 14px;
      font-weight: 600;
      margin: 0;
    }
    #gdl-status-panel button.gdl-panel-toggle {
      background: transparent;
      color: inherit;
      border: none;
      cursor: pointer;
      font-size: 14px;
      padding: 4px;
    }
    #gdl-status-panel .gdl-panel-controls {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 12px;
      gap: 8px;
      background: rgba(0, 0, 0, 0.25);
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    #gdl-status-panel .gdl-controls-label {
      font-size: 12px;
      color: rgba(240, 240, 240, 0.75);
      margin-right: 4px;
    }
    #gdl-status-panel .gdl-filter-group {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    #gdl-status-panel .gdl-filter-button {
      background: rgba(255, 255, 255, 0.06);
      color: #f0f0f0;
      border: 1px solid transparent;
      border-radius: 999px;
      padding: 2px 10px;
      font-size: 11px;
      cursor: pointer;
    }
    #gdl-status-panel .gdl-filter-button:hover {
      background: rgba(255, 255, 255, 0.12);
    }
    #gdl-status-panel .gdl-filter-button.active {
      background: rgba(13, 110, 253, 0.25);
      border-color: rgba(13, 110, 253, 0.6);
      color: #d5e6ff;
    }
    #gdl-status-panel .gdl-panel-body {
      max-height: calc(100vh - 180px);
      overflow-y: auto;
      padding: 8px 0;
    }
    #gdl-status-panel .gdl-empty {
      padding: 16px 14px;
      color: rgba(240, 240, 240, 0.6);
      font-style: italic;
    }
    #gdl-status-panel .gdl-download-entry {
      padding: 10px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    #gdl-status-panel .gdl-download-entry:last-child {
      border-bottom: none;
    }
    #gdl-status-panel .gdl-entry-main {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    #gdl-status-panel .gdl-entry-title {
      font-weight: 600;
      margin: 0;
      font-size: 13px;
      color: #ffffff;
      word-break: break-word;
    }
    #gdl-status-panel .gdl-status-pill {
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      background: rgba(255, 255, 255, 0.08);
      color: #ffffff;
      flex-shrink: 0;
    }
    #gdl-status-panel .gdl-status-pill[data-status="queued"] {
      background: rgba(13, 110, 253, 0.2);
      color: #91c4ff;
    }
    #gdl-status-panel .gdl-status-pill[data-status="running"] {
      background: rgba(255, 193, 7, 0.25);
      color: #ffe08a;
    }
    #gdl-status-panel .gdl-status-pill[data-status="succeeded"] {
      background: rgba(25, 135, 84, 0.2);
      color: #8fddb5;
    }
    #gdl-status-panel .gdl-status-pill[data-status="failed"] {
      background: rgba(220, 53, 69, 0.2);
      color: #f2a7af;
    }
    #gdl-status-panel .gdl-entry-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 10px;
      color: rgba(240, 240, 240, 0.7);
      font-size: 11px;
    }
    #gdl-status-panel .gdl-entry-actions {
      display: flex;
      gap: 6px;
    }
    #gdl-status-panel .gdl-button {
      background: rgba(13, 110, 253, 0.15);
      color: #d0e3ff;
      border: 1px solid rgba(13, 110, 253, 0.35);
      border-radius: 4px;
      padding: 2px 6px;
      cursor: pointer;
      font-size: 11px;
    }
    #gdl-status-panel .gdl-button:hover {
      background: rgba(13, 110, 253, 0.25);
    }
    .gdl-highlighted-link {
      animation: gdl-pulse 1.2s ease-in-out 2;
      box-shadow: 0 0 0 3px rgba(13, 110, 253, 0.45);
    }
    @keyframes gdl-pulse {
      0% {
        box-shadow: 0 0 0 0 rgba(13, 110, 253, 0.0);
      }
      50% {
        box-shadow: 0 0 0 6px rgba(13, 110, 253, 0.4);
      }
      100% {
        box-shadow: 0 0 0 0 rgba(13, 110, 253, 0.0);
      }
    }
    @media (max-width: 1280px) {
      #gdl-status-panel {
        left: 8px;
        width: 260px;
      }
      #gdl-status-panel.collapsed {
        transform: translateX(-220px);
      }
    }
  `;

  const trackedLinks = new Map();
  const panelState = {
    container: null,
    listContainer: null,
    toggleButton: null,
    collapsed: GM_getValue("gdl_panel_collapsed", false),
    filterMode: GM_getValue(PANEL_FILTER_STORAGE_KEY, "thread"),
    filterButtons: new Map(),
    downloads: new Map(),
    autoRefreshTimer: null,
    pendingRefreshTimer: null,
    threadTitle: null,
  };

  const NOTIFICATION_WS_PATH = "/ws/notifications";
  const NOTIFIED_IDS_KEY = "gdl_notified_ids";
  const MAX_BACKOFF_SECONDS = 30;
  let notificationSocket = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;

  function whenDocumentReady(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
  }

  GM_registerMenuCommand("Set API base URL", () => {
    const value = prompt("Gallery Downloader API base URL", config.apiBase);
    if (value) {
      config.apiBase = value.replace(/\/+$/, "");
      GM_setValue("gdl_apiBase", config.apiBase);
      alert(`API base set to ${config.apiBase}`);
    }
  });

  GM_registerMenuCommand("Set API token", () => {
    const value = prompt("Gallery Downloader API token", config.token);
    if (value) {
      config.token = value;
      GM_setValue("gdl_token", config.token);
      alert("API token updated.");
    }
  });

  function readNotifiedIds() {
    try {
      const raw = GM_getValue(NOTIFIED_IDS_KEY, "[]");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.debug("Failed to parse notified IDs", error);
      return [];
    }
  }

  function hasNotified(downloadId) {
    if (!downloadId) return false;
    const stored = readNotifiedIds();
    return stored.includes(downloadId);
  }

  function rememberNotified(downloadId) {
    if (!downloadId) return;
    const stored = readNotifiedIds();
    if (stored.includes(downloadId)) {
      return;
    }
    stored.push(downloadId);
    const trimmed = stored.slice(-50);
    GM_setValue(NOTIFIED_IDS_KEY, JSON.stringify(trimmed));
  }

  function ensurePanelStyles() {
    if (document.getElementById("gdl-status-panel-style")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "gdl-status-panel-style";
    style.textContent = PANEL_STYLE;
    document.head.appendChild(style);
  }

  function initDownloadPanel(threadTitle) {
    panelState.threadTitle = threadTitle;
    if (!["thread", "all"].includes(panelState.filterMode)) {
      panelState.filterMode = "thread";
    }
    ensurePanelStyles();
    if (!panelState.container) {
      buildStatusPanel();
    }
    refreshActiveDownloads();
    startPanelAutoRefresh();
  }

  function buildStatusPanel() {
    const container = document.createElement("div");
    container.id = "gdl-status-panel";
    container.className = panelState.collapsed ? "collapsed" : "expanded";
    panelState.filterButtons = new Map();

    const header = document.createElement("div");
    header.className = "gdl-panel-header";

    const title = document.createElement("h3");
    title.className = "gdl-panel-title";
    title.textContent = "Downloads";
    header.appendChild(title);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "gdl-panel-toggle";
    toggle.textContent = panelState.collapsed ? "»" : "«";
    toggle.addEventListener("click", () => {
      panelState.collapsed = !panelState.collapsed;
      GM_setValue("gdl_panel_collapsed", panelState.collapsed);
      container.className = panelState.collapsed ? "collapsed" : "expanded";
      toggle.textContent = panelState.collapsed ? "»" : "«";
    });
    header.appendChild(toggle);

    const controls = document.createElement("div");
    controls.className = "gdl-panel-controls";

    const controlsLabel = document.createElement("span");
    controlsLabel.className = "gdl-controls-label";
    controlsLabel.textContent = "Show:";
    controls.appendChild(controlsLabel);

    const filterGroup = document.createElement("div");
    filterGroup.className = "gdl-filter-group";
    filterGroup.appendChild(createFilterButton("thread", "This thread"));
    filterGroup.appendChild(createFilterButton("all", "All"));
    controls.appendChild(filterGroup);

    const body = document.createElement("div");
    body.className = "gdl-panel-body";

    container.appendChild(header);
    container.appendChild(controls);
    container.appendChild(body);
    document.body.appendChild(container);

    panelState.container = container;
    panelState.listContainer = body;
    panelState.toggleButton = toggle;
    updateFilterButtons();

    renderDownloadPanel();
  }

  function createFilterButton(mode, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "gdl-filter-button";
    button.dataset.filterMode = mode;
    button.textContent = label;
    button.addEventListener("click", () => setFilterMode(mode));
    panelState.filterButtons.set(mode, button);
    return button;
  }

  function setFilterMode(mode) {
    if (!mode || panelState.filterMode === mode) {
      return;
    }
    panelState.filterMode = mode;
    GM_setValue(PANEL_FILTER_STORAGE_KEY, mode);
    updateFilterButtons();
    renderDownloadPanel();
  }

  function updateFilterButtons() {
    if (!panelState.filterButtons || panelState.filterButtons.size === 0) {
      return;
    }
    panelState.filterButtons.forEach((button, mode) => {
      if (!button) {
        return;
      }
      if (mode === panelState.filterMode) {
        button.classList.add("active");
        button.setAttribute("aria-pressed", "true");
      } else {
        button.classList.remove("active");
        button.setAttribute("aria-pressed", "false");
      }
    });
  }

  function startPanelAutoRefresh() {
    if (panelState.autoRefreshTimer) {
      return;
    }
    panelState.autoRefreshTimer = setInterval(() => {
      refreshActiveDownloads();
    }, 30000);
  }

  function stopPanelAutoRefresh() {
    if (panelState.autoRefreshTimer) {
      clearInterval(panelState.autoRefreshTimer);
      panelState.autoRefreshTimer = null;
    }
  }

  function schedulePanelRefresh(delay = 1000) {
    if (panelState.pendingRefreshTimer) {
      clearTimeout(panelState.pendingRefreshTimer);
    }
    panelState.pendingRefreshTimer = setTimeout(() => {
      panelState.pendingRefreshTimer = null;
      refreshActiveDownloads();
    }, delay);
  }

  function refreshActiveDownloads() {
    const base = (config.apiBase || "").trim().replace(/\/+$/, "");
    if (!base) {
      return;
    }
    const headers = {
      Accept: "application/json",
    };
    if (config.token) {
      headers.Authorization = `Bearer ${config.token}`;
    }
    GM_xmlhttpRequest({
      method: "GET",
      url: `${base}/downloads`,
      headers,
      onload: (response) => {
        if (response.status >= 200 && response.status < 300) {
          try {
            const payload = JSON.parse(response.responseText);
            if (Array.isArray(payload)) {
              updateDownloadsFromList(payload);
            }
          } catch (error) {
            console.debug("Failed to parse downloads list", error);
          }
        } else {
          console.debug("Failed to load downloads", response.status, response.statusText);
        }
      },
      onerror: (error) => {
        console.debug("Downloads request failed", error);
      },
    });
  }

  function updateDownloadsFromList(items) {
    const seen = new Set();
    items.forEach((item) => {
      const normalized = normalizeDownloadRecord(item);
      if (!normalized || !normalized.id) {
        return;
      }
      const existing = panelState.downloads.get(normalized.id);
      panelState.downloads.set(normalized.id, mergeDownloadRecords(existing, normalized));
      seen.add(normalized.id);
      updateTrackedButtonsForDownload(panelState.downloads.get(normalized.id));
    });

    // Remove queued/running jobs that disappeared from list.
    panelState.downloads.forEach((value, key) => {
      if (!seen.has(key) && (value.status === "queued" || value.status === "running")) {
        resetButtonsForDownload(value);
        panelState.downloads.delete(key);
      }
    });

    renderDownloadPanel();
  }

  function mergeDownloadRecords(existing, incoming) {
    if (!existing) {
      return { ...incoming };
    }
    const merged = { ...existing };
    Object.entries(incoming).forEach(([key, value]) => {
      if (value !== undefined) {
        merged[key] = value;
      }
    });
    if (!merged.urls) {
      merged.urls = [];
    }
    if (!merged.provider_hosts) {
      merged.provider_hosts = [];
    }
    return merged;
  }

  function renderDownloadPanel() {
    if (!panelState.listContainer) {
      return;
    }
    updateFilterButtons();
    const container = panelState.listContainer;
    container.innerHTML = "";

    const allDownloads = Array.from(panelState.downloads.values());
    const visibleDownloads = allDownloads.filter((item) => isDownloadVisible(item));

    if (!visibleDownloads.length) {
      const empty = document.createElement("div");
      empty.className = "gdl-empty";
      empty.textContent =
        panelState.filterMode === "thread" ? "No downloads for this thread." : "No downloads yet.";
      container.appendChild(empty);
      return;
    }

    const active = visibleDownloads
      .filter((item) => item.status === "queued" || item.status === "running")
      .sort((a, b) => {
        const aTime = a.requested_at ? new Date(a.requested_at).getTime() : 0;
        const bTime = b.requested_at ? new Date(b.requested_at).getTime() : 0;
        return bTime - aTime;
      });

    const completed = visibleDownloads
      .filter((item) => item.status === "succeeded" || item.status === "failed")
      .sort((a, b) => {
        const aTime = a.finished_at ? new Date(a.finished_at).getTime() : 0;
        const bTime = b.finished_at ? new Date(b.finished_at).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 10);

    if (active.length) {
      container.appendChild(buildSectionHeader(`Active • ${active.length}`));
      active.forEach((item) => {
        container.appendChild(createDownloadEntry(item));
      });
    }

    if (completed.length) {
      container.appendChild(buildSectionHeader(`Recent • ${completed.length}`));
      completed.forEach((item) => {
        container.appendChild(createDownloadEntry(item));
      });
    }
    syncTrackedButtons();
  }

  function buildSectionHeader(title) {
    const header = document.createElement("div");
    header.className = "gdl-download-entry";
    const label = document.createElement("div");
    label.className = "gdl-entry-title";
    label.textContent = title;
    header.appendChild(label);
    return header;
  }

  function normalizeDownloadRecord(record) {
    if (!record) {
      return null;
    }
    const id = record.id || record.download_id;
    if (!id) {
      return null;
    }
    const urls = Array.isArray(record.urls) ? record.urls.map(String) : [];
    const providerHosts = urls.map((url) => extractHostname(url)).filter(Boolean);
    return {
      id: String(id),
      status: record.status || "queued",
      urls,
      provider_hosts: providerHosts,
      label: record.label || null,
      post_title: record.post_title || null,
      requested_at: record.requested_at || record.queued_at || null,
      started_at: record.started_at || null,
      finished_at: record.finished_at || null,
      failure_reason: record.failure_reason || null,
    };
  }

  function normalizeEventPayload(eventPayload) {
    if (!eventPayload || !eventPayload.download_id) {
      return null;
    }
    const statusMap = {
      queued: "queued",
      running: "running",
      progress: "running",
      succeeded: "succeeded",
      failed: "failed",
      cancelled: "failed",
    };
    const status = statusMap[eventPayload.type] || "queued";
    return {
      id: String(eventPayload.download_id),
      status,
      urls: Array.isArray(eventPayload.urls) ? eventPayload.urls.map(String) : [],
      post_title: eventPayload.post_title || null,
      label: eventPayload.label || null,
      requested_at: eventPayload.queued_at || eventPayload.requested_at || null,
      started_at: eventPayload.started_at || null,
      finished_at: eventPayload.finished_at || null,
      failure_reason: eventPayload.failure_reason || null,
    };
  }

  function createDownloadEntry(download) {
    const entry = document.createElement("div");
    entry.className = "gdl-download-entry";
    entry.dataset.downloadId = download.id;

    const mainRow = document.createElement("div");
    mainRow.className = "gdl-entry-main";

    const title = document.createElement("div");
    title.className = "gdl-entry-title";
    title.textContent = deriveDisplayTitle(download);
    mainRow.appendChild(title);

    const pill = document.createElement("span");
    pill.className = "gdl-status-pill";
    pill.dataset.status = download.status;
    pill.textContent = download.status;
    mainRow.appendChild(pill);

    const metaRow = document.createElement("div");
    metaRow.className = "gdl-entry-meta";
    const providers = download.provider_hosts.length ? download.provider_hosts.join(", ") : "unknown";
    metaRow.appendChild(buildMetaItem(`Source: ${providers}`));
    if (download.requested_at) {
      metaRow.appendChild(buildMetaItem(`Queued: ${formatRelativeTime(download.requested_at)}`));
    }
    if (download.status === "running" && download.started_at) {
      metaRow.appendChild(buildMetaItem(`Started: ${formatRelativeTime(download.started_at)}`));
    }
    if ((download.status === "succeeded" || download.status === "failed") && download.finished_at) {
      metaRow.appendChild(buildMetaItem(`Finished: ${formatRelativeTime(download.finished_at)}`));
    }
    if (download.status === "failed" && download.failure_reason) {
      metaRow.appendChild(buildMetaItem(`Reason: ${download.failure_reason}`));
    }

    const actionsRow = document.createElement("div");
    actionsRow.className = "gdl-entry-actions";
    const isLocal = isLocalToThread(download);
    if (isLocal) {
      const jump = document.createElement("button");
      jump.type = "button";
      jump.className = "gdl-button";
      jump.textContent = "Jump";
      jump.addEventListener("click", () => jumpToDownload(download));
      actionsRow.appendChild(jump);
    }
    if (download.urls && download.urls.length) {
      const open = document.createElement("button");
      open.type = "button";
      open.className = "gdl-button";
      open.textContent = "Open";
      open.addEventListener("click", () => {
        window.open(download.urls[0], "_blank", "noopener");
      });
      actionsRow.appendChild(open);
    }

    entry.appendChild(mainRow);
    entry.appendChild(metaRow);
    if (actionsRow.childElementCount) {
      entry.appendChild(actionsRow);
    }

    return entry;
  }

  function deriveDisplayTitle(download) {
    if (download.post_title) {
      return download.post_title;
    }
    if (download.label) {
      return download.label;
    }
    if (download.urls && download.urls.length) {
      try {
        const url = new URL(download.urls[0]);
        return `${url.hostname}${url.pathname}`;
      } catch (_) {
        return download.urls[0];
      }
    }
    return download.id;
  }

  function buildMetaItem(text) {
    const item = document.createElement("span");
    item.textContent = text;
    return item;
  }

  function handlePanelNotification(payload) {
    const normalized = normalizeEventPayload(payload);
    if (normalized && normalized.id) {
      const existing = panelState.downloads.get(normalized.id);
      const merged = mergeDownloadRecords(existing, normalized);
      panelState.downloads.set(normalized.id, merged);
      updateTrackedButtonsForDownload(merged);
      renderDownloadPanel();
    }
    schedulePanelRefresh(payload.type === "queued" ? 1000 : 2000);
  }

  function jumpToDownload(download) {
    const target = findTrackedElementForDownload(download);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("gdl-highlighted-link");
      setTimeout(() => {
        target.classList.remove("gdl-highlighted-link");
      }, 1600);
    } else if (download.urls && download.urls.length) {
      window.open(download.urls[0], "_blank", "noopener");
    }
  }

  function findTrackedElementForDownload(download) {
    if (!download || !download.urls) {
      return null;
    }
    for (const url of download.urls) {
      const key = stripTitleParam(url);
      const entry = trackedLinks.get(key);
      if (entry && entry.elements && entry.elements.size) {
        const iterator = entry.elements.values();
        const first = iterator.next();
        if (first.value) {
          return first.value;
        }
      }
    }
    return null;
  }

  function isDownloadVisible(download) {
    if (!download) {
      return false;
    }
    if (panelState.filterMode === "thread") {
      if (!panelState.threadTitle) {
        return true;
      }
      return isLocalToThread(download);
    }
    return true;
  }

  function isLocalToThread(download) {
    if (!download || !download.urls) {
      return false;
    }
    return download.urls.some((url) => {
      const key = stripTitleParam(url);
      const entry = trackedLinks.get(key);
      if (entry && entry.threadTitle && panelState.threadTitle) {
        return true;
      }
      return Boolean(entry);
    });
  }

  function extractHostname(url) {
    try {
      return new URL(url).hostname;
    } catch (_) {
      return null;
    }
  }

  function formatRelativeTime(isoString) {
    if (!isoString) {
      return "";
    }
    try {
      const date = new Date(isoString);
      if (Number.isNaN(date.getTime())) {
        return isoString;
      }
      const diffMs = Date.now() - date.getTime();
      const diffMinutes = Math.round(diffMs / 60000);
      if (diffMinutes < 1) {
        return "just now";
      }
      if (diffMinutes < 60) {
        return `${diffMinutes}m ago`;
      }
      const diffHours = Math.round(diffMinutes / 60);
      if (diffHours < 24) {
        return `${diffHours}h ago`;
      }
      const diffDays = Math.round(diffHours / 24);
      return `${diffDays}d ago`;
    } catch (_) {
      return isoString;
    }
  }

  function determineWebSocketScheme(apiBase) {
    if (!apiBase) {
      return "ws://";
    }
    try {
      const parsed = new URL(apiBase.trim(), window.location.origin);
      return parsed.protocol === "https:" ? "wss://" : "ws://";
    } catch (_) {
      const lowered = apiBase.toLowerCase();
      return lowered.startsWith("https://") ? "wss://" : "ws://";
    }
  }

  function buildWebSocketUrl() {
    const trimmedBase = (config.apiBase || "").trim().replace(/\/+$/, "");
    const protocol = determineWebSocketScheme(trimmedBase);
    const host = trimmedBase.replace(/^https?:\/\//i, "");
    return `${protocol}${host}${NOTIFICATION_WS_PATH}?token=${encodeURIComponent(config.token)}`;
  }

  function handleNotificationMessage(payload) {
    if (!payload || typeof payload !== "object") {
      return;
    }
    handlePanelNotification(payload);
    if (payload.type !== "queued") {
      return;
    }
    const downloadId = payload.download_id;
    if (hasNotified(downloadId)) {
      return;
    }
    rememberNotified(downloadId);
    const title = payload.post_title || "Download queued";
    const urlCount = Array.isArray(payload.urls) ? payload.urls.length : 0;
    const subtitle = urlCount > 1 ? `${urlCount} items queued` : payload.urls?.[0] || "Queued";
    notify("Gallery Downloader", `${title}\n${subtitle}`);
  }

  function scheduleReconnect() {
    if (reconnectTimer) {
      return;
    }
    const delaySeconds = Math.min(2 ** reconnectAttempt, MAX_BACKOFF_SECONDS);
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectNotificationStream();
    }, delaySeconds * 1000);
  }

  function connectNotificationStream() {
    const wsUrl = buildWebSocketUrl();
    try {
      notificationSocket = new WebSocket(wsUrl);
    } catch (error) {
      console.debug("Failed to open websocket", error);
      scheduleReconnect();
      return;
    }

    notificationSocket.addEventListener("open", () => {
      reconnectAttempt = 0;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    });

    notificationSocket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data);
        handleNotificationMessage(payload);
      } catch (error) {
        console.debug("Failed to parse notification payload", error);
      }
    });

    notificationSocket.addEventListener("close", () => {
      notificationSocket = null;
      scheduleReconnect();
    });

    notificationSocket.addEventListener("error", () => {
      if (notificationSocket) {
        notificationSocket.close();
      }
    });
  }

  function startNotificationStream() {
    if (notificationSocket) {
      return;
    }
    connectNotificationStream();
  }

  window.addEventListener("beforeunload", () => {
    if (notificationSocket) {
      notificationSocket.close();
      notificationSocket = null;
    }
    stopPanelAutoRefresh();
  });

  const BUNKR_HOST_MAP = {
    "bunkr.si": "bunkr.ws",
    "bunkrrr.org": "bunkr.ws",
    "bunkr.site": "bunkr.ws",
    "bunkr.ru": "bunkr.ws",
  };

  function normalizeProviderUrl(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      const host = parsed.hostname.toLowerCase();
      if (host.includes("bunkr")) {
        const mapped = Object.entries(BUNKR_HOST_MAP).find(([legacy]) => host.endsWith(legacy));
        if (mapped) {
          parsed.hostname = host.replace(new RegExp(`${mapped[0]}$`, "i"), mapped[1]);
        } else if (!host.endsWith("bunkr.ws")) {
          parsed.hostname = host.replace(/bunkr[\w-]*\.[^.]+$/i, "bunkr.ws");
        }
        if (parsed.pathname.startsWith("/v/") || parsed.pathname.startsWith("/d/")) {
          parsed.pathname = parsed.pathname.replace(/\/[vd]\//, "/f/");
        }
      }
      return parsed.toString();
    } catch (error) {
      console.debug("Failed to normalise provider url", error, url);
      return url;
    }
  }

  function stripTitleParam(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      parsed.searchParams.delete(TITLE_PARAM_KEY);
      return normalizeProviderUrl(parsed.toString());
    } catch (error) {
      console.debug("Failed to strip title param", error, url);
      return normalizeProviderUrl(url);
    }
  }

  function attachTitleParam(url, title) {
    if (!title) {
      return stripTitleParam(url);
    }
    try {
      const parsed = new URL(url, window.location.origin);
      parsed.searchParams.set(TITLE_PARAM_KEY, title);
      return normalizeProviderUrl(parsed.toString());
    } catch (error) {
      console.debug("Failed to attach title param", error, url);
      return normalizeProviderUrl(url);
    }
  }

  function registerTrackedLink(url, threadTitle, element) {
    if (!url) {
      return;
    }
    const key = stripTitleParam(url);
    let entry = trackedLinks.get(key);
    if (!entry) {
      entry = {
        elements: new Set(),
        buttons: new Set(),
        threadTitle: threadTitle || null,
      };
      trackedLinks.set(key, entry);
    }
    if (element) {
      entry.elements.add(element);
    }
    if (threadTitle && !entry.threadTitle) {
      entry.threadTitle = threadTitle;
    }
    if (element && panelState.listContainer) {
      renderDownloadPanel();
    }
  }

  function extractTitleFromUrl(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      return parsed.searchParams.get(TITLE_PARAM_KEY);
    } catch (error) {
      console.debug("Failed to extract title from url", error, url);
      return null;
    }
  }

  function sanitizeSegment(segment) {
    if (!segment) return "";
    let sanitized = segment.trim().replace(/[\\/:*?"<>|]/g, "_");
    sanitized = sanitized.replace(/\s+/g, "_").replace(/_+/g, "_");
    sanitized = sanitized.replace(/^_+|_+$/g, "");
    return sanitized || "untitled";
  }

  function extractThreadTitle() {
    const match = window.location.pathname.match(/\/threads\/([^/]+)/);
    if (match && match[1]) {
      return sanitizeSegment(match[1]);
    }
    const header = document.querySelector("h1");
    if (header) {
      return sanitizeSegment(header.textContent || "");
    }
    return "thread";
  }

  function buildButton(label = "Send to Downloader") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.className = BUTTON_CLASS;
    button.style.marginTop = "6px";
    button.style.padding = "4px 8px";
    button.style.fontSize = "12px";
    button.style.cursor = "pointer";
    button.style.borderRadius = "4px";
    button.style.border = "1px solid #0066ff";
    button.style.background = "#0d6efd";
    button.style.color = "#fff";
    return button;
  }

  function shouldDecorate(node) {
    const host = node.getAttribute("data-host") || "";
    return SUPPORTED_HOSTS.some((entry) => host.includes(entry));
  }

  function shouldDecorateAnchor(anchor) {
    const href = anchor.getAttribute("href") || "";
    return SUPPORTED_HOSTS.some((entry) => href.includes(entry));
  }

  function shouldDecorateIframe(iframe) {
    const src = iframe.getAttribute("src") || "";
    return SUPPORTED_IFRAME_HOSTS.some((entry) => src.includes(entry));
  }

  function getLinkFromBlock(block) {
    const anchor = block.querySelector("a[href]");
    return anchor ? anchor.href : null;
  }

  function enforceBlockUrl(block, anchor, threadTitle) {
    if (!anchor) return;
    const baseUrl = stripTitleParam(anchor.href || "");
    const titledUrl = attachTitleParam(baseUrl, threadTitle);
    if (anchor.href !== titledUrl) {
      anchor.href = titledUrl;
      anchor.setAttribute("href", titledUrl);
    }
    if (anchor.dataset && "proxyHref" in anchor.dataset) {
      anchor.dataset.proxyHref = titledUrl;
      anchor.setAttribute("data-proxy-href", titledUrl);
    }
    block.dataset.url = titledUrl;
    block.setAttribute("data-url", titledUrl);
    if ("proxyHref" in block.dataset || block.hasAttribute("data-proxy-href")) {
      block.dataset.proxyHref = titledUrl;
      block.setAttribute("data-proxy-href", titledUrl);
    }
  }

  function notify(title, text, isError = false) {
    try {
      GM_notification({
        title,
        text,
        timeout: 4000,
        silent: !isError,
      });
    } catch (error) {
      console.debug("Notification fallback:", title, text, error);
      if (isError) {
        alert(`${title}\n${text}`);
      }
    }
  }

  function sendDownloadRequest(url, threadTitle, button, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const cleanUrl = stripTitleParam(url);
    const payload = JSON.stringify({
      urls: [cleanUrl],
      post_title: threadTitle,
    });

    button.disabled = true;
    button.textContent = "Sending...";

    GM_xmlhttpRequest({
      method: "POST",
      url: `${config.apiBase.replace(/\/+$/, "")}/downloads`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.token}`,
      },
      data: payload,
      onload: (response) => {
        if (response.status === 200 || response.status === 202) {
          button.textContent = "Queued ✓";
          button.style.background = "#198754";
          button.style.borderColor = "#198754";
          notify("Gallery Downloader", `Queued download for ${threadTitle}`, false);
        } else {
          console.error("Failed to enqueue download", response);
          button.textContent = `Error ${response.status}`;
          button.style.background = "#dc3545";
          button.style.borderColor = "#dc3545";
          button.disabled = false;
          alert(`Failed to enqueue download: ${response.status} ${response.statusText}`);
          notify("Gallery Downloader – error", `Failed to queue download (${response.status} ${response.statusText})`, true);
        }
      },
      onerror: (error) => {
        console.error("Request error", error);
        button.textContent = "Network error";
        button.style.background = "#dc3545";
        button.style.borderColor = "#dc3545";
        button.disabled = false;
        alert("Network error while sending download request.");
        notify("Gallery Downloader – network error", "Network error while sending download request.", true);
      },
    });
  }

  function decorateBlock(block, threadTitle) {
    if (block.dataset.gdlDecorated === "true") {
      return;
    }

    const rawUrl = getLinkFromBlock(block);
    if (!rawUrl) return;

    block.dataset.gdlDecorated = "true";
    if (getComputedStyle(block).position === "static") {
      block.style.position = "relative";
    }

    const normalizedBaseUrl = stripTitleParam(rawUrl);
    registerTrackedLink(normalizedBaseUrl, threadTitle, block);

    const anchor = block.querySelector("a[href]");
    if (anchor && !anchor.dataset.gdlClickBound) {
      anchor.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopPropagation();
          const target = anchor.target || "_blank";
          const destination = anchor.href;
          if (target === "_self") {
            window.location.href = destination;
          } else {
            window.open(destination, target);
          }
        },
        { capture: true }
      );
      anchor.dataset.gdlClickBound = "true";
    }

    enforceBlockUrl(block, anchor, threadTitle);

    if (anchor && !anchor.dataset.gdlHrefObserver) {
      const observer = new MutationObserver(() => enforceBlockUrl(block, anchor, threadTitle));
      observer.observe(anchor, { attributes: true, attributeFilter: ["href"] });
      anchor.dataset.gdlHrefObserver = "true";
    }

    const button = buildButton();
    ["click", "mousedown", "mouseup"].forEach((eventName) => {
      button.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
    });
    button.addEventListener("click", (event) => sendDownloadRequest(normalizedBaseUrl, threadTitle, button, event));

    const container = document.createElement("div");
    container.className = CONTAINER_CLASS;
    container.style.position = "absolute";
    container.style.top = "8px";
    container.style.right = "8px";
    container.style.zIndex = "20";
    container.style.pointerEvents = "auto";
    container.appendChild(button);

    block.appendChild(container);
    attachButtonForLink(normalizedBaseUrl, button);
  }

  function decorateAnchor(anchor, threadTitle) {
    if (anchor.dataset.gdlDecorated === "true") {
      return;
    }

    const rawUrl = anchor.getAttribute("href");
   if (!rawUrl) return;

    const baseUrl = stripTitleParam(rawUrl);
    registerTrackedLink(baseUrl, threadTitle, anchor);
    const titledUrl = attachTitleParam(baseUrl, threadTitle);
    anchor.href = titledUrl;
    anchor.setAttribute("href", titledUrl);
    if (anchor.dataset && "proxyHref" in anchor.dataset) {
      anchor.dataset.proxyHref = titledUrl;
      anchor.setAttribute("data-proxy-href", titledUrl);
    }

    const wrapper = document.createElement("span");
    wrapper.className = CONTAINER_CLASS;
    wrapper.style.marginLeft = "8px";
    wrapper.style.display = "inline-block";

    const button = buildButton("Send");
    button.style.padding = "2px 6px";
    button.style.fontSize = "11px";

    ["click", "mousedown", "mouseup"].forEach((eventName) => {
      button.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
    });
    button.addEventListener("click", (event) => sendDownloadRequest(baseUrl, threadTitle, button, event));

    wrapper.appendChild(button);
    anchor.insertAdjacentElement("afterend", wrapper);
    anchor.dataset.gdlDecorated = "true";
    attachButtonForLink(baseUrl, button);
  }

  function decorateIframe(iframe, threadTitle) {
    if (iframe.dataset.gdlDecorated === "true") {
      return;
    }

    const src = iframe.getAttribute("src");
    if (!src) return;

    const hostMatch = SUPPORTED_IFRAME_HOSTS.find((entry) => src.includes(entry));
    if (!hostMatch) return;

    const url = src;
    const parent = iframe.closest(".generic2wide-iframe-div") || iframe.parentElement;
    if (!parent) return;

    parent.dataset.gdlDecorated = "true";
    if (getComputedStyle(parent).position === "static") {
      parent.style.position = "relative";
    }

    const button = buildButton();
    ["click", "mousedown", "mouseup"].forEach((eventName) => {
      button.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
    });
    const baseUrl = stripTitleParam(url);
    registerTrackedLink(baseUrl, threadTitle, iframe);
    button.addEventListener("click", (event) => sendDownloadRequest(baseUrl, threadTitle, button, event));

    const container = document.createElement("div");
    container.className = CONTAINER_CLASS;
    container.style.position = "absolute";
    container.style.top = "8px";
    container.style.right = "8px";
    container.style.zIndex = "20";
    container.style.pointerEvents = "auto";
    container.appendChild(button);

    parent.appendChild(container);
    iframe.dataset.gdlDecorated = "true";
    attachButtonForLink(baseUrl, button);
  }

  function scanPage(threadTitle) {
    const effectiveTitle = threadTitle || extractThreadTitle();
    const blocks = document.querySelectorAll('div.bbCodeBlock[data-unfurl="true"]');
    blocks.forEach((block) => {
      if (shouldDecorate(block)) {
        decorateBlock(block, effectiveTitle);
      }
    });

    const anchors = document.querySelectorAll("a.link--external[href]");
    anchors.forEach((anchor) => {
      if (shouldDecorateAnchor(anchor)) {
        decorateAnchor(anchor, effectiveTitle);
      }
    });

    const iframes = document.querySelectorAll("iframe[src]");
    iframes.forEach((iframe) => {
      if (shouldDecorateIframe(iframe)) {
        decorateIframe(iframe, effectiveTitle);
      }
    });
  }

  function processSimpcityThread() {
    const threadTitle = extractThreadTitle();
    initDownloadPanel(threadTitle);
    startNotificationStream();
    const observer = new MutationObserver(() => scanPage(threadTitle));
    observer.observe(document.body, { childList: true, subtree: true });
    scanPage(threadTitle);
  }

  whenDocumentReady(() => {
    processSimpcityThread();
  });
})();

  function attachButtonForLink(url, button) {
    if (!url || !button) {
      return;
    }
    const key = stripTitleParam(url);
    let entry = trackedLinks.get(key);
    if (!entry) {
      entry = {
        elements: new Set(),
        buttons: new Set(),
        threadTitle: null,
      };
      trackedLinks.set(key, entry);
    }
    if (!entry.buttons) {
      entry.buttons = new Set();
    }
    entry.buttons.add(button);
    ensureButtonDefaults(button);
    const download = findDownloadForKey(key);
    if (download) {
      setButtonState(button, download.status);
    } else {
      setButtonState(button, "default");
    }
  }

  function ensureButtonDefaults(button) {
    if (!button.dataset.gdlDefaultText) {
      button.dataset.gdlDefaultText = button.textContent || "";
    }
    if (!button.dataset.gdlDefaultBg) {
      button.dataset.gdlDefaultBg = button.style.background || "";
    }
    if (!button.dataset.gdlDefaultBorder) {
      button.dataset.gdlDefaultBorder = button.style.borderColor || "";
    }
    if (!button.dataset.gdlDefaultColor) {
      button.dataset.gdlDefaultColor = button.style.color || "";
    }
    if (!button.dataset.gdlDefaultDisabled) {
      button.dataset.gdlDefaultDisabled = button.disabled ? "true" : "false";
    }
  }

  function setButtonState(button, state) {
    if (!button) {
      return;
    }
    ensureButtonDefaults(button);
    const normalizedState = state || "default";
    button.dataset.gdlButtonState = normalizedState;
    switch (normalizedState) {
      case "queued":
        applyButtonVisuals(button, "Queued ✓", "#198754", "#198754", "#ffffff", true);
        break;
      case "running":
        applyButtonVisuals(button, "Downloading…", "#ffc107", "#ffc107", "#2d2200", true);
        break;
      case "succeeded":
        applyButtonVisuals(button, "Downloaded ✓", "#198754", "#198754", "#ffffff", true);
        break;
      case "failed":
        applyButtonVisuals(button, "Failed ✕", "#dc3545", "#dc3545", "#ffffff", false);
        break;
      default:
        button.textContent = button.dataset.gdlDefaultText || "Send";
        button.style.background = button.dataset.gdlDefaultBg || "";
        button.style.borderColor = button.dataset.gdlDefaultBorder || "";
        button.style.color = button.dataset.gdlDefaultColor || "";
        button.disabled = button.dataset.gdlDefaultDisabled === "true";
        break;
    }
  }

  function applyButtonVisuals(button, text, background, border, color, disabled) {
    button.textContent = text;
    button.style.background = background;
    button.style.borderColor = border;
    button.style.color = color;
    button.disabled = disabled;
  }

  function findDownloadForKey(key) {
    if (!key) {
      return null;
    }
    for (const download of panelState.downloads.values()) {
      if (!download || !download.urls) {
        continue;
      }
      const match = download.urls.some((url) => stripTitleParam(url) === key);
      if (match) {
        return download;
      }
    }
    return null;
  }

  function updateTrackedButtonsForDownload(download) {
    if (!download || !download.urls) {
      return;
    }
    const status = download.status || "default";
    download.urls.forEach((url) => {
      const key = stripTitleParam(url);
      const entry = trackedLinks.get(key);
      if (!entry || !entry.buttons) {
        return;
      }
      entry.buttons.forEach((button) => setButtonState(button, status));
    });
  }

  function resetButtonsForDownload(download) {
    if (!download || !download.urls) {
      return;
    }
    download.urls.forEach((url) => {
      const key = stripTitleParam(url);
      const entry = trackedLinks.get(key);
      if (!entry || !entry.buttons) {
        return;
      }
      entry.buttons.forEach((button) => setButtonState(button, "default"));
    });
  }

  function syncTrackedButtons() {
    panelState.downloads.forEach((download) => {
      updateTrackedButtonsForDownload(download);
    });
  }
