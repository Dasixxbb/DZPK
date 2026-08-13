const { getStandardDeck, getWildDeck, shuffleDeck, HAND_TYPE_NAMES } = require('./cards');
const { evaluateClassicHand, compareHandEvaluations } = require('./handEvaluator');
const { evaluateWildHand, compareWildHandEvaluations, findBest5CardsFrom7 } = require('./wildHandEvaluator');
const config = require('../config');

const STAGE = {
  WAITING: 'waiting',
  LOCKED: 'locked',
  SMALL_BLIND_DECLARE: 'small_blind_declare',
  COLLECT_BLINDS: 'collect_blinds',
  DEAL_HOLE_CARDS: 'deal_hole_cards',
  PRE_FLOP_BET: 'pre_flop_bet',
  FLOP_BET: 'flop_bet',
  TURN_BET: 'turn_bet',
  RIVER_BET: 'river_bet',
  SHOWDOWN_SELECT: 'showdown_select',
  SETTLING: 'settling',
  HAND_END: 'hand_end'
};

const BETTING_STAGES = [STAGE.PRE_FLOP_BET, STAGE.FLOP_BET, STAGE.TURN_BET, STAGE.RIVER_BET];
const DEFAULT_ACTION_TIMEOUT = config.timeouts.actionMs;
const DEFAULT_SB_DECLARE_TIMEOUT = config.timeouts.smallBlindDeclareMs;
const DEFAULT_SHOWDOWN_SELECT_TIMEOUT = config.timeouts.showdownSelectMs;
const ACTION_TYPE = {
  FOLD: 'fold',
  CHECK: 'check',
  CALL: 'call',
  RAISE: 'raise',
  ALL_IN: 'all_in'
};

class GameEngine {
  constructor(room) {
    this.room = room;
    this.hand = null;
    this.lastHand = null;
    this.timeoutTimer = null;
    this.actionTimeout = DEFAULT_ACTION_TIMEOUT;
    this.sbDeclareTimeout = DEFAULT_SB_DECLARE_TIMEOUT;
    this.showdownSelectTimeout = DEFAULT_SHOWDOWN_SELECT_TIMEOUT;
    this.handIdCounter = 0;
    this.onTimedStateChange = null;
  }

  clearTimeoutTimer() {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
    // 阶段计时清除时同步清除截止时间，避免广播过期 deadline
    if (this.hand) {
      this.hand.stageDeadlineAt = null;
      this.hand.stageDeadlineTotalMs = null;
    }
  }

  setTimeoutTimer(callback, ms) {
    this.clearTimeoutTimer();
    // 记录阶段计时的绝对截止时间，供客户端共享倒计时与断线重连后续算
    if (this.hand) {
      this.hand.stageDeadlineAt = Date.now() + ms;
      this.hand.stageDeadlineTotalMs = ms;
    }
    this.timeoutTimer = setTimeout(() => {
      this.timeoutTimer = null;
      try {
        callback.call(this);
        if (typeof this.onTimedStateChange === 'function') {
          this.onTimedStateChange(this);
        }
      } catch (e) {
        console.error('[GameEngine] timeout callback error:', e);
      }
    }, ms);
  }

  canStartHand() {
    if (!this.room || !this.room.players) return false;
    const readyPlayers = Object.values(this.room.players).filter(p => p && p.isReady && p.score > 0);
    return readyPlayers.length >= 2;
  }

  startNewHand() {
    if (!this.canStartHand()) {
      throw new Error('不满足开局条件');
    }
    if (this.hand && this.hand.stage !== STAGE.WAITING && this.hand.stage !== STAGE.HAND_END) {
      throw new Error('当前局尚未结束');
    }

    this.clearTimeoutTimer();
    this.lastHand = null;

    const mode = this.room.mode || 'classic';
    this.handIdCounter++;

    const readySeats = [];
    const players = {};
    const seatIds = Object.keys(this.room.players).map(k => parseInt(k)).sort((a, b) => a - b);

    for (const seatId of seatIds) {
      const rp = this.room.players[seatId];
      if (rp && rp.isReady && rp.score > 0) {
        readySeats.push(seatId);
        players[seatId] = {
          sessionId: rp.sessionId,
          seatId,
          nickname: rp.nickname,
          holeCards: [],
          revealedHoleCardIds: [],
          suggestedCards: null,
          suggestedEvaluation: null,
          selectedCards: null,
          showdownSubmitted: false,
          finalEvaluation: null,
          currentBet: 0,
          totalBet: 0,
          startingScore: rp.score,
          score: rp.score,
          hasFolded: false,
          isAllIn: false,
          isActed: false
        };
      }
    }

    let dealerSeat;
    if (this.hand && typeof this.hand.dealerSeat === 'number' && readySeats.includes(this.hand.dealerSeat)) {
      const prevIdx = readySeats.indexOf(this.hand.dealerSeat);
      dealerSeat = readySeats[(prevIdx + 1) % readySeats.length];
    } else if (typeof this.room.dealerSeat === 'number' && readySeats.includes(this.room.dealerSeat)) {
      dealerSeat = this.room.dealerSeat;
    } else {
      dealerSeat = readySeats[0];
    }

    const n = readySeats.length;
    const dealerIdx = readySeats.indexOf(dealerSeat);
    let smallBlindSeat, bigBlindSeat;

    if (n === 2) {
      smallBlindSeat = dealerSeat;
      bigBlindSeat = readySeats[(dealerIdx + 1) % n];
    } else {
      smallBlindSeat = readySeats[(dealerIdx + 1) % n];
      bigBlindSeat = readySeats[(dealerIdx + 2) % n];
    }

    this.hand = {
      handId: `${Date.now()}_${this.handIdCounter}`,
      mode,
      stage: STAGE.LOCKED,
      dealerSeat,
      smallBlindSeat,
      bigBlindSeat,
      smallBlindAmount: null,
      deck: [],
      communityCards: [],
      players,
      activeSeats: readySeats.slice(),
      pot: 0,
      sidePots: [],
      currentBetToCall: 0,
      currentRaiseAmount: 0,
      currentPlayerSeat: null,
      lastRaiserSeat: null,
      actionCounts: {},
      results: null
    };

    for (const seat of readySeats) {
      this.hand.actionCounts[seat] = 0;
    }

    this.hand.stage = STAGE.SMALL_BLIND_DECLARE;
    this.hand.currentPlayerSeat = smallBlindSeat;

    this.setTimeoutTimer(() => {
      this.declareSmallBlind(smallBlindSeat, 1);
    }, this.sbDeclareTimeout);
  }

