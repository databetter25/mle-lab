// 시뮬레이터: 조작부 하나 + 연동 패널 세 개(A 데이터·모형, B 기여분, C 가능도 곡선) + 수치 카드.
// 모든 상태는 URL에 담긴다 (예: simulator.html?dist=normal&n=15&theta=0.4&seed=42).

import { DISTS, getDist, withKnown, MAX_N } from '../dists/index.js';
import { createStore } from '../core/state.js';
import { mulberry32 } from '../core/rng.js';
import { loglik, llGrid, likInterval, finiteExtent, linspace } from '../core/lik.js';
import { newtonPath } from '../core/optimize.js';
import { fmt, decimalsFor } from '../core/format.js';
import { bindRange, createAnnouncer, reducedMotion, isTypingTarget } from '../ui/common.js';
import { createDataPanel } from '../plots/panel-data.js';
import { createContribPanel } from '../plots/panel-contrib.js';
import { createLikPanel } from '../plots/panel-lik.js';
import { createContourPanel } from '../plots/contour.js';

const d3 = window.d3;
const $ = (id) => document.getElementById(id);

// ─── 상태 ───
const knownKeys = {};
for (const d of DISTS) for (const k of d.knownSpec) knownKeys[k.key] = { def: null, type: k.int ? 'int' : 'num' };

const store = createStore({
  dist: { def: 'normal', type: 'str', always: true },
  n: { def: 15, type: 'int', always: true },
  seed: { def: 42, type: 'int', always: true },
  t0: { def: null, type: 'num', always: true },
  t02: { def: null, type: 'num' },
  theta: { def: null, type: 'num', always: true },
  theta2: { def: null, type: 'num' },
  ...knownKeys,
  hide: { def: true, type: 'bool' },
  rel: { def: false, type: 'bool' },
  tan: { def: true, type: 'bool' },
  truec: { def: true, type: 'bool' },
  curv: { def: false, type: 'bool' },
  sort: { def: 'index', type: 'str' },
  prod: { def: false, type: 'bool' },
  zoom: { def: false, type: 'bool' },
  edit: { def: false, type: 'bool' },
  data: { def: null, type: 'list' },
  hl: { def: 0, type: 'int' },
});

const is2 = (d) => d.params.length === 2;

function distOf(s) {
  const known = {};
  for (const k of Object.keys(knownKeys)) known[k] = s[k];
  return withKnown(getDist(s.dist), known);
}
function clampParam(p, v) {
  let lo = p.range[0];
  let hi = p.range[1];
  // 모수공간이 열린구간이면 끝점 대신 한 칸 안쪽
  if (p.domain[0] === lo) lo += p.step;
  if (p.domain[1] === hi) hi -= p.step;
  return Math.min(hi, Math.max(lo, v));
}
function theta0Of(s, d) {
  if (is2(d)) return [s.t0 ?? d.defaults.theta0[0], s.t02 ?? d.defaults.theta0[1]];
  return s.t0 ?? d.defaults.theta0;
}
function thetaOf(s, d) {
  if (is2(d)) return [s.theta ?? mid(d.params[0]), s.theta2 ?? mid(d.params[1])];
  return s.theta ?? mid(d.params[0]);
}
function mid(p) {
  return clampParam(p, (p.range[0] + p.range[1]) / 2);
}

