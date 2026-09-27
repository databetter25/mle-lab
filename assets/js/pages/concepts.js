// 개념 따라가기 — 4단계 투어. 각 단계: 글 + 인터랙티브 그림 + 직접 해 보기 + 확인 질문.

import { getDist, withKnown } from '../dists/index.js';
import { mulberry32 } from '../core/rng.js';
import { loglik, linspace } from '../core/lik.js';
import { fmt, fmtSig, sup } from '../core/format.js';
import { bindRange, renderTexIn } from '../ui/common.js';
import { createFrame, drawAxes, tickFmt, symbols, niceMax } from '../plots/chart.js';

const d3 = window.d3;
const $ = (id) => document.getElementById(id);
const MARGIN = { top: 20, right: 16, bottom: 44, left: 56 };

/** 작은 선 그래프 (곡선·점·세로선·선분), 끌기 지원 */
function lineChart(el, { height = 240, onDrag } = {}) {
  const F = createFrame(el, { layers: ['grid', 'yaxis', 'xaxis', 'vlines', 'series', 'segs', 'points', 'labels', 'drag'] });
  let m = null;
  let dragging = false;
  let x = null;
  F.onResize(() => m && draw());
  if (onDrag) F.svg.classed('draggable', true);
  function draw() {
    const { iw, ih } = F.layout(height, MARGIN);
    x = d3.scaleLinear().domain(m.xDomain).range([0, iw]);
    const y = d3.scaleLinear().domain(m.yDomain).range([ih, 0]);
    drawAxes(F.L, x, y, iw, ih, { xLabel: m.xLabel, yLabel: m.yLabel, xFormat: tickFmt('~g'), yFormat: m.yFormat ?? tickFmt('~g') });
    const clip = `url(#${F.clipId})`;
    F.L.vlines
      .selectAll('line')
      .data(m.vlines ?? [])
      .join('line')
      .attr('class', (d) => d.cls)
      .attr('x1', (d) => x(d.x))
      .attr('x2', (d) => x(d.x))
      .attr('y1', 0)
      .attr('y2', ih);
    F.L.series
      .attr('clip-path', clip)
      .selectAll('path')
      .data(m.series ?? [])
      .join('path')
      .attr('class', (d) => d.cls)
      .attr('d', (d) => d3.line().x((p) => x(p[0])).y((p) => y(p[1]))(d.pts));
    F.L.segs
      .attr('clip-path', clip)
      .selectAll('line')
      .data(m.segs ?? [])
      .join('line')
      .attr('class', (d) => d.cls)
      .attr('x1', (d) => x(d.x1))
      .attr('y1', (d) => y(d.y1))
      .attr('x2', (d) => x(d.x2))
      .attr('y2', (d) => y(d.y2));
    F.L.points
      .selectAll('path')
      .data(m.points ?? [])
      .join('path')
      .attr('class', (d) => d.cls)
      .attr('d', (d) => symbols[d.shape ?? 'circle'](d.size ?? 120))
      .attr('transform', (d) => `translate(${x(d.x)},${y(Math.max(m.yDomain[0], Math.min(m.yDomain[1], d.y)))})`);
    F.L.labels
      .selectAll('text')
      .data(m.labels ?? [])
      .join('text')
      .attr('class', (d) => d.cls)
      .attr('x', (d) => Math.min(iw - 4, Math.max(4, x(d.x))))
      .attr('y', (d) => (d.py !== undefined ? d.py : y(d.y) - 12))
      .attr('text-anchor', (d) => (x(d.x) > iw - 120 ? 'end' : x(d.x) < 120 ? 'start' : 'middle'))
      .text((d) => d.text);
    if (onDrag) {
      F.L.drag
        .selectAll('rect')
        .data([0])
        .join('rect')
        .attr('class', 'drag-hit')
        .attr('width', iw)
        .attr('height', ih)
        .on('pointerdown', (e) => {
          dragging = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          onDrag(x.invert(d3.pointer(e, F.g.node())[0]));
        })
        .on('pointermove', (e) => dragging && onDrag(x.invert(d3.pointer(e, F.g.node())[0])))
        .on('pointerup pointercancel', () => (dragging = false));
    }
    F.setLabel(m.alt ?? '');
  }
  return {
    update(model) {
      m = model;
      draw();
    },
  };
}