  declareSmallBlind(seatId, amount) {
    if (!this.hand || this.hand.stage !== STAGE.SMALL_BLIND_DECLARE) {
      throw new Error('当前阶段不能声明小盲');
    }
    if (seatId !== this.hand.smallBlindSeat) {
      throw new Error('只能由小盲玩家声明盲注');
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('盲注金额必须是正整数');
    }
    const sbPlayer = this.hand.players[seatId];
    if (amount > sbPlayer.score) {
      throw new Error('盲注金额不能超过玩家积分');
    }

    this.clearTimeoutTimer();
    this.hand.smallBlindAmount = amount;
    this.collectBlindsAndDeal();
  }

  collectBlindsAndDeal() {
    if (!this.hand || this.hand.stage !== STAGE.SMALL_BLIND_DECLARE) {
      throw new Error('当前阶段不能收取盲注');
    }
    this.hand.stage = STAGE.COLLECT_BLINDS;

    const sbAmount = this.hand.smallBlindAmount;
    const bbAmount = sbAmount * 2;
    const sbSeat = this.hand.smallBlindSeat;
    const bbSeat = this.hand.bigBlindSeat;

    const sbPlayer = this.hand.players[sbSeat];
    const bbPlayer = this.hand.players[bbSeat];

    const sbActual = Math.min(sbAmount, sbPlayer.score);
    sbPlayer.currentBet = sbActual;
    sbPlayer.totalBet = sbActual;
    sbPlayer.score -= sbActual;
    if (sbPlayer.score <= 0) {
      sbPlayer.isAllIn = true;
    }

    const bbActual = Math.min(bbAmount, bbPlayer.score);
    bbPlayer.currentBet = bbActual;
    bbPlayer.totalBet = bbActual;
    bbPlayer.score -= bbActual;
    if (bbPlayer.score <= 0) {
      bbPlayer.isAllIn = true;
    }

    this.hand.pot = sbActual + bbActual;
    this.hand.currentBetToCall = bbActual;
    this.hand.currentRaiseAmount = sbAmount;

    if (sbPlayer.isAllIn || bbPlayer.isAllIn) {
      this._createSidePotsFromBets();
    }

    this.hand.stage = STAGE.DEAL_HOLE_CARDS;
    const deckFn = this.hand.mode === 'wild' ? getWildDeck : getStandardDeck;
    this.hand.deck = shuffleDeck(deckFn());

    for (let i = 0; i < 2; i++) {
      for (const seat of this.hand.activeSeats) {
        if (this.hand.deck.length > 0) {
          this.hand.players[seat].holeCards.push(this.hand.deck.pop());
        }
      }
    }

    this.hand.stage = STAGE.PRE_FLOP_BET;
    for (const seat of this.hand.activeSeats) {
      this.hand.players[seat].isActed = false;
    }
    this.hand.actionCounts = {};
    for (const seat of this.hand.activeSeats) {
      this.hand.actionCounts[seat] = 0;
    }
    this.hand.lastRaiserSeat = null;
    this._findNextActionPlayer(true);
  }

  _resetBettingRoundState() {
    for (const seat of this.hand.activeSeats) {
      const p = this.hand.players[seat];
      p.currentBet = 0;
      p.isActed = false;
    }
    this.hand.actionCounts = {};
    for (const seat of this.hand.activeSeats) {
      this.hand.actionCounts[seat] = 0;
    }
    this.hand.currentBetToCall = 0;
    this.hand.currentRaiseAmount = 0;
    this.hand.lastRaiserSeat = null;
  }

  _getOrderedSeatsForPreFlop() {
    const seats = this.hand.activeSeats.slice().sort((a, b) => a - b);
    const bbIdx = seats.indexOf(this.hand.bigBlindSeat);
    const n = seats.length;
    const result = [];
    for (let i = 1; i <= n; i++) {
      result.push(seats[(bbIdx + i) % n]);
    }
    return result;
  }

