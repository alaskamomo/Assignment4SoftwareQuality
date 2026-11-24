// npm run test:all
// Runs API and UI tests normally, then with all 4 bugs on, and saves everything in test-results/
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";

const OUT = "test-results/test-output.txt";
const LOG = "test-results/server.log";

// Which UI test goes with which defect
const DEFECT_FOLDERS = [
  { match: "available-course", dir: "defect-1" },   // seat-label
  { match: "course-is-missing", dir: "defect-2" },  // skip-prereq
  { match: "duplicate-message", dir: "defect-3" },  // skip-duplicate
  { match: "course-is-full", dir: "defect-4" },     // wrong-seat-column
];

// start fresh
fs.rmSync("test-results", { recursive: true, force: true });
fs.rmSync("playwright-artifacts", { recursive: true, force: true });
fs.mkdirSync("test-results", { recursive: true });
fs.writeFileSync(LOG, "");
fs.writeFileSync(OUT, `EnrollmentNow automated test run   ${new Date().toString()}\n` +
                      `OS: ${os.type()} ${os.release()}   Node: ${process.version}\n`);

const runs = [
  { name: "RUN 1: API integration tests, normal build", cmd: "npx vitest run --reporter=verbose", seed: "", expectFailed: 0 },
  { name: "RUN 2: Playwright UI tests, normal build", cmd: "npx playwright test", seed: "", expectFailed: 0 },
  { name: "RUN 3: API tests with SEED_DEFECT=all (defects 1-4)", cmd: "npx vitest run --reporter=verbose", seed: "all", expectFailed: 4 },
  { name: "RUN 4: Playwright UI tests with SEED_DEFECT=all (defects 1-4)", cmd: "npx playwright test", seed: "all", expectFailed: 4 },
];

// count failed tests in the output
function failedCount(text) {
  const m = text.match(/Tests\s+(\d+) failed/) || text.match(/^\s*(\d+) failed\s*$/m);
  return m ? Number(m[1]) : 0;
}

const summary = [];
for (const run of runs) {
  console.log(`\n===== ${run.name} =====`);
  fs.appendFileSync(OUT, `\n===== ${run.name} =====\n`);
  fs.appendFileSync(LOG, `===== ${run.name} =====\n`);

  const result = spawnSync(run.cmd, {
    shell: true,
    encoding: "utf8",
    env: { ...process.env, SEED_DEFECT: run.seed, FORCE_COLOR: "0" },
  });
  // remove color codes
  const text = (result.stdout + result.stderr).replace(/\x1b\[[0-9;]*m/g, "");
  process.stdout.write(text);
  fs.appendFileSync(OUT, text);

  const failed = failedCount(text);
  const ok = failed === run.expectFailed && (failed > 0 || result.status === 0);
  summary.push(`${ok ? "OK  " : "!!  "} ${run.name}: ${failed} failed (expected ${run.expectFailed})`);
}

// copy each failure into its defect folder
if (fs.existsSync("playwright-artifacts")) {
  for (const folder of fs.readdirSync("playwright-artifacts")) {
    const target = DEFECT_FOLDERS.find((d) => folder.includes(d.match));
    if (!target) continue;
    const dest = `test-results/${target.dir}`;
    fs.mkdirSync(dest, { recursive: true });
    for (const [from, to] of [["test-failed-1.png", "screenshot.png"], ["trace.zip", "trace.zip"],
                              ["error-context.md", "error-context.md"]]) {
      const src = `playwright-artifacts/${folder}/${from}`;
      if (fs.existsSync(src)) fs.copyFileSync(src, `${dest}/${to}`);
    }
  }
}

// also put one screenshot and trace at the top of test-results/
for (const f of ["screenshot.png", "trace.zip"]) {
  if (fs.existsSync(`test-results/defect-1/${f}`)) fs.copyFileSync(`test-results/defect-1/${f}`, `test-results/${f}`);
}

const footer = `\n===== SUMMARY =====\n${summary.join("\n")}\n`;
fs.appendFileSync(OUT, footer);
console.log(footer);
console.log("Saved: test-results/test-output.txt, server.log, screenshot.png, trace.zip, and defect-1 to defect-4 folders");
