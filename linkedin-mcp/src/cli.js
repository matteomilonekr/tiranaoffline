#!/usr/bin/env node
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { realpathSync } from 'node:fs';
import http from 'node:http';
import readline from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { buildAuthorizationUrl, exchangeCode } from './auth.js';
import { loadDotEnv } from './config.js';
import { LinkedInClient } from './linkedin.js';
import { createContext, publishDraft } from './server.js';

const HELP = `Uso: npm run <comando>   (oppure: node src/cli.js <comando>)

  auth [--manual]   Collega il tuo account LinkedIn (OAuth) e salva il token
  status            Account collegato, scadenza del token e bozze programmate
  logout            Cancella il token salvato
  publish-due       Pubblica le bozze programmate già scadute (da lanciare con cron)
`;

const formatDate = (value) =>
  new Date(value).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' });

export function parseCallback(url, expectedState) {
  const error = url.searchParams.get('error');
  if (error) throw new Error(`LinkedIn ha negato l'autorizzazione: ${url.searchParams.get('error_description') || error}`);
  if (url.searchParams.get('state') !== expectedState) throw new Error('Parametro "state" non valido: rilancia npm run auth.');
  const code = url.searchParams.get('code');
  if (!code) throw new Error('LinkedIn non ha restituito il codice di autorizzazione.');
  return code;
}

function openBrowser(url) {
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
        : ['xdg-open', [url]];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    // The URL is printed anyway.
  }
}

const escapeHtml = (text) => text.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);

function codeFromCallback(authUrl, redirectUri, state) {
  const redirect = new URL(redirectUri);
  if (!['localhost', '127.0.0.1'].includes(redirect.hostname)) {
    throw new Error(`Il redirect ${redirectUri} non è locale: usa "npm run auth -- --manual".`);
  }
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, redirectUri);
      if (url.pathname !== redirect.pathname) {
        res.writeHead(404).end();
        return;
      }
      let code;
      let failure;
      try {
        code = parseCallback(url, state);
      } catch (err) {
        failure = err;
      }
      const message = failure ? `❌ ${escapeHtml(failure.message)}` : '✅ LinkedIn collegato. Puoi chiudere questa scheda.';
      res.on('finish', () => {
        clearTimeout(timer);
        server.close();
        server.closeAllConnections();
        failure ? reject(failure) : resolve(code);
      });
      res
        .writeHead(failure ? 400 : 200, { 'Content-Type': 'text/html; charset=utf-8' })
        .end(`<!doctype html><meta charset="utf-8"><title>linkedin-mcp</title><body style="font:18px system-ui;padding:48px">${message}</body>`);
    });
    const timer = setTimeout(() => {
      server.close();
      reject(new Error('Nessuna risposta da LinkedIn entro 5 minuti.'));
    }, 5 * 60_000);
    server.on('error', (err) => {
      clearTimeout(timer);
      reject(err.code === 'EADDRINUSE' ? new Error(`La porta ${redirect.port} è occupata: cambia LINKEDIN_REDIRECT_URI.`) : err);
    });
    server.listen(Number(redirect.port) || 80, redirect.hostname, () => {
      console.log(`Apri questo link e autorizza l'app (provo ad aprirlo io):\n\n${authUrl}\n`);
      openBrowser(authUrl);
    });
  });
}

async function codeFromPaste(authUrl, state) {
  console.log(`1. Apri questo link e autorizza l'app:\n\n${authUrl}\n`);
  console.log("2. LinkedIn ti rimanda a un indirizzo (anche se la pagina non si carica): copialo dalla barra degli indirizzi.\n");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return parseCallback(new URL((await rl.question('Incolla qui l\'indirizzo completo: ')).trim()), state);
  } finally {
    rl.close();
  }
}

