// 반복 실험: 같은 θ₀, n으로 표본을 R번 뽑아 θ̂의 히스토그램을 그린다.

import { DISTS, getDist, withKnown } from '../dists/index.js';
import { createStore } from '../core/state.js';
import { mulberry32 } from '../core/rng.js';
import { fmt, decimalsFor } from '../core/format.js';
import { bindRange, reducedMotion } from '../ui/common.js';
import { createHistogram } from '../plots/histogram.js';

const $ = (id) => document.getElementById(id);
const knownKeys = {};
for (const d of DISTS) for (const k of d.knownSpec) knownKeys[k.key] = { def: null, type: k.int ? 'int' : 'num' };

const store = createStore({
  dist: { def: 'normal', type: 'str', always: true },
  n: { def: 15, type: 'int', always: true },
  R: { def: 500, type: 'int' },
  seed: { def: 1, type: 'int' },
  t0: { def: null, type: 'num' },
  t02: { def: null, type: 'num' },
  ...knownKeys,
});

const is2 = (d) => d.params.length === 2;
function distOf(s) {
  const known = {};
  for (const k of Object.keys(knownKeys)) known[k] = s[k];
  return withKnown(getDist(s.dist), known);
}
function theta0Of(s, d) {
  if (is2(d)) return [s.t0 ?? d.defaults.theta0[0], s.t02 ?? d.defaults.theta0[1]];
  return s.t0 ?? d.defaults.theta0;
}

/** R번 반복. 2모수면 { mu, s2hat, s2 } */
function simulate(d, theta0, n, R, seed) {
  const rng = mulberry32(seed);
  const out = [];
  for (let r = 0; r < R; r++) {
    const xs = d.sample(rng, n, theta0);
    out.push(d.mle(xs));
  }
  return out;
}

function summarize(vals) {
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  const v = vals.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, vals.length - 1);
  return { mean: m, sd: Math.sqrt(v) };
}
function quantile(sorted, q) {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (i - lo);
}
const normPdf = (m, sd) => (t) => Math.exp(-0.5 * ((t - m) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));

/** 1모수: 가로축 범위 (근사 표준오차와 표본 분위수를 함께 본다) */
function domainFor(d, theta0, n, vals) {
  const sorted = vals.slice().sort((a, b) => a - b);
  const q0 = quantile(sorted, 0.003);
  const q1 = quantile(sorted, 0.997);
  let lo = q0;
  let hi = q1;
  if (d.fisher) {
    const se = 1 / Math.sqrt(n * d.fisher(theta0));
    lo = Math.min(lo, theta0 - 4 * se);
    hi = Math.max(hi, theta0 + 4 * se);
  }
  if (d.stepper) hi = Math.max(hi, theta0 * 1.02);
  const pad = 0.04 * (hi - lo || 1);
  lo -= pad;
  hi += pad;
  if (Number.isFinite(d.domain?.[0])) lo = Math.max(lo, d.domain[0] - (d.mleLattice ? d.mleLattice(n) : 0));
  if (Number.isFinite(d.domain?.[1])) hi = Math.min(hi, d.domain[1] + (d.mleLattice ? d.mleLattice(n) : 0));
  return [lo, hi];
}

function curveFor(d, theta0, n) {
  if (d.mleDensity) return (t) => d.mleDensity(t, theta0, n);
  if (d.fisher) return normPdf(theta0, 1 / Math.sqrt(n * d.fisher(theta0)));
  return null;
}

// ─── 조작부 ───
const sel = $('dist');
sel.innerHTML = DISTS.map((d) => `<option value="${d.id}">${d.title}</option>`).join('');
sel.addEventListener('change', () => {
  const d = getDist(sel.value);
  store.set({ dist: d.id, t0: null, t02: null });
});
const bind = {
  t0: bindRange($('t0-range'), $('t0-num'), { onInput: (v) => store.set({ t0: v }) }),
  t02: bindRange($('t02-range'), $('t02-num'), { onInput: (v) => store.set({ t02: v }) }),
  n: bindRange($('n-range'), $('n-num'), { onInput: (v) => store.set({ n: Math.round(Math.min(200, Math.max(1, v))) }), valueText: (v) => `n = ${v}` }),
};
$('r-group').addEventListener('click', (e) => {
  const b = e.target.closest('[data-r]');
  if (b) store.set({ R: Number(b.dataset.r) });
});
$('seed').addEventListener('change', () => {
  const v = Number.parseInt($('seed').value, 10);
  if (Number.isFinite(v)) store.set({ seed: Math.max(0, v) });
});
$('run').addEventListener('click', () => store.set({ seed: store.get().seed + 1 }));
$('play').addEventListener('click', playCompare);

