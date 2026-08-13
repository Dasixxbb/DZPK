const logger = require('../utils/logger');
const { STAGE } = require('../game/GameEngine');
const { HAND_TYPE_NAMES } = require('../game/cards');
const config = require('../config');

const MAX_SEATS = 6;
const HEARTBEAT_TIMEOUT = config.heartbeat.timeoutMs;

class SocketHandler {
  constructor(io, playerManager, roomManager, gameEngines) {
    this.io = io;
    this.playerManager = playerManager;
    this.roomManager = roomManager;
    this.gameEngines = gameEngines;
    this.heartbeatTimers = new Map();
    this.disconnectTimers = new Map();
    this.readyTimers = new Map();

    for (const [roomId, engine] of this.gameEngines.entries()) {
      engine.onTimedStateChange = () => {
        this._handleTimedEngineStateChange(roomId);
      };
    }

    this._setupConnectionHandler();
  }

  _setupConnectionHandler() {
    this.io.on('connection', (socket) => {
      try {
        let sessionId = null;
        if (socket.handshake.auth && socket.handshake.auth.sessionId) {
          sessionId = socket.handshake.auth.sessionId;
        } else if (socket.handshake.query && socket.handshake.query.sessionId) {
          sessionId = socket.handshake.query.sessionId;
        } else {
          sessionId = this._generateSessionId();
        }

        let player;
        const existingPlayer = this.playerManager.getPlayer(sessionId);

        if (existingPlayer) {
          this._clearDisconnectTimer(sessionId);
          this.playerManager.updateSocketId(sessionId, socket.id);
          this.playerManager.setPlayerOnline(sessionId);
          player = existingPlayer;
          logger.info('Player reconnected', { sessionId, socketId: socket.id });
        } else {
          player = this.playerManager.createPlayer(sessionId, socket.id);
        }

        socket.data.sessionId = sessionId;

        if (player.roomId !== null) {
          socket.join(`room_${player.roomId}`);
        }

        this._setupHeartbeat(socket, sessionId);
        this._registerSocketEvents(socket, sessionId);
        socket.on('disconnect', () => this._handleDisconnect(socket, sessionId));

        logger.info('Socket connected', { sessionId, socketId: socket.id });
      } catch (e) {
        logger.error('Connection handler error', { error: e.message });
        socket.emit('error', { message: e.message });
      }
    });
  }

  _generateSessionId() {
    return 's_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  _setupHeartbeat(socket, sessionId) {
    this._resetHeartbeatTimer(sessionId);

    socket.on('ping', () => {
      try {
        this._resetHeartbeatTimer(sessionId);
        socket.emit('pong');
      } catch (e) {
        logger.error('Ping error', { sessionId, error: e.message });
        socket.emit('error', { message: e.message });
      }
    });

    socket.onAny(() => {
      this._resetHeartbeatTimer(sessionId);
    });
  }

  _resetHeartbeatTimer(sessionId) {
    if (this.heartbeatTimers.has(sessionId)) {
      clearTimeout(this.heartbeatTimers.get(sessionId));
    }
    const timer = setTimeout(() => {
      this._handleHeartbeatTimeout(sessionId);
    }, HEARTBEAT_TIMEOUT);
    this.heartbeatTimers.set(sessionId, timer);
  }

  _handleHeartbeatTimeout(sessionId) {
    try {
      logger.warn('Heartbeat timeout', { sessionId });
      this.heartbeatTimers.delete(sessionId);
      this._processPlayerDisconnect(sessionId, 'heartbeat_timeout');
    } catch (e) {
      logger.error('Heartbeat timeout handler error', { sessionId, error: e.message });
    }
  }

  _handleTimedEngineStateChange(roomId) {
    const engine = this.gameEngines.get(roomId);
    if (!engine) return;

    if (engine.hand && engine.hand.results) {
      this._broadcastSettlement(roomId);
      return;
    }

    this._broadcastRoomState(roomId);
    this._broadcastHandState(roomId);
  }

