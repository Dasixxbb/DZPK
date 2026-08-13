<template>
  <div class="room-page">
    <div class="room-header">
      <div class="header-left">
        <button class="btn-back" @click="goBackToLobby">← 返回大厅</button>
        <span class="room-id-label">房间 #{{ roomState?.roomId ?? roomId }}</span>
        <span v-if="roomState" class="mode-tag" :class="roomState.mode === 'wild' ? 'mode-wild' : 'mode-classic'">
          {{ roomState.mode === 'wild' ? '癞子模式' : '经典模式' }}
        </span>
        <span v-if="currentStageName" class="stage-tag">{{ currentStageName }}</span>
      </div>
      <div class="header-right">
        <span class="player-nickname">{{ me?.nickname || '游客' }}</span>
        <span class="player-score">积分: {{ formatScore(liveMeScore) }}</span>
      </div>
    </div>

    <div class="room-body">
      <div class="table-container">
        <div class="poker-table">
          <div class="table-felt">

            <div class="table-center">
              <div class="pot-head">
                <div class="pot-main">
                  <span class="pot-label">底池</span>
                  <span class="pot-value">{{ formatScore(displayPotValue) }}</span>
                </div>
                <div v-if="currentStageName" class="stage-display">{{ currentStageName }}</div>
              </div>

              <div class="community-cards-area">
                <div class="community-cards">
                  <template v-for="i in 5" :key="i">
                    <div class="community-card-slot">
                      <div
                        class="community-card-flip"
                        :class="{ 'is-revealed': communityRevealStates[i - 1] && !!communityCardsForDisplay[i - 1] }"
                      >
                        <div class="community-card-flip-inner">
                          <div class="community-card-face community-card-back">
                            <PlayingCard hidden />
                          </div>
                          <div class="community-card-face community-card-front">
                            <PlayingCard :card="communityCardsForDisplay[i - 1]" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </template>
                </div>
              </div>

              <div :ref="setPotAnchorRef" class="pot-chip-zone">
                <ChipStacks :score="displayPotScore" variant="pot" />
              </div>

              <div v-if="handState && handState.sidePots && handState.sidePots.length > 0" class="side-pots">
                <div v-for="(sp, idx) in handState.sidePots" :key="idx" class="side-pot-item">
                  边池{{ idx + 1 }}: {{ formatScore(sp.amount) }}
                </div>
              </div>
            </div>

            <div v-if="isReconnectCountdown" class="reconnect-indicator">
              <div class="reconnect-title">连接已断开</div>
              <div class="reconnect-sub">正在尝试重连，剩余 {{ countdown }} 秒超时将被自动弃牌</div>
              <div class="countdown-bar-wrap">
                <div class="countdown-bar" :style="{ width: countdownPercent + '%' }"></div>
              </div>
            </div>
            <div v-else-if="showTurnIndicator" class="turn-indicator">
              <div class="turn-indicator-title">当前行动</div>
              <div class="turn-indicator-name">{{ currentActorInfo.nickname }}</div>
              <div v-if="countdown > 0" class="countdown-bar-wrap">
                <div class="countdown-bar" :style="{ width: countdownPercent + '%' }"></div>
              </div>
              <div v-if="countdown > 0" class="countdown-seconds">剩余 {{ countdown }} 秒</div>
            </div>
            <div v-else-if="countdown > 0" class="phase-indicator">
              <div class="phase-indicator-title">{{ countdownLabel }}</div>
              <div class="countdown-bar-wrap">
                <div class="countdown-bar" :style="{ width: countdownPercent + '%' }"></div>
              </div>
              <div class="countdown-seconds">剩余 {{ countdown }} 秒</div>
            </div>

            <div
              v-for="(seat, viewIdx) in viewSeats"
              :key="viewIdx"
              class="seat-slot"
              :style="getSeatStyle(viewIdx, seat)"
              @click="handleSeatClick(seat)"
            >
              <div
                v-if="seat && seat.seatInfo"
                class="seat-content"
                :class="{
                  'seat-active': seat.isCurrentActor,
                  'seat-empty': !seat.seatInfo.occupied,
                  'seat-folded': seat.handInfo?.hasFolded,
                  'seat-offline': seat.seatInfo.occupied && !seat.seatInfo.isOnline,
                  'seat-content-expanded': isSeatExpanded(seat),
                  'seat-content-collapsed': !isSeatExpanded(seat)
                }"
              >
                <template v-if="seat.isMe">
                  <div class="seat-me-panel">
                    <div class="seat-me-top">
                      <div class="avatar-wrap" :ref="(el) => setSeatAvatarRef(seat.realSeatId, el)">
                        <div class="avatar-frame avatar-online">
                          <span class="avatar-text">{{ getAvatarText(seat.seatInfo.nickname) }}</span>
                        </div>
                      </div>
                      <div class="seat-me-name">{{ seat.seatInfo.nickname || '游客' }}</div>
                      <div class="seat-me-tags">
                        <span class="icon-tag icon-self" title="自己">自己</span>
                        <span v-if="seat.seatInfo.isDealer" class="icon-tag icon-dealer" title="庄家">庄家</span>
                        <span v-if="seat.seatInfo.isSB" class="icon-tag icon-sb" title="小盲">小盲</span>
                        <span v-if="seat.seatInfo.isBB" class="icon-tag icon-bb" title="大盲">大盲</span>
                        <span v-if="seat.handInfo?.isAllIn" class="icon-tag icon-allin" title="全下">全下</span>
                        <span v-if="seat.handInfo?.hasFolded" class="icon-tag icon-folded" title="弃牌">弃牌</span>
                      </div>
                    </div>
                    <div class="seat-me-bottom">
                      <div class="seat-me-col seat-me-col-hand">
                        <div class="seat-me-col-title">手牌</div>
                        <div class="hand-cards hand-cards-self">
                          <div
                            v-for="card in myHoleCards"
                            :key="card.id"
                            class="own-card-wrap"
                            :class="{
                              'own-card-wrap-active': selectedOwnHoleCardId === card.id,
                              'own-card-wrap-raised': isOwnHoleCardRaised(card),
                              'own-card-wrap-locked': isSettlementLockedHoleCard(card.id)
                            }"
                          >
                            <button
                              v-if="selectedOwnHoleCardId === card.id && canToggleHoleCardReveal(card)"
                              class="card-reveal-btn"
                              @click.stop="toggleHoleCardReveal(card)"
                            >
                              {{ card.publiclyRevealed ? '收回' : '展示' }}
                            </button>
                            <div class="own-card-clickable" @click.stop="toggleHoleCardAction(card.id)">
                              <PlayingCard :card="card" :small="true" />
                            </div>
                          </div>
                        </div>
                      </div>
                      <div class="seat-me-col seat-me-col-score">
                        <div class="seat-me-col-title">积分</div>
                        <div class="seat-me-score-content">
                          <div class="seat-me-metric">
                            <span class="seat-me-metric-label">本局结算</span>
                            <span class="seat-me-metric-value" :class="getSeatDeltaClass(seat)">{{ getSeatDeltaText(seat) || '--' }}</span>
                          </div>
                          <div class="seat-me-metric">
                            <span class="seat-me-metric-label">本局下注</span>
                            <span class="seat-me-metric-value seat-metric-value-chip">{{ formatScore(getSeatTotalBet(seat)) }}</span>
                          </div>
                          <div class="seat-me-metric">
                            <span class="seat-me-metric-label">当前总分</span>
                            <span class="seat-me-metric-value seat-metric-value-score">{{ formatScore(getSeatDisplayScore(seat)) }}</span>
                          </div>
                        </div>
                      </div>
                      <div class="seat-me-col seat-me-col-chips">
                        <div class="seat-me-col-title">筹码</div>
                        <div
                          class="seat-me-chip-area"
                          :class="{ 'seat-me-chip-area-active': canEditBetDraft }"
                          :ref="setMyChipAreaRef"
                        >
                          <ChipStacks
                            :score="getMyChipStackScore(seat)"
                            variant="expanded"
                            :interactive="canEditBetDraft"
                            @chip-click="handleSelfChipStackClick"
                          />
                        </div>
                      </div>
                      <div v-if="getSeatResultLabel(seat)" class="seat-me-col seat-me-col-result">
                        <div class="seat-me-col-title">牌型</div>
                        <div
                          class="seat-me-result-label"
                          :class="{
                            'seat-result-folded': seat.handInfo?.hasFolded,
                            'seat-result-byfold': settlementData?.byFold && !seat.handInfo?.hasFolded
                          }"
                        >
                          {{ getSeatResultLabel(seat) }}
                        </div>
                        <div v-if="getSeatResultCards(seat).length > 0" class="seat-result-cards">
                          <PlayingCard
                            v-for="(card, idx) in getSeatResultCards(seat)"
                            :key="`${seat.realSeatId}-${card.id || idx}`"
                            class="seat-result-card"
                            :card="card"
                            :small="true"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <div class="seat-main">
                    <div class="seat-left">
                      <div class="seat-head">
                        <div class="avatar-wrap" :ref="(el) => setSeatAvatarRef(seat.realSeatId, el)">
                          <div class="avatar-badge-stack">
                            <div class="avatar-frame" :class="{ 'avatar-online': seat.seatInfo.isOnline }">
                              <span class="avatar-text">{{ getAvatarText(seat.seatInfo.nickname) }}</span>
                            </div>
                            <div
                              v-if="!isSeatExpanded(seat) && getSeatDeltaText(seat)"
                              class="seat-delta-compact"
                              :class="getSeatDeltaClass(seat)"
                            >
                              {{ getSeatDeltaText(seat) }}
                            </div>
                            <div
                              v-if="!isSeatExpanded(seat) && getSeatPlannedBetAmount(seat) > 0"
                              class="seat-bet-compact"
                            >
                              {{ formatScore(getSeatPlannedBetAmount(seat)) }}
                            </div>
                          </div>
                        </div>
                        <div class="seat-info">
                          <div class="seat-nickname">{{ seat.seatInfo.nickname || '空位' }}</div>
                          <div class="seat-status-icons">
                            <span v-if="seat.seatInfo.isDealer" class="icon-tag icon-dealer" title="庄家">庄家</span>
                            <span v-if="seat.seatInfo.isSB" class="icon-tag icon-sb" title="小盲">小盲</span>
                            <span v-if="seat.seatInfo.isBB" class="icon-tag icon-bb" title="大盲">大盲</span>
                            <span v-if="seat.handInfo?.isAllIn" class="icon-tag icon-allin" title="全下">全下</span>
                            <span v-if="seat.handInfo?.hasFolded" class="icon-tag icon-folded" title="弃牌">弃牌</span>
                            <span v-if="seat.seatInfo.isReady && !isPlaying" class="icon-tag icon-ready" title="已准备">已准备</span>
                          </div>
                          <div v-if="!isSeatExpanded(seat)" class="seat-summary-row">
                            <div class="seat-summary-item">
                              <span class="seat-summary-label">总分</span>
                              <span class="seat-summary-value">{{ formatScore(getSeatDisplayScore(seat)) }}</span>
                            </div>
                            <div class="seat-summary-item">
                              <span class="seat-summary-label">下注</span>
                              <span class="seat-summary-value">{{ formatScore(getSeatTotalBet(seat)) }}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div class="seat-hand">
                        <div
                          v-if="isSeatExpanded(seat) && getSeatPlannedBetAmount(seat) > 0"
                          class="seat-bet-preview"
                        >
                          <div class="seat-bet-preview-value">下注筹码 {{ formatScore(getSeatPlannedBetAmount(seat)) }}</div>
                          <ChipStacks :score="getSeatPlannedBetAmount(seat)" variant="preview" />
                        </div>
                        <template v-if="seat.seatInfo.occupied && seat.handInfo">
                          <div class="hand-cards">
                            <PlayingCard
                              v-for="(card, cIdx) in (seat.handInfo.holeCards || [])"
                              :key="cIdx"
                              :card="card.hidden ? null : card"
                              :hidden="card.hidden"
                              :flipable="true"
                              :small="true"
                            />
                          </div>
                        </template>
                      </div>
                    </div>

                    <div v-if="isSeatExpanded(seat)" class="seat-right">
                      <div class="seat-metric seat-metric-chips">
                        <div class="seat-metric-label">筹码</div>
                        <ChipStacks :score="getSeatDisplayScore(seat)" variant="expanded" />
                      </div>
                      <div class="seat-metric">
                        <div class="seat-metric-label">本局结算</div>
                        <div class="seat-metric-value" :class="getSeatDeltaClass(seat)">
                          {{ getSeatDeltaText(seat) || '--' }}
                        </div>
                      </div>
                      <div class="seat-metric">
                        <div class="seat-metric-label">本局下注</div>
                        <div class="seat-metric-value seat-metric-value-chip">
                          {{ formatScore(getSeatTotalBet(seat)) }}
                        </div>
                      </div>
                      <div class="seat-metric">
                        <div class="seat-metric-label">当前总分</div>
                        <div class="seat-metric-value seat-metric-value-score">
                          {{ formatScore(getSeatDisplayScore(seat)) }}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div v-if="getSeatResultLabel(seat)" class="seat-result">
                    <div
                      class="seat-result-label"
                      :class="{
                        'seat-result-folded': seat.handInfo?.hasFolded,
                        'seat-result-byfold': settlementData?.byFold && !seat.handInfo?.hasFolded
                      }"
                    >
                      {{ getSeatResultLabel(seat) }}
                    </div>
                    <div
                      v-if="getSeatResultCards(seat).length > 0"
                      class="seat-result-cards"
                      :class="{ 'seat-result-cards-overlap': !isSeatExpanded(seat) }"
                    >
                      <PlayingCard
                        v-for="(card, idx) in getSeatResultCards(seat)"
                        :key="`${seat.realSeatId}-${card.id || idx}`"
                        class="seat-result-card"
                        :class="{ 'seat-result-card-compact': !isSeatExpanded(seat) }"
                        :card="card"
                        :small="true"
                      />
                    </div>
                  </div>
                  <template v-if="seat.seatInfo.occupied && !seat.isMe">
                    <button
                      class="seat-toggle-btn"
                      type="button"
                      @click.stop="toggleSeatExpanded(seat)"
                      :title="isSeatExpanded(seat) ? '收起' : '展开'"
                      :aria-label="isSeatExpanded(seat) ? '收起玩家卡片' : '展开玩家卡片'"
                    >
                      {{ isSeatExpanded(seat) ? '▴' : '▾' }}
                    </button>
                  </template>
                </template>
              </div>
              <div v-else class="seat-empty-slot" @click.stop="handleEmptySeatClick(viewIdx)">
                <div class="empty-plus">+</div>
                <div class="empty-text">空座位</div>
              </div>
            </div>

          </div>
        </div>
      </div>

      <div class="action-panel">
        <template v-if="!isPlaying">
          <div class="waiting-panel">
            <div class="waiting-info">
              <span v-if="mySeatId === null">请选择座位入座</span>
              <span v-else-if="!meInfo?.isReady">请点击准备开始</span>
              <span v-else>等待其他玩家准备...</span>
            </div>
            <div class="waiting-actions">
              <button
                class="btn btn-warn"
                v-if="mySeatId !== null && roomState"
                @click="toggleMode('classic')"
                :disabled="roomState.mode === 'classic'"
              >经典模式</button>
              <button
                class="btn btn-warn-alt"
                v-if="mySeatId !== null && roomState"
                @click="toggleMode('wild')"
                :disabled="roomState.mode === 'wild'"
              >癞子模式</button>
              <button
                class="btn btn-info"
                v-if="mySeatId !== null"
                @click="toggleReady"
              >
                {{ meInfo?.isReady ? '取消准备' : '准备' }}
              </button>
              <button
                class="btn btn-danger"
                @click="leaveRoom"
              >离开房间</button>
            </div>
          </div>
        </template>

        <template v-else-if="isShowdownStage && !iHaveFolded">
          <div class="showdown-panel">
            <div class="showdown-pick-area">
              <div
                v-for="card in myShowdownCards"
                :key="card.id"
                class="showdown-card-wrap"
                :class="{
                  'showdown-card-selected': isSelectedShowdown(card.id),
                  'showdown-card-disabled': iHaveSubmitted
                }"
                @click="toggleShowdownCard(card.id)"
              >
                <PlayingCard
                  :card="card"
                  :selected="isSelectedShowdown(card.id)"
                  :disabled="!canSelectShowdown(card.id) || iHaveSubmitted"
                />
                <span class="showdown-card-src">{{ isShowdownHoleCard(card.id) ? '手牌' : '公共' }}</span>
              </div>
            </div>
            <div class="showdown-type-area">
              <div class="showdown-type-label">牌型</div>
              <div class="showdown-type-value">
                {{ showdownPreviewType || '已选 ' + selectedForShowdown.length + '/5' }}
              </div>
              <div class="showdown-type-cards">
                <PlayingCard
                  v-for="card in showdownPreviewCards"
                  :key="card.id"
                  :card="card"
                  small
                />
              </div>
            </div>
            <div class="showdown-action-area">
              <button
                class="btn btn-secondary showdown-recommend-btn"
                :disabled="iHaveSubmitted"
                @click="applySuggestedShowdownSelection"
              >牌型推荐</button>
              <button
                class="btn btn-primary showdown-submit-btn"
                :disabled="selectedForShowdown.length !== 5 || iHaveSubmitted"
                @click="submitShowdownCards"
              >提交牌型</button>
            </div>
            <div v-if="iHaveSubmitted" class="submitted-tag">✓ 已提交，等待其他玩家...</div>
          </div>
        </template>

        <template v-else-if="isSmallBlindDeclareStage && isMyTurnSmallBlind">
          <div class="sb-panel">
            <div class="sb-info">
              <span>请声明本局小盲金额：</span>
              <span class="sb-hint">（范围 1 ~ {{ formatScore(liveMeScore) }}）</span>
            </div>
            <div class="sb-actions">
              <input
                v-model.number="smallBlindAmount"
                type="number"
                class="num-input"
                min="1"
                :max="liveMeScore || 1"
                :placeholder="'最小值 1'"
              />
              <button class="btn btn-primary" @click="declareSmallBlind">确认盲注</button>
            </div>
          </div>
        </template>

        <template v-else-if="showBetPanel">
          <div class="bet-panel">
            <div class="bet-actions-row">
              <button class="btn btn-fold" :disabled="!canPerformBetAction" @click="doAction('fold')">弃牌</button>
              <button
                class="btn btn-check"
                :disabled="!canPerformBetAction || currentBetToCall > 0"
                @click="doAction('check')"
              >过牌</button>
              <button
                class="btn btn-call"
                :disabled="!canPerformBetAction || currentBetToCall <= 0"
                @click="doAction('call')"
              >跟注 {{ formatScore(currentBetToCall) }}</button>
              <div class="raise-group">
                <input
                  v-model.number="raiseAmount"
                  type="number"
                  class="num-input raise-input"
                  :min="minBetInput"
                  :max="maxBetInput"
                  :disabled="!canEditBetDraft"
                  @input="handleRaiseInputChange"
                />
                <button
                  class="btn btn-raise"
                  :disabled="!canPerformBetAction || !canBet"
                  @click="doBet"
                >下注</button>
              </div>
              <button class="btn btn-allin" :disabled="!canPerformBetAction" @click="doAction('all_in')">
                ALL IN
              </button>
              <div class="bet-preview-panel" :ref="setBetPreviewAnchorRef">
                <div class="bet-preview-title">下注筹码</div>
                <div v-if="betPreviewAmount > 0" class="bet-preview-content">
                  <ChipStacks
                    :score="betPreviewAmount"
                    variant="preview"
                    interactive
                    @chip-click="handleBetPreviewChipClick"
                  />
                  <div class="bet-preview-value">{{ formatScore(betPreviewAmount) }}</div>
                </div>
                <div v-else class="bet-preview-empty">点击自己的筹码可快速调整下注</div>
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="idle-panel">
            <span class="idle-text">
              {{ isPlaying && !showBetPanel ? (isMyTurnToAct ? '等待操作...' : '') : '' }}
            </span>
          </div>
        </template>
      </div>
    </div>

    <div v-if="toastMessage" class="toast" :class="toastType">
      {{ toastMessage }}
    </div>

    <div class="flying-chip-layer">
      <div
        v-for="chip in flyingChips"
        :key="chip.id"
        class="flying-chip"
        :class="[
          chip.chipClass,
          { 'flying-chip-active': chip.active }
        ]"
        :style="{
          left: `${chip.startX}px`,
          top: `${chip.startY}px`,
          '--fly-dx': `${chip.dx}px`,
          '--fly-dy': `${chip.dy}px`
        }"
      >
        <span class="flying-chip-label">{{ chip.label }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { getSocket } from '../utils/socket.js'
import { formatScore, STAGE_NAMES, HAND_TYPE_NAMES } from '../utils/format.js'
import { evaluateFiveCards } from '../utils/handEvaluator.js'
import { getClientConfig } from '../utils/config.js'
import ChipStacks from '../components/ChipStacks.vue'
import PlayingCard from '../components/PlayingCard.vue'

const props = defineProps({
  roomId: {
    type: [String, Number],
    required: true
  }
})

const router = useRouter()
const appConfig = getClientConfig()

const roomState = ref(null)
const handState = ref(null)
const displayHandPlayers = ref(null)
const settlementData = ref(null)
const expandedSeatId = ref(null)
const myShowdownCards = ref([])
const selectedForShowdown = ref([])
const selectedOwnHoleCardId = ref(null)
const iHaveSubmitted = ref(false)
const communityCardsForDisplay = ref([])
const communityRevealStates = ref([false, false, false, false, false])
const smallBlindAmount = ref(1)
const raiseAmount = ref(0)
const betDraftTouched = ref(false)
const suppressBetPreviewAnimation = ref(false)
const countdown = ref(0)
const countdownMax = ref(appConfig.room.playerActionSeconds)
const countdownLabel = ref('')
// 断线重连状态：重连计时优先于一切阶段计时
const isOffline = ref(false)
const reconnectDeadlineAt = ref(null)
const reconnectGraceSeconds = appConfig.room.reconnectGraceSeconds || 20
const toastMessage = ref('')
const toastType = ref('info')
const flyingChips = ref([])
// 结算转场期间接管底池展示：筹码堆随转场递减、积分数字保持原始值；null 时回退到 handState.pot
const settlementPotScore = ref(null)
const settlementPotAmount = ref(null)
let countdownTicker = null
let chipAnimationId = 0
let suppressDraftReturnAnimationUntil = 0
const seatAvatarRefs = {}
let potAnchorEl = null
let myChipAreaEl = null
let betPreviewAnchorEl = null
let settlementTimer = null
const SETTLEMENT_CHIP_INTERVAL = 150
const MAX_FLY_CHIPS_PER_COLUMN = 10

const SEAT_POSITIONS = [
  { top: '90%', left: '50%' },
  { top: '60%', left: '8%' },
  { top: '23%', left: '8%' },
  { top: '-6%', left: '50%' },
  { top: '23%', left: '92%' },
  { top: '60%', left: '92%' }
]

const me = computed(() => {
  if (!roomState.value) return null
  const mid = roomState.value.mySeatId
  if (mid === null || mid === undefined) return null
  if (!roomState.value.seats) return null
  const s = roomState.value.seats[mid]
  return s && s.occupied ? s : null
})

const meInfo = computed(() => me.value)

const myHandInfo = computed(() => {
  const mid = roomState.value?.mySeatId
  if (mid === null || mid === undefined || !handState.value?.players) return null
  return handState.value.players[mid] || null
})

const liveMeScore = computed(() => {
  if (myHandInfo.value && typeof myHandInfo.value.score === 'number') {
    return myHandInfo.value.score
  }
  return me.value?.score ?? 0
})

const mySeatId = computed(() => roomState.value ? roomState.value.mySeatId : null)

const isPlaying = computed(() => {
  if (!roomState.value) return false
  return roomState.value.status === 'playing'
})

const currentStage = computed(() => handState.value?.stage || null)

const currentStageName = computed(() => {
  if (!currentStage.value) return ''
  return STAGE_NAMES[currentStage.value] || currentStage.value
})

const communityCards = computed(() => handState.value?.communityCards || [])

const currentPlayerSeat = computed(() => handState.value?.currentPlayerSeat)

const currentActorInfo = computed(() => {
  const seatId = currentPlayerSeat.value
  if (seatId === null || seatId === undefined || !handState.value || !handState.value.players) return null
  return handState.value.players[seatId] || null
})

const showTurnIndicator = computed(() => (
  !!currentActorInfo.value
  && ['small_blind_declare', 'pre_flop_bet', 'flop_bet', 'turn_bet', 'river_bet'].includes(currentStage.value)
))

const countdownPercent = computed(() => {
  if (countdownMax.value <= 0) return 0
  return Math.max(0, Math.min(100, (countdown.value / countdownMax.value) * 100))
})

// 重连计时优先显示：仅当自身处于离线状态且仍处于重连宽限期内时生效
const isReconnectCountdown = computed(() => {
  return isOffline.value && reconnectDeadlineAt.value !== null && reconnectDeadlineAt.value > Date.now()
})

const isShowdownHoleCard = (cardId) => {
  const own = handState.value?.myHandCards || []
  return own.some((c) => c.id === cardId)
}

// 牌型展示区域：默认展示系统推荐牌型，选满 5 张后实时展示所选牌型
const showdownPreviewType = computed(() => {
  if (iHaveSubmitted.value) {
    return myHandInfo.value?.finalHand?.typeName || ''
  }
  const sel = selectedForShowdown.value
  if (sel.length !== 5) {
    return myHandInfo.value?.suggestedTypeName || ''
  }
  const cards = sel.map((cid) => getShowdownCardById(cid)).filter(Boolean)
  if (cards.length !== 5) return myHandInfo.value?.suggestedTypeName || ''
  const mode = handState.value?.mode || 'classic'
  const evaluation = evaluateFiveCards(cards, mode)
  return evaluation ? (HAND_TYPE_NAMES[evaluation.type] || '') : ''
})

const showdownPreviewCards = computed(() => {
  const cards = selectedForShowdown.value.map((cid) => getShowdownCardById(cid)).filter(Boolean)
  if (cards.length !== 5) return cards
  return sortHandCardsForDisplay(cards, showdownPreviewType.value)
})

const viewSeats = computed(() => {
  const m = mySeatId.value
  const visiblePlayers = handState.value?.players || displayHandPlayers.value
  const result = []
  for (let viewIdx = 0; viewIdx < 6; viewIdx++) {
    const realSeatId = (m === null || m === undefined) ? viewIdx : ((m + viewIdx) % 6)
    const seatInfo = roomState.value?.seats ? roomState.value.seats[realSeatId] : null
    const handInfo = visiblePlayers ? visiblePlayers[realSeatId] : null
    const isMe = (realSeatId === m)
    const isCurrentActor = (realSeatId === currentPlayerSeat.value)
    result.push({
      viewIdx,
      realSeatId,
      seatInfo: seatInfo || { occupied: false, seatId: realSeatId },
      handInfo,
      isMe,
      isCurrentActor
    })
  }
  return result
})

const myHoleCards = computed(() => {
  if (!handState.value) return []
  const p = myHandInfo.value
  if (p && p.holeCards) {
    return p.holeCards.filter(c => !c.hidden)
  }
  return handState.value.myHandCards || []
})

const canManageHoleCardReveal = computed(() => {
  return !!(handState.value && myHoleCards.value.length > 0 && !iHaveFolded.value)
})

const settlementLockedHoleCardIds = computed(() => {
  if (!['settling', 'hand_end'].includes(currentStage.value)) {
    return new Set()
  }
  const selectedCards = myHandInfo.value?.selectedCards || []
  return new Set(
    selectedCards
      .filter((card) => myHoleCards.value.some((holeCard) => holeCard.id === card.id))
      .map((card) => card.id)
  )
})

function isSettlementLockedHoleCard(cardId) {
  return !!(cardId && settlementLockedHoleCardIds.value.has(cardId))
}

function isOwnHoleCardRaised(card) {
  return !!(card && (card.publiclyRevealed || isSettlementLockedHoleCard(card.id)))
}

function canToggleHoleCardReveal(card) {
  return !!(card?.id && canManageHoleCardReveal.value && !isSettlementLockedHoleCard(card.id))
}

const isSmallBlindDeclareStage = computed(() => currentStage.value === 'small_blind_declare')
const isBetStage = computed(() => ['pre_flop_bet', 'flop_bet', 'turn_bet', 'river_bet'].includes(currentStage.value))
const isShowdownStage = computed(() => currentStage.value === 'showdown_select')

const isMyTurnSmallBlind = computed(() => {
  if (!handState.value) return false
  return handState.value.smallBlindSeat === mySeatId.value
})

const isMyTurnToAct = computed(() => {
  if (!isPlaying.value) return false
  if (currentPlayerSeat.value === null || currentPlayerSeat.value === undefined) return false
  return currentPlayerSeat.value === mySeatId.value
})

const iHaveFolded = computed(() => {
  const mid = mySeatId.value
  if (mid === null || mid === undefined || !handState.value || !handState.value.players) return false
  const p = handState.value.players[mid]
  return !!(p && p.hasFolded)
})

const currentBetToCall = computed(() => {
  if (!handState.value) return 0
  const toCall = handState.value.currentBetToCall || 0
  const mid = mySeatId.value
  let myBet = 0
  if (mid !== null && mid !== undefined && handState.value.players && handState.value.players[mid]) {
    myBet = handState.value.players[mid].currentBet || 0
  }
  return Math.max(0, toCall - myBet)
})

// 下注输入框语义：输入值 = 本次动作投入的积分（即跟注 n + 额外加注 x）
// 最小下注数：可跟注时为跟注数，无法跟注时为 1；最大下注数恒为玩家当前积分
const minBetInput = computed(() => {
  if (!handState.value) return 0
  const toCall = currentBetToCall.value
  return toCall > 0 && liveMeScore.value >= toCall ? toCall : 1
})

const maxBetInput = computed(() => {
  return liveMeScore.value
})

function getDefaultBetDraftValue() {
  const max = Math.max(0, maxBetInput.value)
  if (max <= 0) return 0
  if (currentBetToCall.value > 0) {
    return Math.min(currentBetToCall.value, max)
  }
  return Math.min(1, max)
}

function clampBetValue(value, fallback = minBetInput.value) {
  const max = Math.max(0, maxBetInput.value)
  const min = Math.max(0, Math.min(minBetInput.value, max))
  const base = Number.isFinite(Number(fallback)) ? Math.floor(Number(fallback)) : min
  const raw = Number(value)
  if (!Number.isFinite(raw)) return Math.max(min, Math.min(max, base))
  return Math.max(min, Math.min(max, Math.floor(raw)))
}

function clampDraftBetValue(value, fallback = 0) {
  const max = Math.max(0, maxBetInput.value)
  const base = Number.isFinite(Number(fallback)) ? Math.floor(Number(fallback)) : 0
  const raw = Number(value)
  if (!Number.isFinite(raw)) return Math.max(0, Math.min(max, base))
  return Math.max(0, Math.min(max, Math.floor(raw)))
}

const showBetPanel = computed(() => isBetStage.value && mySeatId.value !== null && myHandInfo.value && !iHaveFolded.value)

const canEditBetDraft = computed(() => showBetPanel.value && liveMeScore.value > 0)

const canPerformBetAction = computed(() => canEditBetDraft.value && isMyTurnToAct.value)

const betPreviewAmount = computed(() => {
  if (!canEditBetDraft.value) return 0
  if (!betDraftTouched.value) {
    return getDefaultBetDraftValue()
  }
  return clampDraftBetValue(raiseAmount.value)
})

const displayedRaiseAmount = computed(() => {
  if (!canEditBetDraft.value) return 0
  return clampDraftBetValue(raiseAmount.value)
})

const myRemainingChipScore = computed(() => {
  return Math.max(0, liveMeScore.value - betPreviewAmount.value)
})

const canBet = computed(() => {
  const v = displayedRaiseAmount.value
  if (v === null || v === undefined || isNaN(v)) return false
  return v >= minBetInput.value && v <= maxBetInput.value
})

function doBet() {
  const x = displayedRaiseAmount.value
  if (!Number.isInteger(x) || x < minBetInput.value || x > maxBetInput.value) {
    showToast('请输入合法的下注数额', 'error')
    return
  }
  const toCall = currentBetToCall.value
  // 输入 ≤ 跟注数：视为跟注（积分不足时服务端按全下跟注处理）；超过跟注数：加注，增量为超出部分
  if (toCall > 0 && x <= toCall) {
    doAction('call')
  } else {
    doAction('raise', x - toCall)
  }
}

function resetBetDraft(options = {}) {
  const { silent = false } = options
  if (silent) {
    suppressBetPreviewAnimation.value = true
  }
  betDraftTouched.value = false
  raiseAmount.value = canEditBetDraft.value ? clampDraftBetValue(getDefaultBetDraftValue(), getDefaultBetDraftValue()) : 0
}

function handleRaiseInputChange() {
  if (!canEditBetDraft.value) return
  betDraftTouched.value = true
  raiseAmount.value = clampDraftBetValue(raiseAmount.value)
}

function getMyChipStackScore(seat) {
  if (!seat?.isMe) return getSeatDisplayScore(seat)
  return myRemainingChipScore.value
}

function getSeatPlannedBetAmount(seat) {
  if (!seat?.seatInfo?.occupied) return 0
  if (seat.isMe && canEditBetDraft.value) {
    return betPreviewAmount.value
  }
  return Number(seat.handInfo?.plannedBetAmount) || 0
}

function syncBetPreviewAmount(amount) {
  const socket = getSocket()
  socket.emit('update_bet_preview', { amount })
}

const displayPotScore = computed(() => (
  settlementPotScore.value !== null ? settlementPotScore.value : (handState.value?.pot ?? 0)
))
const displayPotValue = computed(() => (
  settlementPotAmount.value !== null ? settlementPotAmount.value : (handState.value?.pot ?? 0)
))

function getSeatDisplayScore(seat) {
  if (!seat || !seat.seatInfo?.occupied) return 0
  if (seat.handInfo && typeof seat.handInfo.score === 'number') {
    return seat.handInfo.score
  }
  return seat.seatInfo.score ?? 0
}

function isSeatExpanded(seat) {
  if (!seat?.seatInfo?.occupied) return false
  if (seat.isMe) return true
  return expandedSeatId.value === seat.realSeatId
}

function toggleSeatExpanded(seat) {
  if (!seat?.seatInfo?.occupied || seat.isMe) return
  expandedSeatId.value = expandedSeatId.value === seat.realSeatId ? null : seat.realSeatId
}

function getSeatDelta(seat) {
  if (!settlementData.value || !seat) return 0
  const deltas = settlementData.value.playerDeltas || {}
  return typeof deltas[seat.realSeatId] === 'number' ? deltas[seat.realSeatId] : 0
}

function getSeatDeltaText(seat) {
  const delta = getSeatDelta(seat)
  if (!delta) return ''
  return `${delta > 0 ? '+' : ''}${formatScore(delta)}`
}

function getSeatDeltaClass(seat) {
  const delta = getSeatDelta(seat)
  if (delta > 0) return 'seat-metric-value-win'
  if (delta < 0) return 'seat-metric-value-lose'
  return 'seat-metric-value-muted'
}

function getSeatTotalBet(seat) {
  if (!seat?.seatInfo?.occupied || !seat.handInfo) return 0
  return Number(seat.handInfo.totalBet) || 0
}

function setSeatAvatarRef(seatId, el) {
  if (el) {
    seatAvatarRefs[seatId] = el
  } else {
    delete seatAvatarRefs[seatId]
  }
}

function setPotAnchorRef(el) {
  potAnchorEl = el
}

function setMyChipAreaRef(el) {
  myChipAreaEl = el
}

function setBetPreviewAnchorRef(el) {
  betPreviewAnchorEl = el
}

function getElementCenter(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return null
  const rect = el.getBoundingClientRect()
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  }
}