let knownBinds = [];
let builtFor = null;
function buildControls(d) {
  const p0 = d.params[0];
  $('t0-label').textContent = `참값 ${p0.label}₀`;
  bind.t0.config({ min: p0.theta0Range[0], max: p0.theta0Range[1], step: p0.step });
  $('t02-field').classList.toggle('hidden', !is2(d));
  if (is2(d)) {
    const p1 = d.params[1];
    $('t02-label').textContent = `참값 ${p1.label}₀`;
    bind.t02.config({ min: p1.theta0Range[0], max: p1.theta0Range[1], step: p1.step });
  }
  const box = $('known-fields');
  box.innerHTML = '';
  knownBinds = d.knownSpec.map((k) => {
    const f = document.createElement('div');
    f.className = 'field';
    f.innerHTML = `<div class="field-head"><label for="k-${k.key}-num" id="k-${k.key}-l">${k.label}</label></div>
      <div class="range-row"><input type="range" aria-labelledby="k-${k.key}-l"><input type="number" id="k-${k.key}-num"></div>`;
    box.append(f);
    const b = bindRange(f.querySelector('input[type=range]'), f.querySelector('input[type=number]'), {
      onInput: (v) => store.set({ [k.key]: v }),
      format: (v) => (k.int ? String(v) : v.toFixed(decimalsFor(k.step))),
    });
    b.config(k);
    return { k, b };
  });
}

// ─── 그림 ───
const histMain = createHistogram($('hist-main'));
const histAlt = createHistogram($('hist-alt'));

let pending = false;
store.subscribe(() => {
  if (pending) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    render();
  }, 30);
});