  _handleDisconnect(socket, sessionId) {
    try {
      if (this.heartbeatTimers.has(sessionId)) {
        clearTimeout(this.heartbeatTimers.get(sessionId));
        this.heartbeatTimers.delete(sessionId);
      }

      const player = this.playerManager.getPlayer(sessionId);
      if (player && player.socketId && player.socketId !== socket.id) {
        logger.info('Ignore stale disconnect', { sessionId, socketId: socket.id, activeSocketId: player.socketId });
        return;
      }
      this._processPlayerDisconnect(sessionId, 'socket_disconnect');

      logger.info('Socket disconnected', { sessionId, socketId: socket.id });
    } catch (e) {
      logger.error('Disconnect handler error', { sessionId, error: e.message });
    }
  }

  _clearDisconnectTimer(sessionId) {
    if (this.disconnectTimers.has(sessionId)) {
      clearTimeout(this.disconnectTimers.get(sessionId));
      this.disconnectTimers.delete(sessionId);
    }
  }

  _isReconnectWindowActive(player) {
    return !!(player && player.disconnectDeadlineAt && player.disconnectDeadlineAt > Date.now());
  }

  _processPlayerDisconnect(sessionId, reason) {
    this.playerManager.setPlayerOffline(sessionId);

    const player = this.playerManager.getPlayer(sessionId);
    if (!player || player.roomId === null) {
      return;
    }

    const roomId = player.roomId;
    const engine = this.gameEngines.get(roomId);
    const handPlayer = engine && engine.hand && engine.hand.players ? engine.hand.players[player.seatId] : null;

    if (handPlayer) {
      this._scheduleDisconnectFold(sessionId, roomId, player.seatId, reason);
      this._broadcastRoomState(roomId);
      this._broadcastHandState(roomId);
      return;
    }

    this._scheduleDisconnectFold(sessionId, roomId, player.seatId, reason);
    this.roomManager.leaveRoom(sessionId, {
      preserveScore: true,
      preserveRoomBinding: true
    });
    this._broadcastRoomState(roomId);
  }

  _scheduleDisconnectFold(sessionId, roomId, seatId, reason) {
    this._clearDisconnectTimer(sessionId);
    const timer = setTimeout(() => {
      this.disconnectTimers.delete(sessionId);
      this._handleDisconnectGraceExpired(sessionId, roomId, seatId, reason);
    }, config.timeouts.reconnectGraceMs);
    this.disconnectTimers.set(sessionId, timer);
    logger.info('Reconnect grace timer started', { sessionId, roomId, seatId, reason, ms: config.timeouts.reconnectGraceMs });
  }

  _handleDisconnectGraceExpired(sessionId, roomId, seatId, reason) {
    const player = this.playerManager.getPlayer(sessionId);
    if (!player || player.isOnline || player.roomId !== roomId) {
      return;
    }

    const engine = this.gameEngines.get(roomId);
    if (!engine || !engine.hand || !engine.hand.players || !engine.hand.players[seatId]) {
      this.roomManager.leaveRoom(sessionId);
      this._broadcastRoomState(roomId);
      return;
    }

    const prevStage = engine.hand.stage;
    engine.forceFoldPlayer(seatId);
    const newStage = engine.hand ? engine.hand.stage : null;

    logger.info('Disconnected player folded after grace timeout', { sessionId, roomId, seatId, reason });

    if (prevStage !== newStage && (newStage === STAGE.SETTLING || newStage === STAGE.HAND_END) && engine.hand && engine.hand.results) {
      this._broadcastSettlement(roomId);
      return;
    }

    this._broadcastRoomState(roomId);
    this._broadcastHandState(roomId);
  }

  _startNewHand(roomId, engine) {
    const room = this.roomManager.getRoom(roomId);
    if (!room || !engine) return;
    this._stopReadyTimer(roomId);

    room.status = 'playing';
    room.totalHands += 1;
    room.epochHandCount += 1;
    room.currentHandId = engine.handIdCounter + 1;
    engine.startNewHand();
    this._clearRoomPlannedBetAmounts(roomId);
    room.currentHandId = engine.hand ? engine.hand.handId : null;
    room.dealerSeat = engine.hand ? engine.hand.dealerSeat : 0;

    this._broadcastRoomState(roomId);
    this.io.to(`room_${roomId}`).emit('hand_started', {
      handId: engine.hand.handId,
      dealerSeat: engine.hand.dealerSeat,
      smallBlindSeat: engine.hand.smallBlindSeat,
      bigBlindSeat: engine.hand.bigBlindSeat,
      mode: engine.hand.mode
    });
    this._broadcastHandState(roomId);
  }