const FLY_CHIP_TYPES = [
  { value: 10000000, label: '1KW', className: 'flying-chip-1kw' },
  { value: 1000000, label: '100W', className: 'flying-chip-100w' },
  { value: 100000, label: '10W', className: 'flying-chip-10w' },
  { value: 10000, label: '1W', className: 'flying-chip-1w' },
  { value: 1000, label: '1K', className: 'flying-chip-1k' },
  { value: 100, label: '100', className: 'flying-chip-100' },
  { value: 10, label: '10', className: 'flying-chip-10' },
  { value: 1, label: '1', className: 'flying-chip-1' }
]

// 取面额 ≤ 下注额的最大面额筹码样式（下注转场用，与 ChipStacks 展示一致）
function getFlyChipStyle(amount) {
  const num = Math.max(0, Number(amount) || 0)
  return FLY_CHIP_TYPES.find(t => num >= t.value) || FLY_CHIP_TYPES[FLY_CHIP_TYPES.length - 1]
}

// 按面额从大到小把积分分解成筹码列（与 ChipStacks 的贪心分解一致）
function getChipColumns(score) {
  let remaining = Math.max(0, Math.floor(Number(score) || 0))
  const result = []
  for (const t of FLY_CHIP_TYPES) {
    if (remaining < t.value) continue
    const count = Math.floor(remaining / t.value)
    remaining -= count * t.value
    result.push({ value: t.value, count, label: t.label, className: t.className })
  }
  return result
}

