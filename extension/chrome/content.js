const BUTTON_SELECTOR = "[data-dlpgui-button]";
const WATCH_BUTTON_SELECTOR = "[data-dlpgui-watch-button]";
const MENU_ITEM_SELECTOR = "[data-dlpgui-menu-item]";
const CARD_ROOT_SELECTORS = [
  "ytd-rich-item-renderer",
  "ytd-video-renderer",
  "ytd-grid-video-renderer",
  "ytd-compact-video-renderer",
  "ytd-playlist-video-renderer",
  "ytd-rich-grid-media",
];
const QUALITY_OPTIONS = [
  {
    label: "High (1080p)",
    formatString: "bv*[height<=1080]+ba/b[height<=1080]/best",
    note: "MP4",
  },
  {
    label: "HD (720p)",
    formatString: "bv*[height<=720]+ba/b[height<=720]/best",
    note: "MP4",
  },
  {
    label: "Standard (480p)",
    formatString: "bv*[height<=480]+ba/b[height<=480]/best",
    note: "MP4",
  },
  {
    label: "Low (360p)",
    formatString: "bv*[height<=360]+ba/b[height<=360]/best",
    note: "MP4",
  },
  {
    label: "Low (144p)",
    formatString: "bv*[height<=144]+ba/b[height<=144]/best",
    note: "MP4",
  },
  {
    label: "Audio Only (Best)",
    formatString: "ba/b",
    note: "Audio",
  },
];

let queuedRender = false;
let activePickerCleanup = null;
let activeMenuActionCleanup = null;
let lastMenuContext = null;
let lastMenuTriggerElement = null;

function setMenuContext(meta, source, triggerElement = null) {
  lastMenuTriggerElement = triggerElement;
  lastMenuContext = {
    meta,
    source,
    createdAt: Date.now(),
  };
}

function attachMenuMeta(trigger, meta, source) {
  if (!(trigger instanceof Element) || !meta?.url) {
    return;
  }

  trigger.setAttribute("data-dlpgui-menu-url", meta.url);
  trigger.setAttribute("data-dlpgui-menu-title", meta.title || "");
  trigger.setAttribute("data-dlpgui-menu-source", source);

  const nestedButton = trigger.querySelector?.("button");
  if (nestedButton instanceof Element) {
    nestedButton.setAttribute("data-dlpgui-menu-url", meta.url);
    nestedButton.setAttribute("data-dlpgui-menu-title", meta.title || "");
    nestedButton.setAttribute("data-dlpgui-menu-source", source);
  }
}

function createToastHost() {
  let host = document.getElementById("dlpgui-toast-host");
  if (host) {
    return host;
  }

  host = document.createElement("div");
  host.id = "dlpgui-toast-host";
  host.style.position = "fixed";
  host.style.right = "16px";
  host.style.bottom = "16px";
  host.style.zIndex = "999999";
  host.style.display = "flex";
  host.style.flexDirection = "column";
  host.style.gap = "8px";
  document.documentElement.appendChild(host);
  return host;
}

function showToast(message, ok = true) {
  const host = createToastHost();
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.background = ok ? "rgba(5, 150, 105, 0.94)" : "rgba(185, 28, 28, 0.94)";
  toast.style.color = "#fff";
  toast.style.padding = "10px 12px";
  toast.style.borderRadius = "999px";
  toast.style.fontSize = "12px";
  toast.style.fontWeight = "600";
  toast.style.boxShadow = "0 10px 25px rgba(0, 0, 0, 0.24)";
  toast.style.maxWidth = "320px";
  host.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 2400);
}

function canonicalizeVideoUrl(rawUrl) {
  try {
    const url = new URL(rawUrl, window.location.origin);
    if (!url.hostname.includes("youtube.com")) {
      return null;
    }

    if (url.pathname === "/watch" && url.searchParams.has("v")) {
      return url.toString();
    }

    if (url.pathname.startsWith("/shorts/")) {
      return url.toString();
    }

    return null;
  } catch {
    return null;
  }
}

function extractVideoMeta(root) {
  const link =
    root.querySelector('a#thumbnail[href*="/watch"], a#video-title[href*="/watch"], a[href*="/shorts/"]') ||
    root.querySelector('a[href*="/watch"], a[href*="/shorts/"]');

  if (!link) {
    return null;
  }

  const url = canonicalizeVideoUrl(link.getAttribute("href") || "");
  if (!url) {
    return null;
  }

  const title =
    link.getAttribute("title") ||
    root.querySelector("#video-title")?.textContent?.trim() ||
    root.querySelector("#title")?.textContent?.trim() ||
    document.title;

  return { url, title };
}

