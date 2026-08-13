const logger = require('../utils/logger');
const config = require('../config');

const ADJECTIVES = [
  '快乐的', '勇敢的', '聪明的', '可爱的', '善良的',
  '神秘的', '活泼的', '温柔的', '帅气的', '优雅的',
  '调皮的', '机智的', '冷静的', '热情的', '沉稳的',
  '机灵的', '勤劳的', '乐观的', '潇洒的', '憨厚的'
];

const ANIMALS = [
  '小猫', '狮子', '老虎', '熊猫', '兔子',
  '狐狸', '松鼠', '海豚', '雄鹰', '骏马',
  '孔雀', '锦鲤', '麋鹿', '考拉', '企鹅',
  '羊驼', '浣熊', '刺猬', '树懒', '水獭'
];

function generateNickname() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${adj}${animal}`;
}

class PlayerManager {
  constructor() {
    this.players = new Map();
  }

  createPlayer(sessionId, socketId) {
    if (this.players.has(sessionId)) {
      logger.warn('Player already exists', { sessionId });
      return this.players.get(sessionId);
    }

    const player = {
      sessionId,
      socketId,
      nickname: generateNickname(),
      score: config.player.defaultScore,
      plannedBetAmount: 0,
      roomId: null,
      seatId: null,
      isReady: false,
      isOnline: true,
      isInHand: false,
      shouldLeaveRoomOnDisconnect: false,
      disconnectDeadlineAt: null,
      createdAt: Date.now()
    };

    this.players.set(sessionId, player);
    logger.info('Player created', { sessionId, nickname: player.nickname });
    return player;
  }

  getPlayer(sessionId) {
    const player = this.players.get(sessionId);
    if (!player) {
      logger.warn('Player not found', { sessionId });
      return null;
    }
    return player;
  }

  removePlayer(sessionId) {
    if (!this.players.has(sessionId)) {
      logger.warn('Remove failed: player not found', { sessionId });
      return false;
    }
    this.players.delete(sessionId);
    logger.info('Player removed', { sessionId });
    return true;
  }

  updateSocketId(sessionId, socketId) {
    const player = this.getPlayer(sessionId);
    if (!player) return false;
    player.socketId = socketId;
    logger.debug('Socket updated', { sessionId, socketId });
    return true;
  }

  setPlayerOffline(sessionId) {
    const player = this.getPlayer(sessionId);
    if (!player) return false;
    player.isOnline = false;
    player.shouldLeaveRoomOnDisconnect = true;
    player.disconnectDeadlineAt = Date.now() + config.timeouts.reconnectGraceMs;
    logger.info('Player offline', { sessionId });
    return true;
  }

  setPlayerOnline(sessionId) {
    const player = this.getPlayer(sessionId);
    if (!player) return false;
    player.isOnline = true;
    player.shouldLeaveRoomOnDisconnect = false;
    player.disconnectDeadlineAt = null;
    logger.info('Player online', { sessionId });
    return true;
  }

  modifyScore(sessionId, delta) {
    const player = this.getPlayer(sessionId);
    if (!player) return null;
    const oldScore = player.score;
    player.score = Math.max(0, player.score + delta);
    logger.info('Score modified', {
      sessionId,
      delta,
      oldScore,
      newScore: player.score
    });
    return player.score;
  }

  changeNickname(sessionId, newName) {
    const player = this.getPlayer(sessionId);
    if (!player) return false;
    const oldName = player.nickname;
    player.nickname = newName;
    logger.info('Nickname changed', { sessionId, oldName, newName });
    return true;
  }

  setPlannedBetAmount(sessionId, amount) {
    const player = this.getPlayer(sessionId);
    if (!player) return false;
    player.plannedBetAmount = Math.max(0, Math.floor(Number(amount) || 0));
    return true;
  }
}

module.exports = PlayerManager;