// ─── 표본과 무거운 계산 (자료가 바뀔 때만) ───
let cache = { key: null };
function dataFor(s) {
  const dist = distOf(s);
  const theta0 = theta0Of(s, dist);
  const key = JSON.stringify([s.dist, dist.known, theta0, s.seed, s.n, s.data]);
  if (cache.key === key) return cache;

  let xs = null;
  let custom = false;
  if (s.data && s.data.length) {
    const ok = s.data.filter((v) => dist.validX(v)).slice(0, MAX_N);
    if (ok.length) {
      xs = ok;
      custom = true;
    }
  }
  if (!xs) xs = dist.sample(mulberry32(s.seed), MAX_N, theta0).slice(0, Math.max(1, Math.min(MAX_N, s.n)));
  const mle = dist.mle(xs);
  const llFn = (t) => loglik(dist, xs, t);
  const llMle = llFn(mle);

  const out = { key, dist, xs, custom, theta0, mle, llMle, llFn, xDomain: dist.xDomain(xs) };
  if (is2(dist)) {
    out.base2 = dist.params.map((p, i) => {
      const r = p.range.slice();
      if (mle[i] > r[1]) r[1] = mle[i] * 1.3;
      if (mle[i] < r[0]) r[0] = mle[i] - 1;
      return r;
    });
  } else {
    const r = dist.defaults.range.slice();
    // 직접 입력 자료로 θ̂가 범위 밖이면 범위를 넓힌다
    if (mle > r[1]) r[1] = mle + 0.2 * (r[1] - r[0]);
    if (mle < r[0]) r[0] = mle - 0.2 * (r[1] - r[0]);
    out.base = r;
    // 패널 B 세로축: 관측치별 log f 범위 (θ 격자 100점)
    let lo = Infinity;
    let hi = -Infinity;
    for (const t of linspace(r[0], r[1], 100)) {
      if (!(t > dist.domain[0] && t < dist.domain[1])) continue;
      for (const x of xs) {
        const v = dist.logpdf(x, t);
        if (!Number.isFinite(v)) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    const mleContrib = xs.map((x) => dist.logpdf(x, mle)).filter(Number.isFinite);
    out.bLo = Math.min(Math.max(-12, lo), Math.min(...mleContrib, 0) - 0.5);
    out.bHi = Math.max(0.2, Math.min(hi, 8));
    const h = dist.hessian(xs, mle);
    out.se = h < 0 && Number.isFinite(h) ? 1 / Math.sqrt(-h) : null;
  }
  cache = out;
  return out;
}

let gridCache = { key: null };
function gridFor(D, s) {
  const key = `${D.key}|${s.zoom}`;
  if (gridCache.key === key) return gridCache;
  const { dist, xs, mle } = D;
  let out;
  if (is2(dist)) {
    let range = D.base2;
    if (s.zoom) {
      const [m, v] = mle;
      const seMu = Math.sqrt(v / xs.length);
      const seV = v * Math.sqrt(2 / xs.length);
      range = [
        [m - 5 * seMu, m + 5 * seMu],
        [Math.max(1e-3, v - 5 * seV), v + 5 * seV],
      ];
    }
    const nx = 70;
    const ny = 70;
    const mus = linspace(range[0][0], range[0][1], nx);
    const s2s = linspace(Math.max(range[1][0], 1e-3), range[1][1], ny);
    // 충분통계량으로 빠르게: ℓ = −n/2·log(2πσ²) − (SS + n(x̄−μ)²)/(2σ²)
    const n = xs.length;
    const xbar = mle[0];
    const SS = mle[1] * n;
    const fast = (mu, s2) => -0.5 * n * Math.log(2 * Math.PI * s2) - (SS + n * (xbar - mu) ** 2) / (2 * s2);
    const values = new Float64Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) values[i + j * nx] = fast(mus[i], s2s[j]);
    const profile = linspace(Math.max(range[1][0], 1e-3), range[1][1], 200).map((v) => [v, fast(xbar, v)]);
    out = { key, range: [range[0], [Math.max(range[1][0], 0), range[1][1]]], grid: { nx, ny, values }, profile };
  } else {
    let range = D.base;
    if (s.zoom) {
      const w = D.base[1] - D.base[0];
      const half = D.se ? 5 * D.se : 0.12 * w;
      range = dist.stepper ? [mle - 0.15 * w, mle + 0.35 * w] : [mle - half, mle + half];
      range = [Math.max(range[0], dist.domain[0]), Math.min(range[1], dist.domain[1])];
    }
    const g = llGrid(dist, xs, range, 400);
    out = { key, range, ...g };
    if (D.se || dist.stepper) out.interval = likInterval(dist, xs, mle, [dist.domain[0] === -Infinity ? mle - 50 * (D.se || 1) : dist.domain[0], dist.domain[1] === Infinity ? Math.max(mle * 20, D.base[1] * 4) : dist.domain[1]]);
  }
  gridCache = out;
  return out;
}

// ─── 패널 ───
let hover = null;
const setHover = (i) => {
  if (hover === i) return;
  hover = i;
  schedule();
};

const panelA = createDataPanel($('chart-a'), {
  onHover: setHover,
  onAdd: (v) => {
    const s = store.get();
    const D = dataFor(s);
    const val = D.dist.discrete ? Math.round(v) : +v.toFixed(3);
    if (!D.dist.validX(val)) return dataMsg(`${fmt(val, 3)}은(는) 이 분포에서 나올 수 없는 값입니다.`);
    if (D.xs.length >= MAX_N) return dataMsg('관측치는 200개까지입니다.');
    store.set({ data: [...D.xs, val] });
    stopAnim(true);
  },
  onRemove: (i) => {
    const D = dataFor(store.get());
    if (D.xs.length <= 1) return dataMsg('관측치가 적어도 1개는 있어야 합니다.');
    store.set({ data: D.xs.filter((_, j) => j !== i) });
    hover = null;
    stopAnim(true);
  },
});
const panelB = createContribPanel($('chart-b'), { onHover: setHover });
const panelC = createLikPanel($('chart-c'), { onTheta: (v) => userTheta(v, { snap: true }) });
const panelC2 = createContourPanel($('chart-c2'), { onTheta: (v) => userTheta2(v) });

// ─── 후보 θ 이동 ───
function setTheta(v, { snap = false } = {}) {
  const s = store.get();
  const d = distOf(s);
  const p = d.params[0];
  let t = clampParam(p, v);
  if (snap) {
    const mle = dataFor(s).mle;
    if (Math.abs(t - mle) < p.step * 0.51) t = mle; // 슬라이더 칸 안에 θ̂가 있으면 정확히 θ̂로
  }
  store.set({ theta: t });
}
function userTheta(v, opts) {
  pauseAnim();
  const d = distOf(store.get());
  if (is2(d)) return userTheta2([v, store.get().theta2 ?? mid(d.params[1])]);
  setTheta(v, opts);
}
function userTheta2(v) {
  pauseAnim();
  const d = distOf(store.get());
  const D = dataFor(store.get());
  let a = clampParam(d.params[0], v[0]);
  let b = clampParam(d.params[1], v[1]);
  if (Math.abs(a - D.mle[0]) < d.params[0].step * 0.51) a = D.mle[0];
  if (Math.abs(b - D.mle[1]) < d.params[1].step * 0.51) b = D.mle[1];
  store.set({ theta: a, theta2: b });
}
function nudge(k, dir, big) {
  const s = store.get();
  const d = distOf(s);
  const th = thetaOf(s, d);
  const p = d.params[k];
  const step = p.step * (big ? 10 : 1) * dir;
  if (is2(d)) {
    const v = th.slice();
    v[k] += step;
    userTheta2(v);
  } else userTheta(th + step, { snap: true });
}

// ─── 조작부 ───
const bind = {
  t0: bindRange($('t0-range'), $('t0-num'), { onInput: (v) => newTrue({ t0: v }) }),
  t02: bindRange($('t02-range'), $('t02-num'), { onInput: (v) => newTrue({ t02: v }) }),
  n: bindRange($('n-range'), $('n-num'), {
    onInput: (v) => store.set({ n: Math.round(Math.min(MAX_N, Math.max(1, v))) }),
    valueText: (v) => `n = ${v}`,
  }),
  th: bindRange($('th-range'), $('th-num'), { onInput: (v) => userTheta(v, { snap: true }) }),
  th2: bindRange($('th2-range'), $('th2-num'), {
    onInput: (v) => {
      const s = store.get();
      userTheta2([s.theta ?? mid(distOf(s).params[0]), v]);
    },
  }),
};
const mb = $('mb-range');
mb.addEventListener('input', () => userTheta(Number(mb.value), { snap: true }));

function newTrue(patch) {
  stopAnim(true);
  store.set({ ...patch, data: null });
}

let knownBinds = [];
function buildKnownFields(d) {
  const box = $('known-fields');
  box.innerHTML = '';
  knownBinds = d.knownSpec.map((k) => {
    const f = document.createElement('div');
    f.className = 'field';
    f.innerHTML = `<div class="field-head"><label for="k-${k.key}-num" id="k-${k.key}-label">${k.label}</label></div>
      <div class="range-row"><input type="range" id="k-${k.key}-range" aria-labelledby="k-${k.key}-label"><input type="number" id="k-${k.key}-num"></div>`;
    box.append(f);
    const b = bindRange(f.querySelector('input[type=range]'), f.querySelector('input[type=number]'), {
      onInput: (v) => {
        stopAnim(true);
        store.set({ [k.key]: v });
      },
      format: (v) => (k.int ? String(v) : v.toFixed(decimalsFor(k.step))),
    });
    b.config(k);
    return { spec: k, b };
  });
}

$('seed').addEventListener('change', () => {
  const v = Number.parseInt($('seed').value, 10);
  if (Number.isFinite(v)) {
    stopAnim(true);
    store.set({ seed: Math.max(0, v), data: null });
  }
});
function resample() {
  stopAnim(true);
  store.set({ seed: store.get().seed + 1, data: null });
}
$('resample').addEventListener('click', resample);
$('mb-resample').addEventListener('click', resample);

// 자료 직접 입력
function dataMsg(t) {
  $('data-msg').textContent = t;
}
$('data-apply').addEventListener('click', () => {
  const d = distOf(store.get());
  const raw = $('data-input').value.split(/[,\s;]+/).filter(Boolean);
  const nums = raw.map(Number);
  const ok = nums.filter((v) => Number.isFinite(v) && d.validX(v)).slice(0, MAX_N);
  if (!ok.length) return dataMsg('이 분포에 맞는 값이 없습니다.');
  const bad = raw.length - ok.length;
  dataMsg(`${ok.length}개 적용${bad ? `, ${bad}개는 이 분포에 맞지 않아 뺐습니다` : ''}.`);
  stopAnim(true);
  store.set({ data: ok });
});
$('data-clear').addEventListener('click', () => {
  stopAnim(true);
  store.set({ data: null, edit: false });
  dataMsg('');
});
$('edit-toggle').addEventListener('change', (e) => {
  store.set({ edit: e.target.checked });
  if (e.target.checked) $('data-details').open = true;
});

// 보기 옵션
const toggles = { 'hide-true': 'hide', 'opt-rel': 'rel', 'opt-tan': 'tan', 'opt-truecurve': 'truec', 'opt-curv': 'curv' };
for (const [id, key] of Object.entries(toggles)) $(id).addEventListener('change', (e) => store.set({ [key]: e.target.checked }));
$('reveal').addEventListener('click', () => store.set({ hide: false }));
$('sort-index').addEventListener('click', () => store.set({ sort: 'index' }));
$('sort-value').addEventListener('click', () => store.set({ sort: 'value' }));
$('prod-toggle').addEventListener('click', () => store.set({ prod: !store.get().prod }));
$('zoom').addEventListener('click', () => store.set({ zoom: !store.get().zoom }));
$('goto-mle').addEventListener('click', () => {
  pauseAnim();
  const D = dataFor(store.get());
  if (is2(D.dist)) store.set({ theta: D.mle[0], theta2: D.mle[1] });
  else store.set({ theta: D.mle });
});
$('copy-link').addEventListener('click', async () => {
  const btn = $('copy-link');
  try {
    await navigator.clipboard.writeText(store.href());
    btn.textContent = '복사했습니다';
  } catch {
    btn.textContent = '주소창의 링크를 복사하세요';
  }
  setTimeout(() => (btn.textContent = '링크 복사'), 1600);
});
$('hl-close').addEventListener('click', () => store.set({ hl: 0 }));

// 분포 탭
const tabs = $('dist-tabs');
for (const d of DISTS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('role', 'tab');
  b.id = `tab-${d.id}`;
  b.setAttribute('aria-controls', 'sim');
  b.dataset.id = d.id;
  b.textContent = d.name;
  b.addEventListener('click', () => selectDist(d.id));
  tabs.append(b);
}
tabs.addEventListener('keydown', (e) => {
  const list = [...tabs.querySelectorAll('[role=tab]')];
  const i = list.indexOf(document.activeElement);
  if (i < 0) return;
  let j = null;
  if (e.key === 'ArrowRight') j = (i + 1) % list.length;
  else if (e.key === 'ArrowLeft') j = (i - 1 + list.length) % list.length;
  else if (e.key === 'Home') j = 0;
  else if (e.key === 'End') j = list.length - 1;
  if (j === null) return;
  e.preventDefault();
  list[j].focus();
  selectDist(list[j].dataset.id);
});
function selectDist(id) {
  if (id === store.get().dist) return;
  stopAnim(true);
  const d = getDist(id);
  hover = null;
  store.set({
    dist: id,
    t0: is2(d) ? d.defaults.theta0[0] : d.defaults.theta0,
    t02: is2(d) ? d.defaults.theta0[1] : null,
    theta: mid(d.params[0]),
    theta2: is2(d) ? mid(d.params[1]) : null,
    data: null,
    zoom: false,
    hl: 0,
  });
}

// 키보드: ←/→ 후보 이동 (Shift = 10배), R 새 표본
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
  if (e.target.closest?.('[role=tablist]')) return;
  if (e.target.type === 'range') return; // 슬라이더는 자체 처리
  if (e.key === 'r' || e.key === 'R') {
    e.preventDefault();
    resample();
    return;
  }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    nudge(0, e.key === 'ArrowRight' ? 1 : -1, e.shiftKey);
    return;
  }
  const d = distOf(store.get());
  if (is2(d) && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.target.closest?.('#panel-c')) {
    e.preventDefault();
    nudge(1, e.key === 'ArrowUp' ? 1 : -1, e.shiftKey);
  }
});

