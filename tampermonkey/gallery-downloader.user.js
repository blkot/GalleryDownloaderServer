// ==UserScript==
// @name         Gallery Downloader Sender
// @namespace    https://github.com/xanta/gallerydownloaderserver
// @version      0.3.0
// @description  Send gallery links from SimpCity threads or supported hosts to the Gallery Downloader API.
// @author       You
// @match        https://simpcity.cr/threads/*
// @match        https://pixeldrain.com/*
// @include      https://*bunkr.*/*
// @match        https://gofile.io/*
// @match        https://cyberdrop.me/*
// @include      https://*cyberdrop.*/*
// @match        https://saint2.cr/*
// @match        https://saint2.su/*
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
  const PROVIDER_MATCHERS = [
    (host) => host.includes("bunkr."),
    (host) => host.includes("pixeldrain."),
    (host) => host.includes("gofile"),
    (host) => host.includes("cyberdrop"),
    (host) => host.includes("saint2."),
    (host) => host.includes("redgifs."),
  ];
  const BUTTON_CLASS = "gdl-send-button";
  const CONTAINER_CLASS = "gdl-send-container";
  const TITLE_PARAM_KEY = "gdl_title";

  const config = {
    apiBase: GM_getValue("gdl_apiBase", "http://localhost:8080"),
    token: GM_getValue("gdl_token", "changeme"),
  };

  const NOTIFICATION_WS_PATH = "/ws/notifications";
  const NOTIFIED_IDS_KEY = "gdl_notified_ids";
  const MAX_BACKOFF_SECONDS = 30;
  let notificationSocket = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;

  function isSimpcityHost(host) {
    return host.endsWith("simpcity.cr") || host.endsWith("simpcity.su") || host.endsWith("simpcity.gs");
  }

  function isProviderHost(host) {
    return PROVIDER_MATCHERS.some((fn) => {
      try {
        return fn(host);
      } catch {
        return false;
      }
    });
  }

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

  function buildWebSocketUrl() {
    if (!config.apiBase) {
      return null;
    }
    const trimmedBase = config.apiBase.replace(/\/+$/, "");
    const protocol = trimmedBase.startsWith("https://") ? "wss://" : "ws://";
    const host = trimmedBase.replace(/^https?:\/\//, "");
    return `${protocol}${host}${NOTIFICATION_WS_PATH}?token=${encodeURIComponent(config.token)}`;
  }

  function handleNotificationMessage(payload) {
    if (!payload || typeof payload !== "object") {
      return;
    }
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
    const subtitle =
      urlCount > 1 ? `${urlCount} items queued` : payload.urls && payload.urls[0] ? payload.urls[0] : "Queued";
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
    if (!wsUrl) {
      return;
    }
    try {
      notificationSocket = new WebSocket(wsUrl);
    } catch (error) {
      console.debug("Failed to create WebSocket", error);
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
        console.debug("Failed to parse notification", error, event.data);
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
  });

  function normalizeProviderUrl(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      const host = parsed.hostname.toLowerCase();
      if (host.includes("bunkr.")) {
        const suffixMatch = host.match(/bunkr\.[^.]+$/);
        if (suffixMatch && suffixMatch[0] !== "bunkr.ws") {
          parsed.hostname = host.replace(suffixMatch[0], "bunkr.ws");
        }
        if (parsed.pathname.startsWith("/v/")) {
          parsed.pathname = parsed.pathname.replace("/v/", "/f/");
        } else if (parsed.pathname.startsWith("/d/")) {
          parsed.pathname = parsed.pathname.replace("/d/", "/f/");
        }
      }
      return parsed.toString();
    } catch (error) {
      console.debug("Failed to normalize provider url", error, url);
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
    if (!anchor) return null;
    return anchor.href;
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
          notify(
            "Gallery Downloader – error",
            `Failed to queue download (${response.status} ${response.statusText})`,
            true
          );
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

    const baseUrl = stripTitleParam(rawUrl);
    const titledUrl = attachTitleParam(baseUrl, threadTitle);
    const anchor = block.querySelector("a[href]");
    if (anchor && anchor.href !== titledUrl) {
      anchor.href = titledUrl;
      anchor.setAttribute("href", titledUrl);
      if (anchor.dataset && "proxyHref" in anchor.dataset) {
        anchor.dataset.proxyHref = titledUrl;
        anchor.setAttribute("data-proxy-href", titledUrl);
      }
      anchor.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopPropagation();
          const target = anchor.target || "_blank";
          if (target === "_self") {
            window.location.href = titledUrl;
          } else {
            window.open(titledUrl, target);
          }
        },
        { capture: true }
      );
    }

    block.dataset.url = titledUrl;
    block.setAttribute("data-url", titledUrl);
    if ("proxyHref" in block.dataset || block.hasAttribute("data-proxy-href")) {
      block.dataset.proxyHref = titledUrl;
      block.setAttribute("data-proxy-href", titledUrl);
    }

    const button = buildButton();
    ["click", "mousedown", "mouseup"].forEach((eventName) => {
      button.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
    });
    button.addEventListener("click", (event) => sendDownloadRequest(baseUrl, threadTitle, button, event));

    const container = document.createElement("div");
    container.className = CONTAINER_CLASS;
    container.style.position = "absolute";
    container.style.top = "8px";
    container.style.right = "8px";
    container.style.zIndex = "20";
    container.style.pointerEvents = "auto";
    container.appendChild(button);

    block.appendChild(container);
  }

  function decorateAnchor(anchor, threadTitle) {
    if (anchor.dataset.gdlDecorated === "true") {
      return;
    }

    const rawUrl = anchor.getAttribute("href");
    if (!rawUrl) return;

    const baseUrl = stripTitleParam(rawUrl);
    const titledUrl = attachTitleParam(baseUrl, threadTitle);
    anchor.href = titledUrl;
    anchor.setAttribute("href", titledUrl);
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
    const titledUrl = attachTitleParam(baseUrl, threadTitle);
    if (iframe.src !== titledUrl) {
      iframe.src = titledUrl;
    }
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

  function parseProviderContext() {
    try {
      const normalized = normalizeProviderUrl(window.location.href);
      const current = new URL(normalized);
      const downloadUrl = current.toString();
      const rawTitle = current.searchParams.get(TITLE_PARAM_KEY);
      const postTitle = rawTitle ? sanitizeSegment(rawTitle) : null;
      return { downloadUrl, postTitle };
    } catch (error) {
      console.debug("Failed to parse provider context", error);
      return { downloadUrl: window.location.href, postTitle: null };
    }
  }

  function updateProviderButton(button, context) {
    if (!button || !context) {
      return;
    }
    const { downloadUrl, postTitle } = context;
    button.dataset.gdlUrl = downloadUrl;
    button.dataset.gdlTitle = postTitle || "";
    const label =
      postTitle && postTitle.length > 40 ? `${postTitle.slice(0, 37)}…` : postTitle;
    button.textContent = label ? `Send • ${label}` : "Send to Downloader";
    button.disabled = false;
    button.style.background = "#0d6efd";
    button.style.borderColor = "#0066ff";
  }

  function ensureProviderButton(context) {
    const existing = document.getElementById("gdl-provider-button");
    if (existing) {
      updateProviderButton(existing, context);
      return;
    }
    const container = document.createElement("div");
    container.id = "gdl-provider-button-container";
    container.style.position = "fixed";
    container.style.top = "16px";
    container.style.right = "16px";
    container.style.zIndex = "2147483647";
    container.style.pointerEvents = "auto";

    const button = buildButton("Send to Downloader");
    button.id = "gdl-provider-button";
    button.style.marginTop = "0";
    button.style.padding = "6px 12px";
    button.style.fontSize = "13px";
    updateProviderButton(button, context);
    button.addEventListener("click", (event) => {
      const downloadUrl = button.dataset.gdlUrl || window.location.href;
      const postTitle = button.dataset.gdlTitle || null;
      console.log("Provider button clicked", downloadUrl, postTitle);
      sendDownloadRequest(downloadUrl, postTitle, button, event);
    });

    container.appendChild(button);
    document.body.appendChild(container);
  }

  function processProviderPage() {
    const context = parseProviderContext();
    ensureProviderButton(context);
    const handleLocationChange = () => {
      const updated = parseProviderContext();
      ensureProviderButton(updated);
    };
    window.addEventListener("popstate", handleLocationChange);
    window.addEventListener("hashchange", handleLocationChange);
  }

  function processSimpcityThread() {
    startNotificationStream();
    const threadTitle = extractThreadTitle();
    const observer = new MutationObserver(() => scanPage(threadTitle));
    observer.observe(document.body, { childList: true, subtree: true });
    scanPage(threadTitle);
  }

  const host = window.location.hostname.toLowerCase();
  const isThreadPage = isSimpcityHost(host) && window.location.pathname.startsWith("/threads/");

  if (isThreadPage) {
    whenDocumentReady(() => {
      processSimpcityThread();
    });
  } else if (isProviderHost(host)) {
    whenDocumentReady(() => {
      processProviderPage();
    });
  }
})();
