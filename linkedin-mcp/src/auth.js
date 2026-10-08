import { OAUTH_BASE } from './config.js';

export class AuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthError';
  }
}

const REAUTH_HINT =
  'Run `npm run auth` inside the linkedin-mcp folder (or set LINKEDIN_ACCESS_TOKEN) and restart the MCP server.';

export function buildAuthorizationUrl({ clientId, redirectUri, scopes, state }) {
  const url = new URL(`${OAUTH_BASE}/authorization`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', scopes.join(' '));
  return url.toString();
}

export function toTokenRecord(data, now = Date.now()) {
  return {
    accessToken: data.access_token,
    expiresAt: data.expires_in ? now + data.expires_in * 1000 : null,
    refreshToken: data.refresh_token || null,
    refreshTokenExpiresAt: data.refresh_token_expires_in ? now + data.refresh_token_expires_in * 1000 : null,
    scope: data.scope || null,
    obtainedAt: now,
  };
}

async function tokenRequest(params, fetchImpl) {
  const res = await fetchImpl(`${OAUTH_BASE}/accessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const reason = data.error_description || data.error || 'unknown error';
    throw new AuthError(`LinkedIn token request failed (${res.status}): ${reason}`);
  }
  return toTokenRecord(data);
}

export function exchangeCode({ code, clientId, clientSecret, redirectUri }, fetchImpl = fetch) {
  return tokenRequest(
    {
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    },
    fetchImpl,
  );
}

// LinkedIn issues refresh tokens only to apps approved for programmatic
// refresh; everyone else re-runs the OAuth flow every 60 days.
export function refreshAccessToken({ refreshToken, clientId, clientSecret }, fetchImpl = fetch) {
  return tokenRequest(
    {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    },
    fetchImpl,
  );
}

/** Resolves the access token from LINKEDIN_ACCESS_TOKEN or the saved token file. */
export class TokenProvider {
  constructor({ config, store, fetchImpl = fetch, now = () => Date.now() }) {
    this.config = config;
    this.store = store;
    this.fetch = fetchImpl;
    this.now = now;
  }

  async getToken() {
    if (this.config.accessToken) {
      return { accessToken: this.config.accessToken, source: 'env' };
    }
    const record = await this.store.read('token', null);
    if (!record?.accessToken) {
      throw new AuthError(`LinkedIn is not connected yet. ${REAUTH_HINT}`);
    }
    if (record.expiresAt && record.expiresAt - 60_000 <= this.now()) {
      return this.refresh(record);
    }
    return { ...record, source: 'file' };
  }

  async refresh(record) {
    const { clientId, clientSecret } = this.config;
    const refreshUsable =
      record.refreshToken && (!record.refreshTokenExpiresAt || record.refreshTokenExpiresAt > this.now());
    if (!refreshUsable || !clientId || !clientSecret) {
      const when = new Date(record.expiresAt).toISOString();
      throw new AuthError(`The LinkedIn access token expired on ${when}. ${REAUTH_HINT}`);
    }
    const fresh = await refreshAccessToken({ refreshToken: record.refreshToken, clientId, clientSecret }, this.fetch);
    const merged = {
      ...record,
      ...fresh,
      refreshToken: fresh.refreshToken || record.refreshToken,
      refreshTokenExpiresAt: fresh.refreshTokenExpiresAt || record.refreshTokenExpiresAt,
    };
    await this.store.write('token', merged);
    return { ...merged, source: 'file' };
  }
}
