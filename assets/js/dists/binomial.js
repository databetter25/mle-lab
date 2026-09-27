import { binomial as rbinom } from '../core/rng.js';
import { xlogy, sum, logChoose } from '../core/special.js';
import { fmt } from '../core/format.js';

export default {
  id: 'binomial',
  name: '이항',
  title: '이항분포 Binomial(m, p), m 기지',
  param: 'p',
  symbol: 'p',
  label: 'p',
  discrete: true,
  domain: [0, 1],
  known: { m: 10 },
  knownSpec: [{ key: 'm', label: '시행 횟수 m (알려진 값)', symbol: 'm', min: 1, max: 30, step: 1, int: true }],
  defaults: { theta0: 0.3, n: 15, range: [0, 1], step: 0.001, theta0Range: [0.01, 0.99] },
  lesson: '이항 관측치 n개는 베르누이 nm개와 가능도 모양이 같다.',
  xLabel: 'x (m번 중 성공 수)',

  sample(rng, n, p) {
    const m = this.known.m;
    return Array.from({ length: n }, () => rbinom(rng, m, p));
  },
  logpdf(x, p) {
    const m = this.known.m;
    return logChoose(m, x) + xlogy(x, p) + xlogy(m - x, 1 - p);
  },
  score(xs, p) {
    const s = sum(xs);
    const N = xs.length * this.known.m;
    return s / p - (N - s) / (1 - p);
  },
  hessian(xs, p) {
    const s = sum(xs);
    const N = xs.length * this.known.m;
    return -s / (p * p) - (N - s) / ((1 - p) * (1 - p));
  },
  mle(xs) {
    return sum(xs) / (xs.length * this.known.m);
  },
  mleExplain(xs) {
    return `p̂ = x̄ / m = Σxᵢ / (n·m) = ${sum(xs)} / (${xs.length}·${this.known.m}) = ${fmt(this.mle(xs), 3)}`;
  },
  suffStats(xs) {
    return [
      { label: 'Σxᵢ (총 성공 수)', value: String(sum(xs)) },
      { label: 'n·m (총 시행 수)', value: String(xs.length * this.known.m) },
    ];
  },
  fisher(p) {
    return this.known.m / (p * (1 - p));
  },
  mleLattice(n) {
    return 1 / (n * this.known.m);
  },
  xDomain() {
    return [0, this.known.m];
  },
  validX(x) {
    return Number.isInteger(x) && x >= 0 && x <= this.known.m;
  },
  isBoundary(xs) {
    const s = sum(xs);
    return s === 0 || s === xs.length * this.known.m;
  },
  boundaryNote(xs) {
    const s = sum(xs);
    if (s === 0) return '모든 시행이 실패라 p̂ = 0으로 모수공간의 경계에 놓입니다.';
    if (s === xs.length * this.known.m) return '모든 시행이 성공이라 p̂ = 1로 모수공간의 경계에 놓입니다.';
    return null;
  },

  derivation: [
    {
      title: '가능도함수를 쓴다',
      text: '시행 횟수 $m$은 알려져 있다. 관측치 하나의 확률질량은 $\\binom{m}{x}p^{x}(1-p)^{m-x}$이다.',
      tex: 'L(p) = \\prod_{i=1}^{n} \\binom{m}{x_i} p^{x_i}(1-p)^{m-x_i}',
    },
    {
      title: '로그를 취해 합으로 바꾼다',
      text: '이항계수 항은 $p$와 무관한 상수다. 상수를 빼면 베르누이 $nm$개의 로그가능도와 똑같은 모양이다.',
      tex: '\\ell(p) = \\sum_{i=1}^{n}\\log\\binom{m}{x_i} + \\Big(\\sum x_i\\Big)\\log p + \\Big(nm - \\sum x_i\\Big)\\log(1-p)',
    },
    {
      title: '점수함수를 0으로 놓는다',
      text: '상수항은 미분하면 사라진다.',
      tex: '\\ell\'(p) = \\frac{\\sum x_i}{p} - \\frac{nm - \\sum x_i}{1-p} = 0',
    },
    {
      title: 'p에 대해 푼다',
      text: '총 성공 수를 총 시행 수로 나눈 값이다.',
      tex: '\\hat{p} = \\frac{\\sum_{i=1}^{n} x_i}{nm} = \\frac{\\bar{x}}{m}',
    },
    {
      title: '최댓값인지 확인하고 경계를 점검한다',
      text: '2계 도함수가 항상 음수다. 성공이 하나도 없거나 모두 성공이면 $\\hat p$가 0 또는 1인 경계 해다.',
      tex: '\\ell\'\'(p) = -\\frac{\\sum x_i}{p^2} - \\frac{nm - \\sum x_i}{(1-p)^2} < 0',
    },
  ],
};
