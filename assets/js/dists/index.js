// 분포 레지스트리. 새 분포는 정의 파일 하나를 만들고 여기 목록에 더하면 된다.

import normal from './normal-mean.js';
import bernoulli from './bernoulli.js';
import binomial from './binomial.js';
import poisson from './poisson.js';
import exponential from './exponential.js';
import normal2 from './normal-2p.js';
import uniform from './uniform.js';

/** 1모수 분포는 params 배열을 최상위 필드에서 채운다 (화면 코드가 차원을 몰라도 되게) */
function normalize(d) {
  if (!d.params) {
    d.params = [
      {
        key: d.param,
        symbol: d.symbol,
        label: d.label,
        domain: d.domain,
        range: d.defaults.range,
        step: d.defaults.step,
        theta0Range: d.defaults.theta0Range,
      },
    ];
  }
  return d;
}

export const DISTS = [normal, bernoulli, binomial, poisson, exponential, normal2, uniform].map(normalize);

export function getDist(id) {
  return DISTS.find((d) => d.id === id) ?? DISTS[0];
}

/** 알려진 모수를 바꾼 사본. 메서드는 this.known을 읽으므로 그대로 동작한다. */
export function withKnown(dist, known = {}) {
  const k = { ...dist.known };
  for (const spec of dist.knownSpec) {
    const v = known[spec.key];
    if (v !== undefined && v !== null && Number.isFinite(v)) {
      k[spec.key] = Math.min(spec.max, Math.max(spec.min, spec.int ? Math.round(v) : v));
    }
  }
  return { ...dist, known: k };
}

/** 표본: 시드마다 난수열 200개를 한 번 만들고 앞 n개를 쓴다 */
export const MAX_N = 200;
