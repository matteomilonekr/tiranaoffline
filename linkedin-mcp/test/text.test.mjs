import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeText, escapeLittleText, markdownToLinkedIn, prepareCommentary, toBold, toLittleText } from '../src/text.js';

test('escapes every reserved little-format character', () => {
  assert.equal(escapeLittleText('a(b)[c]{d}<e>|f@g#h*i_j~k\\l'), 'a\\(b\\)\\[c\\]\\{d\\}\\<e\\>\\|f\\@g\\#h\\*i\\_j\\~k\\\\l');
});

test('keeps hashtags and mentions functional while escaping the rest', () => {
  const input = 'Grazie @[Mario Rossi](urn:li:person:abc_123) e @[Acme](urn:li:organization:42)! (sì) #AI #Marketing2026';
  assert.equal(
    toLittleText(input),
    'Grazie @[Mario Rossi](urn:li:person:abc_123) e @[Acme](urn:li:organization:42)! \\(sì\\) #AI #Marketing2026',
  );
});

test('does not turn numbers, C# or URL fragments into hashtags', () => {
  assert.equal(toLittleText('Siamo #1 in C# vedi https://x.it/pagina#sezione'), 'Siamo \\#1 in C\\# vedi https://x.it/pagina\\#sezione');
});

test('emails and handles are escaped, not treated as mentions', () => {
  assert.equal(toLittleText('scrivi a info@site.it o @mario'), 'scrivi a info\\@site.it o \\@mario');
});

test('converts the markdown LLMs write into LinkedIn-friendly text', () => {
  const output = markdownToLinkedIn('# Titolo\n**Bold** e *italic*\n* uno\n* due\nVedi [la guida](https://example.com/guida)');
  assert.equal(output, `${toBold('Titolo')}\n${toBold('Bold')} e 𝘪𝘵𝘢𝘭𝘪𝘤\n• uno\n• due\nVedi la guida: https://example.com/guida`);
});

test('markdown conversion leaves hashtags, maths and mentions alone', () => {
  const input = '#AI #marketing\n2*3*4 = 24\n@[Anna](urn:li:person:x1)';
  assert.equal(markdownToLinkedIn(input), input);
});

test('prepareCommentary can skip markdown or escaping', () => {
  assert.deepEqual(prepareCommentary('**ciao** (x)', { markdown: false }), {
    visible: '**ciao** (x)',
    commentary: '\\*\\*ciao\\*\\* \\(x\\)',
  });
  assert.deepEqual(prepareCommentary('{hashtag|\\#|tag}', { raw: true }), {
    visible: '{hashtag|\\#|tag}',
    commentary: '{hashtag|\\#|tag}',
  });
});

test('analyzeText counts characters, finds the see-more cut and warns', () => {
  const hook = 'Ho pubblicato 100 post su LinkedIn in 100 giorni.';
  const body = `${hook}\n\nEcco cosa ho imparato.\n\nTerza riga\nQuarta riga\n\nLink: https://example.com\n#a #b #c #d #e #f`;
  const analysis = analyzeText(body);
  assert.equal(analysis.characters, Array.from(body).length);
  assert.equal(analysis.hashtags.length, 6);
  assert.ok(analysis.preview.mobile.startsWith(hook));
  assert.ok(analysis.preview.mobile.endsWith('… see more'));
  assert.ok(analysis.warnings.some((w) => w.includes('hashtags')));
  assert.ok(analysis.warnings.some((w) => w.includes('links')));
});

test('analyzeText flags posts over 3000 characters and counts emoji as one', () => {
  assert.equal(analyzeText('🚀🚀').characters, 2);
  assert.ok(analyzeText('x'.repeat(3001)).warnings[0].startsWith('Too long'));
});