// ─── "최댓값 찾기" 애니메이션 ───
const anim = { path: null, upto: 0, timer: null, playing: false, dataKey: null };
$('find-max').addEventListener('click', startAnim);
$('anim-play').addEventListener('click', () => (anim.playing ? pauseAnim() : playAnim()));
$('anim-step').addEventListener('click', () => {
  pauseAnim();
  stepAnim();
});
$('anim-close').addEventListener('click', () => stopAnim(true));

function startAnim() {
  stopAnim(true);
  const s = store.get();
  const D = dataFor(s);
  anim.path = newtonPath(D.dist, D.xs, thetaOf(s, D.dist));
  anim.upto = 0;
  anim.dataKey = D.key;
  $('iter').classList.remove('hidden');
  if (reducedMotion()) {
    // 움직임을 줄이는 설정이면 자동 재생 대신 한 단계씩 정지 화면
    $('anim-play').textContent = '재생';
    schedule();
  } else playAnim();
}
function playAnim() {
  if (!anim.path) return;
  if (anim.upto >= anim.path.steps.length) anim.upto = 0;
  anim.playing = true;
  $('anim-play').textContent = '일시정지';
  clearInterval(anim.timer);
  anim.timer = setInterval(() => {
    stepAnim();
    if (anim.upto >= anim.path.steps.length) pauseAnim();
  }, 600);
  schedule();
}
function pauseAnim() {
  clearInterval(anim.timer);
  anim.timer = null;
  anim.playing = false;
  $('anim-play').textContent = anim.path && anim.upto >= anim.path.steps.length ? '다시 재생' : '재생';
}
function stepAnim() {
  if (!anim.path || anim.upto >= anim.path.steps.length) return;
  const st = anim.path.steps[anim.upto];
  anim.upto++;
  const d = distOf(store.get());
  if (is2(d)) store.set({ theta: st.next[0], theta2: st.next[1] });
  else store.set({ theta: st.next });
}
function stopAnim(hide) {
  pauseAnim();
  anim.path = null;
  anim.upto = 0;
  if (hide) {
    $('iter').classList.add('hidden');
    $('explain').classList.add('hidden');
  }
}

