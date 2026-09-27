// 페이지 공통: KaTeX 렌더링, 스크린리더 알림, 움직임 설정.

const katex = () => window.katex;

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

/** TeX 문자열 → HTML (KaTeX가 없으면 원문) */
export function tex(src, display = false) {
  if (!katex()) return `<code>${escapeHtml(src)}</code>`;
  return katex().renderToString(src, { displayMode: display, throwOnError: false, output: 'htmlAndMathml', strict: false });
}

/** "글 $수식$ 글" 형태를 HTML로 */
export function mixed(text) {
  return text
    .split(/(\$[^$]+\$)/g)
    .map((part) => (part.startsWith('$') && part.endsWith('$') && part.length > 2 ? tex(part.slice(1, -1)) : escapeHtml(part)))
    .join('');
}

/** [data-tex] 요소를 렌더링 (data-display가 있으면 블록 수식) */
export function renderTexIn(root = document) {
  root.querySelectorAll('[data-tex]').forEach((el) => {
    el.innerHTML = tex(el.dataset.tex, el.hasAttribute('data-display'));
  });
  root.querySelectorAll('[data-mixed]').forEach((el) => {
    el.innerHTML = mixed(el.dataset.mixed);
  });
  // [data-math] 안의 $…$ 인라인 수식
  root.querySelectorAll('[data-math]').forEach((el) => {
    el.innerHTML = el.innerHTML.replace(/\$([^$<]+)\$/g, (_, src) => tex(src.replace(/&amp;/g, '&')));
  });
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** aria-live 영역에 모아서 알린다 (슬라이더를 끄는 동안 쏟아지지 않게) */
export function createAnnouncer(el, delay = 600) {
  let timer = null;
  let last = '';
  return (text) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (text !== last) {
        el.textContent = text;
        last = text;
      }
    }, delay);
  };
}

/** 슬라이더 + 숫자 입력 짝. 값을 바꾸면 onInput(value) */
export function bindRange(range, number, { onInput, format = (v) => String(v), valueText }) {
  const push = (v, from) => {
    if (!Number.isFinite(v)) return;
    onInput(v, from);
  };
  range.addEventListener('input', () => push(Number(range.value), 'range'));
  number.addEventListener('change', () => push(Number(number.value), 'number'));
  range.addEventListener('keydown', (e) => {
    // Shift + ←/→ 로 10배 이동
    if (!e.shiftKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const step = Number(range.step) || 1;
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : -1;
    push(Math.min(Number(range.max), Math.max(Number(range.min), Number(range.value) + dir * step * 10)), 'range');
  });
  return {
    set(v) {
      range.value = String(v);
      if (document.activeElement !== number) number.value = format(v);
      if (valueText) range.setAttribute('aria-valuetext', valueText(v));
    },
    config({ min, max, step }) {
      for (const el of [range, number]) {
        el.min = String(min);
        el.max = String(max);
        el.step = String(step);
      }
    },
  };
}

/** 키 입력이 글자 입력 칸에서 온 것인가 */
export function isTypingTarget(t) {
  if (!t) return false;
  const tag = t.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return !['range', 'checkbox', 'radio', 'button'].includes(t.type);
  return t.isContentEditable;
}
