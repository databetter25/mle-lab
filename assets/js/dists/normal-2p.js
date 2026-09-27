import { stdNormal } from '../core/rng.js';
import { sum, min, max } from '../core/special.js';
import { fmt } from '../core/format.js';

const LOG_2PI = Math.log(2 * Math.PI);

function ss(xs, mu) {
  let s = 0;
  for (const x of xs) s += (x - mu) ** 2;
  return s;
}

// 2모수 분포: θ = [μ, σ²]
export default {
  id: 'normal2',
  name: '정규(μ, σ²)',
  title: '정규분포 N(μ, σ²), 두 모수 모두 미지',
  param: 'mu,sigma2',
  symbol: '(\\mu, \\sigma^2)',
  label: '(μ, σ²)',
  discrete: false,
  params: [
    { key: 'mu', symbol: '\\mu', label: 'μ', domain: [-Infinity, Infinity], range: [-4, 5], step: 0.01, theta0Range: [-3, 4] },
    { key: 'sigma2', symbol: '\\sigma^2', label: 'σ²', domain: [0, Infinity], range: [0, 6], step: 0.01, theta0Range: [0.2, 4] },
  ],
  domain: null,
  known: {},
  knownSpec: [],
  defaults: { theta0: [1, 1], n: 15 },
  lesson: '두 모수의 로그가능도는 등고선으로 본다. σ̂² = Σ(xᵢ−x̄)²/n은 s²와 달리 아래로 치우친다.',
  xLabel: 'x',

  sample(rng, n, theta) {
    const s = Math.sqrt(theta[1]);
    return Array.from({ length: n }, () => theta[0] + s * stdNormal(rng));
  },
  logpdf(x, theta) {
    const [mu, s2] = theta;
    return -0.5 * LOG_2PI - 0.5 * Math.log(s2) - ((x - mu) ** 2) / (2 * s2);
  },
  score(xs, theta) {
    const [mu, s2] = theta;
    const n = xs.length;
    return [(sum(xs) - n * mu) / s2, -n / (2 * s2) + ss(xs, mu) / (2 * s2 * s2)];
  },
  hessian(xs, theta) {
    const [mu, s2] = theta;
    const n = xs.length;
    const hmm = -n / s2;
    const hms = -(sum(xs) - n * mu) / (s2 * s2);
    const hss = n / (2 * s2 * s2) - ss(xs, mu) / (s2 * s2 * s2);
    return [
      [hmm, hms],
      [hms, hss],
    ];
  },
  mle(xs) {
    const m = sum(xs) / xs.length;
    return [m, ss(xs, m) / xs.length];
  },
  mleExplain(xs) {
    const n = xs.length;
    const [m, v] = this.mle(xs);
    const q = ss(xs, m);
    const s2 = n > 1 ? `   (s² = ${fmt(q, 2)} / ${n - 1} = ${fmt(q / (n - 1), 3)})` : '';
    return `μ̂ = x̄ = ${fmt(sum(xs), 2)} / ${n} = ${fmt(m, 3)},  σ̂² = Σ(xᵢ−x̄)² / n = ${fmt(q, 2)} / ${n} = ${fmt(v, 3)}${s2}`;
  },
  suffStats(xs) {
    const m = sum(xs) / xs.length;
    return [
      { label: 'Σxᵢ', value: fmt(sum(xs), 3) },
      { label: 'Σ(xᵢ−x̄)²', value: fmt(ss(xs, m), 3) },
    ];
  },
  /** 관측치 하나의 피셔 정보 행렬 (대각) */
  fisher(theta) {
    return [
      [1 / theta[1], 0],
      [0, 1 / (2 * theta[1] ** 2)],
    ];
  },
  xDomain(xs) {
    return [Math.min(min(xs), -4) - 2, Math.max(max(xs), 5) + 2];
  },
  validX(x) {
    return Number.isFinite(x) && Math.abs(x) < 1e6;
  },

  derivation: [
    {
      title: '가능도함수를 쓴다',
      text: '이번에는 평균 $\\mu$와 분산 $\\sigma^2$을 모두 모른다. 가능도는 두 변수의 함수다.',
      tex: 'L(\\mu, \\sigma^2) = \\prod_{i=1}^{n} \\frac{1}{\\sqrt{2\\pi\\sigma^2}}\\exp\\!\\Big(-\\frac{(x_i-\\mu)^2}{2\\sigma^2}\\Big)',
    },
    {
      title: '로그를 취해 합으로 바꾼다',
      text: '',
      tex: '\\ell(\\mu, \\sigma^2) = -\\frac{n}{2}\\log(2\\pi) - \\frac{n}{2}\\log\\sigma^2 - \\frac{1}{2\\sigma^2}\\sum_{i=1}^{n}(x_i-\\mu)^2',
    },
    {
      title: '두 편도함수를 0으로 놓는다',
      text: '점수함수가 벡터가 된다. 두 성분이 동시에 0인 점을 찾는다.',
      tex: '\\frac{\\partial\\ell}{\\partial\\mu} = \\frac{1}{\\sigma^2}\\sum(x_i-\\mu) = 0, \\qquad \\frac{\\partial\\ell}{\\partial\\sigma^2} = -\\frac{n}{2\\sigma^2} + \\frac{1}{2\\sigma^4}\\sum(x_i-\\mu)^2 = 0',
    },
    {
      title: '연립해서 푼다',
      text: '첫 식에서 $\\hat\\mu = \\bar x$를 얻고, 이를 둘째 식에 넣는다. 분모가 $n-1$이 아니라 $n$이다.',
      tex: '\\hat{\\mu} = \\bar{x}, \\qquad \\hat{\\sigma}^2 = \\frac{1}{n}\\sum_{i=1}^{n}(x_i-\\bar{x})^2',
    },
    {
      title: '헤세 행렬로 최댓값을 확인하고 편향을 점검한다',
      text: '추정값에서 헤세 행렬이 음의 정부호라 최댓값이다. 그러나 $E[\\hat\\sigma^2] = \\frac{n-1}{n}\\sigma^2$로 아래로 치우친다. 불편추정량 $s^2$은 분모가 $n-1$이다.',
      tex: 'H(\\hat\\mu, \\hat\\sigma^2) = \\begin{pmatrix} -n/\\hat\\sigma^2 & 0 \\\\ 0 & -n/(2\\hat\\sigma^4) \\end{pmatrix}',
    },
  ],
};
