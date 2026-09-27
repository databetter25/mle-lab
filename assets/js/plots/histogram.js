// 반복 실험의 θ̂ 히스토그램 (밀도 척도) + 참값 세로선 + 근사/정확 밀도 곡선.

import { createFrame, drawAxes, tickFmt, niceMax } from './chart.js';

const d3 = window.d3;
const MARGIN = { top: 24, right: 16, bottom: 44, left: 56 };

/**
 * 격자 값만 나오는 추정량(예: p̂ = k/n)은 막대를 격자에 맞춰 계단 모양이 생기지 않게 한다.
 */
function makeBins(values, domain, lattice) {
  const [lo, hi] = domain;
  let width = (hi - lo) / 40;
  let start = lo;
  if (lattice) {
    width = lattice * Math.max(1, Math.ceil((hi - lo) / (40 * lattice)));
    start = Math.floor(lo / lattice) * lattice - lattice / 2;
  }
  const n = Math.ceil((hi - start) / width) + 1;
  const bins = Array.from({ length: n }, (_, i) => ({ x0: start + i * width, x1: start + (i + 1) * width, c: 0 }));
  for (const v of values) {
    const i = Math.floor((v - start) / width);
    if (i >= 0 && i < n) bins[i].c++;
  }
  return bins.map((b) => ({ ...b, density: b.c / (values.length * width) }));
}

export function createHistogram(container, { height = 280 } = {}) {
  const F = createFrame(container, { layers: ['grid', 'yaxis', 'xaxis', 'bars', 'curve', 'truth', 'mean', 'labels'] });
  let m = null;
  F.onResize(() => m && draw());

  function draw() {
    const { values, domain, lattice, curve, truth, mean, xLabel, cls = 'hist-bar', label } = m;
    const { iw, ih } = F.layout(height, MARGIN);
    const bins = makeBins(values, domain, lattice);
    const x = d3.scaleLinear().domain(domain).range([0, iw]);
    const grid = d3.range(0, 301).map((i) => domain[0] + ((domain[1] - domain[0]) * i) / 300);
    const cpts = curve ? grid.map((t) => [t, curve(t)]).filter((d) => Number.isFinite(d[1])) : [];
    const top = Math.max(d3.max(bins, (b) => b.density) || 0, m.yMaxHint || 0, curve ? d3.max(cpts, (d) => Math.min(d[1], (d3.max(bins, (b) => b.density) || 1) * 3)) : 0);
    const y = d3.scaleLinear().domain([0, niceMax(top * 1.08 || 1)]).range([ih, 0]);
    drawAxes(F.L, x, y, iw, ih, { xLabel, yLabel: '밀도', xFormat: tickFmt('~g'), yFormat: tickFmt('~g') });
    const clip = `url(#${F.clipId})`;

    F.L.bars
      .attr('clip-path', clip)
      .selectAll('rect')
      .data(bins.filter((b) => b.c > 0))
      .join('rect')
      .attr('class', cls)
      .attr('x', (b) => x(b.x0) + 0.5)
      .attr('width', (b) => Math.max(1, x(b.x1) - x(b.x0) - 1))
      .attr('y', (b) => y(b.density))
      .attr('height', (b) => ih - y(b.density));
    F.L.curve
      .attr('clip-path', clip)
      .selectAll('path')
      .data(cpts.length ? [cpts] : [])
      .join('path')
      .attr('class', 'approx-curve')
      .attr('d', d3.line().x((d) => x(d[0])).y((d) => y(Math.min(d[1], y.domain()[1] * 1.2))));
    F.L.truth
      .selectAll('line')
      .data(truth !== undefined ? [truth] : [])
      .join('line')
      .attr('class', 'true-line strong')
      .attr('x1', (d) => x(d))
      .attr('x2', (d) => x(d))
      .attr('y1', 0)
      .attr('y2', ih);
    F.L.mean
      .selectAll('line')
      .data(mean !== undefined && values.length ? [mean] : [])
      .join('line')
      .attr('class', 'mle-line')
      .attr('x1', (d) => x(d))
      .attr('x2', (d) => x(d))
      .attr('y1', 0)
      .attr('y2', ih);
    F.L.labels
      .selectAll('text')
      .data(label ? [label] : [])
      .join('text')
      .attr('class', 'axis-label')
      .attr('x', 0)
      .attr('y', -8)
      .text((d) => d);
    F.setLabel(m.alt || '');
  }

  return {
    update(model) {
      m = model;
      draw();
    },
  };
}