// ─── 확인 질문 ───
const QUIZ = {
  s1: {
    q: '가능도 L(λ | x = 1.2)를 λ에 대해 0부터 ∞까지 적분하면 1이다.',
    options: ['맞다', '아니다'],
    answer: 1,
    right: '맞습니다. 가능도는 λ의 확률분포가 아니므로 적분이 1일 필요가 없습니다. 이 경우 ∫λe^(−1.2λ)dλ = 1/1.2² ≈ 0.694입니다.',
    wrong: '다시 보세요. 오른쪽 곡선 아래 넓이는 0.694입니다. 가능도는 λ에 대한 확률분포가 아닙니다.',
  },
  s2: {
    q: '관측치 20개의 밀도가 모두 0.3이다. 가능도(곱)는 대략 얼마인가?',
    options: ['0.3', '6', '3.5 × 10⁻¹¹'],
    answer: 2,
    right: '맞습니다. 0.3²⁰ ≈ 3.5 × 10⁻¹¹. 로그로 보면 20 × log 0.3 ≈ −24.1로 다루기 쉬운 크기입니다.',
    wrong: '곱은 더하기가 아닙니다. 1보다 작은 수를 20번 곱하면 0.3²⁰ ≈ 3.5 × 10⁻¹¹로 매우 작아집니다.',
  },
  s3: {
    q: '현재 μ에서 점수 ℓ′(μ)가 양수다. 최대가능도추정값 μ̂는 어느 쪽에 있는가?',
    options: ['현재 μ의 오른쪽', '현재 μ의 왼쪽', '알 수 없다'],
    answer: 0,
    right: '맞습니다. 로그가능도가 위로 볼록한 곡선이므로 기울기가 양수면 오르막인 오른쪽에 꼭대기가 있습니다.',
    wrong: '기울기가 양수면 오른쪽으로 갈수록 ℓ이 커집니다. 꼭대기는 오른쪽에 있습니다.',
  },
  s4: {
    q: '표본크기를 4배로 늘리면 μ̂의 표준오차는 어떻게 되는가?',
    options: ['2배', '1/2배', '1/4배'],
    answer: 1,
    right: '맞습니다. 표준오차는 σ/√n이므로 n이 4배면 1/√4 = 1/2배입니다.',
    wrong: '정보량 n/σ²은 4배가 되지만 표준오차는 그 역수의 제곱근이라 1/2배입니다.',
  },
};

function buildQuiz(el) {
  const Q = QUIZ[el.dataset.quiz];
  const id = `q-${el.dataset.quiz}`;
  el.innerHTML = `<fieldset><legend id="${id}">확인 질문 · ${Q.q}</legend>
    <div class="options">${Q.options.map((o, i) => `<button type="button" class="btn btn-sm" data-i="${i}" aria-pressed="false">${o}</button>`).join('')}</div>
    <p class="feedback" role="status" aria-live="polite"></p></fieldset>`;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    el.querySelectorAll('[data-i]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const ok = Number(b.dataset.i) === Q.answer;
    const fb = el.querySelector('.feedback');
    fb.textContent = `${ok ? '정답 · ' : '다시 생각해 보기 · '}${ok ? Q.right : Q.wrong}`;
    fb.className = `feedback ${ok ? 'right' : 'wrong'}`;
  });
}
document.querySelectorAll('[data-quiz]').forEach(buildQuiz);

// ─── 1단계: 확률과 가능도 (지수분포, x = 1.2) ───
{
  const X = 1.2;
  const f = (x, l) => (x < 0 ? 0 : l * Math.exp(-l * x));
  const left = lineChart($('s1-left'));
  const right = lineChart($('s1-right'), { onDrag: (v) => set(v) });
  const xs = linspace(0, 5, 200);
  const ls = linspace(0.01, 4, 300);
  const Lcurve = ls.map((l) => [l, f(X, l)]);
  const Lmax = f(X, 1 / X);
  let lam = 2.5;
  let done = false;
  const b = bindRange($('s1-range'), $('s1-num'), { onInput: (v) => set(v), format: (v) => v.toFixed(2), valueText: (v) => `λ = ${v.toFixed(2)}` });
  function set(v) {
    lam = Math.min(4, Math.max(0.1, v));
    draw();
  }
  function draw() {
    b.set(lam);
    const curve = xs.map((x) => [x, f(x, lam)]);
    const h = f(X, lam);
    left.update({
      xDomain: [0, 5],
      yDomain: [0, 4.2],
      xLabel: 'x',
      yLabel: 'f(x | λ)',
      series: [{ pts: curve, cls: 'curve-theta' }],
      segs: [{ x1: X, y1: 0, x2: X, y2: h, cls: 'stem' }],
      points: [
        { x: X, y: 0, cls: 'obs', size: 80 },
        { x: X, y: h, cls: 'theta-mark', size: 110 },
      ],
      labels: [{ x: X, y: h, text: `f(1.2 | λ) = ${fmt(h, 3)}`, cls: 'mle-label' }],
      alt: `λ = ${fmt(lam, 2)}인 지수분포 밀도 곡선. x = 1.2에서 높이 ${fmt(h, 3)}.`,
    });
    right.update({
      xDomain: [0, 4],
      yDomain: [0, niceMax(Lmax * 1.15)],
      xLabel: 'λ',
      yLabel: 'L(λ | x = 1.2)',
      series: [{ pts: Lcurve, cls: 'lik-curve' }],
      vlines: done ? [{ x: 1 / X, cls: 'mle-line' }] : [],
      points: [{ x: lam, y: h, cls: 'theta-mark', size: 130 }],
      labels: [{ x: lam, y: h, text: `L = ${fmt(h, 3)}`, cls: 'score-label' }],
      alt: `x = 1.2를 고정한 가능도 곡선. 현재 λ = ${fmt(lam, 2)}에서 L = ${fmt(h, 3)}. 최댓값은 λ = 1/1.2 ≈ 0.833.`,
    });
    $('s1-area').textContent = `곡선 아래 넓이 ∫L(λ)dλ = 1/x² = ${fmt(1 / (X * X), 3)} — 1이 아닙니다.`;
    if (Math.abs(lam - 1 / X) < 0.02 && !done) {
      done = true;
      $('s1-task').classList.add('done');
      $('s1-task-text').textContent = `찾았습니다! λ = ${fmt(lam, 2)} ≈ 1/1.2에서 높이가 가장 큽니다. 바로 오른쪽 가능도 곡선의 꼭대기(파랑 선)입니다 — 관측값 하나의 최대가능도추정값 λ̂ = 1/x.`;
      draw();
    }
  }
  draw();
}

