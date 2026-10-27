/* ============================================================
   Taply Scout — background.js (MV3 service worker)
   Keeps the badge count of businesses scraped. No network calls,
   no analytics — 100% client-side per TapVinci policy.
   ============================================================ */

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details && details.reason === 'install') {
    console.log('[Taply Scout] installed. Open Google Maps, click a business, press Get Info.');
  }
  try {
    const { scrapeCount = 0 } = await chrome.storage.local.get('scrapeCount');
    chrome.action.setBadgeBackgroundColor({ color: '#0A84FF' });
    chrome.action.setBadgeTextColor({ color: '#FFFFFF' });
    chrome.action.setBadgeText({ text: scrapeCount > 0 ? String(scrapeCount) : '' });
  } catch (e) { /* noop */ }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'TAPLY_SCOUT_COUNTED') {
    (async () => {
      try {
        const { scrapeCount = 0 } = await chrome.storage.local.get('scrapeCount');
        const n = scrapeCount + 1;
        await chrome.storage.local.set({ scrapeCount: n });
        try {
          chrome.action.setBadgeBackgroundColor({ color: '#0A84FF' });
          chrome.action.setBadgeText({ text: String(n) });
        } catch (e) { /* noop */ }
        sendResponse({ ok: true, count: n });
      } catch (e) {
        sendResponse({ ok: false });
      }
    })();
    return true; // async response
  }
});
