// 客户端 5 张牌型判定（移植自服务端 handEvaluator.js / wildHandEvaluator.js）
// 仅用于摊牌选牌时的“牌型展示区域”实时预览，与服务端判定保持一致。

const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
const SUITS = ['spades', 'hearts', 'diamonds', 'clubs']
const WILD_TYPES = { JOKER_SMALL: 'joker_small', JOKER_BIG: 'joker_big', UNIVERSAL: 'universal' }
const HAND_TYPES = {
  HIGH_CARD: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  THREE_OF_A_KIND: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  FOUR_OF_A_KIND: 7,
  STRAIGHT_FLUSH: 8,
  ROYAL_FLUSH: 9
}

function getWildAllowedSuits(wildType) {
  switch (wildType) {
    case WILD_TYPES.JOKER_SMALL:
      return ['spades', 'clubs']
    case WILD_TYPES.JOKER_BIG:
      return ['hearts', 'diamonds']
    case WILD_TYPES.UNIVERSAL:
      return SUITS
    default:
      return []
  }
}

function groupByRank(cards) {
  const groups = {}
  for (const card of cards) {
    if (!groups[card.rank]) groups[card.rank] = []
    groups[card.rank].push(card)
  }
  return groups
}

function groupBySuit(cards) {
  const groups = {}
  for (const card of cards) {
    if (!card.suit) continue
    if (!groups[card.suit]) groups[card.suit] = []
    groups[card.suit].push(card)
  }
  return groups
}

function getRankCounts(cards) {
  const rankGroups = groupByRank(cards)
  const counts = []
  for (const rank of Object.keys(rankGroups)) {
    counts.push({ rank: parseInt(rank), count: rankGroups[rank].length })
  }
  counts.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    return b.rank - a.rank
  })
  return counts
}

function checkFourOfAKind(cards) {
  const counts = getRankCounts(cards)
  if (counts.length >= 1 && counts[0].count === 4) {
    const fourRank = counts[0].rank
    const kickers = counts.filter((c) => c.rank !== fourRank).map((c) => c.rank).sort((a, b) => b - a)
    return { type: HAND_TYPES.FOUR_OF_A_KIND, primary: fourRank, kickers: kickers.slice(0, 1) }
  }
  return null
}

function checkFullHouse(cards) {
  const counts = getRankCounts(cards)
  if (counts.length >= 2 && counts[0].count === 3 && counts[1].count >= 2) {
    return { type: HAND_TYPES.FULL_HOUSE, primary: counts[0].rank, secondary: counts[1].rank, kickers: [] }
  }
  return null
}

function checkFlush(cards) {
  const suitGroups = groupBySuit(cards)
  for (const suit of Object.keys(suitGroups)) {
    if (suitGroups[suit].length >= 5) {
      const suitedCards = suitGroups[suit].sort((a, b) => b.rank - a.rank)
      const ranks = suitedCards.slice(0, 5).map((c) => c.rank)
      return { type: HAND_TYPES.FLUSH, suit, primary: ranks[0], kickers: ranks.slice(1) }
    }
  }
  return null
}

function checkStraight(cards) {
  const rankSet = new Set(cards.map((c) => c.rank))
  const ranks = [...rankSet].sort((a, b) => b - a)
  for (let i = 0; i <= ranks.length - 5; i++) {
    if (ranks[i] - ranks[i + 4] === 4) {
      return { type: HAND_TYPES.STRAIGHT, primary: ranks[i], kickers: [] }
    }
  }
  if (rankSet.has(14) && rankSet.has(2) && rankSet.has(3) && rankSet.has(4) && rankSet.has(5)) {
    return { type: HAND_TYPES.STRAIGHT, primary: 5, kickers: [] }
  }
  return null
}

