// Side panel JavaScript logic

let tarotDeck = null;
let tarotEngine = null;
let currentReading = null; // Store current reading data with sections

// Load deck data
async function loadDeck() {
  try {
    const response = await fetch(chrome.runtime.getURL('deck.json'));
    tarotDeck = await response.json();
    tarotEngine = new PrivacyTarotEngine(tarotDeck);
    return true;
  } catch (error) {
    console.error('Failed to load deck:', error);
    return false;
  }
}

// Get current tab info
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Extract text from current page
async function extractPageText(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'EXTRACT_PAGE_TEXT'
    });
    return response;
  } catch (error) {
    console.error('Failed to extract text:', error);
    return null;
  }
}

// Parse ToS text into sections (simplified version)
function parseTosSections(text) {
  // For a simple implementation, we'll split the text into rough thirds
  // A more sophisticated version could look for actual section headers

  const words = text.split(/\s+/);
  const third = Math.floor(words.length / 3);

  const collection = words.slice(0, third).join(' ');
  const sharing = words.slice(third, third * 2).join(' ');
  const retention = words.slice(third * 2).join(' ');

  return { collection, sharing, retention };
}

// Get card image path
function getCardImagePath(card) {
  if (card.card) {
    // Major arcana
    const filename = card.card.toLowerCase() + '.png';
    return `major_arcana/${filename}`;
  } else {
    // Minor arcana
    const filename = `${card.rank.toLowerCase()} of ${card.suit.toLowerCase()}.png`;
    return `minor_arcana/${filename}`;
  }
}

// Render the reading
function renderReading(spread, pageInfo, sections) {
  const app = document.getElementById('app');

  const stations = [
    { key: 'collection', label: 'Collection', result: spread.collection, sectionText: sections.collection },
    { key: 'sharing', label: 'Sharing', result: spread.sharing, sectionText: sections.sharing },
    { key: 'retention', label: 'Retention', result: spread.retention, sectionText: sections.retention }
  ];

  let html = `
    <div class="result-box">
      <div class="status-text">
        <strong>Page Analyzed</strong>
        ${pageInfo.title}
      </div>
      <div id="detectedPage">${pageInfo.url}</div>
    </div>
    <button class="btn btn-history" id="historyBtn">📜 View Reading History</button>
    <div class="spread">
  `;

  stations.forEach((station, index) => {
    const result = station.result;
    const card = result.card;
    const cardName = result.name;
    const imagePath = getCardImagePath(card);
    const imageUrl = chrome.runtime.getURL(imagePath);

    // Generate citations using TarotSynthesizer
    const synthesizer = new TarotSynthesizer(result, station.sectionText, station.key);
    const citations = synthesizer.findCitations();

    const reversedBadge = result.isReversed ? '<span class="reversed-badge">REVERSED</span>' : '';
    const reversedClass = result.isReversed ? 'reversed' : '';

    // Build citations HTML
    let citationsHtml = '';
    if (citations.length > 0) {
      citationsHtml = `
        <details class="receipt-details">
          <summary class="receipt-link">🧾 Receipt</summary>
          <div class="receipt-content">
            ${citations.map(citation => `
              <div class="citation-item">
                ${citation.section ? `<div class="citation-section">${citation.section}</div>` : ''}
                <div class="citation-text">"${citation.sentence}"</div>
              </div>
            `).join('')}
          </div>
        </details>
      `;
    }

    html += `
      <div class="card-slot">
        <div class="card-label">${station.label}</div>
        <div class="card-image-container">
          <img src="${imageUrl}" alt="${cardName}" class="card-image ${reversedClass}">
        </div>
        <div class="card-name">
          ${cardName}${reversedBadge}
        </div>
        <div class="card-reading">
          ${result.logic || 'The cards reveal insights about this section.'}
        </div>
        ${citationsHtml}
      </div>
    `;
  });

  html += '</div>';

  app.innerHTML = html;

  // Attach event listener for history button
  document.getElementById('historyBtn').addEventListener('click', () => {
    openHistory();
  });
}

// Open history in full app
function openHistory() {
  const historyUrl = chrome.runtime.getURL('FinePrintFortune.html#your-history');
  chrome.tabs.create({ url: historyUrl });
}

