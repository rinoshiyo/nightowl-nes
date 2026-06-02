/**
 * stats.generated.json の値を index.html のフォールバックテキスト・OGP メタタグに注入する。
 * prebuild で collect-stats.ts の後に実行。
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const statsPath = resolve(ROOT, "src/browser/stats.generated.json");
const htmlPath = resolve(ROOT, "src/browser/index.html");

const stats = JSON.parse(readFileSync(statsPath, "utf-8"));

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

let html = readFileSync(htmlPath, "utf-8");

const descOld = /I never read the NES code\. I just kept the loop alive\. [\d,]+ lines of TypeScript/g;
html = html.replace(
  descOld,
  `I never read the NES code. I just kept the loop alive. ${fmt(stats.tsLines)} lines of TypeScript`,
);

const replacements: Array<[RegExp, string]> = [
  // quality.subtitle fallback
  [
    /(<p[^>]*data-i18n="quality\.subtitle"[^>]*>)[\s\S]*?(<\/p>)/,
    `$1${fmt(stats.tsLines)} lines of TypeScript. ${fmt(stats.testPass)} tests. Zero runtime dependencies. Verified against the NES hardware specification.$2`,
  ],
  // CPU stat-value data-target + stat-total
  [
    /(<span class="counter" data-target=")216(")/,
    `$1${stats.opcodesImplemented}$2`,
  ],
  [
    /(<div class="stat-desc" data-i18n="quality\.cpuDesc">)[\s\S]*?(<\/div>)/,
    `$1${fmt(stats.opcodesImplemented)} of ${fmt(stats.opcodesTotal)} opcodes — ${fmt(stats.opcodesOfficial)} official + ${fmt(stats.opcodesUnofficial)} unofficial — implemented from the 6502 specification alone.$2`,
  ],
  // CPU bar percent
  [
    /(<div class="stat-bar-fill" data-percent=")84(")/,
    `$1${Math.round((stats.opcodesImplemented / stats.opcodesTotal) * 100)}$2`,
  ],
  // Mappers data-target
  [
    /(<span class="counter" data-target=")20(")/,
    `$1${stats.mapperCount}$2`,
  ],
  [
    /(<div class="stat-desc" data-i18n="quality\.mapperDesc">)[\s\S]*?(<\/div>)/,
    `$1${fmt(stats.mapperCount)} mappers covering ~85–90% of the commercial NES library.$2`,
  ],
  // nestest data-target
  [
    /(<span class="counter" data-target=")8991(")/,
    `$1${stats.traceLines}$2`,
  ],
  [
    /(<div class="test-desc" data-i18n="quality\.nestestDesc">)[\s\S]*?(<\/div>)/,
    `$1The gold-standard CPU verification ROM. ${fmt(stats.traceLines)} trace lines matched. Passed.$2`,
  ],
  // Tests data-target
  [
    /(<span class="counter" data-target=")1572(")/,
    `$1${stats.testPass}$2`,
  ],
  [
    /(<div class="test-desc" data-i18n="quality\.testDesc">)[\s\S]*?(<\/div>)/,
    `$1${fmt(stats.testPass)} pass / ${fmt(stats.testSkip)} skip / ${fmt(stats.testFail)} fail. CI on every commit.$2`,
  ],
  // Assertions data-target
  [
    /(<span class="counter" data-target=")217919(")/,
    `$1${stats.expects}$2`,
  ],
  [
    /(<div class="test-desc" data-i18n="quality\.assertDesc">)[\s\S]*?(<\/div>)/,
    `$1${fmt(stats.expects)} expect() calls verifying correctness at opcode, register, and pixel level.$2`,
  ],
  // ROM data-target + total
  [
    /(<span class="counter" data-target=")81(")/,
    `$1${stats.romPassTotal}$2`,
  ],
  [
    /(<span class="meta-total">)\/263(<\/span>)/,
    `$1/${stats.romTotal}$2`,
  ],
  [
    /(<div class="meta-desc" data-i18n="quality\.romDesc">)[\s\S]*?(<\/div>)/,
    `$1${fmt(stats.romPassTotal)} of ${fmt(stats.romTotal)} ROMs from nes-test-roms. CPU ${fmt(stats.romPassCpu)} / PPU ${fmt(stats.romPassPpu)} / APU ${fmt(stats.romPassApu)} / Mapper ${fmt(stats.romPassMapper)} / others ${fmt(stats.romPassOthers)}. ${fmt(stats.romRemaining)} still to go.$2`,
  ],
  // Source data-target
  [
    /(<span class="counter" data-target=")4237(")/,
    `$1${stats.tsLines}$2`,
  ],
  [
    /(<div class="meta-desc" data-i18n="quality\.sourceDesc">)[\s\S]*?(<\/div>)/,
    `$1${fmt(stats.tsLines)} lines of TypeScript. Not a line more than needed.$2`,
  ],
  // Deny list
  [
    /(<p data-i18n="harness\.denyDesc">)[\s\S]*?(<\/p>)/,
    `$1All existing NES emulator source code — ${fmt(stats.denyListRepos)} known repositories, any language, any license.$2`,
  ],
  // WIP note
  [
    /(<p[^>]*data-i18n="harness\.wipNote"[^>]*>)[\s\S]*?(<\/p>)/,
    `$1${fmt(stats.romPassTotal)} of ${fmt(stats.romTotal)} test ROMs passing. ${fmt(stats.romRemaining)} still to go. This project is under active development.$2`,
  ],
];

for (const [pattern, replacement] of replacements) {
  html = html.replace(pattern, replacement);
}

writeFileSync(htmlPath, html);
