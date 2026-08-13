const { HAND_TYPES } = require('./cards');

function groupByRank(cards) {
  const groups = {};
  for (const card of cards) {
    if (!groups[card.rank]) groups[card.rank] = [];
    groups[card.rank].push(card);
  }
  return groups;
}

function groupBySuit(cards) {
  const groups = {};
  for (const card of cards) {
    if (!card.suit) continue;
    if (!groups[card.suit]) groups[card.suit] = [];
    groups[card.suit].push(card);
  }
  return groups;
}

function getRankCounts(cards) {
  const rankGroups = groupByRank(cards);
  const counts = [];
  for (const rank of Object.keys(rankGroups)) {
    counts.push({
      rank: parseInt(rank),
      count: rankGroups[rank].length
    });
  }
  counts.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.rank - a.rank;
  });
  return counts;
}

function checkFourOfAKind(cards) {
  const counts = getRankCounts(cards);
  if (counts.length >= 1 && counts[0].count === 4) {
    const fourRank = counts[0].rank;
    const kickers = counts.filter(c => c.rank !== fourRank).map(c => c.rank).sort((a, b) => b - a);
    return {
      type: HAND_TYPES.FOUR_OF_A_KIND,
      primary: fourRank,
      kickers: kickers.slice(0, 1)
    };
  }
  return null;
}

function checkFullHouse(cards) {
  const counts = getRankCounts(cards);
  if (counts.length >= 2 && counts[0].count === 3 && counts[1].count >= 2) {
    return {
      type: HAND_TYPES.FULL_HOUSE,
      primary: counts[0].rank,
      secondary: counts[1].rank,
      kickers: []
    };
  }
  return null;
}

function checkFlush(cards) {
  const suitGroups = groupBySuit(cards);
  for (const suit of Object.keys(suitGroups)) {
    if (suitGroups[suit].length >= 5) {
      const suitedCards = suitGroups[suit].sort((a, b) => b.rank - a.rank);
      const ranks = suitedCards.slice(0, 5).map(c => c.rank);
      return {
        type: HAND_TYPES.FLUSH,
        suit,
        primary: ranks[0],
        kickers: ranks.slice(1)
      };
    }
  }
  return null;
}

function checkStraight(cards) {
  const rankSet = new Set(cards.map(c => c.rank));
  const ranks = [...rankSet].sort((a, b) => b - a);

  for (let i = 0; i <= ranks.length - 5; i++) {
    if (ranks[i] - ranks[i + 4] === 4) {
      return {
        type: HAND_TYPES.STRAIGHT,
        primary: ranks[i],
        kickers: []
      };
    }
  }

  if (rankSet.has(14) && rankSet.has(2) && rankSet.has(3) && rankSet.has(4) && rankSet.has(5)) {
    return {
      type: HAND_TYPES.STRAIGHT,
      primary: 5,
      kickers: []
    };
  }

  return null;
}

function checkStraightFlush(cards) {
  const suitGroups = groupBySuit(cards);
  for (const suit of Object.keys(suitGroups)) {
    if (suitGroups[suit].length >= 5) {
      const suitedCards = suitGroups[suit];
      const straightResult = checkStraight(suitedCards);
      if (straightResult) {
        if (straightResult.primary === 14) {
          return {
            type: HAND_TYPES.ROYAL_FLUSH,
            primary: 14,
            suit,
            kickers: []
          };
        }
        return {
          type: HAND_TYPES.STRAIGHT_FLUSH,
          primary: straightResult.primary,
          suit,
          kickers: []
        };
      }
    }
  }
  return null;
}

function checkThreeOfAKind(cards) {
  const counts = getRankCounts(cards);
  if (counts.length >= 1 && counts[0].count === 3) {
    const threeRank = counts[0].rank;
    const kickers = counts.filter(c => c.rank !== threeRank).map(c => c.rank).sort((a, b) => b - a);
    return {
      type: HAND_TYPES.THREE_OF_A_KIND,
      primary: threeRank,
      kickers: kickers.slice(0, 2)
    };
  }
  return null;
}

function checkTwoPair(cards) {
  const counts = getRankCounts(cards);
  if (counts.length >= 2 && counts[0].count === 2 && counts[1].count === 2) {
    const highPair = Math.max(counts[0].rank, counts[1].rank);
    const lowPair = Math.min(counts[0].rank, counts[1].rank);
    const kickers = counts.filter(c => c.rank !== highPair && c.rank !== lowPair).map(c => c.rank).sort((a, b) => b - a);
    return {
      type: HAND_TYPES.TWO_PAIR,
      primary: highPair,
      secondary: lowPair,
      kickers: kickers.slice(0, 1)
    };
  }
  return null;
}

function checkPair(cards) {
  const counts = getRankCounts(cards);
  if (counts.length >= 1 && counts[0].count === 2) {
    const pairRank = counts[0].rank;
    const kickers = counts.filter(c => c.rank !== pairRank).map(c => c.rank).sort((a, b) => b - a);
    return {
      type: HAND_TYPES.PAIR,
      primary: pairRank,
      kickers: kickers.slice(0, 3)
    };
  }
  return null;
}

function checkHighCard(cards) {
  const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
  return {
    type: HAND_TYPES.HIGH_CARD,
    primary: ranks[0],
    kickers: ranks.slice(1, 5)
  };
}

function evaluateClassicHand(cards) {
  if (cards.length !== 5) {
    throw new Error('evaluateClassicHand requires exactly 5 cards');
  }

  const checks = [
    checkStraightFlush,
    checkFourOfAKind,
    checkFullHouse,
    checkFlush,
    checkStraight,
    checkThreeOfAKind,
    checkTwoPair,
    checkPair,
    checkHighCard
  ];

  for (const check of checks) {
    const result = check(cards);
    if (result) {
      return result;
    }
  }

  return checkHighCard(cards);
}

function compareHandEvaluations(a, b) {
  if (a.type !== b.type) return a.type - b.type;
  if (a.primary !== b.primary) return a.primary - b.primary;
  if (a.secondary !== undefined && b.secondary !== undefined) {
    if (a.secondary !== b.secondary) return a.secondary - b.secondary;
  }
  const maxKickers = Math.max(a.kickers.length, b.kickers.length);
  for (let i = 0; i < maxKickers; i++) {
    const ak = a.kickers[i] || 0;
    const bk = b.kickers[i] || 0;
    if (ak !== bk) return ak - bk;
  }
  return 0;
}

module.exports = {
  evaluateClassicHand,
  compareHandEvaluations,
  groupByRank,
  groupBySuit,
  getRankCounts,
  checkStraight,
  checkFlush
};
