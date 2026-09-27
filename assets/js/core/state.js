// URL과 동기화된 상태 하나 + 구독.
// Shiny의 reactiveVal/observeEvent 대신 쓴다. 상태가 URL에 있으니 링크로 장면을 공유할 수 있다.

const PARSERS = {
  str: (s) => s,
  num: (s) => {
    const v = Number(s);
    return Number.isFinite(v) ? v : undefined;
  },
  int: (s) => {
    const v = Number.parseInt(s, 10);
    return Number.isFinite(v) ? v : undefined;
  },
  bool: (s) => s === '1' || s === 'true',
  list: (s) =>
    s
      .split(/[,\s]+/)
      .filter(Boolean)
      .map(Number)
      .filter(Number.isFinite),
};

const FORMATTERS = {
  str: String,
  num: (v) => String(+v.toPrecision(10)),
  int: String,
  bool: (v) => (v ? '1' : '0'),
  list: (v) => v.map((x) => +x.toPrecision(6)).join(','),
};

/**
 * @param {Record<string, {def:any, type:'str'|'num'|'int'|'bool'|'list', always?:boolean}>} schema
 */
export function createStore(schema, { url = true } = {}) {
  const listeners = new Set();
  let state = {};
  for (const [k, spec] of Object.entries(schema)) state[k] = spec.def;

  if (url) {
    const q = new URLSearchParams(location.search);
    for (const [k, spec] of Object.entries(schema)) {
      if (!q.has(k)) continue;
      const v = PARSERS[spec.type](q.get(k));
      if (v !== undefined && !(spec.type === 'list' && v.length === 0)) state[k] = v;
    }
  }

  function buildUrl() {
    const q = new URLSearchParams();
    for (const [k, spec] of Object.entries(schema)) {
      const v = state[k];
      if (v === null || v === undefined) continue;
      if (!spec.always && JSON.stringify(v) === JSON.stringify(spec.def)) continue;
      q.set(k, FORMATTERS[spec.type](v));
    }
    const s = q.toString().replace(/%2C/g, ',');
    return `${location.pathname}${s ? `?${s}` : ''}${location.hash}`;
  }

  let urlTimer = null;
  function writeUrl() {
    // Safari는 replaceState 호출 빈도를 제한하므로 모아서 쓴다
    clearTimeout(urlTimer);
    urlTimer = setTimeout(() => history.replaceState(null, '', buildUrl()), 200);
  }

  return {
    get: () => state,
    /** 지금 상태의 전체 주소 (링크 복사용) */
    href: () => new URL(buildUrl(), location.href).href,
    set(patch) {
      const prev = state;
      state = { ...state, ...patch };
      if (url) writeUrl();
      for (const fn of listeners) fn(state, prev);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    flushUrl() {
      if (url) writeUrl();
    },
  };
}
