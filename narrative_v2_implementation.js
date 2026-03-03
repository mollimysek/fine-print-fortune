// Privacy Tarot Engine V2 - JavaScript Implementation
// Based on narrative_enginev2.py and tarot_logic.py

class PrivacyTarotEngine {
  constructor(deckData) {
    this.deck = deckData;
    this.fullDeck = [];
    this.drawnCards = new Set();

    // Flatten deck into searchable list
    if (deckData) {
      this.fullDeck = [
        ...deckData.major_arcana,
        ...(deckData.minor_arcana?.pentacles || []),
        ...(deckData.minor_arcana?.swords || []),
        ...(deckData.minor_arcana?.wands || []),
        ...(deckData.minor_arcana?.cups || [])
      ];
    }

    // Friction keywords indicate vague, obstructive language (triggers reversals)
    this.frictionKeywords = [
      'however', 'unless', 'at our discretion', 'may change',
      'subject to', 'limited', 'circumstances', 'as needed', 'unspecified',
      'from time to time', 'in our sole discretion', 'as we deem appropriate'
    ];
  }

  getCardName(card) {
    return card.card || `${card.rank} of ${card.suit}`;
  }

  performSpread(collectionText, sharingText, retentionText) {
    // Reset for new spread
    this.drawnCards.clear();

    return {
      collection: this.pullCard(collectionText, 'collection'),
      sharing: this.pullCard(sharingText, 'sharing'),
      retention: this.pullCard(retentionText, 'retention')
    };
  }

  pullCard(segmentText, station) {
    const scoredResults = [];

    // Filter to ensure uniqueness
    const availablePool = this.fullDeck.filter(c =>
      !this.drawnCards.has(this.getCardName(c))
    );

    // Determine Reversal (Shadow Side) - friction_hits >= 3 flips the card
    let frictionHits = 0;
    this.frictionKeywords.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const matches = segmentText.match(regex);
      if (matches) frictionHits += matches.length;
    });
    const isReversed = frictionHits >= 3; // Flip card if policy is 'shady' or vague

    // Score each card based on keyword matches
    availablePool.forEach(card => {
      const name = this.getCardName(card);
      let score = 0;

      // Match keywords - each occurrence worth 10 points
      const keywords = card.keywords || [];
      keywords.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        const matches = segmentText.match(regex);
        if (matches) {
          const count = matches.length;
          score += (count * 10);
        }
      });

      // Contextual station bonus - +2 if card has logic for this station
      if (card.station_logic && station in card.station_logic) {
        score += 2;
      }

      // Only add to results if score > 0
      if (score > 0) {
        let logicText = card.station_logic[station];

        // Format logic based on reversal
        if (isReversed && card.reversed_logic) {
          logicText = `REVERSED: ${card.reversed_logic} ${logicText}`;
        }

        scoredResults.push({
          card: card,
          name: name,
          isReversed: isReversed,
          score: score,
          logic: logicText
        });
      }
    });

    // Final selection
    let winner;
    if (scoredResults.length === 0) {
      // Fallback: prefer The Fool if available, else use first card
      const foolCard = availablePool.find(c => this.getCardName(c) === 'The Fool');
      const fallbackCard = foolCard || availablePool[0];
      const fallbackName = this.getCardName(fallbackCard);

      winner = {
        card: fallbackCard,
        name: fallbackName,
        isReversed: isReversed,
        score: 0,
        logic: `Vague ${station} terms.`
      };
    } else {
      // Sort by score descending and pick the winner
      scoredResults.sort((a, b) => b.score - a.score);
      winner = scoredResults[0];
    }

    // Mark as drawn to ensure uniqueness across spread
    this.drawnCards.add(winner.name);
    return winner;
  }
}

class TarotSynthesizer {
  constructor(cardResult, segmentText, station) {
    this.cardResult = cardResult; // Result from pullCard
    this.card = cardResult.card;
    this.text = segmentText;
    this.station = station;
    this.isReversed = cardResult.isReversed;
  }

  findCitations() {
    // Find exact sentences that triggered the card, with nearest section label
    const found = [];
    const text = this.text;
    const keywords = this.card.keywords || [];
    const sentences = text.split(/(?<=[.!?])\s+/);

    let searchFrom = 0;
    sentences.forEach(sentence => {
      const trimmed = sentence.trim();
      if (!trimmed) return;

      const pos = text.indexOf(trimmed, searchFrom);
      if (pos !== -1) searchFrom = pos + trimmed.length;

      keywords.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (regex.test(trimmed) && !found.some(f => f.sentence === trimmed)) {
          found.push({
            sentence: trimmed,
            section: pos !== -1 ? this._findNearestSection(text, pos) : null
          });
        }
      });
    });

    return found.slice(0, 3);
  }

  _findNearestSection(text, pos) {
    // Scan the text before `pos` for the nearest section label
    const before = text.substring(0, pos);

    let lastSection = null;
    let lastPos = -1;

    // Match "Section 3" / "Section 3.2.1" (case-insensitive)
    const secPattern = /\bsection\s+(\d+(?:\.\d+)*)/gi;
    let m;
    while ((m = secPattern.exec(before)) !== null) {
      if (m.index > lastPos) {
        lastPos = m.index;
        lastSection = 'Section ' + m[1];
      }
    }

    // Match standalone numeric headers like "3." or "3.1" / "3.1.2"
    // at the start of a line or after a blank line, followed by non-whitespace
    const numPattern = /(?:^|\n)\s*(\d+(?:\.\d+)+)\.?\s+\S/gm;
    while ((m = numPattern.exec(before)) !== null) {
      if (m.index > lastPos) {
        lastPos = m.index;
        lastSection = 'Section ' + m[1];
      }
    }

    return lastSection;
  }

  createSummary() {
    // Get the station-specific logic
    const stationLogic = this.card.station_logic?.[this.station] ||
      `Vague ${this.station} terms detected.`;

    const cardName = this.cardResult.name;

    // Build the straightforward summary
    let summary = `**${cardName}** appears in your ${this.station} reading. `;
    summary += `${stationLogic}`;

    // Add reversed logic if applicable
    if (this.isReversed && this.card.reversed_logic) {
      summary += `\n\n**The Shadow Side:** ${this.card.reversed_logic} `;
      summary += "The language here is notably vague, using conditional terms to limit your oversight.";
    } else if (!this.isReversed) {
      summary += "\n\nThe language used is standard for this industry, suggesting a structured, predictable flow of information.";
    }

    // Add a "magic sting" - mystical closing
    const magicStings = [
      "The stars suggest this digital bond is written in permanent ink.",
      "A flickering light remains in the digital void, should you choose to follow it.",
      "The scales are tipped; the price of entry is your own reflection.",
      "The cards see a mirror held up to your data, but whose eyes are looking back?",
      "What is hidden in shadow will eventually find the light—or remain buried forever.",
      "The thread of your data weaves through unseen hands.",
      "In this digital realm, transparency is both illusion and truth."
    ];

    const randomSting = magicStings[Math.floor(Math.random() * magicStings.length)];
    summary += `\n\n*${randomSting}*`;

    return summary;
  }
}

// Export for use in main application
if (typeof window !== 'undefined') {
  window.PrivacyTarotEngine = PrivacyTarotEngine;
  window.TarotSynthesizer = TarotSynthesizer;
}