async function auth(ctx, manual) {
  const { clientId, clientSecret, redirectUri, scopes } = ctx.config;
  if (!clientId || !clientSecret) {
    console.error('Mancano LINKEDIN_CLIENT_ID e LINKEDIN_CLIENT_SECRET: copia .env.example in .env e compilali (vedi README).');
    return 1;
  }
  const state = crypto.randomBytes(16).toString('hex');
  const authUrl = buildAuthorizationUrl({ clientId, redirectUri, scopes, state });
  const code = manual ? await codeFromPaste(authUrl, state) : await codeFromCallback(authUrl, redirectUri, state);
  const token = await exchangeCode({ code, clientId, clientSecret, redirectUri }, ctx.fetchImpl);

  // Ask LinkedIn who just connected, using the new token even if LINKEDIN_ACCESS_TOKEN is set.
  const client = new LinkedInClient({
    tokenProvider: { getToken: async () => token },
    apiVersion: ctx.config.apiVersion,
    fetchImpl: ctx.fetchImpl,
  });
  let profile = null;
  try {
    profile = await client.getUserInfo();
  } catch (err) {
    console.warn(`⚠️  Profilo non letto (${err.message}). Imposta LINKEDIN_AUTHOR_URN se la pubblicazione non trova l'autore.`);
  }
  await ctx.store.write('token', {
    ...token,
    profile: profile ? { name: profile.name || null, email: profile.email || null, sub: profile.sub } : null,
    personUrn: profile?.sub ? `urn:li:person:${profile.sub}` : null,
  });

  console.log(`\n✅ Collegato${profile?.name ? ` come ${profile.name}` : ''}.`);
  if (token.expiresAt) console.log(`   Token valido fino al ${formatDate(token.expiresAt)}.`);
  console.log(`   Permessi: ${token.scope || 'non indicati'}`);
  console.log(`   Salvato in ${ctx.store.file('token')}`);
  if (token.scope && !token.scope.includes('w_member_social')) {
    console.warn('⚠️  Manca w_member_social: aggiungi il prodotto "Share on LinkedIn" all\'app e rifai npm run auth.');
  }
  if (ctx.config.accessToken) {
    console.warn('⚠️  LINKEDIN_ACCESS_TOKEN è impostato e ha la precedenza sul token appena salvato.');
  }
  return 0;
}

async function status(ctx) {
  try {
    const token = await ctx.tokenProvider.getToken();
    const name = token.profile?.name || 'account collegato';
    console.log(`Account: ${name}${token.personUrn ? ` (${token.personUrn})` : ''}`);
    if (token.expiresAt) {
      const days = Math.floor((token.expiresAt - Date.now()) / 86_400_000);
      console.log(`Token:   scade il ${formatDate(token.expiresAt)} (tra ${days} giorni)`);
    } else {
      console.log(`Token:   da ${token.source === 'env' ? 'LINKEDIN_ACCESS_TOKEN' : 'file'}, scadenza non nota`);
    }
    if (token.scope) console.log(`Permessi: ${token.scope}`);
  } catch (err) {
    console.log(`Non collegato. ${err.message}`);
  }
  const drafts = await ctx.drafts.list();
  const scheduled = drafts.filter((draft) => draft.scheduledFor);
  console.log(`Bozze:   ${drafts.length} (${scheduled.length} programmate)`);
  for (const draft of scheduled) {
    console.log(`  ${formatDate(draft.scheduledFor)}  ${draft.id}  ${draft.title || (draft.post.text || '').slice(0, 60)}`);
  }
  console.log(`Dati:    ${ctx.config.dataDir} · API LinkedIn ${ctx.config.apiVersion}`);
  return 0;
}

async function publishDue(ctx) {
  const due = await ctx.drafts.due();
  if (!due.length) {
    console.log('Nessuna bozza da pubblicare.');
    return 0;
  }
  let failures = 0;
  for (const draft of due) {
    try {
      const result = await publishDraft(ctx, draft.id);
      console.log(`✅ ${draft.id} pubblicata: ${result.url}`);
      if (result.firstComment && !result.firstComment.ok) {
        console.log(`   ⚠️  primo commento non pubblicato: ${result.firstComment.error}`);
      }
    } catch (err) {
      failures++;
      console.error(`❌ ${draft.id}: ${err.message}`);
    }
  }
  return failures ? 1 : 0;
}

export async function main(argv, ctx = createContext()) {
  const [command, ...rest] = argv;
  switch (command) {
    case 'auth':
      return auth(ctx, rest.includes('--manual'));
    case 'status':
      return status(ctx);
    case 'logout':
      await ctx.store.remove('token');
      console.log('Token rimosso.');
      return 0;
    case 'publish-due':
      return publishDue(ctx);
    default:
      console.log(HELP);
      return command && !['help', '--help', '-h'].includes(command) ? 1 : 0;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  loadDotEnv();
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`❌ ${err.message}`);
      process.exit(1);
    });
}
