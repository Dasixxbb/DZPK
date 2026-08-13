function formatTimestamp(date) {
  const pad = (n) => n.toString().padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  const ms = date.getMilliseconds().toString().padStart(3, '0');
  return `${y}-${m}-${d} ${h}:${min}:${s}.${ms}`;
}

function log(level, msg, data) {
  const timestamp = formatTimestamp(new Date());
  let output = `[${timestamp}] [${level.toUpperCase()}] ${msg}`;
  if (data !== undefined) {
    try {
      output += ` ${JSON.stringify(data)}`;
    } catch (e) {
      output += ` [Unserializable data: ${e.message}]`;
    }
  }
  console.log(output);
}

const logger = {
  info(msg, data) {
    log('info', msg, data);
  },
  warn(msg, data) {
    log('warn', msg, data);
  },
  error(msg, data) {
    log('error', msg, data);
  },
  debug(msg, data) {
    log('debug', msg, data);
  }
};

module.exports = logger;
