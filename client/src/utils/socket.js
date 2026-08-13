import { io } from 'socket.io-client'
import { getClientConfig } from './config.js'

let socketInstance = null
let heartbeatTimer = null

export function getSocket() {
  if (socketInstance) {
    return socketInstance
  }

  const appConfig = getClientConfig()
  const url = (typeof window !== 'undefined' && window.__WS_URL__) || appConfig.ws.url

  socketInstance = io(url, {
    auth: (cb) => {
      const sessionId = typeof localStorage !== 'undefined' ? localStorage.getItem('sessionId') : null
      cb({ sessionId })
    },
    reconnection: true,
    reconnectionDelay: appConfig.socket.reconnectionDelayMs,
    reconnectionDelayMax: appConfig.socket.reconnectionDelayMaxMs,
    reconnectionAttempts: Infinity
  })

  socketInstance.on('connect', () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
    }
    heartbeatTimer = setInterval(() => {
      if (socketInstance && socketInstance.connected) {
        socketInstance.emit('ping')
      }
    }, appConfig.socket.heartbeatIntervalMs)
  })

  socketInstance.on('lobby_state', (data) => {
    if (data && data.player && data.player.sessionId) {
      localStorage.setItem('sessionId', data.player.sessionId)
    }
  })

  socketInstance.on('disconnect', () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  })

  return socketInstance
}
