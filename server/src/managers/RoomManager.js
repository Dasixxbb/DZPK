const logger = require('../utils/logger');
const config = require('../config');

const MAX_SEATS = 6;
const TOTAL_ROOMS = config.rooms.totalRooms;

class RoomManager {
  constructor(playerManager) {
    this.playerManager = playerManager;
    this.rooms = new Map();

    for (let i = 1; i <= TOTAL_ROOMS; i++) {
      const mode = i <= 5 ? 'classic' : 'wild';
      const room = {
        roomId: i,
        mode,
        status: 'waiting',
        seats: new Array(MAX_SEATS).fill(null),
        players: {},
        waitingPlayers: [],
        currentHandId: null,
        dealerSeat: 0,
        totalHands: 0,
        // 当前“人数周期”内已开始的对局数：房间清空时归零，用于判断是否为房间内第一局
        epochHandCount: 0
      };
      this.rooms.set(i, room);
      logger.debug('Room initialized', { roomId: i, mode });
    }

    logger.info('RoomManager initialized', { totalRooms: TOTAL_ROOMS });
  }

  getRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      logger.warn('Room not found', { roomId });
      return null;
    }
    return room;
  }

  getAllRooms() {
    return Array.from(this.rooms.values()).map((room) => ({
      roomId: room.roomId,
      mode: room.mode,
      status: room.status,
      playerCount: room.seats.filter((s) => s !== null).length,
      totalSeats: MAX_SEATS
    }));
  }

  isRoomFull(room) {
    return room.seats.every((seat) => seat !== null);
  }

  findEmptySeat(room) {
    for (let i = 0; i < MAX_SEATS; i++) {
      if (room.seats[i] === null) return i;
    }
    return -1;
  }

  joinRoom(sessionId, roomId, seatId) {
    const player = this.playerManager.getPlayer(sessionId);
    if (!player) {
      throw new Error('玩家不存在');
    }

    const room = this.getRoom(roomId);
    if (!room) {
      throw new Error('房间不存在');
    }

    if (player.roomId !== null && player.roomId !== roomId) {
      throw new Error('玩家已在其他房间');
    }

    if (player.roomId === roomId) {
      let existingSeatId = room.seats.findIndex((sid) => sid === sessionId);

      if (existingSeatId === -1 && player.seatId !== null && player.seatId !== undefined) {
        const preferredSeatId = player.seatId;
        if (preferredSeatId >= 0 && preferredSeatId < MAX_SEATS && room.seats[preferredSeatId] === null) {
          existingSeatId = preferredSeatId;
        }
      }

      if (existingSeatId === -1) {
        existingSeatId = this.findEmptySeat(room);
        if (existingSeatId === -1) {
          throw new Error('房间已满');
        }
      }

      room.seats[existingSeatId] = sessionId;
      room.players[existingSeatId] = player;
      player.seatId = existingSeatId;
      player.roomId = roomId;
      return existingSeatId;
    }

    if (this.isRoomFull(room)) {
      throw new Error('房间已满');
    }

    let targetSeat = seatId;
    if (targetSeat === undefined || targetSeat === null) {
      targetSeat = this.findEmptySeat(room);
      if (targetSeat === -1) {
        throw new Error('房间已满');
      }
    } else {
      if (targetSeat < 0 || targetSeat >= MAX_SEATS) {
        throw new Error('无效的座位号');
      }
      if (room.seats[targetSeat] !== null) {
        throw new Error('该座位已被占用');
      }
    }

    if (room.status === 'playing') {
      room.waitingPlayers.push(sessionId);
    }

    room.seats[targetSeat] = sessionId;
    room.players[targetSeat] = player;
    player.score = config.player.defaultScore;
    player.roomId = roomId;
    player.seatId = targetSeat;
    player.isReady = false;

    logger.info('Player joined room', {
      sessionId,
      roomId,
      seatId: targetSeat
    });

    return targetSeat;
  }

  leaveRoom(sessionId, options = {}) {
    const {
      preserveScore = false,
      preserveRoomBinding = false
    } = options;
    const player = this.playerManager.getPlayer(sessionId);
    if (!player) {
      throw new Error('玩家不存在');
    }

    const roomId = player.roomId;
    if (roomId === null) {
      logger.warn('Player not in room', { sessionId });
      return false;
    }

    const room = this.getRoom(roomId);
    if (!room) {
      if (!preserveRoomBinding) {
        player.roomId = null;
      }
      player.seatId = null;
      player.isReady = false;
      return false;
    }

    const seatId = player.seatId;
    if (seatId !== null && seatId >= 0 && seatId < MAX_SEATS) {
      room.seats[seatId] = null;
      delete room.players[seatId];
    }

    const waitIdx = room.waitingPlayers.indexOf(sessionId);
    if (waitIdx !== -1) {
      room.waitingPlayers.splice(waitIdx, 1);
    }

    // 房间清空视为一个“人数周期”结束，下次从 0 变多人开始的第一局视为房间内第一局
    if (room.seats.every((s) => s === null)) {
      room.epochHandCount = 0;
    }

    if (!preserveRoomBinding) {
      player.roomId = null;
    }
    player.seatId = null;
    player.isReady = false;
    player.isInHand = false;
    if (!preserveScore) {
      player.score = config.player.defaultScore;
    }

    logger.info('Player left room', { sessionId, roomId, seatId });
    return true;
  }

  sitDown(sessionId, seatId) {
    const player = this.playerManager.getPlayer(sessionId);
    if (!player) {
      throw new Error('玩家不存在');
    }

    const roomId = player.roomId;
    if (roomId === null) {
      throw new Error('玩家未加入任何房间');
    }

    const room = this.getRoom(roomId);
    if (!room) {
      throw new Error('房间不存在');
    }

    if (seatId < 0 || seatId >= MAX_SEATS) {
      throw new Error('无效的座位号');
    }

    const oldSeatId = player.seatId;
    if (room.seats[seatId] !== null && room.seats[seatId] !== sessionId) {
      throw new Error('该座位已被占用');
    }

    if (oldSeatId !== null && oldSeatId >= 0 && oldSeatId < MAX_SEATS && oldSeatId !== seatId) {
      room.seats[oldSeatId] = null;
      delete room.players[oldSeatId];
    }

    room.seats[seatId] = sessionId;
    room.players[seatId] = player;
    player.seatId = seatId;
    player.isReady = false;

    logger.info('Player sat down', {
      sessionId,
      roomId,
      fromSeat: oldSeatId,
      toSeat: seatId
    });

    return true;
  }

  toggleReady(sessionId) {
    const player = this.playerManager.getPlayer(sessionId);
    if (!player) {
      throw new Error('玩家不存在');
    }

    const roomId = player.roomId;
    if (roomId === null) {
      throw new Error('玩家未加入任何房间');
    }

    const room = this.getRoom(roomId);
    if (!room) {
      throw new Error('房间不存在');
    }

    if (room.status !== 'waiting') {
      throw new Error('只能在等待状态切换准备');
    }

    player.isReady = !player.isReady;
    logger.info('Player ready toggled', {
      sessionId,
      roomId,
      isReady: player.isReady
    });

    return player.isReady;
  }

  changeMode(roomId, mode) {
    const room = this.getRoom(roomId);
    if (!room) {
      throw new Error('房间不存在');
    }

    if (mode !== 'classic' && mode !== 'wild') {
      throw new Error('无效的模式');
    }

    if (room.status !== 'waiting') {
      throw new Error('只能在等待状态切换模式');
    }

    const oldMode = room.mode;
    room.mode = mode;

    logger.info('Room mode changed', { roomId, oldMode, newMode: mode });
    return true;
  }
}

module.exports = RoomManager;
