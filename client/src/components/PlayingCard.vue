<template>
  <div
    class="playing-card"
    :class="[
      small ? 'card-small' : '',
      selected ? 'card-selected' : '',
      disabled ? 'card-disabled' : '',
      flipable ? 'card-flipable' : '',
      hidden ? 'card-hidden' : '',
      display.cardClass
    ]"
    @click="handleClick"
  >
    <template v-if="flipable">
      <div class="card-flip" :class="{ 'is-hidden': hidden }">
        <div class="card-flip-inner">
          <div class="card-face card-front-face">
            <div class="card-corner card-corner-tl" :class="display.colorClass">
              <span class="card-rank">{{ display.rankText }}</span>
              <span class="card-suit">{{ display.suitText }}</span>
            </div>

            <div class="card-corner card-corner-br" :class="display.colorClass">
              <span class="card-rank">{{ display.rankText }}</span>
              <span class="card-suit">{{ display.suitText }}</span>
            </div>
          </div>

          <div class="card-face card-back-face">
            <div class="card-back">
              <div class="card-back-inner">
                <div class="card-back-pattern">♠ ♥ ♦ ♣</div>
                <div class="card-back-pattern small-line">♣ ♦ ♥ ♠</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template v-else-if="!hidden">
      <div class="card-corner card-corner-tl" :class="display.colorClass">
        <span class="card-rank">{{ display.rankText }}</span>
        <span class="card-suit">{{ display.suitText }}</span>
      </div>

      <div class="card-corner card-corner-br" :class="display.colorClass">
        <span class="card-rank">{{ display.rankText }}</span>
        <span class="card-suit">{{ display.suitText }}</span>
      </div>
    </template>

    <template v-else>
      <div class="card-back">
        <div class="card-back-inner">
          <div class="card-back-pattern">♠ ♥ ♦ ♣</div>
          <div class="card-back-pattern small-line">♣ ♦ ♥ ♠</div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { getCardDisplay } from '../utils/format.js'

const props = defineProps({
  card: {
    type: Object,
    default: null
  },
  selected: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  },
  small: {
    type: Boolean,
    default: false
  },
  hidden: {
    type: Boolean,
    default: false
  },
  flipable: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['click'])

const lastVisibleCard = ref(props.card)

watch(() => props.card, (card) => {
  if (card) {
    lastVisibleCard.value = card
  }
}, { immediate: true, deep: true })

const displayCard = computed(() => props.card || lastVisibleCard.value)
const display = computed(() => getCardDisplay(displayCard.value))

function handleClick() {
  if (!props.disabled) {
    emit('click')
  }
}
</script>

<style scoped>
.playing-card {
  position: relative;
  width: 72px;
  height: 100px;
  border-radius: 10px;
  background: linear-gradient(180deg, #ffffff 0%, #fff8ef 100%);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28);
  box-sizing: border-box;
  cursor: pointer;
  user-select: none;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  border: 2px solid #d7c4a1;
  overflow: hidden;
}

.playing-card:hover:not(.card-disabled) {
  transform: translateY(-4px);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.36);
}

.card-small {
  width: 52px;
  height: 72px;
  border-radius: 8px;
}

.card-selected {
  transform: translateY(-10px);
  box-shadow: 0 10px 22px rgba(218, 165, 32, 0.62);
  border-color: #daa520;
}

.card-disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.card-flipable {
  background: transparent;
}

.card-flip {
  width: 100%;
  height: 100%;
  perspective: 1000px;
}

.card-flip-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.55s ease;
}

.card-flip.is-hidden .card-flip-inner {
  transform: rotateY(180deg);
}

.card-face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  border-radius: inherit;
  overflow: hidden;
}

.card-front-face {
  transform: rotateY(0deg);
  background: linear-gradient(180deg, #ffffff 0%, #fff8ef 100%);
}

.card-back-face {
  transform: rotateY(180deg);
}

.card-corner {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
  font-weight: 700;
  font-family: 'Georgia', serif;
  z-index: 2;
}

.card-corner-tl {
  top: 6px;
  left: 6px;
  font-size: 15px;
}

.card-small .card-corner-tl {
  top: 4px;
  left: 4px;
  font-size: 11px;
}

.card-corner-br {
  bottom: 6px;
  right: 6px;
  font-size: 15px;
  transform: rotate(180deg);
}

.card-small .card-corner-br {
  bottom: 4px;
  right: 4px;
  font-size: 11px;
}

.card-rank {
  display: block;
}

.card-suit {
  display: block;
  font-size: 16px;
  margin-top: 1px;
}

.card-small .card-suit {
  font-size: 12px;
}

.wild-joker-small .card-rank,
.wild-joker-big .card-rank {
  font-size: 8px;
  letter-spacing: 0.4px;
  line-height: 1;
}

.card-small.wild-joker-small .card-rank,
.card-small.wild-joker-big .card-rank {
  font-size: 6px;
  letter-spacing: 0;
}

.wild-joker-small .card-suit,
.wild-joker-big .card-suit {
  display: none;
}

.card-center {
  position: absolute;
  inset: 24px 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-small .card-center {
  inset: 18px 10px;
}

.pip-grid {
  width: 82%;
  height: 72%;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(5, 1fr);
  align-items: center;
  justify-items: center;
}

.pip-suit {
  font-size: 16px;
  line-height: 1;
}

.card-small .pip-suit {
  font-size: 11px;
}

.pip-flip {
  transform: rotate(180deg);
}

.face-frame {
  width: 100%;
  height: 100%;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(244, 236, 221, 0.98));
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  box-shadow:
    inset 0 0 0 2px rgba(218, 165, 32, 0.2),
    inset 0 0 14px rgba(0, 0, 0, 0.04);
  padding: 5px 4px;
  box-sizing: border-box;
  overflow: hidden;
}

.card-small .face-frame {
  gap: 2px;
  border-radius: 8px;
  padding: 4px 3px;
}

.face-ornament {
  width: 68%;
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent 0%, rgba(186, 134, 11, 0.82) 22%, rgba(255, 220, 120, 0.95) 50%, rgba(186, 134, 11, 0.82) 78%, transparent 100%);
  position: relative;
  flex-shrink: 0;
}

