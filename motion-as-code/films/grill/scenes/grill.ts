// The whole of `grill`, one plate: @piyush.glitch's reel on Matt Pocock's skills, shot for shot, in Italian,
// on the look in _pix.ts. Each shot is a stage above the seam (pixel creatures acting the idea out) and, below
// it, either Matteo talking or the repo's page with hand-drawn marks. The shots cut on the words.
// Facts as checked on github.com/mattpocock/skills in October 2026: ~282k stars, 27 skills, MIT; Claude Code
// installs `mattpocock-skills@claude-plugins-official` and the plugin updates itself; other agents use
// `npx skills@latest add mattpocock/skills`; then `/setup-matt-pocock-skills` once per repo. The original said
// 265,000 stars and a shortened command. The pages below the seam are illustrations of the repo, not screenshots.
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '@kit/engine/scene';
import { Layer2D, clearRT } from '@kit/engine/gl';
import type { Lyrics } from '@kit/engine/lyrics';
import { presenter, Gestures } from '../../plugins/scenes/_stage';
import {
  W, H, F, TAU, SEAM, FLOOR, INK, RED, ORANGE, YELLOW, GREEN, BLUE, PURPLE, LW, clamp, ease, hash, lerp, font,
  k, pop, rr, box, txt, at, wordAt, stage, sky, wall, critter, crowd, walker, sticker, headline, bubble, star, terminal,
  chalkboard, trafficLight, confetti, room, browser, circleMark, underline, boxMark, chunks, caption, type Said,
} from './_pix';

const CUT_LEAD = 0.16;
type Shot = { id: string; t0: number; t1: number };
type Box = { x: number; y: number; w: number; h: number };

/** A tick or a cross, drawn (the mono faces lack the glyphs). */
function tick(x: CanvasRenderingContext2D, cx: number, cy: number, s: number, col = GREEN, lw = 6) {
  x.save(); x.strokeStyle = col; x.lineWidth = lw; x.lineCap = 'round'; x.lineJoin = 'round';
  x.beginPath(); x.moveTo(cx - s * 0.5, cy); x.lineTo(cx - s * 0.12, cy + s * 0.38); x.lineTo(cx + s * 0.55, cy - s * 0.42); x.stroke(); x.restore();
}
function cross(x: CanvasRenderingContext2D, cx: number, cy: number, s: number, col = RED, lw = 6) {
  x.save(); x.strokeStyle = col; x.lineWidth = lw; x.lineCap = 'round';
  x.beginPath(); x.moveTo(cx - s / 2, cy - s / 2); x.lineTo(cx + s / 2, cy + s / 2); x.moveTo(cx + s / 2, cy - s / 2); x.lineTo(cx - s / 2, cy + s / 2); x.stroke(); x.restore();
}
const it = (n: number) => Math.round(n).toLocaleString('it-IT');

export default class Grill extends Scene {
  layer = new Layer2D();
  ly!: Lyrics;
  w: Record<string, number> = {};
  cuts: number[] = [];
  shots: Shot[] = [];
  caps: Said[][] = [];
  gest = new Gestures([]);
  anchors: Record<string, Box> = {};

  override init() {
    const ly = (this.ly = this.ctx.lyrics);
    const cut = (i: number) => {
      const l = ly.lines[i]!, p = ly.lines[i - 1];
      return Math.max(l.words[0]!.start - CUT_LEAD, p ? Math.min(p.end + 0.02, l.words[0]!.start - 0.02) : 0);
    };
    const c = (this.cuts = ly.lines.map((_, i) => cut(i)));
    const a = (q: string, after = 0) => wordAt(ly, q, after).start;
    const end = (q: string, after = 0) => wordAt(ly, q, after).end;
    const w = this.w;
    w.num = a('280.000'); w.stelle = a('stelle'); w.che1 = a('che', c[1]!); w.verita = a('verità');
    w.sbagliata = a('sbagliata', c[3]!); w.stupida = a('stupida'); w.spiegato = a('spiegato'); w.volevi = a('volevi');
    w.grillme = a('grill-me', c[5]!); w.riga = a('riga'); w.domanda = a('domanda'); w.fallisce = a('fallisce'); w.passare = a('passare');
    w.ciclo = a('ciclo'); w.analizza = a('analizza'); w.report = a('report'); w.sistemare = a('sistemare');
    w.scrivi = a('scrivi'); w.cmd = a('mattpocock-skills', c[13]!); w.ufficiale = a('ufficiale'); w.aggiorna = a('aggiorna');
    w.npx = a('npx'); w.repo2 = end('mattpocock/skills', c[16]!); w.volta = a('volta'); w.pronto = a('pronto');
    w.grill = a('GRILL', c[18]!); w.privato = a('privato');

    const S = (id: string, t0: number): Shot => ({ id, t0, t1: 0 });
    const list = [
      S('stars', 0), S('buckets', w.stelle - 0.1),
      S('museum', c[1]!), S('interrogate', w.che1 - 0.15),
      S('court', c[2]!), S('crane', c[3]!), S('board', w.stupida - 0.35),
      S('wreck', c[4]!), S('vague', w.spiegato - 0.15),
      S('builder', c[5]!), S('grill', w.grillme - 0.4),
      S('editor', c[6]!), S('questions', w.domanda - 0.3), S('plan', c[7]!),
      S('tdd', c[8]!), S('bugs', c[9]!), S('loop', w.ciclo - 0.15),
      S('arch', c[10]!), S('city', w.analizza - 0.2), S('report', w.report - 0.3),
      S('clock', c[12]!), S('term', c[13]!), S('market', c[14]!), S('robot', w.aggiorna - 0.25),
      S('agents', c[15]!), S('npx', c[16]!), S('folder', w.repo2 + 0.05),
      S('setup', c[17]!), S('mountain', w.volta - 0.25), S('rocket', w.pronto - 0.2),
      S('phone', c[18]!),
    ];
    list.forEach((s, i) => (s.t1 = list[i + 1]?.t0 ?? this.ctx.end));
    this.shots = list;
    this.caps = chunks(ly.words);
    this.gest = new Gestures([
      [0.2, 'both'], [1.6, 'presentR'],
      [w.spiegato - 0.2, 'shrug'], [w.volevi, 'stop'],
      [w.passare - 0.1, 'thumb'], [c[9]! - 0.2, 'think'], [w.ciclo, 'pointUp'],
      [c[14]! - 0.2, 'presentR'], [w.volta - 0.3, 'pointUp'], [w.pronto - 0.2, 'both'],
      [c[18]! - 0.2, 'pointR'], [w.privato - 0.2, 'thumb'],
    ]);
  }

  shot(t: number): Shot {
    let s = this.shots[0]!;
    for (const x of this.shots) if (t >= x.t0) s = x;
    return s;
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    clearRT(renderer, out);
    const L = this.layer;
    L.clear();
    const x = L.ctx;
    const s = this.shot(t);
    // above the seam
    x.save(); x.beginPath(); x.rect(0, 0, W, SEAM); x.clip();
    (this as unknown as Record<string, (x: CanvasRenderingContext2D, t: number, s: Shot) => void>)[s.id]!.call(this, x, t, s);
    x.restore();
    // below it
    x.save(); x.beginPath(); x.rect(0, SEAM, W, H - SEAM); x.clip();
    this.bottom(x, t, f, s);
    x.restore();
    walker(x, t, SEAM + 4, 5, 9, 2, 1);
    walker(x, t, SEAM + 4, 5, 13, 4, -1);
    caption(x, t, this.caps);
    comp.draw(renderer, L.upload(), out);
    return { bloom: 0, halation: 0, ca: 0, grain: 0.03, vignette: 0.05, hud: 0 };
  }

  // ---------------------------------------------------------------- below the seam
  bottom(x: CanvasRenderingContext2D, t: number, f: Frame, s: Shot) {
    const w = this.w;
    const talk = () => {
      room(x, t);
      x.save(); x.translate(540, SEAM + 410); x.scale(1.22, 1.22); x.translate(-540, -975);
      presenter(x, t, f.a, this.gest, 540, undefined, 1400);
      x.restore();
    };
    switch (s.id) {
      case 'stars': case 'vague': case 'bugs': case 'loop': case 'market': case 'mountain': case 'rocket': case 'phone':
        return talk();
      case 'tdd':
        return t >= w.passare - 0.1 ? talk() : this.page(x, t, 'list', 2, s, [['circle', 'tdd', s.t0 + 0.3], ['sticker', 'ROSSO → VERDE', s.t0 + 0.5, 'tdd', GREEN]]);
      case 'buckets': return this.page(x, t, 'about', 0, s, [['circle', 'stars', s.t0 + 0.25], ['underline', 'forks', s.t0 + 0.6]]);
      case 'museum': return this.page(x, t, 'list', 0, s, [['sticker', '/grill-me', s.t0 + 0.35, 'grill-me', RED]]);
      case 'interrogate': return this.page(x, t, 'list', 0, s, [['box', 'grill-me', s.t0 + 0.15], ['underline', 'grill-me-d', s.t0 + 0.4]]);
      case 'court': return this.page(x, t, 'readme', 0, s, [['box', 'h1', s.t0 + 0.3]]);
      case 'crane': return this.page(x, t, 'readme', 0, s, [['underline', 'problem', s.t0 + 0.3]]);
      case 'board': return this.page(x, t, 'readme', 0, s, [['circle', 'grilling', s.t0 + 0.2]]);
      case 'wreck': return this.page(x, t, 'readme', 1, s, [['sticker', 'LA SOLUZIONE', s.t0 + 0.3, 'fix', ORANGE]]);
      case 'builder': return this.page(x, t, 'about', 0, s, [['circle', 'name', s.t0 + 0.3]]);
      case 'grill': return this.page(x, t, 'readme', 1, s, [['circle', 'fix-grill', s.t0 + 0.3], ['underline', 'fix-wd', s.t0 + 0.7, BLUE]]);
      case 'editor': return this.page(x, t, 'list', 0, s, [['box', 'grill-me', s.t0 + 0.2]]);
      case 'questions': case 'plan': return this.page(x, t, 'list', 0, s, [['box', 'grill-me', s.t0], ['qs', '', s.t0 + 0.2]]);
      case 'arch': return this.page(x, t, 'list', 3, s, [['circle', 'improve', s.t0 + 0.25], ['sticker', 'SKILL #4', s.t0 + 0.5, 'improve', PURPLE]]);
      case 'city': return this.page(x, t, 'list', 3, s, [['box', 'improve', s.t0]]);
      case 'report': return this.page(x, t, 'list', 3, s, [['underline', 'improve-d', s.t0 + 0.2], ['sticker', 'REPORT VISIVO', s.t0 + 0.5, 'improve-d', PURPLE]]);
      case 'clock': return this.page(x, t, 'install', 0, s, [['box', 'inst', s.t0 + 0.25]]);
      case 'term': return this.page(x, t, 'install', 0, s, [['circle', 'cc', w.scrivi]]);
      case 'robot': return this.page(x, t, 'install', 1, s, [['underline', 'auto', s.t0 + 0.2], ['sticker', 'SI AGGIORNA', s.t0 + 0.5, 'auto', GREEN]]);
      case 'agents': return this.page(x, t, 'install', 1, s, [['circle', 'others', s.t0 + 0.3]]);
      case 'npx': case 'folder': return this.page(x, t, 'install', 1, s, [['circle', 'npx', w.npx]]);
      case 'setup': return this.page(x, t, 'install', 1, s, [['box', 'setup', s.t0 + 0.2]]);
    }
    talk();
  }

