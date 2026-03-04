// Privacy Tarot Engine V2 - JavaScript Implementation
// Based on narrative_enginev2.py and tarot_logic.py

// Returns true if the keyword at matchIndex appears in a negated context
// (e.g. "we don't sell", "will not share", "never stores")
function isNegatedMatch(text, matchIndex) {
  // Walk back to the start of the current sentence/clause
  let sentenceStart = matchIndex;
  while (sentenceStart > 0 && !/[.!?\n]/.test(text[sentenceStart - 1])) {
    sentenceStart--;
  }

  // Only look at the text in the same sentence, before the keyword
  const beforeKeyword = text.substring(sentenceStart, matchIndex);

  // Negation words/contractions that flip the meaning of what follows
  const negationPattern = /\b(not|no|never|don't|do not|doesn't|does not|didn't|did not|won't|will not|wouldn't|would not|can't|cannot|shan't|shall not|we never|we don't|we won't)\b/i;

  return negationPattern.test(beforeKeyword);
}

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
    return card.card || `${card.rank} of ${card.suit.charAt(0).toUpperCase() + card.suit.slice(1)}`;
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
    let totalNegatedHits = 0;
    availablePool.forEach(card => {
      const name = this.getCardName(card);
      let score = 0;

      // Match keywords - each non-negated occurrence worth 10 points
      const keywords = card.keywords || [];
      keywords.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        let match;
        while ((match = regex.exec(segmentText)) !== null) {
          if (!isNegatedMatch(segmentText, match.index)) {
            score += 10;
          } else {
            totalNegatedHits++;
          }
        }
      });

      // Only add to results if score > 0
      if (score > 0) {
        // Station logic bonus - tiebreaker for cards that already matched keywords
        if (card.station_logic && station in card.station_logic) {
          score += 2;
        }
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
      let fallbackCard;

      if (totalNegatedHits > 0) {
        // The policy is explicitly distancing itself from data practices.
        // Use a station-appropriate card that reflects minimal/no data activity.
        // Collection & sharing → The Hermit ("no third parties, stays on-device")
        // Retention → Death ("absolute deletion")
        const minimalCardName = station === 'retention' ? 'Death' : 'The Hermit';
        fallbackCard =
          availablePool.find(c => this.getCardName(c) === minimalCardName) ||
          availablePool.find(c => this.getCardName(c) === 'The Fool') ||
          availablePool[0];
      } else {
        // Genuinely vague — no relevant language found at all
        fallbackCard =
          availablePool.find(c => this.getCardName(c) === 'The Fool') ||
          availablePool[0];
      }

      const fallbackName = this.getCardName(fallbackCard);
      winner = {
        card: fallbackCard,
        name: fallbackName,
        isReversed: isReversed,
        score: 0,
        logic: fallbackCard.station_logic?.[station] || `Vague ${station} terms.`
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
        const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        let match;
        while ((match = regex.exec(trimmed)) !== null) {
          if (!isNegatedMatch(trimmed, match.index) && !found.some(f => f.sentence === trimmed)) {
            found.push({
              sentence: trimmed,
              section: pos !== -1 ? this._findNearestSection(text, pos) : null
            });
          }
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

  createSummary(sting) {
    // Get the station-specific logic
    const stationLogic = this.card.station_logic?.[this.station] ||
      `Vague ${this.station} terms detected.`;

    // Open with the mystical "magic sting" (caller may pass a pre-assigned one)
    if (!sting) {
      const magicStings = [
        "The stars suggest this digital bond is written in permanent ink.",
        "A flickering light remains in the digital void, should you choose to follow it.",
        "The scales are tipped; the price of entry is your own reflection.",
        "The cards see a mirror held up to your data, but whose eyes are looking back?",
        "What is hidden in shadow will eventually find the light—or remain buried forever.",
        "The thread of your data weaves through unseen hands.",
        "In this digital realm, transparency is both illusion and truth."
      ];
      sting = magicStings[Math.floor(Math.random() * magicStings.length)];
    }

    // Add reversed logic if applicable
    const uprightClosings = [
      "The language used is standard for this industry, suggesting a structured, predictable flow of information.",
      "The terms here carry a clear intention — what they claim to protect, they appear to mean.",
      "The path of your data is mapped in plain sight; the terms offer few shadows to hide within.",
      "A straightforward covenant. The power granted here is measured, not absolute.",
      "What is written is what is meant — a modest promise, but an honest one.",
      "The boundaries drawn here are legible — a rare clarity in the fine print."
    ];

    const reversedClosings = [
      "The language here is notably vague, using conditional terms to limit your oversight.",
      "Read the margins carefully — the freedom granted with one hand is quietly reclaimed with another.",
      "Beneath the reassuring surface, the terms reserve more power than they surrender.",
      "The fine print speaks in riddles; what it promises in full, it walks back in fragments.",
      "Consent is invoked but not truly given — the terms hold the door open just enough to slip through.",
      "The architecture of this language is designed to give ground, then take it back."
    ];

    let summary;
    if (this.isReversed && this.card.reversed_logic) {
      summary = this.card.reversed_logic;
      summary += "\n\n" + reversedClosings[Math.floor(Math.random() * reversedClosings.length)];
    } else {
      summary = stationLogic;
      summary += "\n\n" + uprightClosings[Math.floor(Math.random() * uprightClosings.length)];
    }

    return `${sting}\n\n${summary}`;
  }
}

// Export for use in main application
if (typeof window !== 'undefined') {
  window.PrivacyTarotEngine = PrivacyTarotEngine;
  window.TarotSynthesizer = TarotSynthesizer;
}