function animateDraftChipTransfer(fromEl, toEl, amount) {
  if (!fromEl || !toEl || amount <= 0) return
  const columns = getChipColumns(amount)
  columns.forEach((column) => {
    const flyCount = Math.min(column.count, 3)
    for (let i = 0; i < flyCount; i++) {
      createFlyingChip(fromEl, toEl, 'draft', column.value, column)
    }
  })
}

function handleSelfChipStackClick(chip) {
  if (!canEditBetDraft.value || !chip?.value) return
  const current = betPreviewAmount.value
  const next = current + chip.value
  if (next > maxBetInput.value) return
  betDraftTouched.value = true
  raiseAmount.value = next
}

function handleBetPreviewChipClick(chip) {
  if (!canEditBetDraft.value || !chip?.value || betPreviewAmount.value <= 0) return
  const minimum = canPerformBetAction.value ? minBetInput.value : 0
  const next = betPreviewAmount.value - chip.value
  if (next <= minimum) {
    if (minimum > 0) {
      raiseAmount.value = minBetInput.value
      betDraftTouched.value = true
    } else {
      betDraftTouched.value = true
      raiseAmount.value = 0
    }
    return
  }
  betDraftTouched.value = true
  raiseAmount.value = next
}

function removeFlyingChip(id) {
  flyingChips.value = flyingChips.value.filter((chip) => chip.id !== id)
}