  /** A page in the browser card, scrolled to `scroll` (a section index); `marks` annotate its anchors. */
  page(x: CanvasRenderingContext2D, t: number, kind: string, scroll: number, s: Shot, marks: [string, string, number, string?, string?][]) {
    const urls: Record<string, string> = { about: 'github.com/mattpocock/skills', list: 'github.com/mattpocock/skills#skills', readme: 'github.com/mattpocock/skills#readme', install: 'github.com/mattpocock/skills#installation' };
    const cb = browser(x, urls[kind]!);
    const A = (this.anchors = {});
    x.save(); rr(x, cb.x, cb.y, cb.w, cb.h - 6, 16); x.clip();
    const scrolls: Record<string, number[]> = { list: [0, 116, 232, 300], readme: [0, 200], install: [0, 190], about: [0] };
    const y0 = cb.y + 30 - (scrolls[kind]![scroll] ?? 0);
    const L = cb.x + 36, R = cb.x + cb.w - 36;
    const mark = (id: string, bx: number, by: number, bw: number, bh: number) => ((A as Record<string, Box>)[id] = { x: bx, y: by, w: bw, h: bh });
    const tw = (s: string, size: number, fam: string) => { x.save(); x.font = font(fam, size); const v = x.measureText(s).width; x.restore(); return v; };
    if (kind === 'about') {
      x.beginPath(); x.arc(L + 22, y0 + 26, 22, 0, TAU); x.fillStyle = '#d4c3b0'; x.fill();
      txt(x, 'mattpocock /', L + 58, y0 + 36, 28, F.mono(500), '#3d6fc4');
      const nx = L + 58 + tw('mattpocock / ', 28, F.mono(500));
      txt(x, 'skills', nx, y0 + 36, 28, F.mono(700), '#2f5fb5'); mark('name', nx, y0 + 10, tw('skills', 28, F.mono(700)), 34);
      box(x, nx + 120, y0 + 12, 84, 30, '#ffffff', 15, 1.5); txt(x, 'Public', nx + 162, y0 + 33, 17, F.poppins(500), '#5d5a57', { align: 'center' });
      txt(x, 'Code     Issues     Pull requests     Actions', L, y0 + 96, 21, F.poppins(500), '#5d5a57');
      x.fillStyle = '#e2603a'; x.fillRect(L, y0 + 108, 54, 4); x.fillStyle = '#ece9e5'; x.fillRect(cb.x, y0 + 112, cb.w, 2);
      txt(x, 'About', L, y0 + 166, 28, F.poppins(600), '#24292f');
      txt(x, 'Skills for real engineers, straight from', L, y0 + 210, 23, F.poppins(500), '#3b3f45');
      txt(x, 'my .agents directory.', L, y0 + 242, 23, F.poppins(500), '#3b3f45');
      txt(x, 'aihero.dev/skills', L, y0 + 284, 22, F.poppins(600), '#2f6fd0');
      const rows: [string, string][] = [['Readme', ''], ['MIT license', ''], ['Activity', ''], ['282k stars', 'stars'], ['23.6k forks', 'forks']];
      rows.forEach(([r, id], i) => {
        const ry = y0 + 336 + i * 44;
        x.beginPath(); x.arc(L + 10, ry - 8, 8, 0, TAU); x.strokeStyle = '#8b8f95'; x.lineWidth = 2; x.stroke();
        txt(x, r, L + 34, ry, 22, F.poppins(500), '#4b5056');
        if (id) mark(id, L + 30, ry - 26, tw(r, 22, F.poppins(500)) + 8, 34);
      });
    } else if (kind === 'list') {
      const items: [string, string, string][] = [
        ['grill-me', 'Interviews you about a plan until every branch is resolved.', 'grill-me'],
        ['grill-with-docs', 'The same interview, and it keeps your glossary and ADRs.', 'grill-wd'],
        ['tdd', 'Red, green, refactor: one vertical slice at a time.', 'tdd'],
        ['diagnosing-bugs', 'A loop for hard bugs: reproduce, minimise, fix.', 'bugs'],
        ['improve-codebase-architecture', 'Finds the modules worth deepening, as a visual report.', 'improve'],
        ['setup-matt-pocock-skills', 'Issue tracker, labels and docs, once per repo.', 'setup'],
      ];
      items.forEach(([n, d, id], i) => {
        const iy = y0 + i * 116;
        box(x, L, iy + 8, 40, 40, '#24211f', 9, 0); txt(x, '/', L + 20, iy + 38, 26, F.mono(700), '#ffffff', { align: 'center' });
        txt(x, `/${n}`, L + 60, iy + 22, 17, F.mono(400), '#8b8f95');
        const title = `The /${n} Skill`;
        txt(x, title, L + 60, iy + 54, 26, F.poppins(600), '#24292f'); mark(id, L + 56, iy + 28, tw(title, 26, F.poppins(600)) + 8, 34);
        txt(x, d, L + 60, iy + 86, 20, F.poppins(500), '#6a6f76'); mark(`${id}-d`, L + 60, iy + 90, tw(d, 20, F.poppins(500)), 6);
        txt(x, '→', R - 10, iy + 56, 26, F.mono(500), '#9aa0a6', { align: 'right' });
        x.fillStyle = '#efece8'; x.fillRect(L, iy + 108, cb.w - 72, 2);
      });
    } else if (kind === 'readme') {
      const h1 = "#1: The agent didn't build what I wanted";
      txt(x, h1, L, y0 + 34, 28, F.poppins(700), '#24292f'); mark('h1', L - 4, y0 + 6, tw(h1, 28, F.poppins(700)) + 8, 38);
      x.fillStyle = '#d0d7de'; x.fillRect(L, y0 + 62, 5, 70);
      txt(x, '"No-one knows exactly what they want."', L + 22, y0 + 90, 22, F.poppins(500), '#57606a');
      txt(x, 'Thomas & Hunt, The Pragmatic Programmer', L + 22, y0 + 124, 20, F.poppins(500), '#2f6fd0');
      const p1 = 'The problem: what you meant is not what you said,';
      txt(x, p1, L, y0 + 178, 22, F.poppins(500), '#24292f'); mark('problem', L, y0 + 184, tw(p1, 22, F.poppins(500)), 6);
      txt(x, 'and you find out once the agent has built it.', L, y0 + 210, 22, F.poppins(500), '#24292f');
      txt(x, 'The fix: a', L, y0 + 260, 22, F.poppins(500), '#24292f');
      const gx = L + tw('The fix: a ', 22, F.poppins(500));
      txt(x, 'grilling session', gx, y0 + 260, 22, F.poppins(700), '#24292f'); mark('grilling', gx - 4, y0 + 238, tw('grilling session', 22, F.poppins(700)) + 8, 30);
      txt(x, 'the agent asks you questions first.', gx + tw('grilling session ', 22, F.poppins(700)) + 6, y0 + 260, 22, F.poppins(500), '#24292f');
      mark('fix', L, y0 + 290, 200, 20);
      const b1y = y0 + 320, b2y = y0 + 362;
      for (const [by, n, d, id] of [[b1y, '/grill-me', 'for non-code uses', 'fix-grill'], [b2y, '/grill-with-docs', 'same, and it updates the docs', 'fix-wd']] as const) {
        x.beginPath(); x.arc(L + 8, by - 8, 4, 0, TAU); x.fillStyle = '#24292f'; x.fill();
        const nw = tw(n, 21, F.mono(500));
        box(x, L + 22, by - 28, nw + 16, 32, '#eef2f7', 6, 0); txt(x, n, L + 30, by - 4, 21, F.mono(500), '#2f6fd0');
        txt(x, ` - ${d}`, L + 42 + nw, by - 4, 21, F.poppins(500), '#24292f');
        mark(id, L + 22, by - 28, nw + 16, 32);
      }
      txt(x, '#2: The agent is way too verbose', L, y0 + 440, 26, F.poppins(700), '#24292f');
      txt(x, 'With a shared vocabulary, conversations get shorter.', L, y0 + 482, 21, F.poppins(500), '#57606a');
    } else {
      txt(x, 'Installation (30-second setup)', L, y0 + 34, 28, F.poppins(700), '#24292f'); mark('inst', L - 4, y0 + 6, tw('Installation (30-second setup)', 28, F.poppins(700)) + 8, 38);
      txt(x, '1. Get the skills', L, y0 + 90, 23, F.poppins(600), '#24292f');
      const code = (cy: number, label: string, cmd: string, id: string, lid?: string) => {
        txt(x, label, L, cy, 20, F.poppins(600), '#57606a'); if (lid) mark(lid, L - 4, cy - 22, tw(label, 20, F.poppins(600)) + 8, 28);
        box(x, L, cy + 12, cb.w - 72, 50, '#f6f8fa', 8, 1.5);
        txt(x, cmd, L + 16, cy + 45, 17, F.mono(500), '#24292f'); mark(id, L + 10, cy + 18, tw(cmd, 17, F.mono(500)) + 12, 38);
      };
      code(y0 + 140, 'Claude Code', 'claude plugin install mattpocock-skills@claude-plugins-official', 'cc');
      code(y0 + 232, 'Codex', 'codex plugin add mattpocock-skills@mattpocock', 'codex');
      code(y0 + 324, 'Cursor and other agents', 'npx skills@latest add mattpocock/skills', 'npx', 'others');
      const au = 'The plugins update automatically.';
      txt(x, au, L, y0 + 430, 21, F.poppins(500), '#24292f'); mark('auto', L, y0 + 436, tw(au, 21, F.poppins(500)), 6);
      const st = '2. Run /setup-matt-pocock-skills once per repo';
      txt(x, st, L, y0 + 486, 23, F.poppins(600), '#24292f'); mark('setup', L - 4, y0 + 460, tw(st, 23, F.poppins(600)) + 8, 36);
    }
    x.restore();
    // the marks
    for (const [kind2, id, t0, tgt, col] of marks) {
      if (kind2 === 'qs') { // ticks for the questions answered
        const g = (A as Record<string, Box>)['grill-me-d'];
        if (g) for (let i = 0; i < 4; i++) { const tq = t0 + i * 0.5; if (t >= tq) sticker(x, t, tq, `D${i + 1} ✓`, g.x + 80 + i * 150, g.y + 50, { fill: GREEN, size: 24, rot: (i % 2 ? 0.05 : -0.05) }); }
        continue;
      }
      const b = (A as Record<string, Box>)[kind2 === 'sticker' ? tgt! : id];
      if (!b) continue;
      if (kind2 === 'circle') circleMark(x, t, t0, b.x + b.w / 2, b.y + b.h / 2, b.w, b.h);
      else if (kind2 === 'underline') underline(x, t, t0, b.x, b.y + b.h, b.w, col ?? '#e2603a');
      else if (kind2 === 'box') boxMark(x, t, t0, b.x, b.y, b.w, b.h);
      else if (kind2 === 'sticker') sticker(x, t, t0, id, Math.min(W - 200, b.x + b.w + 40), b.y + b.h / 2 - 6, { fill: col ?? RED, size: 30, rot: -0.06 });
    }
    // the parade along the bottom of the card
    for (let i = 0; i < 5; i++) critter(x, ((i * 230 + t * 40) % (W + 200)) - 100, H - 6, 4, t, { walk: true, hat: (['cap', 'beanie', 'cap', 'hard', 'cap'] as const)[i], a: [BLUE, RED, GREEN, YELLOW, PURPLE][i] });
    void s;
  }

