const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const repo = path.resolve(__dirname, '..')
const evidenceDirectory = path.resolve(
  process.env.PROXY_ZERO_BALANCE_OUTPUT || path.join(repo, 'artifacts', 'balance'),
)
const head = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repo,
  encoding: 'utf8',
}).trim()
const workingTreeStatus = execFileSync('git', ['status', '--porcelain'], {
  cwd: repo,
  encoding: 'utf8',
}).trim()

if (workingTreeStatus !== '') {
  console.error('Official balance verification requires a clean, frozen Git commit.')
  process.exit(1)
}

const issues = []
const warnings = []

const finiteNumber = (value) => typeof value === 'number' && Number.isFinite(value)
const digest = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex')
const latest = (reports) => [...reports].sort((left, right) =>
  String(right.recordedAt).localeCompare(String(left.recordedAt))
)[0]

if (!fs.existsSync(evidenceDirectory)) {
  console.error(`Balance evidence directory is missing: ${evidenceDirectory}`)
  process.exit(1)
}

const reports = fs.readdirSync(evidenceDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'summary.json')
  .map((entry) => {
    const filePath = path.join(evidenceDirectory, entry.name)
    const bytes = fs.readFileSync(filePath)
    const screenshotFile = entry.name.replace(/\.json$/, '.png')
    const screenshotPath = path.join(evidenceDirectory, screenshotFile)
    try {
      return {
        ...JSON.parse(bytes.toString('utf8')),
        evidenceFile: entry.name,
        evidenceSha256: digest(bytes),
        screenshotFile,
        screenshotSha256: fs.existsSync(screenshotPath)
          ? digest(fs.readFileSync(screenshotPath))
          : null,
      }
    } catch (error) {
      issues.push(`${entry.name}: invalid JSON (${error.message})`)
      return null
    }
  })
  .filter(Boolean)

const candidates = reports.filter((report) =>
  report.schemaVersion === 1 &&
  report.validOfficialRun === true &&
  report.officialEvidenceEligible === true &&
  report.gameplayVideoFile === null &&
  report.buildCommit === head &&
  report.buildDirty === false &&
  report.commit === head
)
const selected = []

for (const characterId of ['han', 'mina', 'jin']) {
  const matches = candidates.filter((report) =>
    report.runKind === 'clear' &&
    report.characterId === characterId &&
    report.expectedCharacter === characterId &&
    report.outcome === 'mission-clear' &&
    report.continueUsed === false
  )
  if (matches.length === 0) {
    issues.push(`missing valid ${characterId.toUpperCase()} clear for ${head}`)
    continue
  }
  if (matches.length > 1) {
    warnings.push(`${matches.length} valid ${characterId.toUpperCase()} clears found; newest selected`)
  }
  selected.push(latest(matches))
}

const failureMatches = candidates.filter((report) =>
  report.runKind === 'failure' &&
  report.outcome === 'mission-failed' &&
  report.rank === 'D' &&
  report.continueUsed === true &&
  report.deaths === 4
)
if (failureMatches.length === 0) {
  issues.push(`missing valid failure run for ${head}`)
} else {
  if (failureMatches.length > 1) {
    warnings.push(`${failureMatches.length} valid failure runs found; newest selected`)
  }
  selected.push(latest(failureMatches))
}

for (const report of selected) {
  if (report.screenshotSha256 === null) {
    issues.push(`${report.evidenceFile}: matching Results screenshot is missing`)
  }
  if (!finiteNumber(report.averageFps) || !finiteNumber(report.lowestCompletedWindowFps)) {
    issues.push(`${report.evidenceFile}: incomplete FPS evidence`)
  }
  if (!Number.isInteger(report.completedFpsWindows) || report.completedFpsWindows < 1) {
    issues.push(`${report.evidenceFile}: no completed FPS window`)
  }
  if (report.viewport !== '1280x720' || report.displayScale !== 1) {
    issues.push(`${report.evidenceFile}: unexpected viewport or display scale`)
  }
  if (!Array.isArray(report.pageErrors) || report.pageErrors.length > 0) {
    issues.push(`${report.evidenceFile}: page errors are present or missing`)
  }
  if (!Array.isArray(report.consoleErrors) || report.consoleErrors.length > 0) {
    issues.push(`${report.evidenceFile}: console errors are present or missing`)
  }
  if (finiteNumber(report.averageFps) && report.averageFps < 55) {
    warnings.push(`${report.evidenceFile}: average FPS ${report.averageFps.toFixed(1)} is below the 55 FPS target`)
  }
  if (report.observerWrappedAtActiveTimeMs !== 0) {
    issues.push(`${report.evidenceFile}: observer did not wrap at active time zero`)
  }
}