function createFlyingChip(sourceEl, targetEl, kind, amount, chipStyle) {
  const start = getElementCenter(sourceEl)
  const end = getElementCenter(targetEl)
  if (!start || !end) return

  const style = chipStyle || getFlyChipStyle(amount)
  const id = ++chipAnimationId
  const chip = {
    id,
    kind,
    label: style.label,
    chipClass: style.className,
    startX: start.x,
    startY: start.y,
    dx: end.x - start.x,
    dy: end.y - start.y,
    active: false
  }

  flyingChips.value = [...flyingChips.value, chip]

  requestAnimationFrame(() => {
    flyingChips.value = flyingChips.value.map((item) => (
      item.id === id ? { ...item, active: true } : item
    ))
  })

  setTimeout(() => removeFlyingChip(id), 860)
}

function getBetAnimationSource(seatId) {
  if (String(seatId) === String(mySeatId.value) && betPreviewAnchorEl) {
    return betPreviewAnchorEl
  }
  return seatAvatarRefs[seatId]
}

function animateBetChips(prevState, nextState) {
  if (!prevState?.players || !nextState?.players || !potAnchorEl) return
  const prevPlayers = prevState.players
  const nextPlayers = nextState.players

  Object.keys(nextPlayers).forEach((seatId) => {
    const prevBet = Number(prevPlayers[seatId]?.totalBet) || 0
    const nextBet = Number(nextPlayers[seatId]?.totalBet) || 0
    if (nextBet <= prevBet) return
    const sourceEl = getBetAnimationSource(seatId)
    if (!sourceEl) return
    createFlyingChip(sourceEl, potAnchorEl, 'bet', nextBet - prevBet)
  })
}

function stopSettlementTimer() {
  if (settlementTimer) {
    clearInterval(settlementTimer)
    settlementTimer = null
  }
}

function animateSettlementChips(data) {
  if (!potAnchorEl || !data?.playerDeltas) return
  const winners = Object.entries(data.playerDeltas)
    .map(([seatId, delta]) => ({ seatId, delta: Number(delta) || 0, targetEl: seatAvatarRefs[seatId] }))
    .filter(w => w.delta > 0 && w.targetEl)
  const totalPot = Number(data.pot) || 0
  if (winners.length === 0 || totalPot <= 0) return

  // 底池筹码按列（面额）分解；每列最多飞出与可见盘数一致的筹码，其余按整列价值一次清空
  const columns = getChipColumns(totalPot).map(c => {
    const flyLimit = Math.min(c.count, MAX_FLY_CHIPS_PER_COLUMN)
    return {
      ...c,
      flyLimit,
      queue: [],
      bulkValue: (c.count - flyLimit) * c.value,
      bulkCleared: flyLimit === c.count
    }
  })

  // 贪心分配：把每个赢家的应得按大面额优先拆成各列筹码，填入对应列的飞出队列
  const remainingByValue = {}
  columns.forEach(c => { remainingByValue[c.value] = c.count })
  for (const w of winners) {
    let rest = w.delta
    for (const c of columns) {
      if (rest <= 0 || c.queue.length >= c.flyLimit) continue
      const take = Math.min(Math.floor(rest / c.value), remainingByValue[c.value], c.flyLimit - c.queue.length)
      if (take > 0) {
        for (let i = 0; i < take; i++) c.queue.push(w.seatId)
        remainingByValue[c.value] -= take
        rest -= take * c.value
      }
    }
    if (rest > 0) {
      // 兜底余数（正常不会出现）：计入最小面额列
      const last = columns[columns.length - 1]
      for (let i = 0; i < Math.min(rest, last.flyLimit - last.queue.length); i++) last.queue.push(w.seatId)
    }
  }

  // 结算展示态：积分数字保持原始底池，筹码堆从原始值随转场递减
  settlementPotAmount.value = totalPot
  settlementPotScore.value = totalPot

  stopSettlementTimer()
  let flownValue = 0
  settlementTimer = setInterval(() => {
    let flown = 0
    for (const c of columns) {
      if (c.queue.length > 0) {
        const targetEl = seatAvatarRefs[c.queue.shift()]
        if (targetEl) createFlyingChip(potAnchorEl, targetEl, 'win', c.value, c)
        flown += c.value
      } else if (!c.bulkCleared) {
        flown += c.bulkValue
        c.bulkCleared = true
      }
    }
    flownValue += flown
    settlementPotScore.value = Math.max(0, totalPot - flownValue)
    if (columns.every(c => c.queue.length === 0 && c.bulkCleared)) {
      stopSettlementTimer()
      // 结算后服务端不再广播新 hand_state（engine.hand 已清空），handState.pot 仍是旧局数值，
      // 因此这里固定为 0 保持筹码堆清零，直到新一局 hand_started 时再整体重置
      settlementPotScore.value = 0
    }
  }, SETTLEMENT_CHIP_INTERVAL)
}