  _startReadyTimer(roomId) {
    const room = this.roomManager.getRoom(roomId);
    if (!room) return;

    // 房间内没有玩家，则不需要进行准备计时
    const seated = (room.seats || []).filter((s) => s !== null);
    if (seated.length === 0) return;

    this._stopReadyTimer(roomId);
    const totalMs = config.timeouts.readyMs;
    const deadlineAt = Date.now() + totalMs;
    const timer = setTimeout(() => {
      this.readyTimers.delete(roomId);
      this._handleReadyTimerExpired(roomId);
    }, totalMs);
    this.readyTimers.set(roomId, { timer, deadlineAt, totalMs });
    logger.info('Ready timer started', { roomId, ms: totalMs });
  }

  _stopReadyTimer(roomId) {
    const entry = this.readyTimers.get(roomId);
    if (entry) {
      clearTimeout(entry.timer);
      this.readyTimers.delete(roomId);
      logger.info('Ready timer stopped', { roomId });
    }
  }

  _handleReadyTimerExpired(roomId) {
    const room = this.roomManager.getRoom(roomId);
    if (!room) return;

    // 计时结束，自动帮所有玩家点击准备
    for (const sessionId of room.seats) {
      if (!sessionId) continue;
      const p = this.playerManager.getPlayer(sessionId);
      if (p && !p.isReady) {
        p.isReady = true;
      }
    }

    const engine = this.gameEngines.get(roomId);
    if (engine && engine.canStartHand()) {
      this._startNewHand(roomId, engine);
    } else {
      this._broadcastRoomState(roomId);
    }
  }

