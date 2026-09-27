import { xlogy, sum } from '../core/special.js';
import { fmt } from '../core/format.js';

export default {
  id: 'bernoulli',
  name: '베르누이',
  title: '베르누이분포 Bernoulli(p)',
  param: 'p',
  symbol: 'p',
  label: 'p',
  discrete: true,
  domain: [0, 1],
  known: {},
  knownSpec: [],
  defaults: { theta0: 0.3, n: 15, range: [0, 1], step: 0.001, theta0Range: [0.01, 0.99] },
  lesson: '이산 자료의 가능도. 관측치가 모두 0이거나 모두 1이면 p̂가 모수공간의 경계에 놓인다.',
  xLabel: 'x (0 = 실패, 1 = 성공)',

  sample(rng, n, p) {
    return Array.from({ length: n }, () => (rng() < p ? 1 : 0));
  },
  logpdf(x, p) {
    return xlogy(x, p) + xlogy(1 - x, 1 - p);
  },
  score(xs, p) {
    const s = sum(xs);
    return s / p - (xs.length - s) / (1 - p);
  },
  hessian(xs, p) {
    const s = sum(xs);
    return -s / (p * p) - (xs.length - s) / ((1 - p) * (1 - p));
  },
  mle(xs) {
    return sum(xs) / xs.length;
  },
  mleExplain(xs) {
    return `p̂ = Σxᵢ / n = ${sum(xs)} / ${xs.length} = ${fmt(this.mle(xs), 3)}`;
  },
  suffStats(xs) {
    return [{ label: 'Σxᵢ (성공 수)', value: String(sum(xs)) }];
  },
  fisher(p) {
    return 1 / (p * (1 - p));
  },
  mleLattice(n) {
    return 1 / n;
  },
  xDomain() {
    return [0, 1];
  },
  validX(x) {
    return x === 0 || x === 1;
  },
  isBoundary(xs) {
    const s = sum(xs);
    return s === 0 || s === xs.length;
  },
  boundaryNote(xs) {
    const s = sum(xs);
    if (s === xs.length) return '관측치가 모두 1이라 p̂ = 1로 모수공간의 경계에 놓입니다. ℓ′(p) = 0인 점이 (0, 1) 안에 없고, ℓ은 p가 1에 다가갈수록 계속 커집니다.';
    if (s === 0) return '관측치가 모두 0이라 p̂ = 0으로 모수공간의 경계에 놓입니다. ℓ′(p) = 0인 점이 (0, 1) 안에 없고, ℓ은 p가 0에 다가갈수록 계속 커집니다.';
    return null;
  },

  derivation: [
    {
      title: '가능도함수를 쓴다',
      text: '관측치 하나의 확률질량은 $f(x\\mid p) = p^{x}(1-p)^{1-x}$ ($x = 0, 1$)이다. 서로 독립인 $n$개의 곱이 가능도다.',
      tex: 'L(p) = \\prod_{i=1}^{n} p^{x_i}(1-p)^{1-x_i} = p^{\\sum x_i}(1-p)^{\\,n-\\sum x_i}',
    },
    {
      title: '로그를 취해 합으로 바꾼다',
      text: '곱이 합이 되고, 지수는 계수로 내려온다. 가능도는 성공 수 $\\sum x_i$로만 정해진다(충분통계량).',
      tex: '\\ell(p) = \\Big(\\sum x_i\\Big)\\log p + \\Big(n - \\sum x_i\\Big)\\log(1-p)',
    },
    {
      title: '점수함수를 0으로 놓는다',
      text: '$p$로 미분한 기울기가 점수함수 $\\ell\'(p)$다.',
      tex: '\\ell\'(p) = \\frac{\\sum x_i}{p} - \\frac{n - \\sum x_i}{1-p} = 0',
    },
    {
      title: 'p에 대해 푼다',
      text: '양변에 $p(1-p)$를 곱하면 $\\sum x_i - np = 0$이다.',
      tex: '\\hat{p} = \\frac{1}{n}\\sum_{i=1}^{n} x_i = \\bar{x}',
    },
    {
      title: '최댓값인지 확인하고 경계를 점검한다',
      text: '2계 도함수가 모든 $p$에서 음수이므로 $\\hat p$는 유일한 최댓값이다. 단, 관측치가 모두 0(또는 모두 1)이면 $\\ell\'(p) = 0$의 해가 $(0, 1)$ 안에 없고 $\\hat p = 0$(또는 1)인 경계 해가 된다.',
      tex: '\\ell\'\'(p) = -\\frac{\\sum x_i}{p^2} - \\frac{n - \\sum x_i}{(1-p)^2} < 0',
    },
  ],
};
