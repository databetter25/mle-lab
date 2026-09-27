// 시드 있는 난수 생성기와 분포별 난수.
// 표본 i번째 값은 난수열 앞쪽만 쓰므로, 같은 시드에서 n개를 뽑으면
// 200개를 뽑은 뒤 앞 n개를 자른 것과 같다 (n 슬라이더가 기존 점을 유지하는 이유).

/** mulberry32: 32비트 시드 → [0, 1) 균등 난수 함수 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** (0, 1) 열린구간 균등 난수 — log(0)을 피한다 */
export function uniformOpen(rng) {
  let u = rng();
  while (u === 0) u = rng();
  return u;
}

/** 표준정규 (Box–Muller). 값 하나에 균등 난수 두 개를 쓴다. */
export function stdNormal(rng) {
  const u1 = uniformOpen(rng);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** 지수(비율 rate) — 역변환 */
export function exponential(rng, rate) {
  return -Math.log(uniformOpen(rng)) / rate;
}

/** 포아송 — λ < 30이면 곱셈법, 아니면 역변환 */
export function poisson(rng, lambda) {
  if (lambda <= 0) return 0;
  if (lambda < 30) {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= rng();
    } while (p > L);
    return k - 1;
  }
  const u = rng();
  let k = 0;
  let p = Math.exp(-lambda);
  let F = p;
  while (u > F && k < 100000) {
    k++;
    p *= lambda / k;
    F += p;
  }
  return k;
}

/** 이항(m, p) — 베르누이 m개의 합 */
export function binomial(rng, m, p) {
  let s = 0;
  for (let i = 0; i < m; i++) if (rng() < p) s++;
  return s;
}