function normalizeRank(rank) {
  if (rank === null || rank === undefined) return 0
  return Number(rank)
}

function sortStraightCards(cards) {
  const ranks = cards.map((card) => normalizeRank(card.rank)).sort((a, b) => b - a)
  const isWheel = ranks.length === 5 && ranks[0] === 14 && ranks[1] === 5 && ranks[2] === 4 && ranks[3] === 3 && ranks[4] === 2
  return [...cards].sort((a, b) => {
    const rankA = isWheel && normalizeRank(a.rank) === 14 ? 1 : normalizeRank(a.rank)
    const rankB = isWheel && normalizeRank(b.rank) === 14 ? 1 : normalizeRank(b.rank)
    if (rankB !== rankA) return rankB - rankA
    return String(a.suit || '').localeCompare(String(b.suit || ''))
  })
}

function sortGroupedCards(cards) {
  const rankCounts = cards.reduce((acc, card) => {
    const rank = normalizeRank(card.rank)
    acc[rank] = (acc[rank] || 0) + 1
    return acc
  }, {})

  return [...cards].sort((a, b) => {
    const rankA = normalizeRank(a.rank)
    const rankB = normalizeRank(b.rank)
    const countDiff = (rankCounts[rankB] || 0) - (rankCounts[rankA] || 0)
    if (countDiff !== 0) return countDiff
    if (rankB !== rankA) return rankB - rankA
    return String(a.suit || '').localeCompare(String(b.suit || ''))
  })
}

function sortHandCardsForDisplay(cards, handTypeName) {
  if (!Array.isArray(cards) || cards.length === 0) return []
  if (['顺子', '同花顺', '皇家同花顺'].includes(handTypeName)) {
    return sortStraightCards(cards)
  }
  return sortGroupedCards(cards)
}

function getSeatResultLabel(seat) {
  if (!settlementData.value || !seat?.seatInfo?.occupied || !seat.handInfo) return ''
  if (seat.handInfo.hasFolded) return '弃牌'
  if (settlementData.value.byFold) {
    return getSeatDelta(seat) > 0 ? '未摊牌获胜' : ''
  }
  return seat.handInfo.finalHand?.typeName || ''
}

function getSeatResultCards(seat) {
  if (!settlementData.value || !seat?.handInfo || seat.handInfo.hasFolded || settlementData.value.byFold) {
    return []
  }
  const cards = seat.handInfo.finalHand?.effectiveCards || seat.handInfo.selectedCards || []
  return sortHandCardsForDisplay(cards, seat.handInfo.finalHand?.typeName)
}

function resetCommunityRevealStates() {
  communityRevealStates.value = [false, false, false, false, false]
}

watch(
  [canEditBetDraft, () => handState.value?.handId],
  ([editable]) => {
    if (!editable) {
      suppressBetPreviewAnimation.value = true
      raiseAmount.value = 0
      betDraftTouched.value = false
      return
    }
    resetBetDraft({ silent: true })
  },
  { immediate: true }
)

watch([canPerformBetAction, minBetInput], ([canAct]) => {
  if (!canAct || !betDraftTouched.value) return
  if (displayedRaiseAmount.value < minBetInput.value) {
    suppressBetPreviewAnimation.value = true
    raiseAmount.value = minBetInput.value
  }
})

watch(betPreviewAmount, (next, prev) => {
  if (prev === undefined || next === prev) return
  if (showBetPanel.value || prev > 0 || next > 0) {
    syncBetPreviewAmount(next)
  }
  if (suppressBetPreviewAnimation.value) {
    suppressBetPreviewAnimation.value = false
    return
  }
  const diff = Math.abs(next - prev)
  if (diff <= 0) return
  if (next < prev && Date.now() < suppressDraftReturnAnimationUntil) {
    suppressDraftReturnAnimationUntil = 0
    return
  }
  if (Date.now() >= suppressDraftReturnAnimationUntil) {
    suppressDraftReturnAnimationUntil = 0
  }
  if (next > prev) {
    animateDraftChipTransfer(myChipAreaEl, betPreviewAnchorEl, diff)
  } else {
    animateDraftChipTransfer(betPreviewAnchorEl, myChipAreaEl, diff)
  }
})

watch(myShowdownCards, (cards) => {
  if (cards && cards.length === 7 && selectedForShowdown.value.length === 0) {
    if (handState.value) {
      const mid = mySeatId.value
      if (mid !== null && mid !== undefined && handState.value.players) {
        const p = handState.value.players[mid]
        if (p && p.selectedCards && p.selectedCards.length === 5) {
          selectedForShowdown.value = p.selectedCards.map(c => c.id)
        }
      }
    }
  }
}, { immediate: true })

watch(() => handState.value?.handId, (handId) => {
  if (handId) {
    resetCommunityRevealStates()
  }
}, { immediate: true })

watch(communityCards, (cards) => {
  if (Array.isArray(cards) && cards.length > 0) {
    communityCardsForDisplay.value = cards.slice()
    const next = communityRevealStates.value.slice()
    for (let i = 0; i < 5; i++) {
      next[i] = !!cards[i]
    }
    communityRevealStates.value = next
  }
}, { immediate: true, deep: true })

watch(myHoleCards, (cards) => {
  if (!cards || cards.length === 0) {
    selectedOwnHoleCardId.value = null
    return
  }
  if (selectedOwnHoleCardId.value && !cards.some((card) => card.id === selectedOwnHoleCardId.value)) {
    selectedOwnHoleCardId.value = null
    return
  }
  if (selectedOwnHoleCardId.value && !canToggleHoleCardReveal({ id: selectedOwnHoleCardId.value })) {
    selectedOwnHoleCardId.value = null
  }
}, { immediate: true, deep: true })

function getSeatStyle(viewIdx, seat) {
  const expanded = isSeatExpanded(seat)
  // 自己的卡片宽度由内容决定（手牌/积分固定宽，筹码列与牌型列自适应），其余座位保持固定宽
  const width = seat?.isMe ? 'auto' : `${expanded ? 450 : 194}px`
  const maxWidth = seat?.isMe ? '100%' : undefined
  if (viewIdx === 1 || viewIdx === 2) {
    return {
      top: SEAT_POSITIONS[viewIdx].top,
      left: '1%',
      width,
      maxWidth,
      transform: 'translateY(-50%)'
    }
  }
  if (viewIdx === 4 || viewIdx === 5) {
    return {
      top: SEAT_POSITIONS[viewIdx].top,
      right: '1%',
      left: 'auto',
      width,
      maxWidth,
      transform: 'translateY(-50%)'
    }
  }
  if (viewIdx === 3) {
    return {
      top: SEAT_POSITIONS[viewIdx].top,
      left: SEAT_POSITIONS[viewIdx].left,
      width,
      maxWidth,
      transform: 'translateX(-50%)'
    }
  }
  const pos = SEAT_POSITIONS[viewIdx] || SEAT_POSITIONS[0]
  return {
    top: pos.top,
    left: pos.left,
    width,
    maxWidth,
    transform: 'translate(-50%, -50%)'
  }
}

function getAvatarText(nickname) {
  if (!nickname) return '?'
  return nickname.substring(0, 1)
}

function showToast(msg, type = 'info') {
  toastMessage.value = msg
  toastType.value = type
  setTimeout(() => {
    toastMessage.value = ''
  }, appConfig.ui.toastDurationMs)
}

function toggleHoleCardAction(cardId) {
  if (!canToggleHoleCardReveal({ id: cardId })) return
  selectedOwnHoleCardId.value = selectedOwnHoleCardId.value === cardId ? null : cardId
}

function toggleHoleCardReveal(card) {
  if (!card || !card.id) return
  const socket = getSocket()
  socket.emit('toggle_hole_card_reveal', { cardId: card.id }, (result) => {
    if (result && result.success) {
      showToast(result.revealed ? '已展示该手牌' : '已收回该手牌', 'success')
    } else {
      showToast(result?.error || '操作失败', 'error')
    }
  })
}

function stopCountdown() {
  countdown.value = 0
  countdownMax.value = 0
}

// 统一倒计时刷新：重连计时（最高优先） > 牌局阶段计时 > 准备计时
function syncCountdown() {
  const now = Date.now()
  // 1) 重连计时：无论处于哪个阶段，断线后自动切换为重连计时
  if (isReconnectCountdown.value) {
    const remain = Math.max(0, Math.ceil((reconnectDeadlineAt.value - now) / 1000))
    if (remain <= 0) {
      reconnectDeadlineAt.value = null
      stopCountdown()
      return
    }
    countdown.value = remain
    countdownMax.value = reconnectGraceSeconds
    countdownLabel.value = '连接断开'
    return
  }
  // 2) 牌局阶段计时（操作/摊牌等）：使用服务端广播的绝对截止时间，
  //    断线重连后拉取到最新状态即按已流逝时间续算，既不重新计时也不从断线瞬间续算
  const hd = handState.value
  if (hd && hd.deadlineAt) {
    const remain = Math.ceil((hd.deadlineAt - Date.now()) / 1000)
    if (remain <= 0) {
      stopCountdown()
      return
    }
    countdown.value = remain
    countdownMax.value = Math.max(1, Math.ceil((hd.deadlineTotalMs || 0) / 1000))
    countdownLabel.value = hd.stage === 'showdown_select' ? '玩家摊牌' : (currentStageName.value || '等待操作')
    return
  }
  // 3) 准备计时（第一局结束后的等待准备阶段）
  const rs = roomState.value
  if (rs && rs.readyDeadlineAt) {
    const remain = Math.ceil((rs.readyDeadlineAt - Date.now()) / 1000)
    if (remain <= 0) {
      stopCountdown()
      return
    }
    countdown.value = remain
    countdownMax.value = Math.max(1, Math.ceil((rs.readyDeadlineTotalMs || 0) / 1000))
    countdownLabel.value = '玩家准备'
    return
  }
  stopCountdown()
}

function startCountdownTicker() {
  if (countdownTicker) return
  syncCountdown()
  countdownTicker = setInterval(syncCountdown, 1000)
}

function stopCountdownTicker() {
  if (countdownTicker) {
    clearInterval(countdownTicker)
    countdownTicker = null
  }
}

function goBackToLobby() {
  leaveRoom()
}

function handleSeatClick(seat) {
  if (!seat || !seat.seatInfo) return
  if (!seat.seatInfo.occupied && !isPlaying.value) {
    sitDown(seat.realSeatId)
  }
}