function getWatchVideoMeta(watchRoot = document.querySelector("ytd-watch-metadata")) {
  if (!watchRoot) {
    return null;
  }

  const currentUrl = canonicalizeVideoUrl(window.location.href);
  if (!currentUrl) {
    return null;
  }

  return {
    url: currentUrl,
    title:
      watchRoot.querySelector("h1")?.textContent?.trim() ||
      document.title.replace(/\s*-\s*YouTube\s*$/, ""),
  };
}

function isFreshMenuContext() {
  return Boolean(lastMenuContext && Date.now() - lastMenuContext.createdAt < 4000);
}

function isLikelyMenuTrigger(target, scopeRoot) {
  if (!(target instanceof Element)) {
    return false;
  }

  const trigger = target.closest("button, tp-yt-paper-icon-button, yt-icon-button, ytd-menu-renderer");
  if (!trigger || (scopeRoot && !scopeRoot.contains(trigger))) {
    return false;
  }

  const nestedButton = trigger.querySelector?.("button");
  const ariaLabel = (
    trigger.getAttribute("aria-label") ||
    nestedButton?.getAttribute?.("aria-label") ||
    ""
  ).toLowerCase();

  if (ariaLabel.includes("action menu") || ariaLabel.includes("more actions") || ariaLabel.includes("more")) {
    return true;
  }

  return Boolean(
    trigger.closest("#menu") ||
    trigger.closest("#menu-container") ||
    trigger.closest("ytd-menu-renderer")
  );
}

function rememberMenuContext(target) {
  if (!(target instanceof Element)) {
    return;
  }

  if (target.closest(BUTTON_SELECTOR) || target.closest(WATCH_BUTTON_SELECTOR) || target.closest(MENU_ITEM_SELECTOR)) {
    return;
  }

  for (const selector of CARD_ROOT_SELECTORS) {
    const root = target.closest(selector);
    if (!root) {
      continue;
    }

    if (!isLikelyMenuTrigger(target, root)) {
      continue;
    }

    const meta = extractVideoMeta(root);
    if (!meta) {
      return;
    }

    setMenuContext(
      meta,
      "YouTube card menu",
      target.closest("button, tp-yt-paper-icon-button, yt-icon-button, ytd-menu-renderer")
    );
    return;
  }

  const watchRoot = target.closest("ytd-watch-metadata");
  if (!watchRoot) {
    return;
  }

  if (!isLikelyMenuTrigger(target, watchRoot)) {
    return;
  }

  const meta = getWatchVideoMeta(watchRoot);
  if (!meta) {
    return;
  }

  setMenuContext(
    meta,
    "YouTube watch menu",
    target.closest("button, tp-yt-paper-icon-button, yt-icon-button, ytd-menu-renderer")
  );
}

function resolveMenuContextFromElement(element) {
  if (!(element instanceof Element)) {
    return null;
  }

  const taggedTrigger = element.closest("[data-dlpgui-menu-url]");
  if (taggedTrigger instanceof Element) {
    const url = taggedTrigger.getAttribute("data-dlpgui-menu-url");
    if (url) {
      return {
        meta: {
          url,
          title: taggedTrigger.getAttribute("data-dlpgui-menu-title") || document.title,
        },
        source: taggedTrigger.getAttribute("data-dlpgui-menu-source") || "YouTube card menu",
        createdAt: Date.now(),
      };
    }
  }

  for (const selector of CARD_ROOT_SELECTORS) {
    const root = element.closest(selector);
    if (!root) {
      continue;
    }

    const meta = extractVideoMeta(root);
    if (!meta) {
      return null;
    }

    return {
      meta,
      source: "YouTube card menu",
      createdAt: Date.now(),
    };
  }

  const watchRoot = element.closest("ytd-watch-metadata");
  if (!watchRoot) {
    return null;
  }

  const meta = getWatchVideoMeta(watchRoot);
  if (!meta) {
    return null;
  }

  return {
    meta,
    source: "YouTube watch menu",
    createdAt: Date.now(),
  };
}

