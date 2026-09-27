// 숫자 표시. 음수 기호는 유니코드 마이너스(−)를 쓴다.

export function fmt(x, digits = 3) {
  if (x === Infinity) return '∞';
  if (x === -Infinity) return '−∞';
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  let s = x.toFixed(digits);
  if (/^-0(\.0*)?$/.test(s)) s = s.slice(1);
  return s.replace('-', '−');
}

/** 유효숫자 기준 표시 — 아주 작거나 큰 값은 10의 거듭제곱 표기 */
export function fmtSig(x, sig = 4) {
  if (!Number.isFinite(x)) return fmt(x);
  if (x === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(x)));
  if (e < -3 || e > 5) {
    const m = x / 10 ** e;
    return `${fmt(m, Math.max(0, sig - 1))}×10^${e}`.replace('^-', '^−');
  }
  return fmt(x, Math.max(0, sig - 1 - e));
}

/** 10^k 형태를 위첨자로 */
export function sup(str) {
  const map = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '−': '⁻', '-': '⁻' };
  return str.replace(/\^([−-]?\d+)/g, (_, d) => [...d].map((c) => map[c]).join(''));
}

/** 슬라이더 간격에 맞는 소수 자릿수 */
export function decimalsFor(step) {
  return Math.max(0, Math.ceil(-Math.log10(step) - 1e-9));
}