  _registerSocketEvents(socket, sessionId) {
    socket.on('get_lobby', (callback) => this._wrapSafe(socket, sessionId, callback, () => {
      const player = this.playerManager.getPlayer(sessionId);
      const result = {
        rooms: this.roomManager.getAllRooms(),
        player: player ? this._sanitizePlayer(player) : null
      };
      if (typeof callback === 'function') callback(result);
      socket.emit('lobby_state', result);
    }));

    socket.on('join_room', (data, callback) => this._wrapSafe(socket, sessionId, callback, () => {
      const { roomId, seatId } = data || {};
      if (roomId === undefined || roomId === null) {
        throw new Error('缺少roomId参数');
      }
      const room = this.roomManager.getRoom(roomId);
      if (!room) throw new Error('房间不存在');

      const assignedSeatId = this.roomManager.joinRoom(sessionId, roomId, seatId);
      socket.join(`room_${roomId}`);

      this._broadcastRoomState(roomId);

      const result = { success: true, seatId: assignedSeatId };
      if (typeof callback === 'function') callback(result);
    }));

    socket.on('leave_room', (callback) => this._wrapSafe(socket, sessionId, callback, () => {
      const player = this.playerManager.getPlayer(sessionId);
      if (!player || player.roomId === null) {
        throw new Error('玩家未在房间中');
      }
      const roomId = player.roomId;
      this._clearDisconnectTimer(sessionId);
      this.playerManager.setPlannedBetAmount(sessionId, 0);
      this.roomManager.leaveRoom(sessionId);
      socket.leave(`room_${roomId}`);
      this._broadcastRoomState(roomId);
      if (typeof callback === 'function') callback({ success: true });
    }));

    socket.on('sit_down', (data, callback) => this._wrapSafe(socket, sessionId, callback, () => {
      const { seatId } = data || {};
      if (seatId === undefined || seatId === null) {
        throw new Error('缺少seatId参数');
      }
      const player = this.playerManager.getPlayer(sessionId);
      if (!player || player.roomId === null) {
        throw new Error('玩家未加入任何房间');
      }
      this.roomManager.sitDown(sessionId, seatId);
      this._broadcastRoomState(player.roomId);
      if (typeof callback === 'function') callback({ success: true });
    }));

    socket.on('toggle_ready', (callback) => this._wrapSafe(socket, sessionId, callback, () => {
      const player = this.playerManager.getPlayer(sessionId);
      if (!player || player.roomId === null) {
        throw new Error('玩家未加入任何房间');
      }
      const roomId = player.roomId;
      const isReady = this.roomManager.toggleReady(sessionId);
      const engine = this.gameEngines.get(roomId);

      if (engine && engine.canStartHand()) {
        // 全员（或达到开局条件）已准备，停止准备计时并开始新一局
        this._startNewHand(roomId, engine);
      } else {
        this._broadcastRoomState(roomId);
      }

      if (typeof callback === 'function') callback({ success: true, isReady });
    }));

    socket.on('change_mode', (data, callback) => this._wrapSafe(socket, sessionId, callback, () => {
      const { mode } = data || {};
      const player = this.playerManager.getPlayer(sessionId);
      if (!player || player.roomId === null) {
        throw new Error('玩家未加入任何房间');
      }
      this.roomManager.changeMode(player.roomId, mode);
      this._broadcastRoomState(player.roomId);
      if (typeof callback === 'function') callback({ success: true });
    }));

    socket.on('change_nickname', (data, callback) => this._wrapSafe(socket, sessionId, callback, () => {
      const { nickname } = data || {};
      if (!nickname || typeof nickname !== 'string' || nickname.trim().length === 0) {
        throw new Error('昵称不能为空');
      }
      if (nickname.length > config.player.maxNicknameLength) {
        throw new Error(`昵称长度不能超过${config.player.maxNicknameLength}`);
      }
      this.playerManager.changeNickname(sessionId, nickname.trim());

      const player = this.playerManager.getPlayer(sessionId);
      if (player && player.roomId !== null) {
        this.io.to(`room_${player.roomId}`).emit('player_updated', {
          sessionId,
          nickname: player.nickname
        });
        this._broadcastRoomState(player.roomId);
        this._broadcastHandState(player.roomId);
      }

      if (typeof callback === 'function') callback({ success: true, nickname: player.nickname });
    }));

    socket.on('declare_small_blind', (data, callback) => this._wrapSafe(socket, sessionId, callback, () => {
      const { amount } = data || {};
      const player = this.playerManager.getPlayer(sessionId);
      if (!player || player.roomId === null) {
        throw new Error('玩家未加入任何房间');
      }
      const engine = this.gameEngines.get(player.roomId);
      if (!engine) throw new Error('房间引擎不存在');

      engine.declareSmallBlind(player.seatId, amount);
      this._broadcastHandState(player.roomId);

      if (typeof callback === 'function') {
        callback({ success: true, newHandState: this._buildHandStateForPlayer(player.roomId, sessionId) });
      }
    }));

    socket.on('update_bet_preview', (data, callback) => this._wrapSafe(socket, sessionId, callback, () => {
      const player = this.playerManager.getPlayer(sessionId);
      if (!player || player.roomId === null) {
        throw new Error('玩家未加入任何房间');
      }
      const engine = this.gameEngines.get(player.roomId);
      if (!engine || !engine.hand) {
        throw new Error('当前没有进行中的牌局');
      }

      const amount = Math.max(0, Math.floor(Number(data?.amount) || 0));
      this.playerManager.setPlannedBetAmount(sessionId, amount);
      this._broadcastHandState(player.roomId);

      if (typeof callback === 'function') {
        callback({ success: true });
      }
    }));

    socket.on('player_action', (data, callback) => this._wrapSafe(socket, sessionId, callback, () => {
      const { actionType, amount } = data || {};
      const validActions = ['fold', 'check', 'call', 'raise', 'all_in'];
      if (!actionType || !validActions.includes(actionType)) {
        throw new Error('无效的actionType');
      }

      const player = this.playerManager.getPlayer(sessionId);
      if (!player || player.roomId === null) {
        throw new Error('玩家未加入任何房间');
      }
      const engine = this.gameEngines.get(player.roomId);
      if (!engine) throw new Error('房间引擎不存在');

      const prevStage = engine.hand ? engine.hand.stage : null;
      this.playerManager.setPlannedBetAmount(sessionId, 0);
      engine.doPlayerAction(player.seatId, actionType, amount);
      const newStage = engine.hand ? engine.hand.stage : null;

      this._broadcastHandState(player.roomId);

      if (prevStage !== newStage && (newStage === STAGE.SETTLING || newStage === STAGE.HAND_END) && engine.hand && engine.hand.results) {
        this._broadcastSettlement(player.roomId);
      }

      if (typeof callback === 'function') {
        callback({
          success: true,
          newHandState: this._buildHandStateForPlayer(player.roomId, sessionId)
        });
      }
    }));

    socket.on('toggle_hole_card_reveal', (data, callback) => this._wrapSafe(socket, sessionId, callback, () => {
      const { cardId } = data || {};
      if (!cardId) {
        throw new Error('缺少cardId参数');
      }

      const player = this.playerManager.getPlayer(sessionId);
      if (!player || player.roomId === null) {
        throw new Error('玩家未加入任何房间');
      }
      const engine = this.gameEngines.get(player.roomId);
      if (!engine) {
        throw new Error('房间引擎不存在');
      }

      const revealed = engine.toggleHoleCardReveal(player.seatId, cardId);
      this._broadcastHandState(player.roomId);

      if (typeof callback === 'function') {
        callback({ success: true, revealed });
      }
    }));

    socket.on('update_showdown_selection', (data, callback) => this._wrapSafe(socket, sessionId, callback, () => {
      const { cardIds } = data || {};
      const player = this.playerManager.getPlayer(sessionId);
      if (!player || player.roomId === null) {
        throw new Error('玩家未加入任何房间');
      }
      const engine = this.gameEngines.get(player.roomId);
      if (!engine) throw new Error('房间引擎不存在');

      engine.updateSelectedCards(player.seatId, cardIds);
      this._broadcastHandState(player.roomId);

      if (typeof callback === 'function') {
        callback({ success: true });
      }
    }));

    socket.on('submit_selected_cards', (data, callback) => this._wrapSafe(socket, sessionId, callback, () => {
      const { cardIds } = data || {};
      const player = this.playerManager.getPlayer(sessionId);
      if (!player || player.roomId === null) {
        throw new Error('玩家未加入任何房间');
      }
      const engine = this.gameEngines.get(player.roomId);
      if (!engine) throw new Error('房间引擎不存在');

      engine.submitSelectedCards(player.seatId, cardIds);

      const hand = engine.hand;
      if (hand && hand.stage === STAGE.SHOWDOWN_SELECT) {
        const alive = hand.activeSeats.filter(s => !hand.players[s].hasFolded);
        const allSubmitted = alive.every(s => hand.players[s].showdownSubmitted === true);
        if (allSubmitted) {
          engine.settleShowdown();
          this._broadcastSettlement(player.roomId);
        } else {
          this._broadcastHandState(player.roomId);
        }
      }

      if (typeof callback === 'function') {
        callback({ success: true });
      }
    }));

    socket.on('get_room_state', (callback) => this._wrapSafe(socket, sessionId, callback, () => {
      const player = this.playerManager.getPlayer(sessionId);
      if (!player || player.roomId === null) {
        throw new Error('玩家未加入任何房间');
      }
      const roomState = this._buildRoomStateForPlayer(player.roomId, sessionId);
      const handState = this._buildHandStateForPlayer(player.roomId, sessionId);
      if (typeof callback === 'function') {
        callback({ room: roomState, hand: handState });
      }
      socket.emit('room_state', roomState);
      if (handState) {
        socket.emit('hand_state', handState);
      }
    }));
  }