function ensureMenuContext() {
  if (isFreshMenuContext()) {
    return lastMenuContext;
  }

  const candidates = [
    document.querySelector('[data-dlpgui-menu-url][aria-expanded="true"]'),
    document.querySelector('button[data-dlpgui-menu-url][aria-expanded="true"]'),
    document.querySelector('tp-yt-paper-icon-button[data-dlpgui-menu-url][aria-expanded="true"]'),
    document.activeElement,
    lastMenuTriggerElement,
    document.querySelector('button[aria-label*="Action menu"]:focus'),
    document.querySelector('button[aria-label*="More actions"]:focus'),
    document.querySelector('ytd-menu-renderer:focus-within'),
  ];

  for (const candidate of candidates) {
    const context = resolveMenuContextFromElement(candidate);
    if (context) {
      lastMenuContext = context;
      return context;
    }
  }

  return null;
}

function bindNativeMenuTriggers(root, meta, source) {
  root
    .querySelectorAll(
      '#menu button, #menu-container button, ytd-menu-renderer button, tp-yt-paper-icon-button, yt-icon-button'
    )
    .forEach((trigger) => {
      if (!(trigger instanceof Element)) {
        return;
      }

      if (trigger.getAttribute("data-dlpgui-native-menu-bound") === "true") {
        return;
      }

      trigger.setAttribute("data-dlpgui-native-menu-bound", "true");
      attachMenuMeta(trigger, meta, source);
      const anchorElement = trigger instanceof HTMLElement
        ? trigger
        : trigger.querySelector("button") instanceof HTMLElement
          ? trigger.querySelector("button")
          : null;

      const remember = () => {
        setMenuContext(meta, source, trigger);
      };

      const openPanel = (event) => {
        if (event.defaultPrevented) {
          return;
        }

        window.setTimeout(() => {
          openMenuActionPanel(meta, anchorElement, source);
        }, 0);
      };

      trigger.addEventListener("mousedown", remember, true);
      trigger.addEventListener("focusin", remember, true);
      trigger.addEventListener("mouseenter", remember, true);
      trigger.addEventListener("click", remember, true);
      trigger.addEventListener("click", openPanel, true);
    });
}

function setButtonState(button, label, disabled = false) {
  const labelTarget =
    button instanceof HTMLElement
      ? button.querySelector("[data-dlpgui-watch-label]") || button
      : button;

  labelTarget.textContent = label;
  if ("disabled" in button) {
    button.disabled = disabled;
  }
  button.style.opacity = disabled ? "0.82" : "1";
  button.style.cursor = disabled ? "wait" : "pointer";

  if (button instanceof HTMLElement) {
    const innerControl = button.matches("button, a[role='button']")
      ? button
      : button.querySelector("button, a[role='button']");
    if (innerControl instanceof HTMLElement) {
      innerControl.style.cursor = disabled ? "wait" : "pointer";
      innerControl.setAttribute("aria-disabled", disabled ? "true" : "false");
      if ("disabled" in innerControl) {
        innerControl.disabled = disabled;
      }
    }
  }
}

function resetButtonState(button) {
  setButtonState(button, button.dataset.defaultLabel || "Download in dlp-gui", false);
}

function closeActivePicker() {
  if (typeof activePickerCleanup === "function") {
    activePickerCleanup();
    activePickerCleanup = null;
  }
}

function closeActiveMenuAction() {
  if (typeof activeMenuActionCleanup === "function") {
    activeMenuActionCleanup();
    activeMenuActionCleanup = null;
  }
}

