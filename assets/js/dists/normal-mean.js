import { stdNormal } from '../core/rng.js';
import { sum, min, max } from '../core/special.js';
import { fmt } from '../core/format.js';

const LOG_2PI = Math.log(2 * Math.PI);

export default {
  id: 'normal',
  name: '정규(μ)',
  title: '정규분포 N(μ, σ²), σ 기지',
  param: 'mu',
  symbol: '\\mu',
  label: 'μ',
  discrete: false,
  domain: [-Infinity, Infinity],
  known: { sigma: 1 },
  knownSpec: [{ key: 'sigma', label: '표준편차 σ (알려진 값)', symbol: '\\sigma', min: 0.2, max: 3, step: 0.1 }],
  defaults: { theta0: 1, n: 15, range: [-4, 5], step: 0.01, theta0Range: [-3, 4] },
  lesson: '로그가능도가 포물선이고, 최대가능도추정은 최소제곱과 같은 답을 준다.',
  xLabel: 'x',

  sample(rng, n, mu) {
    const s = this.known.sigma;
    return Array.from({ length: n }, () => mu + s * stdNormal(rng));
  },
  logpdf(x, mu) {
    const s = this.known.sigma;
    const z = (x - mu) / s;
    return -0.5 * LOG_2PI - Math.log(s) - 0.5 * z * z;
  },
  score(xs, mu) {
    const s2 = this.known.sigma ** 2;
    let g = 0;
    for (const x of xs) g += x - mu;
    return g / s2;
  },
  hessian(xs) {
    return -xs.length / this.known.sigma ** 2;
  },
  mle(xs) {
    return sum(xs) / xs.length;
  },
  mleExplain(xs) {
    return `μ̂ = x̄ = ${fmt(sum(xs), 2)} / ${xs.length} = ${fmt(this.mle(xs), 3)}`;
  },
  suffStats(xs) {
    return [{ label: 'Σxᵢ', value: fmt(sum(xs), 3) }];
  },
  fisher() {
    return 1 / this.known.sigma ** 2;
  },
  xDomain(xs) {
    const s = this.known.sigma;
    return [Math.min(min(xs), -4) - 1.5 * s, Math.max(max(xs), 5) + 1.5 * s];
  },
  validX(x) {
    return Number.isFinite(x) && Math.abs(x) < 1e6;
  },

  derivation: [
    {
      title: '가능도함수를 쓴다',
      text: '표준편차 $\\sigma$는 알려져 있고 평균 $\\mu$만 모른다.',
      tex: 'L(\\mu) = \\prod_{i=1}^{n} \\frac{1}{\\sigma\\sqrt{2\\pi}}\\exp\\!\\Big(-\\frac{(x_i-\\mu)^2}{2\\sigma^2}\\Big)',
    },
    {
      title: '로그를 취해 합으로 바꾼다',
      text: '첫 항은 $\\mu$와 무관한 상수다. 남은 항은 $\\mu$에 대한 아래로 볼록한 포물선의 음수, 즉 위로 볼록한 포물선이다.',
      tex: '\\ell(\\mu) = -n\\log\\big(\\sigma\\sqrt{2\\pi}\\big) - \\frac{1}{2\\sigma^2}\\sum_{i=1}^{n}(x_i-\\mu)^2',
    },
    {
      title: '점수함수를 0으로 놓는다',
      text: '',
      tex: '\\ell\'(\\mu) = \\frac{1}{\\sigma^2}\\sum_{i=1}^{n}(x_i-\\mu) = 0',
    },
    {
      title: 'μ에 대해 푼다',
      text: '$\\ell(\\mu)$를 최대로 하는 것은 $\\sum(x_i-\\mu)^2$을 최소로 하는 것과 같다 — 최소제곱 추정과 같은 답이다.',
      tex: '\\sum x_i - n\\mu = 0 \\;\\Longrightarrow\\; \\hat{\\mu} = \\bar{x}',
    },
    {
      title: '최댓값인지 확인한다',
      text: '2계 도함수가 $\\mu$와 무관한 음의 상수라서 곡률이 일정하고, 표준오차는 $1/\\sqrt{-\\ell\'\'} = \\sigma/\\sqrt n$이다.',
      tex: '\\ell\'\'(\\mu) = -\\frac{n}{\\sigma^2} < 0',
    },
  ],
};
