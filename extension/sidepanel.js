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
function renderReading(spread, pageInfo, sections, isHistoryView = false, readingId = null) {
  const app = document.getElementById('app');

  const stations = [
    { key: 'collection', label: 'Collection', result: spread.collection, sectionText: sections.collection },
    { key: 'sharing', label: 'Sharing', result: spread.sharing, sectionText: sections.sharing },
    { key: 'retention', label: 'Retention', result: spread.retention, sectionText: sections.retention }
  ];

  let html = '';

  if (isHistoryView) {
    html += `
      <div class="history-detail-header">
        <button class="btn-back" id="backToHistoryBtn">← Back to History</button>
      </div>
    `;
  }

  html += `
    <div class="result-box">
      <div class="status-text">
        <strong>${isHistoryView ? 'Saved Reading' : 'Page Analyzed'}</strong>
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

    // Generate citations and summary using TarotSynthesizer
    const synthesizer = new TarotSynthesizer(result, station.sectionText, station.key);
    const citations = synthesizer.findCitations();
    const summary = synthesizer.createSummary();

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
        <details class="card-summary">
          <summary class="summary-label">📖 Full Reading</summary>
          <div class="summary-content">
            ${summary}
          </div>
        </details>
        ${citationsHtml}
      </div>
    `;
  });

  html += '</div>';

  app.innerHTML = html;

  // Attach event listeners
  if (isHistoryView) {
    document.getElementById('backToHistoryBtn').addEventListener('click', () => {
      showHistory();
    });
  }

  document.getElementById('historyBtn').addEventListener('click', () => {
    showHistory();
  });
}

// Load and display history in side panel
async function showHistory() {
  const result = await chrome.storage.local.get('tarotHistory');
  const history = result.tarotHistory || [];

  const app = document.getElementById('app');

  if (history.length === 0) {
    app.innerHTML = `
      <div class="history-header">
        <button class="btn-back" id="backBtn">← Back</button>
        <h2 class="history-title">Reading History</h2>
      </div>
      <div class="history-empty">
        <p>No readings yet. Start a new reading to begin your journey.</p>
      </div>
      <button class="btn" id="newReadingBtn">🔮 New Reading</button>
    `;

    document.getElementById('backBtn').addEventListener('click', () => {
      showReady();
    });

    document.getElementById('newReadingBtn').addEventListener('click', () => {
      showReady();
    });
    return;
  }

  // Sort by date (newest first)
  history.sort((a, b) => new Date(b.date) - new Date(a.date));

  let historyHtml = `
    <div class="history-header">
      <button class="btn-back" id="backBtn">← Back</button>
      <h2 class="history-title">Reading History</h2>
    </div>
    <div class="history-list">
  `;

  history.forEach(reading => {
    const date = new Date(reading.date);
    const dateStr = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const cardTags = reading.cards.map(card => {
      const rev = card.reversed ? ' ↓' : '';
      return `<span class="history-card-tag">${card.name}${rev}</span>`;
    }).join(' ');

    historyHtml += `
      <div class="history-item" data-id="${reading.id}">
        <div class="history-item-header">
          <div class="history-date">${dateStr} <span class="history-time">${timeStr}</span></div>
          <button class="history-delete-btn" data-id="${reading.id}" title="Delete reading">×</button>
        </div>
        <div class="history-platform">${reading.platform || 'Unknown'}</div>
        <div class="history-cards">${cardTags}</div>
      </div>
    `;
  });

  historyHtml += `
    </div>
    <button class="btn btn-clear-history" id="clearHistoryBtn">🗑️ Clear All History</button>
  `;

  app.innerHTML = historyHtml;

  // Attach event listeners
  document.getElementById('backBtn').addEventListener('click', () => {
    showReady();
  });

  // View history detail
  document.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (!e.target.classList.contains('history-delete-btn')) {
        const readingId = parseInt(item.dataset.id);
        viewHistoryDetail(readingId);
      }
    });
  });

  // Delete individual reading
  document.querySelectorAll('.history-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const readingId = parseInt(btn.dataset.id);
      await deleteReading(readingId);
      showHistory(); // Refresh
    });
  });

  // Clear all history
  document.getElementById('clearHistoryBtn').addEventListener('click', async () => {
    if (confirm('Are you sure you want to delete all readings? This cannot be undone.')) {
      await chrome.storage.local.set({ tarotHistory: [] });
      showHistory(); // Refresh
    }
  });
}

// View a single reading from history
async function viewHistoryDetail(readingId) {
  const result = await chrome.storage.local.get('tarotHistory');
  const history = result.tarotHistory || [];
  const reading = history.find(r => r.id === readingId);

  if (!reading) {
    showError('Reading not found.');
    return;
  }

  // Re-parse the text into sections
  const fullText = reading.fullText || '';
  const words = fullText.split(/\s+/);
  const third = Math.floor(words.length / 3);

  const sections = {
    collection: words.slice(0, third).join(' '),
    sharing: words.slice(third, third * 2).join(' '),
    retention: words.slice(third * 2).join(' ')
  };

  // Reconstruct the spread from saved data
  const spread = {
    collection: reconstructCardResult(reading.cards[0], 'collection', sections.collection),
    sharing: reconstructCardResult(reading.cards[1], 'sharing', sections.sharing),
    retention: reconstructCardResult(reading.cards[2], 'retention', sections.retention)
  };

  const pageInfo = {
    url: reading.platform || 'Saved Reading',
    title: reading.platform || 'Saved Reading'
  };

  renderReading(spread, pageInfo, sections, true, readingId);
}