// Save reading to history
async function saveReading(spread, pageInfo, sections) {
  const fullText = sections.collection + ' ' + sections.sharing + ' ' + sections.retention;

  // Generate intro and conclusion
  const intro = `Reading for ${pageInfo.title}`;
  const cardSummaries = [
    `${spread.collection.name}: ${spread.collection.logic}`,
    `${spread.sharing.name}: ${spread.sharing.logic}`,
    `${spread.retention.name}: ${spread.retention.logic}`
  ];
  const conclusion = `<p>${cardSummaries.join('</p><p>')}</p>`;

  const reading = {
    id: Date.now(),
    date: new Date().toISOString(),
    platform: new URL(pageInfo.url).hostname,
    type: 'Terms of Service',
    cards: [
      {
        name: spread.collection.name,
        reversed: spread.collection.isReversed,
        category: 'collection'
      },
      {
        name: spread.sharing.name,
        reversed: spread.sharing.isReversed,
        category: 'sharing'
      },
      {
        name: spread.retention.name,
        reversed: spread.retention.isReversed,
        category: 'retention'
      }
    ],
    intro,
    conclusion,
    sourceSnippet: fullText.substring(0, 200),
    fullText: fullText
  };

  // Get existing history
  const result = await chrome.storage.local.get('tarotHistory');
  const history = result.tarotHistory || [];

  // Add new reading to beginning
  history.unshift(reading);

  // Keep only last 50 readings
  if (history.length > 50) {
    history.splice(50);
  }

  // Save back to storage
  await chrome.storage.local.set({ tarotHistory: history });
}

// Show error
function showError(message) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="error">
      <strong>Error:</strong><br>
      ${message}
    </div>
    <button class="btn" id="retryBtn">🔄 Try Again</button>
    <button class="btn btn-history" id="historyBtn" style="margin-top: 12px;">📜 View Reading History</button>
  `;

  document.getElementById('retryBtn').addEventListener('click', () => {
    init();
  });

  document.getElementById('historyBtn').addEventListener('click', () => {
    openHistory();
  });
}

// Show ready state (waiting for ToS page)
function showReady() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="welcome-message">
      <p>Navigate to a Terms of Service or Privacy Policy page to receive your reading.</p>
    </div>
    <button class="btn" id="analyzeBtn">🔮 Analyze Current Page</button>
    <button class="btn btn-history" id="historyBtn" style="margin-top: 12px;">📜 View Reading History</button>
  `;

  document.getElementById('analyzeBtn').addEventListener('click', async () => {
    await performAnalysis();
  });

  document.getElementById('historyBtn').addEventListener('click', () => {
    openHistory();
  });
}

// Perform the tarot analysis
async function performAnalysis() {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading">Reading the cards...</div>';

  try {
    const tab = await getCurrentTab();
    const extracted = await extractPageText(tab.id);

    if (!extracted || !extracted.success) {
      showError('Could not extract text from this page. Please try a different page.');
      return;
    }

    if (extracted.text.length < 100) {
      showError('Not enough text found on this page. Please navigate to a Terms of Service or Privacy Policy page.');
      return;
    }

    // Parse sections
    const sections = parseTosSections(extracted.text);

    // Perform spread
    const spread = tarotEngine.performSpread(
      sections.collection,
      sections.sharing,
      sections.retention
    );

    const pageInfo = {
      url: extracted.url,
      title: extracted.title
    };

    // Save reading to history
    await saveReading(spread, pageInfo, sections);

    // Store current reading
    currentReading = { spread, pageInfo, sections };

    // Render results
    renderReading(spread, pageInfo, sections);

  } catch (error) {
    console.error('Analysis error:', error);
    showError('An error occurred during analysis. ' + error.message);
  }
}

// Initialize
async function init() {
  const app = document.getElementById('app');

  // Load deck
  const loaded = await loadDeck();
  if (!loaded) {
    showError('Failed to load tarot deck data.');
    return;
  }

  // Check if we're on a ToS page
  const tab = await getCurrentTab();

  // Check session storage for detection info
  const result = await chrome.storage.session.get(`tos_${tab.id}`);
  const tosDetected = result[`tos_${tab.id}`];

  if (tosDetected && tosDetected.detected) {
    // Automatically analyze
    await performAnalysis();
  } else {
    // Show ready state
    showReady();
  }
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', init);