function handleEmptySeatClick(viewIdx) {
  if (isPlaying.value) return
  const m = mySeatId.value
  const realSeatId = (m === null || m === undefined) ? viewIdx : ((m + viewIdx) % 6)
  sitDown(realSeatId)
}

function sitDown(seatId) {
  const socket = getSocket()
  socket.emit('sit_down', { seatId }, (result) => {
    if (result && result.success) {
      showToast('入座成功', 'success')
    } else {
      showToast(result?.error || '入座失败', 'error')
    }
  })
}

function toggleReady() {
  const socket = getSocket()
  socket.emit('toggle_ready', (result) => {
    if (!(result && result.success)) {
      showToast(result?.error || '操作失败', 'error')
    }
  })
}

function toggleMode(mode) {
  const socket = getSocket()
  socket.emit('change_mode', { mode }, (result) => {
    if (!(result && result.success)) {
      showToast(result?.error || '切换模式失败', 'error')
    }
  })
}

function leaveRoom() {
  const socket = getSocket()
  socket.emit('leave_room', (result) => {
    if (result && result.success) {
      router.push('/')
    } else {
      showToast(result?.error || '离开失败', 'error')
    }
  })
}

function declareSmallBlind() {
  const amt = smallBlindAmount.value
  if (!amt || amt < 1) {
    showToast('请输入有效的小盲金额', 'error')
    return
  }
  const socket = getSocket()
  socket.emit('declare_small_blind', { amount: parseInt(amt) }, (result) => {
    if (!(result && result.success)) {
      showToast(result?.error || '声明失败', 'error')
    }
  })
}

function doAction(actionType, amount) {
  const socket = getSocket()
  const data = { actionType }
  if (amount !== undefined && amount !== null) {
    data.amount = parseInt(amount)
  }
  if (['call', 'raise', 'all_in'].includes(actionType)) {
    suppressDraftReturnAnimationUntil = Date.now() + 1500
  }
  socket.emit('player_action', data, (result) => {
    if (result && result.success) {
      resetBetDraft({ silent: true })
    } else {
      suppressDraftReturnAnimationUntil = 0
      showToast(result?.error || '操作失败', 'error')
    }
  })
}

function isSelectedShowdown(cid) {
  return selectedForShowdown.value.includes(cid)
}

function canSelectShowdown(cid) {
  if (isSelectedShowdown(cid)) return true
  return selectedForShowdown.value.length < 5
}

function syncShowdownSelectionToServer(cardIds = null) {
  if (!handState.value || handState.value.stage !== 'showdown_select') return
  const socket = getSocket()
  const payload = Array.isArray(cardIds) && cardIds.length === 5 ? cardIds.slice() : []
  socket.emit('update_showdown_selection', { cardIds: payload })
}

function toggleShowdownCard(cid) {
  if (iHaveSubmitted.value) return
  const idx = selectedForShowdown.value.indexOf(cid)
  if (idx >= 0) {
    selectedForShowdown.value.splice(idx, 1)
  } else {
    if (selectedForShowdown.value.length >= 5) {
      showToast('最多只能选5张牌', 'warn')
      return
    }
    selectedForShowdown.value.push(cid)
  }
  syncShowdownSelectionToServer(selectedForShowdown.value)
}

function applySuggestedShowdownSelection() {
  if (iHaveSubmitted.value) return
  const suggested = myHandInfo.value?.suggestedCards || []
  if (!Array.isArray(suggested) || suggested.length !== 5) {
    showToast('当前暂无可用推荐牌型', 'warn')
    return
  }
  selectedForShowdown.value = suggested.map(c => c.id)
  syncShowdownSelectionToServer(selectedForShowdown.value)
}

function getShowdownCardById(cid) {
  const list = myShowdownCards.value || []
  return list.find(c => c.id === cid) || null
}

function submitShowdownCards() {
  if (selectedForShowdown.value.length !== 5) {
    showToast('请选择5张牌', 'error')
    return
  }
  const socket = getSocket()
  socket.emit('submit_selected_cards', { cardIds: selectedForShowdown.value.slice() }, (result) => {
    if (result && result.success) {
      iHaveSubmitted.value = true
      showToast('提交成功', 'success')
    } else {
      showToast(result?.error || '提交失败', 'error')
    }
  })
}

function syncShowdownStateFromHandState(hs) {
  if (!hs) {
    myShowdownCards.value = []
    iHaveSubmitted.value = false
    if (selectedForShowdown.value.length > 0) {
      selectedForShowdown.value = []
    }
    return
  }
  if (hs.myShowdownCards && Array.isArray(hs.myShowdownCards)) {
    myShowdownCards.value = hs.myShowdownCards
  } else if (hs.stage !== 'showdown_select') {
    myShowdownCards.value = []
  }
  const mid = mySeatId.value
  let submitted = false
  let preSelectedIds = null
  if (mid !== null && mid !== undefined && hs.players && hs.players[mid]) {
    const p = hs.players[mid]
    submitted = !!(p && p.showdownSubmitted)
    if (p && p.selectedCards && p.selectedCards.length === 5) {
      preSelectedIds = p.selectedCards.map(c => c.id)
    }
  }
  iHaveSubmitted.value = submitted
  if (hs.stage === 'showdown_select') {
    if (selectedForShowdown.value.length === 0 && preSelectedIds && preSelectedIds.length === 5) {
      selectedForShowdown.value = preSelectedIds.slice()
    }
  } else {
    if (selectedForShowdown.value.length > 0) {
      selectedForShowdown.value = []
    }
  }
}

function requestFullState() {
  const socket = getSocket()
  socket.emit('get_room_state', (result) => {
    if (result && result.room) {
      roomState.value = result.room
    } else {
      roomState.value = null
    }
    if (result && result.hand) {
      handState.value = result.hand
      displayHandPlayers.value = result.hand.players || null
      syncShowdownStateFromHandState(result.hand)
    } else {
      handState.value = null
      syncShowdownStateFromHandState(null)
    }
    syncCountdown()
    if ((!result || !result.room) && props.roomId) {
      socket.emit('join_room', { roomId: Number(props.roomId) }, (jr) => {
        if (jr && jr.success) {
          setTimeout(requestFullState, appConfig.room.stateRetryDelayMs)
        } else {
          if (jr?.error) showToast(jr.error, 'error')
          router.push('/')
        }
      })
    }
  })
}

onMounted(() => {
  const socket = getSocket()

  socket.on('room_state', (state) => {
    roomState.value = state
    syncCountdown()
  })

  socket.on('hand_state', (state) => {
    animateBetChips(handState.value, state)
    handState.value = state
    if (state?.players) {
      displayHandPlayers.value = state.players
    }
    syncShowdownStateFromHandState(state)
    syncCountdown()
  })

  socket.on('hand_started', () => {
    showToast('新一局开始', 'success')
    flyingChips.value = []
    stopSettlementTimer()
    settlementPotScore.value = null
    settlementPotAmount.value = null
    displayHandPlayers.value = null
    expandedSeatId.value = null
    settlementData.value = null
    communityCardsForDisplay.value = []
    resetCommunityRevealStates()
    selectedForShowdown.value = []
    selectedOwnHoleCardId.value = null
    iHaveSubmitted.value = false
    myShowdownCards.value = []
  })

  socket.on('settlement', (data) => {
    animateSettlementChips(data)
    settlementData.value = data
    syncCountdown()
  })

  socket.on('hand_ended', () => {
    iHaveSubmitted.value = false
    selectedOwnHoleCardId.value = null
    selectedForShowdown.value = []
    myShowdownCards.value = []
    syncCountdown()
  })

  // 断线重连：断开即切换至重连计时（优先级最高）；重连成功后拉取最新状态，
  // 依据服务端广播的绝对截止时间按已流逝时间续算原阶段计时
  socket.on('disconnect', () => {
    isOffline.value = true
    reconnectDeadlineAt.value = Date.now() + reconnectGraceSeconds * 1000
    syncCountdown()
  })

  socket.on('connect', () => {
    isOffline.value = false
    reconnectDeadlineAt.value = null
    requestFullState()
  })

  socket.on('error', (data) => {
    if (data && data.message) {
      showToast(data.message, 'error')
    }
  })

  startCountdownTicker()
  requestFullState()
})

onUnmounted(() => {
  stopCountdownTicker()
  stopSettlementTimer()
  const socket = getSocket()
  socket.off('room_state')
  socket.off('hand_state')
  socket.off('hand_started')
  socket.off('settlement')
  socket.off('hand_ended')
  socket.off('disconnect')
  socket.off('connect')
  socket.off('error')
})
</script>

<style scoped>
.room-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #0a1510 0%, #122318 50%, #0a1510 100%);
  color: #e8e1c8;
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  display: flex;
  flex-direction: column;
}

.room-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 28px;
  background: rgba(0, 0, 0, 0.5);
  border-bottom: 2px solid #8b6914;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.btn-back {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(218, 165, 32, 0.4);
  color: #ffe7a1;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-family: inherit;
  transition: all 0.15s;
}

.btn-back:hover {
  background: rgba(218, 165, 32, 0.2);
}

.room-id-label {
  font-size: 18px;
  font-weight: bold;
  color: #ffd700;
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

.stage-tag {
  padding: 4px 12px;
  background: rgba(40, 167, 69, 0.2);
  color: #69db7c;
  border-radius: 8px;
  font-size: 13px;
  border: 1px solid rgba(80, 200, 100, 0.4);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.player-nickname {
  font-size: 15px;
  font-weight: 600;
  color: #ffe7a1;
}

.player-score {
  font-size: 14px;
  color: #8ce99a;
  font-weight: 500;
  padding: 4px 12px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 16px;
}

.room-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px 20px;
  gap: 16px;
  min-height: 0;
}

.table-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  overflow: visible;
}

.poker-table {
  width: 100%;
  max-width: 1360px;
  height: 100%;
  max-height: 760px;
  aspect-ratio: 16 / 10.8;
  position: relative;
  padding: 20px 26px;
  box-sizing: border-box;
}

.table-felt {
  width: 100%;
  height: 100%;
  border-radius: 0;
  background: transparent;
  border: none;
  box-shadow: none;
  position: relative;
  overflow: visible;
}

.table-felt::before {
  display: none;
}

.table-center {
  position: absolute;
  top: 42%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 62%;
  max-width: 700px;
  z-index: 6;
}

.pot-head {
  display: flex;
  align-items: center;
  gap: 14px;
}

.pot-main {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 22px;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 14px;
  border: 1px solid rgba(218, 165, 32, 0.35);
}

.pot-chip-zone {
  padding: 8px 14px 6px;
  border-radius: 18px;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.06);
  display: inline-flex;
  justify-content: center;
}

.pot-chip-zone :deep(.chip-stacks) {
  overflow: visible;
}

.pot-label {
  font-size: 11px;
  color: #c9b38a;
  letter-spacing: 2px;
}

.pot-value {
  font-size: 22px;
  font-weight: bold;
  color: #ffd700;
  font-family: 'Georgia', serif;
}