  _wrapSafe(socket, sessionId, callback, fn) {
    try {
      fn();
    } catch (e) {
      logger.error('Socket event error', { sessionId, error: e.message, stack: e.stack });
      socket.emit('error', { message: e.message });
      if (typeof callback === 'function') {
        callback({ success: false, error: e.message });
      }
    }
  }

  _sanitizePlayer(player) {
    return {
      sessionId: player.sessionId,
      nickname: player.nickname,
      score: player.score,
      roomId: player.roomId,
      seatId: player.seatId,
      isReady: player.isReady,
      isOnline: player.isOnline,
      isInHand: player.isInHand
    };
  }

  _clearRoomPlannedBetAmounts(roomId) {
    const room = this.roomManager.getRoom(roomId);
    if (!room || !Array.isArray(room.seats)) return;
    for (const sessionId of room.seats) {
      if (sessionId) {
        this.playerManager.setPlannedBetAmount(sessionId, 0);
      }
    }
  }

  _broadcastRoomState(roomId) {
    const room = this.roomManager.getRoom(roomId);
    if (!room) return;

    // 房间内没有玩家时无需进行准备计时
    if ((room.seats || []).every((s) => s === null)) {
      this._stopReadyTimer(roomId);
    }

    for (let seatId = 0; seatId < MAX_SEATS; seatId++) {
      const sessionId = room.seats[seatId];
      if (sessionId) {
        const player = this.playerManager.getPlayer(sessionId);
        if (player && player.socketId) {
          const state = this._buildRoomStateForPlayer(roomId, sessionId);
          this.io.to(player.socketId).emit('room_state', state);
        }
      }
    }
  }

