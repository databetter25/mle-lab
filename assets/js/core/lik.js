// 분포와 무관한 가능도 계산. 가능도는 곱으로 계산하지 않고 ℓ만 계산한다.

/** ℓ(θ) = Σ log f(xᵢ | θ) */
export function loglik(dist, xs, theta) {
  let s = 0;
  for (const x of xs) {
    s += dist.logpdf(x, theta);
    if (s === -Infinity) return s;
  }
  return s;
}

/** 모수 차원 (1 또는 2) */
export function dimOf(dist) {
  return dist.params.length;
}

/** 모수공간(열린구간) 안인가 */
export function inDomain(dist, theta) {
  if (dimOf(dist) === 1) {
    const [lo, hi] = dist.domain;
    return theta > lo && theta < hi;
  }
  return dist.params.every((p, i) => theta[i] > p.domain[0] && theta[i] < p.domain[1]);
}

/** 등간격 격자 */
export function linspace(lo, hi, m) {
  const out = new Array(m);
  for (let i = 0; i < m; i++) out[i] = lo + ((hi - lo) * i) / (m - 1);
  return out;
}

/** 1모수 분포: 격자 위의 ℓ 값. 모수공간 경계는 ε만큼 안쪽으로. */
export function llGrid(dist, xs, range, m = 400) {
  const eps = 1e-3 * (range[1] - range[0]);
  const lo = Math.max(range[0], dist.domain[0] + eps);
  const hi = Math.min(range[1], dist.domain[1] - eps);
  const ts = linspace(lo, hi, m);
  const lls = ts.map((t) => loglik(dist, xs, t));
  return { ts, lls };
}

/** 격자에서 유한한 값의 최소·최대 */
export function finiteExtent(values) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}

/** 1모수: ℓ(θ) ≥ ℓ(θ̂) − c 인 구간 (기본 c = 1.92, 95% 가능도 구간) */
export function likInterval(dist, xs, mle, range, c = 1.92) {
  const target = loglik(dist, xs, mle) - c;
  const f = (t) => loglik(dist, xs, t) - target;
  const eps = 1e-9;
  const lo = Math.max(range[0], dist.domain[0] + eps);
  const hi = Math.min(range[1], dist.domain[1] - eps);
  const root = (a, b) => {
    // f(a), f(b) 부호가 다를 때 이분법
    let fa = f(a);
    for (let i = 0; i < 80; i++) {
      const m = (a + b) / 2;
      const fm = f(m);
      if (fm > 0 === fa > 0) {
        a = m;
        fa = fm;
      } else b = m;
    }
    return (a + b) / 2;
  };
  // 경계 해이거나 범위 끝까지 기준선 위면 범위 끝을 쓴다
  const left = mle - lo < 1e-7 || f(lo) >= 0 ? lo : root(lo, mle);
  const right = hi - mle < 1e-7 || f(hi) >= 0 ? hi : root(mle, hi);
  return [left, right];
}
