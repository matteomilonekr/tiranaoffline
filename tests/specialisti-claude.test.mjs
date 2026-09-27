import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const page = read("public/70-specialisti-claude/index.html");
const tirana = read("public/tirana/index.html");
const vercel = JSON.parse(read("vercel.json"));

const decode = (html) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const categories = [
  ...page.matchAll(
    /<details class="acc cat" data-category="([a-z]+)">\s*<summary><span class="acc__label">([^<]+)<\/span><span class="cat__count">(\d+) Specialisti<\/span>[\s\S]*?<\/details>/g,
  ),
].map(([block, id, label, declared]) => ({
  id,
  name: decode(label),
  declared: Number(declared),
  total: (block.match(/<li data-specialist[ >]/g) ?? []).length,
  starter: (block.match(/<li data-specialist data-starter>/g) ?? []).length,
}));

const planList = (plan) => {
  const list = page.match(new RegExp(`<ul class="checks" data-plan-list="${plan}">([\\s\\S]*?)</ul>`));
  assert.ok(list, `lista del piano ${plan} mancante`);
  return [...list[1].matchAll(/<li>[\s\S]*?<\/svg>([\s\S]*?)<\/li>/g)].map(([, item]) => decode(item));
};

const offerConfig = () => {
  const deadline = page.match(/launchDeadline: '([^']+)'/)?.[1];
  const plans = Object.fromEntries(
    [...page.matchAll(/(starter|completo): \{\s*name: '[^']+',\s*launchPrice: (\d+),\s*regularPrice: (\d+),/g)].map(
      ([, key, launchPrice, regularPrice]) => [key, { launchPrice: Number(launchPrice), regularPrice: Number(regularPrice) }],
    ),
  );
  return { deadline, plans };
};

const staticTexts = (attribute) =>
  [...page.matchAll(new RegExp(`<[a-z]+[^>]*\\b${attribute}[^>]*>([^<]*)<`, "g"))].map(([, text]) => text.trim());

test("la landing 70 Specialisti elenca 70 Specialisti in 8 aree, 30 inclusi nello Starter", () => {
  assert.equal(categories.length, 8, "servono otto aree");
  assert.equal((page.match(/<li data-specialist[ >]/g) ?? []).length, 70);
  assert.equal((page.match(/<li data-specialist data-starter>/g) ?? []).length, 30);
  assert.equal(categories.reduce((sum, category) => sum + category.total, 0), 70);

  const names = [...page.matchAll(/<li data-specialist[^>]*><strong>([^<]+)<\/strong>/g)].map(([, name]) => decode(name));
  assert.equal(new Set(names).size, names.length, "ogni Specialista deve avere un nome unico");
});

test("ogni area dichiara lo stesso numero nell’elenco, nel pacchetto completo e nella griglia", () => {
  const complete = planList("completo");
  for (const category of categories) {
    assert.equal(category.declared, category.total, `${category.name}: conteggio incoerente`);
    assert.ok(
      complete.includes(`${category.total} Specialisti ${category.name}`),
      `${category.name}: riga mancante nel pacchetto completo`,
    );
    assert.ok(
      decode(page).includes(`${category.total}${category.name}`) ||
        page.includes(`<b>${category.total}</b>${category.name.replace(/&/g, "&amp;")}</p>`),
      `${category.name}: box della griglia incoerente`,
    );
  }
});

test("lo Starter elenca per area gli stessi Specialisti marcati Starter", () => {
  const starter = planList("starter");
  assert.ok(starter.includes("30 Specialisti AI pre-configurati"));
  for (const category of categories) {
    const expected = category.id === "assist"
      ? `${category.starter} Assistente Personale`
      : `${category.starter} Specialisti ${category.name}`;
    assert.ok(starter.includes(expected), `Starter: manca «${expected}»`);
  }
});

test("prezzi, sconto e scadenza statici coincidono con la configurazione dell’offerta", () => {
  const { deadline, plans } = offerConfig();
  assert.ok(Number.isFinite(Date.parse(deadline)), "scadenza del lancio non valida");
  assert.deepEqual(Object.keys(plans).sort(), ["completo", "starter"]);

  for (const [key, plan] of Object.entries(plans)) {
    for (const text of staticTexts(`data-price="${key}"`)) assert.equal(text, `€${plan.launchPrice}`);
    for (const text of staticTexts(`data-regular-price="${key}"`)) assert.equal(text, `€${plan.regularPrice}`);
    for (const text of staticTexts(`data-saving="${key}"`)) assert.equal(text, `€${plan.regularPrice - plan.launchPrice}`);
  }

  const discount = `−${Math.round((1 - plans.completo.launchPrice / plans.completo.regularPrice) * 100)}%`;
  for (const text of staticTexts("data-discount")) assert.equal(text, discount);

  const label = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", timeZone: "Europe/Rome" }).format(
    Date.parse(deadline),
  );
  const labels = staticTexts("data-deadline-label");
  assert.ok(labels.length >= 4);
  for (const text of labels) assert.equal(text, label);
});