  _buildRoomStateForPlayer(roomId, requestingSessionId) {
    const room = this.roomManager.getRoom(roomId);
    if (!room) return null;

    const engine = this.gameEngines.get(roomId);
    const hand = engine ? engine.hand : null;

    const mySeatId = (() => {
      for (let i = 0; i < MAX_SEATS; i++) {
        if (room.seats[i] === requestingSessionId) return i;
      }
      return null;
    })();

    const seats = [];
    for (let seatId = 0; seatId < MAX_SEATS; seatId++) {
      const sessionId = room.seats[seatId];
      const player = sessionId ? this.playerManager.getPlayer(sessionId) : null;

      let isDealer = false;
      let isSB = false;
      let isBB = false;
      if (hand) {
        isDealer = hand.dealerSeat === seatId;
        isSB = hand.smallBlindSeat === seatId;
        isBB = hand.bigBlindSeat === seatId;
      }

      seats.push({
        seatId,
        occupied: !!player,
        sessionId: player ? player.sessionId : null,
        nickname: player ? player.nickname : null,
        score: player ? player.score : null,
        isReady: player ? player.isReady : false,
        isOnline: player ? player.isOnline : false,
        isInHand: player ? player.isInHand : false,
        isDealer,
        isSB,
        isBB
      });
    }

    const requestingPlayer = this.playerManager.getPlayer(requestingSessionId);
    const readyTimer = this.readyTimers.get(roomId);

    return {
      roomId: room.roomId,
      mode: room.mode,
      status: room.status,
      totalHands: room.totalHands,
      mySeatId,
      seats,
      // 准备计时截止时间（绝对时间戳，客户端据此共享倒计时）
      readyDeadlineAt: readyTimer ? readyTimer.deadlineAt : null,
      readyDeadlineTotalMs: readyTimer ? readyTimer.totalMs : null,
      // 自己的重连宽限期截止时间（断线后由服务端写入，重连时自动清除）
      reconnectDeadlineAt: requestingPlayer ? requestingPlayer.disconnectDeadlineAt : null
    };
  }

  _broadcastHandState(roomId) {
    const room = this.roomManager.getRoom(roomId);
    if (!room) return;

    for (let seatId = 0; seatId < MAX_SEATS; seatId++) {
      const sessionId = room.seats[seatId];
      if (sessionId) {
        const player = this.playerManager.getPlayer(sessionId);
        if (player && player.socketId) {
          const state = this._buildHandStateForPlayer(roomId, sessionId);
          if (state) {
            this.io.to(player.socketId).emit('hand_state', state);
          }
        }
      }
    }
  }

  _serializeVisibleCard(card, extra = {}) {
    return {
      id: card.id,
      rank: card.rank,
      suit: card.suit,
      isWild: card.isWild,
      wildType: card.wildType,
      ...extra
    };
  }

  _buildHoleCardsForViewer(hand, hp, isSelf) {
    const revealedIds = new Set(hp.revealedHoleCardIds || []);
    const selectedHoleCardIds = new Set(
      (hp.selectedCards || [])
        .filter((card) => hp.holeCards.some((holeCard) => holeCard.id === card.id))
        .map((card) => card.id)
    );

    if (isSelf) {
      return hp.holeCards.map((card) => this._serializeVisibleCard(card, {
        publiclyRevealed: revealedIds.has(card.id)
      }));
    }

    if (hp.hasFolded) {
      return hp.holeCards.map(() => ({ hidden: true }));
    }

    if ([STAGE.SETTLING, STAGE.HAND_END].includes(hand.stage)) {
      return hp.holeCards.map((card) => (
        (selectedHoleCardIds.has(card.id) || revealedIds.has(card.id))
          ? this._serializeVisibleCard(card, { publiclyRevealed: revealedIds.has(card.id) })
          : { hidden: true }
      ));
    }

    return hp.holeCards.map((card) => (
      revealedIds.has(card.id)
        ? this._serializeVisibleCard(card, { publiclyRevealed: true })
        : { hidden: true }
    ));
  }

