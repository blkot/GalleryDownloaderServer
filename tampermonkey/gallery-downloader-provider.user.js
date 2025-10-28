// ==UserScript==
// @name         Gallery Downloader – Provider Helper
// @namespace    https://github.com/xanta/gallerydownloaderserver
// @version      0.4.0
// @description  Offer a floating “Send to Downloader” button on supported provider domains.
// @author       You
// @match        https://pixeldrain.com/*
// @match        https://*.pixeldrain.com/*
// @match        https://gofile.io/*
// @match        https://*.gofile.io/*
// @match        https://bunkr.ws/*
// @match        https://*.bunkr.ws/*
// @match        https://bunkrrr.org/*
// @match        https://*.bunkrrr.org/*
// @match        https://bunkr.si/*
// @match        https://*.bunkr.si/*
// @match        https://bunkr.site/*
// @match        https://*.bunkr.site/*
// @match        https://bunkr.ru/*
// @match        https://*.bunkr.ru/*
// @match        https://cyberdrop.me/*
// @match        https://*.cyberdrop.me/*
// @match        https://cyberdrop.cc/*
// @match        https://*.cyberdrop.cc/*
// @match        https://cyberdrop.to/*
// @match        https://*.cyberdrop.to/*
// @match        https://saint2.cr/*
// @match        https://*.saint2.cr/*
// @match        https://saint2.su/*
// @match        https://*.saint2.su/*
// @match        https://redgifs.com/*
// @match        https://*.redgifs.com/*
// @exclude      https://simpcity.cr/*
// @exclude      https://simpcity.su/*
// @exclude      https://simpcity.gs/*
// @noframes
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

  const BUTTON_CLASS = "gdl-send-button";
  const TITLE_PARAM_KEY = "gdl_title";

  const config = {
    apiBase: GM_getValue("gdl_apiBase", "http://localhost:8080"),
    token: GM_getValue("gdl_token", "changeme"),
  };

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

  function buildButton(label = "Send to Downloader") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.className = BUTTON_CLASS;
    button.style.padding = "6px 12px";
    button.style.fontSize = "13px";
    button.style.cursor = "pointer";
    button.style.borderRadius = "4px";
    button.style.border = "1px solid #0066ff";
    button.style.background = "#0d6efd";
    button.style.color = "#fff";
    return button;
  }

  function sanitizeSegment(segment) {
    if (!segment) return "";
    let sanitized = segment.trim().replace(/[\\/:*?"<>|]/g, "_");
    sanitized = sanitized.replace(/\s+/g, "_").replace(/_+/g, "_");
    sanitized = sanitized.replace(/^_+|_+$/g, "");
    return sanitized || "untitled";
  }

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
      if (host.includes("bunkr.")) {
        const mappedHost = Object.entries(BUNKR_HOST_MAP).find(([alias]) => host.endsWith(alias));
        if (mappedHost) {
          parsed.hostname = host.replace(mappedHost[0], mappedHost[1]);
        } else {
          parsed.hostname = host.replace(/bunkr\.[^.]+$/, "bunkr.ws");
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

  function parseProviderContext() {
    try {
      const normalized = normalizeProviderUrl(window.location.href);
      const current = new URL(normalized);
      const downloadUrl = stripTitleParam(current.toString());
      const rawTitle = current.searchParams.get(TITLE_PARAM_KEY);
      const postTitle = rawTitle ? sanitizeSegment(rawTitle) : null;
      return { downloadUrl, postTitle };
    } catch (error) {
      console.debug("Failed to parse provider context", error);
      return { downloadUrl: window.location.href, postTitle: null };
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

  function sendDownloadRequest(url, postTitle, button, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const cleanUrl = stripTitleParam(url);
    const payload = JSON.stringify({
      urls: [cleanUrl],
      post_title: postTitle || null,
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
          notify("Gallery Downloader", postTitle ? `Queued ${postTitle}` : "Download queued");
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
        notify(
          "Gallery Downloader – network error",
          "Network error while sending download request.",
          true
        );
      },
    });
  }

  function updateProviderButton(button, context) {
    if (!button || !context) {
      return;
    }
    const { downloadUrl, postTitle } = context;
    button.dataset.gdlUrl = attachTitleParam(downloadUrl, postTitle);
    button.dataset.gdlTitle = postTitle || "";
    const label = postTitle && postTitle.length > 40 ? `${postTitle.slice(0, 37)}…` : postTitle;
    button.textContent = label ? `Send • ${label}` : "Send to Downloader";
    button.disabled = false;
    button.style.background = "#0d6efd";
    button.style.borderColor = "#0066ff";
  }

  function ensureProviderButton(context) {
    const existing = document.getElementById("gdl-provider-button");
    if (existing) {
      updateProviderButton(existing, context);
      return existing;
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
    updateProviderButton(button, context);

    ["click", "mousedown", "mouseup"].forEach((eventName) => {
      button.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
    });

    button.addEventListener("click", (event) => {
      const downloadUrl = button.dataset.gdlUrl || window.location.href;
      const postTitle = button.dataset.gdlTitle || null;
      sendDownloadRequest(downloadUrl, postTitle, button, event);
    });

    container.appendChild(button);
    document.body.appendChild(container);
    return button;
  }

  function processProviderPage() {
    const initialContext = parseProviderContext();
    const button = ensureProviderButton(initialContext);

    const handleLocationChange = () => {
      const updated = parseProviderContext();
      updateProviderButton(button, updated);
    };

    window.addEventListener("popstate", handleLocationChange);
    window.addEventListener("hashchange", handleLocationChange);

    const observer = new MutationObserver(() => {
      const current = parseProviderContext();
      updateProviderButton(button, current);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  const isFramed = window.top !== window.self;

  if (!isFramed) {
    whenDocumentReady(() => {
      processProviderPage();
    });
  }
})();
