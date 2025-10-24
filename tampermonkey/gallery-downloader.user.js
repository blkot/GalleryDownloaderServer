// ==UserScript==
// @name         Gallery Downloader Sender
// @namespace    https://github.com/xanta/gallerydownloaderserver
// @version      0.1.0
// @description  Send gallery links from SimpCity threads to the Gallery Downloader API.
// @author       You
// @match        https://simpcity.cr/threads/*
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      localhost
// @connect      127.0.0.1
// ==/UserScript==

(function () {
  "use strict";

  const SUPPORTED_HOSTS = ["pixeldrain", "bunkr", "gofile"];
  const BUTTON_CLASS = "gdl-send-button";
  const CONTAINER_CLASS = "gdl-send-container";

  const config = {
    apiBase: GM_getValue("gdl_apiBase", "http://localhost:8080"),
    token: GM_getValue("gdl_token", "changeme"),
  };

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

  function getLinkFromBlock(block) {
    const anchor = block.querySelector("a[href]");
    if (!anchor) return null;
    return anchor.href;
  }

  function sendDownloadRequest(url, threadTitle, button, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const payload = JSON.stringify({
      urls: [url],
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
        } else {
          console.error("Failed to enqueue download", response);
          button.textContent = `Error ${response.status}`;
          button.style.background = "#dc3545";
          button.style.borderColor = "#dc3545";
          button.disabled = false;
          alert(`Failed to enqueue download: ${response.status} ${response.statusText}`);
        }
      },
      onerror: (error) => {
        console.error("Request error", error);
        button.textContent = "Network error";
        button.style.background = "#dc3545";
        button.style.borderColor = "#dc3545";
        button.disabled = false;
        alert("Network error while sending download request.");
      },
    });
  }

  function decorateBlock(block, threadTitle) {
    if (block.dataset.gdlDecorated === "true") {
      return;
    }

    const url = getLinkFromBlock(block);
    if (!url) return;

    block.dataset.gdlDecorated = "true";
    if (getComputedStyle(block).position === "static") {
      block.style.position = "relative";
    }

    const button = buildButton();
    ["click", "mousedown", "mouseup"].forEach((eventName) => {
      button.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
    });
    button.addEventListener("click", (event) => sendDownloadRequest(url, threadTitle, button, event));

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

  function scanPage() {
    const threadTitle = extractThreadTitle();
    const blocks = document.querySelectorAll('div.bbCodeBlock[data-unfurl="true"]');
    blocks.forEach((block) => {
      if (shouldDecorate(block)) {
        decorateBlock(block, threadTitle);
      }
    });
  }

  const observer = new MutationObserver(() => scanPage());
  observer.observe(document.body, { childList: true, subtree: true });

  scanPage();
})();
