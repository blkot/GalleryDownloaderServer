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

  const SUPPORTED_HOSTS = ["pixeldrain", "bunkr", "gofile", "cyberdrop", "redgifs"];
  const SUPPORTED_IFRAME_HOSTS = ["saint2."];
  const DIRECT_PAGE_HOSTS = [
    {
      test: (host) => host === "pixeldrain.com" || host.endsWith(".pixeldrain.com"),
      label: "pixeldrain",
    },
    {
      test: (host) => host.includes("bunkr."),
      label: "bunkr",
    },
    {
      test: (host) => host === "gofile.io" || host.endsWith(".gofile.io"),
      label: "gofile",
    },
    {
      test: (host) => host === "cyberdrop.me" || host.includes("cyberdrop."),
      label: "cyberdrop",
    },
    {
      test: (host) => host === "saint2.cr" || host === "saint2.su" || host.endsWith(".saint2.cr") || host.endsWith(".saint2.su"),
      label: "saint2",
    },
  ];
  const BUTTON_CLASS = "gdl-send-button";
  const CONTAINER_CLASS = "gdl-send-container";
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

  function stripTitleParam(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      parsed.searchParams.delete(TITLE_PARAM_KEY);
      return parsed.toString();
    } catch (error) {
      console.debug("Failed to strip title param", error, url);
      return url;
    }
  }

  function attachTitleParam(url, title) {
    if (!title) {
      return stripTitleParam(url);
    }
    try {
      const parsed = new URL(url, window.location.origin);
      parsed.searchParams.set(TITLE_PARAM_KEY, title);
      return parsed.toString();
    } catch (error) {
      console.debug("Failed to attach title param", error, url);
      return url;
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
    if (anchor.href !== titledUrl) {
      anchor.href = titledUrl;
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

  function getDirectHostConfig() {
    const host = window.location.hostname.toLowerCase();
    return DIRECT_PAGE_HOSTS.find((entry) => {
      try {
        return entry.test(host);
      } catch (error) {
        console.debug("Host test error", error);
        return false;
      }
    });
  }

  function extractDirectPostTitle() {
    const queryTitle = extractTitleFromUrl(window.location.href);
    if (queryTitle) {
      return sanitizeSegment(queryTitle);
    }
    const title = document.title || window.location.hostname;
    return sanitizeSegment(title);
  }

  function decorateDirectPage() {
    if (window.top !== window.self) {
      return;
    }
    if (document.body.dataset.gdlDirectDecorated === "true") {
      return;
    }
    const directConfig = getDirectHostConfig();
    if (!directConfig) {
      return;
    }

    const postTitle = extractDirectPostTitle();
    const url = window.location.href;
    const baseUrl = stripTitleParam(url);

    const button = buildButton("Send to Downloader");
    button.style.position = "fixed";
    button.style.top = "16px";
    button.style.right = "16px";
    button.style.zIndex = "2147483647";
    button.style.padding = "6px 12px";
    button.style.fontSize = "13px";
    button.style.opacity = "0.92";
    button.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.2)";

    ["click", "mousedown", "mouseup"].forEach((eventName) => {
      button.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
    });

    button.addEventListener("click", (event) => sendDownloadRequest(baseUrl, postTitle, button, event));

    document.body.appendChild(button);
    document.body.dataset.gdlDirectDecorated = "true";
  }

  function scanPage() {
    const threadTitle = extractThreadTitle();
    const blocks = document.querySelectorAll('div.bbCodeBlock[data-unfurl="true"]');
    blocks.forEach((block) => {
      if (shouldDecorate(block)) {
        decorateBlock(block, threadTitle);
      }
    });

    const anchors = document.querySelectorAll("a.link--external[href]");
    anchors.forEach((anchor) => {
      if (shouldDecorateAnchor(anchor)) {
        decorateAnchor(anchor, threadTitle);
      }
    });

    const iframes = document.querySelectorAll("iframe[src]");
    iframes.forEach((iframe) => {
      if (shouldDecorateIframe(iframe)) {
        decorateIframe(iframe, threadTitle);
      }
    });
  }

  const isThreadPage =
    window.location.hostname.includes("simpcity.cr") && window.location.pathname.startsWith("/threads/");

  if (isThreadPage) {
    const observer = new MutationObserver(() => scanPage());
    observer.observe(document.body, { childList: true, subtree: true });
    scanPage();
  } else {
    whenDocumentReady(() => {
      decorateDirectPage();
    });
  }
})();
