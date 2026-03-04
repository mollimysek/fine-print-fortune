// Storage adapter to make chrome.storage.local work like localStorage for the history page

// Override localStorage methods to use chrome.storage.local instead
if (typeof chrome !== 'undefined' && chrome.storage) {
  // Create a proxy for localStorage
  const originalLocalStorage = window.localStorage;

  const storageProxy = {
    getItem: function(key) {
      // This is synchronous in the original code, but chrome.storage is async
      // We need to handle this carefully
      if (key === 'tarotHistory') {
        // Return a placeholder that will be replaced
        return '[]';
      }
      return originalLocalStorage.getItem(key);
    },

    setItem: function(key, value) {
      if (key === 'tarotHistory') {
        // Save to chrome.storage.local asynchronously
        chrome.storage.local.set({ [key]: value });
      }
      originalLocalStorage.setItem(key, value);
    },

    removeItem: function(key) {
      if (key === 'tarotHistory') {
        chrome.storage.local.remove(key);
      }
      originalLocalStorage.removeItem(key);
    },

    clear: function() {
      chrome.storage.local.clear();
      originalLocalStorage.clear();
    }
  };

  // Helper to load history from chrome storage
  window.loadTarotHistory = async function() {
    try {
      const result = await chrome.storage.local.get('tarotHistory');
      if (result.tarotHistory) {
        // Parse if it's a string, or use directly if it's already an array
        const history = typeof result.tarotHistory === 'string'
          ? JSON.parse(result.tarotHistory)
          : result.tarotHistory;

        // Store in regular localStorage so the page code can access it synchronously
        originalLocalStorage.setItem('tarotHistory', JSON.stringify(history));
        return history;
      }
      return [];
    } catch (error) {
      console.error('Error loading history:', error);
      return [];
    }
  };

  // Replace localStorage with our proxy for tarotHistory operations
  Object.defineProperty(window, 'localStorage', {
    value: new Proxy(originalLocalStorage, {
      get: function(target, prop) {
        if (prop in storageProxy) {
          return storageProxy[prop];
        }
        return target[prop];
      }
    }),
    writable: false,
    configurable: false
  });
}
