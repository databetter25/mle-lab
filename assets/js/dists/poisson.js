import { poisson as rpois } from '../core/rng.js';
import { xlogy, sum, max, logFactorial } from '../core/special.js';
import { fmt } from '../core/format.js';

export default {
  id: 'poisson',
  name: '포아송',
  title: '포아송분포 Poisson(λ)',
  param: 'lambda',
  symbol: '\\lambda',
  label: 'λ',
  discrete: true,
  domain: [0, Infinity],
  known: {},
  knownSpec: [],
  defaults: { theta0: 3, n: 15, range: [0, 10], step: 0.01, theta0Range: [0.2, 9] },
  lesson: '계수 자료의 가능도와 양수 제약 λ > 0.',
  xLabel: 'x (사건 수)',

  sample(rng, n, lambda) {
    return Array.from({ length: n }, () => rpois(rng, lambda));
  },
  logpdf(x, lambda) {
    return xlogy(x, lambda) - lambda - logFactorial(x);
  },
  score(xs, lambda) {
    return sum(xs) / lambda - xs.length;
  },
  hessian(xs, lambda) {
    return -sum(xs) / (lambda * lambda);
  },
  mle(xs) {
    return sum(xs) / xs.length;
  },
  mleExplain(xs) {
    return `λ̂ = x̄ = ${sum(xs)} / ${xs.length} = ${fmt(this.mle(xs), 3)}`;
  },
  suffStats(xs) {
    return [{ label: 'Σxᵢ (총 사건 수)', value: String(sum(xs)) }];
  },
  fisher(lambda) {
    return 1 / lambda;
  },
  mleLattice(n) {
    return 1 / n;
  },
  xDomain(xs) {
    return [0, Math.max(max(xs) + 3, 15)];
  },
  validX(x) {
    return Number.isInteger(x) && x >= 0 && x <= 1000;
  },
  isBoundary(xs) {
    return sum(xs) === 0;
  },
  boundaryNote(xs) {
    if (sum(xs) === 0) return '관측치가 모두 0이라 ℓ(λ) = −nλ가 λ → 0에서 가장 큽니다. λ̂ = 0은 모수공간 λ > 0의 경계입니다.';
    return null;
  },

  derivation: [
    {
      title: '가능도함수를 쓴다',
      text: '관측치 하나의 확률질량은 $f(x\\mid\\lambda) = \\lambda^{x}e^{-\\lambda}/x!$ ($x = 0, 1, 2, \\dots$)이다.',
      tex: 'L(\\lambda) = \\prod_{i=1}^{n} \\frac{\\lambda^{x_i}e^{-\\lambda}}{x_i!} = \\frac{\\lambda^{\\sum x_i}\\,e^{-n\\lambda}}{\\prod x_i!}',
    },
    {
      title: '로그를 취해 합으로 바꾼다',
      text: '$\\log x_i!$는 $\\lambda$와 무관한 상수지만, 수치 카드의 ℓ 값은 이 상수까지 넣어 R의 dpois(log = TRUE) 합과 같게 계산한다.',
      tex: '\\ell(\\lambda) = \\Big(\\sum x_i\\Big)\\log\\lambda - n\\lambda - \\sum_{i=1}^{n}\\log x_i!',
    },
    {
      title: '점수함수를 0으로 놓는다',
      text: '',
      tex: '\\ell\'(\\lambda) = \\frac{\\sum x_i}{\\lambda} - n = 0',
    },
    {
      title: 'λ에 대해 푼다',
      text: '',
      tex: '\\hat{\\lambda} = \\frac{1}{n}\\sum_{i=1}^{n} x_i = \\bar{x}',
    },
    {
      title: '최댓값인지 확인하고 경계를 점검한다',
      text: '$\\sum x_i > 0$이면 2계 도함수가 음수라 $\\hat\\lambda$가 최댓값이다. 관측치가 모두 0이면 $\\ell(\\lambda) = -n\\lambda$가 감소함수여서 경계 $\\lambda \\to 0$에서 최대다.',
      tex: '\\ell\'\'(\\lambda) = -\\frac{\\sum x_i}{\\lambda^2} < 0',
    },
  ],
};
