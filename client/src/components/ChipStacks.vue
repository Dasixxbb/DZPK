<template>
  <div class="chip-stacks" :class="[variantClass, { 'chip-stacks-animating': isAnimating }]">
    <div
      v-for="chip in stacks"
      :key="chip.label"
      class="chip-stack"
      :class="[chip.className, { 'chip-stack-interactive': interactive }]"
      :style="{ '--chip-count': chip.visibleCount }"
      @click="handleChipClick(chip)"
    >
      <div class="chip-stack-body">
        <div
          v-for="n in chip.visibleCount"
          :key="`${chip.label}-${n}`"
          class="chip-disc"
          :style="{ bottom: `${(n - 1) * 4}px`, zIndex: n }"
        >
          <div class="chip-inner-ring"></div>
          <div v-if="n === chip.visibleCount" class="chip-label">{{ chip.label }}</div>
        </div>
      </div>
      <div
        v-if="chip.count > 1"
        class="chip-count"
        :style="{ top: countLabelTop(chip) + 'px' }"
      >x{{ chip.count }}</div>
    </div>
    <div v-if="stacks.length === 0" class="chip-empty">无筹码</div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const CHIP_TYPES = [
  { value: 10000000, label: '1KW', className: 'chip-1kw' },
  { value: 1000000, label: '100W', className: 'chip-100w' },
  { value: 100000, label: '10W', className: 'chip-10w' },
  { value: 10000, label: '1W', className: 'chip-1w' },
  { value: 1000, label: '1K', className: 'chip-1k' },
  { value: 100, label: '100', className: 'chip-100' },
  { value: 10, label: '10', className: 'chip-10' },
  { value: 1, label: '1', className: 'chip-1' }
]

const props = defineProps({
  score: {
    type: Number,
    default: 0
  },
  variant: {
    type: String,
    default: 'seat'
  },
  interactive: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['chip-click'])

// 各变体的筹码堆总高度与单枚筹码盘直径（与下方样式保持一致）
const CHIP_DIMS = {
  seat: { stack: 88, disc: 32 },
  expanded: { stack: 96, disc: 40 },
  pot: { stack: 98, disc: 42 },
  preview: { stack: 90, disc: 36 }
}

// 计算数量标签的 top，使其始终紧贴该堆最上方那枚筹码
function countLabelTop(chip) {
  const dims = CHIP_DIMS[props.variant] || CHIP_DIMS.seat
  const n = Math.max(1, chip.visibleCount || chip.count || 1)
  const topDiscEdge = dims.stack - (n - 1) * 4 - dims.disc
  return topDiscEdge - 20
}

function handleChipClick(chip) {
  if (!props.interactive) return
  emit('chip-click', chip)
}

const isAnimating = ref(false)
let animateTimer = null

watch(() => props.score, (next, prev) => {
  if (prev === undefined || next === prev) return
  isAnimating.value = false
  if (animateTimer) clearTimeout(animateTimer)
  requestAnimationFrame(() => {
    isAnimating.value = true
    animateTimer = setTimeout(() => {
      isAnimating.value = false
    }, 520)
  })
})

const variantClass = computed(() => `chip-stacks-${props.variant}`)

const stacks = computed(() => {
  let remaining = Math.max(0, Math.floor(Number(props.score) || 0))
  const result = []

  for (const chip of CHIP_TYPES) {
    if (remaining < chip.value) continue
    const count = Math.floor(remaining / chip.value)
    remaining -= count * chip.value
    result.push({
      ...chip,
      count,
      visibleCount: Math.min(count, 10)
    })
  }

  return result
})
</script>

<style scoped>
.chip-stacks {
  min-height: 60px;
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  gap: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 16px 2px 8px;
  transition: transform 0.28s ease, filter 0.28s ease;
}

.chip-stacks-animating {
  transform: translateY(-2px) scale(1.02);
  filter: drop-shadow(0 6px 12px rgba(255, 215, 0, 0.18));
}

.chip-stacks-seat {
  min-height: 60px;
}

.chip-stacks-expanded {
  min-height: 84px;
  gap: 10px;
}

.chip-stacks-expanded .chip-stack {
  min-width: 40px;
  height: 96px;
}

.chip-stacks-expanded .chip-stack-body {
  width: 40px;
}

.chip-stacks-expanded .chip-disc {
  width: 40px;
  height: 40px;
}

.chip-stacks-expanded .chip-label {
  font-size: 10px;
}

.chip-stacks-expanded .chip-count {
  font-size: 11px;
}

.chip-stacks-pot {
  min-height: 88px;
  gap: 10px;
  justify-content: center;
}

.chip-stacks-pot .chip-stack {
  min-width: 42px;
  height: 98px;
}

.chip-stacks-pot .chip-stack-body {
  width: 42px;
}

.chip-stacks-pot .chip-disc {
  width: 42px;
  height: 42px;
}

.chip-stacks-pot .chip-label {
  font-size: 11px;
}

.chip-stacks-preview {
  min-height: 82px;
  gap: 9px;
}

.chip-stacks-preview .chip-stack {
  min-width: 36px;
  height: 90px;
}

.chip-stacks-preview .chip-stack-body {
  width: 36px;
}

.chip-stacks-preview .chip-disc {
  width: 36px;
  height: 36px;
}

.chip-stacks-preview .chip-label {
  font-size: 10px;
}

.chip-stacks::-webkit-scrollbar {
  height: 4px;
}

.chip-stacks::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.18);
  border-radius: 999px;
}