function checkStraightFlush(cards) {
  const suitGroups = groupBySuit(cards)
  for (const suit of Object.keys(suitGroups)) {
    if (suitGroups[suit].length >= 5) {
      const suitedCards = suitGroups[suit]
      const straightResult = checkStraight(suitedCards)
      if (straightResult) {
        if (straightResult.primary === 14) {
          return { type: HAND_TYPES.ROYAL_FLUSH, primary: 14, suit, kickers: [] }
        }
        return { type: HAND_TYPES.STRAIGHT_FLUSH, primary: straightResult.primary, suit, kickers: [] }
      }
    }
  }
  return null
}

function checkThreeOfAKind(cards) {
  const counts = getRankCounts(cards)
  if (counts.length >= 1 && counts[0].count === 3) {
    const threeRank = counts[0].rank
    const kickers = counts.filter((c) => c.rank !== threeRank).map((c) => c.rank).sort((a, b) => b - a)
    return { type: HAND_TYPES.THREE_OF_A_KIND, primary: threeRank, kickers: kickers.slice(0, 2) }
  }
  return null
}

function checkTwoPair(cards) {
  const counts = getRankCounts(cards)
  if (counts.length >= 2 && counts[0].count === 2 && counts[1].count === 2) {
    const highPair = Math.max(counts[0].rank, counts[1].rank)
    const lowPair = Math.min(counts[0].rank, counts[1].rank)
    const kickers = counts.filter((c) => c.rank !== highPair && c.rank !== lowPair).map((c) => c.rank).sort((a, b) => b - a)
    return { type: HAND_TYPES.TWO_PAIR, primary: highPair, secondary: lowPair, kickers: kickers.slice(0, 1) }
  }
  return null
}

function checkPair(cards) {
  const counts = getRankCounts(cards)
  if (counts.length >= 1 && counts[0].count === 2) {
    const pairRank = counts[0].rank
    const kickers = counts.filter((c) => c.rank !== pairRank).map((c) => c.rank).sort((a, b) => b - a)
    return { type: HAND_TYPES.PAIR, primary: pairRank, kickers: kickers.slice(0, 3) }
  }
  return null
}

function checkHighCard(cards) {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a)
  return { type: HAND_TYPES.HIGH_CARD, primary: ranks[0], kickers: ranks.slice(1, 5) }
}

function evaluateClassicHand(cards) {
  if (cards.length !== 5) throw new Error('evaluateClassicHand requires exactly 5 cards')
  const checks = [checkStraightFlush, checkFourOfAKind, checkFullHouse, checkFlush, checkStraight, checkThreeOfAKind, checkTwoPair, checkPair, checkHighCard]
  for (const check of checks) {
    const result = check(cards)
    if (result) return result
  }
  return checkHighCard(cards)
}

function compareHandEvaluations(a, b) {
  if (a.type !== b.type) return a.type - b.type
  if (a.primary !== b.primary) return a.primary - b.primary
  if (a.secondary !== undefined && b.secondary !== undefined) {
    if (a.secondary !== b.secondary) return a.secondary - b.secondary
  }
  const maxKickers = Math.max(a.kickers.length, b.kickers.length)
  for (let i = 0; i < maxKickers; i++) {
    const ak = a.kickers[i] || 0
    const bk = b.kickers[i] || 0
    if (ak !== bk) return ak - bk
  }
  return 0
}

function compareWildHandEvaluations(a, b) {
  const baseCompare = compareHandEvaluations(a, b)
  if (baseCompare !== 0) return baseCompare
  if (a.usedWildCount !== b.usedWildCount) return b.usedWildCount - a.usedWildCount
  return 0
}

