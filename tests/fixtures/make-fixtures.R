# 테스트 기대값 생성: 고정 표본에 대한 ℓ(θ)와 θ̂.
# 실행: Rscript tests/fixtures/make-fixtures.R  (저장소 루트에서)
library(jsonlite)

ll <- function(v) if (is.finite(v)) v else NA  # −Inf는 JSON null

cases <- list()
add <- function(id, x, thetas, llfun, mle, known = list()) {
  cases[[length(cases) + 1]] <<- list(
    dist = id, known = known, x = x,
    thetas = thetas,
    ll = lapply(thetas, function(t) ll(llfun(x, t))),
    mle = mle
  )
}

x <- c(1, 0, 0, 1, 1, 0, 1, 0, 0, 0, 1, 1, 0, 0, 1)
add("bernoulli", x, list(0.1, 0.3, 0.5, 0.9),
    function(x, p) sum(dbinom(x, 1, p, log = TRUE)), mean(x))

x <- rep(1, 8)
add("bernoulli", x, list(0.5, 0.99), function(x, p) sum(dbinom(x, 1, p, log = TRUE)), 1)

x <- c(3, 5, 2, 4, 6, 3, 1, 4, 5, 2)
add("binomial", x, list(0.2, 0.35, 0.6),
    function(x, p) sum(dbinom(x, 10, p, log = TRUE)), mean(x) / 10, list(m = 10))

x <- c(2, 4, 3, 0, 5, 3, 1, 6, 2, 3, 4, 2)
add("poisson", x, list(0.5, 3, 7.5),
    function(x, l) sum(dpois(x, l, log = TRUE)), mean(x))

x <- c(12, 0, 7, 25, 3, 18)
add("poisson", x, list(1, 10, 40), function(x, l) sum(dpois(x, l, log = TRUE)), mean(x))

x <- c(0.35, 1.2, 0.08, 2.7, 0.66, 1.05, 0.41, 3.3, 0.19, 0.9)
add("exponential", x, list(0.3, 1, 4),
    function(x, l) sum(dexp(x, l, log = TRUE)), 1 / mean(x))

x <- c(1.2, -0.4, 2.3, 0.8, 1.9, 0.1, 3.2, 1.4)
add("normal", x, list(-4, 0, 1.3, 5),
    function(x, m) sum(dnorm(x, m, 1.5, log = TRUE)), mean(x), list(sigma = 1.5))

add("normal2", x, list(c(0, 1), c(1.3, 2), c(2, 0.5)),
    function(x, t) sum(dnorm(x, t[1], sqrt(t[2]), log = TRUE)),
    c(mean(x), mean((x - mean(x))^2)))

x <- c(2.1, 4.7, 0.3, 3.9, 1.5, 4.2)
add("uniform", x, list(4, 4.7, 6, 9),
    function(x, t) sum(dunif(x, 0, t, log = TRUE)), max(x))

out <- list(generated_by = R.version.string, cases = cases)
writeLines(toJSON(out, auto_unbox = TRUE, digits = NA, null = "null", na = "null", pretty = TRUE),
           "tests/fixtures/expected.json")
cat("wrote tests/fixtures/expected.json\n")
