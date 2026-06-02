/**
 * LP ショーケースページの数値を実コードベースから自動計測し JSON を stdout に出力する。
 * ビルド前に `bun run scripts/collect-stats.ts > src/browser/stats.generated.json` で実行。
 */

import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function exec(cmd: string): string {
  return execSync(cmd, { cwd: ROOT, encoding: "utf-8" }).trim();
}

function countTsLines(): number {
  const output = exec("find src -name '*.ts' | xargs wc -l");
  const last = output.split("\n").pop()!;
  return parseInt(last.trim().split(/\s+/)[0]!, 10);
}

function countTestRoms(): number {
  return parseInt(exec("find roms/test -name '*.nes' | wc -l"), 10);
}

interface CompatResult {
  pass: number;
  skip: number;
  total: number;
}

function countCompatTests(pattern: string): CompatResult {
  const testsDir = join(ROOT, "tests");
  const re = new RegExp(`^${pattern}[^0-9].*\\.test\\.ts$|^${pattern}\\.test\\.ts$`);
  const files = readdirSync(testsDir).filter((f) => re.test(f));
  let pass = 0;
  let skip = 0;
  for (const f of files) {
    const content = readFileSync(join(testsDir, f), "utf-8");
    const romTestPasses = (content.match(/romTest\(/g) || []).length;
    const romTestSkips = (content.match(/romTest\.skip\(/g) || []).length;
    pass += romTestPasses;
    skip += romTestSkips;
  }
  return { pass, skip, total: pass + skip };
}

function countOpcodes(): {
  implemented: number;
  official: number;
  unofficial: number;
} {
  const content = readFileSync(
    join(ROOT, "src/core/cpu/opcodes.ts"),
    "utf-8",
  );
  const blocks = content.split(/(?=^def\()/gm).filter((b) =>
    b.startsWith("def("),
  );
  const implemented = blocks.length;
  let unofficial = 0;
  for (const block of blocks) {
    const nameMatch = block.match(/name:\s*"(\*?)/);
    if (nameMatch && nameMatch[1] === "*") unofficial++;
  }
  return { implemented, official: implemented - unofficial, unofficial };
}

function countMappers(): number {
  const content = readFileSync(
    join(ROOT, "src/core/mappers/mapper.ts"),
    "utf-8",
  );
  const funcMatch = content.match(
    /export function createMapper[\s\S]*?^}/m,
  );
  if (!funcMatch) return 0;
  return (funcMatch[0].match(/case \d+:/g) || []).length;
}

function countDenyListRepos(): number {
  const content = readFileSync(
    join(ROOT, ".claude/hooks/pre-tool-use.sh"),
    "utf-8",
  );
  const blockSection = content.match(
    /for blocked_repo in\s*\\([\s\S]*?);/,
  );
  if (!blockSection) return 0;
  return (blockSection[1]!.match(/"[^"]+"/g) || []).length;
}

function getTestStats(): {
  pass: number;
  skip: number;
  fail: number;
  expects: number;
} {
  const output = exec("bun test 2>&1");
  const passMatch = output.match(/(\d+) pass/);
  const skipMatch = output.match(/(\d+) skip/);
  const failMatch = output.match(/(\d+) fail/);
  const expectMatch = output.match(/(\d+) expect\(\)/);
  return {
    pass: passMatch ? parseInt(passMatch[1]!, 10) : 0,
    skip: skipMatch ? parseInt(skipMatch[1]!, 10) : 0,
    fail: failMatch ? parseInt(failMatch[1]!, 10) : 0,
    expects: expectMatch ? parseInt(expectMatch[1]!, 10) : 0,
  };
}

function getTraceLines(): number {
  const content = readFileSync(
    join(ROOT, "tests/cpu_nestest_trace.test.ts"),
    "utf-8",
  );
  const match = content.match(/TRACE_LINES\s*=\s*(\d+)/);
  return match ? parseInt(match[1]!, 10) : 0;
}

// --- メイン ---
const testStats = getTestStats();
const opcodes = countOpcodes();
const romTotal = countTestRoms();

const compatCpu = countCompatTests("compat_cpu_");
const compatApu = countCompatTests("compat_apu");
const compatMapper1 = countCompatTests("compat_mapper1");
const compatMapper4 = countCompatTests("compat_mapper4");
const compatMapper0 = countCompatTests("compat_mapper0");
const compatMisc = countCompatTests("compat_misc");

const romPassCpu = compatCpu.pass;
const romPassPpu = compatMapper0.pass;
const romPassApu = compatApu.pass;
const romPassMapper = compatMapper1.pass + compatMapper4.pass;
const romPassOthers = compatMisc.pass;
const romPassTotal =
  romPassCpu + romPassPpu + romPassApu + romPassMapper + romPassOthers;
const romRemaining = romTotal - romPassTotal;

const stats = {
  tsLines: countTsLines(),
  testPass: testStats.pass,
  testSkip: testStats.skip,
  testFail: testStats.fail,
  expects: testStats.expects,
  traceLines: getTraceLines(),
  opcodesImplemented: opcodes.implemented,
  opcodesTotal: 256,
  opcodesOfficial: opcodes.official,
  opcodesUnofficial: opcodes.unofficial,
  mapperCount: countMappers(),
  romTotal,
  romPassTotal,
  romPassCpu,
  romPassPpu,
  romPassApu,
  romPassMapper,
  romPassOthers,
  romRemaining,
  denyListRepos: countDenyListRepos(),
  opcodesPercent: Math.round((opcodes.implemented / 256) * 100),
  stuckTimeoutMin: 30,
  saveSlots: 4,
};

console.log(JSON.stringify(stats, null, 2));
