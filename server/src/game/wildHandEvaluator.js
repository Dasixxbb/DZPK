const { HAND_TYPES, RANKS, SUITS, WILD_TYPES, getWildAllowedSuits, createCard } = require('./cards');
const { evaluateClassicHand, compareHandEvaluations } = require('./handEvaluator');

function generateMappings(wildCards, normalCards) {
  const usedCardKeys = new Set();
  for (const card of normalCards) {
    usedCardKeys.add(`${card.rank}_${card.suit}`);
  }

  const results = [];
  const currentMapping = [];

  function backtrack(index) {
    if (index === wildCards.length) {
      results.push(currentMapping.map(m => ({ ...m })));
      return;
    }

    const wild = wildCards[index];
    const allowedSuits = getWildAllowedSuits(wild.wildType);

    for (const suit of allowedSuits) {
      for (const rank of RANKS) {
        const key = `${rank}_${suit}`;
        if (!usedCardKeys.has(key)) {
          usedCardKeys.add(key);
          currentMapping.push({
            wildId: wild.id,
            wildType: wild.wildType,
            mappedRank: rank,
            mappedSuit: suit,
            originalWild: wild
          });
          backtrack(index + 1);
          currentMapping.pop();
          usedCardKeys.delete(key);
        }
      }
    }
  }

  backtrack(0);
  return results;
}

function buildEffectiveCards(normalCards, mapping) {
  const cards = normalCards.map(c => ({ ...c }));
  for (const m of mapping) {
    const mappedCard = createCard(m.mappedRank, m.mappedSuit);
    mappedCard._isMappedWild = true;
    mappedCard._wildId = m.wildId;
    mappedCard._originalWild = m.originalWild;
    cards.push(mappedCard);
  }
  return cards;
}

function adjustFlushEvaluation(evaluation, effectiveCards) {
  const adjustedRanks = [];
  for (const card of effectiveCards) {
    if (card._isMappedWild) {
      adjustedRanks.push(1);
    } else {
      adjustedRanks.push(card.rank);
    }
  }
  adjustedRanks.sort((a, b) => b - a);

  return {
    type: HAND_TYPES.FLUSH,
    primary: adjustedRanks[0],
    kickers: adjustedRanks.slice(1, 5),
    suit: evaluation.suit
  };
}

function evaluateMapping(mapping, normalCards, wildCount) {
  const effectiveCards = buildEffectiveCards(normalCards, mapping);
  let evaluation = evaluateClassicHand(effectiveCards);

  if (evaluation.type === HAND_TYPES.FLUSH) {
    evaluation = adjustFlushEvaluation(evaluation, effectiveCards);
  }

  const wildMappings = mapping.map(m => ({
    wildId: m.wildId,
    wildType: m.wildType,
    mappedRank: m.mappedRank,
    mappedSuit: m.mappedSuit
  }));

  return {
    type: evaluation.type,
    primary: evaluation.primary,
    secondary: evaluation.secondary,
    kickers: evaluation.kickers ? [...evaluation.kickers] : [],
    suit: evaluation.suit,
    usedWildCount: wildCount,
    wildMappings,
    effectiveCards
  };
}

function evaluateWildHand(cards) {
  if (cards.length !== 5) {
    throw new Error('evaluateWildHand requires exactly 5 cards');
  }

  const wildCards = [];
  const normalCards = [];
  for (const card of cards) {
    if (card.isWild) {
      wildCards.push(card);
    } else {
      normalCards.push(card);
    }
  }

  if (wildCards.length === 0) {
    const evaluation = evaluateClassicHand(cards);
    return {
      type: evaluation.type,
      primary: evaluation.primary,
      secondary: evaluation.secondary,
      kickers: evaluation.kickers ? [...evaluation.kickers] : [],
      suit: evaluation.suit,
      usedWildCount: 0,
      wildMappings: [],
      effectiveCards: cards.map(c => ({ ...c }))
    };
  }

  const allMappings = generateMappings(wildCards, normalCards);

  let bestResult = null;

  for (const mapping of allMappings) {
    const result = evaluateMapping(mapping, normalCards, wildCards.length);

    if (bestResult === null) {
      bestResult = result;
      continue;
    }

    const cmp = compareWildHandEvaluations(result, bestResult);
    if (cmp > 0) {
      bestResult = result;
    }
  }

  return bestResult;
}

function compareWildHandEvaluations(a, b) {
  const baseCompare = compareHandEvaluations(a, b);
  if (baseCompare !== 0) {
    return baseCompare;
  }

  if (a.usedWildCount !== b.usedWildCount) {
    return b.usedWildCount - a.usedWildCount;
  }

  return 0;
}

function getCombinations(arr, k) {
  const results = [];
  const n = arr.length;
  const combo = [];

  function helper(start) {
    if (combo.length === k) {
      results.push([...combo]);
      return;
    }
    for (let i = start; i < n; i++) {
      combo.push(arr[i]);
      helper(i + 1);
      combo.pop();
    }
  }

  helper(0);
  return results;
}

function findBest5CardsFrom7(sevenCards, mode) {
  if (sevenCards.length !== 7) {
    throw new Error('findBest5CardsFrom7 requires exactly 7 cards');
  }

  const combos = getCombinations(sevenCards, 5);
  let bestCards = null;
  let bestEvaluation = null;

  for (const fiveCards of combos) {
    let evaluation;

    if (mode === 'wild') {
      evaluation = evaluateWildHand(fiveCards);
    } else {
      const classicEval = evaluateClassicHand(fiveCards);
      evaluation = {
        type: classicEval.type,
        primary: classicEval.primary,
        secondary: classicEval.secondary,
        kickers: classicEval.kickers ? [...classicEval.kickers] : [],
        suit: classicEval.suit,
        usedWildCount: 0,
        wildMappings: [],
        effectiveCards: fiveCards.map(c => ({ ...c }))
      };
    }

    if (bestEvaluation === null) {
      bestCards = fiveCards;
      bestEvaluation = evaluation;
      continue;
    }

    const cmp = mode === 'wild'
      ? compareWildHandEvaluations(evaluation, bestEvaluation)
      : compareHandEvaluations(evaluation, bestEvaluation);

    if (cmp > 0) {
      bestCards = fiveCards;
      bestEvaluation = evaluation;
    }
  }

  return { bestCards, bestEvaluation };
}

module.exports = {
  evaluateWildHand,
  compareWildHandEvaluations,
  findBest5CardsFrom7
};
