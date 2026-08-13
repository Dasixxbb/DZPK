<template>
  <div class="lobby-page">
    <div class="lobby-header">
      <div class="header-left">
        <h1 class="title">局域网德州扑克平台</h1>
      </div>
      <div class="header-right">
        <div class="player-info">
          <span class="player-nickname">{{ currentPlayer?.nickname || '游客' }}</span>
          <button class="btn btn-secondary btn-sm" @click="showNicknameModal = true">修改昵称</button>
        </div>
      </div>
    </div>

    <div class="lobby-body">
      <div class="rooms-grid">
        <div
          v-for="room in rooms"
          :key="room.roomId"
          class="room-card"
          :class="{ 'room-playing': room.status === 'playing' }"
        >
          <div class="room-card-header">
            <div class="room-number">{{ room.roomId }}</div>
            <span class="mode-tag" :class="room.mode === 'wild' ? 'mode-wild' : 'mode-classic'">
              {{ room.mode === 'wild' ? '癞子模式' : '经典模式' }}
            </span>
          </div>

          <div class="room-card-body">
            <div class="room-status">
              <span
                class="status-tag"
                :class="room.status === 'playing' ? 'status-playing' : 'status-waiting'"
              >
                {{ room.status === 'playing' ? '进行中' : '等待中' }}
              </span>
            </div>
            <div class="room-count">
              <span class="count-label">人数</span>
              <span class="count-value">{{ getOccupiedCount(room) }}/{{ getTotalSeats(room) }}</span>
            </div>
          </div>

          <div class="room-card-footer">
            <button
              class="btn btn-primary"
              :disabled="isRoomFull(room)"
              @click="enterRoom(room.roomId)"
            >
              {{ isRoomFull(room) ? '房间已满' : '进入房间' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showNicknameModal" class="modal-overlay" @click.self="showNicknameModal = false">
      <div class="modal nickname-modal">
        <div class="modal-header">
          <h3>修改昵称</h3>
          <button class="modal-close" @click="showNicknameModal = false">×</button>
        </div>
        <div class="modal-body">
          <input
            v-model="nicknameInput"
            type="text"
            class="input-field"
            :placeholder="`请输入新昵称（最多${appConfig.ui.nicknameMaxLength}字）`"
            :maxlength="appConfig.ui.nicknameMaxLength"
            @keyup.enter="confirmNickname"
          />
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showNicknameModal = false">取消</button>
          <button class="btn btn-primary" @click="confirmNickname">确认</button>
        </div>
      </div>
    </div>

    <div v-if="toastMessage" class="toast" :class="toastType">
      {{ toastMessage }}
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { getSocket } from '../utils/socket.js'
import { getClientConfig } from '../utils/config.js'

const router = useRouter()
const appConfig = getClientConfig()

const rooms = ref([])
const currentPlayer = ref(null)
const showNicknameModal = ref(false)
const nicknameInput = ref('')
const toastMessage = ref('')
const toastType = ref('info')

let refreshTimer = null

function getOccupiedCount(room) {
  if (!room) return 0
  if (typeof room.playerCount === 'number') return room.playerCount
  if (Array.isArray(room.seats)) return room.seats.filter(s => s && s.occupied).length
  return 0
}

function getTotalSeats(room) {
  return room?.totalSeats || 6
}

function isRoomFull(room) {
  return getOccupiedCount(room) >= getTotalSeats(room)
}

function showToast(msg, type = 'info') {
  toastMessage.value = msg
  toastType.value = type
  setTimeout(() => {
    toastMessage.value = ''
  }, appConfig.ui.toastDurationMs)
}

function refreshLobby() {
  const socket = getSocket()
  socket.emit('get_lobby', (data) => {
    if (data) {
      if (data.rooms) {
        rooms.value = data.rooms
      }
      if (data.player) {
        currentPlayer.value = data.player
        if (data.player.sessionId) {
          localStorage.setItem('sessionId', data.player.sessionId)
        }
      }
    }
  })
}

function enterRoom(roomId) {
  const socket = getSocket()
  socket.emit('join_room', { roomId }, (result) => {
    if (result && result.success) {
      router.push(`/room/${roomId}`)
    } else {
      showToast(result?.error || '进入房间失败', 'error')
    }
  })
}

function confirmNickname() {
  const name = nicknameInput.value.trim()
  if (!name) {
    showToast('昵称不能为空', 'error')
    return
  }
  if (name.length > appConfig.ui.nicknameMaxLength) {
    showToast(`昵称长度不能超过${appConfig.ui.nicknameMaxLength}`, 'error')
    return
  }
  const socket = getSocket()
  socket.emit('change_nickname', { nickname: name }, (result) => {
    if (result && result.success) {
      if (currentPlayer.value) {
        currentPlayer.value.nickname = result.nickname
      }
      showToast('昵称修改成功', 'success')
      showNicknameModal.value = false
    } else {
      showToast(result?.error || '修改失败', 'error')
    }
  })
}

onMounted(() => {
  const socket = getSocket()

  socket.on('lobby_state', (data) => {
    if (data) {
      if (data.rooms) {
        rooms.value = data.rooms
      }
      if (data.player) {
        currentPlayer.value = data.player
      }
    }
  })

  socket.on('error', (data) => {
    if (data && data.message) {
      showToast(data.message, 'error')
    }
  })

  refreshLobby()

  refreshTimer = setInterval(refreshLobby, appConfig.lobby.refreshIntervalMs)
})

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
  const socket = getSocket()
  socket.off('lobby_state')
  socket.off('error')
})
</script>

