const BRIDGE_BASE_URL = "http://127.0.0.1:46321";
const HEALTH_URL = `${BRIDGE_BASE_URL}/health`;
const DOWNLOAD_URL = `${BRIDGE_BASE_URL}/download`;

async function setBadge(isOnline) {
  await browser.action.setBadgeText({ text: isOnline ? "ON" : "OFF" });
  await browser.action.setBadgeBackgroundColor({
    color: isOnline ? "#059669" : "#475569",
  });
}

async function checkBridge() {
  try {
    const response = await fetch(HEALTH_URL, { method: "GET" });
    const isOnline = response.ok;
    await setBadge(isOnline);
    return isOnline;
  } catch {
    await setBadge(false);
    return false;
  }
}

async function queueDownload({ url, title, pageUrl, source, formatString, qualityLabel, subtitles }) {
  const response = await fetch(DOWNLOAD_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      request_id: crypto.randomUUID(),
      url,
      title,
      source,
      page_url: pageUrl || url,
      format_string: formatString,
      quality_label: qualityLabel,
      subtitles,
    }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Bridge returned ${response.status}`);
  }

  await setBadge(true);
  return payload;
}

async function handleTabDownload(tab, source = "Firefox/Zen toolbar", options = {}) {
  if (!tab?.url || (!tab.url.startsWith("http://") && !tab.url.startsWith("https://"))) {
    return { ok: false, error: "This tab cannot be sent to dlp-gui." };
  }

  try {
    await queueDownload({
      url: tab.url,
      title: tab.title,
      pageUrl: tab.url,
      source,
      formatString: options.formatString,
      qualityLabel: options.qualityLabel,
      subtitles: options.subtitles,
    });
    return { ok: true };
  } catch (error) {
    await checkBridge();
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function startBridgeHealthChecks() {
  await browser.alarms.create("bridge-health", { periodInMinutes: 1 });
  await checkBridge();
}

browser.runtime.onInstalled.addListener(startBridgeHealthChecks);

browser.runtime.onStartup.addListener(startBridgeHealthChecks);

browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "bridge-health") {
    await checkBridge();
  }
});

browser.action.onClicked.addListener(async (tab) => {
  const result = await handleTabDownload(tab);
  if (!tab?.id) {
    return;
  }

  try {
    await browser.tabs.sendMessage(tab.id, {
      type: "dlpgui-feedback",
      ok: result.ok,
      message: result.ok ? "Queued in dlp-gui" : result.error,
    });
  } catch {
    // Ignore pages without the content script.
  }
});

browser.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "dlpgui-queue-download") {
    return undefined;
  }

  return handleTabDownload(
    {
      url: message.url,
      title: message.title || sender.tab?.title,
    },
    message.source || "YouTube quick action",
    {
      formatString: message.formatString,
      qualityLabel: message.qualityLabel,
      subtitles: message.subtitles,
    },
  );
});