function openMenuActionPanel(meta, triggerElement, source) {
  if (!(triggerElement instanceof HTMLElement) || !meta?.url) {
    return;
  }

  const activePanel = document.querySelector('[data-dlpgui-menu-panel="true"]');
  if (activePanel instanceof HTMLElement) {
    const currentTrigger = activePanel.getAttribute("data-dlpgui-trigger-url");
    if (currentTrigger === meta.url) {
      closeActiveMenuAction();
      return;
    }
  }

  closeActiveMenuAction();

  const panel = document.createElement("div");
  panel.setAttribute("data-dlpgui-menu-panel", "true");
  panel.setAttribute("data-dlpgui-trigger-url", meta.url);
  panel.style.position = "fixed";
  panel.style.zIndex = "2147483647";
  panel.style.minWidth = "220px";
  panel.style.maxWidth = "260px";
  panel.style.background = "#ffffff";
  panel.style.border = "1px solid rgba(148, 163, 184, 0.22)";
  panel.style.borderRadius = "14px";
  panel.style.boxShadow = "0 20px 48px rgba(15, 23, 42, 0.24)";
  panel.style.padding = "8px";
  panel.style.fontFamily = "Roboto, Arial, sans-serif";

  const button = document.createElement("button");
  button.type = "button";
  button.style.width = "100%";
  button.style.display = "flex";
  button.style.alignItems = "center";
  button.style.justifyContent = "space-between";
  button.style.gap = "12px";
  button.style.padding = "10px 12px";
  button.style.border = "0";
  button.style.borderRadius = "10px";
  button.style.background = "transparent";
  button.style.color = "#111827";
  button.style.cursor = "pointer";
  button.style.fontSize = "14px";
  button.style.textAlign = "left";

  const left = document.createElement("div");
  left.style.display = "flex";
  left.style.alignItems = "center";
  left.style.gap = "10px";

  const badge = document.createElement("span");
  badge.textContent = "dlp";
  badge.style.width = "24px";
  badge.style.height = "24px";
  badge.style.display = "inline-flex";
  badge.style.alignItems = "center";
  badge.style.justifyContent = "center";
  badge.style.borderRadius = "999px";
  badge.style.background = "rgba(99, 102, 241, 0.12)";
  badge.style.color = "#4338ca";
  badge.style.fontSize = "9px";
  badge.style.fontWeight = "700";
  badge.style.letterSpacing = "0.08em";
  badge.style.textTransform = "uppercase";

  const labelWrap = document.createElement("div");
  labelWrap.style.display = "flex";
  labelWrap.style.flexDirection = "column";

  const title = document.createElement("span");
  title.textContent = "Download in dlp-gui";
  title.style.fontSize = "14px";
  title.style.fontWeight = "500";
  title.style.color = "#111827";

  const subtitle = document.createElement("span");
  subtitle.textContent = "Choose quality";
  subtitle.style.fontSize = "11px";
  subtitle.style.color = "#64748b";
  subtitle.style.marginTop = "2px";

  labelWrap.appendChild(title);
  labelWrap.appendChild(subtitle);
  left.appendChild(badge);
  left.appendChild(labelWrap);

  const chevron = document.createElement("span");
  chevron.textContent = ">";
  chevron.style.fontSize = "14px";
  chevron.style.color = "#64748b";

  button.appendChild(left);
  button.appendChild(chevron);

  button.addEventListener("mouseenter", () => {
    button.style.background = "rgba(239, 246, 255, 0.98)";
  });
  button.addEventListener("mouseleave", () => {
    button.style.background = "transparent";
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeActiveMenuAction();
    openQualityPicker(meta, triggerElement, source);
  });

  panel.appendChild(button);
  document.documentElement.appendChild(panel);

  const placePanel = () => {
    if (!document.documentElement.contains(triggerElement)) {
      closeActiveMenuAction();
      return;
    }

    const rect = triggerElement.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      closeActiveMenuAction();
      return;
    }

    const panelRect = panel.getBoundingClientRect();
    let left = rect.right + 8;
    let top = rect.top - 4;

    if (left + panelRect.width > window.innerWidth - 8) {
      left = rect.left - panelRect.width - 8;
    }
    if (left < 8) {
      left = Math.max(8, window.innerWidth - panelRect.width - 8);
    }
    if (top + panelRect.height > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - panelRect.height - 8);
    }
    if (top < 8) {
      top = 8;
    }

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  };

  const onOutside = (event) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    if (panel.contains(target) || triggerElement.contains(target)) {
      return;
    }
    closeActiveMenuAction();
  };

  const onEscape = (event) => {
    if (event.key === "Escape") {
      closeActiveMenuAction();
    }
  };

  placePanel();
  window.addEventListener("resize", placePanel);
  window.addEventListener("scroll", placePanel, true);
  document.addEventListener("mousedown", onOutside, true);
  document.addEventListener("keydown", onEscape, true);

  activeMenuActionCleanup = () => {
    panel.remove();
    window.removeEventListener("resize", placePanel);
    window.removeEventListener("scroll", placePanel, true);
    document.removeEventListener("mousedown", onOutside, true);
    document.removeEventListener("keydown", onEscape, true);
    activeMenuActionCleanup = null;
  };
}

