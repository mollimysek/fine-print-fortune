// Background service worker

// Listen for ToS page detection
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TOS_PAGE_DETECTED') {
    console.log('[Fine Print Fortune] ToS detected on tab:', sender.tab.id);

    // Show badge on extension icon
    chrome.action.setBadgeText({
      text: '!',
      tabId: sender.tab.id
    });

    chrome.action.setBadgeBackgroundColor({
      color: '#FF6B6B',
      tabId: sender.tab.id
    });

    // Automatically open side panel for this tab
    chrome.sidePanel.open({ tabId: sender.tab.id });

    // Store detection info for the side panel
    chrome.storage.session.set({
      [`tos_${sender.tab.id}`]: {
        detected: true,
        url: message.url,
        title: message.title,
        timestamp: Date.now()
      }
    });
  }
});

// Clear badge when tab is updated/navigated
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    chrome.action.setBadgeText({ text: '', tabId: tabId });
  }
});

// Handle side panel opening
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));