test("dopo la scadenza la pagina nasconde sconto e countdown e mostra il prezzo pieno", () => {
  assert.match(page, /<html lang="it" class="is-launch">/);
  assert.match(page, /html:not\(\.is-launch\) \[data-launch-only\] \{ display: none !important; \}/);
  assert.match(page, /root\.classList\.toggle\('is-launch', launch\)/);
  assert.match(page, /euro\(launch \? plan\.launchPrice : plan\.regularPrice\)/);
  assert.match(page, /<div class="countdown" data-countdown data-launch-only hidden/);
  for (const strike of page.match(/<s\b[^>]*>/g) ?? []) {
    assert.match(strike, /data-launch-only/, "il prezzo barrato deve sparire dopo il lancio");
  }
});

test("i pulsanti di acquisto hanno un fallback funzionante e il tracciamento non blocca il pagamento", () => {
  const buttons = [...page.matchAll(/<a class="btn btn--block" data-checkout="(starter|completo)" href="([^"]+)"/g)];
  assert.deepEqual(buttons.map(([, plan]) => plan), ["starter", "completo"]);
  for (const [, , href] of buttons) assert.match(href, /^https:\/\/wa\.me\/393759916344\?text=/);

  assert.match(page, /<script src="\/tirana\/assets\/analytics\.js" data-analytics-context="claude-specialisti"><\/script>/);
  assert.match(page, /analytics\.trackBeginCheckout\(/);
  assert.match(page, /if \(\/\^https:\\\/\\\/\/\.test\(url\)\)/);
  assert.match(page, /window\.location\.assign\(link\.href\)/);
});

test("Vercel serve la pagina con e senza slash finale e la esclude dal fallback", () => {
  const rewrites = vercel.rewrites;
  for (const source of ["/70-specialisti-claude", "/70-specialisti-claude/"]) {
    assert.ok(
      rewrites.some((rewrite) => rewrite.source === source && rewrite.destination === "/70-specialisti-claude/index.html"),
      `rewrite mancante per ${source}`,
    );
  }
  const fallback = rewrites.at(-1);
  assert.equal(fallback.destination, "/index.html");
  const pattern = new RegExp(`^${fallback.source}$`);
  assert.equal(pattern.test("/70-specialisti-claude"), false);
  assert.equal(pattern.test("/70-specialisti-claude/assets/og-70-specialisti-claude.jpg"), false);
  assert.equal(pattern.test("/pagina-inesistente"), true);
});

test("gli asset esistono e l’anteprima social è un JPEG leggero con URL assoluto", () => {
  const assets = new Set(page.match(/\/70-specialisti-claude\/assets\/[a-z0-9.-]+/g));
  assert.ok(assets.size >= 4);
  for (const asset of assets) assert.ok(existsSync(new URL(`public${asset}`, root)), `${asset} mancante`);

  const preview = readFileSync(new URL("public/70-specialisti-claude/assets/og-70-specialisti-claude.jpg", root));
  assert.deepEqual([...preview.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  assert.ok(preview.byteLength < 300_000);
  assert.match(
    page,
    /<meta property="og:image" content="https:\/\/www\.tiranaoffline\.com\/70-specialisti-claude\/assets\/og-70-specialisti-claude\.jpg">/,
  );
  assert.match(page, /<meta name="twitter:card" content="summary_large_image">/);
});

test("le testimonianze sono quelle reali già pubblicate sulla landing di Tirana", () => {
  const normalize = (text) => text.replace(/\s+/g, " ").trim();
  const source = normalize(decode(tirana));
  const quotes = [...page.matchAll(/<blockquote>([\s\S]*?)<\/blockquote>/g)].map(([, quote]) => normalize(decode(quote)));
  assert.ok(quotes.length >= 12, "servono almeno dodici testimonianze");
  for (const quote of quotes) assert.ok(source.includes(quote), `testimonianza non verificata: ${quote.slice(0, 60)}`);

  const authors = [...page.matchAll(/<figcaption class="who">[\s\S]*?<strong>([^<]+)<\/strong>/g)].map(([, name]) => name);
  for (const author of authors) assert.ok(source.includes(author), `autore non verificato: ${author}`);
  assert.match(page, /non dall’acquisto di questo pacchetto/);
  assert.match(page, /non (?:rappresentano )?una garanzia di risultato individuale/);
  assert.doesNotMatch(page, /★/, "nessuna valutazione a stelle inventata");
});

test("la pagina usa il brand Scalers+, cita le fonti e dichiara l’indipendenza da Anthropic", () => {
  assert.doesNotMatch(page, /darius|lukas|hyperentrepreneur|black ?book/i);
  assert.match(page, /Claude è un marchio di Anthropic\. Questo prodotto è stato creato in modo indipendente e non è affiliato/);
  assert.match(page, /Questo sito non fa parte di Facebook o di Meta Platforms, Inc\./);
  assert.match(page, /© 2026 Scalers\+ · Matteo Milone/);
  const sources = page.match(/href="https:\/\/techcrunch\.com\/2026\/03\/02\/users-are-ditching-chatgpt-for-claude-heres-how-to-make-the-switch"/g) ?? [];
  assert.equal(sources.length, 2, "i dati di mercato devono citare la fonte");
  assert.match(page, /Grafico illustrativo: mostra la dinamica, non un risultato garantito\./);
});