  _getOrderedSeatsForPostFlop() {
    const seats = this.hand.activeSeats.slice().sort((a, b) => a - b);
    const sbIdx = seats.indexOf(this.hand.smallBlindSeat);
    const n = seats.length;
    const result = [];
    for (let i = 0; i < n; i++) {
      result.push(seats[(sbIdx + i) % n]);
    }
    return result;
  }

  _findNextActionPlayer(isPreFlopStart = false) {
    const alive = this.hand.activeSeats.filter(s => !this.hand.players[s].hasFolded);
    const notAllInAlive = alive.filter(s => !this.hand.players[s].isAllIn);

    if (alive.length <= 1) {
      this._advanceAfterBettingRound();
      return;
    }

    if (notAllInAlive.length === 0) {
      for (const seat of alive) {
        this.hand.players[seat].isActed = true;
      }
      this._advanceAfterBettingRound();
      return;
    }

    let orderedSeats;
    const stage = this.hand.stage;

    if (stage === STAGE.PRE_FLOP_BET) {
      if (isPreFlopStart && !this.hand.lastRaiserSeat) {
        orderedSeats = this._getOrderedSeatsForPreFlop();
      } else {
        orderedSeats = this._getClockwiseFromCurrent();
      }
    } else {
      if (this.hand.currentPlayerSeat === null || !this.hand.lastRaiserSeat) {
        orderedSeats = this._getOrderedSeatsForPostFlop();
      } else {
        orderedSeats = this._getClockwiseFromCurrent();
      }
    }

    for (const seat of orderedSeats) {
      const p = this.hand.players[seat];
      if (!p || p.hasFolded || p.isAllIn) continue;
      if (this._isBettingRoundCompleteForSeat(seat)) continue;
      this.hand.currentPlayerSeat = seat;
      if (BETTING_STAGES.includes(stage)) {
        this.setTimeoutTimer(() => {
          this.handleTimeout();
        }, this.actionTimeout);
      }
      return;
    }

    this._advanceAfterBettingRound();
  }

  _getClockwiseFromCurrent() {
    const seats = this.hand.activeSeats.slice().sort((a, b) => a - b);
    const n = seats.length;
    const startSeat = this.hand.currentPlayerSeat !== null
      ? this.hand.currentPlayerSeat
      : (this.hand.lastRaiserSeat !== null ? this.hand.lastRaiserSeat : seats[0]);
    const startIdx = seats.indexOf(startSeat);
    const result = [];
    for (let i = 1; i <= n; i++) {
      result.push(seats[(startIdx + i) % n]);
    }
    return result;
  }

  _isBettingRoundCompleteForSeat(seatId) {
    const p = this.hand.players[seatId];
    if (!p || p.hasFolded || p.isAllIn) return true;
    if (!p.isActed) return false;
    if (this.hand.currentBetToCall === 0) return true;
    return p.currentBet >= this.hand.currentBetToCall;
  }

  _isBettingRoundComplete() {
    const alive = this.hand.activeSeats.filter(s => !this.hand.players[s].hasFolded);
    if (alive.length <= 1) return true;

    const notAllInAlive = alive.filter(s => !this.hand.players[s].isAllIn);
    if (notAllInAlive.length === 0) return true;

    for (const seat of notAllInAlive) {
      if (!this._isBettingRoundCompleteForSeat(seat)) return false;
    }
    return true;
  }

  doPlayerAction(seatId, actionType, amount) {
    if (!this.hand) throw new Error('对局未开始');
    if (!BETTING_STAGES.includes(this.hand.stage)) {
      throw new Error('当前阶段不能进行下注操作');
    }
    if (this.hand.currentPlayerSeat !== seatId) {
      throw new Error('不是该玩家的行动回合');
    }
    const player = this.hand.players[seatId];
    if (!player) throw new Error('玩家不存在');
    if (player.hasFolded) throw new Error('玩家已弃牌');
    if (player.isAllIn) throw new Error('玩家已全下');

    const betToCall = this.hand.currentBetToCall;
    const currentBet = player.currentBet;
    const needToCall = Math.max(0, betToCall - currentBet);
    const remaining = player.score;

    switch (actionType) {
      case ACTION_TYPE.FOLD:
        player.hasFolded = true;
        player.isActed = true;
        break;

      case ACTION_TYPE.CHECK:
        if (needToCall > 0) {
          throw new Error('当前有下注额，不能过牌');
        }
        player.isActed = true;
        break;

      case ACTION_TYPE.CALL: {
        if (needToCall <= 0) {
          throw new Error('无需跟注');
        }
        const payAmount = Math.min(needToCall, remaining);
        this._applyBet(seatId, payAmount);
        if (remaining <= needToCall) {
          player.isAllIn = true;
        }
        player.isActed = true;
        break;
      }

      case ACTION_TYPE.RAISE: {
        if (!Number.isInteger(amount) || amount <= 0) {
          throw new Error('加注金额必须是正整数');
        }
        if (needToCall > 0 && remaining <= needToCall) {
          throw new Error('积分不足以跟注，无法加注');
        }
        const raiseIncrement = amount;

        const totalBetTarget = betToCall + raiseIncrement;
        const totalRequired = needToCall + raiseIncrement;
        if (remaining >= totalRequired) {
          this._applyBet(seatId, totalRequired);
          this.hand.currentRaiseAmount = raiseIncrement;
          this.hand.currentBetToCall = totalBetTarget;
          this.hand.lastRaiserSeat = seatId;
          this._resetActedAfterRaise(seatId);
          player.isActed = true;
        } else {
          const allInTotal = currentBet + remaining;
          if (allInTotal > betToCall) {
            this._applyBet(seatId, remaining);
            player.isAllIn = true;
            this.hand.currentRaiseAmount = allInTotal - betToCall;
            this.hand.currentBetToCall = allInTotal;
            this.hand.lastRaiserSeat = seatId;
            this._resetActedAfterRaise(seatId);
            player.isActed = true;
          } else {
            throw new Error('积分不足以完成加注');
          }
        }
        break;
      }

      case ACTION_TYPE.ALL_IN: {
        if (remaining <= 0) {
          throw new Error('没有积分可以全下');
        }
        const allInTotal = currentBet + remaining;
        this._applyBet(seatId, remaining);
        player.isAllIn = true;

        if (allInTotal > betToCall) {
          const actualRaise = allInTotal - betToCall;
          this.hand.currentRaiseAmount = Math.max(this.hand.currentRaiseAmount, actualRaise);
          this.hand.lastRaiserSeat = seatId;
          this._resetActedAfterRaise(seatId);
          this.hand.currentBetToCall = allInTotal;
        }
        player.isActed = true;
        break;
      }

      default:
        throw new Error(`未知操作类型: ${actionType}`);
    }

    this.hand.actionCounts[seatId] = (this.hand.actionCounts[seatId] || 0) + 1;

    if (this._isBettingRoundComplete()) {
      this._advanceAfterBettingRound();
    } else {
      this._findNextActionPlayer();
    }
  }

