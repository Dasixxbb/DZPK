import YAML from 'yaml'

const defaultConfig = {
  ws: {
    url: 'http://localhost:3000'
  },
  socket: {
    reconnectionDelayMs: 1000,
    reconnectionDelayMaxMs: 5000,
    heartbeatIntervalMs: 25000
  },
  lobby: {
    refreshIntervalMs: 3000
  },
  ui: {
    toastDurationMs: 3000,
    nicknameMaxLength: 20
  },
  room: {
    playerActionSeconds: 120,
    stateRetryDelayMs: 200,
    reconnectGraceSeconds: 20
  }
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function mergeDeep(base, override) {
  const result = { ...base }
  Object.keys(override || {}).forEach((key) => {
    const baseValue = result[key]
    const overrideValue = override[key]
    if (isObject(baseValue) && isObject(overrideValue)) {
      result[key] = mergeDeep(baseValue, overrideValue)
    } else {
      result[key] = overrideValue
    }
  })
  return result
}

let runtimeConfig = defaultConfig

export async function loadClientConfig() {
  try {
    const response = await fetch(`./config.yml?t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) {
      runtimeConfig = defaultConfig
      return runtimeConfig
    }
    const text = await response.text()
    const parsed = YAML.parse(text) || {}
    runtimeConfig = mergeDeep(defaultConfig, parsed)
  } catch (error) {
    runtimeConfig = defaultConfig
    console.error('[client-config] load failed:', error)
  }
  return runtimeConfig
}

export function getClientConfig() {
  return runtimeConfig
}