async function sendToApp(meta, choice, button, source) {
  setButtonState(button, "Sending...", true);

  try {
    const result = await chrome.runtime.sendMessage({
      type: "dlpgui-queue-download",
      url: meta.url,
      title: meta.title,
      source,
      formatString: choice.formatString,
      qualityLabel: choice.label + (choice.subtitles ? " + subtitles" : ""),
      subtitles: Boolean(choice.subtitles),
    });

    if (!result?.ok) {
      throw new Error(result?.error || "The dlp-gui app is not reachable.");
    }

    setButtonState(button, "Queued", true);
    showToast(`Queued ${choice.label}${choice.subtitles ? " + subtitles" : ""}`, true);
    window.setTimeout(() => resetButtonState(button), 1700);
  } catch (error) {
    setButtonState(button, "Offline", false);
    showToast(error instanceof Error ? error.message : String(error), false);
    window.setTimeout(() => resetButtonState(button), 1800);
  }
}

function createRadio(isSubtitle) {
  const radio = document.createElement("span");
  radio.style.width = "14px";
  radio.style.height = "14px";
  radio.style.borderRadius = "999px";
  radio.style.border = "1.5px solid #0f172a";
  radio.style.display = "inline-flex";
  radio.style.alignItems = "center";
  radio.style.justifyContent = "center";
  radio.style.flex = "0 0 auto";

  const dot = document.createElement("span");
  dot.style.width = "6px";
  dot.style.height = "6px";
  dot.style.borderRadius = "999px";
  dot.style.background = isSubtitle ? "#2563eb" : "#111827";
  radio.appendChild(dot);

  return radio;
}

function buildChoiceRow(meta, button, choice, source) {
  const row = document.createElement("button");
  row.type = "button";
  row.style.width = "100%";
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.justifyContent = "space-between";
  row.style.gap = "12px";
  row.style.padding = "10px 14px";
  row.style.border = "0";
  row.style.borderLeft = "3px solid transparent";
  row.style.background = "transparent";
  row.style.color = "#111827";
  row.style.textAlign = "left";
  row.style.cursor = "pointer";
  row.style.transform = "translateX(0)";
  row.style.transition = "background 120ms ease, transform 120ms ease, border-color 120ms ease";

  const left = document.createElement("div");
  left.style.display = "flex";
  left.style.alignItems = "center";
  left.style.gap = "12px";
  left.style.minWidth = "0";

  const labelWrap = document.createElement("div");
  labelWrap.style.display = "flex";
  labelWrap.style.flexDirection = "column";
  labelWrap.style.minWidth = "0";

  const title = document.createElement("span");
  title.textContent = choice.label;
  title.style.fontSize = "13px";
  title.style.fontWeight = "500";
  title.style.color = "#111827";
  labelWrap.appendChild(title);

  if (choice.subtitles) {
    const subtitle = document.createElement("span");
    subtitle.textContent = "With embedded subtitles";
    subtitle.style.fontSize = "11px";
    subtitle.style.color = "#64748b";
    subtitle.style.marginTop = "2px";
    labelWrap.appendChild(subtitle);
  }

  left.appendChild(createRadio(choice.subtitles));
  left.appendChild(labelWrap);

  const note = document.createElement("span");
  note.textContent = choice.subtitles ? "CC" : choice.note;
  note.style.fontSize = "11px";
  note.style.fontWeight = "600";
  note.style.color = "#64748b";
  note.style.flex = "0 0 auto";
  note.style.transition = "color 120ms ease";

  row.appendChild(left);
  row.appendChild(note);

  row.addEventListener("mouseenter", () => {
    row.style.background = "rgba(239, 246, 255, 0.98)";
    row.style.borderLeftColor = choice.subtitles ? "#2563eb" : "#111827";
    row.style.transform = "translateX(2px)";
    note.style.color = choice.subtitles ? "#2563eb" : "#111827";
  });
  row.addEventListener("mouseleave", () => {
    row.style.background = "transparent";
    row.style.borderLeftColor = "transparent";
    row.style.transform = "translateX(0)";
    note.style.color = "#64748b";
  });
  row.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeActivePicker();
    void sendToApp(meta, choice, button, source);
  });

  return row;
}

