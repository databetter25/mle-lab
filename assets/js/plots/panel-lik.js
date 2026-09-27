// 패널 C — 가능도 곡선 (1모수).
// 현재 θ(주황 원), θ̂(파랑 마름모 + 세로선), θ₀(초록 삼각형), 접선(자주)과 기울기 = 점수함수.
// ℓ(θ)와 상대가능도 L(θ)/L(θ̂)를 전환해도 최댓값 위치는 같다. 곡선 위를 끌어 θ를 옮긴다.

import { createFrame, drawAxes, tickFmt, symbols, ensureArrow } from './chart.js';
import { fmt } from '../core/format.js';

const d3 = window.d3;
const MARGIN = { top: 26, right: 18, bottom: 44, left: 60 };

export function createLikPanel(container, { onTheta, onDragEnd } = {}) {
  const F = createFrame(container, {
    layers: ['grid', 'shade', 'yaxis', 'xaxis', 'interval', 'curve', 'newton', 'tangent', 'mle', 'truth', 'current', 'labels', 'drag'],
  });
  F.svg.classed('draggable', true);
  const arrowId = `${F.clipId}-arrow`;
  let m = null;
  let x = null;
  let dragging = false;
  F.onResize(() => m && draw());

  function draw() {
    const { dist, theta, theta0, mle, showTrue, ll, llMle, score } = m;
    const C = m.C;
    const rel = C.relative;
    const { iw, ih } = F.layout(290, MARGIN);
    x = d3.scaleLinear().domain(C.range).range([0, iw]);
    const val = (v) => (rel ? Math.exp(v - llMle) : v);
    const finite = C.lls.filter(Number.isFinite);
    let y;
    if (rel) y = d3.scaleLinear().domain([0, 1.08]).range([ih, 0]);
    else {
      const lo = Math.min(...finite);
      const hi = llMle;
      const pad = (hi - lo) * 0.08 || 1;
      y = d3.scaleLinear().domain([lo - pad * 0.3, hi + pad]).range([ih, 0]);
    }
    const sym = dist.label;
    drawAxes(F.L, x, y, iw, ih, {
      xLabel: `후보 ${sym}`,
      yLabel: rel ? `상대가능도 L(${sym}) / L(${sym}̂)` : `로그가능도 ℓ(${sym})`,
      xFormat: tickFmt('~g'),
      yFormat: tickFmt(rel ? '.1f' : '~g'),
    });
    const clip = `url(#${F.clipId})`;

    // ℓ = −∞ 영역 (균등분포 θ < max xᵢ)
    const firstFinite = C.lls.findIndex(Number.isFinite);
    const shade = firstFinite > 0 ? [[C.range[0], C.ts[firstFinite]]] : [];
    F.L.shade
      .selectAll('rect')
      .data(shade)
      .join('rect')
      .attr('class', 'neg-inf-zone')
      .attr('x', (d) => x(d[0]))
      .attr('width', (d) => Math.max(0, x(d[1]) - x(d[0])))
      .attr('y', 0)
      .attr('height', ih);
    F.L.shade
      .selectAll('text')
      .data(shade.filter((d) => x(d[1]) - x(d[0]) > 90))
      .join('text')
      .attr('class', 'neg-inf-label')
      .attr('x', (d) => (x(d[0]) + x(d[1])) / 2)
      .attr('y', ih / 2)
      .attr('text-anchor', 'middle')
      .selectAll('tspan')
      .data([rel ? 'L = 0' : 'ℓ = −∞', `(${sym} < max xᵢ)`])
      .join('tspan')
      .attr('x', function () {
        return this.parentNode.getAttribute('x');
      })
      .attr('dy', (_, i) => (i ? 18 : 0))
      .text((d) => d);

    // 곡선
    const pts = C.ts.map((t, i) => [t, C.lls[i]]).filter((d) => Number.isFinite(d[1]));
    F.L.curve
      .attr('clip-path', clip)
      .selectAll('path')
      .data([pts])
      .join('path')
      .attr('class', 'lik-curve')
      .attr('d', d3.line().x((d) => x(d[0])).y((d) => y(val(d[1]))));

    // 95% 가능도 구간 (곡률 보기)
    const cut = llMle - 1.92;
    const iv = C.curvature && C.interval ? [C.interval] : [];
    F.L.interval
      .attr('clip-path', clip)
      .selectAll('line.cut')
      .data(C.curvature ? [cut] : [])
      .join('line')
      .attr('class', 'cut-line')
      .attr('x1', 0)
      .attr('x2', iw)
      .attr('y1', (d) => y(val(d)))
      .attr('y2', (d) => y(val(d)));
    F.L.interval
      .selectAll('line.iv')
      .data(iv)
      .join('line')
      .attr('class', 'iv iv-line')
      .attr('x1', (d) => x(d[0]))
      .attr('x2', (d) => x(d[1]))
      .attr('y1', y(val(cut)))
      .attr('y2', y(val(cut)));
    F.L.interval
      .selectAll('text')
      .data(C.curvature ? [cut] : [])
      .join('text')
      .attr('class', 'cut-label')
      .attr('x', 4)
      .attr('y', (d) => y(val(d)) - 5)
      .text(rel ? 'L/L̂ = e^(−1.92) ≈ 0.147' : 'ℓ(θ̂) − 1.92');

    // θ̂
    const mleIn = mle >= C.range[0] && mle <= C.range[1];
    F.L.mle
      .selectAll('line')
      .data(mleIn ? [mle] : [])
      .join('line')
      .attr('class', 'mle-line')
      .attr('x1', (d) => x(d))
      .attr('x2', (d) => x(d))
      .attr('y1', 0)
      .attr('y2', ih);
    F.L.mle
      .selectAll('path')
      .data(mleIn ? [mle] : [])
      .join('path')
      .attr('class', 'mle-mark')
      .attr('d', symbols.diamond(130))
      .attr('transform', (d) => `translate(${x(d)},${y(val(llMle))})`);
    F.L.mle
      .selectAll('text')
      .data(mleIn ? [mle] : [])
      .join('text')
      .attr('class', 'mle-label')
      .attr('x', (d) => (x(d) > iw - 90 ? x(d) - 6 : x(d) + 6))
      .attr('y', ih - 22)
      .attr('text-anchor', (d) => (x(d) > iw - 90 ? 'end' : 'start'))
      .text((d) => `${sym}̂ = ${fmt(d, 3)}`);

    // θ₀
    const tIn = showTrue && theta0 >= C.range[0] && theta0 <= C.range[1];
    F.L.truth
      .selectAll('line')
      .data(tIn ? [theta0] : [])
      .join('line')
      .attr('class', 'true-line')
      .attr('x1', (d) => x(d))
      .attr('x2', (d) => x(d))
      .attr('y1', 0)
      .attr('y2', ih);
    F.L.truth
      .selectAll('path')
      .data(tIn ? [theta0] : [])
      .join('path')
      .attr('class', 'true-mark')
      .attr('d', symbols.triangle(110))
      .attr('transform', (d) => `translate(${x(d)},${ih - 7})`);

    // 접선과 기울기
    const hasTan = C.tangent && Number.isFinite(ll) && Number.isFinite(score);
    const h = 0.13 * (C.range[1] - C.range[0]);
    const slope = rel ? Math.exp(ll - llMle) * score : score;
    const tanPts = hasTan ? [[theta - h, val(ll) - slope * h], [theta + h, val(ll) + slope * h]] : [];
    F.L.tangent
      .attr('clip-path', clip)
      .selectAll('line')
      .data(hasTan ? [tanPts] : [])
      .join('line')
      .attr('class', 'tangent')
      .attr('x1', (d) => x(d[0][0]))
      .attr('y1', (d) => y(d[0][1]))
      .attr('x2', (d) => x(d[1][0]))
      .attr('y2', (d) => y(d[1][1]));

    // 뉴턴 반복 흔적
    ensureArrow(F.svg, arrowId, 'arrow-score');
    const steps = C.newton ? C.newton.steps.slice(0, C.newton.upto) : [];
    const segs = steps.filter((s) => s.next !== s.theta && Number.isFinite(s.ll));
    F.L.newton
      .attr('clip-path', clip)
      .selectAll('line')
      .data(segs)
      .join('line')
      .attr('class', (_, i) => `newton-step${i === segs.length - 1 ? ' last' : ''}`)
      .attr('x1', (d) => x(d.theta))
      .attr('y1', (d) => y(val(d.ll)))
      .attr('x2', (d) => x(d.next))
      .attr('y2', (d) => y(val(m.llAt(d.next))))
      .attr('marker-end', `url(#${arrowId})`);
    F.L.newton
      .selectAll('circle')
      .data(steps.filter((s) => Number.isFinite(s.ll)))
      .join('circle')
      .attr('class', 'newton-dot')
      .attr('cx', (d) => x(d.theta))
      .attr('cy', (d) => y(val(d.ll)))
      .attr('r', 3);

    // 현재 θ
    const cIn = theta >= C.range[0] - 1e-12 && theta <= C.range[1] + 1e-12;
    const cy = Number.isFinite(ll) ? y(val(ll)) : ih;
    F.L.current
      .selectAll('line')
      .data(cIn ? [theta] : [])
      .join('line')
      .attr('class', 'theta-guide')
      .attr('x1', (d) => x(d))
      .attr('x2', (d) => x(d))
      .attr('y1', cy)
      .attr('y2', ih);
    F.L.current
      .selectAll('circle')
      .data(cIn ? [theta] : [])
      .join('circle')
      .attr('class', 'theta-mark')
      .attr('cx', (d) => x(d))
      .attr('cy', cy)
      .attr('r', 7.5);

    // 기울기 이름표
    const labelText = hasTan ? `기울기 ℓ′(${sym}) = ${fmt(score, 3)}` : Number.isFinite(ll) ? '' : `ℓ(${sym}) = −∞`;
    const lx = x(theta);
    F.L.labels
      .selectAll('text')
      .data(cIn && labelText ? [labelText] : [])
      .join('text')
      .attr('class', hasTan ? 'score-label' : 'warn-label')
      .attr('x', lx)
      .attr('y', Math.max(14, cy - 16))
      .attr('text-anchor', lx > iw - 110 ? 'end' : lx < 110 ? 'start' : 'middle')
      .text((d) => d);

    // 끌기 영역
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
        emit(e);
      })
      .on('pointermove', (e) => dragging && emit(e))
      .on('pointerup pointercancel', (e) => {
        if (!dragging) return;
        dragging = false;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
        onDragEnd?.();
      });
    F.setLabel(m.altC);
  }

  function emit(e) {
    const [px] = d3.pointer(e, F.g.node());
    onTheta?.(x.invert(px), { pxPerUnit: Math.abs(x(1) - x(0)) });
  }

  return {
    update(model) {
      m = model;
      draw();
    },
  };
}
