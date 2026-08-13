const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const DEFAULT_CONFIG = {
  server: {
    port: 3000
  },
  rooms: {
    totalRooms: 10
  },
  player: {
    defaultScore: 500,
    maxNicknameLength: 20
  },
  heartbeat: {
    timeoutMs: 60000
  },
  timeouts: {
    actionMs: 120000,
    smallBlindDeclareMs: 120000,
    showdownSelectMs: 120000,
    reconnectGraceMs: 20000
  }
};

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function mergeDeep(base, override) {
  const result = { ...base };
  for (const key of Object.keys(override || {})) {
    const baseValue = result[key];
    const overrideValue = override[key];
    if (isObject(baseValue) && isObject(overrideValue)) {
      result[key] = mergeDeep(baseValue, overrideValue);
    } else {
      result[key] = overrideValue;
    }
  }
  return result;
}

function loadConfig() {
  const configPath = path.resolve(__dirname, '..', 'config.yml');
  if (!fs.existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = YAML.parse(raw) || {};
  return mergeDeep(DEFAULT_CONFIG, parsed);
}

const config = loadConfig();

module.exports = config;
