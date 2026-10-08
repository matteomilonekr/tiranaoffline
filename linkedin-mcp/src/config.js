import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// LinkedIn supports each monthly API version for at least one year.
// Override with LINKEDIN_API_VERSION (YYYYMM) when this one gets sunset.
export const DEFAULT_API_VERSION = '202609';
export const API_BASE = 'https://api.linkedin.com';
export const OAUTH_BASE = 'https://www.linkedin.com/oauth/v2';
export const DEFAULT_SCOPES = ['openid', 'profile', 'w_member_social'];
export const DEFAULT_REDIRECT_URI = 'http://localhost:8765/callback';

export const LIMITS = {
  commentary: 3000,
  comment: 1250,
  altText: 4086,
  pollQuestion: 140,
  pollOption: 30,
  minPollOptions: 2,
  maxPollOptions: 4,
  maxImages: 20,
};

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Loads linkedin-mcp/.env (if present) without overriding variables already set. */
export function loadDotEnv(file = path.join(PACKAGE_ROOT, '.env')) {
  try {
    process.loadEnvFile(file);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

export function getConfig(env = process.env) {
  return {
    apiVersion: env.LINKEDIN_API_VERSION || DEFAULT_API_VERSION,
    dataDir: env.LINKEDIN_MCP_HOME || path.join(os.homedir(), '.linkedin-mcp'),
    accessToken: env.LINKEDIN_ACCESS_TOKEN || null,
    authorUrn: env.LINKEDIN_AUTHOR_URN || null,
    clientId: env.LINKEDIN_CLIENT_ID || null,
    clientSecret: env.LINKEDIN_CLIENT_SECRET || null,
    redirectUri: env.LINKEDIN_REDIRECT_URI || DEFAULT_REDIRECT_URI,
    scopes: env.LINKEDIN_SCOPES ? env.LINKEDIN_SCOPES.split(/[\s,]+/).filter(Boolean) : DEFAULT_SCOPES,
  };
}
