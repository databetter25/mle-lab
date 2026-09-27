// 유도 노트: 모든 분포를 같은 다섯 단계로. 각 식 옆 "그림에서 보기"는 그 단계를 강조한 시뮬레이터로 간다.

import { DISTS, MAX_N } from '../dists/index.js';
import { mulberry32 } from '../core/rng.js';
import { tex, mixed, renderTexIn } from '../ui/common.js';

const SEED = 42;
const N = 15;

function simLink(d, step) {
  const two = d.params.length === 2;
  const t0 = d.defaults.theta0;
  const xs = d.sample(mulberry32(SEED), MAX_N, t0).slice(0, N);
  const mle = d.mle(xs);
  const q = new URLSearchParams({ dist: d.id, n: N, seed: SEED });
  if (two) {
    q.set('t0', t0[0]);
    q.set('t02', t0[1]);
  } else q.set('t0', t0);
  const r = d.params[0].range;
  const w = r[1] - r[0];
  let theta = mle;
  if (step === 1 || step === 2 || step === 3) {
    // 꼭대기에서 조금 떨어진 곳에서 시작해야 기울기·줄다리기가 보인다
    theta = two ? [mle[0] - 0.8, mle[1] * 1.8] : d.stepper ? mle + 0.25 * w : Math.min(r[1], Math.max(r[0], mle - 0.18 * w));
  }
  const round = (v) => +v.toFixed(4);
  if (two) {
    q.set('theta', round(theta[0]));
    q.set('theta2', round(theta[1]));
  } else q.set('theta', round(theta));
  if (step === 1) q.set('prod', '1');
  if (step === 3) q.set('tan', '1');
  if (step === 5) q.set('curv', '1');
  q.set('hl', step);
  return `simulator.html?${q.toString()}`;
}

function section(d) {
  const steps = d.derivation
    .map(
      (s, i) => `
      <details class="step" ${i === 0 ? 'open' : ''}>
        <summary><span class="num-badge">${i + 1}</span>${s.title}</summary>
        <div class="step-body">
          ${s.text ? `<p>${mixed(s.text)}</p>` : ''}
          <div class="tex-block">${tex(s.tex, true)}</div>
          <a class="see-link" href="${simLink(d, i + 1)}">그림에서 보기 →</a>
        </div>
      </details>`,
    )
    .join('');
  return `
    <section class="section" id="${d.id}" aria-labelledby="h-${d.id}">
      <h2 id="h-${d.id}">${d.title}</h2>
      <p class="small">${d.lesson}</p>
      <div class="btn-row" style="margin-bottom: 12px">
        <button type="button" class="btn btn-sm" data-expand="${d.id}">모두 펼치기</button>
        <a class="btn btn-sm" href="simulator.html?dist=${d.id}">시뮬레이터에서 열기</a>
      </div>
      ${steps}
    </section>`;
}

const toc = document.getElementById('toc');
toc.innerHTML = DISTS.map((d) => `<li><a href="#${d.id}">${d.title}</a></li>`).join('');
document.getElementById('notes').innerHTML = DISTS.map(section).join('');
renderTexIn(document);

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-expand]');
  if (!b) return;
  const sec = document.getElementById(b.dataset.expand);
  const all = [...sec.querySelectorAll('details')];
  const open = !all.every((d) => d.open);
  all.forEach((d) => (d.open = open));
  b.textContent = open ? '모두 접기' : '모두 펼치기';
});

// 주소의 #분포로 바로 이동 (내용이 나중에 그려지므로 다시 스크롤)
if (location.hash) {
  const el = document.querySelector(location.hash);
  if (el) {
    el.querySelectorAll('details').forEach((d) => (d.open = true));
    el.scrollIntoView();
  }
}
