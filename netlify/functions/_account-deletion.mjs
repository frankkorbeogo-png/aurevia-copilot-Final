const adminHeaders = key => ({
  apikey: key,
  authorization: `Bearer ${key}`,
  'content-type': 'application/json',
  prefer: 'return=minimal'
});

async function deleteRows(base, key, table, column, userId) {
  const url = `${base}/rest/v1/${table}?${column}=eq.${encodeURIComponent(userId)}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: adminHeaders(key),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw Object.assign(
      new Error(payload?.message || payload?.details || `Nettoyage des données (${table}) impossible.`),
      { statusCode: response.status, table }
    );
  }
}


async function revokeAllAureviaSessions(base, key, userId) {
  const response = await fetch(`${base}/rest/v1/rpc/aurevia_account_revoke_all_sessions`, {
    method: 'POST',
    headers: adminHeaders(key),
    body: JSON.stringify({ p_user_id: userId }),
    signal: AbortSignal.timeout(10000)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw Object.assign(
      new Error(payload?.message || payload?.details || 'La révocation des sessions AUREVIA a échoué.'),
      { statusCode: response.status, code: 'SESSION_REVOCATION_FAILED' }
    );
  }
  return payload === true;
}

// Explicit order keeps cleanup safe even on installations where some legacy
// foreign keys were created without ON DELETE CASCADE. All operations are
// idempotent, so a retry after a partial failure is safe.
export async function deleteUserApplicationData(base, serviceKey, userId) {
  // Shared by self-service and admin deletion: revoke every AUREVIA session
  // before deleting any account data or the Supabase Auth identity.
  await revokeAllAureviaSessions(base, serviceKey, userId);
  const ownedTables = [
    ['announcement_reads', 'user_id'],
    ['announcement_recipients', 'user_id'],
    ['aurevia_analysis_scenarios', 'user_id'],
    ['aurevia_trade_alert_events', 'user_id'],
    ['telegram_connections', 'user_id'],
    ['user_preferences', 'user_id'],
    ['trading_position_closes', 'user_id'],
    ['trading_positions', 'user_id'],
    ['trading_position_groups', 'user_id'],
    ['trading_journal', 'user_id'],
    ['profiles', 'id']
  ];
  for (const [table, column] of ownedTables) {
    await deleteRows(base, serviceKey, table, column, userId);
  }
  return { tables_cleaned: ownedTables.map(([table]) => table) };
}
