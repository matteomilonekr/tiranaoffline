// The timing blocks are plain maths, so they are tested here without a browser: `bun test` in app/.
import { describe, expect, test } from 'bun:test';
import { E, tw, stagger, spring, springTo, Timeline, yoyo } from './tl';
import { Grid, shots } from './beat';

describe('easings by GSAP name', () => {
  test.each(['power2.out', 'back.out(1.7)', 'elastic.out(1, 0.3)', 'expo.inOut', 'circ.in', 'sine.inOut', 'bounce.out', 'steps(4)', 'none', 'cubic-bezier(.16,1,.3,1)', 'spring(2,0.4)'])('%s goes from 0 to 1', (n) => {
    expect(E(n)(0)).toBeCloseTo(0, 3);
    expect(E(n)(1)).toBeCloseTo(1, 1);
  });
  test('cubic-bezier matches CSS ease', () => expect(E('cubic-bezier(0.25,0.1,0.25,1)')(0.5)).toBeCloseTo(0.8024, 2));
  test('steps', () => expect(E('steps(4)')(0.3)).toBe(0.25));
  test('an unknown name throws', () => expect(() => E('wobbly.out')).toThrow());
  test('tw takes a name', () => expect(tw(0.5, 0, 1, 'none')).toBeCloseTo(0.5));
});

describe('stagger', () => {
  test('from the start, each', () => { expect(stagger(0, 5, { each: 0.1 })).toBe(0); expect(stagger(4, 5, { each: 0.1 })).toBeCloseTo(0.4); });
  test('from the centre', () => { expect(stagger(2, 5, { each: 0.1, from: 'center' })).toBe(0); expect(stagger(0, 5, { each: 0.1, from: 'center' })).toBeCloseTo(0.2); });
  test('amount spreads the whole', () => expect(stagger(4, 5, { amount: 1 })).toBeCloseTo(1));
  test('on a grid from the centre', () => { expect(stagger(0, 9, { grid: [3, 3], from: 'center', amount: 1 })).toBeCloseTo(1); expect(stagger(4, 9, { grid: [3, 3], from: 'center', amount: 1 })).toBe(0); });
});

describe('Timeline', () => {
  const tl = new Timeline().to('a', 1).to('b', 0.5, '-=0.25').to('c', 0.5, '<').label('L', '+=1').to('d', 0.2, 'L+=0.5').to('e', 0.3, 2);
  test('positions', () => {
    expect(tl.at('b')).toBeCloseTo(0.75);
    expect(tl.at('c')).toBeCloseTo(0.75);
    expect(tl.at('L')).toBeCloseTo(2.25);
    expect(tl.at('d')).toBeCloseTo(2.75);
    expect(tl.at('e')).toBeCloseTo(2);
  });
  test('progress and activity', () => { expect(tl.p(0.5, 'b')).toBe(0); expect(tl.p(5, 'b')).toBe(1); expect(tl.active(0.8, 'b')).toBe(true); });
  test('staggered tweens', () => { tl.stagger('s', 4, 0.3, { each: 0.1 }, '>'); expect(tl.at('s3') - tl.at('s0')).toBeCloseTo(0.3); });
});

describe('springs', () => {
  const peak = (o: Parameters<typeof spring>[2]) => { let m = 0; for (let u = 0; u < 3; u += 0.001) m = Math.max(m, spring(u, 0, o)); return m; };
  test('overshoot is the one asked for', () => expect(peak({ settle: 0.6, overshoot: 0.02 })).toBeCloseTo(1.02, 2));
  test('critically damped never overshoots', () => expect(peak({ overshoot: 0 })).toBeLessThanOrEqual(1 + 1e-9));
  test('settled by its settle time', () => expect(spring(0.6, 0, { settle: 0.6, overshoot: 0 })).toBeCloseTo(1, 1));
  test('springTo ends on the last target', () => expect(springTo(10, [[0, 0], [1, 100], [1.2, 50]])).toBeCloseTo(50, 1));
  test('yoyo', () => { expect(yoyo(1.5, 1)).toBeCloseTo(0.5); expect(yoyo(0.25, 1)).toBeCloseTo(0.25); });
});

describe('beat grid', () => {
  const G = new Grid(120);
  test('bars, beats, sixteenths', () => { expect(G.at(2, 1, 2)).toBeCloseTo(4.75); expect(G.beats(1.25)).toBeCloseTo(2.5); });
  test('snap', () => { expect(G.snap(1.3)).toBeCloseTo(1.5); expect(G.snap(1.3, 4, 'floor')).toBeCloseTo(1.25); });
  test('pulse on the beat', () => { expect(G.pulse(1.0)).toBeCloseTo(1); expect(G.pulse(1.2)).toBeLessThan(0.3); });
  test('shots cut on the bar', () => {
    const sp = shots(G, [['a', 1], ['b', 2]]);
    expect(sp.at(1.99).name).toBe('a');
    expect(sp.at(2).name).toBe('b');
    expect(sp.end).toBeCloseTo(6);
  });
});