  _resetActedAfterRaise(raiserSeatId) {
    for (const seat of this.hand.activeSeats) {
      const p = this.hand.players[seat];
      if (p && !p.hasFolded && !p.isAllIn && seat !== raiserSeatId) {
        p.isActed = false;
      }
    }
  }

  _applyBet(seatId, payAmount) {
    const player = this.hand.players[seatId];
    player.score -= payAmount;
    player.currentBet += payAmount;
    player.totalBet += payAmount;
    this.hand.pot += payAmount;
  }

  _createSidePotsFromBets() {
    const aliveSeats = this.hand.activeSeats.filter(s => !this.hand.players[s].hasFolded);
    const betMap = {};
    for (const seat of aliveSeats) {
      betMap[seat] = this.hand.players[seat].totalBet;
    }

    const thresholds = [...new Set(Object.values(betMap))].sort((a, b) => a - b);
    const sidePots = [];
    let prevThreshold = 0;

    for (const threshold of thresholds) {
      if (threshold <= prevThreshold) continue;
      const eligibleSeats = aliveSeats.filter(s => betMap[s] >= threshold);
      if (eligibleSeats.length === 0) continue;

      let amount = 0;
      for (const seat of aliveSeats) {
        const seatBet = Math.min(betMap[seat], threshold);
        const prevSeatBet = Math.min(betMap[seat], prevThreshold);
        amount += (seatBet - prevSeatBet);
      }

      if (amount > 0 && eligibleSeats.length >= 1) {
        sidePots.push({ amount, eligibleSeats });
      }
      prevThreshold = threshold;
    }

    this.hand.sidePots = sidePots;
  }

  _advanceAfterBettingRound() {
    const alive = this.hand.activeSeats.filter(s => !this.hand.players[s].hasFolded);
    const anyAllIn = alive.some(s => this.hand.players[s].isAllIn);
    if (anyAllIn) {
      this._createSidePotsFromBets();
    }
    if (alive.length <= 1) {
      this._settleByFold();
      return;
    }

    const notAllInAlive = alive.filter(s => !this.hand.players[s].isAllIn);
    if (notAllInAlive.length === 0) {
      while (this.hand.communityCards.length < 5 && this.hand.deck.length > 0) {
        this.hand.communityCards.push(this.hand.deck.pop());
      }
      this.enterShowdownPhase();
      return;
    }

    this.advanceToNextBettingStage();
  }

  advanceToNextBettingStage() {
    if (!this.hand) throw new Error('对局未开始');
    const stage = this.hand.stage;

    if (stage === STAGE.PRE_FLOP_BET) {
      for (let i = 0; i < 3; i++) {
        if (this.hand.deck.length > 0) {
          this.hand.communityCards.push(this.hand.deck.pop());
        }
      }
      this.hand.stage = STAGE.FLOP_BET;
    } else if (stage === STAGE.FLOP_BET) {
      if (this.hand.deck.length > 0) {
        this.hand.communityCards.push(this.hand.deck.pop());
      }
      this.hand.stage = STAGE.TURN_BET;
    } else if (stage === STAGE.TURN_BET) {
      if (this.hand.deck.length > 0) {
        this.hand.communityCards.push(this.hand.deck.pop());
      }
      this.hand.stage = STAGE.RIVER_BET;
    } else if (stage === STAGE.RIVER_BET) {
      this.enterShowdownPhase();
      return;
    } else {
      throw new Error('当前阶段不能推进下注阶段');
    }

    this._resetBettingRoundState();
    this.hand.currentPlayerSeat = null;
    this._findNextActionPlayer();
  }