.chip-stack {
  position: relative;
  min-width: 32px;
  height: 88px;
  flex: 0 0 auto;
}

.chip-stack-interactive {
  cursor: pointer;
}

.chip-stack-interactive:hover {
  transform: translateY(-2px);
}

.chip-stack-body {
  position: relative;
  width: 32px;
  height: 100%;
}

.chip-disc {
  position: absolute;
  left: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.88);
  box-shadow:
    0 3px 8px rgba(0, 0, 0, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.58),
    inset 0 -2px 5px rgba(0, 0, 0, 0.24);
  overflow: hidden;
}

.chip-disc::before,
.chip-disc::after {
  content: '';
  position: absolute;
  inset: 5px;
  border-radius: 50%;
}

.chip-disc::before {
  border: 2px dashed rgba(255, 255, 255, 0.72);
}

.chip-disc::after {
  inset: 9px;
  background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.14) 48%, rgba(0, 0, 0, 0.16) 100%);
}

.chip-inner-ring {
  position: absolute;
  inset: 11px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.42);
  z-index: 1;
}

.chip-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 800;
  color: #fffdf3;
  letter-spacing: 0.2px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
  z-index: 2;
}

.chip-count {
  position: absolute;
  right: -6px;
  min-width: 18px;
  padding: 1px 5px;
  border-radius: 999px;
  background: rgba(8, 18, 30, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: #f3e9ca;
  font-size: 10px;
  line-height: 1.4;
  text-align: center;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.25);
  z-index: 30;
}

.chip-empty {
  color: rgba(255, 255, 255, 0.28);
  font-size: 12px;
  line-height: 1.4;
  padding-bottom: 4px;
}

.chip-1kw .chip-disc {
  background: radial-gradient(circle at 30% 30%, #fceea7 0%, #d9ae1f 48%, #7d5100 100%);
}

.chip-100w .chip-disc {
  background: radial-gradient(circle at 30% 30%, #ffe6f4 0%, #d6569a 48%, #6d123e 100%);
}

.chip-10w .chip-disc {
  background: radial-gradient(circle at 30% 30%, #f0e4ff 0%, #8b5cf6 48%, #3d217e 100%);
}

.chip-1w .chip-disc {
  background: radial-gradient(circle at 30% 30%, #dcf7ff 0%, #2aa7d6 48%, #0f4961 100%);
}

.chip-1k .chip-disc {
  background: radial-gradient(circle at 30% 30%, #e0ffe7 0%, #2fbe67 48%, #14542e 100%);
}

.chip-100 .chip-disc {
  background: radial-gradient(circle at 30% 30%, #fff0d8 0%, #ff9b42 48%, #7b3b09 100%);
}

.chip-10 .chip-disc {
  background: radial-gradient(circle at 30% 30%, #ffe2e2 0%, #e14d4d 48%, #731919 100%);
}

.chip-1 .chip-disc {
  background: radial-gradient(circle at 30% 30%, #f1f3f5 0%, #8c99a6 48%, #343a40 100%);
}
</style>
