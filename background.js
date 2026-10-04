chrome.alarms.create('keepalive', { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener(() => {});

const SITE_URLS = {
  chatgpt:    'https://chatgpt.com/',
  claude:     'https://claude.ai/',
  gemini:     'https://gemini.google.com/',
  perplexity: 'https://www.perplexity.ai/',
  grok:       'https://grok.com/',
  mistral:    'https://chat.mistral.ai/',
  copilot:    'https://copilot.microsoft.com/',
};

const SITE_PATTERNS = {
  chatgpt:    ['*://chatgpt.com/*'],
  claude:     ['*://claude.ai/*'],
  gemini:     ['*://gemini.google.com/*'],
  perplexity: ['*://www.perplexity.ai/*', '*://perplexity.ai/*'],
  grok:       ['*://grok.com/*'],
  mistral:    ['*://chat.mistral.ai/*'],
  copilot:    ['*://copilot.microsoft.com/*'],
};

// Regex to detect when a tab is on the home/landing page (not inside a conversation)
const HOME_PATTERNS = {
  chatgpt:    /^https:\/\/chatgpt\.com\/?(\?.*)?$/,
  claude:     /^https:\/\/claude\.ai\/(new|chats)?\/?(\?.*)?$/,
  gemini:     /^https:\/\/gemini\.google\.com\/app\/?(\?.*)?$/,
  perplexity: /^https:\/\/(?:www\.)?perplexity\.ai\/?(\?.*)?$/,
  grok:       /^https:\/\/grok\.com\/?(\?.*)?$/,
  mistral:    /^https:\/\/chat\.mistral\.ai\/?(\?.*)?$/,
  copilot:    /^https:\/\/copilot\.microsoft\.com\/?(\?.*)?$/,
};

const ALL_PATTERNS = Object.values(SITE_PATTERNS).flat();

chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: ALL_PATTERNS });
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    } catch {}
  }
});

// Ping a tab until the content script responds or retries exhausted
async function pingUntilReady(tabId, retries = 20, delayMs = 600) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
      if (r?.ready) return true;
    } catch {}
    await new Promise(r => setTimeout(r, delayMs));
  }
  return false;
}

// Navigate a tab to a URL and wait for it to finish loading
async function navigateAndWait(tabId, url) {
  await chrome.tabs.update(tabId, { url });
  await new Promise(resolve => {
    function listener(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
  // Give the page JS time to initialise after load
  await new Promise(r => setTimeout(r, 1500));
}

async function findOrOpenTab(site) {
  const patterns = SITE_PATTERNS[site];
  if (!patterns) throw new Error('Unknown site: ' + site);

  for (const pattern of patterns) {
    const tabs = await chrome.tabs.query({ url: pattern });
    if (tabs.length) return tabs[0];
  }

  throw new Error(`Open ${site}.com in a tab first, then try again.`);
}

async function relayNative(targetSite, message) {
  const tab = await findOrOpenTab(targetSite);

  // If the tab is on the home/landing page, try to restore the last conversation
  const homePattern = HOME_PATTERNS[targetSite];
  if (homePattern && homePattern.test(tab.url)) {
    const stored = await chrome.storage.local.get([`ca_conv_${targetSite}`]);
    const savedUrl = stored[`ca_conv_${targetSite}`];
    if (savedUrl) {
      await navigateAndWait(tab.id, savedUrl);
    } else {
      // No saved conversation yet — tell content.js to use API relay instead of opening a new chat
      return { noConversation: true };
    }
  }

  const ready = await pingUntilReady(tab.id);
  if (!ready) throw new Error(targetSite + ' tab not ready — try again');

  const result = await chrome.tabs.sendMessage(tab.id, { type: 'INJECT_NATIVE', message });

  // Save the conversation URL so we can return to it next time
  if (result?.conversationUrl) {
    await chrome.storage.local.set({ [`ca_conv_${targetSite}`]: result.conversationUrl });
  }

  return result;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'PING') { sendResponse({ ok: true }); return; }

  if (msg.type === 'RELAY_NATIVE') {
    relayNative(msg.targetSite, msg.message)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true; // keep channel open for async
  }
});