function renderIter(D) {
  if (!anim.path) return;
  const two = is2(D.dist);
  const sym = D.dist.label;
  $('iter-title').textContent = D.dist.stepper
    ? '끝점 찾기: 오르막(θ 감소) 방향으로 걷다가 경계 max xᵢ에서 멈춘다'
    : two
      ? '뉴턴 반복: θ ← θ − H⁻¹ ∇ℓ(θ)'
      : `뉴턴 반복: ${sym} ← ${sym} − ℓ′(${sym}) / ℓ″(${sym})`;
  const head = two ? ['k', 'μ', 'σ²', 'ℓ', '|∇ℓ|'] : ['k', sym, `ℓ(${sym})`, `ℓ′(${sym})`, `ℓ″(${sym})`];
  $('iter-table').querySelector('thead tr').innerHTML = head.map((h) => `<th scope="col">${h}</th>`).join('');
  const steps = anim.path.steps;
  const shown = Math.min(anim.upto + 1, steps.length);
  const rows = [];
  for (let k = 0; k < shown; k++) {
    const st = steps[k];
    const cur = k === Math.min(anim.upto, steps.length - 1) ? ' class="current"' : '';
    const cells = two
      ? [k, fmt(st.theta[0], 5), fmt(st.theta[1], 5), fmt(st.ll, 4), fmt(Math.hypot(st.score[0], st.score[1]), 6)]
      : [k, fmt(st.theta, 6), fmt(st.ll, 4), fmt(st.score, 6), fmt(st.hess, 3)];
    rows.push(`<tr${cur}>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`);
  }
  const tbody = $('iter-table').querySelector('tbody');
  tbody.innerHTML = rows.join('');
  const wrap = tbody.closest('.iter-table-wrap');
  wrap.scrollTop = wrap.scrollHeight;

  // 끝나면 설명 상자
  const done = anim.upto >= steps.length;
  const box = $('explain');
  if (done) {
    let msg;
    if (anim.path.note && D.dist.stepper) msg = `<div class="callout-title">왜 여기서 멈추나요?</div>${anim.path.note} 미분 = 0 방법은 모든 분포에 통하지 않습니다 — 로그가능도가 끝점에서 최대인 경우가 있습니다.`;
    else if (anim.path.boundary) msg = `<div class="callout-title">경계 해</div>${D.dist.boundaryNote?.(D.xs) ?? ''} 반복은 모수공간 안에 머물도록 걸음을 반으로 줄이며 경계에 다가갈 뿐 도달하지 않습니다.`;
    else {
      const last = steps[steps.length - 1];
      const g = two ? Math.hypot(last.score[0], last.score[1]) : Math.abs(last.score);
      msg = `<div class="callout-title">수렴</div>${steps.length - 1}단계 만에 기울기 ${two ? '|∇ℓ|' : `|ℓ′(${D.dist.label})|`} = ${fmt(g, 8)}에 도달했습니다. 닫힌 형태 θ̂와 같은 곳입니다.`;
    }
    box.innerHTML = msg;
    box.classList.toggle('warn', Boolean(anim.path.boundary));
    box.classList.toggle('ok', !anim.path.boundary);
    box.classList.remove('hidden');
  } else box.classList.add('hidden');
}

