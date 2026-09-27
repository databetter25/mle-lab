// 수학 모듈 단위 테스트 — 실행: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { DISTS, getDist, withKnown, MAX_N } from '../assets/js/dists/index.js';
import { loglik, llGrid, likInterval } from '../assets/js/core/lik.js';
import { newtonPath, newtonMax, goldenMax } from '../assets/js/core/optimize.js';
import { mulberry32 } from '../assets/js/core/rng.js';
import { lgamma, logFactorial } from '../assets/js/core/special.js';

const expected = JSON.parse(readFileSync(new URL('./fixtures/expected.json', import.meta.url), 'utf8'));
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (차이 ${Math.abs(a - b)})`);

test('lgamma가 알려진 값과 맞다', () => {
  close(lgamma(0.5), 0.5 * Math.log(Math.PI), 1e-13, 'lgamma(0.5)');
  close(lgamma(1), 0, 1e-13, 'lgamma(1)');
  close(lgamma(10), Math.log(362880), 1e-12, 'lgamma(10)');
  close(lgamma(301.5), lgamma(300.5) + Math.log(300.5), 1e-9, 'lgamma 점화식');
  close(lgamma(0.3), 1.0957979948180756, 1e-12, 'lgamma(0.3) 반사공식');
  close(logFactorial(300), lgamma(301), 1e-9, 'logFactorial(300)');
});

test('R 기대값: ℓ(θ)와 θ̂가 1e-9 이내로 같다', () => {
  for (const c of expected.cases) {
    const known = Array.isArray(c.known) ? {} : c.known;
    const d = withKnown(getDist(c.dist), known);
    c.thetas.forEach((t, i) => {
      const want = c.ll[i] === null ? -Infinity : c.ll[i];
      const got = loglik(d, c.x, t);
      if (want === -Infinity) assert.equal(got, -Infinity, `${c.dist} θ=${t}`);
      else close(got, want, 1e-9, `${c.dist} ℓ(${t})`);
    });
    const mle = d.mle(c.x);
    if (Array.isArray(mle)) mle.forEach((v, j) => close(v, c.mle[j], 1e-9, `${c.dist} θ̂[${j}]`));
    else close(mle, c.mle, 1e-9, `${c.dist} θ̂`);
  }
});

function samplesFor(d, seeds = [1, 42, 7, 2026]) {
  return seeds.flatMap((seed) => [5, 15, 200].map((n) => d.sample(mulberry32(seed), MAX_N, d.defaults.theta0).slice(0, n)));
}

test('수치 최댓값(뉴턴·황금분할)과 닫힌 형태 θ̂의 차이가 1e-6 이하', () => {
  for (const base of DISTS) {
    const d = withKnown(base, {});
    for (const xs of samplesFor(d)) {
      if (d.isBoundary && d.isBoundary(xs) && !d.stepper) continue; // 경계 해는 따로 검사
      const mle = d.mle(xs);
      if (d.params.length === 2) {
        const got = newtonMax(d, xs, [0, 2]);
        close(got[0], mle[0], 1e-6, `${d.id} 뉴턴 μ`);
        close(got[1], mle[1], 1e-6, `${d.id} 뉴턴 σ²`);
        continue;
      }
      const [lo, hi] = d.defaults.range;
      const f = (t) => loglik(d, xs, t);
      const a = Math.max(lo, d.domain[0] + 1e-9);
      const b = Math.min(d.domain[1] - 1e-9, Math.max(hi, mle * 1.5 + 1));
      const golden = goldenMax(f, a, b);
      close(golden, mle, 1e-6, `${d.id} 황금분할 (n=${xs.length})`);
      const newton = newtonMax(d, xs, (lo + hi) / 2);
      close(newton, mle, 1e-6, `${d.id} 뉴턴 (n=${xs.length})`);
    }
  }
});

test('점수함수와 2계 도함수가 수치 미분과 맞다', () => {
  for (const base of DISTS) {
    if (base.stepper) continue;
    const d = withKnown(base, {});
    const xs = d.sample(mulberry32(3), 30, d.defaults.theta0);
    const h = 1e-5;
    if (d.params.length === 2) {
      const t = [0.7, 1.4];
      const g = d.score(xs, t);
      close(g[0], (loglik(d, xs, [t[0] + h, t[1]]) - loglik(d, xs, [t[0] - h, t[1]])) / (2 * h), 1e-4, `${d.id} ∂μ`);
      close(g[1], (loglik(d, xs, [t[0], t[1] + h]) - loglik(d, xs, [t[0], t[1] - h])) / (2 * h), 1e-4, `${d.id} ∂σ²`);
      const H = d.hessian(xs, t);
      const gp = d.score(xs, [t[0], t[1] + h]);
      const gm = d.score(xs, [t[0], t[1] - h]);
      close(H[1][1], (gp[1] - gm[1]) / (2 * h), 1e-3, `${d.id} ∂²σ²`);
      close(H[0][1], (gp[0] - gm[0]) / (2 * h), 1e-3, `${d.id} ∂μ∂σ²`);
      continue;
    }
    const t = d.id === 'normal' ? 0.3 : d.defaults.theta0 * 0.8;
    close(d.score(xs, t), (loglik(d, xs, t + h) - loglik(d, xs, t - h)) / (2 * h), 1e-4, `${d.id} ℓ'`);
    close(d.hessian(xs, t), (d.score(xs, t + h) - d.score(xs, t - h)) / (2 * h), 1e-3, `${d.id} ℓ''`);
  }
});