  // ---------------------------------------------------------------- the shots above the seam
  stars(x: CanvasRenderingContext2D, t: number) {
    const w = this.w;
    stage(x, t, { spots: true });
    const v = t < w.num ? lerp(65025, 265000, ease.inCubic(k(t, 0.1, w.num - 0.1))) : 282000 + (t > w.num + 0.9 ? Math.floor((t - w.num - 0.9) * 4) : -Math.round((1 - ease.outCubic(k(t, w.num, 0.9))) * 17000));
    const bx = 100, by = 170, bw = 880, bh = 300;
    x.fillStyle = INK; x.fillRect(bx + 90, by + bh, 12, 180); x.fillRect(bx + bw - 102, by + bh, 12, 180);
    box(x, bx, by, bw, bh, '#2c2b33', 22, LW);
    for (const yy of [by - 14, by + bh + 14]) for (let i = 0; i < 30; i++) {
      x.beginPath(); x.arc(bx + 20 + i * ((bw - 40) / 29), yy, 7, 0, TAU);
      x.fillStyle = (i + Math.floor(t * 6)) % 3 === 0 ? '#fff3b0' : '#8a7a3a'; x.fill();
    }
    txt(x, 'STELLE SU GITHUB', W / 2, by + 74, 32, F.mono(600), YELLOW, { align: 'center', track: 6 });
    star(x, bx + 110, by + 186, 52, YELLOW, 0);
    txt(x, it(v), W / 2 + 50, by + 245, 170, F.poppins(600), '#ffffff', { align: 'center' });
    sticker(x, t, w.num + 0.8, '282K', 860, by + bh + 60, { fill: ORANGE, size: 30, rot: 0.06 });
    crowd(x, t, [150, 400, 680, 930], 15, FLOOR + 70);
    for (const [fx, rot] of [[200, -0.25], [740, 0.25]] as const) {
      at(x, fx, FLOOR - 70, 1, rot + 0.08 * Math.sin(t * 6), () => {
        x.beginPath(); x.roundRect(fx - 26, FLOOR - 230, 52, 120, 26); x.roundRect(fx - 40, FLOOR - 130, 80, 90, 18);
        x.fillStyle = ORANGE; x.fill(); x.lineWidth = 3; x.strokeStyle = INK; x.stroke();
        txt(x, '#1', fx, FLOOR - 74, 30, F.mono(700), '#ffffff', { align: 'center' });
      });
    }
  }

  buckets(x: CanvasRenderingContext2D, t: number, s: Shot) {
    sky(x, t);
    const cols = [BLUE, GREEN, RED];
    [230, 540, 850].forEach((cx, i) => {
      critter(x, cx, FLOOR + 70, 13, t, { hat: 'none', hop: Math.max(0, Math.sin(t * 5 + i)) * 6 });
      const by = FLOOR - 40 - 150 - Math.max(0, Math.sin(t * 5 + i)) * 6;
      x.beginPath(); x.moveTo(cx - 95, by - 90); x.lineTo(cx + 95, by - 90); x.lineTo(cx + 70, by + 30); x.lineTo(cx - 70, by + 30); x.closePath();
      x.fillStyle = cols[i]!; x.fill(); x.lineWidth = LW; x.strokeStyle = INK; x.stroke();
      for (let j = 0; j < 5; j++) star(x, cx - 60 + j * 30, by - 96 - (j % 2) * 16, 20, YELLOW, 2.5);
    });
    for (let i = 0; i < 26; i++) {
      const u = ((t - s.t0) * 0.9 + hash(i, 1)) % 1, sx = 120 + hash(i, 2) * 840;
      star(x, sx, -40 + u * 760, 14 + hash(i, 3) * 10, YELLOW, 2);
    }
    sticker(x, t, s.t0 + 0.35, 'STELLE OVUNQUE', 540, 300, { fill: BLUE, size: 36, rot: -0.04 });
  }

  museum(x: CanvasRenderingContext2D, t: number, s: Shot) {
    wall(x, '#efe4d2');
    for (const [fx, fy, c] of [[90, 170, '#4a7fd6'], [820, 260, '#e6b84a']] as const) { box(x, fx, fy, 170, 200, '#c79a3c', 4, LW); box(x, fx + 18, fy + 18, 134, 164, c, 2, 0); }
    // ropes between brass posts
    for (const px of [120, 360, 720, 960]) { box(x, px - 9, FLOOR - 150, 18, 150, '#c8a046', 4, 3); x.beginPath(); x.arc(px, FLOOR - 156, 14, 0, TAU); x.fillStyle = '#c8a046'; x.fill(); x.stroke(); }
    x.strokeStyle = '#b8322a'; x.lineWidth = 9;
    for (const [a0, a1] of [[120, 360], [720, 960]] as const) { x.beginPath(); x.moveTo(a0, FLOOR - 140); x.quadraticCurveTo((a0 + a1) / 2, FLOOR - 70, a1, FLOOR - 140); x.stroke(); }
    // the pedestal and the red box
    box(x, 440, FLOOR - 290, 200, 290, '#f7f5f1', 4, LW); box(x, 410, FLOOR - 320, 260, 40, '#ffffff', 4, LW);
    const e = pop(t, s.t0 + 0.1, 0.35);
    at(x, 540, FLOOR - 420, e * (1 + 0.04 * Math.sin(t * 6)), 0, () => {
      x.save(); x.shadowColor = 'rgba(224,73,59,0.6)'; x.shadowBlur = 40; box(x, 455, FLOOR - 505, 170, 170, RED, 24, LW); x.restore();
      txt(x, '?!', 540, FLOOR - 385, 92, F.mono(700), '#ffffff', { align: 'center' });
    });
    sticker(x, t, s.t0 + 0.5, 'LA MIGLIORE', 790, 140, { fill: ORANGE, size: 32, rot: 0.05 });
    critter(x, 900, FLOOR + 70, 13, t, { hat: 'cap', a: '#1c1917', face: 'cool' });
    critter(x, 160, FLOOR + 70, 11, t, { hat: 'cap', a: BLUE });
  }

  interrogate(x: CanvasRenderingContext2D, t: number, s: Shot) {
    x.fillStyle = '#2a2e3b'; x.fillRect(0, 0, W, SEAM);
    x.fillStyle = '#323748'; x.fillRect(60, 120, 260, 180);
    x.fillStyle = '#20232d'; x.fillRect(0, FLOOR, W, SEAM - FLOOR);
    // the lamp and its cone
    x.strokeStyle = '#111'; x.lineWidth = 6; x.beginPath(); x.moveTo(540, 0); x.lineTo(540, 170); x.stroke();
    x.save(); x.globalCompositeOperation = 'lighter';
    const g = x.createLinearGradient(0, 200, 0, FLOOR); g.addColorStop(0, 'rgba(255,230,150,0.45)'); g.addColorStop(1, 'rgba(255,230,150,0.08)');
    x.fillStyle = g; x.beginPath(); x.moveTo(470, 210); x.lineTo(610, 210); x.lineTo(900, FLOOR); x.lineTo(180, FLOOR); x.closePath(); x.fill();
    x.restore();
    x.beginPath(); x.moveTo(470, 215); x.lineTo(500, 160); x.lineTo(580, 160); x.lineTo(610, 215); x.closePath(); x.fillStyle = '#3a3d47'; x.fill(); x.lineWidth = LW; x.strokeStyle = '#111'; x.stroke();
    // the desk, the interrogator, the plan sweating
    critter(x, 330, FLOOR - 150, 13, t, { hat: 'cap', a: '#1c1917', face: 'cool' });
    box(x, 160, FLOOR - 170, 760, 50, '#8a5a34', 6, LW); x.fillStyle = '#6f4527'; x.fillRect(200, FLOOR - 120, 30, 120); x.fillRect(850, FLOOR - 120, 30, 120);
    at(x, 720, FLOOR - 270, 1, 0.08 * Math.sin(t * 9), () => {
      box(x, 660, FLOOR - 360, 130, 170, '#ffffff', 6, LW);
      txt(x, 'PIANO', 725, FLOOR - 320, 22, F.mono(700), RED, { align: 'center' });
      x.fillStyle = INK; x.fillRect(698, FLOOR - 290, 12, 12); x.fillRect(742, FLOOR - 290, 12, 12);
      x.strokeStyle = INK; x.lineWidth = 4; x.beginPath(); x.arc(726, FLOOR - 240, 18, Math.PI * 1.15, Math.PI * 1.85); x.stroke();
      x.fillStyle = '#7fc8ff'; x.beginPath(); x.arc(800, FLOOR - 330 + ((t * 120) % 40), 7, 0, TAU); x.fill();
    });
    bubble(x, t, s.t0 + 0.25, 'PERCHÉ?', 820, 230, 34);
    bubble(x, t, s.t0 + 0.55, 'CHI?', 560, 330, 34, -1);
    bubble(x, t, s.t0 + 0.85, 'COME?', 900, 420, 34, -1);
    bubble(x, t, s.t0 + 1.1, '?', 470, 470, 30);
  }

