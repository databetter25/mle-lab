// 그림 공통: 폭에 맞춰 다시 그리는 SVG 틀, 표식 모양, 축.
// d3는 vendor/d3.v7.min.js가 전역(window.d3)으로 불러온다.

const d3 = window.d3;

let uid = 0;
export const nextId = (p) => `${p}-${++uid}`;

/**
 * 폭 변화를 따라가는 SVG. draw(w)를 호출해 다시 그린다.
 * 층(layer)은 한 번만 만들어 두고 매번 내용만 바꾼다 (드래그 중 포인터 캡처 유지).
 */
export function createFrame(container, { layers = [], label = '' } = {}) {
  const root = d3.select(container).classed('chart', true);
  const svg = root.append('svg').attr('role', 'img').attr('aria-label', label);
  const clipId = nextId('clip');
  const clipRect = svg.append('defs').append('clipPath').attr('id', clipId).append('rect');
  const g = svg.append('g');
  const L = {};
  for (const name of layers) L[name] = g.append('g').attr('class', `layer-${name}`);
  const tooltip = root.append('div').attr('class', 'tooltip').attr('hidden', true);

  let width = container.clientWidth || 600;
  let redraw = null;
  const ro = new ResizeObserver(() => {
    const w = container.clientWidth;
    if (w && Math.abs(w - width) > 1) {
      width = w;
      if (redraw) redraw();
    }
  });
  ro.observe(container);

  return {
    svg,
    g,
    L,
    tooltip,
    clipId,
    get width() {
      return width;
    },
    onResize(fn) {
      redraw = fn;
    },
    /** 크기와 여백을 정하고 안쪽 폭·높이를 돌려준다 */
    layout(height, margin) {
      svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);
      g.attr('transform', `translate(${margin.left},${margin.top})`);
      const iw = Math.max(40, width - margin.left - margin.right);
      const ih = Math.max(40, height - margin.top - margin.bottom);
      clipRect.attr('x', -2).attr('y', -6).attr('width', iw + 4).attr('height', ih + 8);
      return { iw, ih };
    },
    setLabel(text) {
      svg.attr('aria-label', text);
    },
    showTip(html, x, y) {
      tooltip.html(html).attr('hidden', null).style('left', `${x}px`).style('top', `${y}px`);
    },
    hideTip() {
      tooltip.attr('hidden', true);
    },
  };
}

export const symbols = {
  diamond: (size = 110) => d3.symbol(d3.symbolDiamond, size)(),
  triangle: (size = 90) => d3.symbol(d3.symbolTriangle, size)(),
  circle: (size = 120) => d3.symbol(d3.symbolCircle, size)(),
};

/** 축 그리기 (tick 개수는 폭에 맞춘다) */
export function drawAxes(L, x, y, iw, ih, { xTicks, yTicks, xFormat, yFormat, xLabel, yLabel, grid = true } = {}) {
  // 드래그 중에는 축이 그대로인 경우가 많다 — 같으면 건너뛴다
  if (unchanged(L.xaxis, [x.domain(), x.range(), y.domain(), y.range(), xTicks, yTicks, xLabel, yLabel])) return;
  const nx = xTicks ?? Math.max(3, Math.min(10, Math.floor(iw / 70)));
  const ny = yTicks ?? Math.max(3, Math.min(6, Math.floor(ih / 45)));
  if (L.grid && grid) {
    L.grid.attr('class', 'layer-grid gridline').call(d3.axisLeft(y).ticks(ny).tickSize(-iw).tickFormat(''));
  }
  L.xaxis.attr('class', 'layer-xaxis axis').attr('transform', `translate(0,${ih})`).call(d3.axisBottom(x).ticks(nx).tickFormat(xFormat ?? null).tickSizeOuter(0));
  L.yaxis.attr('class', 'layer-yaxis axis').call(d3.axisLeft(y).ticks(ny).tickFormat(yFormat ?? null).tickSizeOuter(0));
  L.xaxis
    .selectAll('text.axis-label')
    .data(xLabel ? [xLabel] : [])
    .join('text')
    .attr('class', 'axis-label')
    .attr('x', iw)
    .attr('y', 34)
    .attr('text-anchor', 'end')
    .text((d) => d);
  L.yaxis
    .selectAll('text.axis-label')
    .data(yLabel ? [yLabel] : [])
    .join('text')
    .attr('class', 'axis-label')
    .attr('transform', 'rotate(-90)')
    .attr('x', 0)
    .attr('y', -42)
    .attr('text-anchor', 'end')
    .text((d) => d);
}

/** 선택 요소에 key를 기억해 두고, 지난번과 같으면 true */
export function unchanged(sel, parts) {
  const key = JSON.stringify(parts);
  const node = sel.node();
  if (node.__axisKey === key) return true;
  node.__axisKey = key;
  return false;
}

/** −: 유니코드 마이너스로 쓰는 숫자 형식 */
export function tickFmt(spec) {
  const f = d3.format(spec);
  return (v) => f(v).replace('-', '−').replace('−0.0', '0.0');
}

export function niceMax(v) {
  return d3.scaleLinear().domain([0, v]).nice().domain()[1];
}

/** 화살표 머리 marker 정의 (색 클래스별로 하나씩) */
export function ensureArrow(svg, id, cls) {
  let defs = svg.select('defs');
  if (defs.select(`#${id}`).empty()) {
    defs
      .append('marker')
      .attr('id', id)
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 9)
      .attr('refY', 5)
      .attr('markerWidth', 7)
      .attr('markerHeight', 7)
      .attr('orient', 'auto-start-reverse')
      .append('path')
      .attr('d', 'M0,0 L10,5 L0,10 z')
      .attr('class', cls);
  }
  return `url(#${id})`;
}