  enterShowdownPhase() {
    if (!this.hand) throw new Error('对局未开始');
    this.clearTimeoutTimer();
    this.hand.stage = STAGE.SHOWDOWN_SELECT;

    const alive = this.hand.activeSeats.filter(s => !this.hand.players[s].hasFolded);
    for (const seat of alive) {
      const p = this.hand.players[seat];
      p.showdownSubmitted = false;
      p.selectedCards = null;
      p.finalEvaluation = null;
      p.suggestedCards = null;
      p.suggestedEvaluation = null;
      const sevenCards = [...p.holeCards, ...this.hand.communityCards];
      if (sevenCards.length >= 7) {
        try {
          const { bestCards, bestEvaluation } = findBest5CardsFrom7(sevenCards.slice(0, 7), this.hand.mode);
          p.suggestedCards = bestCards;
          p.suggestedEvaluation = bestEvaluation;
        } catch (e) {
          console.error('[GameEngine] auto select best cards error:', e);
        }
      }
    }

    this.setTimeoutTimer(() => {
      this.settleShowdown();
    }, this.showdownSelectTimeout);
  }

  _evaluateSelectedCards(selectedCards) {
    if (this.hand.mode === 'wild') {
      return evaluateWildHand(selectedCards);
    }
    const ce = evaluateClassicHand(selectedCards);
    return {
      type: ce.type,
      primary: ce.primary,
      secondary: ce.secondary,
      kickers: ce.kickers ? [...ce.kickers] : [],
      suit: ce.suit,
      usedWildCount: 0,
      wildMappings: [],
      effectiveCards: selectedCards.map(c => ({ ...c }))
    };
  }

  updateSelectedCards(seatId, cardIds) {
    if (!this.hand || this.hand.stage !== STAGE.SHOWDOWN_SELECT) {
      throw new Error('当前阶段不能选牌');
    }
    const player = this.hand.players[seatId];
    if (!player) throw new Error('玩家不存在');
    if (player.hasFolded) throw new Error('玩家已弃牌');
    if (!Array.isArray(cardIds) || cardIds.length === 0) {
      player.selectedCards = null;
      player.finalEvaluation = null;
      return;
    }
    if (!Array.isArray(cardIds) || cardIds.length !== 5) {
      throw new Error('必须选择5张牌');
    }

    const sevenCards = [...player.holeCards, ...this.hand.communityCards];
    const sevenCardIds = new Set(sevenCards.map(c => c.id));
    for (const id of cardIds) {
      if (!sevenCardIds.has(id)) {
        throw new Error('选择的牌不在可用牌中');
      }
    }
    const uniqueIds = new Set(cardIds);
    if (uniqueIds.size !== 5) {
      throw new Error('选择的牌不能重复');
    }

    const selectedCards = cardIds.map(id => sevenCards.find(c => c.id === id)).filter(Boolean);
    if (selectedCards.length !== 5) {
      throw new Error('部分牌未找到');
    }

    player.selectedCards = selectedCards;
    player.finalEvaluation = this._evaluateSelectedCards(selectedCards);
  }

  submitSelectedCards(seatId, cardIds) {
    this.updateSelectedCards(seatId, cardIds);
    const player = this.hand.players[seatId];
    player.showdownSubmitted = true;
  }