  _buildHandStateForPlayer(roomId, requestingSessionId) {
    const engine = this.gameEngines.get(roomId);
    if (!engine) return null;

    const hand = engine.hand || engine.lastHand;
    if (!hand) return null;

    const room = this.roomManager.getRoom(roomId);

    const requestingSeatId = (() => {
      for (let i = 0; i < MAX_SEATS; i++) {
        if (room && room.seats[i] === requestingSessionId) return i;
      }
      return null;
    })();

    // 结算后（engine.hand 为空）：仅向参与该局的玩家提供快照，避免向新加入玩家泄漏上一局牌面
    if (!engine.hand && (requestingSeatId === null || !hand.players[requestingSeatId])) {
      return null;
    }

    const showCardsForEveryone = [
      STAGE.SETTLING,
      STAGE.HAND_END
    ].includes(hand.stage);

    const players = {};
    for (const seatIdStr of Object.keys(hand.players)) {
      const seatId = parseInt(seatIdStr);
      const hp = hand.players[seatId];
      const isSelf = requestingSeatId === seatId;
      const showCards = isSelf || showCardsForEveryone;

      const holeCards = this._buildHoleCardsForViewer(hand, hp, isSelf);

      let selectedCards = null;
      if (showCards && hp.selectedCards) {
        selectedCards = hp.selectedCards.map(c => ({ id: c.id, rank: c.rank, suit: c.suit, isWild: c.isWild, wildType: c.wildType }));
      }

      let suggestedCards = null;
      let suggestedTypeName = null;
      if (isSelf && hp.suggestedCards) {
        suggestedCards = hp.suggestedCards.map(c => ({ id: c.id, rank: c.rank, suit: c.suit, isWild: c.isWild, wildType: c.wildType }));
      }
      if (isSelf && hp.suggestedEvaluation && hp.suggestedEvaluation.type !== undefined && hp.suggestedEvaluation.type !== null) {
        suggestedTypeName = HAND_TYPE_NAMES[hp.suggestedEvaluation.type] || null;
      }

      let finalHand = null;
      if (showCardsForEveryone && hp.finalEvaluation) {
        finalHand = {
          typeName: HAND_TYPE_NAMES[hp.finalEvaluation.type] || null,
          usedWildCount: hp.finalEvaluation.usedWildCount || 0,
          wildMappings: hp.finalEvaluation.wildMappings || [],
          effectiveCards: hp.finalEvaluation.effectiveCards
            ? hp.finalEvaluation.effectiveCards.map(c => ({ id: c.id, rank: c.rank, suit: c.suit, isWild: c.isWild, wildType: c.wildType }))
            : null
        };
      }

      players[seatId] = {
        seatId,
        nickname: hp.nickname,
        score: hp.score,
        plannedBetAmount: this.playerManager.getPlayer(room.seats[seatId])?.plannedBetAmount || 0,
        holeCards,
        hasFolded: hp.hasFolded,
        isAllIn: hp.isAllIn,
        currentBet: hp.currentBet,
        totalBet: hp.totalBet,
        suggestedCards,
        suggestedTypeName,
        showdownSubmitted: !!hp.showdownSubmitted,
        selectedCards,
        finalHand
      };
    }

    let myHandCards = null;
    let myShowdownCards = null;
    if (requestingSeatId !== null && hand.players[requestingSeatId]) {
      const hp = hand.players[requestingSeatId];
      myHandCards = hp.holeCards.map(c => ({ id: c.id, rank: c.rank, suit: c.suit, isWild: c.isWild, wildType: c.wildType }));

      if (hand.stage === STAGE.SHOWDOWN_SELECT) {
        const allSeven = [...hp.holeCards, ...hand.communityCards];
        myShowdownCards = allSeven.map(c => ({ id: c.id, rank: c.rank, suit: c.suit, isWild: c.isWild, wildType: c.wildType }));
      }
    }

    const showCommunity = [
      STAGE.FLOP_BET,
      STAGE.TURN_BET,
      STAGE.RIVER_BET,
      STAGE.SHOWDOWN_SELECT,
      STAGE.SETTLING,
      STAGE.HAND_END
    ].includes(hand.stage);

    return {
      handId: hand.handId,
      stage: hand.stage,
      mode: hand.mode,
      dealerSeat: hand.dealerSeat,
      smallBlindSeat: hand.smallBlindSeat,
      bigBlindSeat: hand.bigBlindSeat,
      smallBlindAmount: hand.smallBlindAmount,
      communityCards: showCommunity
        ? hand.communityCards.map(c => ({ id: c.id, rank: c.rank, suit: c.suit, isWild: c.isWild, wildType: c.wildType }))
        : [],
      pot: hand.pot,
      sidePots: hand.sidePots.map(sp => ({ amount: sp.amount, eligibleSeats: sp.eligibleSeats.slice() })),
      currentBetToCall: hand.currentBetToCall,
      currentPlayerSeat: hand.currentPlayerSeat,
      // 阶段计时的绝对截止时间（操作/摊牌共享倒计时，断线重连后按已流逝时间续算）
      deadlineAt: hand.stageDeadlineAt || null,
      deadlineTotalMs: hand.stageDeadlineTotalMs || null,
      players,
      myHandCards,
      myShowdownCards
    };
  }

