# Stage 1 balance run record

All accepted runs must use one frozen commit and a production build at 1280x720.
Bots, debug-clear, state mutation, and Continue are forbidden in the three clear runs.
The observer rejects an official run unless the commit embedded in the preview build
matches the current clean Git `HEAD`; an already-running stale preview cannot be relabeled.

## Frozen build

- Commit: `TBD`
- Browser/version: `TBD`
- Evidence directory: `artifacts/balance/` (local-only and Git-ignored)

## Exact execution order

From the frozen commit, `git status --porcelain` must print nothing. Then run:

```powershell
npm ci
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run verify
npm run build
npm run preview -- --host 127.0.0.1 --port 4178 --strictPort
```

Keep that preview terminal open. In a second terminal, verify the hook before playing:

```powershell
npm run qa:balance -- --smoke
```

## Manual run hints

- Click the canvas once for focus. Use the reliable 180 ms two-key chains:
  HAN `J` → `K`, MINA `J` → `L`, and JIN `K` → `J`.
- Move to another lane with `W`/`S` as soon as an elite or boss charge warns;
  jumping does not grant invulnerability.
- Use REPAIR after losing at least 45 HP (HAN 55, MINA 40, JIN 80 or lower).
  Save the single EMP for the boss's fast third phase unless the elite run is in danger.

Run these one at a time and manually select the matching character:

```powershell
$env:PROXY_ZERO_BALANCE_CHARACTER='han'
npm run qa:balance
$env:PROXY_ZERO_BALANCE_CHARACTER='mina'
npm run qa:balance
$env:PROXY_ZERO_BALANCE_CHARACTER='jin'
npm run qa:balance
```

Do not press Retry or Title on Results until the observer saves its JSON and PNG.
For the required failure run:

```powershell
$env:PROXY_ZERO_BALANCE_RUN_KIND='failure'
npm run qa:balance
```

At the first Game Over, press Enter to Continue. After two further deaths, finish the
run. Each JSON must show the same `commit` and `buildCommit`, `buildDirty: false`,
the expected `characterId`, and `validOfficialRun: true`. Record each JSON/PNG
filename and SHA-256 in the table.

## Required runs

| Run | Character | Outcome | Active time | Deaths | Hits | Max combo | Score | Rank | Continue | Avg / lowest FPS | Low effect | Evidence |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| Clear 1 | HAN | TBD | TBD | TBD | TBD | TBD | TBD | TBD | No | TBD | TBD | TBD |
| Clear 2 | MINA | TBD | TBD | TBD | TBD | TBD | TBD | TBD | No | TBD | TBD | TBD |
| Clear 3 | JIN | TBD | TBD | TBD | TBD | TBD | TBD | TBD | No | TBD | TBD | TBD |
| Failure | Any | mission-failed | N/A | 4 | TBD | TBD | TBD | D | Once | TBD | TBD | TBD |

Clear acceptance: every active time is 480-720 seconds and the median is 540-660 seconds.
Failure acceptance: two deaths, Continue once, two more deaths, then mission-failed rank D.
Sort the three clear `activeTimeMs` values; the middle value is the median.
After all four runs, execute `npm run qa:balance:verify`. It selects the newest
valid evidence for the frozen commit, verifies the full set, and writes local
`artifacts/balance/summary.json` plus `summary.md` with evidence SHA-256 values.

For a separate human-played video source run, point `PROXY_ZERO_BALANCE_OUTPUT`
to `artifacts/video-source`, set `PROXY_ZERO_CAPTURE_VIDEO=1`, and run the same
observer. Captured runs are marked `officialEvidenceEligible: false` and can
never enter the four-run FPS set; video capture stays off there by default.
