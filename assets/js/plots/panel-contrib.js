// 패널 B — 기여분 원장.
// 관측치별 log f(xᵢ|θ) 막대와 맨 끝의 합계 ℓ(θ) 막대. 막대는 아래 기준선에서 위로 자라므로
// 높을수록 그 점이 후보 모형에서 그럴듯하다는 뜻이다. 파랑 눈금은 θ̂에서의 값.
// "곱으로 보면": 누적곱 Π f(xᵢ|θ)가 0으로 붙는 모습을 로그 축으로.

import { createFrame, tickFmt, unchanged } from './chart.js';
import { fmt, fmtSig, sup } from '../core/format.js';

const d3 = window.d3;
const MARGIN = { top: 22, right: 12, bottom: 52, left: 56 };
const TOTAL_W = 96;

export function createContribPanel(container, { onHover } = {}) {
  const F = createFrame(container, { layers: ['grid', 'yaxis', 'zero', 'bars', 'ticks', 'xaxis', 'total', 'prod'] });
  let m = null;
  let lastMode = null;
  F.onResize(() => m && draw());

  function draw() {
    const mode = m.B.product ? 'product' : 'bars';
    if (mode !== lastMode) {
      for (const layer of Object.values(F.L)) {
        layer.selectAll('*').remove();
        layer.node().__axisKey = null;
      }
      lastMode = mode;
    }
    if (mode === 'product') drawProduct();
    else drawBars();
    F.setLabel(m.altB);
  }

  function drawBars() {
    const { xs, contrib, contribMle, hover, ll, llMle } = m;
    const { lo, hi, totLo, totHi, order } = m.B;
    const { iw, ih } = F.layout(250, MARGIN);
    const mainW = iw - TOTAL_W;
    const x = d3.scaleBand().domain(d3.range(order.length)).range([0, mainW]).paddingInner(order.length > 60 ? 0.1 : 0.22);
    const y = d3.scaleLinear().domain([lo, hi]).range([ih, 0]);
    const clampY = (v) => (v === -Infinity || v < lo ? lo : Math.min(v, hi));

    const axesSame = unchanged(F.L.yaxis, [lo, hi, iw, ih, order.length, m.B.sort, m.B.sort === 'value' ? order.map((i) => xs[i]) : null]);
    if (!axesSame) F.L.grid.attr('class', 'gridline').call(d3.axisLeft(y).ticks(5).tickSize(-mainW).tickFormat(''));
    if (!axesSame) F.L.yaxis.attr('class', 'axis').call(d3.axisLeft(y).ticks(5).tickFormat(tickFmt('~g')).tickSizeOuter(0));
    F.L.yaxis
      .selectAll('text.axis-label')
      .data(['log f(xᵢ | θ)'])
      .join('text')
      .attr('class', 'axis-label')
      .attr('transform', 'rotate(-90)')
      .attr('y', -42)
      .attr('text-anchor', 'end')
      .text((d) => d);

    F.L.zero
      .selectAll('line')
      .data(lo < 0 && hi > 0 ? [0] : [])
      .join('line')
      .attr('class', 'zero-line')
      .attr('x1', 0)
      .attr('x2', mainW)
      .attr('y1', y(0))
      .attr('y2', y(0));

    const rows = order.map((i, pos) => ({ i, pos, v: contrib[i], vm: contribMle[i] }));
    F.L.bars
      .selectAll('rect')
      .data(rows, (d) => d.i)
      .join('rect')
      .attr('class', (d) => `contrib-bar${d.v < lo ? ' extreme' : ''}${d.i === hover ? ' is-hover' : ''}`)
      .attr('x', (d) => x(d.pos))
      .attr('width', x.bandwidth())
      .attr('y', (d) => y(clampY(d.v)))
      .attr('height', (d) => Math.max(0, ih - y(clampY(d.v))))
      .on('pointerenter', (e, d) => onHover?.(d.i))
      .on('pointerleave', () => onHover?.(null));
    F.L.bars
      .selectAll('text.neg-inf')
      .data(rows.filter((d) => d.v === -Infinity && x.bandwidth() > 8))
      .join('text')
      .attr('class', 'neg-inf')
      .attr('x', (d) => x(d.pos) + x.bandwidth() / 2)
      .attr('y', ih - 4)
      .attr('text-anchor', 'middle')
      .text('−∞');

    F.L.ticks
      .selectAll('line')
      .data(rows.filter((d) => Number.isFinite(d.vm)))
      .join('line')
      .attr('class', 'mle-tick')
      .attr('x1', (d) => x(d.pos) - 1)
      .attr('x2', (d) => x(d.pos) + x.bandwidth() + 1)
      .attr('y1', (d) => y(clampY(d.vm)))
      .attr('y2', (d) => y(clampY(d.vm)));

    // x축: 관측치가 적으면 번호
    const showLabels = order.length <= 30;
    if (!axesSame) F.L.xaxis
      .attr('class', 'axis')
      .attr('transform', `translate(0,${ih})`)
      .call(
        d3
          .axisBottom(x)
          .tickValues(showLabels ? d3.range(order.length) : [])
          .tickFormat((p) => (m.B.sort === 'value' ? fmt(xs[order[p]], m.dist.discrete ? 0 : 1) : String(order[p] + 1)))
          .tickSizeOuter(0),
      );
    F.L.xaxis
      .selectAll('text.axis-label')
      .data([m.B.sort === 'value' ? '관측치 (값 순서, 눈금 = xᵢ)' : '관측치 (관측 순서, 눈금 = i)'])
      .join('text')
      .attr('class', 'axis-label')
      .attr('x', mainW)
      .attr('y', 34)
      .attr('text-anchor', 'end')
      .text((d) => d);

    // 합계 막대 (자체 축)
    const ty = d3.scaleLinear().domain([totLo, totHi]).range([ih, 0]);
    const tc = (v) => (v === -Infinity || v < totLo ? totLo : Math.min(v, totHi));
    const T = F.L.total.attr('transform', `translate(${mainW + 18},0)`);
    const bw = 34;
    T.selectAll('rect.total-bg')
      .data([0])
      .join('rect')
      .attr('class', 'total-bg')
      .attr('x', 0)
      .attr('width', bw)
      .attr('y', 0)
      .attr('height', ih);
    T.selectAll('rect.total-bar')
      .data([ll])
      .join('rect')
      .attr('class', (d) => `total-bar${d < totLo ? ' extreme' : ''}`)
      .attr('x', 0)
      .attr('width', bw)
      .attr('y', (d) => ty(tc(d)))
      .attr('height', (d) => ih - ty(tc(d)));
    T.selectAll('line.mle-tick')
      .data([llMle])
      .join('line')
      .attr('class', 'mle-tick total')
      .attr('x1', -4)
      .attr('x2', bw + 4)
      .attr('y1', (d) => ty(tc(d)))
      .attr('y2', (d) => ty(tc(d)));
    T.selectAll('text.total-val')
      .data([ll])
      .join('text')
      .attr('class', 'total-val')
      .attr('x', bw / 2)
      .attr('y', ih + 38)
      .attr('text-anchor', 'middle')
      .text((d) => fmt(d, 1));
    T.selectAll('text.total-cap')
      .data(['합계 ℓ(θ)'])
      .join('text')
      .attr('class', 'axis-label')
      .attr('x', bw / 2)
      .attr('y', ih + 20)
      .attr('text-anchor', 'middle')
      .text((d) => d);
    T.selectAll('text.total-mle')
      .data([llMle])
      .join('text')
      .attr('class', 'total-mle')
      .attr('x', bw + 6)
      .attr('y', (d) => ty(tc(d)) + 4)
      .text('θ̂');

    if (hover != null && contrib[hover] !== undefined) {
      const pos = order.indexOf(hover);
      F.showTip(`x<sub>${hover + 1}</sub> = ${fmt(xs[hover], m.dist.discrete ? 0 : 3)}<br>log f(x|θ) = ${fmt(contrib[hover], 3)}<br>log f(x|θ̂) = ${fmt(contribMle[hover], 3)}`, MARGIN.left + x(pos) + x.bandwidth() / 2, MARGIN.top + y(clampY(contrib[hover])));
    } else F.hideTip();
  }

  function drawProduct() {
    const { contrib, contribMle } = m;
    const order = m.B.order;
    const { iw, ih } = F.layout(250, MARGIN);
    const cum = (arr) => {
      let s = 0;
      return order.map((i) => (s += arr[i]) / Math.LN10);
    };
    const c1 = cum(contrib);
    const c2 = cum(contribMle);
    const finite = [...c1, ...c2, 0].filter(Number.isFinite);
    const lo = Math.min(...finite);
    const hi = Math.max(0, ...finite);
    const x = d3.scaleLinear().domain([1, Math.max(2, order.length)]).range([0, iw]);
    const y = d3.scaleLinear().domain([Math.floor(lo) - 0.5, Math.max(0.5, Math.ceil(hi))]).range([ih, 0]).nice();

    F.L.grid.attr('class', 'gridline').call(d3.axisLeft(y).ticks(6).tickSize(-iw).tickFormat(''));
    F.L.yaxis.attr('class', 'axis').call(
      d3
        .axisLeft(y)
        .ticks(6)
        .tickFormat((v) => (Number.isInteger(v) ? sup(`10^${v}`.replace('-', '−')) : ''))
        .tickSizeOuter(0),
    );
    F.L.yaxis
      .selectAll('text.axis-label')
      .data(['누적곱 Π f(xⱼ | θ)  (로그 축)'])
      .join('text')
      .attr('class', 'axis-label')
      .attr('transform', 'rotate(-90)')
      .attr('y', -46)
      .attr('text-anchor', 'end')
      .text((d) => d);
    F.L.xaxis.attr('class', 'axis').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).ticks(Math.min(order.length, 10)).tickFormat(d3.format('d')).tickSizeOuter(0));
    F.L.xaxis
      .selectAll('text.axis-label')
      .data(['곱한 관측치 수 i'])
      .join('text')
      .attr('class', 'axis-label')
      .attr('x', iw)
      .attr('y', 34)
      .attr('text-anchor', 'end')
      .text((d) => d);

    const clampV = (v) => (Number.isFinite(v) ? v : y.domain()[0]);
    const line = d3
      .line()
      .x((_, i) => x(i + 1))
      .y((d) => y(clampV(d)));
    F.L.prod
      .selectAll('path.prod-mle')
      .data([c2])
      .join('path')
      .attr('class', 'prod-mle')
      .attr('d', line);
    F.L.prod
      .selectAll('path.prod-theta')
      .data([c1])
      .join('path')
      .attr('class', 'prod-theta')
      .attr('d', line);
    F.L.prod
      .selectAll('circle')
      .data(order.length <= 60 ? c1 : [])
      .join('circle')
      .attr('class', 'prod-dot')
      .attr('cx', (_, i) => x(i + 1))
      .attr('cy', (d) => y(clampV(d)))
      .attr('r', 3);
    const lastV = c1[c1.length - 1];
    F.L.prod
      .selectAll('text.prod-note')
      .data([lastV])
      .join('text')
      .attr('class', 'prod-note')
      .attr('x', iw)
      .attr('y', -8)
      .attr('text-anchor', 'end')
      .text((d) => `n = ${order.length}일 때 곱 L(θ) = ${Number.isFinite(d) ? sup(fmtSig(10 ** d, 3)).replace('Infinity', '∞') : '0'}`);
    if (Number.isFinite(lastV) && lastV < -300) {
      F.L.prod.select('text.prod-note').text(`n = ${order.length}일 때 곱 L(θ) ≈ 10${sup(`^${Math.round(lastV)}`.replace('-', '−'))} — 배정밀도로는 0이 된다`);
    }
    F.hideTip();
  }

  return {
    update(model) {
      m = model;
      draw();
    },
  };
}
