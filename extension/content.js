// Content script - Detects ToS pages and extracts content

// ToS detection patterns
const TOS_URL_PATTERNS = [
  /\/terms/i,
  /\/tos\b/i,
  /\/terms-of-service/i,
  /\/terms-and-conditions/i,
  /\/privacy/i,
  /\/privacy-policy/i,
  /\/legal/i,
  /\/user-agreement/i,
  /\/eula/i,
  /\/acceptable-use/i,
  /\/terms-of-use/i
];

const TOS_TITLE_PATTERNS = [
  /terms of service/i,
  /terms of use/i,
  /terms and conditions/i,
  /privacy policy/i,
  /user agreement/i,
  /end user license/i,
  /acceptable use policy/i,
  /terms & conditions/i
];

// Check if current page is a ToS page
function isTosPage() {
  const url = window.location.href;
  const title = document.title;

  // Check URL patterns
  for (const pattern of TOS_URL_PATTERNS) {
    if (pattern.test(url)) {
      return true;
    }
  }

  // Check page title
  for (const pattern of TOS_TITLE_PATTERNS) {
    if (pattern.test(title)) {
      return true;
    }
  }

  // Check for h1 or main heading content
  const h1 = document.querySelector('h1');
  if (h1) {
    for (const pattern of TOS_TITLE_PATTERNS) {
      if (pattern.test(h1.textContent)) {
        return true;
      }
    }
  }

  return false;
}

// Extract text content from the page
function extractPageText() {
  // Try to find main content area
  const contentSelectors = [
    'main',
    'article',
    '[role="main"]',
    '.content',
    '.main-content',
    '#content',
    '#main-content',
    '.terms-content',
    '.privacy-content'
  ];

  let contentElement = null;
  for (const selector of contentSelectors) {
    contentElement = document.querySelector(selector);
    if (contentElement) break;
  }

  // Fallback to body if no specific content area found
  if (!contentElement) {
    contentElement = document.body;
  }

  // Extract text, excluding script and style tags
  const clone = contentElement.cloneNode(true);
  const scripts = clone.querySelectorAll('script, style, nav, header, footer');
  scripts.forEach(el => el.remove());

  return clone.textContent
    .replace(/\s+/g, ' ')
    .trim();
}

// Notify background script if this is a ToS page
if (isTosPage()) {
  console.log('[Fine Print Fortune] ToS page detected!');

  chrome.runtime.sendMessage({
    type: 'TOS_PAGE_DETECTED',
    url: window.location.href,
    title: document.title
  });
}

// Listen for requests to extract page content
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'EXTRACT_PAGE_TEXT') {
    const text = extractPageText();
    sendResponse({
      success: true,
      text: text,
      url: window.location.href,
      title: document.title
    });
  }
  return true; // Keep channel open for async response
});
