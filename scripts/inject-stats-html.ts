/**
 * stats.generated.json の値を index.html のフォールバックテキスト・OGP メタタグに注入する。
 * prebuild で collect-stats.ts の後に実行。
 *
 * data-stat / data-stat-total / data-stat-percent 属性で要素を特定するため、
 * 値が変わっても idempotent に動作する。
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const statsPath = resolve(ROOT, "src/browser/stats.generated.json");
const htmlPath = resolve(ROOT, "src/browser/index.html");

const stats: Record<string, number> = JSON.parse(
  readFileSync(statsPath, "utf-8"),
);

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

let html = readFileSync(htmlPath, "utf-8");

// --- OGP / meta description (安定パターンでマッチ) ---
html = html.replace(
  /I never read the NES code\. I just kept the loop alive\. [\d,]+ lines of TypeScript/g,
  `I never read the NES code. I just kept the loop alive. ${fmt(stats["tsLines"]!)} lines of TypeScript`,
);

// --- data-stat → data-target (カウンターアニメーション値) ---
html = html.replace(
  /data-stat="(\w+)"\s+data-target="\d+"/g,
  (_match, key: string) => {
    const val = stats[key];
    return val !== undefined
      ? `data-stat="${key}" data-target="${val}"`
      : _match;
  },
);

// --- data-stat-total → /NNN (分母テキスト) ---
html = html.replace(
  /data-stat-total="(\w+)">[^<]*/g,
  (_match, key: string) => {
    const val = stats[key];
    return val !== undefined ? `data-stat-total="${key}">/${val}` : _match;
  },
);

// --- data-stat-percent → data-percent (プログレスバー) ---
html = html.replace(
  /data-stat-percent="(\w+)"\s+data-percent="\d+"/g,
  (_match, key: string) => {
    const val = stats[key];
    return val !== undefined
      ? `data-stat-percent="${key}" data-percent="${val}"`
      : _match;
  },
);

// --- data-i18n フォールバックテキスト (en のみ) ---
const i18nFallbacks: Record<string, string> = {
  "quality.subtitle": `${fmt(stats["tsLines"]!)} lines of TypeScript. ${fmt(stats["testPass"]!)} tests. Zero runtime dependencies. Verified against the NES hardware specification.`,
  "quality.cpuDesc": `${fmt(stats["opcodesImplemented"]!)} of ${fmt(stats["opcodesTotal"]!)} opcodes — ${fmt(stats["opcodesOfficial"]!)} official + ${fmt(stats["opcodesUnofficial"]!)} unofficial — implemented from the 6502 specification alone.`,
  "quality.mapperDesc": `${fmt(stats["mapperCount"]!)} mappers covering ~85–90% of the commercial NES library.`,
  "quality.testDesc": `${fmt(stats["testPass"]!)} pass / ${fmt(stats["testSkip"]!)} skip / ${fmt(stats["testFail"]!)} fail. CI on every commit.`,
  "quality.assertDesc": `${fmt(stats["expects"]!)} expect() calls verifying correctness at opcode, register, and pixel level.`,
  "quality.nestestDesc": `The gold-standard CPU verification ROM. ${fmt(stats["traceLines"]!)} trace lines matched. Passed.`,
  "quality.romDesc": `${fmt(stats["romPassTotal"]!)} of ${fmt(stats["romTotal"]!)} ROMs from nes-test-roms. CPU ${fmt(stats["romPassCpu"]!)} / PPU ${fmt(stats["romPassPpu"]!)} / APU ${fmt(stats["romPassApu"]!)} / Mapper ${fmt(stats["romPassMapper"]!)} / others ${fmt(stats["romPassOthers"]!)}. ${fmt(stats["romRemaining"]!)} still to go.`,
  "quality.sourceDesc": `${fmt(stats["tsLines"]!)} lines of TypeScript. Not a line more than needed.`,
  "harness.denyDesc": `All existing NES emulator source code — ${fmt(stats["denyListRepos"]!)} known repositories, any language, any license.`,
  "harness.wipNote": `${fmt(stats["romPassTotal"]!)} of ${fmt(stats["romTotal"]!)} test ROMs passing. ${fmt(stats["romRemaining"]!)} still to go. This project is under active development.`,
};

for (const [key, text] of Object.entries(i18nFallbacks)) {
  const escaped = key.replace(/\./g, "\\.");
  const re = new RegExp(
    `(<[^>]+data-i18n="${escaped}"[^>]*>)[\\s\\S]*?(<\\/[a-z]+>)`,
  );
  html = html.replace(re, `$1${text}$2`);
}

writeFileSync(htmlPath, html);
