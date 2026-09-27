// 패널 A — 데이터와 후보 모형.
// 관측치마다 x축에서 f(xᵢ|θ)까지 점선을 그어 "이 점이 이 모형에서 얼마나 그럴듯한가"를 높이로 보여 준다.

import { createFrame, drawAxes, tickFmt, niceMax } from './chart.js';
import { fmt } from '../core/format.js';

const d3 = window.d3;
const MARGIN = { top: 14, right: 16, bottom: 44, left: 56 };

export function createDataPanel(container, { onHover, onAdd, onRemove } = {}) {
  const F = createFrame(container, { layers: ['grid', 'yaxis', 'model', 'truth', 'stems', 'strip', 'xaxis', 'hit', 'dots'] });
  let m = null;
  let lastKind = null;
  F.onResize(() => m && draw());

  function draw() {
    const { dist, xs, theta, theta0, mle, showTrue, trueCurve, hover, editable } = m;
    if (lastKind !== dist.discrete) {
      for (const layer of Object.values(F.L)) {
        layer.selectAll('*').remove();
        layer.node().__axisKey = null;
      }
      lastKind = dist.discrete;
    }
    const pdf = (x, t) => Math.exp(dist.logpdf(x, t));
    const [lo, hi] = m.xDomain;

    if (!dist.discrete) {
      const { iw, ih } = F.layout(260, MARGIN);
      const x = d3.scaleLinear().domain([lo, hi]).range([0, iw]);
      const pts = d3.range(0, 301).map((i) => lo + ((hi - lo) * i) / 300);
      const withBreaks = (t) => {
        const bp = dist.breakpoints ? dist.breakpoints(t) : [];
        const arr = pts.concat(bp.flatMap((b) => [b - 1e-9, b + 1e-9])).filter((v) => v >= lo && v <= hi);
        return arr.sort((a, b) => a - b).map((v) => [v, pdf(v, t)]);
      };
      const cur = withBreaks(theta);
      const ref = withBreaks(mle);
      const tru = showTrue ? withBreaks(theta0) : [];
      const peak = d3.max([...cur, ...ref, ...(trueCurve ? tru : [])], (d) => d[1]) || 1;
      const y = d3.scaleLinear().domain([0, niceMax(peak * 1.1)]).range([ih, 0]);
      drawAxes(F.L, x, y, iw, ih, { xLabel: dist.xLabel, yLabel: 'f(x | θ)', yFormat: tickFmt('.2~f'), xFormat: tickFmt('~g') });
      const line = d3.line().x((d) => x(d[0])).y((d) => y(d[1]));

      F.L.model.selectAll('path').data([cur]).join('path').attr('class', 'curve-theta').attr('d', line);
      F.L.truth
        .selectAll('path')
        .data(showTrue && trueCurve ? [tru] : [])
        .join('path')
        .attr('class', 'curve-true')
        .attr('d', line);
      F.L.strip.selectAll('*').remove();

      // 관측치별 높이 f(xᵢ|θ)
      const heights = xs.map((v) => pdf(v, theta));
      F.L.stems
        .selectAll('line')
        .data(xs)
        .join('line')
        .attr('class', (_, i) => `stem${i === hover ? ' is-hover' : ''}`)
        .attr('x1', (d) => x(d))
        .attr('x2', (d) => x(d))
        .attr('y1', ih)
        .attr('y2', (_, i) => y(Math.min(heights[i], y.domain()[1])));
      F.L.stems
        .selectAll('circle')
        .data(xs)
        .join('circle')
        .attr('class', 'stem-top')
        .attr('cx', (d) => x(d))
        .attr('cy', (_, i) => y(Math.min(heights[i], y.domain()[1])))
        .attr('r', (_, i) => (i === hover ? 4 : 2.5));

      F.L.dots
        .selectAll('circle')
        .data(xs.map((v, i) => ({ v, i })))
        .join('circle')
        .attr('class', (d) => `obs${heights[d.i] === 0 ? ' impossible' : ''}${d.i === hover ? ' is-hover' : ''}`)
        .attr('cx', (d) => x(d.v))
        .attr('cy', ih)
        .attr('r', (d) => (d.i === hover ? 7 : 4.5))
        .on('pointerenter', (e, d) => onHover?.(d.i))
        .on('pointerleave', () => onHover?.(null))
        .on('click', (e, d) => {
          if (!editable) return;
          e.stopPropagation();
          onRemove?.(d.i);
        })
        .style('cursor', editable ? 'pointer' : null);

      setupHit(iw, ih, (px) => x.invert(px));
      tip(hover, x(xs[hover] ?? 0), y(Math.min(heights[hover] ?? 0, y.domain()[1])));
    } else {
      drawDiscrete(pdf, lo, hi);
    }
    F.setLabel(m.alt);
  }

  function drawDiscrete(pmf, lo, hi) {
    const { dist, xs, theta, theta0, showTrue, trueCurve, hover, editable } = m;
    const width = F.width - MARGIN.left - MARGIN.right;
    const ks = d3.range(lo, hi + 1);
    const x = d3.scaleLinear().domain([lo - 0.6, hi + 0.6]).range([0, width]);
    const bw = Math.min(46, 0.72 * (x(1) - x(0)));

    // 같은 값의 관측치를 격자로 쌓는다 (점 그림)
    const groups = d3.group(xs.map((v, i) => ({ v, i })), (d) => d.v);
    const maxCount = d3.max(groups.values(), (g) => g.length) || 1;
    let s = 10;
    const fits = (sz) => Math.ceil(maxCount / Math.max(1, Math.floor(bw / sz))) * sz <= 84;
    while (!fits(s) && s > 2.5) s -= 0.5;
    const cols = Math.max(1, Math.floor(bw / s));
    const stripH = Math.max(s, Math.ceil(maxCount / cols) * s);
    const plotH = 190;
    const height = MARGIN.top + plotH + 8 + stripH + MARGIN.bottom;
    const { iw } = F.layout(height, MARGIN);
    x.range([0, iw]);
    const ih = plotH + 8 + stripH; // x축은 점 줄 아래

    const probs = ks.map((k) => pmf(k, theta));
    const probsTrue = showTrue ? ks.map((k) => pmf(k, theta0)) : [];
    const probsMle = ks.map((k) => pmf(k, m.mle));
    const top = d3.max([...probs, ...probsMle, ...(trueCurve ? probsTrue : [])]) || 1;
    const y = d3.scaleLinear().domain([0, niceMax(top * 1.1)]).range([plotH, 0]);

    // 축: y는 막대 영역만, x는 맨 아래
    F.L.grid.attr('class', 'gridline').call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat(''));
    F.L.yaxis.attr('class', 'axis').call(d3.axisLeft(y).ticks(4).tickFormat(tickFmt('.2~f')).tickSizeOuter(0));
    F.L.yaxis
      .selectAll('text.axis-label')
      .data(['P(X = x | θ)'])
      .join('text')
      .attr('class', 'axis-label')
      .attr('transform', 'rotate(-90)')
      .attr('y', -42)
      .attr('text-anchor', 'end')
      .text((d) => d);
    const tickVals = ks.length > 16 ? ks.filter((k) => k % Math.ceil(ks.length / 12) === 0) : ks;
    F.L.xaxis.attr('class', 'axis').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).tickValues(tickVals).tickFormat(d3.format('d')).tickSizeOuter(0));
    F.L.xaxis
      .selectAll('text.axis-label')
      .data([dist.xLabel])
      .join('text')
      .attr('class', 'axis-label')
      .attr('x', iw)
      .attr('y', 34)
      .attr('text-anchor', 'end')
      .text((d) => d);

    const hoverVal = hover != null ? xs[hover] : null;
    F.L.model
      .selectAll('rect')
      .data(ks)
      .join('rect')
      .attr('class', (k) => `pmf-bar${groups.has(k) ? ' observed' : ''}${k === hoverVal ? ' is-hover' : ''}`)
      .attr('x', (k) => x(k) - bw / 2)
      .attr('width', bw)
      .attr('y', (_, i) => y(probs[i]))
      .attr('height', (_, i) => plotH - y(probs[i]));
    F.L.model
      .selectAll('line.base')
      .data([0])
      .join('line')
      .attr('class', 'base axis-base')
      .attr('x1', 0)
      .attr('x2', iw)
      .attr('y1', plotH)
      .attr('y2', plotH);

    F.L.truth
      .selectAll('path')
      .data(showTrue && trueCurve ? ks : [])
      .join('path')
      .attr('class', 'pmf-true')
      .attr('d', (k, i) => `M${x(k) - bw / 2},${y(probsTrue[i])}h${bw}`);
    F.L.stems.selectAll('*').remove();

    // 점 그림
    const cells = [];
    for (const [v, g] of groups) {
      const c = Math.min(cols, g.length);
      g.forEach((d, j) => {
        const col = j % cols;
        const row = Math.floor(j / cols);
        cells.push({ i: d.i, v, cx: x(v) - (c * s) / 2 + s * (col + 0.5), cy: plotH + 8 + s * (row + 0.5) });
      });
    }
    F.L.strip.selectAll('*').remove();
    F.L.dots
      .selectAll('circle')
      .data(cells, (d) => d.i)
      .join('circle')
      .attr('class', (d) => `obs${d.i === hover ? ' is-hover' : ''}`)
      .attr('cx', (d) => d.cx)
      .attr('cy', (d) => d.cy)
      .attr('r', (d) => (d.i === hover ? Math.max(3, s * 0.55) : Math.max(1.2, s * 0.38)))
      .on('pointerenter', (e, d) => onHover?.(d.i))
      .on('pointerleave', () => onHover?.(null))
      .on('click', (e, d) => {
        if (!editable) return;
        e.stopPropagation();
        onRemove?.(d.i);
      })
      .style('cursor', editable ? 'pointer' : null);

    setupHit(iw, ih, (px) => Math.round(x.invert(px)));
    const hc = cells.find((c) => c.i === hover);
    if (hc) tip(hover, hc.cx, y(probs[ks.indexOf(hoverVal)]));
    else F.hideTip();
  }

  function setupHit(iw, ih, invert) {
    F.L.hit
      .selectAll('rect')
      .data(m.editable ? [0] : [])
      .join('rect')
      .attr('class', 'hit')
      .attr('width', iw)
      .attr('height', ih)
      .on('click', (e) => {
        const [px] = d3.pointer(e);
        onAdd?.(invert(px));
      });
  }

  function tip(i, px, py) {
    if (i == null || m.xs[i] === undefined) return F.hideTip();
    const v = m.xs[i];
    const lp = m.dist.logpdf(v, m.theta);
    F.showTip(
      `x<sub>${i + 1}</sub> = ${fmt(v, m.dist.discrete ? 0 : 3)}<br>f(x|θ) = ${fmt(Math.exp(lp), 4)}<br>log f = ${fmt(lp, 3)}`,
      px + MARGIN.left,
      py + MARGIN.top,
    );
  }

  return {
    update(model) {
      m = model;
      draw();
    },
  };
}