  _broadcastSettlement(roomId) {
    const engine = this.gameEngines.get(roomId);
    if (!engine || !engine.hand || !engine.hand.results) return;
    this._clearRoomPlannedBetAmounts(roomId);

    const hand = engine.hand;
    const results = hand.results;

    const winners = [];
    for (const potResult of results.pots) {
      for (const w of potResult.winners) {
        winners.push({
          seatId: w.seatId,
          nickname: w.nickname,
          amount: w.amount,
          handTypeName: w.handType,
          usedWildCount: w.evaluation ? (w.evaluation.usedWildCount || 0) : 0,
          effectiveCards: w.selectedCards
            ? w.selectedCards.map(c => ({ id: c.id, rank: c.rank, suit: c.suit, isWild: c.isWild, wildType: c.wildType }))
            : null,
          wildMappings: w.wildMappings || []
        });
      }
    }

    const settlement = {
      handId: hand.handId,
      pot: results.totalPot,
      sidePots: hand.sidePots.map(sp => ({ amount: sp.amount, eligibleSeats: sp.eligibleSeats.slice() })),
      winners,
      playerDeltas: results.playerDelta,
      byFold: !!results.byFold
    };

    this._broadcastHandState(roomId);
    this.io.to(`room_${roomId}`).emit('settlement', settlement);

    try {
      engine.endHandAndPrepareNext();
    } catch (e) {
      logger.error('endHandAndPrepareNext error', { roomId, error: e.message });
    }

    const room = this.roomManager.getRoom(roomId);
    if (room) {
      room.status = 'waiting';
      for (const seatIdStr of Object.keys(room.players)) {
        const seatId = parseInt(seatIdStr);
        const rp = room.players[seatId];
        if (rp && rp.score <= 0) {
          rp.isReady = false;
        }
      }

      const disconnectedSessions = Object.keys(room.players)
        .map((seatIdStr) => room.players[parseInt(seatIdStr)])
        .filter((rp) => rp && !rp.isOnline && rp.shouldLeaveRoomOnDisconnect)
        .map((rp) => rp.sessionId);

      for (const sessionId of disconnectedSessions) {
        const disconnectedPlayer = this.playerManager.getPlayer(sessionId);
        const preserveReconnectState = this._isReconnectWindowActive(disconnectedPlayer);
        this.roomManager.leaveRoom(sessionId, preserveReconnectState
          ? { preserveScore: true, preserveRoomBinding: true }
          : undefined);
      }
    }

    let nextDealerSeat = 0;
    if (room && typeof room.dealerSeat === 'number') {
      nextDealerSeat = room.dealerSeat;
    } else if (engine.hand && typeof engine.hand.dealerSeat === 'number') {
      nextDealerSeat = engine.hand.dealerSeat;
    }

    this.io.to(`room_${roomId}`).emit('hand_ended', {
      handId: hand.handId,
      nextDealerSeat
    });

    // 房间内第一局结束后才需要准备计时（上一局结束、下一局开始前）
    if (room && room.epochHandCount >= 1) {
      this._startReadyTimer(roomId);
    }

    this._broadcastRoomState(roomId);
    this._broadcastHandState(roomId);
  }
}

module.exports = SocketHandler;
