# 가능도 실험실 (MLE Lab)

분포를 골라 표본을 뽑고 후보 모수를 움직이며 가능도가 어떻게 변하는지 보는, 최대가능도추정(MLE) 시각화 정적 웹사이트입니다. 서버가 필요한 R Shiny 대신 브라우저에서 모든 계산을 하므로 GitHub Pages에 그대로 올립니다. 빌드 도구 없이 순수 JavaScript(ES 모듈) + D3 + KaTeX로 만들었습니다.

## 페이지

| 메뉴 | 파일 | 내용 |
| --- | --- | --- |
| 홈 | `index.html` | 한 문장 정의, 움직이는 미리보기, 학습 경로 카드 |
| 개념 따라가기 | `concepts.html` | 4단계 투어: 확률과 가능도 → 곱에서 합으로 → 꼭대기 찾기 → 추정량의 성질 |
| 시뮬레이터 | `simulator.html` | 분포 탭 + 연동 패널 A(데이터·모형) · B(기여분 원장) · C(가능도 곡선) + 수치 카드 |
| 유도 노트 | `derivations.html` | 분포별 5단계 유도, 단계마다 "그림에서 보기" 링크 |
| 반복 실험 | `sampling.html` | θ̂를 R번 뽑은 히스토그램, 점근정규 근사, n = 10/50/200 비교, 편향 |
| 도움말 | `help.html` | 사용법, 키보드, 용어집, 참고문헌 |

## 지원 분포

정규(μ, σ 기지) · 베르누이 · 이항(m 기지) · 포아송 · 지수 · 정규(μ, σ²) · 균등(0, θ).
정규(μ, σ²)는 패널 C가 등고선과 단면 곡선으로 바뀌고, 균등(0, θ)은 "미분 = 0이 통하지 않는" 끝점 해를 보여 줍니다.

## 시뮬레이터 상태는 URL에

```
simulator.html?dist=normal&n=15&seed=42&t0=1&theta=0.4
```

| 키 | 뜻 |
| --- | --- |
| `dist` | `normal`, `bernoulli`, `binomial`, `poisson`, `exponential`, `normal2`, `uniform` |
| `n`, `seed`, `t0` (`t02`) | 표본크기, 시드, 참값 (2모수면 σ₀²) |
| `theta` (`theta2`) | 후보 모수 |
| `sigma`, `m` | 알려진 모수 (정규의 σ, 이항의 m) |
| `hide`, `rel`, `tan`, `truec`, `curv` | 참값 숨기기, 상대가능도, 접선, 참값 곡선, 곡률·가능도 구간 (0/1) |
| `sort`, `prod`, `zoom` | 패널 B 정렬(`index`/`value`), 곱으로 보기, θ̂ 주변 확대 |
| `data` | 직접 입력한 자료 (쉼표 구분) |
| `hl` | 유도 노트 단계 강조 (1–5) |

## 파일 구조

```
assets/css/      tokens.css (의미 색·간격 변수, 다크 모드)  base.css  components.css
assets/js/core/  rng.js (mulberry32, Box–Muller 등)  special.js (lgamma, logsumexp)
                 lik.js (ℓ, 격자, 가능도 구간)  optimize.js (뉴턴법, 황금분할)
                 state.js (URL 동기화 상태)  format.js
assets/js/dists/ index.js (레지스트리)  normal-mean.js  normal-2p.js  bernoulli.js
                 binomial.js  poisson.js  exponential.js  uniform.js
assets/js/plots/ chart.js  panel-data.js  panel-contrib.js  panel-lik.js  contour.js  histogram.js
assets/js/pages/ simulator.js  concepts.js  derivations.js  sampling.js  home.js  help.js
assets/js/ui/    common.js (KaTeX, 슬라이더 연결, 스크린리더 알림)
vendor/          d3.v7.min.js  katex/  pretendard/   (CDN 없이 오프라인 동작)
tests/           dists.test.mjs  fixtures/make-fixtures.R  fixtures/expected.json
```

## 새 분포 추가

`assets/js/dists/`에 정의 파일 하나를 만들고 `index.js`의 목록에 더하면 화면 코드는 그대로 동작합니다. 필요한 필드는 기존 파일(예: `poisson.js`)을 참고하세요: `sample`, `logpdf`(상수항 포함 전체 로그밀도), `score`, `hessian`, `mle`, `mleExplain`, `suffStats`, `fisher`, `xDomain`, `validX`, `derivation`(5단계).
닫힌 형태 추정량이 없으면 `mle`가 뉴턴법(`core/optimize.js`의 `newtonMax`)을 부르면 됩니다.

## 테스트

```bash
node --test
```

- R로 만든 기대값(`tests/fixtures/expected.json`)과 ℓ(θ), θ̂가 1e-9 이내로 같은지
- 수치 최댓값(뉴턴법, 황금분할)과 닫힌 형태 θ̂의 차이가 1e-6 이하인지
- 점수함수·2계 도함수가 수치 미분과 맞는지, 시드 재현성과 "n을 늘려도 앞쪽 점 유지"
- 베르누이 경계 해, 균등분포 끝점 해, L/ℓ 최댓값 위치 일치, 95% 가능도 구간

기대값을 다시 만들려면 저장소 루트에서 `Rscript tests/fixtures/make-fixtures.R` (jsonlite 필요).

## 로컬에서 실행

ES 모듈은 `file://`에서 동작하지 않으므로 로컬 서버로 엽니다.

```bash
python -m http.server 8000
```

브라우저에서 <http://localhost:8000>을 엽니다.

## GitHub Pages 배포

두 방법 중 하나를 고릅니다. 모든 경로가 상대 경로라 `https://<계정>.github.io/<저장소명>/` 같은 하위 경로에서도 동작합니다.

1. **Actions 배포 (권장)** — Settings → Pages → Source를 **GitHub Actions**로 둡니다. `.github/workflows/pages.yml`이 푸시마다 `node --test`를 돌리고, 통과할 때만 배포합니다.
2. **브랜치 배포** — Source를 **Deploy from a branch**, 브랜치 `main`, 폴더 `/ (root)`로 둡니다. 루트의 `.nojekyll` 덕분에 Jekyll 처리 없이 게시됩니다 (이 경우 테스트는 배포를 막지 않습니다).

## 외부 라이브러리 (vendor/)

- D3 v7.9.0 — ISC License
- KaTeX 0.16.22 — MIT License
- Pretendard 1.3.9 (가변 글꼴, 동적 서브셋) — SIL Open Font License 1.1

## R Shiny 원본과의 대응

정규(μ) 탭 하나로 원본 화면을 재현합니다: `resample` → "새 표본"(단축키 R, 시드 기반), `n` 슬라이더 → 1–200 (기존 점 유지), `mu_cand` → 후보 슬라이더·곡선 드래그·키보드 (범위 −4~5로 통일), `distPlot` → 패널 A, `llPlot` → 패널 C, `geom_vline(mean(x))` → θ̂ 마름모 + 세로선, `stats` → 수치 카드. 패널 B, 접선, 애니메이션, 나머지 분포는 새로 더한 것입니다.
