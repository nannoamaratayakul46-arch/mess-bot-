"use strict";

/**
 * Read every dashboard group's settings and saved Banat target in one query.
 * The previous per-group getters could issue up to four queries per group
 * (including insert-and-reread for new groups), exhausting the small Neon pool
 * during dashboard refreshes.
 */
async function loadDashboardGroupSettings(db, threadIds) {
  const ids = [...new Set((Array.isArray(threadIds) ? threadIds : [])
    .map(id => String(id || "").trim())
    .filter(Boolean))];
  if (!ids.length) return new Map();

  const { rows } = await db.query(
    `SELECT requested.thread_id,
            COALESCE(settings.bot_enabled, TRUE) AS bot_enabled,
            COALESCE(settings.roast_enabled, TRUE) AS roast_enabled,
            COALESCE(settings.slash_pool_enabled, FALSE) AS slash_pool_enabled,
            COALESCE(settings.fun_enabled, TRUE) AS fun_enabled,
            target.target_user_id,
            target.target_name,
            target.bang_enabled,
            target.jaiden_interval_seconds,
            target.jaiden_cooldown_mode,
            target.jaiden_reply_mode,
            target.jaiden_typing_enabled,
            target.updated_at AS target_updated_at
       FROM unnest($1::text[]) AS requested(thread_id)
       LEFT JOIN thread_settings AS settings
         ON settings.thread_id = requested.thread_id
       LEFT JOIN banat_thread_targets AS target
         ON target.thread_id = requested.thread_id`,
    [ids]
  );

  const result = new Map();
  for (const row of rows || []) {
    const hasTarget = Boolean(row.target_user_id);
    result.set(String(row.thread_id), {
      settings: {
        bot_enabled: row.bot_enabled !== false,
        roast_enabled: row.roast_enabled === true,
        slash_pool_enabled: row.slash_pool_enabled === true,
        fun_enabled: row.fun_enabled === true,
      },
      target: hasTarget ? {
        target_user_id: row.target_user_id,
        target_name: row.target_name || null,
        bang_enabled: row.bang_enabled === true,
        jaiden_interval_seconds: Number(row.jaiden_interval_seconds) || 3,
        jaiden_cooldown_mode: row.jaiden_cooldown_mode || "extend",
        jaiden_reply_mode: row.jaiden_reply_mode || "always",
        jaiden_typing_enabled: row.jaiden_typing_enabled !== false,
        updated_at: row.target_updated_at,
      } : null,
    });
  }
  return result;
}

module.exports = { loadDashboardGroupSettings };