// Reconstruct card result from saved data
function reconstructCardResult(savedCard, station, sectionText) {
  // Find the card in the deck
  let cardData = null;

  if (tarotDeck) {
    // Check major arcana
    cardData = tarotDeck.major_arcana.find(c =>
      c.card === savedCard.name || c.card.toLowerCase() === savedCard.name.toLowerCase()
    );

    // Check minor arcana
    if (!cardData && tarotDeck.minor_arcana) {
      for (const suit of ['pentacles', 'swords', 'wands', 'cups']) {
        const cards = tarotDeck.minor_arcana[suit] || [];
        cardData = cards.find(c => {
          const name = `${c.rank} of ${c.suit.charAt(0).toUpperCase() + c.suit.slice(1)}`;
          return name === savedCard.name || name.toLowerCase() === savedCard.name.toLowerCase();
        });
        if (cardData) break;
      }
    }
  }

  // Construct the result object
  let logic = cardData?.station_logic?.[station] || 'The cards reveal insights about this section.';

  // Add reversed logic if applicable
  if (savedCard.reversed && cardData?.reversed_logic) {
    logic = `REVERSED: ${cardData.reversed_logic} ${logic}`;
  }

  return {
    card: cardData || { card: savedCard.name },
    name: savedCard.name,
    isReversed: savedCard.reversed || false,
    logic: logic,
    score: 1
  };
}

// Delete a reading from history
async function deleteReading(readingId) {
  const result = await chrome.storage.local.get('tarotHistory');
  let history = result.tarotHistory || [];

  history = history.filter(r => r.id !== readingId);

  await chrome.storage.local.set({ tarotHistory: history });
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
function showError(message, showPasteOption = false) {
  const app = document.getElementById('app');

  let pasteButtonHtml = '';
  if (showPasteOption) {
    pasteButtonHtml = '<button class="btn btn-paste" id="pasteBtn" style="margin-top: 12px;">📋 Paste Text Instead</button>';
  }

  app.innerHTML = `
    <div class="error">
      <strong>Error:</strong><br>
      ${message}
    </div>
    <button class="btn" id="retryBtn">🔄 Try Again</button>
    ${pasteButtonHtml}
    <button class="btn btn-history" id="historyBtn" style="margin-top: 12px;">📜 View Reading History</button>
  `;

  document.getElementById('retryBtn').addEventListener('click', () => {
    init();
  });

  if (showPasteOption) {
    document.getElementById('pasteBtn').addEventListener('click', () => {
      showManualInput();
    });
  }

  document.getElementById('historyBtn').addEventListener('click', () => {
    showHistory();
  });
}

// Show manual text input form
function showManualInput() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="manual-input-container">
      <h3 class="manual-input-title">Paste Your Terms of Service</h3>
      <p class="manual-input-instructions">Copy and paste the text from the Terms of Service or Privacy Policy page below:</p>
      <textarea
        id="manualTextInput"
        class="manual-text-input"
        placeholder="Paste your Terms of Service or Privacy Policy text here..."
        rows="10"
      ></textarea>
      <div class="manual-input-buttons">
        <button class="btn" id="analyzeManualBtn">🔮 Analyze Text</button>
        <button class="btn btn-secondary" id="cancelManualBtn">Cancel</button>
      </div>
    </div>
  `;

  document.getElementById('analyzeManualBtn').addEventListener('click', () => {
    const text = document.getElementById('manualTextInput').value.trim();
    if (text.length < 100) {
      alert('Please paste at least 100 characters of text.');
      return;
    }
    performManualAnalysis(text);
  });

  document.getElementById('cancelManualBtn').addEventListener('click', () => {
    showReady();
  });
}

// Perform analysis on manually pasted text
async function performManualAnalysis(text) {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading">Reading the cards...</div>';

  try {
    // Parse sections
    const sections = parseTosSections(text);

    // Perform spread
    const spread = tarotEngine.performSpread(
      sections.collection,
      sections.sharing,
      sections.retention
    );

    const tab = await getCurrentTab();
    const pageInfo = {
      url: tab?.url || 'Manual Input',
      title: 'Manual Reading'
    };

    // Save reading to history
    await saveReading(spread, pageInfo, sections);

    // Store current reading
    currentReading = { spread, pageInfo, sections };

    // Render results
    renderReading(spread, pageInfo, sections);

  } catch (error) {
    console.error('Manual analysis error:', error);
    showError('An error occurred during analysis. ' + error.message);
  }
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
    showHistory();
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
      showError('Could not extract text from this page. Please try a different page.', true);
      return;
    }

    if (extracted.text.length < 100) {
      showError('Not enough text found on this page. Please navigate to a Terms of Service or Privacy Policy page.', true);
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
