const SUIT_SYMBOLS = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' }
const SUIT_COLORS = { spades: 'black', clubs: 'black', hearts: 'red', diamonds: 'red' }
const RANK_NAMES = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 10: '10' }

export function cardRankToDisplay(rank) {
  if (RANK_NAMES[rank]) return RANK_NAMES[rank]
  return String(rank)
}

export function formatScore(score) {
  if (score === null || score === undefined || isNaN(score)) return '0'
  const num = Number(score)
  if (num < 10000) {
    return String(num)
  }
  const w = num / 10000
  let formatted = w.toFixed(2)
  formatted = formatted.replace(/\.?0+$/, '')
  return formatted + 'w'
}

export function getCardDisplay(card) {
  if (!card) {
    return { rankText: '', suitText: '', colorClass: 'black', cardClass: '' }
  }

  if (card.isWild || card.wildType) {
    const wt = card.wildType || (card.id && card.id.startsWith('wild_') ? card.id.replace('wild_', '') : null)
    switch (wt) {
      case 'joker_small':
        return { rankText: 'JOKER', suitText: '', colorClass: 'black', cardClass: 'wild-joker-small' }
      case 'joker_big':
        return { rankText: 'JOKER', suitText: '', colorClass: 'red', cardClass: 'wild-joker-big' }
      case 'universal':
        return { rankText: '万', suitText: '能', colorClass: '', cardClass: 'wild-universal' }
      default:
        return { rankText: '?', suitText: '?', colorClass: '', cardClass: 'wild-unknown' }
    }
  }

  const suitText = SUIT_SYMBOLS[card.suit] || ''
  const colorClass = SUIT_COLORS[card.suit] || 'black'
  const rankText = cardRankToDisplay(card.rank)

  return { rankText, suitText, colorClass, cardClass: '' }
}

export const STAGE_NAMES = {
  waiting: '等待中',
  small_blind_declare: '小盲声明',
  pre_flop_bet: '翻牌前',
  flop_bet: '翻牌',
  turn_bet: '转牌',
  river_bet: '河牌',
  showdown_select: '摊牌选牌',
  settling: '结算中',
  hand_end: '本局结束'
}

export const HAND_TYPE_NAMES = {
  0: '高牌',
  1: '一对',
  2: '两对',
  3: '三条',
  4: '顺子',
  5: '同花',
  6: '葫芦',
  7: '四条',
  8: '同花顺',
  9: '皇家同花顺'
}