// ─── 그리기 ───
// 다음 프레임에 한 번만 그린다. 탭이 가려져 rAF가 멈춰도 setTimeout이 대신한다.
let pending = false;
let raf = 0;
let timer = 0;
function schedule() {
  if (pending) return;
  pending = true;
  const run = () => {
    if (!pending) return;
    pending = false;
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    render();
  };
  raf = requestAnimationFrame(run);
  timer = setTimeout(run, 80);
}
store.subscribe(schedule);

const announce = createAnnouncer($('summary'), 700);
let lastDistId = null;

function configureControls(s, d) {
  const two = is2(d);
  const p0 = d.params[0];
  $('t0-label').textContent = `참값 ${p0.label}₀`;
  bind.t0.config({ min: p0.theta0Range[0], max: p0.theta0Range[1], step: p0.step });
  $('t02-field').classList.toggle('hidden', !two);
  $('th2-field').classList.toggle('hidden', !two);
  $('th-label').textContent = `후보 ${p0.label}`;
  const r0 = p0.range;
  bind.th.config({ min: r0[0], max: r0[1], step: p0.step });
  mb.min = String(r0[0]);
  mb.max = String(r0[1]);
  mb.step = String(p0.step);
  if (two) {
    const p1 = d.params[1];
    $('t02-label').textContent = `참값 ${p1.label}₀`;
    bind.t02.config({ min: p1.theta0Range[0], max: p1.theta0Range[1], step: p1.step });
    $('th2-label').textContent = `후보 ${p1.label}`;
    bind.th2.config({ min: p1.range[0], max: p1.range[1], step: p1.step });
  }
  buildKnownFields(d);
  $('goto-mle').textContent = `${p0.label}̂로 이동`;
  $('zoom').textContent = `${two ? 'θ̂' : `${p0.label}̂`} 주변 확대`;
  $('pc-title').textContent = two ? '로그가능도 등고선' : '가능도 곡선';
  $('pc-desc').textContent = two
    ? '등고선 위의 주황 점을 끌어 (μ, σ²)를 옮기세요. 자주 화살표는 점수 벡터 ∇ℓ — 가장 가파르게 올라가는 방향입니다. ↑/↓ 키로 σ²를 움직입니다.'
    : '곡선을 끌어 후보를 옮기세요. 꼭대기에서 접선이 수평이 됩니다 (기울기 = 점수함수 = 0).';
  $('chart-c').classList.toggle('hidden', two);
  $('chart-c2').classList.toggle('hidden', !two);
  $('deriv-link').href = `derivations.html#${d.id}`;
  $('dist-lesson').textContent = `${d.title} — ${d.lesson}`;
  for (const b of tabs.querySelectorAll('[role=tab]')) {
    const on = b.dataset.id === d.id;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  }
  $('sim').setAttribute('aria-labelledby', `tab-${d.id}`);
}

