const GMAIL_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

function tokenIsUsable(credentials, now = Date.now()) {
  return Boolean(credentials?.accessToken)
    && (!Number.isFinite(credentials.expiresAt) || credentials.expiresAt > now + 60_000);
}

async function refreshGmailAccessToken({ refreshToken, clientId, clientSecret, fetchImpl = fetch }) {
  if (!refreshToken) throw new Error('A Gmail OAuth refresh token is required.');
  if (!clientId || !clientSecret) throw new Error('Gmail OAuth client credentials are not configured.');
  const response = await fetchImpl(GMAIL_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok || !body.access_token) {
    const detail = body.error_description || body.error || ('HTTP ' + response.status);
    throw new Error('Gmail OAuth refresh failed: ' + detail);
  }
  return {
    accessToken: body.access_token,
    // Google may omit expires_in for unusual providers; use a conservative
    // short lifetime rather than treating an unknown token as permanent.
    expiresAt: Date.now() + (Number(body.expires_in) > 0 ? Number(body.expires_in) * 1000 : 3_000_000),
  };
}

module.exports = { GMAIL_TOKEN_ENDPOINT, tokenIsUsable, refreshGmailAccessToken };
