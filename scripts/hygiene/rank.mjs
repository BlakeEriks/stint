/**
 * Ranks files by remediation debt weighted by recent churn: the hotspot
 * model from Tornhill's "Your Code as a Crime Scene" (CodeScene), with debt
 * priced in minutes the way SonarQube's SQALE model prices an issue.
 */

/* Minutes to fix one finding. Complexity is Sonar's own S3776 cost: 5 plus 1
   per point over the threshold. The rest are our estimates in the same unit. */
export const THRESHOLD = 15;
const MINUTES = {
  complexity: (f) => 5 + (f.value - THRESHOLD),
  duplication: () => 10,
  'dead-code': () => 5,
  prose: () => 1,
};

export const debtOf = (f) => MINUTES[f.kind](f);

/* A file nobody touches keeps its debt at face value; each doubling of
   recent commits adds its debt once more. */
export const churnWeight = (commits) => 1 + Math.log2(1 + commits);

/**
 * @param findings  [{ path, kind, line, value?, detail }]
 * @param commits   Map of path -> commits in the window
 * @param skip      Set of paths already filed
 * @returns files, worst first: [{ path, score, debt, commits, findings }]
 */
export function rank(findings, commits, skip = new Set()) {
  const files = new Map();
  for (const f of findings) {
    if (skip.has(f.path)) continue;
    const file = files.get(f.path) ?? { path: f.path, debt: 0, findings: [] };
    file.debt += debtOf(f);
    file.findings.push(f);
    files.set(f.path, file);
  }
  return [...files.values()]
    .map((file) => {
      const n = commits.get(file.path) ?? 0;
      return {
        ...file,
        commits: n,
        score: Math.round(file.debt * churnWeight(n)),
      };
    })
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}

/* An issue owns its file through a marker in its body. A file stays skipped
   while its issue is open, and for 90 days after it is closed as not
   planned; a completed issue frees it, so debt that comes back is refiled. */
export const MARKER = /<!-- hygiene:(\S+) -->/;
const NOT_PLANNED_DAYS = 90;

export function filedPaths(issues, now = Date.now()) {
  const paths = new Set();
  for (const issue of issues) {
    const path = issue.body?.match(MARKER)?.[1];
    if (!path) continue;
    const declinedRecently =
      issue.stateReason === 'NOT_PLANNED' &&
      now - Date.parse(issue.closedAt) < NOT_PLANNED_DAYS * 86_400_000;
    if (issue.state === 'OPEN' || declinedRecently) paths.add(path);
  }
  return paths;
}
