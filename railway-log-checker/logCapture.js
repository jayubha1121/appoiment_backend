// railway-log-checker/logCapture.js
//
// The engine. Patches console.* so every call is still printed normally
// (Railway keeps seeing it) AND captured into an in-memory ring buffer +
// a file, and emits a 'log' event that the SSE route streams live.
//
// Must be imported first in your entry file so it patches console before
// anything else logs.

import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import { EventEmitter } from 'node:events';

const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs');
const RUNTIME_LOG_FILE = path.join(LOG_DIR, 'runtime.log');
const BUILD_LOG_FILE = path.join(LOG_DIR, 'build.log');
const BUILD_FILES = {
  backend: BUILD_LOG_FILE,
  admin: path.join(LOG_DIR, 'build-admin.log'),
};
const LEVELS = ['log', 'info', 'warn', 'error', 'debug'];
const ANSI_RE = /\x1b\[[0-9;]*m/g;
const MAX_BUFFER_LINES = 2000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

fs.mkdirSync(LOG_DIR, { recursive: true });
try {
  if (fs.statSync(RUNTIME_LOG_FILE).size > MAX_FILE_BYTES) {
    fs.truncateSync(RUNTIME_LOG_FILE, 0);
  }
} catch {
  // file doesn't exist yet - fine
}

class LogCapture extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
    this.buffer = [];
    this.original = {};
    this._patchConsole();
    this._watchFatalErrors();
  }

  _patchConsole() {
    ['log', 'info', 'warn', 'error', 'debug'].forEach((level) => {
      this.original[level] = console[level].bind(console);
      console[level] = (...args) => {
        this.original[level](...args);
        this._capture(level, args);
      };
    });
  }

  _watchFatalErrors() {
    process.on('uncaughtExceptionMonitor', (err, origin) => {
      const text = `Fatal (${origin}): ${(err && err.stack) || err}`;
      this._capture('error', [text], true);
    });
  }

  _capture(level, args, sync = false) {
    this._record(
      {
        timestamp: new Date().toISOString(),
        level,
        source: 'backend',
        message: util.format(...args).replace(ANSI_RE, ''),
      },
      sync,
    );
  }

  _record(entry, sync = false) {
    this.buffer.push(entry);
    if (this.buffer.length > MAX_BUFFER_LINES) this.buffer.shift();

    const line = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.source}] ${entry.message}\n`;
    try {
      if (sync) fs.appendFileSync(RUNTIME_LOG_FILE, line);
      else fs.appendFile(RUNTIME_LOG_FILE, line, () => {});
    } catch {
      // never let logging break the app
    }

    this.emit('log', entry);
  }

  ingest(entries, source) {
    if (!Array.isArray(entries)) return 0;
    let accepted = 0;
    for (const e of entries.slice(0, 200)) {
      if (!e || typeof e.message !== 'string') continue;
      const ts = new Date(e.timestamp);
      this._record({
        timestamp: Number.isNaN(ts.getTime()) ? new Date().toISOString() : ts.toISOString(),
        level: LEVELS.includes(e.level) ? e.level : 'log',
        source,
        message: e.message.replace(ANSI_RE, '').slice(0, 10000),
      });
      accepted += 1;
    }
    return accepted;
  }

  getRuntimeLogs() {
    return this.buffer.slice();
  }

  setBuildLog(source, text) {
    const file = BUILD_FILES[source];
    if (!file) return false;
    fs.writeFileSync(file, String(text).slice(0, 5 * 1024 * 1024));
    return true;
  }

  getBuildLogs(source = 'backend') {
    const file = BUILD_FILES[source] || BUILD_LOG_FILE;
    try {
      if (fs.existsSync(file)) return fs.readFileSync(file, 'utf-8');
      return (
        '(No build log found.\n' +
        'Make sure railway.json writes the build output to logs/build.log - see README.md)'
      );
    } catch (err) {
      return `Error reading build log: ${err.message}`;
    }
  }
}

const existing = globalThis.__railwayLogCapture;
const instance = existing ?? new LogCapture();
globalThis.__railwayLogCapture = instance;

export default instance;