function render() {
  const s = store.get();
  const d = distOf(s);
  if (builtFor !== d.id) {
    buildControls(d);
    builtFor = d.id;
    $('compare-panel').classList.add('hidden');
  }
  const theta0 = theta0Of(s, d);
  sel.value = d.id;
  bind.t0.set(is2(d) ? theta0[0] : theta0);
  if (is2(d)) bind.t02.set(theta0[1]);
  for (const { k, b } of knownBinds) b.set(d.known[k.key]);
  bind.n.set(s.n);
  if (document.activeElement !== $('seed')) $('seed').value = String(s.seed);
  $('r-group').querySelectorAll('[data-r]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.r) === s.R)));

  const res = simulate(d, theta0, s.n, s.R, s.seed);
  const stat = (k, v, cls = '') => `<div class="stat ${cls}"><div class="k">${k}</div><div class="v">${v}</div></div>`;

  if (is2(d)) {
    const s2 = theta0[1];
    const hat = res.map((r) => r[1]);
    const unb = s.n > 1 ? hat.map((v) => (v * s.n) / (s.n - 1)) : hat;
    const all = hat.concat(unb).sort((a, b) => a - b);
    const dom = [0, Math.max(quantile(all, 0.997), s2 * 2) * 1.05];
    const curve = normPdf(s2, s2 * Math.sqrt(2 / s.n));
    const A = summarize(hat);
    const B = summarize(unb);
    histMain.update({ values: hat, domain: dom, curve, truth: s2, mean: A.mean, xLabel: 'σ̂² = Σ(xᵢ−x̄)²/n', label: '최대가능도추정량 σ̂²', alt: `σ̂² ${s.R}개의 히스토그램. 평균 ${fmt(A.mean, 3)}, 참값 σ² = ${fmt(s2, 3)}.` });
    histAlt.update({ values: unb, domain: dom, curve, truth: s2, mean: B.mean, xLabel: 's² = Σ(xᵢ−x̄)²/(n−1)', label: '불편추정량 s²', cls: 'hist-bar alt', alt: `s² ${s.R}개의 히스토그램. 평균 ${fmt(B.mean, 3)}.` });
    $('hist-alt').classList.remove('hidden');
    $('curve-legend').textContent = '검정 곡선: 점근정규 근사 N(σ², 2σ⁴/n)';
    $('summary').innerHTML = [
      stat('참값 σ²', fmt(s2, 3), 'true'),
      stat('σ̂²의 평균', fmt(A.mean, 3), 'mle'),
      stat('σ̂²의 편향 (이론: −σ²/n)', `${fmt(A.mean - s2, 3)} (${fmt(-s2 / s.n, 3)})`),
      stat('s²의 평균', fmt(B.mean, 3)),
      stat('s²의 편향 (이론: 0)', fmt(B.mean - s2, 3)),
      stat('μ̂의 평균 / 표준편차', `${fmt(summarize(res.map((r) => r[0])).mean, 3)} / ${fmt(summarize(res.map((r) => r[0])).sd, 3)}`),
    ].join('');
    $('note').textContent = `E[σ̂²] = (n−1)σ²/n = ${fmt(((s.n - 1) * s2) / s.n, 3)}. n이 작을수록 σ̂²의 파랑 평균선이 초록 참값보다 왼쪽에 있습니다.`;
    return;
  }

  $('hist-alt').classList.add('hidden');
  const dom = domainFor(d, theta0, s.n, res);
  const curve = curveFor(d, theta0, s.n);
  const S = summarize(res);
  const sym = d.label;
  histMain.update({
    values: res,
    domain: dom,
    lattice: d.mleLattice ? d.mleLattice(s.n) : null,
    curve,
    truth: theta0,
    mean: S.mean,
    xLabel: `${sym}̂`,
    label: `${sym}̂ ${s.R}개 (n = ${s.n})`,
    alt: `${sym}̂ ${s.R}개의 히스토그램. 평균 ${fmt(S.mean, 3)}, 표준편차 ${fmt(S.sd, 3)}, 참값 ${fmt(theta0, 3)}.`,
  });
  $('curve-legend').textContent = d.mleDensity ? '검정 곡선: θ̂ = max xᵢ의 정확한 밀도 n·tⁿ⁻¹/θⁿ' : `검정 곡선: 점근정규 근사 N(${sym}₀, 1/(n·I(${sym}₀)))`;
  const cards = [stat(`참값 ${sym}₀`, fmt(theta0, 3), 'true'), stat(`${sym}̂의 평균`, fmt(S.mean, 4), 'mle'), stat('편향 (평균 − 참값)', fmt(S.mean - theta0, 4)), stat(`${sym}̂의 표준편차`, fmt(S.sd, 4))];
  if (d.fisher) cards.push(stat('근사 표준오차 1/√(n·I(θ₀))', fmt(1 / Math.sqrt(s.n * d.fisher(theta0)), 4)));
  if (d.mleDensity) cards.push(stat('이론 평균 nθ/(n+1)', fmt((s.n * theta0) / (s.n + 1), 4)));
  $('summary').innerHTML = cards.join('');
  $('note').textContent = d.mleDensity
    ? 'θ̂ = max xᵢ는 정칙 조건을 만족하지 않아 정규 근사 대신 정확한 분포를 겹쳤습니다. θ̂는 늘 θ보다 작습니다.'
    : d.discrete
      ? '이산 분포의 추정값은 격자 위의 값만 나오므로 막대 폭을 격자에 맞췄습니다. n이 작으면 정규 근사가 잘 맞지 않습니다.'
      : 'n을 키우면 히스토그램이 점근정규 근사 곡선에 가까워지고 폭이 좁아집니다.';
}

// n = 10, 50, 200을 같은 가로축으로 나란히
async function playCompare() {
  const s = store.get();
  const d = distOf(s);
  const theta0 = theta0Of(s, d);
  const panel = $('compare-panel');
  const box = $('compare');
  panel.classList.remove('hidden');
  box.innerHTML = '';
  const ns = [10, 50, 200];
  const runs = ns.map((n) => {
    const r = simulate(d, theta0, n, s.R, s.seed);
    return { n, vals: is2(d) ? r.map((v) => v[1]) : r };
  });
  const t0 = is2(d) ? theta0[1] : theta0;
  const dom = is2(d) ? [0, Math.max(...runs[0].vals.slice().sort((a, b) => a - b).slice(0, Math.floor(runs[0].vals.length * 0.997))) * 1.05] : domainFor(d, theta0, 10, runs[0].vals);
  // 가장 뾰족한 n = 200의 높이에 맞춰 세로축을 공유
  const peak = is2(d) ? normPdf(t0, t0 * Math.sqrt(2 / 200)) : curveFor(d, theta0, 200);
  const yMax = peak ? peak(t0) * 1.1 : 0;
  panel.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
  for (const [i, r] of runs.entries()) {
    const cell = document.createElement('div');
    box.append(cell);
    const h = createHistogram(cell, { height: 220 });
    const S = summarize(r.vals);
    const curve = is2(d) ? normPdf(t0, t0 * Math.sqrt(2 / r.n)) : curveFor(d, theta0, r.n);
    h.update({
      values: r.vals,
      domain: dom,
      lattice: !is2(d) && d.mleLattice ? d.mleLattice(r.n) : null,
      curve,
      truth: t0,
      mean: S.mean,
      yMaxHint: yMax,
      xLabel: is2(d) ? 'σ̂²' : `${d.label}̂`,
      label: `n = ${r.n} · 표준편차 ${fmt(S.sd, 3)}`,
      alt: `n = ${r.n}: 평균 ${fmt(S.mean, 3)}, 표준편차 ${fmt(S.sd, 3)}`,
    });
    if (!reducedMotion() && i < runs.length - 1) await new Promise((res) => setTimeout(res, 900));
  }
}

// 시작
render();
