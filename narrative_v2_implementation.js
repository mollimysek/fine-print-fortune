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

    // Friction keywords indicate vague, obstructive language (triggers reversals).
    // Kept specific to avoid false positives on routine legal boilerplate.
    this.frictionKeywords = [
      'however', 'unless', 'at our discretion', 'may change without notice',
      'subject to', 'as needed', 'unspecified',
      'from time to time', 'in our sole discretion', 'as we deem appropriate',
      'without limitation', 'at any time without notice', 'in our judgment'
    ];
  }

  getCardName(card) {
    return card.card || `${card.rank} of ${card.suit.charAt(0).toUpperCase() + card.suit.slice(1)}`;
  }

  performSpread(fullText) {
    this.drawnCards.clear();
    const segments = this.segmentText(fullText);
    const spread = {
      collection: this.pullCard(segments.collection, 'collection'),
      sharing: this.pullCard(segments.sharing, 'sharing'),
      retention: this.pullCard(segments.retention, 'retention'),
      segments
    };
    return spread;
  }

  segmentText(text) {
    const sectionResult = this._splitBySections(text);
    if (sectionResult) return sectionResult;
    return this._splitByKeywords(text);
  }

  _classifyHeader(headerText) {
    const h = headerText.toLowerCase();
    const collectionSignals = ['collect', 'gather', 'obtain', 'receiv', 'what we', 'information we', 'data we', 'personal info', 'types of', 'categories of', 'data we hold'];
    const sharingSignals = ['shar', 'disclos', 'transfer', 'sell', 'distribut', 'third part', 'affiliat', 'partner', 'who we', 'how we share'];
    const retentionSignals = ['retain', 'how long', 'stor', 'keep', 'delet', 'remov', 'purg', 'eras', 'duration', 'retention', 'archiv'];

    const score = signals => signals.filter(s => h.includes(s)).length;
    const c = score(collectionSignals);
    const s = score(sharingSignals);
    const r = score(retentionSignals);

    if (c === 0 && s === 0 && r === 0) return null;
    if (c >= s && c >= r) return 'collection';
    if (s >= c && s >= r) return 'sharing';
    return 'retention';
  }

  _splitBySections(text) {
    const lines = text.split('\n');
    const sections = [];

    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length < 3) return;

      const isMarkdown = /^#{1,4}\s+\S/.test(trimmed);
      const isAllCaps  = /^[A-Z][A-Z\s\d\-:]{9,79}$/.test(trimmed);
      const isNumbered = /^(\d+\.)+\d*\s+[A-Za-z]/.test(trimmed);
      const isBold     = /^\*\*[^*]{4,60}\*\*$/.test(trimmed);

      if (isMarkdown || isAllCaps || isNumbered || isBold) {
        const clean = trimmed
          .replace(/^#+\s+/, '')
          .replace(/\*\*/g, '')
          .replace(/^[\d.]+\s+/, '');
        const station = this._classifyHeader(clean);
        if (station) sections.push({ station, lineIndex: i });
      }
    });

    if (sections.length < 2) return null;

    const segments = { collection: '', sharing: '', retention: '' };

    // Text before the first header — route by keyword
    if (sections[0].lineIndex > 0) {
      const preamble = lines.slice(0, sections[0].lineIndex).join('\n');
      if (preamble.trim()) {
        const pre = this._splitByKeywords(preamble);
        Object.keys(segments).forEach(k => { segments[k] += pre[k]; });
      }
    }

    for (let i = 0; i < sections.length; i++) {
      const startLine = sections[i].lineIndex + 1;
      const endLine   = i + 1 < sections.length ? sections[i + 1].lineIndex : lines.length;
      segments[sections[i].station] += lines.slice(startLine, endLine).join('\n') + '\n';
    }

    const filled = Object.values(segments).filter(s => s.trim().length > 30).length;
    return filled >= 2 ? segments : null;
  }

  _splitByKeywords(text) {
    const collectionKw = ['collect', 'gather', 'obtain', 'receiv', 'captur', 'record', 'track', 'monitor', 'acquir', 'what data', 'what information', 'types of data', 'categories of', 'personal data', 'personal information'];
    const sharingKw    = ['shar', 'disclos', 'transfer', 'sell', 'distribut', 'third part', 'affiliat', 'partner', 'vendor', 'service provider', 'advertis', 'with whom'];
    const retentionKw  = ['retain', 'how long', 'storag', 'stored', 'delet', 'remov', 'purg', 'eras', 'destroy', 'archiv', 'duration', 'for a period', 'months', 'years', 'days after', 'upon terminat', 'as long as'];

    // Split into paragraphs, then sentences within each paragraph
    const sentences = [];
    text.split(/\n{2,}/).forEach(para => {
      const parts = para.match(/[^.!?\n]+[.!?\n]+/g) || [para];
      parts.forEach(s => { if (s.trim()) sentences.push(s.trim()); });
    });

    const segments = { collection: '', sharing: '', retention: '' };
    let lastStation = 'collection';

    sentences.forEach(sentence => {
      const s = sentence.toLowerCase();
      const score = kws => kws.filter(k => s.includes(k)).length;
      const c  = score(collectionKw);
      const sh = score(sharingKw);
      const r  = score(retentionKw);

      let station;
      if (c === 0 && sh === 0 && r === 0) {
        station = lastStation; // inherit context
      } else if (c >= sh && c >= r) {
        station = 'collection';
      } else if (sh >= c && sh >= r) {
        station = 'sharing';
      } else {
        station = 'retention';
      }

      lastStation = station;
      segments[station] += sentence + ' ';
    });

    // If any station is empty, fall back to equal thirds
    const allFilled = Object.values(segments).every(s => s.trim().length > 0);
    if (!allFilled) {
      const third = Math.floor(text.length / 3);
      return {
        collection: text.substring(0, third),
        sharing:    text.substring(third, third * 2),
        retention:  text.substring(third * 2)
      };
    }

    return segments;
  }

  pullCard(segmentText, station) {
    const scoredResults = [];

    // Filter to ensure uniqueness
    const availablePool = this.fullDeck.filter(c =>
      !this.drawnCards.has(this.getCardName(c))
    );

    // Count friction hits — vague/obstructive language that can flip a card reversed.
    // High-valence cards (upright_valence >= 2) require more hits to reverse,
    // since strong positive signals shouldn't be overridden by routine legal phrasing.
    let frictionHits = 0;
    this.frictionKeywords.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const matches = segmentText.match(regex);
      if (matches) frictionHits += matches.length;
    });
    const shouldReverse = card => {
      const threshold = (card.upright_valence >= 2) ? 5 : 3;
      return frictionHits >= threshold && !!card.reversed_logic;
    };

    // Score each card based on keyword matches
    // negatedScores tracks per-card negated hits — evidence for that card reversed
    const negatedScores = {};
    availablePool.forEach(card => {
      const name = this.getCardName(card);
      let score = 0;
      let negatedScore = 0;

      const keywords = card.keywords || [];
      keywords.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        let match;
        while ((match = regex.exec(segmentText)) !== null) {
          if (!isNegatedMatch(segmentText, match.index)) {
            score += 10;
          } else {
            negatedScore += 10;
          }
        }
      });

      negatedScores[name] = negatedScore;

      // A card with only negated hits (score=0, negatedScore>0) is a candidate reversed
      if (score === 0 && negatedScore > 0 && card.reversed_logic) {
        if (card.station_logic && station in card.station_logic) {
          negatedScore += 2;
        }
        scoredResults.push({
          card: card,
          name: name,
          isReversed: true,
          score: negatedScore,
          logic: card.reversed_logic
        });
        return;
      }

      if (score > 0) {
        // Station logic bonus - tiebreaker for cards that already matched keywords
        if (card.station_logic && station in card.station_logic) {
          score += 2;
        }
        let logicText = card.station_logic?.[station] || card.reversed_logic || '';

        // Friction-based reversal overrides keyword-based upright selection
        const cardIsReversed = shouldReverse(card);
        if (cardIsReversed) {
          logicText = card.reversed_logic;
        }

        scoredResults.push({
          card: card,
          name: name,
          isReversed: cardIsReversed,
          score: score,
          logic: logicText
        });
      }
    });

    // Final selection
    let winner;
    if (scoredResults.length === 0) {
      const totalNegatedHits = Object.values(negatedScores).reduce((a, b) => a + b, 0);
      let fallbackCard;
      let fallbackReversed = false;

      if (totalNegatedHits > 0) {
        // Negated hits mean the policy explicitly distances itself from a practice —
        // pick the station card reversed (e.g. "won't delete" → Death reversed)
        const minimalCardName = station === 'retention' ? 'Death' : 'The Hermit';
        fallbackCard =
          availablePool.find(c => this.getCardName(c) === minimalCardName) ||
          availablePool.find(c => this.getCardName(c) === 'The Fool') ||
          availablePool[0];
        fallbackReversed = shouldReverse(fallbackCard);
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
        isReversed: fallbackReversed,
        score: 0,
        logic: fallbackReversed && fallbackCard.reversed_logic
          ? fallbackCard.reversed_logic
          : fallbackCard.station_logic?.[station] || `Vague ${station} terms.`
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
          const negated = isNegatedMatch(trimmed, match.index);
          // Upright cards: cite non-negated matches (positive evidence)
          // Reversed cards: cite negated matches (negation is why the card reversed)
          const relevant = this.isReversed ? negated : !negated;
          if (relevant && !found.some(f => f.sentence === trimmed)) {
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

  createSummary(sting, valence, usedClosings = new Set()) {
    // Get the station-specific logic
    const stationLogic = this.card.station_logic?.[this.station] ||
      `Vague ${this.station} terms detected.`;

    // Open with the mystical "magic sting" (caller may pass a pre-assigned one)
    if (!sting) {
      sting = "The cards see a mirror held up to your data, but whose eyes are looking back?";
    }

    const positiveClosings = [
      "The language used is standard for this industry, suggesting a structured, predictable flow of information.",
      "The terms here carry a clear intention — what they claim to protect, they appear to mean.",
      "The path of your data is mapped in plain sight; the terms offer few shadows to hide within.",
      "A straightforward covenant. The power granted here is measured, not absolute.",
      "What is written is what is meant — a modest promise, but an honest one.",
      "The boundaries drawn here are legible — a rare clarity in the fine print."
    ];

    const neutralClosings = [
      "The terms here are neither remarkable nor alarming — a policy that does what it says, no more.",
      "The language is functional. It does not overreach, but it offers no more than it must.",
      "What is written here is measured — not a covenant of trust, but not a warning either.",
      "The policy is legible, if unremarkable — the path is clear, though not particularly generous.",
      "The fine print here is neither punishing nor protective — a transaction, plainly stated.",
      "The terms occupy the middle ground — present, accounted for, and little more."
    ];

    const negativeClosings = [
      "The language here is notably vague, using conditional terms to limit your oversight.",
      "Read the margins carefully — the freedom granted with one hand is quietly reclaimed with another.",
      "Beneath the reassuring surface, the terms reserve more power than they surrender.",
      "The fine print speaks in riddles; what it promises in full, it walks back in fragments.",
      "Consent is invoked but not truly given — the terms hold the door open just enough to slip through.",
      "The architecture of this language is designed to give ground, then take it back."
    ];

    const effectiveValence = valence ?? (this.isReversed
      ? (this.card.reversed_valence ?? -1)
      : (this.card.upright_valence ?? 0));

    const closings = effectiveValence >= 1 ? positiveClosings
      : effectiveValence === 0 ? neutralClosings
      : negativeClosings;

    const available = closings.filter(c => !usedClosings.has(c));
    const pool = available.length > 0 ? available : closings;
    const closing = pool[Math.floor(Math.random() * pool.length)];
    usedClosings.add(closing);

    const summary = (this.isReversed && this.card.reversed_logic)
      ? this.card.reversed_logic
      : stationLogic;

    return `${sting}\n\n${summary}\n\n${closing}`;
  }
}

// Export for use in main application
if (typeof window !== 'undefined') {
  window.PrivacyTarotEngine = PrivacyTarotEngine;
  window.TarotSynthesizer = TarotSynthesizer;
}