function buildSection(meta, button, titleText, withSubtitles, source) {
  const section = document.createElement("div");

  const label = document.createElement("div");
  label.textContent = titleText;
  label.style.padding = "8px 14px 6px";
  label.style.fontSize = "10px";
  label.style.fontWeight = "700";
  label.style.letterSpacing = "0.08em";
  label.style.textTransform = "uppercase";
  label.style.color = "#94a3b8";
  section.appendChild(label);

  QUALITY_OPTIONS.forEach((option) => {
    if (withSubtitles && option.formatString === "ba/b") {
      return;
    }

    section.appendChild(
      buildChoiceRow(
        meta,
        button,
        {
          ...option,
          subtitles: withSubtitles,
        },
        source
      )
    );
  });

  return section;
}

function positionCard(card, anchorButton) {
  const rect = anchorButton.getBoundingClientRect();
  const cardWidth = 272;
  const gap = 10;
  const left = Math.min(
    window.innerWidth - cardWidth - 12,
    Math.max(12, rect.right - cardWidth)
  );
  let top = rect.bottom + gap;

  if (top + card.offsetHeight > window.innerHeight - 12) {
    top = Math.max(12, rect.top - card.offsetHeight - gap);
  }

  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
}

function openQualityPicker(meta, anchorButton, source) {
  closeActivePicker();

  const card = document.createElement("div");
  card.setAttribute("data-dlpgui-picker", "true");
  card.style.position = "fixed";
  card.style.zIndex = "999998";
  card.style.width = "272px";
  card.style.background = "#ffffff";
  card.style.border = "1px solid rgba(148, 163, 184, 0.25)";
  card.style.borderRadius = "14px";
  card.style.boxShadow = "0 20px 48px rgba(15, 23, 42, 0.24)";
  card.style.overflow = "hidden";
  card.style.fontFamily = "Roboto, Arial, sans-serif";

  const header = document.createElement("div");
  header.textContent = "Download Quality";
  header.style.padding = "14px 16px 10px";
  header.style.fontSize = "15px";
  header.style.fontWeight = "500";
  header.style.color = "#111827";
  card.appendChild(header);

  card.appendChild(buildSection(meta, anchorButton, "Video only", false, source));

  const divider = document.createElement("div");
  divider.style.height = "1px";
  divider.style.background = "#e5e7eb";
  divider.style.margin = "4px 14px";
  card.appendChild(divider);

  card.appendChild(buildSection(meta, anchorButton, "With subtitles", true, source));

  document.documentElement.appendChild(card);
  positionCard(card, anchorButton);

  const handleDocumentClick = (event) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    if (card.contains(target) || anchorButton.contains(target)) {
      return;
    }

    closeActivePicker();
  };

  const handleEscape = (event) => {
    if (event.key === "Escape") {
      closeActivePicker();
    }
  };

  const handleLayoutChange = () => {
    if (!document.documentElement.contains(anchorButton)) {
      closeActivePicker();
      return;
    }

    positionCard(card, anchorButton);
  };

  window.addEventListener("resize", handleLayoutChange);
  window.addEventListener("scroll", handleLayoutChange, true);
  document.addEventListener("mousedown", handleDocumentClick, true);
  document.addEventListener("keydown", handleEscape, true);

  activePickerCleanup = () => {
    card.remove();
    window.removeEventListener("resize", handleLayoutChange);
    window.removeEventListener("scroll", handleLayoutChange, true);
    document.removeEventListener("mousedown", handleDocumentClick, true);
    document.removeEventListener("keydown", handleEscape, true);
    activePickerCleanup = null;
  };
}