.side-pots {
  display: flex;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}

.side-pot-item {
  padding: 3px 10px;
  font-size: 11px;
  background: rgba(0, 0, 0, 0.35);
  border-radius: 10px;
  color: #8ce99a;
}

.stage-display {
  font-size: 14px;
  color: #ffe7a1;
  font-weight: 600;
  letter-spacing: 1px;
}

.countdown-bar-wrap {
  width: 168px;
  height: 8px;
  background: rgba(0, 0, 0, 0.35);
  border-radius: 4px;
  overflow: hidden;
}

.countdown-bar {
  height: 100%;
  background: linear-gradient(90deg, #ffd700, #ff8c00);
  transition: width 1s linear;
}

.community-cards-area {
  display: flex;
  justify-content: center;
}

.turn-indicator {
  position: absolute;
  top: -6%;
  right: 2%;
  z-index: 12;
  min-width: 200px;
  padding: 10px 12px;
  background: rgba(8, 18, 30, 0.88);
  border: 1px solid rgba(218, 165, 32, 0.35);
  border-radius: 12px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.28);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.turn-indicator-title {
  font-size: 12px;
  color: #c9b38a;
  letter-spacing: 1px;
}

.turn-indicator-name {
  font-size: 15px;
  font-weight: 700;
  color: #ffe7a1;
}

.reconnect-indicator,
.phase-indicator {
  position: absolute;
  top: -6%;
  right: 2%;
  z-index: 12;
  min-width: 200px;
  padding: 10px 12px;
  background: rgba(8, 18, 30, 0.88);
  border: 1px solid rgba(218, 165, 32, 0.35);
  border-radius: 12px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.28);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.reconnect-indicator {
  border-color: rgba(255, 80, 80, 0.6);
}

.reconnect-title,
.phase-indicator-title {
  font-size: 12px;
  color: #c9b38a;
  letter-spacing: 1px;
}

.reconnect-title {
  color: #ff9a9a;
  font-weight: 700;
}

.reconnect-sub {
  font-size: 12px;
  color: #ffd2d2;
}

.countdown-seconds {
  font-size: 12px;
  color: #cfe7ff;
}

.community-cards {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.community-card-slot {
  width: 72px;
  height: 100px;
  perspective: 1000px;
}

.community-card-flip {
  width: 100%;
  height: 100%;
}

.community-card-flip-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.65s ease;
}

.community-card-flip.is-revealed .community-card-flip-inner {
  transform: rotateY(180deg);
}

.community-card-face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.community-card-front {
  transform: rotateY(180deg);
}

.community-card-back,
.community-card-front {
  pointer-events: none;
}

.seat-slot {
  position: absolute;
  width: 348px;
  z-index: 10;
}

.seat-content {
  background: rgba(15, 30, 22, 0.92);
  border: 2px solid rgba(218, 165, 32, 0.3);
  border-radius: 18px;
  padding: 14px 16px 14px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.34);
  position: relative;
  transition: all 0.2s;
}

.seat-content-collapsed {
  padding: 10px 10px 20px;
  border-radius: 14px;
}

.seat-content-collapsed .seat-main {
  gap: 0;
}

.seat-content-collapsed .seat-left {
  width: 100%;
  min-width: 0;
}

.seat-content-collapsed .seat-head {
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 6px;
}

.seat-content-collapsed .avatar-frame {
  width: 42px;
  height: 42px;
}

.seat-content-collapsed .avatar-text {
  font-size: 17px;
}

.seat-content-collapsed .seat-nickname {
  font-size: 14px;
  margin-bottom: 4px;
}

.seat-content-collapsed .seat-status-icons {
  gap: 3px;
}

.seat-content-collapsed .icon-tag {
  font-size: 10px;
  padding: 1px 5px;
}

.seat-content-collapsed .seat-hand {
  min-height: 56px;
  justify-content: center;
  align-items: center;
}

.seat-content-collapsed .seat-result {
  margin-top: 4px;
  padding-top: 4px;
}

.seat-empty-slot {
  background: rgba(255, 255, 255, 0.04);
  border: 2px dashed rgba(255, 255, 255, 0.2);
  border-radius: 18px;
  padding: 26px 18px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}

.seat-empty-slot:hover {
  background: rgba(218, 165, 32, 0.12);
  border-color: rgba(218, 165, 32, 0.5);
}

.empty-plus {
  font-size: 28px;
  color: rgba(255, 255, 255, 0.35);
  line-height: 1;
}

.empty-text {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
  margin-top: 4px;
}

.seat-active {
  border-color: #ffd700;
  box-shadow:
    0 0 0 3px rgba(255, 215, 0, 0.25),
    0 4px 14px rgba(0, 0, 0, 0.5);
  animation: pulseGlow 1.6s ease-in-out infinite;
}

@keyframes pulseGlow {
  0%, 100% { box-shadow: 0 0 0 3px rgba(255, 215, 0, 0.2), 0 4px 14px rgba(0, 0, 0, 0.5); }
  50% { box-shadow: 0 0 0 6px rgba(255, 215, 0, 0.35), 0 4px 18px rgba(255, 215, 0, 0.3); }
}

.seat-folded {
  opacity: 0.55;
  filter: grayscale(0.5);
}

.seat-offline {
  opacity: 0.5;
  filter: grayscale(0.7);
}