// ─── 2단계: 곱에서 합으로 (정규, σ = 1) ───
{
  const dist = withKnown(getDist('normal'), { sigma: 1 });
  const all = dist.sample(mulberry32(7), 20, 1);
  let k = 3;
  let mu = 0.5;
  const left = lineChart($('s2-left'), { height: 230 });
  const barsEl = $('s2-right');
  const F = createFrame(barsEl, { layers: ['grid', 'yaxis', 'xaxis', 'bars'] });
  F.onResize(() => draw());
  const b = bindRange($('s2-range'), $('s2-num'), { onInput: (v) => ((mu = v), draw()), format: (v) => v.toFixed(2), valueText: (v) => `μ = ${v.toFixed(2)}` });
  $('s2-add').addEventListener('click', () => ((k = Math.min(20, k + 1)), draw()));
  $('s2-all').addEventListener('click', () => ((k = 20), draw()));
  $('s2-reset').addEventListener('click', () => ((k = 1), draw()));
  function draw() {
    b.set(mu);
    const xs = all.slice(0, k);
    const lf = xs.map((x) => dist.logpdf(x, mu));
    let s = 0;
    const cum = lf.map((v) => (s += v) / Math.LN10);
    const lo = Math.min(-1, Math.floor(Math.min(...cum)) - 1);
    left.update({
      xDomain: [1, 20],
      yDomain: [Math.min(lo, -12), 0],
      xLabel: '곱한 관측치 수',
      yLabel: '곱 (로그 축)',
      yFormat: (v) => (Number.isInteger(v) ? sup(`10^${v}`.replace('-', '−')) : ''),
      series: [{ pts: cum.map((c, i) => [i + 1, c]), cls: 'prod-theta' }],
      points: cum.map((c, i) => ({ x: i + 1, y: c, cls: 'theta-mark', size: 50 })),
      alt: `관측치 ${k}개의 밀도 곱은 ${fmtSig(10 ** cum[k - 1], 3)}.`,
    });
    const { iw, ih } = F.layout(230, MARGIN);
    const x = d3.scaleBand().domain(d3.range(20)).range([0, iw]).padding(0.2);
    const y = d3.scaleLinear().domain([-8, 0]).range([ih, 0]);
    F.L.grid.attr('class', 'gridline').call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat(''));
    F.L.yaxis.attr('class', 'axis').call(d3.axisLeft(y).ticks(4).tickFormat(tickFmt('~g')));
    F.L.xaxis
      .attr('class', 'axis')
      .attr('transform', `translate(0,${ih})`)
      .call(d3.axisBottom(x).tickValues([0, 4, 9, 14, 19]).tickFormat((i) => i + 1));
    F.L.bars
      .selectAll('rect')
      .data(lf)
      .join('rect')
      .attr('class', (v) => `contrib-bar${v < -8 ? ' extreme' : ''}`)
      .attr('x', (_, i) => x(i))
      .attr('width', x.bandwidth())
      .attr('y', (v) => y(Math.max(-8, v)))
      .attr('height', (v) => ih - y(Math.max(-8, v)));
    F.setLabel(`관측치 ${k}개의 log f 막대. 합 ℓ = ${fmt(s, 2)}.`);
    $('s2-count').textContent = `관측치 ${k} / 20개`;
    $('s2-prod').textContent = `L(μ) = Π f(xᵢ | μ) = ${sup(fmtSig(Math.exp(s), 3))}`;
    $('s2-sum').textContent = `ℓ(μ) = Σ log f(xᵢ | μ) = ${fmt(s, 3)}   (= log L)`;
  }
  draw();
}