  settleShowdown() {
    if (!this.hand) throw new Error('对局未开始');
    if (this.hand.stage !== STAGE.SHOWDOWN_SELECT) {
      throw new Error('当前阶段不能结算');
    }
    this.clearTimeoutTimer();
    this.hand.stage = STAGE.SETTLING;

    const alive = this.hand.activeSeats.filter(s => !this.hand.players[s].hasFolded);
    for (const seat of alive) {
      const p = this.hand.players[seat];
      if (!p.showdownSubmitted) {
        if (p.selectedCards && p.selectedCards.length === 5 && p.finalEvaluation) {
          continue;
        }
        if (p.suggestedCards && p.suggestedEvaluation) {
          p.selectedCards = p.suggestedCards.map(c => ({ ...c }));
          p.finalEvaluation = {
            ...p.suggestedEvaluation,
            kickers: p.suggestedEvaluation.kickers ? [...p.suggestedEvaluation.kickers] : [],
            wildMappings: p.suggestedEvaluation.wildMappings ? [...p.suggestedEvaluation.wildMappings] : [],
            effectiveCards: p.suggestedEvaluation.effectiveCards
              ? p.suggestedEvaluation.effectiveCards.map(c => ({ ...c }))
              : null
          };
          continue;
        }
        const sevenCards = [...p.holeCards, ...this.hand.communityCards];
        if (sevenCards.length >= 7) {
          try {
            const { bestCards, bestEvaluation } = findBest5CardsFrom7(sevenCards.slice(0, 7), this.hand.mode);
            p.selectedCards = bestCards;
            p.finalEvaluation = bestEvaluation;
          } catch (e) {
            console.error('[GameEngine] settle auto select error:', e);
          }
        }
      }
    }

    this._createSidePotsFromBets();

    const results = {
      pots: [],
      playerDelta: {},
      totalPot: this.hand.pot
    };

    for (const seat of this.hand.activeSeats) {
      results.playerDelta[seat] = 0;
    }

    const compareFn = this.hand.mode === 'wild' ? compareWildHandEvaluations : compareHandEvaluations;

    let processedPots = [];
    if (this.hand.sidePots.length > 0) {
      processedPots = this.hand.sidePots.map(sp => ({
        amount: sp.amount,
        eligibleSeats: sp.eligibleSeats.slice()
      }));
    } else {
      processedPots = [{
        amount: this.hand.pot,
        eligibleSeats: alive.slice()
      }];
    }

    for (let potIdx = 0; potIdx < processedPots.length; potIdx++) {
      const pot = processedPots[potIdx];
      const eligibleAlive = pot.eligibleSeats.filter(s => !this.hand.players[s].hasFolded);

      if (eligibleAlive.length === 0) {
        continue;
      }

      if (eligibleAlive.length === 1) {
        const winnerSeat = eligibleAlive[0];
        const winnerPlayer = this.hand.players[winnerSeat];
        const winAmount = pot.amount;
        winnerPlayer.score += winAmount;
        results.playerDelta[winnerSeat] += winAmount;

        results.pots.push({
          potIndex: potIdx,
          amount: pot.amount,
          winners: [{
            seatId: winnerSeat,
            nickname: winnerPlayer.nickname,
            amount: winAmount,
            handType: winnerPlayer.finalEvaluation ? HAND_TYPE_NAMES[winnerPlayer.finalEvaluation.type] : null,
            evaluation: winnerPlayer.finalEvaluation,
            selectedCards: winnerPlayer.selectedCards
          }]
        });
        continue;
      }

      const evaluations = {};
      for (const seat of eligibleAlive) {
        evaluations[seat] = this.hand.players[seat].finalEvaluation;
      }

      let bestSeats = [eligibleAlive[0]];
      let bestEval = evaluations[eligibleAlive[0]];

      for (let i = 1; i < eligibleAlive.length; i++) {
        const seat = eligibleAlive[i];
        const evalCur = evaluations[seat];
        const cmp = compareFn(evalCur, bestEval);
        if (cmp > 0) {
          bestSeats = [seat];
          bestEval = evalCur;
        } else if (cmp === 0) {
          bestSeats.push(seat);
        }
      }

      const winners = [];
      const totalShare = bestSeats.length;
      const baseShare = Math.floor(pot.amount / totalShare);
      let remainder = pot.amount - baseShare * totalShare;

      const sortedBestSeats = bestSeats.slice().sort((a, b) => a - b);
      for (let i = 0; i < sortedBestSeats.length; i++) {
        const seat = sortedBestSeats[i];
        const p = this.hand.players[seat];
        let share = baseShare;
        if (remainder > 0) {
          share += 1;
          remainder -= 1;
        }
        if (share > 0) {
          p.score += share;
          results.playerDelta[seat] += share;
        }
        winners.push({
          seatId: seat,
          nickname: p.nickname,
          amount: share,
          handType: p.finalEvaluation ? HAND_TYPE_NAMES[p.finalEvaluation.type] : null,
          evaluation: p.finalEvaluation,
          selectedCards: p.selectedCards,
          wildMappings: p.finalEvaluation ? (p.finalEvaluation.wildMappings || []) : []
        });
      }

      results.pots.push({
        potIndex: potIdx,
        amount: pot.amount,
        winners
      });
    }

    for (const seat of this.hand.activeSeats) {
      const p = this.hand.players[seat];
      results.playerDelta[seat] = p.score - p.startingScore;
    }

    this.hand.results = results;
    this.hand.stage = STAGE.HAND_END;
    return results;
  }

  _settleByFold() {
    if (!this.hand) throw new Error('对局未开始');
    this.clearTimeoutTimer();
    this.hand.stage = STAGE.SETTLING;

    const alive = this.hand.activeSeats.filter(s => !this.hand.players[s].hasFolded);
    const results = {
      pots: [],
      playerDelta: {},
      totalPot: this.hand.pot,
      byFold: true
    };
    for (const seat of this.hand.activeSeats) {
      results.playerDelta[seat] = 0;
    }

    if (alive.length === 1) {
      const winnerSeat = alive[0];
      const winnerPlayer = this.hand.players[winnerSeat];
      const winAmount = this.hand.pot;
      winnerPlayer.score += winAmount;
      results.playerDelta[winnerSeat] = winAmount;

      results.pots.push({
        potIndex: 0,
        amount: this.hand.pot,
        winners: [{
          seatId: winnerSeat,
          nickname: winnerPlayer.nickname,
          amount: winAmount,
          handType: null,
          evaluation: null,
          selectedCards: null,
          byFold: true
        }]
      });
    }

    for (const seat of this.hand.activeSeats) {
      const p = this.hand.players[seat];
      results.playerDelta[seat] = p.score - p.startingScore;
    }

    this.hand.results = results;
    this.hand.stage = STAGE.HAND_END;
    return results;
  }

