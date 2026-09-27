import { max } from '../core/special.js';
import { fmt } from '../core/format.js';

export default {
  id: 'uniform',
  name: '균등(0, θ)',
  title: '균등분포 Uniform(0, θ)',
  param: 'theta',
  symbol: '\\theta',
  label: 'θ',
  discrete: false,
  domain: [0, Infinity],
  known: {},
  knownSpec: [],
  defaults: { theta0: 4, n: 15, range: [0, 10], step: 0.01, theta0Range: [0.5, 9] },
  lesson: '기울기가 0이 아닌 끝점 max xᵢ에서 최댓값이 난다 — 미분 = 0이 통하지 않는 예.',
  xLabel: 'x',

  sample(rng, n, theta) {
    return Array.from({ length: n }, () => rng() * theta);
  },
  logpdf(x, theta) {
    return x >= 0 && x <= theta ? -Math.log(theta) : -Infinity;
  },
  score(xs, theta) {
    return theta >= max(xs) ? -xs.length / theta : NaN;
  },
  hessian(xs, theta) {
    return theta >= max(xs) ? xs.length / (theta * theta) : NaN;
  },
  mle(xs) {
    return max(xs);
  },
  mleExplain(xs) {
    return `θ̂ = max xᵢ = ${fmt(max(xs), 3)}`;
  },
  suffStats(xs) {
    return [{ label: 'max xᵢ', value: fmt(max(xs), 3) }];
  },
  // 정칙 조건을 만족하지 않아 피셔 정보량 근사를 쓰지 않는다. 대신 θ̂의 정확한 분포를 준다.
  fisher: null,
  /** θ̂ = max xᵢ 의 밀도: n t^(n−1) / θⁿ, 0 ≤ t ≤ θ */
  mleDensity(t, theta, n) {
    if (t < 0 || t > theta) return 0;
    return (n / theta) * Math.pow(t / theta, n - 1);
  },
  xDomain(xs) {
    return [0, Math.max(max(xs), 10) * 1.04];
  },
  validX(x) {
    return Number.isFinite(x) && x > 0;
  },
  breakpoints(theta) {
    return [theta];
  },
  isBoundary() {
    return true;
  },
  /** "최댓값 찾기" 전용 걸음: 오르막 방향(θ 감소)으로 가다가 max xᵢ에서 멈춘다 */
  stepper(xs, t) {
    const m = max(xs);
    if (t < m) return { next: m, note: 'θ < max xᵢ 에서는 가능도가 0(ℓ = −∞)이므로 먼저 경계 max xᵢ로 옮깁니다.' };
    if (Math.abs(t - m) < 1e-12) {
      return { next: m, done: true, note: `θ = max xᵢ에 도착했습니다. 여기서 ℓ′(θ) = −n/θ = ${fmt(-xs.length / m, 3)}로 0이 아니지만, 더 왼쪽은 ℓ = −∞라서 끝점이 최댓값입니다.` };
    }
    // 오르막 한 걸음: 남은 거리의 절반 (경계를 넘으면 경계에서 멈춘다)
    const proposed = t - Math.max((t - m) / 2, 0);
    return proposed - m < 0.02 * m ? { next: m, note: '경계를 넘는 걸음은 max xᵢ에서 멈춥니다.' } : { next: proposed };
  },

  derivation: [
    {
      title: '가능도함수를 쓴다',
      text: '밀도 $f(x\\mid\\theta) = 1/\\theta$ ($0 \\le x \\le \\theta$)는 $\\theta$가 어떤 관측치보다 작으면 0이다. 그래서 가능도에 지시함수가 붙는다.',
      tex: 'L(\\theta) = \\prod_{i=1}^{n} \\frac{1}{\\theta}\\,\\mathbf{1}\\{0 \\le x_i \\le \\theta\\} = \\theta^{-n}\\,\\mathbf{1}\\{\\theta \\ge x_{(n)}\\}',
    },
    {
      title: '로그를 취해 합으로 바꾼다',
      text: '$x_{(n)} = \\max x_i$보다 작은 $\\theta$에서는 가능도가 0이므로 로그가능도가 $-\\infty$다.',
      tex: '\\ell(\\theta) = \\begin{cases} -n\\log\\theta & \\theta \\ge x_{(n)} \\\\ -\\infty & \\theta < x_{(n)} \\end{cases}',
    },
    {
      title: '점수함수를 0으로 놓아 본다',
      text: '허용되는 구간에서 기울기는 항상 음수라 0이 되는 곳이 없다. 미분 = 0으로는 답을 찾을 수 없다.',
      tex: '\\ell\'(\\theta) = -\\frac{n}{\\theta} < 0 \\quad (\\theta \\ge x_{(n)})',
    },
    {
      title: '함수 모양으로 푼다',
      text: '$\\ell$은 $[x_{(n)}, \\infty)$에서 감소하고 그 왼쪽은 $-\\infty$다. 따라서 최댓값은 허용 구간의 왼쪽 끝점이다.',
      tex: '\\hat{\\theta} = x_{(n)} = \\max_i x_i',
    },
    {
      title: '곡률과 편향을 점검한다',
      text: '2계 도함수가 양수라 곡률로 표준오차를 구하는 방법이 통하지 않는다. 또 $\\hat\\theta \\le \\theta$이므로 아래로 치우친다: $E[\\hat\\theta] = \\frac{n}{n+1}\\theta$.',
      tex: '\\ell\'\'(\\theta) = \\frac{n}{\\theta^2} > 0',
    },
  ],
};