const selectedFailure = selected.find((report) => report.runKind === 'failure')
if (selectedFailure) {
  const failureSequence = Array.isArray(selectedFailure.events)
    ? selectedFailure.events
      .filter((event) => ['continue-used', 'death'].includes(event?.type))
      .map((event) => event.type)
    : []
  if (failureSequence.join(',') !== 'death,death,continue-used,death,death') {
    issues.push(`${selectedFailure.evidenceFile}: failure event sequence is invalid or missing`)
  }
}

if (selected.length === 4) {
  const browserVersions = new Set(selected.map((report) => report.browserVersion))
  if (browserVersions.size !== 1) issues.push('selected runs do not use one browser version')

  const clearTimes = selected
    .filter((report) => report.runKind === 'clear')
    .map((report) => report.activeTimeMs)
    .sort((left, right) => left - right)
  if (clearTimes.some((time) => !finiteNumber(time) || time < 480_000 || time > 720_000)) {
    issues.push('one or more clear times are outside 480000-720000ms')
  }
  const medianActiveTimeMs = clearTimes[1]
  if (!finiteNumber(medianActiveTimeMs) || medianActiveTimeMs < 540_000 || medianActiveTimeMs > 660_000) {
    issues.push('clear-time median is outside 540000-660000ms')
  }
}

const summary = {
  schemaVersion: 1,
  validOfficialSet: issues.length === 0 && selected.length === 4,
  verifiedCommit: head,
  generatedAt: new Date().toISOString(),
  evidenceDirectory: 'artifacts/balance',
  selectedRuns: selected.map((report) => ({
    runKind: report.runKind,
    characterId: report.characterId,
    buildCommit: report.buildCommit,
    buildDirty: report.buildDirty,
    outcome: report.outcome,
    activeTimeMs: report.activeTimeMs,
    deaths: report.deaths,
    hitsTaken: report.hitsTaken,
    maxCombo: report.maxCombo,
    score: report.score,
    rank: report.rank,
    continueUsed: report.continueUsed,
    averageFps: report.averageFps,
    lowestCompletedWindowFps: report.lowestCompletedWindowFps,
    lowEffectActivated: report.lowEffectActivated,
    browserVersion: report.browserVersion,
    evidenceFile: report.evidenceFile,
    evidenceSha256: report.evidenceSha256,
    screenshotFile: report.screenshotFile,
    screenshotSha256: report.screenshotSha256,
  })),
  issues,
  warnings,
}

const summaryJson = path.join(evidenceDirectory, 'summary.json')
const summaryMarkdown = path.join(evidenceDirectory, 'summary.md')
fs.writeFileSync(summaryJson, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')

const rows = summary.selectedRuns.map((run) =>
  `| ${run.runKind} | ${run.characterId.toUpperCase()} | ${run.outcome} | ${run.activeTimeMs} | ${run.deaths} | ${run.hitsTaken} | ${run.maxCombo} | ${run.score} | ${run.rank} | ${run.continueUsed ? 'Yes' : 'No'} | ${run.averageFps?.toFixed(1) ?? 'N/A'} / ${run.lowestCompletedWindowFps?.toFixed(1) ?? 'N/A'} | ${run.lowEffectActivated ? 'Yes' : 'No'} | ${run.evidenceFile} / ${run.evidenceSha256}; ${run.screenshotFile} / ${run.screenshotSha256} |`
)
const markdown = [
  '# PROXY ZERO balance evidence summary',
  '',
  `- Commit: \`${head}\``,
  `- Valid official set: **${summary.validOfficialSet ? 'YES' : 'NO'}**`,
  '',
  '| Run | Character | Outcome | Active ms | Deaths | Hits | Combo | Score | Rank | Continue | Avg / low FPS | Low effect | Evidence / SHA-256 |',
  '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- |',
  ...rows,
  '',
  '## Issues',
  '',
  ...(issues.length ? issues.map((issue) => `- ${issue}`) : ['- None']),
  '',
  '## Warnings',
  '',
  ...(warnings.length ? warnings.map((warning) => `- ${warning}`) : ['- None']),
  '',
].join('\n')
fs.writeFileSync(summaryMarkdown, markdown, 'utf8')

console.log(JSON.stringify(summary, null, 2))
console.log(`Saved: ${summaryJson}`)
console.log(`Saved: ${summaryMarkdown}`)
if (!summary.validOfficialSet) process.exitCode = 1
