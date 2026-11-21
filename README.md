# csv-reader-speed

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/lugasprahara/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/lugasprahara/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

SwiftCSV: a fast drop-in CSV reader that answers exactly as the reference reader does on every input, broken rows included — stray CRs, junk after closing quotes, unterminated quotes, short and long rows, multi-line quoted fields. Instead of reading one character at a time, it scans: unquoted fields come out as single slices of the text, quoted fields are located with indexOf, and only the rare segment holding a CR is rebuilt character by character. `solve.js` exports `run({text, header})` returning `{columns, rows, errors}`; `main.ts` is the harness driver that answers every case in `/input/cases.json` into `/output/answers.json`.

## Run it

```sh
node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=aes5np1n&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