  endHandAndPrepareNext() {
    if (!this.hand) throw new Error('对局未开始');
    if (this.hand.stage !== STAGE.HAND_END && this.hand.stage !== STAGE.WAITING) {
      throw new Error('当前阶段不能结束本局');
    }

    this.clearTimeoutTimer();

    const prevDealerSeat = this.hand.dealerSeat;

    for (const seatId of Object.keys(this.hand.players)) {
      const p = this.hand.players[seatId];
      if (this.room.players[seatId]) {
        this.room.players[seatId].score = p.score;
        this.room.players[seatId].isReady = false;
        if (p.score <= 0) {
          this.room.players[seatId].isReady = false;
        }
      }
    }

    const occupiedSeats = [];
    for (let i = 0; i < this.room.seats.length; i++) {
      if (this.room.seats[i]) occupiedSeats.push(i);
    }
    let nextDealer = prevDealerSeat;
    if (occupiedSeats.length >= 2) {
      const curIdx = occupiedSeats.indexOf(prevDealerSeat);
      const nextIdx = (curIdx === -1) ? 0 : ((curIdx + 1) % occupiedSeats.length);
      nextDealer = occupiedSeats[nextIdx];
    }
    this.room.dealerSeat = nextDealer;

    // 保留上一局快照，供结算后（未准备前）玩家继续展示/收回手牌；新一局开始时由 startNewHand 清空
    this.lastHand = this.hand;
    this.hand = null;
  }

  handleTimeout() {
    if (!this.hand) return;

    const stage = this.hand.stage;

    if (stage === STAGE.SMALL_BLIND_DECLARE) {
      this.declareSmallBlind(this.hand.smallBlindSeat, 1);
      return;
    }

    if (stage === STAGE.SHOWDOWN_SELECT) {
      this.settleShowdown();
      return;
    }

    if (BETTING_STAGES.includes(stage)) {
      const seatId = this.hand.currentPlayerSeat;
      if (seatId !== null && this.hand.players[seatId]) {
        const p = this.hand.players[seatId];
        const needToCall = Math.max(0, this.hand.currentBetToCall - p.currentBet);

        if (needToCall > 0) {
          try {
            if (p.score <= needToCall) {
              this.doPlayerAction(seatId, ACTION_TYPE.ALL_IN);
            } else {
              this.doPlayerAction(seatId, ACTION_TYPE.CALL);
            }
          } catch (e) {
            try { this.doPlayerAction(seatId, ACTION_TYPE.FOLD); } catch (e2) {}
          }
        } else {
          try {
            this.doPlayerAction(seatId, ACTION_TYPE.CHECK);
          } catch (e) {
            try { this.doPlayerAction(seatId, ACTION_TYPE.FOLD); } catch (e2) {}
          }
        }
      }
    }
  }

  forceFoldPlayer(seatId) {
    if (!this.hand || !this.hand.players[seatId]) {
      return false;
    }

    const player = this.hand.players[seatId];
    if (player.hasFolded) {
      return false;
    }

    if (BETTING_STAGES.includes(this.hand.stage) && this.hand.currentPlayerSeat === seatId) {
      this.doPlayerAction(seatId, ACTION_TYPE.FOLD);
      return true;
    }

    player.hasFolded = true;
    player.isActed = true;
    player.showdownSubmitted = false;
    player.suggestedCards = null;
    player.suggestedEvaluation = null;
    player.selectedCards = null;
    player.finalEvaluation = null;

    const alive = this.hand.activeSeats.filter((s) => !this.hand.players[s].hasFolded);
    if (alive.length <= 1) {
      this._settleByFold();
      return true;
    }

    if (this.hand.stage === STAGE.SMALL_BLIND_DECLARE) {
      if (seatId === this.hand.smallBlindSeat && this.hand.smallBlindAmount === null) {
        this.declareSmallBlind(this.hand.smallBlindSeat, 1);
      }
      return true;
    }

    if (BETTING_STAGES.includes(this.hand.stage)) {
      if (this._isBettingRoundComplete()) {
        this._advanceAfterBettingRound();
      }
      return true;
    }

    if (this.hand.stage === STAGE.SHOWDOWN_SELECT) {
      const showdownAlive = this.hand.activeSeats.filter((s) => !this.hand.players[s].hasFolded);
      if (showdownAlive.length <= 1) {
        this._settleByFold();
        return true;
      }

      const allSubmitted = showdownAlive.every((s) => this.hand.players[s].showdownSubmitted === true);
      if (allSubmitted) {
        this.settleShowdown();
      }
      return true;
    }

    return true;
  }

  toggleHoleCardReveal(seatId, cardId) {
    // 结算后（this.hand 为空）仍允许玩家通过上一局快照展示/收回自己的手牌
    const hand = this.hand || this.lastHand;
    if (!hand) {
      throw new Error('当前没有进行中的牌局');
    }

    const player = hand.players[seatId];
    if (!player) {
      throw new Error('玩家不存在');
    }
    if (player.hasFolded) {
      throw new Error('弃牌后不能展示手牌');
    }

    const card = player.holeCards.find((item) => item.id === cardId);
    if (!card) {
      throw new Error('只能展示自己的手牌');
    }

    if (!Array.isArray(player.revealedHoleCardIds)) {
      player.revealedHoleCardIds = [];
    }

    const settlementLockedCardIds = new Set(
      (player.selectedCards || [])
        .filter((selectedCard) => player.holeCards.some((holeCard) => holeCard.id === selectedCard.id))
        .map((selectedCard) => selectedCard.id)
    );

    const idx = player.revealedHoleCardIds.indexOf(cardId);
    if (idx >= 0) {
      if ([STAGE.SETTLING, STAGE.HAND_END].includes(hand.stage) && settlementLockedCardIds.has(cardId)) {
        throw new Error('结算使用的手牌不能收回');
      }
      player.revealedHoleCardIds.splice(idx, 1);
      return false;
    }

    player.revealedHoleCardIds.push(cardId);
    return true;
  }

