// railway-log-checker/router.js
//
// One Express router replacing the three Next.js route files + page:
//   GET /railway-log-checker/            -> dashboard (HTML shell, no data)
//   GET /railway-log-checker/api/build   -> build log (text)
//   GET /railway-log-checker/api/runtime -> runtime snapshot (JSON)
//   GET /railway-log-checker/api/stream  -> live runtime logs (SSE)
// Everything under /api needs the token.

import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import logCapture from './logCapture.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function requireToken(req, res, next) {
  const expected = process.env.LOG_ACCESS_TOKEN;
  if (!expected) {
    return res.status(500).json({ error: 'LOG_ACCESS_TOKEN not set on server' });
  }
  const given = req.get('x-log-token') || req.query.token;
  if (typeof given !== 'string' || !given || !safeEqual(given, expected)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

router.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex',
  });
  next();
});

router.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

function ingestKey() {
  const t = process.env.LOG_ACCESS_TOKEN;
  return t ? crypto.createHmac('sha256', t).update('log-ingest').digest('hex') : null;
}

function requireIngestKey(req, res, next) {
  const expected = ingestKey();
  if (!expected) return res.status(500).json({ error: 'LOG_ACCESS_TOKEN not set on server' });
  const given = req.get('x-ingest-key');
  if (typeof given !== 'string' || !given || !safeEqual(given, expected)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

router.post('/ingest/logs', requireIngestKey, express.json({ limit: '1mb' }), (req, res) => {
  const accepted = logCapture.ingest(req.body && req.body.entries, 'admin');
  res.json({ accepted });
});

router.post('/ingest/build', requireIngestKey, express.text({ type: '/', limit: '5mb' }), (req, res) => {
  const ok = logCapture.setBuildLog('admin', typeof req.body === 'string' ? req.body : '');
  res.json({ ok });
});

router.use('/api', requireToken);

router.get('/api/build', (req, res) => {
  const source = req.query.source === 'admin' ? 'admin' : 'backend';
  res.type('text/plain').send(logCapture.getBuildLogs(source));
});

router.get('/api/runtime', (_req, res) => {
  res.json(logCapture.getRuntimeLogs());
});

router.get('/api/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const send = (entry) => res.write(`data: ${JSON.stringify(entry)}\n\n`);

  logCapture.getRuntimeLogs().forEach(send);
  logCapture.on('log', send);

  const ping = setInterval(() => res.write(':ping\n\n'), 20000);

  req.on('close', () => {
    clearInterval(ping);
    logCapture.off('log', send);
  });
});

export default router;