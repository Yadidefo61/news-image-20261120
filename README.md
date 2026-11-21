# The World in One Day — Friday 20 November 2026

[![news-image-20261120](https://make.fun/badge/news-image-20261120.svg)](https://make.fun/bounty/news-image-20261120)
[![rank](https://make.fun/badge/news-image-20261120/Yadidefo61/news-image-20261120/rank.svg)](https://make.fun/bounty/news-image-20261120)
[![reward](https://make.fun/badge/news-image-20261120/Yadidefo61/news-image-20261120/reward.svg)](https://make.fun/bounty/news-image-20261120)

A deterministic program that draws a newspaper front page summing up the
world's news of Friday 20 November 2026 in a single 1024×1024 image.

The front page leads with the first-ever three-way summit of Trump, Xi and
Putin in Shenzhen and their four-point "Declaration toward Peace", and
covers five more of the day's biggest stories: the UN court's genocide
ruling on Myanmar and the Rohingya, Cyclone Akvan bearing down on Odisha,
Anthropic's record IPO against a plunging US market, the Iran decision
pushed to 2027, and Voyager 1 reaching one light-day from Earth.

Everything is drawn procedurally by `main.ts` (Node 22, standard library
only): a hand-written 5×7 bitmap font, a small vector rasterizer, and a
from-scratch PNG encoder. No network, no clock, no randomness — two runs
write byte-identical output.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

This writes `out/entry.png` (1024×1024, under 1 MiB).