function buildPopupMenuItem(meta, popupAnchor, popupRoot, source) {
  const popupColor = getComputedStyle(popupRoot).color || "#0f172a";
  const isDarkPopup = popupColor === "rgb(255, 255, 255)" || popupColor === "rgb(249, 250, 251)";
  const mutedColor = isDarkPopup ? "#d1d5db" : "#475569";
  const hoverBackground = isDarkPopup ? "rgba(255, 255, 255, 0.08)" : "rgba(15, 23, 42, 0.06)";
  const container = document.createElement("div");
  container.setAttribute("data-dlpgui-menu-item", "true");
  container.style.display = "block";
  container.style.width = "100%";
  container.style.boxSizing = "border-box";
  container.style.padding = "6px 8px 4px";
  container.style.background = "transparent";
  container.style.borderBottom = isDarkPopup
    ? "1px solid rgba(255, 255, 255, 0.08)"
    : "1px solid rgba(15, 23, 42, 0.08)";

  const item = document.createElement("button");
  item.type = "button";
  item.style.width = "100%";
  item.style.display = "flex";
  item.style.alignItems = "center";
  item.style.justifyContent = "space-between";
  item.style.gap = "12px";
  item.style.minHeight = "40px";
  item.style.padding = "10px 12px";
  item.style.border = "0";
  item.style.borderRadius = "10px";
  item.style.background = "transparent";
  item.style.color = popupColor;
  item.style.cursor = "pointer";
  item.style.fontFamily = "Roboto, Arial, sans-serif";
  item.style.fontSize = "14px";
  item.style.textAlign = "left";
  item.style.transition = "background 120ms ease";

  const labelWrap = document.createElement("div");
  labelWrap.style.display = "flex";
  labelWrap.style.alignItems = "center";
  labelWrap.style.gap = "12px";
  labelWrap.style.minWidth = "0";

  const glyph = document.createElement("span");
  glyph.textContent = "↓";
  glyph.textContent = "dlp";
  glyph.style.width = "24px";
  glyph.style.height = "24px";
  glyph.style.display = "inline-flex";
  glyph.style.alignItems = "center";
  glyph.style.justifyContent = "center";
  glyph.style.fontSize = "9px";
  glyph.style.fontWeight = "700";
  glyph.style.letterSpacing = "0.08em";
  glyph.style.textTransform = "uppercase";
  glyph.style.borderRadius = "999px";
  glyph.style.color = isDarkPopup ? "#c7d2fe" : "#4338ca";
  glyph.style.background = isDarkPopup ? "rgba(99, 102, 241, 0.18)" : "rgba(99, 102, 241, 0.12)";

  const label = document.createElement("span");
  label.textContent = "Download in dlp-gui";
  label.style.color = "inherit";

  labelWrap.appendChild(glyph);
  labelWrap.appendChild(label);

  const badge = document.createElement("span");
  badge.textContent = "Quality";
  badge.style.fontSize = "11px";
  badge.style.fontWeight = "500";
  badge.style.color = mutedColor;

  item.appendChild(labelWrap);
  item.appendChild(badge);

  item.addEventListener("mouseenter", () => {
    item.style.background = hoverBackground;
  });
  item.addEventListener("mouseleave", () => {
    item.style.background = "transparent";
  });
  item.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openQualityPicker(meta, popupAnchor, source);
  });

  container.appendChild(item);
  return container;
}

function buildActionButton({
  selector,
  defaultLabel,
  title,
  small,
  getMeta,
  source,
}) {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute(selector, "true");
  button.dataset.defaultLabel = defaultLabel;
  button.textContent = defaultLabel;
  button.title = title;
  button.style.display = "inline-flex";
  button.style.alignItems = "center";
  button.style.justifyContent = "center";
  button.style.flex = "0 0 auto";
  button.style.boxSizing = "border-box";
  button.style.border = small ? "1px solid rgba(148, 163, 184, 0.25)" : "1px solid rgba(99, 102, 241, 0.35)";
  button.style.background = small ? "rgba(15, 23, 42, 0.92)" : "rgba(30, 41, 59, 0.92)";
  button.style.color = "#f8fafc";
  button.style.borderRadius = small ? "999px" : "18px";
  button.style.padding = small ? "0" : "0 16px";
  button.style.width = small ? "28px" : "auto";
  button.style.minWidth = small ? "28px" : "0";
  button.style.height = small ? "28px" : "36px";
  button.style.fontSize = small ? "11px" : "13px";
  button.style.fontWeight = "700";
  button.style.letterSpacing = small ? "0.04em" : "0";
  button.style.textTransform = small ? "uppercase" : "none";
  button.style.marginRight = "0";
  button.style.marginLeft = small ? "0" : "8px";
  button.style.cursor = "pointer";
  button.style.transition = "background 120ms ease, border-color 120ms ease";
  button.style.backdropFilter = "blur(10px)";

  button.addEventListener("mouseenter", () => {
    button.style.background = small ? "rgba(30, 41, 59, 0.98)" : "rgba(51, 65, 85, 0.96)";
    button.style.borderColor = "rgba(99, 102, 241, 0.6)";
  });
  button.addEventListener("mouseleave", () => {
    button.style.background = small ? "rgba(15, 23, 42, 0.92)" : "rgba(30, 41, 59, 0.92)";
    button.style.borderColor = small ? "rgba(148, 163, 184, 0.25)" : "rgba(99, 102, 241, 0.35)";
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    const meta = getMeta();
    if (!meta) {
      showToast("This video could not be resolved.", false);
      return;
    }

    if (button.disabled) {
      return;
    }

    openQualityPicker(meta, button, source);
  });

  return button;
}