<style scoped>
.lobby-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #0f2027 0%, #203a43 50%, #2c5364 100%);
  color: #e8e1c8;
  padding: 0;
  margin: 0;
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.lobby-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 48px;
  background: rgba(0, 0, 0, 0.3);
  border-bottom: 2px solid #8b6914;
}

.title {
  margin: 0;
  font-size: 28px;
  font-weight: bold;
  background: linear-gradient(90deg, #ffd700, #f0c25a, #daa520);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: 2px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.player-info {
  display: flex;
  align-items: center;
  gap: 16px;
  background: rgba(0, 0, 0, 0.35);
  padding: 10px 18px;
  border-radius: 30px;
  border: 1px solid rgba(218, 165, 32, 0.3);
}

.player-nickname {
  font-size: 16px;
  font-weight: 600;
  color: #ffe7a1;
}

.lobby-body {
  padding: 40px 48px;
}

.rooms-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.room-card {
  background: linear-gradient(145deg, rgba(30, 50, 40, 0.95), rgba(18, 32, 26, 0.98));
  border: 2px solid #5a4520;
  border-radius: 14px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
  transition: transform 0.2s ease, border-color 0.2s ease;
}

.room-card:hover {
  transform: translateY(-4px);
  border-color: #daa520;
}

.room-playing {
  border-color: #8b2f2f;
}

.room-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.room-number {
  font-size: 40px;
  font-weight: bold;
  color: #ffd700;
  font-family: 'Georgia', serif;
  line-height: 1;
}

.mode-tag {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.mode-classic {
  background: linear-gradient(90deg, #b8860b, #daa520);
  color: #2c1e00;
}

.mode-wild {
  background: linear-gradient(90deg, #6f42c1, #8956e0);
  color: #fff;
}

.room-card-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}

.room-status {
  display: flex;
  align-items: center;
}

.status-tag {
  padding: 4px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
}

.status-playing {
  background: rgba(180, 40, 40, 0.25);
  color: #ff8787;
  border: 1px solid rgba(255, 90, 90, 0.4);
}

.status-waiting {
  background: rgba(40, 167, 69, 0.2);
  color: #69db7c;
  border: 1px solid rgba(80, 200, 100, 0.4);
}

.room-count {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 8px;
}

.count-label {
  font-size: 13px;
  color: #a09375;
}

.count-value {
  font-size: 16px;
  font-weight: bold;
  color: #ffe7a1;
}

.room-card-footer {
  padding-top: 8px;
  border-top: 1px solid rgba(218, 165, 32, 0.15);
}

.btn {
  display: inline-block;
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
}

.btn-sm {
  padding: 6px 14px;
  font-size: 12px;
}

.btn-primary {
  background: linear-gradient(90deg, #b8860b, #daa520, #b8860b);
  color: #2c1e00;
  box-shadow: 0 2px 6px rgba(218, 165, 32, 0.3);
  width: 100%;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(218, 165, 32, 0.5);
}

.btn-primary:disabled {
  background: #4a4a4a;
  color: #888;
  cursor: not-allowed;
  box-shadow: none;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: #e8e1c8;
  border: 1px solid rgba(218, 165, 32, 0.3);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.2);
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: linear-gradient(145deg, #2a3e33, #1a2620);
  border: 2px solid #8b6914;
  border-radius: 14px;
  min-width: 380px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6);
  overflow: hidden;
}

.nickname-modal {
  min-width: 400px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 22px;
  background: rgba(0, 0, 0, 0.3);
  border-bottom: 1px solid rgba(218, 165, 32, 0.3);
}

.modal-header h3 {
  margin: 0;
  color: #ffd700;
  font-size: 18px;
}

.modal-close {
  background: none;
  border: none;
  color: #a09375;
  font-size: 24px;
  cursor: pointer;
  line-height: 1;
  padding: 0;
}

.modal-close:hover {
  color: #fff;
}

.modal-body {
  padding: 24px 22px;
}

.input-field {
  width: 100%;
  box-sizing: border-box;
  padding: 12px 16px;
  border: 1px solid #5a4520;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.35);
  color: #e8e1c8;
  font-size: 15px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}

.input-field:focus {
  border-color: #daa520;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 22px;
  background: rgba(0, 0, 0, 0.2);
  border-top: 1px solid rgba(218, 165, 32, 0.15);
}

.modal-footer .btn {
  width: auto;
}

.toast {
  position: fixed;
  top: 32px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 28px;
  border-radius: 8px;
  font-size: 14px;
  z-index: 2000;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.5);
}

.toast.info {
  background: #2c5364;
  color: #fff;
}

.toast.success {
  background: #2f855a;
  color: #fff;
}

.toast.error {
  background: #c53030;
  color: #fff;
}
</style>
