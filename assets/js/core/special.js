// 특수함수: log Γ (Lanczos), 로그 계승, 로그 이항계수, logsumexp.

const LANCZOS_G = 7;
const LANCZOS_C = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];
const HALF_LOG_2PI = 0.5 * Math.log(2 * Math.PI);

/** log Γ(x), x > 0 (x < 0.5는 반사공식) */
export function lgamma(x) {
  if (x < 0.5) {
    // Γ(x)Γ(1−x) = π / sin(πx)
    return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  }
  x -= 1;
  let a = LANCZOS_C[0];
  const t = x + LANCZOS_G + 0.5;
  for (let i = 1; i < LANCZOS_G + 2; i++) a += LANCZOS_C[i] / (x + i);
  return HALF_LOG_2PI + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

const LOG_FACT_CACHE = [0, 0];
/** log k! (정수 k ≥ 0). 작은 값은 누적합으로 정확히, 큰 값은 lgamma. */
export function logFactorial(k) {
  if (k < 0) return NaN;
  if (k < 256) {
    for (let i = LOG_FACT_CACHE.length; i <= k; i++) {
      LOG_FACT_CACHE[i] = LOG_FACT_CACHE[i - 1] + Math.log(i);
    }
    return LOG_FACT_CACHE[k];
  }
  return lgamma(k + 1);
}

/** log C(n, k) */
export function logChoose(n, k) {
  if (k < 0 || k > n) return -Infinity;
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

/** x · log y, 단 x = 0이면 0 (0 · log 0 = 0 규약) */
export function xlogy(x, y) {
  return x === 0 ? 0 : x * Math.log(y);
}

/** log Σ exp(aᵢ) — 넘침 없이 */
export function logsumexp(arr) {
  let m = -Infinity;
  for (const a of arr) if (a > m) m = a;
  if (m === -Infinity) return -Infinity;
  let s = 0;
  for (const a of arr) s += Math.exp(a - m);
  return m + Math.log(s);
}

export function sum(xs) {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}

export function mean(xs) {
  return xs.length ? sum(xs) / xs.length : NaN;
}

export function max(xs) {
  let m = -Infinity;
  for (const x of xs) if (x > m) m = x;
  return m;
}

export function min(xs) {
  let m = Infinity;
  for (const x of xs) if (x < m) m = x;
  return m;
}
