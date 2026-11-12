'use strict';

// Dashboard LiveChat: records messages only while a dashboard chat is open.
const { sendGroupMessage } = require('./messengerApiCompat');
// History is in-memory, bounded, and cleared when the last open client closes.
function createLiveChat({ getApi, log = console.log, maxPerThread = 100, idlePollMs = 5000 } = {}) {
  const threads = new Map();
  const clientCounts = new Map();
  const lastSendAt = new Map();
  const subscriptionExpiry = new Map();
  const SUBSCRIPTION_LEASE_MS = 30000;
  const MAX_TEXT = 2000;
  const SEND_GAP_MS = 1200;
  const MAX_THREADS = 30;

  const cleanId = value => String(value || '').trim().slice(0, 128);
  const cleanText = value => String(value || '').replace(/\u0000/g, '').trim().slice(0, MAX_TEXT);

  function threadState(threadID) {
    let state = threads.get(threadID);
    if (!state) {
      state = { seq: 0, messages: [] };
      threads.set(threadID, state);
      while (threads.size > MAX_THREADS) threads.delete(threads.keys().next().value);
    }
    return state;
  }

  function isOpen(threadID) {
    const expiresAt = subscriptionExpiry.get(threadID) || 0;
    if (expiresAt <= Date.now()) {
      clientCounts.delete(threadID);
      subscriptionExpiry.delete(threadID);
      threads.delete(threadID);
      lastSendAt.delete(threadID);
      return false;
    }
    return (clientCounts.get(threadID) || 0) > 0;
  }

  function renewLease(threadID) {
    if ((clientCounts.get(threadID) || 0) > 0) subscriptionExpiry.set(threadID, Date.now() + SUBSCRIPTION_LEASE_MS);
  }

  function record(event) {
    if (!event || !['message', 'message_reply'].includes(event.type)) return;
    const threadID = cleanId(event.threadID);
    if (!threadID || !isOpen(threadID)) return;
    const text = cleanText(event.body);
    const attachments = Array.isArray(event.attachments) ? event.attachments.slice(0, 8).map(a => ({
      type: cleanText(a && (a.type || a.attachmentType) || 'attachment').slice(0, 40)
    })) : [];
    if (!text && !attachments.length) return;
    const state = threadState(threadID);
    const senderID = cleanId(event.senderID);
    const api = typeof getApi === 'function' ? getApi() : null;
    let ownId = '';
    try { ownId = api && typeof api.getCurrentUserID === 'function' ? cleanId(api.getCurrentUserID()) : ''; } catch (_) {}
    const messageID = cleanId(event.messageID);
    const replyTo = cleanId(event.messageReply && (event.messageReply.messageID || event.messageReply.messageId));
    state.messages.push({
      seq: ++state.seq,
      message_id: messageID || null,
      sender_id: senderID || null,
      text,
      attachments,
      reply_to: replyTo || null,
      own: Boolean(ownId && senderID === ownId),
      at: Number(event.timestamp) > 0 ? Number(event.timestamp) : Date.now()
    });
    if (state.messages.length > maxPerThread) state.messages.splice(0, state.messages.length - maxPerThread);
  }

  function recordOwn(threadID, text, messageID = '') {
    const id = cleanId(threadID);
    if (!id || !isOpen(id)) return;
    const state = threadState(id);
    state.messages.push({ seq: ++state.seq, message_id: cleanId(messageID) || null, sender_id: 'dashboard', text: cleanText(text), attachments: [], reply_to: null, own: true, at: Date.now() });
    if (state.messages.length > maxPerThread) state.messages.splice(0, state.messages.length - maxPerThread);
  }

  function registerRoutes(app, requireDashboardAccess) {
    const auth = requireDashboardAccess;

    // Authenticated, read-only runtime diagnostics. Never expose message contents.
    app.get('/api/dashboard/livechat/stats', auth, (_req, res) => {
      const memory = process.memoryUsage();
      let activeThreads = 0;
      let bufferedMessages = 0;
      for (const [id, state] of threads) {
        if (isOpen(id)) activeThreads += 1;
        bufferedMessages += Array.isArray(state.messages) ? state.messages.length : 0;
      }
      return res.json({
        ok: true,
        active_threads: activeThreads,
        buffered_messages: bufferedMessages,
        max_threads: MAX_THREADS,
        max_messages_per_thread: maxPerThread,
        rss_mb: Number((memory.rss / 1048576).toFixed(2)),
        heap_used_mb: Number((memory.heapUsed / 1048576).toFixed(2)),
        heap_total_mb: Number((memory.heapTotal / 1048576).toFixed(2)),
        checked_at: new Date().toISOString()
      });
    });
    app.post('/api/dashboard/groups/:threadId/chat/open', auth, (req, res) => {
      const id = cleanId(req.params.threadId);
      if (!id) return res.status(400).json({ ok: false, error: 'Invalid group ID.' });
      if (!isOpen(id)) clientCounts.set(id, 0);
      clientCounts.set(id, (clientCounts.get(id) || 0) + 1);
      subscriptionExpiry.set(id, Date.now() + SUBSCRIPTION_LEASE_MS);
      threadState(id);
      return res.json({ ok: true, idle_poll_ms: idlePollMs, active: true });
    });

    app.post('/api/dashboard/groups/:threadId/chat/close', auth, (req, res) => {
      const id = cleanId(req.params.threadId);
      if (!id) return res.status(400).json({ ok: false, error: 'Invalid group ID.' });
      isOpen(id);
      const count = Math.max(0, (clientCounts.get(id) || 0) - 1);
      if (count) clientCounts.set(id, count);
      else {
        clientCounts.delete(id);
        subscriptionExpiry.delete(id);
        threads.delete(id);
        lastSendAt.delete(id);
      }
      return res.json({ ok: true, active: count > 0, cleared: count === 0 });
    });

    app.get('/api/dashboard/groups/:threadId/chat', auth, (req, res) => {
      const id = cleanId(req.params.threadId);
      if (!isOpen(id)) return res.status(409).json({ ok: false, error: 'Open the chat before polling.' });
      renewLease(id);
      const after = Math.max(0, Number.parseInt(String(req.query.after || '0'), 10) || 0);
      const state = threadState(id);
      return res.json({ ok: true, active: true, idle_poll_ms: idlePollMs, latest_seq: state.seq, messages: state.messages.filter(m => m.seq > after) });
    });

    app.post('/api/dashboard/groups/:threadId/chat/send', auth, async (req, res) => {
      const id = cleanId(req.params.threadId);
      const text = cleanText(req.body && req.body.text);
      if (!isOpen(id)) return res.status(409).json({ ok: false, error: 'Open the chat before sending.' });
      if (!text) return res.status(400).json({ ok: false, error: 'Message cannot be empty.' });
      const now = Date.now();
      const previous = lastSendAt.get(id) || 0;
      if (now - previous < SEND_GAP_MS) return res.status(429).json({ ok: false, error: 'Please wait a moment before sending another message.' });
      lastSendAt.set(id, now);
      const api = typeof getApi === 'function' ? getApi() : null;
      if (!api || typeof api.sendMessage !== 'function') return res.status(503).json({ ok: false, error: 'Messenger is not connected.' });
      try {
        const result = await sendGroupMessage(api, text, id);
        recordOwn(id, text, result && (result.messageID || result.messageId) || '');
        return res.json({ ok: true, message: text, message_id: result && (result.messageID || result.messageId) || null });
      } catch (error) {
        log('[LIVE CHAT] Send failed:', error && error.message || error);
        return res.status(502).json({ ok: false, error: 'Messenger could not send that message.' });
      }
    });

    app.delete('/api/dashboard/groups/:threadId/chat', auth, (req, res) => {
      const id = cleanId(req.params.threadId);
      const state = threads.get(id);
      if (state) { state.messages = []; state.seq = 0; }
      return res.json({ ok: true, cleared: true });
    });
  }

  return { registerRoutes, record, recordOwn, isOpen };
}

module.exports = { createLiveChat };