  getActivePlayers() {
    if (!this.hand) return [];
    return this.hand.activeSeats
      .filter(s => !this.hand.players[s].hasFolded)
      .map(s => this.hand.players[s]);
  }

  getPlayerPublicState(seatId, requestingSessionId) {
    if (!this.hand || !this.hand.players[seatId]) return null;
    const p = this.hand.players[seatId];
    const isSelf = requestingSessionId && p.sessionId === requestingSessionId;
    const showCards = isSelf ||
      this.hand.stage === STAGE.SHOWDOWN_SELECT ||
      this.hand.stage === STAGE.SETTLING ||
      this.hand.stage === STAGE.HAND_END;

    return {
      sessionId: p.sessionId,
      seatId: p.seatId,
      nickname: p.nickname,
      holeCards: showCards ? p.holeCards.map(c => ({ id: c.id, rank: c.rank, suit: c.suit, isWild: c.isWild, wildType: c.wildType })) : p.holeCards.map(c => ({ id: c.id, hidden: true })),
      holeCardsCount: p.holeCards.length,
      selectedCards: ((isSelf || this.hand.stage !== STAGE.SHOWDOWN_SELECT) && p.selectedCards)
        ? p.selectedCards.map(c => ({ id: c.id, rank: c.rank, suit: c.suit, isWild: c.isWild, wildType: c.wildType }))
        : null,
      suggestedCards: isSelf && p.suggestedCards ? p.suggestedCards.map(c => ({ id: c.id, rank: c.rank, suit: c.suit, isWild: c.isWild, wildType: c.wildType })) : null,
      showdownSubmitted: !!p.showdownSubmitted,
      finalEvaluation: showCards ? p.finalEvaluation : null,
      currentBet: p.currentBet,
      totalBet: p.totalBet,
      score: p.score,
      hasFolded: p.hasFolded,
      isAllIn: p.isAllIn,
      isActed: p.isActed
    };
  }

  getHandPublicState(requestingSessionId) {
    if (!this.hand) return null;

    const playersPublic = {};
    let requestingSeatId = null;
    for (const seatIdStr of Object.keys(this.hand.players)) {
      const seatId = parseInt(seatIdStr);
      playersPublic[seatId] = this.getPlayerPublicState(seatId, requestingSessionId);
      const hp = this.hand.players[seatId];
      if (hp && hp.sessionId && hp.sessionId === requestingSessionId) {
        requestingSeatId = seatId;
      }
    }

    const showCommunity = !![STAGE.FLOP_BET, STAGE.TURN_BET, STAGE.RIVER_BET, STAGE.SHOWDOWN_SELECT, STAGE.SETTLING, STAGE.HAND_END].includes(this.hand.stage);

    let myHandCards = null;
    let myShowdownCards = null;
    if (requestingSeatId !== null && this.hand.players[requestingSeatId]) {
      const hp = this.hand.players[requestingSeatId];
      if (Array.isArray(hp.holeCards)) {
        myHandCards = hp.holeCards.map(c => ({ id: c.id, rank: c.rank, suit: c.suit, isWild: c.isWild, wildType: c.wildType }));
      }
      if (this.hand.stage === STAGE.SHOWDOWN_SELECT && Array.isArray(hp.holeCards) && Array.isArray(this.hand.communityCards)) {
        const allSeven = [...hp.holeCards, ...this.hand.communityCards];
        myShowdownCards = allSeven.map(c => ({ id: c.id, rank: c.rank, suit: c.suit, isWild: c.isWild, wildType: c.wildType }));
      }
    }

    return {
      handId: this.hand.handId,
      mode: this.hand.mode,
      stage: this.hand.stage,
      dealerSeat: this.hand.dealerSeat,
      smallBlindSeat: this.hand.smallBlindSeat,
      bigBlindSeat: this.hand.bigBlindSeat,
      smallBlindAmount: this.hand.smallBlindAmount,
      communityCards: showCommunity ? this.hand.communityCards.map(c => ({ id: c.id, rank: c.rank, suit: c.suit, isWild: c.isWild, wildType: c.wildType })) : [],
      communityCardsCount: this.hand.communityCards.length,
      players: playersPublic,
      activeSeats: this.hand.activeSeats.slice(),
      pot: this.hand.pot,
      sidePots: this.hand.sidePots.map(sp => ({ amount: sp.amount, eligibleSeats: sp.eligibleSeats.slice() })),
      currentBetToCall: this.hand.currentBetToCall,
      currentRaiseAmount: this.hand.currentRaiseAmount,
      currentPlayerSeat: this.hand.currentPlayerSeat,
      lastRaiserSeat: this.hand.lastRaiserSeat,
      results: this.hand.results,
      myHandCards,
      myShowdownCards
    };
  }
}

module.exports = {
  STAGE,
  ACTION_TYPE,
  GameEngine
};