test('같은 시드면 같은 표본이고, n을 늘려도 앞쪽 점이 그대로다', () => {
  for (const d of DISTS) {
    const a = d.sample(mulberry32(42), MAX_N, d.defaults.theta0);
    const b = d.sample(mulberry32(42), MAX_N, d.defaults.theta0);
    assert.deepEqual(a, b, d.id);
    const small = d.sample(mulberry32(42), 15, d.defaults.theta0);
    assert.deepEqual(small, a.slice(0, 15), `${d.id} 앞 15개`);
    assert.ok(a.every((x) => d.validX(x)), `${d.id} 표본이 지지집합 안`);
  }
});

test('베르누이 경계 해: 모두 1이면 p̂ = 1, 뉴턴이 경계로 다가간다', () => {
  const d = getDist('bernoulli');
  const xs = Array(10).fill(1);
  assert.equal(d.mle(xs), 1);
  assert.ok(d.isBoundary(xs));
  assert.ok(d.boundaryNote(xs));
  const { steps, boundary } = newtonPath(d, xs, 0.5);
  assert.ok(boundary);
  for (const s of steps) assert.ok(s.next > 0 && s.next < 1, '모수공간 안에 머문다');
  assert.ok(steps.at(-1).next > 0.99999);
  // ℓ 곡선이 오른쪽 끝에서 최대
  const g = llGrid(d, xs, d.defaults.range);
  assert.equal(g.lls.indexOf(Math.max(...g.lls)), g.lls.length - 1);
});

test('균등(0, θ): 최댓값 찾기가 max xᵢ에서 멈추고 설명을 준다', () => {
  const d = getDist('uniform');
  const xs = [2.1, 4.7, 0.3, 3.9];
  for (const start of [9, 4.8, 1]) {
    const { steps, boundary, note } = newtonPath(d, xs, start);
    assert.ok(boundary);
    assert.equal(steps.at(-1).next, 4.7, `시작 ${start}`);
    assert.ok(note && note.includes('max'), '설명 문구');
  }
});

test('상대가능도 L/L(θ̂)와 ℓ의 최댓값 위치가 같다', () => {
  for (const base of DISTS) {
    if (base.params.length === 2) continue;
    const d = withKnown(base, {});
    const xs = d.sample(mulberry32(42), 15, d.defaults.theta0);
    const { ts, lls } = llGrid(d, xs, d.defaults.range);
    const llMax = loglik(d, xs, d.mle(xs));
    const rel = lls.map((v) => Math.exp(v - llMax));
    const i1 = lls.indexOf(Math.max(...lls));
    const i2 = rel.indexOf(Math.max(...rel));
    assert.equal(i1, i2, d.id);
    assert.ok(rel.every((r) => r <= 1 + 1e-12), `${d.id} 상대가능도 ≤ 1`);
    assert.ok(ts.length === 400);
  }
});

test('정규(μ) 95% 가능도 구간은 x̄ ± 1.96σ/√n', () => {
  const d = withKnown(getDist('normal'), { sigma: 1 });
  const xs = d.sample(mulberry32(42), 15, 1);
  const m = d.mle(xs);
  const [a, b] = likInterval(d, xs, m, [-10, 10]);
  const half = Math.sqrt(2 * 1.92) / Math.sqrt(15);
  close(a, m - half, 1e-8, '왼쪽');
  close(b, m + half, 1e-8, '오른쪽');
});
