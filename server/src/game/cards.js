const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
const SUIT_SYMBOLS = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
const SUIT_COLORS = { spades: 'black', clubs: 'black', hearts: 'red', diamonds: 'red' };
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const RANK_NAMES = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

const WILD_TYPES = {
  JOKER_SMALL: 'joker_small',
  JOKER_BIG: 'joker_big',
  UNIVERSAL: 'universal'
};

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
};

const HAND_TYPE_NAMES = {
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
};

function createCard(rank, suit) {
  return {
    id: `${rank}_${suit}`,
    rank,
    suit,
    isWild: false,
    wildType: null
  };
}

function createWildCard(wildType) {
  let id, rankLabel, suitLabel;
  switch (wildType) {
    case WILD_TYPES.JOKER_SMALL:
      id = 'wild_joker_small';
      rankLabel = '小';
      suitLabel = '王';
      break;
    case WILD_TYPES.JOKER_BIG:
      id = 'wild_joker_big';
      rankLabel = '大';
      suitLabel = '王';
      break;
    case WILD_TYPES.UNIVERSAL:
      id = 'wild_universal';
      rankLabel = '万';
      suitLabel = '能';
      break;
    default:
      id = 'wild_unknown';
      rankLabel = '?';
      suitLabel = '?';
  }
  return {
    id,
    rank: 0,
    suit: null,
    isWild: true,
    wildType,
    rankLabel,
    suitLabel
  };
}

function getStandardDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(createCard(rank, suit));
    }
  }
  return deck;
}

function getWildDeck() {
  const deck = getStandardDeck();
  deck.push(createWildCard(WILD_TYPES.JOKER_SMALL));
  deck.push(createWildCard(WILD_TYPES.JOKER_BIG));
  deck.push(createWildCard(WILD_TYPES.UNIVERSAL));
  return deck;
}

function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function cardRankToDisplay(rank) {
  if (RANK_NAMES[rank]) return RANK_NAMES[rank];
  return String(rank);
}

function getWildAllowedSuits(wildType) {
  switch (wildType) {
    case WILD_TYPES.JOKER_SMALL:
      return ['spades', 'clubs'];
    case WILD_TYPES.JOKER_BIG:
      return ['hearts', 'diamonds'];
    case WILD_TYPES.UNIVERSAL:
      return SUITS;
    default:
      return [];
  }
}

module.exports = {
  SUITS,
  SUIT_SYMBOLS,
  SUIT_COLORS,
  RANKS,
  RANK_NAMES,
  WILD_TYPES,
  HAND_TYPES,
  HAND_TYPE_NAMES,
  createCard,
  createWildCard,
  getStandardDeck,
  getWildDeck,
  shuffleDeck,
  cardRankToDisplay,
  getWildAllowedSuits
};
