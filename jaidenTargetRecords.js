"use strict";

let tableReady = null;

async function ensureTable(db) {
  if (!tableReady) {
    tableReady = db.query(`
      CREATE TABLE IF NOT EXISTS jaiden_target_encounters (
        id BIGSERIAL PRIMARY KEY,
        thread_id TEXT NOT NULL,
        thread_name TEXT NOT NULL DEFAULT '',
        target_user_id TEXT NOT NULL,
        target_name TEXT NOT NULL DEFAULT '',
        result TEXT NOT NULL CHECK (result IN ('WIN','LOSE')),
        reason TEXT NOT NULL DEFAULT '',
        started_at BIGINT NOT NULL,
        ended_at BIGINT NOT NULL,
        duration_seconds BIGINT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (thread_id, target_user_id, started_at)
      )
    `).catch(error => { tableReady = null; throw error; });
  }
  await tableReady;
}

async function recordEncounter(db, input = {}) {
  await ensureTable(db);
  const threadId = String(input.threadId || '').trim();
  const targetId = String(input.targetId || '').trim();
  const startedAt = Number(input.startedAt);
  const endedAt = Number(input.endedAt);
  const result = input.result === 'LOSE' ? 'LOSE' : 'WIN';
  if (!threadId || !targetId || !Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) {
    throw new Error('A valid Jaiden encounter identity and timestamp range is required.');
  }
  const durationSeconds = Math.max(0, Math.floor((endedAt - startedAt) / 1000));
  await db.query(`
    INSERT INTO jaiden_target_encounters
      (thread_id, thread_name, target_user_id, target_name, result, reason, started_at, ended_at, duration_seconds)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (thread_id, target_user_id, started_at) DO NOTHING
  `, [threadId, String(input.threadName || threadId).slice(0, 200), targetId,
    String(input.targetName || 'UNKNOWN TARGET').slice(0, 120), result,
    String(input.reason || '').slice(0, 2000), startedAt, endedAt, durationSeconds]);
}

function registerRoutes(app, auth) {
  app.get('/api/dashboard/jaiden-target-countdown/records', auth, async (req, res) => {
    try {
      await ensureTable(req.app.locals.db || require('./db'));
      const db = req.app.locals.db || require('./db');
      const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 30));
      const { rows } = await db.query(`
        SELECT id, thread_id, thread_name, target_user_id, target_name, result, reason,
               started_at, ended_at, duration_seconds, created_at
        FROM jaiden_target_encounters
        ORDER BY ended_at DESC, id DESC
        LIMIT $1
      `, [limit]);
      const totals = await db.query(`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE result='WIN')::int AS wins,
               COUNT(*) FILTER (WHERE result='LOSE')::int AS losses,
               COUNT(DISTINCT target_user_id)::int AS unique_targets,
               COALESCE(SUM(duration_seconds),0)::bigint AS total_duration_seconds,
               COALESCE(AVG(duration_seconds),0)::numeric(12,1) AS average_duration_seconds,
               COALESCE(MAX(duration_seconds),0)::bigint AS longest_duration_seconds
        FROM jaiden_target_encounters
      `);
      return res.json({ ok: true, records: rows, stats: totals.rows[0] || {} });
    } catch (error) {
      console.error('[JAIDEN RECORDS] Could not load encounter history:', error?.message || error);
      return res.status(500).json({ ok: false, error: 'Could not load Jaiden encounter records.' });
    }
  });
  app.delete('/api/dashboard/jaiden-target-countdown/records/losses', auth, async (req, res) => {
    const db = req.app.locals.db || require('./db');
    try {
      await ensureTable(db);
      const result = await db.query("DELETE FROM jaiden_target_encounters WHERE result = 'LOSE'");
      return res.json({ ok: true, deleted: result.rowCount || 0 });
    } catch (error) {
      console.error('[JAIDEN RECORDS] Could not clear loss history:', error?.message || error);
      return res.status(500).json({ ok: false, error: 'Could not clear Jaiden loss history.' });
    }
  });

}

module.exports = { ensureTable, recordEncounter, registerRoutes };
