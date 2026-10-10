// The offer a creative makes, read from its copy (title, body, ad name): the mechanic, not
// the wording. When the copy names several, the most concrete wins: a BOGO over a
// percentage, a percentage over a sale event, any of them over plain urgency. Pure module.

/** Offer types, most concrete first. `match` gets the lower-cased copy. */
export const OFFERS = [
  { key: 'bogo', match: /buy (one|1|two|2),? get (one|1|two|2)|\bbogo\b|\bb[12]g[12]\b|\b2 for 1\b|\b1\s?\+\s?1\b|get (one|two|three|\d) free|compr\w* \d+,? (prendi|paghi) \d+/ },
  { key: 'percent', match: /\d{1,2}\s?% ?(off|discount|sconto)|save (up to )?\d{1,2}\s?%|up to \d{1,2}\s?%|\d{1,2}\s?% sitewide|sconto (del|fino al) \d{1,2}|-\d{1,2}\s?%/ },
  { key: 'amount', match: /\$\s?\d+(\.\d\d)? off|save \$\s?\d+|\$\s?\d+ (discount|savings)|€\s?\d+ di sconto|\d+\s?€ di sconto/ },
  { key: 'bundle', match: /\bbundles?\b|\bkit\b|stock up|\b\d[- ]pack\b|value pack|\bset (of|da)\b/ },
  { key: 'subscribe', match: /subscribe (and|&) save|subscription|abbonamento/ },
  { key: 'shipping', match: /free shipping|ships free|spedizione gratuita/ },
  { key: 'gift', match: /free gift|gift with|bonus gift|free bonus|omaggio|in regalo/ },
  { key: 'guarantee', match: /money[- ]back|guarantee|risk[- ]free|soddisfatti o rimborsati/ },
  { key: 'event', match: /prime day|black friday|cyber monday|\bbfcm\b|sale of the year|\w+ sale\b|\bsale (starts|ends|is on)|\bsaldi\b|summer sale|holiday sale/ },
  { key: 'urgency', match: /limited time|today only|special offer|exclusive offer|offer (available|ends)|\bflash\b|while (supplies|stocks?) last|solo oggi|offerta (speciale|limitata)/ },
];

export const OFFER_KEYS = [...OFFERS.map((o) => o.key), 'none'];

/** The offer in a piece of copy: its key and the words that made it ("25% off"), or none. */
export function detectOffer(text) {
  const copy = String(text || '').toLowerCase();
  for (const o of OFFERS) {
    const m = o.match.exec(copy);
    if (m) return { key: o.key, text: m[0].trim() };
  }
  return { key: 'none', text: '' };
}
