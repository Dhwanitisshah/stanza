// The quality gate: typecheck, lint, test, build, in that order, stopping at the first failure.
//   npm run verify
// Plain Node on purpose (it replaced a PowerShell script), so the same command runs on a Windows laptop, a Mac
// and the Linux machine that runs CI and Vercel builds.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const STEPS = ["typecheck", "lint", "test", "build"];

const colour = (code, text) => (process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text);

for (const step of STEPS) {
  console.log(`\n${colour(36, `>>> npm run ${step}`)}`);
  // shell: true so that "npm" resolves to npm.cmd on Windows
  const { status } = spawnSync("npm", ["run", step], { cwd: root, stdio: "inherit", shell: true });
  if (status !== 0) {
    console.log(colour(31, `FAIL  ${step}`));
    process.exit(1);
  }
  console.log(colour(32, `PASS  ${step}`));
}

console.log(`\n${colour(32, "ALL STEPS PASSED")}`);
