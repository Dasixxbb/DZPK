const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const logger = require('./utils/logger');
const config = require('./config');
const PlayerManager = require('./managers/PlayerManager');
const RoomManager = require('./managers/RoomManager');
const { GameEngine } = require('./game/GameEngine');
const SocketHandler = require('./sockets/SocketHandler');

function bootstrap() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  const server = http.createServer(app);

  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  const playerManager = new PlayerManager();
  const roomManager = new RoomManager(playerManager);

  const gameEngines = new Map();
  for (let roomId = 1; roomId <= config.rooms.totalRooms; roomId++) {
    const room = roomManager.getRoom(roomId);
    if (!room.players) {
      room.players = {};
    }
    const engine = new GameEngine(room);
    gameEngines.set(roomId, engine);
    logger.debug('GameEngine created', { roomId });
  }

  new SocketHandler(io, playerManager, roomManager, gameEngines);

  const PORT = process.env.PORT || config.server.port;
  server.listen(PORT, () => {
    logger.info(`Server started on port ${PORT}`);
  });

  return { app, server, io, playerManager, roomManager, gameEngines };
}

if (require.main === module) {
  bootstrap();
}

module.exports = { bootstrap };