const HL_TEXT = {
  1: ['유도 1단계 — 가능도는 관측치별 밀도의 곱입니다. 패널 A 점선 높이를 모두 곱한 값이고, 패널 B의 "곱으로 보면"에서 누적곱이 빠르게 0으로 붙는 모습을 봅니다.', ['panel-a', 'panel-b']],
  2: ['유도 2단계 — 로그를 취하면 곱이 합이 됩니다. 패널 B의 막대를 모두 더한 것이 오른쪽 합계 ℓ(θ)입니다.', ['panel-b']],
  3: ['유도 3단계 — 점수함수 ℓ′(θ)는 패널 C 접선의 기울기입니다. 접선이 수평이 되도록 후보를 옮겨 보세요.', ['panel-c']],
  4: ['유도 4단계 — θ̂에서 접선이 수평입니다. 수치 카드의 대입식이 닫힌 형태 추정량입니다.', ['panel-c', 'panel-stats']],
  5: ['유도 5단계 — 꼭대기에서 곡선이 꺾이는 정도(−ℓ″, 관측 정보량)가 클수록 추정이 정밀합니다. 파랑 막대가 95% 가능도 구간입니다.', ['panel-c']],
};

function render() {
  const s = store.get();
  const D = dataFor(s);
  const { dist, xs, mle, llMle } = D;
  const two = is2(dist);
  if (dist.id !== lastDistId) {
    configureControls(s, dist);
    lastDistId = dist.id;
  }
  if (anim.path && anim.dataKey !== D.key) stopAnim(true);
  if (hover != null && hover >= xs.length) hover = null;

  const theta0 = D.theta0;
  const theta = thetaOf(s, dist);
  const showTrue = !s.hide;
  const G = gridFor(D, s);
  const sym = dist.label;

  // 조작부 값
  bind.t0.set(two ? theta0[0] : theta0);
  if (two) bind.t02.set(theta0[1]);
  $('t0-range').setAttribute('aria-valuetext', `${dist.params[0].label}₀ = ${fmt(two ? theta0[0] : theta0, 2)}`);
  for (const { spec, b } of knownBinds) b.set(dist.known[spec.key]);
  bind.n.set(xs.length);
  $('n-range').disabled = D.custom;
  $('n-num').disabled = D.custom;
  $('n-hint').textContent = D.custom ? `직접 입력한 자료 ${xs.length}개를 쓰는 중입니다. "새 표본"을 누르면 표본으로 돌아갑니다.` : 'n을 늘려도 이미 뽑은 점은 그대로 남습니다.';
  if (document.activeElement !== $('seed')) $('seed').value = String(s.seed);
  const t1 = two ? theta[0] : theta;
  const p0 = dist.params[0];
  const dec = decimalsFor(p0.step);
  bind.th.set(t1);
  $('th-range').setAttribute('aria-valuetext', `${sym === '(μ, σ²)' ? 'μ' : p0.label} = ${fmt(t1, dec)}`);
  $('th-num').value = document.activeElement === $('th-num') ? $('th-num').value : t1.toFixed(dec);
  if (two) {
    bind.th2.set(theta[1]);
    $('th2-range').setAttribute('aria-valuetext', `σ² = ${fmt(theta[1], 2)}`);
  }
  mb.value = String(t1);
  mb.setAttribute('aria-valuetext', `${p0.label} = ${fmt(t1, dec)}`);
  $('mb-label').textContent = `${p0.label} = ${fmt(t1, Math.min(dec, 3))}`;
  $('hide-true').checked = s.hide;
  $('reveal').disabled = !s.hide;
  $('opt-rel').checked = s.rel;
  $('opt-rel').disabled = two;
  $('opt-tan').checked = s.tan;
  $('opt-truecurve').checked = s.truec;
  $('opt-curv').checked = s.curv;
  $('edit-toggle').checked = s.edit;
  $('sort-index').setAttribute('aria-pressed', String(s.sort !== 'value'));
  $('sort-value').setAttribute('aria-pressed', String(s.sort === 'value'));
  $('prod-toggle').setAttribute('aria-pressed', String(s.prod));
  $('zoom').setAttribute('aria-pressed', String(s.zoom));
  document.querySelectorAll('.true-only').forEach((el) => el.classList.toggle('hidden', !showTrue));

  // 계산
  const contrib = xs.map((x) => dist.logpdf(x, theta));
  const contribMle = xs.map((x) => dist.logpdf(x, mle));
  const ll = contrib.reduce((a, b) => a + b, 0);
  const scoreRaw = dist.score(xs, theta);
  const hess = dist.hessian(xs, theta);
  const score = two ? scoreRaw : Number.isFinite(ll) ? scoreRaw : NaN;
  const order = d3.range(xs.length);
  if (s.sort === 'value') order.sort((a, b) => xs[a] - xs[b] || a - b);

  const fmtT = (t) => (two ? `(${fmt(t[0], 2)}, ${fmt(t[1], 2)})` : fmt(t, Math.min(dec, 3)));
  const altC = `후보 ${sym} = ${fmtT(theta)}, 로그가능도 ${fmt(ll, 1)}, 최댓값 ${fmt(llMle, 1)}은 ${sym}̂ = ${fmtT(mle)}에서.${two ? '' : ` 접선 기울기 ${fmt(score, 2)}.`}`;
  const model = {
    dist,
    xs,
    theta,
    theta0,
    mle,
    showTrue,
    trueCurve: s.truec,
    hover,
    editable: s.edit,
    xDomain: D.xDomain,
    contrib,
    contribMle,
    ll,
    llMle,
    score,
    hess,
    llAt: D.llFn,
    alt: `패널 A: 관측치 ${xs.length}개와 후보 ${sym} = ${fmtT(theta)}의 ${dist.discrete ? '확률질량 막대' : '밀도 곡선'}.`,
    altB: `패널 B: 관측치별 log f(xᵢ|θ) 막대 ${xs.length}개. 합계 ℓ(θ) = ${fmt(ll, 2)}, θ̂에서의 합계 ${fmt(llMle, 2)}.`,
    altC,
  };
  panelA.update(model);

  // 패널 B
  let totLo;
  if (two) {
    const vals = G.grid.values;
    let lo = Infinity;
    for (let i = 0; i < vals.length; i++) if (vals[i] < lo) lo = vals[i];
    totLo = Math.max(lo, llMle - 400);
  } else totLo = finiteExtent(G.lls)[0];
  // 합계 막대 축: 꼭대기 근처 변화가 보이도록 ℓ(θ̂) 아래 일정 폭만 (넘으면 주홍 테두리)
  totLo = Math.max(totLo, llMle - Math.max(12, 2 * xs.length));
  const bLo = two ? Math.min(-6, Math.min(...contribMle) - 1) : D.bLo;
  const bHi = two ? Math.max(0.5, Math.max(...contribMle) + 0.5) : D.bHi;
  model.B = { lo: bLo, hi: bHi, totLo, totHi: llMle + 0.06 * Math.max(1, llMle - totLo), order, sort: s.sort, product: s.prod };
  panelB.update(model);

  // 패널 C
  const newton = anim.path ? { steps: anim.path.steps, upto: anim.upto } : null;
  if (two) {
    model.C2 = { ...G, newton, curvature: s.curv, tangent: s.tan };
    panelC2.update(model);
  } else {
    model.C = { ts: G.ts, lls: G.lls, range: G.range, relative: s.rel, tangent: s.tan, curvature: s.curv, interval: G.interval, newton };
    panelC.update(model);
  }

  // 곡률 정보
  let curvText = '';
  if (s.curv) {
    if (two) {
      const [m0, v] = mle;
      curvText = `SE(μ̂) ≈ √(σ̂²/n) = ${fmt(Math.sqrt(v / xs.length), 3)},  SE(σ̂²) ≈ σ̂²·√(2/n) = ${fmt(v * Math.sqrt(2 / xs.length), 3)}.  파랑 점선 영역: ℓ ≥ ℓ(θ̂) − 3.00 (근사 95% 가능도 영역). μ̂ = ${fmt(m0, 3)}`;
    } else if (D.se) {
      curvText = `관측 정보량 −ℓ″(${sym}̂) = ${fmt(1 / D.se ** 2, 3)},  표준오차 SE ≈ 1/√(−ℓ″(${sym}̂)) = ${fmt(D.se, 4)}.  95% 가능도 구간 (ℓ ≥ ℓ(${sym}̂) − 1.92): [${fmt(G.interval[0], 3)}, ${fmt(G.interval[1], 3)}]`;
    } else if (dist.stepper) {
      curvText = `ℓ″(${sym}̂) = n/${sym}̂² > 0 이라 곡률로 표준오차를 구할 수 없습니다. 95% 가능도 구간: [${fmt(G.interval[0], 3)}, ${fmt(G.interval[1], 3)}]`;
    } else curvText = `θ̂가 경계에 있어 곡률로 표준오차를 구할 수 없습니다.`;
  }
  $('curv-info').textContent = curvText;

  // 수치 카드
  $('formula').textContent = dist.mleExplain(xs);
  const stat = (k, v, cls = '') => `<div class="stat ${cls}"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  const cards = [stat('표본크기 n', xs.length)];
  for (const ss of dist.suffStats(xs)) cards.push(stat(`충분통계량 ${ss.label}`, ss.value));
  if (two) {
    cards.push(stat('후보 (μ, σ²)', `(${fmt(theta[0], 3)}, ${fmt(theta[1], 3)})`, 'theta'));
    cards.push(stat('θ̂ = (μ̂, σ̂²)', `(${fmt(mle[0], 3)}, ${fmt(mle[1], 3)})`, 'mle'));
  } else {
    cards.push(stat(`후보 ${sym}`, fmt(theta, Math.min(dec, 4)), 'theta'));
    cards.push(stat(`최대가능도추정값 ${sym}̂`, fmt(mle, 4), 'mle'));
  }
  if (showTrue) cards.push(stat(`참값 ${sym}₀`, two ? `(${fmt(theta0[0], 2)}, ${fmt(theta0[1], 2)})` : fmt(theta0, 3), 'true'));
  cards.push(stat(`ℓ(${two ? 'θ' : sym})`, fmt(ll, 3), 'theta'));
  cards.push(stat(`ℓ(${two ? 'θ̂' : `${sym}̂`})`, fmt(llMle, 3), 'mle'));
  cards.push(stat('ℓ(θ̂) − ℓ(θ)  (항상 0 이상)', fmt(llMle - ll, 3)));
  cards.push(two ? stat('점수 ∇ℓ', `(${fmt(score[0], 3)}, ${fmt(score[1], 3)})`, 'score') : stat(`점수 ℓ′(${sym})`, fmt(score, 4), 'score'));
  if (!two && s.curv && D.se) cards.push(stat('표준오차 SE', fmt(D.se, 4)));
  $('stats').innerHTML = cards.join('');

  const bnote = dist.boundaryNote ? dist.boundaryNote(xs) : null;
  $('boundary-note').innerHTML = bnote ? `<div class="callout-title">경계 해</div>${bnote}` : '';
  $('boundary-note').classList.toggle('hidden', !bnote);
  const myth = mythFor(dist, bnote);
  $('myth-dist').innerHTML = myth;
  $('myth-dist').classList.toggle('hidden', !myth);
  $('myth-c').classList.toggle('hidden', two);

  // 유도 노트에서 온 강조
  const hl = HL_TEXT[s.hl];
  $('hl-banner').classList.toggle('hidden', !hl);
  if (hl) $('hl-text').textContent = hl[0];
  for (const id of ['panel-a', 'panel-b', 'panel-c', 'panel-stats']) $(id).classList.toggle('highlight', Boolean(hl && hl[1].includes(id)));

  renderIter(D);
  announce(altC);
}

function mythFor(dist, bnote) {
  if (dist.id === 'uniform')
    return '<div class="callout-title">흔한 오해: "MLE는 늘 미분 = 0으로 구한다"</div>균등(0, θ)에서는 ℓ′(θ) = −n/θ가 0이 되는 곳이 없습니다. 답은 끝점 max xᵢ입니다. "최댓값 찾기"를 눌러 보세요.';
  if (dist.id === 'normal2')
    return '<div class="callout-title">흔한 오해: "MLE는 늘 불편추정량이다"</div>σ̂² = Σ(xᵢ−x̄)²/n은 평균적으로 σ²보다 작습니다 (E[σ̂²] = (n−1)σ²/n). <a href="sampling.html?dist=normal2&n=5">반복 실험</a>에서 s²와 비교해 보세요.';
  if (bnote && (dist.id === 'bernoulli' || dist.id === 'binomial'))
    return '<div class="callout-title">흔한 오해: "모두 0(또는 1)인 표본에서도 답이 내부에 있다"</div>성공(또는 실패)만 관측되면 p̂가 0이나 1인 경계에 놓입니다. ℓ 곡선이 끝으로 갈수록 계속 올라갑니다.';
  return '';
}

// ─── 시작: 빠진 값을 채워 URL을 완전하게 ───
function init() {
  const s = store.get();
  const d = getDist(s.dist);
  if (d.id !== s.dist) store.set({ dist: d.id });
  const patch = {};
  if (s.t0 === null) patch.t0 = is2(d) ? d.defaults.theta0[0] : d.defaults.theta0;
  if (is2(d) && s.t02 === null) patch.t02 = d.defaults.theta0[1];
  if (s.theta === null) patch.theta = mid(d.params[0]);
  if (is2(d) && s.theta2 === null) patch.theta2 = mid(d.params[1]);
  if (s.data && s.data.length) {
    $('data-input').value = s.data.join(', ');
    $('data-details').open = true;
  }
  store.set(patch);
  render();
}

init();