function generateMappings(wildCards, normalCards) {
  const usedCardKeys = new Set()
  for (const card of normalCards) usedCardKeys.add(`${card.rank}_${card.suit}`)
  const results = []
  const currentMapping = []

  function backtrack(index) {
    if (index === wildCards.length) {
      results.push(currentMapping.map((m) => ({ ...m })))
      return
    }
    const wild = wildCards[index]
    const allowedSuits = getWildAllowedSuits(wild.wildType)
    for (const suit of allowedSuits) {
      for (const rank of RANKS) {
        const key = `${rank}_${suit}`
        if (!usedCardKeys.has(key)) {
          usedCardKeys.add(key)
          currentMapping.push({ wildId: wild.id, wildType: wild.wildType, mappedRank: rank, mappedSuit: suit })
          backtrack(index + 1)
          currentMapping.pop()
          usedCardKeys.delete(key)
        }
      }
    }
  }
  backtrack(0)
  return results
}

function buildEffectiveCards(normalCards, mapping) {
  const cards = normalCards.map((c) => ({ ...c }))
  for (const m of mapping) {
    cards.push({ id: `${m.mappedRank}_${m.mappedSuit}`, rank: m.mappedRank, suit: m.mappedSuit, isWild: false, wildType: null, _isMappedWild: true })
  }
  return cards
}

function adjustFlushEvaluation(evaluation, effectiveCards) {
  const adjustedRanks = []
  for (const card of effectiveCards) {
    if (card._isMappedWild) adjustedRanks.push(1)
    else adjustedRanks.push(card.rank)
  }
  adjustedRanks.sort((a, b) => b - a)
  return { type: HAND_TYPES.FLUSH, primary: adjustedRanks[0], kickers: adjustedRanks.slice(1, 5), suit: evaluation.suit }
}

function evaluateMapping(mapping, normalCards, wildCount) {
  const effectiveCards = buildEffectiveCards(normalCards, mapping)
  let evaluation = evaluateClassicHand(effectiveCards)
  if (evaluation.type === HAND_TYPES.FLUSH) {
    evaluation = adjustFlushEvaluation(evaluation, effectiveCards)
  }
  return {
    type: evaluation.type,
    primary: evaluation.primary,
    secondary: evaluation.secondary,
    kickers: evaluation.kickers ? [...evaluation.kickers] : [],
    suit: evaluation.suit,
    usedWildCount: wildCount
  }
}

function evaluateWildHand(cards) {
  if (cards.length !== 5) throw new Error('evaluateWildHand requires exactly 5 cards')
  const wildCards = []
  const normalCards = []
  for (const card of cards) {
    if (card.isWild) wildCards.push(card)
    else normalCards.push(card)
  }
  if (wildCards.length === 0) {
    const evaluation = evaluateClassicHand(cards)
    return {
      type: evaluation.type,
      primary: evaluation.primary,
      secondary: evaluation.secondary,
      kickers: evaluation.kickers ? [...evaluation.kickers] : [],
      suit: evaluation.suit,
      usedWildCount: 0
    }
  }
  const allMappings = generateMappings(wildCards, normalCards)
  let bestResult = null
  for (const mapping of allMappings) {
    const result = evaluateMapping(mapping, normalCards, wildCards.length)
    if (bestResult === null) {
      bestResult = result
      continue
    }
    if (compareWildHandEvaluations(result, bestResult) > 0) {
      bestResult = result
    }
  }
  return bestResult
}

/**
 * 对任意 5 张牌进行牌型判定
 * @param {Array} cards 5 张牌，每张为 { rank, suit, isWild, wildType }
 * @param {string} mode 'classic' | 'wild'
 * @returns {{type:number, primary:number, secondary?:number, kickers:number[], suit?:string, usedWildCount:number}}
 */
export function evaluateFiveCards(cards, mode) {
  if (!Array.isArray(cards) || cards.length !== 5) return null
  if (mode === 'wild') return evaluateWildHand(cards)
  const evaluation = evaluateClassicHand(cards)
  return {
    type: evaluation.type,
    primary: evaluation.primary,
    secondary: evaluation.secondary,
    kickers: evaluation.kickers ? [...evaluation.kickers] : [],
    suit: evaluation.suit,
    usedWildCount: 0
  }
}