function normalizeLabel(value) {
  return value.replace(/\s+/g, " ").trim();
}

function findNativeWatchDownloadTarget(actions) {
  const candidates = actions.querySelectorAll(
    "button-view-model, yt-button-view-model, ytd-button-renderer, button, a[role='button'], a"
  );

  for (const candidate of candidates) {
    if (!(candidate instanceof HTMLElement)) {
      continue;
    }
    if (candidate.matches(WATCH_BUTTON_SELECTOR) || candidate.closest(WATCH_BUTTON_SELECTOR)) {
      continue;
    }

    const label = normalizeLabel(
      `${candidate.getAttribute("aria-label") || ""} ${candidate.getAttribute("title") || ""} ${candidate.textContent || ""}`
    ).toLowerCase();

    if (!label.includes("download")) {
      continue;
    }

    return (
      candidate.closest("button-view-model, yt-button-view-model, ytd-button-renderer") ||
      candidate
    );
  }

  return null;
}

function createWatchReplacementButton(watchRoot, nativeTarget = null) {
  const defaultLabel =
    normalizeLabel(nativeTarget?.textContent || "") ||
    normalizeLabel(nativeTarget?.getAttribute?.("aria-label") || "") ||
    "Download";

  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("data-dlpgui-watch-button", "true");
  button.dataset.defaultLabel = defaultLabel;
  button.textContent = defaultLabel;
  button.title = "Choose quality and send this video to dlp-gui";
  button.style.display = "inline-flex";
  button.style.alignItems = "center";
  button.style.justifyContent = "center";
  button.style.flex = "0 0 auto";
  button.style.height = "36px";
  button.style.padding = "0 16px";
  button.style.border = "0";
  button.style.borderRadius = "18px";
  button.style.background = "rgba(15, 15, 15, 0.08)";
  button.style.color = "#0f0f0f";
  button.style.font = "500 14px Roboto, Arial, sans-serif";
  button.style.whiteSpace = "nowrap";
  button.style.cursor = "pointer";
  button.style.transition = "background 120ms ease";

  button.addEventListener("mouseenter", () => {
    button.style.background = "rgba(15, 15, 15, 0.14)";
  });
  button.addEventListener("mouseleave", () => {
    button.style.background = "rgba(15, 15, 15, 0.08)";
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    const meta = getWatchVideoMeta(watchRoot);
    if (!meta) {
      showToast("This video could not be resolved.", false);
      return;
    }

    if (button.disabled) {
      return;
    }

    openQualityPicker(meta, button, "YouTube watch page");
  });

  return button;
}

function injectPopupMenuItems() {
  // Retired.
}

function cleanupCardButtons() {
  document.querySelectorAll(BUTTON_SELECTOR).forEach((button) => {
    button.remove();
  });
}

function injectWatchButton() {
  const watchRoot = document.querySelector("ytd-watch-metadata");
  if (!watchRoot) {
    return;
  }

  if (watchRoot.querySelector(WATCH_BUTTON_SELECTOR)) {
    return;
  }

  const actions =
    watchRoot.querySelector("#top-level-buttons-computed") ||
    watchRoot.querySelector("#actions-inner") ||
    watchRoot.querySelector("#menu");

  if (!actions) {
    return;
  }

  const currentUrl = canonicalizeVideoUrl(window.location.href);
  if (!currentUrl) {
    return;
  }

  const nativeDownloadTarget = findNativeWatchDownloadTarget(actions);
  if (nativeDownloadTarget instanceof HTMLElement && nativeDownloadTarget.parentElement) {
    nativeDownloadTarget.replaceWith(createWatchReplacementButton(watchRoot, nativeDownloadTarget));
    return;
  }

  actions.appendChild(createWatchReplacementButton(watchRoot));
}

function renderButtons() {
  queuedRender = false;
  cleanupCardButtons();
  injectWatchButton();
  injectPopupMenuItems();
}

function scheduleRender() {
  if (queuedRender) {
    return;
  }

  queuedRender = true;
  window.requestAnimationFrame(renderButtons);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "dlpgui-feedback") {
    showToast(message.message || "Queued in dlp-gui", Boolean(message.ok));
  }
});

const observer = new MutationObserver(() => {
  scheduleRender();
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

scheduleRender();