// ─── 3단계: 꼭대기 찾기 ───
{
  const dist = withKnown(getDist('normal'), { sigma: 1 });
  const xs = dist.sample(mulberry32(3), 10, 1);
  const mle = dist.mle(xs);
  const grid = linspace(-2, 4, 300).map((t) => [t, loglik(dist, xs, t)]);
  const llMle = loglik(dist, xs, mle);
  const lo = Math.min(...grid.map((d) => d[1]));
  let mu = -1;
  let done = false;
  const chart = lineChart($('s3-chart'), { height: 280, onDrag: (v) => set(v) });
  const b = bindRange($('s3-range'), $('s3-num'), { onInput: (v) => set(v), format: (v) => v.toFixed(2), valueText: (v) => `μ = ${v.toFixed(2)}` });
  function set(v) {
    mu = Math.min(4, Math.max(-2, v));
    if (Math.abs(mu - mle) < 0.005) mu = mle;
    draw();
  }
  function draw() {
    b.set(mu);
    const ll = loglik(dist, xs, mu);
    const g = dist.score(xs, mu);
    const h = 0.8;
    chart.update({
      xDomain: [-2, 4],
      yDomain: [lo, llMle + (llMle - lo) * 0.1],
      xLabel: '후보 μ',
      yLabel: 'ℓ(μ)',
      series: [{ pts: grid, cls: 'lik-curve' }],
      vlines: done ? [{ x: mle, cls: 'mle-line' }] : [],
      segs: [{ x1: mu - h, y1: ll - g * h, x2: mu + h, y2: ll + g * h, cls: 'tangent' }],
      points: [{ x: mu, y: ll, cls: 'theta-mark', size: 150 }, ...(done ? [{ x: mle, y: llMle, cls: 'mle-mark', shape: 'diamond' }] : [])],
      labels: [{ x: mu, y: ll, text: `기울기 ℓ′(μ) = ${fmt(g, 2)}`, cls: 'score-label' }],
      alt: `후보 μ = ${fmt(mu, 2)}, ℓ = ${fmt(ll, 2)}, 기울기 ${fmt(g, 2)}.`,
    });
    if (Math.abs(g) < 0.1 && !done) {
      done = true;
      $('s3-task').classList.add('done');
      $('s3-task-text').textContent = `도착! 접선이 수평입니다 (ℓ′ ≈ 0). 이 점 μ̂ = ${fmt(mle, 3)}은 표본평균 x̄와 같습니다.`;
      draw();
    }
  }
  draw();
}

// ─── 4단계: 추정량의 성질 ───
{
  const dist = withKnown(getDist('normal'), { sigma: 1 });
  const all = dist.sample(mulberry32(11), 200, 1);
  const ts = linspace(-1, 3, 400);
  const rel = (n) => {
    const xs = all.slice(0, n);
    const m = dist.mle(xs);
    const top = loglik(dist, xs, m);
    return { m, pts: ts.map((t) => [t, Math.exp(loglik(dist, xs, t) - top)]) };
  };
  const ref = rel(5);
  let n = 5;
  const chart = lineChart($('s4-chart'), { height: 260 });
  const b = bindRange($('s4-range'), $('s4-num'), { onInput: (v) => ((n = Math.round(Math.min(200, Math.max(5, v)))), draw()), valueText: (v) => `n = ${v}` });
  function draw() {
    b.set(n);
    const cur = rel(n);
    chart.update({
      xDomain: [-1, 3],
      yDomain: [0, 1.08],
      xLabel: 'μ',
      yLabel: 'L(μ) / L(μ̂)',
      series: [
        { pts: ref.pts, cls: 'contour' },
        { pts: cur.pts, cls: 'curve-theta' },
      ],
      vlines: [
        { x: 1, cls: 'true-line strong' },
        { x: cur.m, cls: 'mle-line' },
      ],
      points: [{ x: cur.m, y: 1, cls: 'mle-mark', shape: 'diamond' }],
      alt: `n = ${n}의 상대가능도 곡선. μ̂ = ${fmt(cur.m, 3)}, 표준오차 ${fmt(1 / Math.sqrt(n), 3)}.`,
    });
    $('s4-info').textContent = `n = ${n}: μ̂ = ${fmt(cur.m, 3)} (참값 1), 정보량 n/σ² = ${n}, 표준오차 1/√n = ${fmt(1 / Math.sqrt(n), 3)}`;
  }
  draw();
}

renderTexIn(document);
