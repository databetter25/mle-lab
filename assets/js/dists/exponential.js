import { exponential as rexp } from '../core/rng.js';
import { sum, max } from '../core/special.js';
import { fmt } from '../core/format.js';

export default {
  id: 'exponential',
  name: '지수',
  title: '지수분포 Exponential(λ), 비율 모수',
  param: 'lambda',
  symbol: '\\lambda',
  label: 'λ',
  discrete: false,
  domain: [0, Infinity],
  known: {},
  knownSpec: [],
  defaults: { theta0: 1, n: 15, range: [0, 5], step: 0.01, theta0Range: [0.2, 4] },
  lesson: '역수 형태의 추정량 λ̂ = 1/x̄. 평균 모수 β = 1/λ로 바꾸면 β̂ = x̄ (불변성).',
  xLabel: 'x (대기 시간)',

  sample(rng, n, lambda) {
    return Array.from({ length: n }, () => rexp(rng, lambda));
  },
  logpdf(x, lambda) {
    return x < 0 ? -Infinity : Math.log(lambda) - lambda * x;
  },
  score(xs, lambda) {
    return xs.length / lambda - sum(xs);
  },
  hessian(xs, lambda) {
    return -xs.length / (lambda * lambda);
  },
  mle(xs) {
    return xs.length / sum(xs);
  },
  mleExplain(xs) {
    const s = sum(xs);
    return `λ̂ = 1 / x̄ = n / Σxᵢ = ${xs.length} / ${fmt(s, 2)} = ${fmt(this.mle(xs), 3)}   (평균 β̂ = x̄ = ${fmt(s / xs.length, 3)})`;
  },
  suffStats(xs) {
    return [{ label: 'Σxᵢ', value: fmt(sum(xs), 3) }];
  },
  fisher(lambda) {
    return 1 / (lambda * lambda);
  },
  xDomain(xs) {
    return [0, Math.max(max(xs) * 1.08, 5)];
  },
  validX(x) {
    return Number.isFinite(x) && x > 0;
  },

  derivation: [
    {
      title: '가능도함수를 쓴다',
      text: '관측치 하나의 밀도는 $f(x\\mid\\lambda) = \\lambda e^{-\\lambda x}$ ($x > 0$)이다.',
      tex: 'L(\\lambda) = \\prod_{i=1}^{n} \\lambda e^{-\\lambda x_i} = \\lambda^{n} e^{-\\lambda \\sum x_i}',
    },
    {
      title: '로그를 취해 합으로 바꾼다',
      text: '',
      tex: '\\ell(\\lambda) = n\\log\\lambda - \\lambda\\sum_{i=1}^{n} x_i',
    },
    {
      title: '점수함수를 0으로 놓는다',
      text: '',
      tex: '\\ell\'(\\lambda) = \\frac{n}{\\lambda} - \\sum x_i = 0',
    },
    {
      title: 'λ에 대해 푼다',
      text: '비율 모수의 추정량은 평균의 역수다. 불변성에 따라 평균 모수 $\\beta = 1/\\lambda$의 최대가능도추정량은 $\\hat\\beta = 1/\\hat\\lambda = \\bar x$이다.',
      tex: '\\hat{\\lambda} = \\frac{n}{\\sum x_i} = \\frac{1}{\\bar{x}}',
    },
    {
      title: '최댓값인지 확인한다',
      text: '2계 도함수가 모든 $\\lambda > 0$에서 음수다.',
      tex: '\\ell\'\'(\\lambda) = -\\frac{n}{\\lambda^2} < 0',
    },
  ],
};