.seat-me-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.seat-me-top {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 2px 4px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.seat-me-top .avatar-frame {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: #3a3a3a;
  border: 2px solid #4caf50;
  box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.seat-me-top .avatar-text {
  font-size: 15px;
  font-weight: bold;
  color: #fff;
}

.seat-me-name {
  font-size: 14px;
  font-weight: 600;
  color: #ffe7a1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
}

.seat-me-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.seat-me-bet-preview {
  margin: -2px 0 2px;
  padding: 6px 10px;
  border-radius: 10px;
  background: rgba(12, 22, 32, 0.48);
  border: 1px solid rgba(218, 165, 32, 0.16);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.seat-me-bet-preview :deep(.chip-stacks) {
  overflow: visible;
  justify-content: flex-end;
}

.seat-me-bet-value {
  font-size: 12px;
  font-weight: 700;
  color: #ffd46f;
  white-space: nowrap;
}

.seat-me-bottom {
  display: flex;
  gap: 10px;
  align-items: stretch;
}

.seat-me-col {
  border-radius: 10px;
  padding: 8px 10px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.seat-me-col-title {
  font-size: 10px;
  color: #c9b38a;
  letter-spacing: 1px;
  text-align: center;
}

.seat-me-col-hand {
  width: 132px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-start;
}

.seat-me-col-score {
  width: 150px;
  flex: 0 0 auto;
}

.seat-me-score-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
}

.seat-me-metric {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.seat-me-metric-label {
  color: #bda987;
  font-size: 11px;
  white-space: nowrap;
}

.seat-me-metric-value {
  font-weight: 700;
  color: #f4ead0;
  font-size: 12px;
  white-space: nowrap;
}

.seat-me-col-chips {
  flex: 0 0 auto;
  min-width: 0;
}

.seat-me-chip-area {
  border-radius: 10px;
  padding: 4px 6px 2px;
  border: 1px solid transparent;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
}

.seat-me-chip-area-active {
  background: rgba(20, 32, 52, 0.28);
  border-color: rgba(218, 165, 32, 0.28);
  box-shadow: inset 0 0 0 1px rgba(255, 215, 0, 0.06);
}

.seat-me-col-chips :deep(.chip-stacks) {
  overflow: visible;
}

.seat-me-col-result {
  width: 236px;
  flex: 0 0 auto;
  align-items: center;
}

.seat-me-result-label {
  font-size: 12px;
  font-weight: 700;
  color: #ffd46f;
  text-align: center;
  letter-spacing: 0.5px;
}

.seat-me-col-result .seat-result-cards {
  gap: 4px;
}

.seat-me-col-result .seat-result-cards :deep(.playing-card.card-small) {
  width: 42px;
  height: 60px;
}

.seat-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.seat-main {
  display: flex;
  gap: 16px;
  align-items: stretch;
}

.seat-left {
  width: 156px;
  min-width: 156px;
  display: flex;
  flex-direction: column;
}

.seat-right {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-rows: minmax(70px, auto) repeat(3, minmax(0, auto));
  gap: 8px;
}

.avatar-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.avatar-badge-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.avatar-frame {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: #3a3a3a;
  border: 2px solid #555;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.avatar-online {
  border-color: #4caf50;
  box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.3);
}

.avatar-text {
  color: #fff;
  font-size: 20px;
  font-weight: bold;
}

.seat-delta-compact {
  position: static;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(10, 20, 28, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.28);
}

.seat-bet-compact {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(17, 29, 42, 0.94);
  border: 1px solid rgba(218, 165, 32, 0.22);
  color: #ffe7a1;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}

.seat-status-icons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: flex-start;
}

.icon-tag {
  padding: 2px 6px;
  font-size: 11px;
  font-weight: bold;
  border-radius: 4px;
  line-height: 1.4;
}

.icon-self {
  background: #1e88e5;
  color: #fff;
}

.icon-dealer {
  background: #fff;
  color: #222;
  border: 1px solid #aaa;
}

.icon-sb {
  background: #2e7d32;
  color: #fff;
}

.icon-bb {
  background: #c62828;
  color: #fff;
}

.icon-allin {
  background: #ff8c00;
  color: #fff;
}

.icon-folded {
  background: #555;
  color: #ccc;
}

.icon-ready {
  background: #4caf50;
  color: #fff;
}

.seat-info {
  min-width: 0;
}

.seat-summary-row {
  display: flex;
  gap: 4px;
  margin-top: 5px;
  flex-wrap: wrap;
}

.seat-summary-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.seat-summary-label {
  font-size: 10px;
  color: #bda987;
}

.seat-summary-value {
  font-size: 11px;
  color: #f3e9ca;
  font-weight: 700;
}

.seat-nickname {
  font-size: 15px;
  font-weight: 600;
  color: #ffe7a1;
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.seat-hand {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 6px;
  min-height: 78px;
  overflow: visible;
  margin-top: auto;
}

.seat-bet-preview {
  width: 100%;
  padding: 6px 8px;
  border-radius: 10px;
  background: rgba(12, 22, 32, 0.42);
  border: 1px solid rgba(218, 165, 32, 0.14);
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
}

.seat-bet-preview :deep(.chip-stacks) {
  overflow: visible;
  justify-content: center;
}

.seat-bet-preview-value {
  font-size: 11px;
  font-weight: 700;
  color: #ffe7a1;
  text-align: center;
}

.hand-cards {
  display: flex;
  gap: 6px;
  justify-content: center;
  align-items: center;
}

.hand-cards-self {
  align-items: flex-end;
  min-height: 68px;
  margin-top: auto;
}

.own-card-wrap {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  transition: transform 0.18s ease;
}

.own-card-wrap-active {
  z-index: 2;
}

.own-card-wrap-raised {
  transform: translateY(-6px);
}

.own-card-wrap-locked .own-card-clickable {
  cursor: default;
}

.own-card-clickable {
  cursor: pointer;
}

.card-reveal-btn {
  position: absolute;
  top: -28px;
  left: 50%;
  transform: translateX(-50%);
  min-width: 56px;
  padding: 4px 10px;
  border: 1px solid rgba(218, 165, 32, 0.45);
  border-radius: 999px;
  background: rgba(8, 18, 30, 0.96);
  color: #ffe7a1;
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
}

.card-reveal-btn:hover {
  background: rgba(20, 36, 56, 0.98);
}

.seat-metric {
  min-height: 34px;
  padding: 7px 10px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.seat-metric-chips {
  align-items: flex-start;
  flex-direction: column;
}

.seat-metric-label {
  flex: 0 0 auto;
  font-size: 11px;
  color: #c9b38a;
  letter-spacing: 0.8px;
}

.seat-metric-value {
  min-width: 0;
  text-align: right;
  font-size: 15px;
  font-weight: 700;
  color: #f4ead0;
}

.seat-metric-value-score {
  color: #8ce99a;
  font-size: 16px;
}

.seat-metric-value-chip {
  color: #ffe7a1;
}

.seat-metric-value-win {
  color: #69db7c;
}

.seat-metric-value-lose {
  color: #ff8787;
}

.seat-metric-value-muted {
  color: rgba(255, 255, 255, 0.28);
}

.seat-result {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.seat-result-label {
  font-size: 12px;
  font-weight: 700;
  color: #ffd46f;
  text-align: center;
  letter-spacing: 0.5px;
}

.seat-result-folded {
  color: #a0a0a0;
}

.seat-result-byfold {
  color: #69db7c;
}

.seat-result-cards {
  display: flex;
  justify-content: center;
  gap: 4px;
  flex-wrap: nowrap;
}

.seat-result-cards-overlap {
  justify-content: center;
  padding-left: 8px;
}

.seat-result-cards-overlap :deep(.playing-card) {
  margin-left: -20px;
}

.seat-result-cards-overlap :deep(.playing-card:first-child) {
  margin-left: 0;
}

.seat-result-cards-overlap :deep(.seat-result-card-compact.card-small) {
  width: 42px;
  height: 66px;
  border-radius: 7px;
}

.seat-result-cards-overlap :deep(.seat-result-card-compact.card-small .card-corner-tl) {
  top: 4px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
}

.seat-result-cards-overlap :deep(.seat-result-card-compact.card-small .card-corner-br) {
  bottom: 4px;
  right: auto;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
}

.seat-result-cards-overlap :deep(.seat-result-card-compact.card-small .card-suit) {
  font-size: 10px;
  margin-top: 0;
}

.seat-toggle-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 26px;
  height: 26px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid rgba(218, 165, 32, 0.34);
  background: rgba(8, 18, 30, 0.92);
  color: #ffe7a1;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.16s ease, transform 0.16s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.seat-toggle-btn:hover {
  background: rgba(28, 42, 62, 0.96);
  transform: translateY(-1px);
}

.action-panel {
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(218, 165, 32, 0.3);
  border-radius: 14px;
  padding: 16px 20px;
  min-height: 110px;
  flex-shrink: 0;
}

.waiting-panel, .sb-panel, .bet-panel, .showdown-panel, .idle-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
}

.waiting-info, .sb-info, .idle-text, .showdown-hint {
  font-size: 14px;
  color: #ffe7a1;
}

.sb-hint {
  font-size: 12px;
  color: #a09375;
  margin-left: 8px;
}

.waiting-actions, .sb-actions, .bet-actions-row, .bet-info-row {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
}

.bet-info-row {
  gap: 24px;
  font-size: 13px;
  color: #c9b38a;
}

.btn {
  padding: 10px 22px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: linear-gradient(90deg, #b8860b, #daa520, #b8860b);
  color: #2c1e00;
  box-shadow: 0 2px 8px rgba(218, 165, 32, 0.3);
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: #e8e1c8;
  border: 1px solid rgba(218, 165, 32, 0.3);
}

.btn-secondary:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
}

.btn-warn {
  background: linear-gradient(90deg, #a0522d, #cd853f);
  color: #fff;
}

.btn-warn-alt {
  background: linear-gradient(90deg, #6f42c1, #8956e0);
  color: #fff;
}

.btn-info {
  background: linear-gradient(90deg, #1e88e5, #42a5f5);
  color: #fff;
}

.btn-danger {
  background: linear-gradient(90deg, #c62828, #e53935);
  color: #fff;
}

.btn-fold {
  background: linear-gradient(180deg, #b71c1c, #c62828);
  color: #fff;
  min-width: 76px;
}

.btn-check {
  background: linear-gradient(180deg, #2e7d32, #388e3c);
  color: #fff;
  min-width: 76px;
}

.btn-call {
  background: linear-gradient(180deg, #1565c0, #1976d2);
  color: #fff;
  min-width: 92px;
}

.btn-raise {
  background: linear-gradient(180deg, #6a1b9a, #8e24aa);
  color: #fff;
}

.btn-allin {
  background: linear-gradient(180deg, #e65100, #ff6d00);
  color: #fff;
  min-width: 94px;
}

.btn-success {
  background: linear-gradient(180deg, #2e7d32, #43a047);
  color: #fff;
}

.num-input {
  padding: 9px 12px;
  border: 1px solid #5a4520;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.4);
  color: #e8e1c8;
  font-size: 14px;
  font-family: inherit;
  width: 96px;
  outline: none;
}

.num-input:focus {
  border-color: #daa520;
}

.raise-group {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.25);
  padding: 6px 10px;
  border-radius: 8px;
}

.raise-input {
  width: 88px;
}

.bet-preview-panel {
  min-width: 240px;
  max-width: 320px;
  min-height: 92px;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.24);
  border: 1px solid rgba(218, 165, 32, 0.22);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
}

.bet-preview-title {
  font-size: 12px;
  font-weight: 700;
  color: #ffe7a1;
  text-align: center;
}

.bet-preview-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.bet-preview-content :deep(.chip-stacks) {
  flex: 1 1 auto;
  overflow: visible;
}

.bet-preview-value {
  flex: 0 0 auto;
  min-width: 56px;
  text-align: right;
  font-size: 15px;
  font-weight: 700;
  color: #ffd46f;
}

.bet-preview-empty {
  text-align: center;
  font-size: 12px;
  line-height: 1.45;
  color: #bda987;
}

.showdown-card-wrap {
  padding: 6px;
  border-radius: 10px;
  transition: all 0.15s;
  cursor: pointer;
  border: 2px solid transparent;
}

.showdown-card-wrap:hover {
  background: rgba(218, 165, 32, 0.1);
}

.showdown-card-selected {
  background: rgba(218, 165, 32, 0.18);
  border-color: #ffd700;
}

/* 摊牌选牌内联面板：选牌区域 | 牌型展示区域 | 提交按钮 */
.showdown-panel {
  flex-direction: row;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  justify-content: center;
}

.showdown-pick-area {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}

.showdown-card-wrap {
  position: relative;
}

.showdown-card-disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.showdown-card-disabled:hover {
  background: transparent;
}

.showdown-card-src {
  position: absolute;
  bottom: -2px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  color: #e8e1c8;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(218, 165, 32, 0.4);
  border-radius: 4px;
  padding: 0 5px;
  white-space: nowrap;
}

.showdown-type-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(218, 165, 32, 0.3);
  border-radius: 12px;
  padding: 10px 14px;
  min-width: 150px;
}

.showdown-type-label {
  font-size: 12px;
  color: #c9b38a;
  letter-spacing: 1px;
}

.showdown-type-value {
  font-size: 18px;
  font-weight: 700;
  color: #ffd700;
  min-height: 24px;
}

.showdown-type-cards {
  display: flex;
  gap: 4px;
  justify-content: center;
  min-height: 52px;
}

.showdown-action-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.showdown-recommend-btn,
.showdown-submit-btn {
  min-width: 110px;
}

.idle-text {
  font-size: 14px;
  color: #c9b38a;
  padding: 10px;
}

.toast {
  position: fixed;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 28px;
  border-radius: 8px;
  font-size: 14px;
  z-index: 2000;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.5);
  max-width: 80%;
}

.toast.info { background: #2c5364; color: #fff; }
.toast.success { background: #2f855a; color: #fff; }
.toast.error { background: #c53030; color: #fff; }
.toast.warn { background: #b7791f; color: #fff; }

input[type="range"] {
  cursor: pointer;
}

.flying-chip-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 1800;
}

.flying-chip {
  position: fixed;
  width: 34px;
  height: 34px;
  margin-left: -17px;
  margin-top: -17px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid rgba(255, 255, 255, 0.85);
  box-shadow:
    0 10px 18px rgba(0, 0, 0, 0.26),
    inset 0 1px 0 rgba(255, 255, 255, 0.62),
    inset 0 -2px 4px rgba(0, 0, 0, 0.22);
  opacity: 0;
  transform: translate(0, 0) scale(0.72);
  transition: transform 0.82s cubic-bezier(0.2, 0.75, 0.15, 1), opacity 0.18s ease;
}

.flying-chip::before {
  content: '';
  position: absolute;
  inset: 5px;
  border-radius: 50%;
  border: 2px dashed rgba(255, 255, 255, 0.7);
}

.flying-chip-1kw {
  background: radial-gradient(circle at 30% 30%, #fceea7 0%, #d9ae1f 48%, #7d5100 100%);
}

.flying-chip-100w {
  background: radial-gradient(circle at 30% 30%, #ffe6f4 0%, #d6569a 48%, #6d123e 100%);
}

.flying-chip-10w {
  background: radial-gradient(circle at 30% 30%, #f0e4ff 0%, #8b5cf6 48%, #3d217e 100%);
}

.flying-chip-1w {
  background: radial-gradient(circle at 30% 30%, #dcf7ff 0%, #2aa7d6 48%, #0f4961 100%);
}

.flying-chip-1k {
  background: radial-gradient(circle at 30% 30%, #e0ffe7 0%, #2fbe67 48%, #14542e 100%);
}

.flying-chip-100 {
  background: radial-gradient(circle at 30% 30%, #fff0d8 0%, #ff9b42 48%, #7b3b09 100%);
}

.flying-chip-10 {
  background: radial-gradient(circle at 30% 30%, #ffe2e2 0%, #e14d4d 48%, #731919 100%);
}

.flying-chip-1 {
  background: radial-gradient(circle at 30% 30%, #f1f3f5 0%, #8c99a6 48%, #343a40 100%);
}

.flying-chip-active {
  opacity: 1;
  transform: translate(var(--fly-dx), var(--fly-dy)) scale(1);
}

.flying-chip-label {
  position: relative;
  z-index: 1;
  font-size: 9px;
  font-weight: 800;
  color: #fffdf3;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.44);
}
</style>
