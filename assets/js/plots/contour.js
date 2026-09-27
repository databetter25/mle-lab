// 패널 C (2모수) — ℓ(μ, σ²)의 등고선과 μ = μ̂로 고정한 단면 곡선.
// 후보점(주황)을 끌어 옮기고, 자주 화살표는 점수 벡터(기울기 방향)를 보여 준다.

import { createFrame, drawAxes, tickFmt, symbols, ensureArrow } from './chart.js';
import { fmt } from '../core/format.js';

const d3 = window.d3;
const MARGIN = { top: 26, right: 18, bottom: 44, left: 56 };
// ℓ̂에서 내려간 높이 (안쪽부터). 1.92·… 대신 2모수 95% 영역은 χ²₂(0.95)/2 ≈ 3.00
const LEVELS = [0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096];

export function createContourPanel(container, { onTheta, onDragEnd } = {}) {
  const wrap = d3.select(container).attr('class', 'contour-wrap');
  const mainEl = wrap.append('div').attr('class', 'contour-main').node();
  const sideEl = wrap.append('div').attr('class', 'contour-side').node();
  const F = createFrame(mainEl, { layers: ['grid', 'yaxis', 'xaxis', 'contours', 'region', 'newton', 'score', 'mle', 'truth', 'current', 'labels', 'drag'] });
  const S = createFrame(sideEl, { layers: ['grid', 'yaxis', 'xaxis', 'curve', 'mle', 'truth', 'current', 'labels'] });
  F.svg.classed('draggable', true);
  const arrowId = `${F.clipId}-arrow`;
  let m = null;
  let x;
  let y;
  let dragging = false;
  F.onResize(() => m && draw());
  S.onResize(() => m && draw());

  function draw() {
    drawContour();
    drawSide();
  }

  function drawContour() {
    const { theta, theta0, mle, showTrue, llMle, score } = m;
    const C = m.C2;
    const { iw, ih } = F.layout(320, MARGIN);
    x = d3.scaleLinear().domain(C.range[0]).range([0, iw]);
    y = d3.scaleLinear().domain(C.range[1]).range([ih, 0]);
    drawAxes(F.L, x, y, iw, ih, { xLabel: '후보 μ', yLabel: '후보 σ²', xFormat: tickFmt('~g'), yFormat: tickFmt('~g') });
    const clip = `url(#${F.clipId})`;

    const { nx, ny, values } = C.grid;
    const [mu0, mu1] = C.range[0];
    const [s0, s1] = C.range[1];
    const proj = d3.geoTransform({
      point(px, py) {
        this.stream.point(x(mu0 + ((px - 0.5) * (mu1 - mu0)) / (nx - 1)), y(s0 + ((py - 0.5) * (s1 - s0)) / (ny - 1)));
      },
    });
    const path = d3.geoPath(proj);
    const thresholds = LEVELS.map((d) => llMle - d).reverse();
    const contours = d3.contours().size([nx, ny]).thresholds(thresholds)(values);
    F.L.contours
      .attr('clip-path', clip)
      .selectAll('path')
      .data(contours)
      .join('path')
      .attr('class', 'contour')
      .attr('d', path)
      .style('opacity', (d) => 0.35 + 0.65 * (thresholds.indexOf(d.value) / thresholds.length));

    const region = C.curvature ? d3.contours().size([nx, ny]).thresholds([llMle - 3.0])(values) : [];
    F.L.region.attr('clip-path', clip).selectAll('path').data(region).join('path').attr('class', 'region95').attr('d', path);

    // θ̂, θ₀
    F.L.mle
      .selectAll('path')
      .data([mle])
      .join('path')
      .attr('class', 'mle-mark')
      .attr('d', symbols.diamond(130))
      .attr('transform', (d) => `translate(${x(d[0])},${y(d[1])})`);
    F.L.truth
      .selectAll('path')
      .data(showTrue ? [theta0] : [])
      .join('path')
      .attr('class', 'true-mark')
      .attr('d', symbols.triangle(110))
      .attr('transform', (d) => `translate(${x(d[0])},${y(d[1])})`);

    // 뉴턴 흔적
    ensureArrow(F.svg, arrowId, 'arrow-score');
    const steps = C.newton ? C.newton.steps.slice(0, C.newton.upto).filter((s) => s.next[0] !== s.theta[0] || s.next[1] !== s.theta[1]) : [];
    F.L.newton
      .attr('clip-path', clip)
      .selectAll('line')
      .data(steps)
      .join('line')
      .attr('class', (_, i) => `newton-step${i === steps.length - 1 ? ' last' : ''}`)
      .attr('x1', (d) => x(d.theta[0]))
      .attr('y1', (d) => y(d.theta[1]))
      .attr('x2', (d) => x(d.next[0]))
      .attr('y2', (d) => y(d.next[1]))
      .attr('marker-end', `url(#${arrowId})`);

    // 점수 벡터: 화면에서 일정 길이로 정규화
    const g = score;
    const gx = g[0] * (x(1) - x(0));
    const gy = g[1] * (y(1) - y(0));
    const gl = Math.hypot(gx, gy);
    const len = Math.min(56, 8 + gl * 2);
    const vec = C.tangent && gl > 1e-9 ? [[x(theta[0]), y(theta[1]), x(theta[0]) + (gx / gl) * len, y(theta[1]) + (gy / gl) * len]] : [];
    F.L.score
      .selectAll('line')
      .data(vec)
      .join('line')
      .attr('class', 'score-vec')
      .attr('x1', (d) => d[0])
      .attr('y1', (d) => d[1])
      .attr('x2', (d) => d[2])
      .attr('y2', (d) => d[3])
      .attr('marker-end', `url(#${arrowId})`);

    F.L.current
      .selectAll('circle')
      .data([theta])
      .join('circle')
      .attr('class', 'theta-mark')
      .attr('cx', (d) => x(d[0]))
      .attr('cy', (d) => y(d[1]))
      .attr('r', 7.5);
    F.L.labels
      .selectAll('text')
      .data([`∇ℓ = (${fmt(g[0], 2)}, ${fmt(g[1], 2)})`])
      .join('text')
      .attr('class', 'score-label')
      .attr('x', iw)
      .attr('y', -10)
      .attr('text-anchor', 'end')
      .text((d) => d);

    F.L.drag
      .selectAll('rect')
      .data([0])
      .join('rect')
      .attr('class', 'drag-hit xy')
      .attr('width', iw)
      .attr('height', ih)
      .on('pointerdown', (e) => {
        dragging = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        emit(e);
      })
      .on('pointermove', (e) => dragging && emit(e))
      .on('pointerup pointercancel', (e) => {
        if (!dragging) return;
        dragging = false;
        onDragEnd?.();
      });
    F.setLabel(m.altC);
  }

  function emit(e) {
    const [px, py] = d3.pointer(e, F.g.node());
    onTheta?.([x.invert(px), y.invert(py)]);
  }

  function drawSide() {
    const { theta, theta0, mle, showTrue } = m;
    const C = m.C2;
    const { iw, ih } = S.layout(320, { top: 26, right: 14, bottom: 44, left: 56 });
    const sx = d3.scaleLinear().domain(C.range[1]).range([0, iw]);
    const pts = C.profile;
    const finite = pts.map((d) => d[1]).filter(Number.isFinite);
    const hi = Math.max(...finite);
    // σ² → 0에서 ℓ → −∞이므로 꼭대기 근처만 보여 준다
    const lo = Math.max(Math.min(...finite), hi - Math.max(25, m.xs.length));
    const sy = d3.scaleLinear().domain([lo, hi + (hi - lo) * 0.08]).range([ih, 0]);
    drawAxes(S.L, sx, sy, iw, ih, { xLabel: 'σ²', yLabel: `ℓ(μ̂, σ²)`, xFormat: tickFmt('~g'), yFormat: tickFmt('~g'), xTicks: 4 });
    S.L.curve
      .attr('clip-path', `url(#${S.clipId})`)
      .selectAll('path')
      .data([pts.filter((d) => Number.isFinite(d[1]))])
      .join('path')
      .attr('class', 'lik-curve')
      .attr('d', d3.line().x((d) => sx(d[0])).y((d) => sy(d[1])));
    S.L.mle
      .selectAll('line')
      .data([mle[1]])
      .join('line')
      .attr('class', 'mle-line')
      .attr('x1', (d) => sx(d))
      .attr('x2', (d) => sx(d))
      .attr('y1', 0)
      .attr('y2', ih);
    S.L.truth
      .selectAll('path')
      .data(showTrue ? [theta0[1]] : [])
      .join('path')
      .attr('class', 'true-mark')
      .attr('d', symbols.triangle(90))
      .attr('transform', (d) => `translate(${sx(d)},${ih - 7})`);
    const cur = m.llAt([mle[0], theta[1]]);
    S.L.current
      .selectAll('circle')
      .data(Number.isFinite(cur) ? [theta[1]] : [])
      .join('circle')
      .attr('class', 'theta-mark')
      .attr('cx', (d) => sx(d))
      .attr('cy', sy(cur))
      .attr('r', 6);
    S.L.labels
      .selectAll('text')
      .data(['μ를 μ̂로 고정한 단면'])
      .join('text')
      .attr('class', 'axis-label')
      .attr('x', 0)
      .attr('y', -10)
      .text((d) => d);
    S.setLabel(`μ = ${fmt(mle[0], 2)}로 고정한 로그가능도 단면. σ̂² = ${fmt(mle[1], 3)}에서 최대.`);
  }

  return {
    update(model) {
      m = model;
      draw();
    },
  };
}
