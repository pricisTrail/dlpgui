const WATCH_BUTTON_ATTR = "data-dlpgui-watch-button";
const WATCH_BUTTON_SELECTOR = `[${WATCH_BUTTON_ATTR}]`;
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

function applyStyles(element, styles) {
  Object.assign(element.style, styles);
  return element;
}

function createElement(tag, styles = {}, textContent = "") {
  const element = document.createElement(tag);
  applyStyles(element, styles);
  if (textContent) {
    element.textContent = textContent;
  }
  return element;
}

function createToastHost() {
  let host = document.getElementById("dlpgui-toast-host");
  if (host) {
    return host;
  }

  host = createElement("div", {
    position: "fixed",
    right: "16px",
    bottom: "16px",
    zIndex: "999999",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  });
  host.id = "dlpgui-toast-host";
  document.documentElement.appendChild(host);
  return host;
}

function showToast(message, ok = true) {
  const toast = createElement(
    "div",
    {
      background: ok ? "rgba(5, 150, 105, 0.94)" : "rgba(185, 28, 28, 0.94)",
      color: "#fff",
      padding: "10px 12px",
      borderRadius: "999px",
      fontSize: "12px",
      fontWeight: "600",
      boxShadow: "0 10px 25px rgba(0, 0, 0, 0.24)",
      maxWidth: "320px",
    },
    message,
  );

  createToastHost().appendChild(toast);
  window.setTimeout(() => toast.remove(), 2400);
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

function getWatchVideoMeta(watchRoot = document.querySelector("ytd-watch-metadata")) {
  if (!watchRoot) {
    return null;
  }

  const url = canonicalizeVideoUrl(window.location.href);
  if (!url) {
    return null;
  }

  return {
    url,
    title:
      watchRoot.querySelector("h1")?.textContent?.trim() ||
      document.title.replace(/\s*-\s*YouTube\s*$/, ""),
  };
}

function normalizeLabel(value) {
  return value.replace(/\s+/g, " ").trim();
}

function findNativeWatchDownloadTarget(actions) {
  const candidates = actions.querySelectorAll(
    "button-view-model, yt-button-view-model, ytd-button-renderer, button, a[role='button'], a",
  );

  for (const candidate of candidates) {
    if (!(candidate instanceof HTMLElement)) {
      continue;
    }
    if (candidate.matches(WATCH_BUTTON_SELECTOR) || candidate.closest(WATCH_BUTTON_SELECTOR)) {
      continue;
    }

    const label = normalizeLabel(
      `${candidate.getAttribute("aria-label") || ""} ${candidate.getAttribute("title") || ""} ${candidate.textContent || ""}`,
    ).toLowerCase();

    if (label.includes("download")) {
      return (
        candidate.closest("button-view-model, yt-button-view-model, ytd-button-renderer") ||
        candidate
      );
    }
  }

  return null;
}

function setButtonState(button, label, disabled = false) {
  button.textContent = label;
  button.disabled = disabled;
  button.style.opacity = disabled ? "0.82" : "1";
  button.style.cursor = disabled ? "wait" : "pointer";
  button.setAttribute("aria-disabled", disabled ? "true" : "false");
}

function resetButtonState(button) {
  setButtonState(button, button.dataset.defaultLabel || "Download in dlp-gui", false);
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

function closeActivePicker() {
  if (typeof activePickerCleanup === "function") {
    activePickerCleanup();
    activePickerCleanup = null;
  }
}

function positionCard(card, anchorButton) {
  const rect = anchorButton.getBoundingClientRect();
  const cardWidth = 272;
  const gap = 10;
  const left = Math.min(window.innerWidth - cardWidth - 12, Math.max(12, rect.right - cardWidth));
  let top = rect.bottom + gap;

  if (top + card.offsetHeight > window.innerHeight - 12) {
    top = Math.max(12, rect.top - card.offsetHeight - gap);
  }

  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
}

function buildChoiceRow(meta, button, choice, source) {
  const row = createElement("button", {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    padding: "10px 14px",
    border: "0",
    borderLeft: "3px solid transparent",
    background: "transparent",
    color: "#111827",
    textAlign: "left",
    cursor: "pointer",
    transform: "translateX(0)",
    transition: "background 120ms ease, transform 120ms ease, border-color 120ms ease",
  });
  row.type = "button";

  const titleWrap = createElement("div", {
    display: "flex",
    flexDirection: "column",
    minWidth: "0",
  });
  titleWrap.appendChild(createElement("span", { fontSize: "13px", fontWeight: "500" }, choice.label));
  if (choice.subtitles) {
    titleWrap.appendChild(
      createElement("span", { fontSize: "11px", color: "#64748b", marginTop: "2px" }, "With embedded subtitles"),
    );
  }

  const left = createElement("div", {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    minWidth: "0",
  });
  const radio = createElement("span", {
    width: "14px",
    height: "14px",
    borderRadius: "999px",
    border: "1.5px solid #0f172a",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 auto",
  });
  radio.appendChild(
    createElement("span", {
      width: "6px",
      height: "6px",
      borderRadius: "999px",
      background: choice.subtitles ? "#2563eb" : "#111827",
    }),
  );
  left.appendChild(radio);
  left.appendChild(titleWrap);

  const note = createElement(
    "span",
    {
      fontSize: "11px",
      fontWeight: "600",
      color: "#64748b",
      flex: "0 0 auto",
      transition: "color 120ms ease",
    },
    choice.subtitles ? "CC" : choice.note,
  );

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
  section.appendChild(
    createElement(
      "div",
      {
        padding: "8px 14px 6px",
        fontSize: "10px",
        fontWeight: "700",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "#94a3b8",
      },
      titleText,
    ),
  );

  QUALITY_OPTIONS.forEach((option) => {
    if (withSubtitles && option.formatString === "ba/b") {
      return;
    }
    section.appendChild(
      buildChoiceRow(meta, button, { ...option, subtitles: withSubtitles }, source),
    );
  });

  return section;
}

function openQualityPicker(meta, anchorButton, source) {
  closeActivePicker();

  const card = createElement("div", {
    position: "fixed",
    zIndex: "999998",
    width: "272px",
    background: "#ffffff",
    border: "1px solid rgba(148, 163, 184, 0.25)",
    borderRadius: "14px",
    boxShadow: "0 20px 48px rgba(15, 23, 42, 0.24)",
    overflow: "hidden",
    fontFamily: "Roboto, Arial, sans-serif",
  });
  card.setAttribute("data-dlpgui-picker", "true");

  card.appendChild(
    createElement(
      "div",
      {
        padding: "14px 16px 10px",
        fontSize: "15px",
        fontWeight: "500",
        color: "#111827",
      },
      "Download Quality",
    ),
  );
  card.appendChild(buildSection(meta, anchorButton, "Video only", false, source));

  const divider = createElement("div", {
    height: "1px",
    background: "#e5e7eb",
    margin: "4px 14px",
  });
  card.appendChild(divider);
  card.appendChild(buildSection(meta, anchorButton, "With subtitles", true, source));
  document.documentElement.appendChild(card);
  positionCard(card, anchorButton);

  const handleDocumentClick = (event) => {
    const target = event.target;
    if (target instanceof Node && (card.contains(target) || anchorButton.contains(target))) {
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

function createWatchReplacementButton(watchRoot, nativeTarget = null) {
  const defaultLabel =
    normalizeLabel(nativeTarget?.textContent || "") ||
    normalizeLabel(nativeTarget?.getAttribute?.("aria-label") || "") ||
    "Download";

  const button = createElement("button", {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 auto",
    height: "36px",
    padding: "0 16px",
    border: "0",
    borderRadius: "18px",
    background: "rgba(15, 15, 15, 0.08)",
    color: "#0f0f0f",
    font: "500 14px Roboto, Arial, sans-serif",
    whiteSpace: "nowrap",
    cursor: "pointer",
    transition: "background 120ms ease",
  }, defaultLabel);
  button.type = "button";
  button.setAttribute(WATCH_BUTTON_ATTR, "true");
  button.dataset.defaultLabel = defaultLabel;
  button.title = "Choose quality and send this video to dlp-gui";

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

function injectWatchButton() {
  const watchRoot = document.querySelector("ytd-watch-metadata");
  if (!watchRoot || watchRoot.querySelector(WATCH_BUTTON_SELECTOR)) {
    return;
  }

  const actions =
    watchRoot.querySelector("#top-level-buttons-computed") ||
    watchRoot.querySelector("#actions-inner") ||
    watchRoot.querySelector("#menu");
  if (!actions || !canonicalizeVideoUrl(window.location.href)) {
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
  injectWatchButton();
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
