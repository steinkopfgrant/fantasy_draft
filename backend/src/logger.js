// backend/src/logger.js
const { Logtail } = require("@logtail/node");

const logtail = new Logtail(process.env.BETTERSTACK_SOURCE_TOKEN || "AtZCSdxjUpRYY76SwCbHUXcT");

// Store original console methods
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

// Override console.log → sends to BetterStack + still prints locally
console.log = (...args) => {
  originalLog.apply(console, args);
  const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  logtail.info(message).catch(() => {});
};

// Override console.error → sends as error level
console.error = (...args) => {
  originalError.apply(console, args);
  const message = args.map(a => {
    if (a instanceof Error) return `${a.message}\n${a.stack}`;
    if (typeof a === 'object') return JSON.stringify(a);
    return String(a);
  }).join(' ');
  logtail.error(message).catch(() => {});
};

// Override console.warn → sends as warn level
console.warn = (...args) => {
  originalWarn.apply(console, args);
  const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  logtail.warn(message).catch(() => {});
};

// Flush logs on shutdown
const flushLogs = async () => {
  try {
    await logtail.flush();
  } catch (e) {
    originalError('Failed to flush logs:', e);
  }
};

module.exports = { logtail, flushLogs };