.face-ornament::before,
.face-ornament::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: rgba(214, 184, 100, 0.95);
  transform: translateY(-50%);
}

.face-ornament::before {
  left: 2px;
}

.face-ornament::after {
  right: 2px;
}

.card-small .face-ornament {
  height: 3px;
}

.card-small .face-ornament::before,
.card-small .face-ornament::after {
  width: 4px;
  height: 4px;
}

.face-emblem {
  position: relative;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.card-small .face-emblem {
  width: 24px;
  height: 24px;
}

.face-emblem-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background:
    radial-gradient(circle at center, rgba(255, 255, 255, 0.95) 0 44%, rgba(233, 217, 183, 0.85) 45%, rgba(184, 140, 44, 0.95) 69%, rgba(111, 78, 13, 0.95) 100%);
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.6),
    0 1px 3px rgba(0, 0, 0, 0.12);
}

.face-icon {
  position: relative;
  z-index: 1;
  width: 24px;
  height: 24px;
  display: block;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.2));
}

.card-small .face-icon {
  width: 15px;
  height: 15px;
}

.face-suit-bar {
  min-width: 22px;
  padding: 1px 7px;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(86, 60, 11, 0.14), rgba(218, 165, 32, 0.22));
  border: 1px solid rgba(186, 134, 11, 0.32);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
  flex-shrink: 0;
}

.card-small .face-suit-bar {
  min-width: 16px;
  padding: 0 5px;
}

.face-suit {
  font-size: 12px;
  line-height: 1;
}

.card-small .face-suit {
  font-size: 9px;
}

.face-knife .face-emblem-ring {
  background:
    radial-gradient(circle at center, rgba(255, 255, 255, 0.98) 0 42%, rgba(220, 221, 225, 0.88) 43%, rgba(128, 138, 149, 0.95) 68%, rgba(71, 81, 92, 0.95) 100%);
}

.face-queen_crown .face-emblem-ring,
.face-king_crown .face-emblem-ring {
  background:
    radial-gradient(circle at center, rgba(255, 248, 214, 0.98) 0 42%, rgba(234, 214, 160, 0.9) 43%, rgba(198, 151, 42, 0.95) 68%, rgba(120, 83, 12, 0.95) 100%);
}

.queen-crown-icon {
  transform: translateY(1px);
}

.king-crown-icon {
  transform: translateY(-1px);
}

.wild-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  font-weight: 700;
}

.wild-rank {
  font-size: 24px;
}

.wild-suit {
  font-size: 18px;
}

.card-small .wild-rank {
  font-size: 18px;
}

.card-small .wild-suit {
  font-size: 14px;
}

.black {
  color: #1a1a1a;
}

.red {
  color: #d12b2b;
}

.card-hidden {
  border-color: #1a1a1a;
}

.card-back {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #18335f 0%, #28508f 52%, #18335f 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  box-sizing: border-box;
}

.card-back-inner {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  border: 1px solid rgba(201, 169, 97, 0.45);
  background:
    radial-gradient(circle at center, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0) 56%),
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.04) 4px, transparent 4px, transparent 10px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.card-small .card-back-inner {
  gap: 4px;
}

.card-back-pattern {
  color: #d6bb75;
  font-size: 14px;
  letter-spacing: 2px;
  text-shadow: 0 0 4px rgba(214, 187, 117, 0.4);
}

.card-back-pattern.small-line {
  font-size: 12px;
}

.card-small .card-back-pattern {
  font-size: 10px;
  letter-spacing: 1px;
}

.card-small .card-back-pattern.small-line {
  font-size: 8px;
}

.wild-joker-small {
  background: linear-gradient(135deg, #f0f4f8 0%, #d9e2ec 100%);
  border-color: #506070;
  color: #334150;
}

.wild-joker-small .card-corner,
.wild-joker-small .card-center {
  color: #334150;
}

.wild-joker-big {
  background: linear-gradient(135deg, #fff5f7 0%, #ffd9e0 100%);
  border-color: #c9405a;
}

.wild-joker-big .card-corner,
.wild-joker-big .card-center {
  color: #c9405a;
}

.wild-universal {
  background: linear-gradient(135deg, #fffdf0 0%, #fff3b0 50%, #ffe066 100%);
  border-color: #b8860b;
}

.wild-universal .card-corner,
.wild-universal .card-center {
  color: #6b4e00;
}
</style>
