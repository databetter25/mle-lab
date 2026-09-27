// 홈의 움직이는 미리보기: 후보 μ가 ℓ 곡선을 따라 왕복하고, 꼭대기에서 접선이 수평이 된다.

import { getDist, withKnown } from '../dists/index.js';
import { mulberry32 } from '../core/rng.js';
import { loglik, linspace } from '../core/lik.js';
import { fmt } from '../core/format.js';
import { reducedMotion } from '../ui/common.js';
import { createFrame, drawAxes, tickFmt, symbols } from '../plots/chart.js';

const d3 = window.d3;
const dist = withKnown(getDist('normal'), { sigma: 1 });
const xs = dist.sample(mulberry32(42), 15, 1);
const mle = dist.mle(xs);
const llMle = loglik(dist, xs, mle);
const ts = linspace(-1.5, 3.5, 200);
const pts = ts.map((t) => [t, loglik(dist, xs, t)]);
const lo = Math.min(...pts.map((d) => d[1]));

const el = document.getElementById('preview');
const F = createFrame(el, { layers: ['grid', 'yaxis', 'xaxis', 'curve', 'mle', 'tangent', 'current', 'labels'] });
let theta = -1;

function draw() {
  const { iw, ih } = F.layout(260, { top: 22, right: 14, bottom: 40, left: 52 });
  const x = d3.scaleLinear().domain([-1.5, 3.5]).range([0, iw]);
  const y = d3.scaleLinear().domain([lo, llMle + 6]).range([ih, 0]);
  drawAxes(F.L, x, y, iw, ih, { xLabel: '후보 μ', yLabel: 'ℓ(μ)', xFormat: tickFmt('~g'), yFormat: tickFmt('~g'), yTicks: 4 });
  F.L.curve.selectAll('path').data([pts]).join('path').attr('class', 'lik-curve').attr('d', d3.line().x((d) => x(d[0])).y((d) => y(d[1])));
  F.L.mle.selectAll('line').data([mle]).join('line').attr('class', 'mle-line').attr('x1', x(mle)).attr('x2', x(mle)).attr('y1', 0).attr('y2', ih);
  F.L.mle.selectAll('path').data([mle]).join('path').attr('class', 'mle-mark').attr('d', symbols.diamond(120)).attr('transform', `translate(${x(mle)},${y(llMle)})`);
  const ll = loglik(dist, xs, theta);
  const g = dist.score(xs, theta);
  const h = 0.6;
  F.L.tangent
    .attr('clip-path', `url(#${F.clipId})`)
    .selectAll('line')
    .data([0])
    .join('line')
    .attr('class', 'tangent')
    .attr('x1', x(theta - h))
    .attr('y1', y(ll - g * h))
    .attr('x2', x(theta + h))
    .attr('y2', y(ll + g * h));
  F.L.current.selectAll('circle').data([0]).join('circle').attr('class', 'theta-mark').attr('cx', x(theta)).attr('cy', y(ll)).attr('r', 8);
  F.L.labels
    .selectAll('text')
    .data([`기울기 ${fmt(g, 1)}`])
    .join('text')
    .attr('class', 'score-label')
    .attr('x', x(theta))
    .attr('y', y(ll) - 16)
    .attr('text-anchor', 'middle')
    .text((d) => d);
  F.setLabel(`로그가능도 곡선. 후보 μ = ${fmt(theta, 2)}, 최대가능도추정값 μ̂ = ${fmt(mle, 2)}.`);
}
F.onResize(draw);

if (reducedMotion()) {
  theta = 0.2;
  draw();
} else {
  // 왼쪽 → 꼭대기에서 잠시 멈춤 → 오른쪽 → 되돌아옴
  const start = performance.now();
  const path = (s) => {
    const T = 9;
    const u = (s % T) / T;
    if (u < 0.35) return -1 + (mle + 1) * d3.easeCubicInOut(u / 0.35);
    if (u < 0.5) return mle;
    if (u < 0.75) return mle + (3 - mle) * d3.easeCubicInOut((u - 0.5) / 0.25);
    return 3 - 4 * d3.easeCubicInOut((u - 0.75) / 0.25);
  };
  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(el);
  const tick = (now) => {
    if (visible && !document.hidden) {
      theta = path((now - start) / 1000);
      draw();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
