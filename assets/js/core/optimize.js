// 뉴턴법 반복 기록과 수치 최대화.
// newtonPath는 "최댓값 찾기" 애니메이션이 한 단계씩 보여 줄 기록을 만든다.

import { loglik, inDomain, dimOf } from './lik.js';

/**
 * 뉴턴 반복 θ ← θ − ℓ'(θ)/ℓ''(θ).
 * - 모수공간을 벗어나거나 ℓ이 줄어드는 단계는 반으로 줄인다.
 * - ℓ''이 음수가 아니면(오목하지 않으면) 기울기 방향으로 작은 걸음을 쓴다.
 * - 분포가 stepper를 주면 (균등분포처럼 미분 = 0이 통하지 않을 때) 그것을 따른다.
 * @returns {{ steps: Array, converged: boolean, boundary: boolean, note: string|null }}
 */
export function newtonPath(dist, xs, start, { maxIter = 40, tol = 1e-10 } = {}) {
  if (dimOf(dist) === 2) return newtonPath2(dist, xs, start, { maxIter, tol });
  const steps = [];
  const mle = dist.mle(xs);
  const boundary = dist.isBoundary ? dist.isBoundary(xs) : false;

  if (dist.stepper) {
    let t = start;
    for (let k = 0; k < maxIter; k++) {
      const s = dist.stepper(xs, t);
      steps.push({ k, theta: t, ll: loglik(dist, xs, t), score: safeScore(dist, xs, t), hess: safeHess(dist, xs, t), next: s.next, note: s.note });
      if (s.done) return { steps, converged: true, boundary: true, note: s.note };
      t = s.next;
    }
    return { steps, converged: false, boundary: true, note: null };
  }

  const width = (dist.defaults.range[1] - dist.defaults.range[0]) || 1;
  let t = start;
  if (!inDomain(dist, t)) t = clampInside(dist, t);
  for (let k = 0; k < maxIter; k++) {
    const ll = loglik(dist, xs, t);
    const g = dist.score(xs, t);
    const h = dist.hessian(xs, t);
    let delta = h < 0 ? -g / h : Math.sign(g) * 0.1 * width;
    const done =
      Math.abs(g) < 1e-9 * Math.max(1, xs.length) ||
      Math.abs(delta) < tol * (1 + Math.abs(t)) ||
      (boundary && Math.abs(t - mle) < 1e-6);
    if (done) {
      steps.push({ k, theta: t, ll, score: g, hess: h, next: t, halvings: 0 });
      return { steps, converged: true, boundary, note: null };
    }
    let next = t + delta;
    let halvings = 0;
    while ((!inDomain(dist, next) || loglik(dist, xs, next) < ll - 1e-12) && halvings < 60) {
      delta /= 2;
      next = t + delta;
      halvings++;
    }
    steps.push({ k, theta: t, ll, score: g, hess: h, next, halvings });
    t = next;
  }
  return { steps, converged: false, boundary, note: null };
}

function newtonPath2(dist, xs, start, { maxIter, tol }) {
  const steps = [];
  let t = start.slice();
  if (!inDomain(dist, t)) t = t.map((v, i) => clampInsideParam(dist.params[i], v));
  for (let k = 0; k < maxIter; k++) {
    const ll = loglik(dist, xs, t);
    const g = dist.score(xs, t);
    const H = dist.hessian(xs, t);
    const det = H[0][0] * H[1][1] - H[0][1] * H[1][0];
    let d;
    if (H[0][0] < 0 && det > 0) {
      // −H⁻¹ g
      d = [-(H[1][1] * g[0] - H[0][1] * g[1]) / det, -(-H[1][0] * g[0] + H[0][0] * g[1]) / det];
    } else {
      // 오목하지 않은 곳: 모수 범위에 맞춘 기울기 걸음
      const w = dist.params.map((p) => p.range[1] - p.range[0]);
      const gn = Math.hypot(g[0] * w[0], g[1] * w[1]) || 1;
      d = [(0.1 * g[0] * w[0] * w[0]) / gn, (0.1 * g[1] * w[1] * w[1]) / gn];
    }
    const gnorm = Math.hypot(g[0], g[1]);
    if (gnorm < 1e-9 * Math.max(1, xs.length) || Math.hypot(d[0], d[1]) < tol * (1 + Math.hypot(t[0], t[1]))) {
      steps.push({ k, theta: t, ll, score: g, hess: H, next: t, halvings: 0 });
      return { steps, converged: true, boundary: false, note: null };
    }
    let next = [t[0] + d[0], t[1] + d[1]];
    let halvings = 0;
    while ((!inDomain(dist, next) || loglik(dist, xs, next) < ll - 1e-12) && halvings < 60) {
      d = [d[0] / 2, d[1] / 2];
      next = [t[0] + d[0], t[1] + d[1]];
      halvings++;
    }
    steps.push({ k, theta: t, ll, score: g, hess: H, next, halvings });
    t = next;
  }
  return { steps, converged: false, boundary: false, note: null };
}

/** 뉴턴 반복의 최종값 */
export function newtonMax(dist, xs, start, opts) {
  const { steps } = newtonPath(dist, xs, start, opts);
  return steps[steps.length - 1].next;
}

/** 황금분할 탐색으로 [a, b]에서 f의 최댓값 위치 (도함수를 쓰지 않는 독립 검증용) */
export function goldenMax(f, a, b, tol = 1e-12) {
  const r = (Math.sqrt(5) - 1) / 2;
  let c = b - r * (b - a);
  let d = a + r * (b - a);
  let fc = f(c);
  let fd = f(d);
  for (let i = 0; i < 300 && Math.abs(b - a) > tol * (1 + Math.abs(a) + Math.abs(b)); i++) {
    if (fc > fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - r * (b - a);
      fc = f(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + r * (b - a);
      fd = f(d);
    }
  }
  return (a + b) / 2;
}

function clampInside(dist, t) {
  const [lo, hi] = dist.domain;
  const pad = 1e-3 * ((Number.isFinite(hi) ? hi : dist.defaults.range[1]) - (Number.isFinite(lo) ? lo : dist.defaults.range[0]));
  return Math.min(Math.max(t, lo + pad), hi - pad);
}

function clampInsideParam(p, v) {
  const pad = 1e-3 * (p.range[1] - p.range[0]);
  return Math.min(Math.max(v, p.domain[0] + pad), p.domain[1] - pad);
}

function safeScore(dist, xs, t) {
  const v = dist.score(xs, t);
  return Number.isFinite(v) ? v : NaN;
}
function safeHess(dist, xs, t) {
  const v = dist.hessian(xs, t);
  return Number.isFinite(v) ? v : NaN;
}
