// The example prompt shown in the `prompt` plate: how each spoken word is split into tokens, and the
// (joke) next-token distributions that flicker above them. Keyed by the word folded (lowercase, no
// accents or punctuation; see fold() in _vo.ts). A word with no entry is typed as one token with no
// distribution. The pieces of a word must spell it exactly as typed (straight quotes: “ ” are typed ").

export type Cand = [text: string, p: number];
export interface PieceSpec {
  /** Display text of this token (the pieces of a word concatenated = the word as typed). */
  s: string;
  /** Candidates, most likely first. No list: no popup for this token. */
  dist?: Cand[];
  /** Index of the sampled candidate (default 0). */
  pick?: number;
}

export const SPECS: Record<string, PieceSpec[]> = {
  crea: [{ s: '"', dist: [['"', 0.71], ['Ciao', 0.12], ['Allora', 0.06]] }, { s: 'Crea', dist: [['Crea', 0.58], ['Genera', 0.17], ['Fammi', 0.09], ['Inventa', 0.04]] }],
  sequenza: [{ s: 'sequenza', dist: [['sequenza', 0.61], ['intro', 0.14], ['reel', 0.09], ['slide', 0.02]] }],
  cinematografica: [
    { s: 'cinem', dist: [['cinem', 0.44], ['epica', 0.21], ['virale', 0.12], ['aziendale', 0.04]] },
    { s: 'ato' },
    { s: 'grafica' },
  ],
  quindici: [{ s: 'quindici', dist: [['quindici', 0.47], ['trenta', 0.22], ['sei', 0.11], ['novanta', 0.06]] }],
  secondi: [{ s: 'secondi', dist: [['secondi', 0.93], ['minuti', 0.04], ['anni', 0.002]] }, { s: ',' }],
  tipografia: [{ s: 'tipo', dist: [['tipo', 0.52], ['musica', 0.18], ['effetti', 0.11], ['font', 0.08]] }, { s: 'grafia' }],
  cinetica: [{ s: 'cinetica', dist: [['cinetica', 0.61], ['animata', 0.2], ['leggibile', 0.04], ['Comic Sans', 0.001]] }, { s: ',' }],
  transizioni: [{ s: 'transizioni', dist: [['transizioni', 0.67], ['dissolvenze', 0.14], ['glitch', 0.08]] }],
  fluide: [{ s: 'fluide', dist: [['fluide', 0.55], ['morbide', 0.23], ['brusche', 0.03]] }],
  forme: [{ s: 'forme', dist: [['forme', 0.66], ['scene', 0.19], ['slide', 0.06]] }, { s: ',' }],
  elementi: [{ s: 'elementi', dist: [['elementi', 0.74], ['oggetti', 0.12], ['pianeti', 0.01]] }],
  '3d': [{ s: '3D', dist: [['3D', 0.81], ['2D', 0.11], ['4D', 0.01]] }],
  movimenti: [{ s: 'movimenti', dist: [['movimenti', 0.69], ['stacchi', 0.11], ['zoom', 0.08]] }],
  camera: [{ s: 'camera', dist: [['camera', 0.84], ['macchina', 0.09], ['drone', 0.03]] }],
  continui: [{ s: 'continui', dist: [['continui', 0.47], ['fluidi', 0.31], ['a mano', 0.07], ['epilettici', 0.01]] }, { s: '."' }],
};

/** Small deadpan labels around the field. */
export const META = {
  no: '01',
  params: 'T 0.7 · top-p 0.95 · seed 0x2A',
  send: ' invia  (irreversibile)',
};
