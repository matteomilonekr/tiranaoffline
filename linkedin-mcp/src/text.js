import { LIMITS } from './config.js';

// Characters reserved by LinkedIn's "little" text format. Unescaped, they can
// silently truncate or mangle the commentary of a post.
const RESERVED = /[\\|{}@[\]()<>#*_~]/g;

export function escapeLittleText(text) {
  return text.replace(RESERVED, (char) => `\\${char}`);
}

// Mentions written as @[Name](urn:li:person:ID) and hashtags like #marketing
// stay functional; everything else is escaped.
const LITTLE_TOKEN =
  /@\[([^\]\n]+)\]\((urn:li:(?:person|organization|organizationBrand):[A-Za-z0-9_-]+)\)|(?<![\p{L}\p{N}_&/\\#])#((?=\p{N}*\p{L})[\p{L}\p{N}]+)/gu;

export function toLittleText(text) {
  let out = '';
  let last = 0;
  for (const match of text.matchAll(LITTLE_TOKEN)) {
    out += escapeLittleText(text.slice(last, match.index));
    out += match[1] !== undefined ? `@[${escapeLittleText(match[1])}](${match[2]})` : `#${match[3]}`;
    last = match.index + match[0].length;
  }
  return out + escapeLittleText(text.slice(last));
}

// Unicode "Mathematical Sans-Serif" letters: the usual way to get bold/italic on LinkedIn.
const BOLD = { upper: 0x1d5d4, lower: 0x1d5ee, digit: 0x1d7ec };
const ITALIC = { upper: 0x1d608, lower: 0x1d622, digit: null };

function mapStyle(text, style) {
  return Array.from(text, (char) => {
    const code = char.codePointAt(0);
    if (code >= 65 && code <= 90) return String.fromCodePoint(style.upper + code - 65);
    if (code >= 97 && code <= 122) return String.fromCodePoint(style.lower + code - 97);
    if (style.digit && code >= 48 && code <= 57) return String.fromCodePoint(style.digit + code - 48);
    return char;
  }).join('');
}

export const toBold = (text) => mapStyle(text, BOLD);
export const toItalic = (text) => mapStyle(text, ITALIC);

/**
 * LinkedIn has no markdown. Converts the bits LLMs tend to write anyway:
 * **bold**, *italic*, "# headings", "* bullets" and [text](https://links).
 */
export function markdownToLinkedIn(text) {
  return text
    .replace(/^[ \t]*#{1,6}[ \t]+(.+?)[ \t]*$/gm, (_, title) => toBold(title))
    .replace(/^([ \t]*)\*[ \t]+/gm, '$1• ')
    .replace(/(?<!@)\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1: $2')
    .replace(/\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*/g, (_, inner) => toBold(inner))
    .replace(/(?<![*\p{L}\p{N}])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![*\p{L}\p{N}])/gu, (_, inner) => toItalic(inner));
}

/**
 * Turns the text written by the user/LLM into the `commentary` LinkedIn expects.
 * Returns both the text people will see and the escaped API payload.
 */
export function prepareCommentary(text, { markdown = true, raw = false } = {}) {
  if (raw) return { visible: text, commentary: text };
  const visible = markdown ? markdownToLinkedIn(text) : text;
  return { visible, commentary: toLittleText(visible) };
}

export const countChars = (text) => Array.from(text).length;

// Approximation of what the feed shows before "…see more".
function seeMorePreview(text, maxChars, maxLines = 3) {
  const firstLines = text.split('\n').slice(0, maxLines).join('\n');
  const chars = Array.from(firstLines);
  const shown = chars.length > maxChars ? chars.slice(0, maxChars).join('').trimEnd() : firstLines.trimEnd();
  return shown.length < text.trimEnd().length ? `${shown}… see more` : text;
}

/** Quality checks for a post body, used by the preview and publish tools. */
export function analyzeText(visible) {
  const displayed = visible.replace(/@\[([^\]\n]+)\]\(urn:li:[^)]+\)/g, '$1');
  const characters = countChars(displayed);
  const hashtags = displayed.match(/(?<![\p{L}\p{N}_&/\\#])#(?=\p{N}*\p{L})[\p{L}\p{N}]+/gu) || [];
  const links = displayed.match(/https?:\/\/\S+/g) || [];
  const warnings = [];
  if (characters > LIMITS.commentary) {
    warnings.push(`Too long: ${characters} characters, LinkedIn allows ${LIMITS.commentary}.`);
  }
  if (hashtags.length > 5) warnings.push(`${hashtags.length} hashtags: 3-5 relevant ones usually perform better.`);
  if (links.length) {
    warnings.push('The body contains links: LinkedIn tends to show posts with external links to fewer people. Consider moving the link to firstComment.');
  }
  if (/\*\*|__/.test(displayed)) warnings.push('Unconverted markdown markers (** or __) will show up literally.');
  const longestParagraph = Math.max(0, ...displayed.split(/\n\s*\n/).map(countChars));
  if (longestParagraph > 500) warnings.push('A paragraph is longer than 500 characters: short paragraphs read better in the feed.');
  const firstLine = displayed.split('\n').find((line) => line.trim()) || '';
  if (countChars(firstLine) > 150) {
    warnings.push('The first line is long: the hook should fit before "…see more" (~140 characters on mobile).');
  }
  return {
    characters,
    remaining: LIMITS.commentary - characters,
    hashtags,
    links,
    preview: {
      desktop: seeMorePreview(displayed, 210),
      mobile: seeMorePreview(displayed, 140),
    },
    warnings,
  };
}