  court(x: CanvasRenderingContext2D, t: number, s: Shot) {
    wall(x, '#ece2d3');
    for (const cx of [80, 210, 870, 1000]) { box(x, cx - 34, 160, 68, FLOOR - 160, '#f6f1e8', 4, 3); x.strokeStyle = 'rgba(42,38,36,0.25)'; x.lineWidth = 3; for (const d of [-14, 0, 14]) { x.beginPath(); x.moveTo(cx + d, 180); x.lineTo(cx + d, FLOOR - 20); x.stroke(); } }
    headline(x, t, s.t0, 'ECCO LA VERITÀ');
    const bang = Math.max(0, 1 - Math.abs(t - this.w.verita) / 0.18);
    critter(x, 540, FLOOR - 340, 14, t, { hat: 'wig' });
    at(x, 700, FLOOR - 470, 1, -0.9 + 0.9 * bang, () => { box(x, 690, FLOOR - 600, 20, 140, '#7a4a28', 4, 3); box(x, 650, FLOOR - 630, 100, 50, '#8a5a34', 8, 3); });
    box(x, 300, FLOOR - 360, 480, 360, '#b07a46', 8, LW); box(x, 280, FLOOR - 380, 520, 40, '#c48b52', 6, LW);
    x.beginPath(); x.arc(540, FLOOR - 250, 54, 0, TAU); x.fillStyle = YELLOW; x.fill(); x.lineWidth = LW; x.strokeStyle = INK; x.stroke();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; x.beginPath(); x.moveTo(540 + Math.cos(a) * 14, FLOOR - 250 + Math.sin(a) * 14); x.lineTo(540 + Math.cos(a) * 40, FLOOR - 250 + Math.sin(a) * 40); x.stroke(); }
    const pe = pop(t, s.t0 + 0.35, 0.3);
    at(x, 540, FLOOR - 90, pe, 0, () => { box(x, 400, FLOOR - 150, 280, 150, '#ffffff', 4, 3); txt(x, 'LA VERITÀ:', 540, FLOOR - 105, 30, F.mono(700), RED, { align: 'center' }); for (let i = 0; i < 3; i++) { x.fillStyle = '#c9c4bc'; x.fillRect(430, FLOOR - 80 + i * 22, 220, 8); } });
    crowd(x, t, [70, 160, 920, 1010], 7, FLOOR + 80, 2);
  }

  /** The shack the AI built and the house you wanted. */
  shack(x: CanvasRenderingContext2D, cx: number, by: number, tilt: number) {
    at(x, cx, by, 1, tilt, () => {
      box(x, cx - 130, by - 170, 260, 170, '#d9b98a', 4, LW);
      x.beginPath(); x.moveTo(cx - 160, by - 168); x.lineTo(cx + 20, by - 270); x.lineTo(cx + 150, by - 168); x.closePath(); x.fillStyle = RED; x.fill(); x.lineWidth = LW; x.strokeStyle = INK; x.stroke();
      box(x, cx - 40, by - 100, 60, 100, '#8a5a34', 3, 3); box(x, cx + 50, by - 140, 50, 40, '#9fd3ff', 3, 3);
    });
  }
  blueprint(x: CanvasRenderingContext2D, cx: number, cy: number, label: string) {
    box(x, cx - 150, cy - 130, 300, 260, '#2f5fb5', 6, LW);
    x.strokeStyle = '#ffffff'; x.lineWidth = 4;
    x.beginPath(); x.moveTo(cx - 90, cy + 70); x.lineTo(cx - 90, cy - 10); x.lineTo(cx, cy - 80); x.lineTo(cx + 90, cy - 10); x.lineTo(cx + 90, cy + 70); x.closePath(); x.stroke();
    x.strokeRect(cx - 20, cy + 20, 40, 50); x.strokeRect(cx + 34, cy - 4, 32, 28);
    txt(x, label, cx, cy + 112, 22, F.mono(700), '#ffffff', { align: 'center' });
  }
  crane(x: CanvasRenderingContext2D, t: number, s: Shot) {
    stage(x, t);
    // the crane
    x.strokeStyle = INK; x.lineWidth = 6;
    box(x, 470, 140, 40, FLOOR - 140, YELLOW, 2, LW);
    for (let y = 160; y < FLOOR; y += 60) { x.beginPath(); x.moveTo(470, y); x.lineTo(510, y + 60); x.stroke(); }
    box(x, 120, 120, 820, 36, YELLOW, 2, LW);
    const hx = 260 + 40 * Math.sin((t - s.t0) * 1.4);
    x.beginPath(); x.moveTo(hx, 156); x.lineTo(hx, 520); x.stroke();
    box(x, hx - 60, 520, 120, 26, '#8a8a92', 4, 3);
    this.shack(x, 260, FLOOR + 10, -0.05);
    box(x, 380, FLOOR - 330, 120, 60, '#ffffff', 6, 3); txt(x, 'FATTO!', 440, FLOOR - 290, 26, F.mono(700), INK, { align: 'center' });
    this.blueprint(x, 800, 560, 'COSA VOLEVI');
    critter(x, 700, FLOOR + 70, 11, t, { hat: 'hard' });
    sticker(x, t, this.w.sbagliata - 0.05, 'COSA SBAGLIATA', 540, 330, { fill: RED, size: 34, rot: -0.07 });
  }

  board(x: CanvasRenderingContext2D, t: number, s: Shot) {
    wall(x, '#eee6d6');
    chalkboard(x, 70, 120, 600, 340);
    txt(x, 'IA = STUPIDA ?', 110, 230, 46, F.mono(700), '#f4f1e8');
    txt(x, 'QI:', 110, 320, 34, F.mono(600), '#cfd8cf');
    const iq = clamp((t - s.t0) / 0.8);
    x.fillStyle = '#5f6f62'; x.fillRect(190, 292, 330, 30); x.fillStyle = '#e8d36a'; x.fillRect(190, 292, 330 * (0.15 + 0.7 * iq), 30);
    const no = this.w.stupida + 0.25;
    if (t >= no) { x.save(); x.globalAlpha = k(t, no, 0.15); cross(x, 400, 214, 120, RED, 12); x.restore(); }
    sticker(x, t, no + 0.15, 'NON È STUPIDA', 380, 520, { fill: GREEN, size: 34, rot: -0.05 });
    // books and the creature on them
    const bc = ['#3d7fd6', '#e0493b', '#3fae6a', '#f2c14e', '#7c5ce0'];
    bc.forEach((c, i) => box(x, 760 - (i % 2) * 14, FLOOR - 40 - i * 40, 220, 40, c, 4, 3));
    critter(x, 870, FLOOR - 200, 12, t, { hat: 'grad', face: 'cool' });
    if (t >= no) {
      const e = pop(t, no + 0.1);
      at(x, 870, FLOOR - 400, e, 0, () => { x.beginPath(); x.arc(870, FLOOR - 420, 40, 0, TAU); x.fillStyle = '#ffe680'; x.fill(); x.lineWidth = 3; x.strokeStyle = INK; x.stroke(); box(x, 852, FLOOR - 384, 36, 26, '#b8b8c0', 4, 3); });
    }
  }

  wreck(x: CanvasRenderingContext2D, t: number, s: Shot) {
    stage(x, t);
    const u = k(t, s.t0 + 0.2, 0.6);
    this.shack(x, 400, FLOOR + 10, -ease.inCubic(u) * 0.9);
    for (let i = 0; i < 6; i++) if (u > 0.6) { const v = k(t, s.t0 + 0.6, 1); box(x, 300 + i * 60 + v * (i - 2.5) * 120, FLOOR - 40 - v * 200 + v * v * 260, 40, 18, i % 2 ? RED : '#d9b98a', 2, 2); }
    this.blueprint(x, 820, 520, 'COSA VOLEVI');
    critter(x, 160, FLOOR + 70, 12, t, { hat: 'hard', face: 'squint' });
    sticker(x, t, s.t0 + 0.5, 'DI NUOVO SBAGLIATA', 470, 260, { fill: RED, size: 34, rot: 0.05 });
  }

  vague(x: CanvasRenderingContext2D, t: number, s: Shot) {
    wall(x, '#efe7da');
    box(x, 330, 160, 420, 330, '#2f5fb5', 6, LW);
    txt(x, '???', 540, 360, 110, F.mono(700), '#ffffff', { align: 'center' });
    txt(x, 'IL PIANO', 540, 460, 26, F.mono(600), '#cfe0ff', { align: 'center' });
    at(x, 250, 640, 1, -0.08, () => { box(x, 150, 560, 210, 160, '#fff1a6', 3, 3); txt(x, "un'app per", 255, 620, 24, F.mono(500), INK, { align: 'center' }); txt(x, 'le note pls', 255, 656, 24, F.mono(500), INK, { align: 'center' }); });
    x.fillStyle = INK; x.fillRect(536, 490, 8, FLOOR - 490);
    x.beginPath(); x.arc(110, 140, 56, 0, TAU); x.fillStyle = '#ffffff'; x.fill(); x.lineWidth = LW; x.strokeStyle = INK; x.stroke();
    x.beginPath(); x.moveTo(110, 140); x.lineTo(110 + Math.cos(t * 2) * 40, 140 + Math.sin(t * 2) * 40); x.moveTo(110, 140); x.lineTo(140, 140); x.stroke();
    const pct = Math.round(lerp(5, 12, k(t, s.t0, 1.5)));
    box(x, 820, 120, 200, 40, '#ffffff', 20, 3); x.fillStyle = RED; x.fillRect(826, 126, 188 * pct / 100, 28); txt(x, `${pct}%`, 1000, 152, 22, F.mono(700), INK, { align: 'right' });
    critter(x, 160, FLOOR + 70, 11, t, { hat: 'cap', a: BLUE }); critter(x, 900, FLOOR + 70, 11, t, { hat: 'beanie', a: RED });
    bubble(x, t, s.t0 + 0.2, '?', 860, 640, 34, -1); bubble(x, t, s.t0 + 0.5, '?', 230, 820, 30);
    sticker(x, t, this.w.volevi, 'TROPPO VAGO', 540, 760, { fill: RED, size: 54, rot: -0.07 });
  }

  builder(x: CanvasRenderingContext2D, t: number, s: Shot) {
    wall(x, '#e9dfcf');
    box(x, 120, 120, 840, 330, '#c9a77a', 6, LW);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) { x.beginPath(); x.arc(170 + i * 105, 170 + j * 80, 6, 0, TAU); x.fillStyle = '#8f7350'; x.fill(); }
    box(x, 200, 200, 30, 140, '#9aa0a8', 4, 3); box(x, 380, 210, 120, 30, '#9aa0a8', 4, 3); box(x, 700, 200, 40, 160, RED, 4, 3);
    box(x, 260, FLOOR - 200, 560, 40, '#8a5a34', 4, LW); x.fillStyle = '#6f4527'; x.fillRect(300, FLOOR - 160, 30, 160); x.fillRect(750, FLOOR - 160, 30, 160);
    const e = pop(t, s.t0 + 0.1);
    at(x, 480, FLOOR - 270, e, 0, () => { box(x, 390, FLOOR - 350, 180, 150, '#d7a75c', 6, LW); txt(x, 'SKILL', 480, FLOOR - 262, 34, F.mono(700), INK, { align: 'center' }); });
    critter(x, 690, FLOOR - 200, 13, t, { hat: 'hard' });
    const hit = Math.abs(Math.sin((t - s.t0) * 7));
    at(x, 640, FLOOR - 320, 1, -1.2 + hit * 1.0, () => { box(x, 632, FLOOR - 420, 16, 110, '#7a4a28', 4, 3); box(x, 600, FLOOR - 440, 80, 36, '#6b6f78', 6, 3); });
    if (hit > 0.92) for (let i = 0; i < 6; i++) { const a = i * 1.05 + t; star(x, 580 + Math.cos(a) * 50, FLOOR - 330 + Math.sin(a) * 40, 9, YELLOW, 0); }
    sticker(x, t, s.t0 + 0.4, 'DI MATT POCOCK', 800, 520, { fill: BLUE, size: 30, rot: 0.06 });
  }

  grill(x: CanvasRenderingContext2D, t: number, s: Shot) {
    stage(x, t, { c1: '#f7ecdf', c2: '#f0e0cf' });
    box(x, 50, 120, 380, 120, '#ffffff', 10, 3);
    txt(x, '/grill-me', 80, 160, 20, F.mono(500), '#8b8f95'); txt(x, 'SUL MENU', 240, 214, 34, F.mono(700), INK, { align: 'center' });
    sticker(x, t, s.t0 + 0.1, 'GRILL-ME', 820, 120, { fill: RED, size: 58, rot: 0.04 });
    // the grill
    for (const [lx, rot] of [[420, 0.2], [660, -0.2]] as const) at(x, lx, FLOOR - 120, 1, rot, () => { x.fillStyle = INK; x.fillRect(lx - 6, FLOOR - 260, 12, 240); });
    for (const wx of [400, 680]) { x.beginPath(); x.arc(wx, FLOOR - 30, 24, 0, TAU); x.fillStyle = '#4a4850'; x.fill(); x.lineWidth = 3; x.strokeStyle = INK; x.stroke(); }
    for (let i = 0; i < 7; i++) {
      const fh = 90 + 40 * Math.sin(t * 9 + i * 1.7), fx = 380 + i * 55;
      x.beginPath(); x.moveTo(fx - 26, FLOOR - 380); x.quadraticCurveTo(fx - 10, FLOOR - 380 - fh * 0.6, fx, FLOOR - 380 - fh); x.quadraticCurveTo(fx + 10, FLOOR - 380 - fh * 0.6, fx + 26, FLOOR - 380); x.closePath();
      x.fillStyle = i % 2 ? '#f2a03c' : YELLOW; x.fill(); x.lineWidth = 3; x.strokeStyle = INK; x.stroke();
    }
    x.beginPath(); x.moveTo(330, FLOOR - 380); x.lineTo(750, FLOOR - 380); x.arc(540, FLOOR - 380, 210, 0, Math.PI); x.closePath(); x.fillStyle = '#2b2a30'; x.fill(); x.lineWidth = LW; x.strokeStyle = INK; x.stroke();
    x.fillStyle = '#9a9aa2'; x.fillRect(320, FLOOR - 392, 440, 12);
    // the plan, hopping on the grate
    const hop = Math.abs(Math.sin((t - s.t0) * 6)) * 90;
    at(x, 540, FLOOR - 470 - hop, 1, 0.2 * Math.sin(t * 5), () => {
      box(x, 480, FLOOR - 540 - hop, 120, 140, '#ffffff', 6, 3);
      txt(x, 'PIANO', 540, FLOOR - 500 - hop, 20, F.mono(700), RED, { align: 'center' });
      x.fillStyle = INK; x.fillRect(512, FLOOR - 478 - hop, 10, 10); x.fillRect(556, FLOOR - 478 - hop, 10, 10);
    });
    critter(x, 160, FLOOR + 70, 13, t, { hat: 'chef', face: 'happy' }); critter(x, 920, FLOOR + 70, 13, t, { hat: 'chef' });
  }

  editor(x: CanvasRenderingContext2D, t: number, s: Shot) {
    wall(x, '#efe7da');
    box(x, 150, 110, 780, 470, '#ffffff', 14, LW);
    x.fillStyle = '#f1efec'; x.fillRect(152, 112, 776, 48);
    txt(x, 'app.ts  —  0 righe', 540, 146, 24, F.mono(500), '#5d5a57', { align: 'center' });
    for (let i = 1; i <= 8; i++) txt(x, String(i), 190, 160 + i * 48, 22, F.mono(400), '#b0aca6', { align: 'right' });
    if (Math.floor(t * 2.4) % 2 === 0) { x.fillStyle = INK; x.fillRect(220, 186, 4, 30); }
    // the keyboard with a padlock
    box(x, 240, FLOOR - 200, 600, 130, '#d8d4ce', 12, LW);
    for (let r = 0; r < 3; r++) for (let i = 0; i < 12; i++) box(x, 262 + i * 47, FLOOR - 186 + r * 40, 38, 30, '#f7f5f2', 4, 2);
    const e = pop(t, s.t0 + 0.25);
    at(x, 540, FLOOR - 160, e, 0, () => { box(x, 505, FLOOR - 190, 70, 60, YELLOW, 8, 3); x.beginPath(); x.arc(540, FLOOR - 190, 22, Math.PI, 0); x.lineWidth = 8; x.strokeStyle = INK; x.stroke(); });
    const se = pop(t, s.t0 + 0.15);
    at(x, 880, 520, se, 0, () => {
      x.fillStyle = INK; x.fillRect(874, 520, 12, FLOOR - 520);
      x.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i * TAU) / 8; x.lineTo(880 + Math.cos(a) * 90, 470 + Math.sin(a) * 90); } x.closePath();
      x.fillStyle = RED; x.fill(); x.lineWidth = LW; x.strokeStyle = INK; x.stroke();
      txt(x, 'STOP', 880, 486, 44, F.mono(700), '#ffffff', { align: 'center' });
    });
    sticker(x, t, this.w.riga, '0 RIGHE', 330, 660, { fill: INK, size: 36, rot: -0.04 });
    critter(x, 140, FLOOR + 70, 11, t, { hat: 'cap', a: GREEN });
  }

  questions(x: CanvasRenderingContext2D, t: number, s: Shot) {
    wall(x, '#efe7da');
    const q = ['D1: email e password, o accesso con Google?', 'D2: cosa succede dopo 5 tentativi?', 'D3: dove tieni le sessioni?', "D4: chi può resettare un account?"];
    const t0 = s.t0 + 0.1;
    terminal(x, t, 60, 110, 960, 520, 'claude  —  ~/mia-app', [
      ['> /grill-me aggiungi il login', '#e8e6ea', t0 - 0.6],
      ...q.map((l, i) => [l, '#f0a37a', t0 + 0.25 + i * 0.55] as [string, string, number]),
    ], { size: 25, cps: 60 });
    const n = q.filter((_, i) => t >= t0 + 0.25 + i * 0.55).length;
    box(x, 860, 650, 150, 70, '#ffffff', 10, 3); txt(x, `D: ${n}`, 935, 698, 34, F.mono(700), INK, { align: 'center' });
    critter(x, 920, FLOOR + 70, 12, t, { hat: 'grad' });
    critter(x, 200, FLOOR + 70, 11, t, { hat: 'cap', a: BLUE, face: 'squint' });
    bubble(x, t, t0 + 0.6, 'PERCHÉ?', 420, 780, 30, -1);
  }

  plan(x: CanvasRenderingContext2D, t: number, s: Shot) {
    wall(x, '#efe7da');
    box(x, 180, 110, 560, 560, '#ffffff', 10, LW);
    box(x, 180, 110, 560, 80, '#2f5fb5', 10, LW);
    txt(x, 'IL TUO PIANO', 460, 164, 36, F.mono(700), '#ffffff', { align: 'center' });
    const items = ['Accesso: Google', 'Blocco: 5 tentativi', 'Sessioni: Redis', 'Reset: solo admin', 'Errori: avviso'];
    const span = Math.max(0.6, s.t1 - s.t0 - 0.4);
    items.forEach((it2, i) => {
      const ti = s.t0 + 0.15 + (i / items.length) * span, on = t >= ti, iy = 250 + i * 86;
      box(x, 220, iy - 32, 44, 44, on ? '#e6f6ec' : '#ffffff', 6, 3);
      if (on) tick(x, 242, iy - 10, 30, GREEN, 6);
      txt(x, it2, 290, iy, 30, F.mono(600), on ? INK : '#b9b4ad');
    });
    x.fillStyle = INK; x.fillRect(450, 670, 10, FLOOR - 670);
    critter(x, 880, FLOOR + 70, 13, t, { hat: 'grad', face: 'happy' });
  }

  tdd(x: CanvasRenderingContext2D, t: number, s: Shot) {
    wall(x, '#eee7db');
    chalkboard(x, 50, 100, 700, 420);
    const code = ["test('login', () => {", "  expect(login()).toBe('ok')", '})'];
    code.forEach((l, i) => { const n = Math.floor(clamp((t - s.t0 - 0.1) * 40 - i * 18, 0, l.length)); txt(x, l.slice(0, n), 90, 190 + i * 52, 30, F.mono(500), '#f4f1e8'); });
    const w = this.w, fail = t >= w.fallisce - 0.05, pass = t >= w.passare - 0.05;
    if (pass) { tick(x, 250, 410, 50, '#6fe39a', 9); txt(x, 'PASSA', 300, 428, 52, F.mono(700), '#6fe39a'); }
    else if (fail) { cross(x, 250, 410, 44, '#ff7a6b', 9); txt(x, 'FALLISCE', 300, 428, 52, F.mono(700), '#ff7a6b'); }
    trafficLight(x, 900, 200, pass ? 2 : fail ? 0 : 1);
    critter(x, 230, FLOOR + 70, 13, t, { hat: 'hard' });
    critter(x, 560, FLOOR + 70, 12, t, { hat: 'cap', a: BLUE, face: pass ? 'happy' : 'normal' });
    if (pass) { confetti(x, t, w.passare, 300, 300); sticker(x, t, w.passare + 0.1, 'VERDE ✓', 660, 120, { fill: GREEN, size: 38, rot: 0.05 }); }
  }

  bugs(x: CanvasRenderingContext2D, t: number, s: Shot) {
    stage(x, t);
    box(x, 80, FLOOR - 190, 920, 70, '#3a3940', 35, LW);
    for (let i = 0; i < 12; i++) { x.beginPath(); x.arc(120 + i * 76, FLOOR - 155, 22, 0, TAU); x.fillStyle = '#6b6a72'; x.fill(); x.lineWidth = 3; x.strokeStyle = INK; x.stroke(); }
    x.fillStyle = INK; x.fillRect(150, FLOOR - 120, 16, 120); x.fillRect(910, FLOOR - 120, 16, 120);
    const bxp = 150 + ((t - s.t0) * 160) % 760;
    this.bug(x, bxp, FLOOR - 220, 1);
    const mx = bxp + 30, my = FLOOR - 330;
    x.beginPath(); x.arc(mx, my, 80, 0, TAU); x.fillStyle = 'rgba(190,225,255,0.45)'; x.fill(); x.lineWidth = 12; x.strokeStyle = INK; x.stroke();
    x.lineWidth = 18; x.beginPath(); x.moveTo(mx + 56, my + 56); x.lineTo(mx + 130, my + 130); x.stroke();
    sticker(x, t, s.t0 + 0.2, 'DIAGNOSING-BUGS', 540, 200, { fill: BLUE, size: 40, rot: -0.04 });
    crowd(x, t, [140, 940], 10, FLOOR + 70, 3);
  }
  bug(x: CanvasRenderingContext2D, cx: number, cy: number, s: number, rot = 0) {
    at(x, cx, cy, s, rot, () => {
      x.strokeStyle = INK; x.lineWidth = 4;
      for (const sd of [-1, 1]) for (let i = -1; i <= 1; i++) { x.beginPath(); x.moveTo(cx + i * 22, cy); x.lineTo(cx + i * 30, cy + sd * 44); x.stroke(); }
      x.beginPath(); x.ellipse(cx, cy, 44, 30, 0, 0, TAU); x.fillStyle = RED; x.fill(); x.stroke();
      x.beginPath(); x.arc(cx + 46, cy, 16, 0, TAU); x.fillStyle = INK; x.fill();
      x.beginPath(); x.moveTo(cx - 40, cy); x.lineTo(cx + 40, cy); x.stroke();
      for (const [dx, dy] of [[-16, -12], [12, 12], [18, -10]] as const) { x.beginPath(); x.arc(cx + dx, cy + dy, 6, 0, TAU); x.fillStyle = INK; x.fill(); }
    });
  }

  loop(x: CanvasRenderingContext2D, t: number, s: Shot) {
    stage(x, t);
    const cx = 540, cy = 540, rx = 400, ry = 300;
    x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, TAU); x.lineWidth = 14; x.strokeStyle = INK; x.stroke();
    x.setLineDash([24, 18]); x.lineWidth = 4; x.strokeStyle = '#ffffff'; x.stroke(); x.setLineDash([]);
    txt(x, 'CICLO', cx, cy + 22, 64, F.mono(700), INK, { align: 'center' });
    const st = ['1 RIPRODUCI', '2 RIDUCI', '3 IPOTESI', '4 MISURA', '5 CORREGGI', '6 TEST'];
    const a0 = -Math.PI / 2, u = (t - s.t0) * 1.1;
    st.forEach((l, i) => {
      const a = a0 + (i / 6) * TAU, px = cx + Math.cos(a) * rx, py = cy + Math.sin(a) * ry;
      const lit = ((u / TAU) * 6) % 6 >= i && t - s.t0 < 4;
      sticker(x, t, s.t0 + 0.1 + i * 0.15, l, px, py, { fill: lit ? [RED, ORANGE, YELLOW, BLUE, PURPLE, GREEN][i]! : '#8a857e', size: 28, rot: (i % 2 ? 0.04 : -0.04), ink: lit && i === 2 ? INK : '#ffffff' });
    });
    const ba = a0 + u;
    this.bug(x, cx + Math.cos(ba) * rx, cy + Math.sin(ba) * ry, 0.7, ba + Math.PI / 2);
  }

  arch(x: CanvasRenderingContext2D, t: number, s: Shot) {
    stage(x, t);
    box(x, 70, 130, 560, 150, '#ffffff', 12, 3);
    txt(x, '/improve-codebase-architecture', 100, 180, 22, F.mono(500), '#8b8f95');
    txt(x, "Trova i moduli da sistemare", 100, 228, 28, F.poppins(600), INK);
    txt(x, 'con un report visivo', 100, 262, 24, F.poppins(500), '#6a6f76');
    this.blueprint(x, 800, 560, 'ARCHITETTURA');
    critter(x, 300, FLOOR + 70, 13, t, { hat: 'hard' });
    sticker(x, t, s.t0 + 0.3, 'SKILL #4', 360, 380, { fill: PURPLE, size: 38, rot: -0.05 });
  }

  city(x: CanvasRenderingContext2D, t: number, s: Shot) {
    sky(x, t);
    const bl: [string, number, number, string][] = [['src/', 120, 420, '#e8b8a4'], ['api/', 320, 560, '#f2d39a'], ['utils/', 520, 480, '#bcd6f0'], ['db/', 720, 380, '#c9e2c4'], ['ui/', 900, 460, '#e2c9ef']];
    bl.forEach(([n, bx, bh, c]) => {
      box(x, bx - 80, FLOOR - bh, 160, bh, c, 4, LW);
      for (let r = 0; r < Math.floor(bh / 60); r++) for (let i = 0; i < 3; i++) box(x, bx - 60 + i * 44, FLOOR - bh + 24 + r * 60, 28, 34, '#fffdf6', 2, 2);
      txt(x, n, bx, FLOOR - bh - 18, 28, F.mono(700), INK, { align: 'center' });
    });
    const u = k(t, s.t0 + 0.1, Math.max(0.6, s.t1 - s.t0 - 0.5));
    const mx = lerp(120, 900, u), my = 420 + 60 * Math.sin(u * 6);
    x.beginPath(); x.arc(mx, my, 100, 0, TAU); x.fillStyle = 'rgba(190,225,255,0.4)'; x.fill(); x.lineWidth = 14; x.strokeStyle = INK; x.stroke();
    x.lineWidth = 20; x.beginPath(); x.moveTo(mx + 70, my + 70); x.lineTo(mx + 150, my + 150); x.stroke();
    box(x, 820, 110, 200, 56, '#ffffff', 10, 3); txt(x, `SCAN ${Math.round(u * 100)}%`, 920, 148, 28, F.mono(700), INK, { align: 'center' });
    if (u > 0.4) { x.strokeStyle = RED; x.lineWidth = 4; x.beginPath(); for (let i = 0; i < 18; i++) x.lineTo(270 + hash(i, 5) * 100, FLOOR - 520 + hash(i, 6) * 300); x.stroke(); sticker(x, t, s.t0 + 0.1 + 0.4 * (s.t1 - s.t0), 'AGGROVIGLIATO!', 330, 300, { fill: RED, size: 30, rot: -0.06 }); }
  }

  report(x: CanvasRenderingContext2D, t: number, s: Shot) {
    stage(x, t);
    box(x, 160, 90, 760, 470, '#ffffff', 12, LW);
    box(x, 160, 90, 760, 74, PURPLE, 12, LW);
    txt(x, 'REPORT ARCHITETTURA', 540, 140, 34, F.mono(700), '#ffffff', { align: 'center', track: 3 });
    const rows: [string, string, string, number][] = [['auth/', 'aggrovigliato', RED, 0.3], ['api/', 'superficiale', YELLOW, 0.5], ['utils/', 'profondo', GREEN, 0.9], ['db/', 'ok', GREEN, 0.8], ['ui/', 'duplicato', RED, 0.25]];
    rows.forEach(([n, d, c, v], i) => {
      const ry = 220 + i * 70, on = k(t, s.t0 + 0.1 + i * 0.12, 0.35);
      txt(x, n, 200, ry, 28, F.mono(700), INK); txt(x, d, 330, ry, 26, F.mono(500), '#4b5056');
      box(x, 640, ry - 26, 240, 30, '#eeeae4', 15, 2); if (on > 0) { rr(x, 640, ry - 26, 240 * v * on, 30, 15); x.fillStyle = c; x.fill(); }
      if (c === GREEN) tick(x, 610, ry - 12, 26, GREEN, 5); else cross(x, 610, ry - 12, 22, RED, 5);
    });
    sticker(x, t, this.w.sistemare, 'DA SISTEMARE', 760, 600, { fill: RED, size: 40, rot: -0.08 });
    box(x, 880, FLOOR - 170, 130, 170, '#8f949c', 8, LW); txt(x, 'CESTINO', 945, FLOOR - 90, 22, F.mono(700), '#ffffff', { align: 'center' });
    critter(x, 640, FLOOR + 70, 13, t, { hat: 'cap', a: GREEN });
    const sw = Math.sin((t - s.t0) * 8) * 0.5;
    at(x, 740, FLOOR - 120, 1, sw, () => { box(x, 734, FLOOR - 300, 12, 200, '#a8743f', 4, 3); box(x, 714, FLOOR - 110, 52, 40, YELLOW, 6, 3); });
    for (let i = 0; i < 3; i++) { const u = ((t - s.t0) * 1.4 + i / 3) % 1; box(x, lerp(780, 930, u), FLOOR - 120 - Math.sin(u * Math.PI) * 140, 30, 20, ['#5d4a3a', '#7a6a5a', '#4a3f35'][i]!, 3, 2); }
  }

  clock(x: CanvasRenderingContext2D, t: number, s: Shot) {
    wall(x, '#efe7da');
    box(x, 340, 90, 400, 60, '#ffffff', 10, 3); txt(x, 'Installazione (30 secondi)', 540, 130, 24, F.mono(600), INK, { align: 'center' });
    const cx = 540, cy = 430, r = 210, sec = Math.min(30, (t - s.t0) * 14);
    x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fillStyle = '#ffffff'; x.fill(); x.lineWidth = 8; x.strokeStyle = INK; x.stroke();
    x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, r - 16, -Math.PI / 2, -Math.PI / 2 + (sec / 60) * TAU); x.closePath(); x.fillStyle = 'rgba(63,174,106,0.35)'; x.fill();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; x.beginPath(); x.moveTo(cx + Math.cos(a) * (r - 30), cy + Math.sin(a) * (r - 30)); x.lineTo(cx + Math.cos(a) * (r - 12), cy + Math.sin(a) * (r - 12)); x.lineWidth = 5; x.stroke(); }
    x.beginPath(); x.moveTo(cx, cy); const ha = -Math.PI / 2 + (sec / 60) * TAU; x.lineTo(cx + Math.cos(ha) * (r - 40), cy + Math.sin(ha) * (r - 40)); x.lineWidth = 8; x.strokeStyle = RED; x.stroke();
    txt(x, `${Math.floor(sec)}s`, cx, cy + 90, 54, F.mono(700), INK, { align: 'center' });
    box(x, 520, 120 + 18, 40, 30, INK, 4, 0);
    x.fillStyle = '#c75b45'; x.fillRect(0, FLOOR - 10, W, 60); x.fillStyle = '#ffffff'; for (let i = 0; i < 14; i++) x.fillRect(i * 90, FLOOR + 16, 50, 6);
    critter(x, lerp(-100, 1180, k(t, s.t0, s.t1 - s.t0)), FLOOR + 6, 10, t, { walk: true, hat: 'cap', a: RED });
  }

  keyboard(x: CanvasRenderingContext2D, t: number, cx: number, y: number) {
    box(x, cx - 330, y, 660, 150, '#d8d4ce', 14, LW);
    for (let r = 0; r < 3; r++) for (let i = 0; i < 13; i++) {
      const on = hash(Math.floor(t * 12), r * 13 + i) > 0.9;
      box(x, cx - 308 + i * 49, y + 18 + r * 42, 40, 32, on ? '#ffd27a' : '#f7f5f2', 5, 2);
    }
  }
  term(x: CanvasRenderingContext2D, t: number, s: Shot) {
    wall(x, '#ece5da');
    const t0 = s.t0 + 0.25;
    const cmd = '> claude plugin install mattpocock-skills@claude-plugins-official';
    const done = t0 + cmd.length / 34 + 0.5;
    terminal(x, t, 40, 90, 1000, 440, 'terminale', [
      ['Bentornato!', '#d9714a', s.t0 - 1],
      [cmd, '#e8e6ea', t0],
      ['installato dal marketplace ufficiale', '#6fe39a', done],
      ['27 skill: grill-me, tdd, diagnosing-bugs...', '#a9a6b0', done + 0.3],
    ], { size: 21, cps: 34 });
    const p = k(t, t0 + 0.4, done - t0 - 0.4);
    box(x, 600, 470, 400, 30, '#2c2b33', 15, 2); rr(x, 600, 470, 400 * p, 30, 15); x.fillStyle = GREEN; x.fill();
    txt(x, `${Math.round(p * 100)}%`, 980, 494, 20, F.mono(700), '#ffffff', { align: 'right' });
    this.keyboard(x, t, 540, FLOOR - 230);
    critter(x, 540, FLOOR + 70, 12, t, { hat: 'cap', a: BLUE });
  }

  market(x: CanvasRenderingContext2D, t: number, s: Shot) {
    stage(x, t);
    box(x, 160, 220, 760, 90, '#ffffff', 6, LW);
    txt(x, 'MARKETPLACE UFFICIALE', 540, 280, 40, F.mono(700), INK, { align: 'center', track: 2 });
    for (let i = 0; i < 10; i++) {
      x.beginPath(); x.moveTo(140 + i * 80, 310); x.lineTo(220 + i * 80, 310); x.lineTo(220 + i * 80, 380); x.arc(180 + i * 80, 380, 40, 0, Math.PI); x.closePath();
      x.fillStyle = i % 2 ? '#ffffff' : RED; x.fill(); x.lineWidth = 3; x.strokeStyle = INK; x.stroke();
    }
    x.fillStyle = INK; x.fillRect(170, 310, 14, FLOOR - 310); x.fillRect(896, 310, 14, FLOOR - 310);
    box(x, 200, 560, 680, 24, '#a8743f', 3, 3);
    [RED, BLUE, GREEN, YELLOW, PURPLE, ORANGE].forEach((c, i) => { box(x, 230 + i * 108, 470, 70, 90, '#fffdf7', 10, 3); box(x, 226 + i * 108, 456, 78, 26, c, 4, 3); });
    critter(x, 540, FLOOR - 80, 13, t, { hat: 'beanie', a: RED });
    box(x, 160, FLOOR - 230, 760, 230, '#c48b52', 6, LW);
    const e = pop(t, this.w.ufficiale, 0.35, 2.4);
    at(x, 890, 150, e, -0.2, () => {
      x.beginPath(); for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU, r = i % 2 ? 86 : 100; x.lineTo(890 + Math.cos(a) * r, 150 + Math.sin(a) * r); } x.closePath();
      x.fillStyle = YELLOW; x.fill(); x.lineWidth = 3; x.strokeStyle = INK; x.stroke();
      txt(x, 'UFFICIALE', 890, 162, 26, F.mono(700), INK, { align: 'center' });
    });
    void s;
  }

  robot(x: CanvasRenderingContext2D, t: number, s: Shot) {
    x.fillStyle = '#e3efdf'; x.fillRect(0, 0, W, SEAM);
    x.fillStyle = '#d2e4cc'; for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(100 + i * 190, 140 + (i % 2) * 40, 60, 0, TAU); x.fill(); }
    x.fillStyle = '#cbbfa8'; x.fillRect(0, FLOOR, W, SEAM - FLOOR);
    box(x, 700, 480, 320, 30, '#a8743f', 3, 3); txt(x, '.agents/skills', 860, 545, 26, F.mono(600), INK, { align: 'center' });
    [0, 1, 2].forEach((i) => box(x, 730 + i * 90, 400, 60, 80, '#fffdf7', 8, 3));
    const u = ((t - s.t0) * 0.6) % 1, ang = lerp(-0.9, 0.7, ease.inOutCubic(Math.min(1, u * 1.4)));
    box(x, 200, FLOOR - 60, 160, 60, '#6b6f78', 10, LW);
    at(x, 280, FLOOR - 60, 1, ang, () => {
      box(x, 262, FLOOR - 400, 36, 340, ORANGE, 10, LW);
      at(x, 280, FLOOR - 400, 1, 0.9 - ang, () => { box(x, 262, FLOOR - 400, 300, 36, ORANGE, 10, LW); box(x, 540, FLOOR - 430, 60, 90, '#fffdf7', 8, 3); box(x, 536, FLOOR - 444, 68, 24, GREEN, 4, 3); });
    });
    const ra = (t - s.t0) * 3;
    x.lineWidth = 10; x.strokeStyle = GREEN; x.beginPath(); x.arc(860, 230, 70, ra, ra + 4.6); x.stroke();
    sticker(x, t, s.t0 + 0.3, 'SI AGGIORNA DA SOLO', 540, 120, { fill: GREEN, size: 36, rot: -0.04 });
  }

  agents(x: CanvasRenderingContext2D, t: number, s: Shot) {
    stage(x, t);
    for (const [px, d, label] of [[300, 0.15, 'Cursor'], [780, 0.45, 'altri agenti']] as const) {
      box(x, px - 110, FLOOR - 260, 220, 260, '#f7f5f1', 4, LW); box(x, px - 130, FLOOR - 290, 260, 36, '#ffffff', 4, LW);
      const e = k(t, s.t0 + d, 0.35), y = lerp(-200, FLOOR - 420, ease.outBack(e, 1.6));
      if (e > 0) {
        box(x, px - 70, y - 70, 140, 140, '#1f1d22', 26, LW);
        if (label === 'Cursor') { x.beginPath(); x.moveTo(px - 26, y - 40); x.lineTo(px + 34, y + 6); x.lineTo(px + 4, y + 10); x.lineTo(px + 18, y + 40); x.lineTo(px + 4, y + 46); x.lineTo(px - 10, y + 16); x.lineTo(px - 26, y + 30); x.closePath(); x.fillStyle = '#ffffff'; x.fill(); }
        else txt(x, '>_', px, y + 20, 64, F.mono(700), '#ffffff', { align: 'center' });
        txt(x, label, px, FLOOR - 200, 30, F.mono(700), INK, { align: 'center' });
      }
    }
    critter(x, 540, FLOOR + 70, 12, t, { hat: 'cap', a: BLUE, flip: Math.sin(t * 2) > 0 });
  }

  npx(x: CanvasRenderingContext2D, t: number, s: Shot) {
    wall(x, '#ece5da');
    const cmd = '$ npx skills@latest add mattpocock/skills';
    const t0 = this.w.npx - 0.2, done = t0 + cmd.length / 30 + 0.2;
    terminal(x, t, 60, 110, 960, 380, 'terminale', [
      [cmd, '#e8e6ea', t0],
      ['+ trovate 27 skill', '#6fe39a', done],
      ['+ aggiunte in .agents/skills', '#6fe39a', done + 0.3],
    ], { size: 28, cps: 30 });
    box(x, 260, 560, 560, 70, '#ffffff', 12, 3); txt(x, 'npx skills@latest add mattpocock/skills', 540, 605, 22, F.mono(500), INK, { align: 'center' });
    sticker(x, t, s.t0 + 0.4, 'COPIATO', 820, 540, { fill: INK, size: 26, rot: 0.05 });
    const cx = lerp(980, 760, k(t, s.t0 + 0.1, 0.3)), cy = lerp(780, 610, k(t, s.t0 + 0.1, 0.3));
    x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + 40, cy + 40); x.lineTo(cx + 16, cy + 42); x.lineTo(cx + 26, cy + 66); x.lineTo(cx + 14, cy + 70); x.lineTo(cx + 4, cy + 46); x.lineTo(cx - 12, cy + 58); x.closePath();
    x.fillStyle = '#ffffff'; x.fill(); x.lineWidth = 3; x.strokeStyle = INK; x.stroke();
    critter(x, 200, FLOOR + 70, 11, t, { hat: 'cap', a: GREEN }); critter(x, 880, FLOOR + 70, 11, t, { hat: 'beanie', a: PURPLE });
  }

  folder(x: CanvasRenderingContext2D, t: number, s: Shot) {
    stage(x, t);
    box(x, 520, 150, 170, 60, YELLOW, 10, LW);
    box(x, 520, 190, 460, 280, YELLOW, 12, LW); txt(x, 'mia-app', 750, 360, 40, F.mono(700), INK, { align: 'center' });
    box(x, 560, 500, 420, 300, '#ffffff', 10, LW);
    txt(x, '.agents/skills/', 590, 548, 24, F.mono(600), '#5d5a57');
    const names = ['grill-me', 'tdd', 'diagnosing-bugs', 'improve-codebase-arch…', 'setup-matt-pocock-…'];
    const per = Math.max(0.12, (s.t1 - s.t0 - 0.3) / names.length);
    names.forEach((n, i) => {
      const ti = s.t0 + 0.1 + i * per;
      if (t < ti) return;
      box(x, 590, 572 + i * 44, 26, 26, [RED, YELLOW, BLUE, PURPLE, ORANGE][i]!, 4, 2);
      txt(x, n, 630, 594 + i * 44, 22, F.mono(500), INK); tick(x, 950, 584 + i * 44, 22, GREEN, 5);
    });
    box(x, 80, FLOOR - 170, 300, 170, RED, 10, LW); txt(x, 'mattpocock/skills', 230, FLOOR - 70, 22, F.mono(700), '#ffffff', { align: 'center' });
    for (let i = 0; i < 4; i++) { const u = ((t - s.t0) * 1.6 + i / 4) % 1; box(x, lerp(260, 700, u), FLOOR - 200 - Math.sin(u * Math.PI) * 380, 40, 40, [RED, BLUE, GREEN, PURPLE][i]!, 6, 3); }
    const n = Math.min(27, Math.floor(5 + (t - s.t0) * 20));
    sticker(x, t, s.t0 + 0.1, `${n} DI 27 SKILL`, 260, 160, { fill: ORANGE, size: 30, rot: -0.05 });
    critter(x, 420, FLOOR + 70, 11, t, { hat: 'cap', a: BLUE });
  }

  setup(x: CanvasRenderingContext2D, t: number, s: Shot) {
    wall(x, '#ece5da');
    const t0 = s.t0 + 0.2;
    terminal(x, t, 40, 90, 1000, 460, 'claude  —  ~/mia-app', [
      ['> /setup-matt-pocock-skills', '#e8e6ea', t0],
      ['? Quale issue tracker usi?', '#f0a37a', t0 + 1.1],
      ['  GitHub', '#6fe39a', t0 + 1.9],
      ['? Dove salvo i documenti?', '#f0a37a', t0 + 2.4],
    ], { size: 28, cps: 32 });
    bubble(x, t, t0 + 1.7, 'GitHub!', 860, 640, 34, -1);
    critter(x, 900, FLOOR + 70, 12, t, { hat: 'grad' });
    sticker(x, t, t0 + 0.2, 'UNA VOLTA SOLA', 300, 640, { fill: BLUE, size: 32, rot: -0.05 });
  }

  mountain(x: CanvasRenderingContext2D, t: number, s: Shot) {
    sky(x, t);
    txt(x, 'mia-app', 300, 700, 40, F.mono(700), INK, { align: 'center' });
    const u = k(t, s.t0, Math.max(0.4, s.t1 - s.t0 - 0.2));
    x.strokeStyle = '#8a5a34'; x.lineWidth = 5; x.beginPath(); x.moveTo(560, FLOOR); x.lineTo(260, FLOOR - 520); x.stroke();
    critter(x, lerp(520, 300, u), lerp(FLOOR - 20, FLOOR - 470, u), 8, t, { hat: 'cap', a: BLUE, walk: true });
    const fe = pop(t, s.t0 + 0.3);
    at(x, 260, FLOOR - 520, fe, 0, () => { x.fillStyle = INK; x.fillRect(254, FLOOR - 680, 10, 160); box(x, 264, FLOOR - 680, 150, 60, GREEN, 4, 3); txt(x, 'SETUP', 320, FLOOR - 638, 26, F.mono(700), '#ffffff', { align: 'center' }); tick(x, 390, FLOOR - 650, 20, '#ffffff', 5); });
    const be = pop(t, this.w.volta);
    at(x, 870, 350, be, 0.08, () => { x.beginPath(); x.arc(870, 350, 90, 0, TAU); x.fillStyle = RED; x.fill(); x.lineWidth = LW; x.strokeStyle = INK; x.stroke(); txt(x, '1×', 870, 372, 64, F.mono(700), '#ffffff', { align: 'center' }); });
    sticker(x, t, this.w.volta + 0.1, 'UNA VOLTA', 870, 490, { fill: INK, size: 28, rot: 0.04 });
  }

  rocket(x: CanvasRenderingContext2D, t: number, s: Shot) {
    stage(x, t);
    const u = k(t, s.t0 + 0.25, 1.2), ry = lerp(FLOOR - 160, -300, ease.inCubic(u));
    box(x, 700, 180, 40, FLOOR - 180, '#9aa0a8', 4, LW);
    for (let i = 0; i < 6; i++) { x.fillStyle = '#7f858e'; x.fillRect(700, 220 + i * 120, 40, 10); }
    if (u > 0) for (let i = 0; i < 10; i++) { const v = (t * 1.8 + i / 10) % 1; x.beginPath(); x.arc(540 + (hash(i, 2) - 0.5) * 160 * v, ry + 200 + v * 300, 30 + v * 40, 0, TAU); x.fillStyle = `rgba(230,230,230,${0.8 - v * 0.7})`; x.fill(); }
    x.beginPath(); x.moveTo(540, ry - 200); x.quadraticCurveTo(620, ry - 120, 610, ry + 120); x.lineTo(470, ry + 120); x.quadraticCurveTo(460, ry - 120, 540, ry - 200); x.closePath();
    x.fillStyle = '#ffffff'; x.fill(); x.lineWidth = LW; x.strokeStyle = INK; x.stroke();
    x.beginPath(); x.arc(540, ry - 40, 30, 0, TAU); x.fillStyle = '#8ec5ff'; x.fill(); x.stroke();
    for (const sd of [-1, 1]) { x.beginPath(); x.moveTo(540 + sd * 66, ry + 40); x.lineTo(540 + sd * 120, ry + 140); x.lineTo(540 + sd * 66, ry + 120); x.closePath(); x.fillStyle = RED; x.fill(); x.stroke(); }
    if (u > 0) { x.beginPath(); x.moveTo(500, ry + 120); x.lineTo(540, ry + 220 + 30 * Math.sin(t * 30)); x.lineTo(580, ry + 120); x.closePath(); x.fillStyle = '#f2a03c'; x.fill(); }
    box(x, 820, 120, 200, 110, '#1f2d24', 10, LW); txt(x, 'VIA!', 920, 198, 60, F.mono(700), '#7dff9e', { align: 'center' });
    crowd(x, t, [140, 300, 820, 980], 10, FLOOR + 70, 4);
  }

  phone(x: CanvasRenderingContext2D, t: number, s: Shot) {
    stage(x, t);
    box(x, 380, 110, 320, 620, '#ffffff', 44, 6);
    box(x, 490, 132, 100, 22, INK, 11, 0);
    txt(x, 'Commenti', 540, 210, 30, F.poppins(600), INK, { align: 'center' });
    [BLUE, GREEN, PURPLE].forEach((c, i) => { x.beginPath(); x.arc(430, 270 + i * 70, 20, 0, TAU); x.fillStyle = c; x.fill(); box(x, 465, 260 + i * 70, 180 - i * 30, 18, '#e9e6e2', 9, 0); });
    const g = this.w.grill, n = Math.floor(clamp((t - g + 0.1) * 14, 0, 5));
    box(x, 405, 610, 270, 70, '#f3f1ee', 35, 2); txt(x, 'GRILL'.slice(0, n), 540, 657, 32, F.mono(700), INK, { align: 'center' });
    if (t >= g + 0.35) { x.beginPath(); x.arc(430, 270 + 3 * 70, 20, 0, TAU); x.fillStyle = ORANGE; x.fill(); box(x, 465, 260 + 3 * 70, 110, 30, '#ffffff', 8, 2); txt(x, 'GRILL', 520, 483, 22, F.mono(700), INK, { align: 'center' }); }
    for (let i = 0; i < 3; i++) {
      const ti = g + 0.6 + i * 0.25, u = t - ti;
      if (u < 0) continue;
      const ex = 640 + u * 420, ey = 300 - u * 160 + i * 60;
      at(x, ex, ey, 1, -0.2, () => { box(x, ex - 40, ey - 26, 80, 52, '#ffffff', 4, 3); x.beginPath(); x.moveTo(ex - 40, ey - 26); x.lineTo(ex, ey + 4); x.lineTo(ex + 40, ey - 26); x.lineWidth = 3; x.strokeStyle = INK; x.stroke(); });
    }
    sticker(x, t, g + 0.8, 'DM: REPO', 860, 560, { fill: BLUE, size: 34, rot: 0.06 });
    for (const gx of [150, 930]) { x.beginPath(); x.arc(gx, FLOOR - 120, 80, 0, Math.PI); x.closePath(); x.fillStyle = '#2b2a30'; x.fill(); x.lineWidth = LW; x.strokeStyle = INK; x.stroke(); x.fillStyle = INK; x.fillRect(gx - 4, FLOOR - 120, 8, 120); }
    critter(x, 150, FLOOR - 120, 9, t, { hat: 'chef' }); critter(x, 930, FLOOR - 120, 9, t, { hat: 'chef', face: 'happy' });
    confetti(x, t, g + 0.4, 540, 600, 30);
    void s;
  }
}

