type Locale = "en" | "ja" | "zh";

interface Translations {
  nav: { github: string };
  kv: {
    headline: string;
    sub: string;
    typewriterPrefix: string;
    typewriterWords: string[];
  };
  emulator: {
    title: string;
    romSelect: string;
    status: string;
    helpToggle: string;
    helpToggleClose: string;
    keyboard1p: string;
    keyboard2p: string;
    gamepad: string;
    other: string;
    direction: string;
    fullscreen: string;
    save: string;
    load: string;
    dropText: string;
    saveBanner: string;
    deleteSave: string;
  };
  quality: {
    sectionLabel: string;
    headline: string;
    subtitle: string;
    cpuLabel: string;
    cpuDesc: string;
    ppuLabel: string;
    ppuDesc: string;
    apuLabel: string;
    apuDesc: string;
    mapperLabel: string;
    mapperDesc: string;
    testLabel: string;
    testDesc: string;
    assertLabel: string;
    assertDesc: string;
    nestestLabel: string;
    nestestDesc: string;
    romLabel: string;
    romDesc: string;
    sourceLabel: string;
    sourceDesc: string;
    depsLabel: string;
    depsDesc: string;
  };
  harness: {
    sectionLabel: string;
    headline: string;
    subtitle: string;
    revealLine: string;
    storyTitle: string;
    storyIntro: string;
    day12Desc: string;
    day3Desc: string;
    day4Desc: string;
    day56Desc: string;
    day7Desc: string;
    day8Desc: string;
    loopTitle: string;
    loopDesc: string;
    prsLabel: string;
    issuesLabel: string;
    daysLabel: string;
    nesPrsLabel: string;
    harnessPrsLabel: string;
    oracleTitle: string;
    oracleItems: string[];
    denyTitle: string;
    denyDesc: string;
    enforceDesc: string;
    wipNote: string;
  };
  footer: {
    license: string;
    builtWith: string;
  };
}

const en: Translations = {
  nav: { github: "GitHub" },
  kv: {
    headline: "nightowl-nes",
    sub: "A NES emulator, built from scratch in TypeScript.\nZero runtime dependencies. Zero lines of human code.",
    typewriterPrefix: "Just the ",
    typewriterWords: ["specs.", "AI.", "loop."],
  },
  emulator: {
    title: "Play",
    romSelect: "Select ROM (.nes)",
    status: "Drop or select a .nes ROM to begin",
    helpToggle: "Controls ▼",
    helpToggleClose: "Controls ▲",
    keyboard1p: "1P Keyboard",
    keyboard2p: "2P Keyboard",
    gamepad: "Gamepad",
    other: "Other",
    direction: "D-Pad",
    fullscreen: "Fullscreen",
    save: "Save (Slot 1~4)",
    load: "Load (Slot 1~4)",
    dropText: "Drop a .nes file here",
    saveBanner: "💾 Save data found ",
    deleteSave: "Delete save",
  },
  quality: {
    sectionLabel: "Precision",
    headline: "Every opcode. Every scanline. Every channel.",
    subtitle: "4,237 lines of TypeScript. 1,572 tests. Zero runtime dependencies. Verified against the NES hardware specification.",
    cpuLabel: "CPU",
    cpuDesc: "216 of 256 opcodes — 151 official + 65 unofficial — implemented from the 6502 specification alone.",
    ppuLabel: "PPU",
    ppuDesc: "Background + sprite rendering, loopy scroll registers, Sprite 0 Hit detection, scanline-accurate timing.",
    apuLabel: "APU",
    apuDesc: "All 5 channels — two Pulse, Triangle, Noise, DMC — with non-linear mixing.",
    mapperLabel: "Mappers",
    mapperDesc: "20 mappers covering ~85–90% of the commercial NES library.",
    testLabel: "Tests",
    testDesc: "1,572 pass / 6 skip / 0 fail. CI on every commit.",
    assertLabel: "Assertions",
    assertDesc: "217,919 expect() calls verifying correctness at opcode, register, and pixel level.",
    nestestLabel: "nestest",
    nestestDesc: "The gold-standard CPU verification ROM. 8,991 trace lines matched. Passed.",
    romLabel: "Test ROMs",
    romDesc: "81 of 263 ROMs from nes-test-roms. CPU 24 / PPU 33 / APU 14 / Mapper 7 / others 3. 182 still to go.",
    sourceLabel: "Source",
    sourceDesc: "4,237 lines of TypeScript. Not a line more than needed.",
    depsLabel: "Dependencies",
    depsDesc: "Zero runtime dependencies. TypeScript, Vite, and Vitest are dev-only.",
  },
  harness: {
    sectionLabel: "The Harness",
    headline: "Zero lines of human-written code.",
    subtitle: "Everything you just played was built by Claude Code — running a self-driving loop that executes the full GitHub Flow without human intervention. The emulator is what you see. The harness is why it exists.",
    revealLine: "The human seeds Issues and reviews in the morning. The machine does everything else.",
    storyTitle: "8 Days",
    storyIntro: "The first four days were almost entirely about the harness. Getting an AI to run a sustainable development loop — branching, committing, opening PRs, reviewing its own code, merging, and picking up the next Issue — turned out to be the hardest part.",
    day12Desc: "CPU skeleton and first loop attempts. The harness crashed, lost context, couldn't recover. Broken PRs every morning.",
    day3Desc: "Zero NES code. The entire day spent on the harness — surviving context resets, retrying from failures, automatic Issue pickup.",
    day4Desc: "The biggest rewrite: 13 harness PRs. Stop hooks, auto-recovery, bot reviewer identity, stuck protocol. The machinery for everything that followed.",
    day56Desc: "nestest trace passed. PPU rendering came alive. APU producing sound. The loop was starting to hold.",
    day7Desc: "26 NES issues closed in a single day. The harness worked — Issue → Branch → PR → Review → Merge, on repeat until the queue was empty.",
    day8Desc: "Zero harness PRs. Just NES. The loop ran all night without intervention.",
    loopTitle: "The Self-Driving Loop",
    loopDesc: "Shell scripts and event-driven hooks orchestrate the cycle: worker completes Issue → writes flag → Stop hook fires → loop-helper runs /clear → fresh session picks up next open Issue. Code review runs 7-angle finders under a bot identity. Stuck protocol drafts PRs back after 30 min. Auto-recover restarts from crashes.",
    prsLabel: "merged PRs",
    issuesLabel: "Issues closed",
    daysLabel: "days",
    nesPrsLabel: "NES",
    harnessPrsLabel: "Harness",
    oracleTitle: "Allowed References",
    oracleItems: [
      "nesdev.org wiki — NES hardware documentation",
      "6502 instruction set specification",
      "iNES / NES 2.0 header format",
      "nes-test-roms (submodule) — test ROMs",
    ],
    denyTitle: "Denied References",
    denyDesc: "All existing NES emulator source code — 16 known repositories, any language, any license.",
    enforceDesc: "Pre-tool-use hooks block WebFetch URLs matching the deny list. A structural constraint, not an airtight seal — WebSearch results and local files are not blocked.",
    wipNote: "81 of 263 test ROMs passing. 182 still to go. This project is under active development.",
  },
  footer: {
    license: "MIT License",
    builtWith: "Built autonomously with Claude Code",
  },
};

const ja: Translations = {
  nav: { github: "GitHub" },
  kv: {
    headline: "nightowl-nes",
    sub: "A NES emulator, built from scratch in TypeScript.\nZero runtime dependencies. Zero lines of human code.",
    typewriterPrefix: "Just the ",
    typewriterWords: ["specs.", "AI.", "loop."],
  },
  emulator: {
    title: "プレイ",
    romSelect: "ROM を選択 (.nes)",
    status: "ROM を読み込んでください（ファイル選択またはドラッグ＆ドロップ）",
    helpToggle: "操作ヘルプ ▼",
    helpToggleClose: "操作ヘルプ ▲",
    keyboard1p: "1P キーボード",
    keyboard2p: "2P キーボード",
    gamepad: "ゲームパッド",
    other: "その他",
    direction: "方向",
    fullscreen: "フルスクリーン",
    save: "セーブ (Slot 1~4)",
    load: "ロード (Slot 1~4)",
    dropText: ".nes ファイルをドロップしてください",
    saveBanner: "💾 セーブデータあり ",
    deleteSave: "セーブ削除",
  },
  quality: {
    sectionLabel: "精度",
    headline: "全オプコード。全スキャンライン。全チャンネル。",
    subtitle: "TypeScript 4,237行。テスト 1,572本。ランタイム依存ゼロ。NES ハードウェア仕様に照らして検証済み。",
    cpuLabel: "CPU",
    cpuDesc: "256オプコード中216実装 — 公式151 + 非公式65 — 6502仕様書のみから実装。",
    ppuLabel: "PPU",
    ppuDesc: "背景 + スプライト描画、loopy スクロールレジスタ、Sprite 0 Hit 検出、スキャンライン精度タイミング。",
    apuLabel: "APU",
    apuDesc: "全5チャンネル — Pulse×2、Triangle、Noise、DMC — 非線形ミキシング。",
    mapperLabel: "マッパー",
    mapperDesc: "20種のマッパーで商用 NES ライブラリの約85〜90%をカバー。",
    testLabel: "テスト",
    testDesc: "1,572 pass / 6 skip / 0 fail。毎コミット CI で検証。",
    assertLabel: "アサーション",
    assertDesc: "217,919回の expect() でオプコード・レジスタ・ピクセルレベルの正確性を検証。",
    nestestLabel: "nestest",
    nestestDesc: "CPU 検証の最高基準 ROM。8,991行のトレースを照合。合格。",
    romLabel: "テスト ROM",
    romDesc: "nes-test-roms から263個中81個を使用。CPU 24 / PPU 33 / APU 14 / Mapper 7 / その他 3。残り182。",
    sourceLabel: "ソース",
    sourceDesc: "TypeScript 4,237行。必要以上に1行も多くない。",
    depsLabel: "依存",
    depsDesc: "ランタイム依存ゼロ。TypeScript・Vite・Vitest は開発時のみ。",
  },
  harness: {
    sectionLabel: "ハーネス",
    headline: "人間が書いたコードは、ゼロ行。",
    subtitle: "いま触ったエミュレータは、Claude Code が自走ループで GitHub Flow を回して作った。エミュレータは見える成果物。ハーネスが、それを存在させた理由。",
    revealLine: "人間は Issue を立てて、朝レビューするだけ。あとは全部マシンがやる。",
    storyTitle: "8日間",
    storyIntro: "最初の4日間は、ほぼ全てをハーネスに費やした。AI に持続可能な開発ループを回させること——ブランチを切り、コミットし、PR を開き、自分のコードをレビューし、マージし、次の Issue を拾う。それが一番難しかった。",
    day12Desc: "CPU の骨格と最初のループ試行。ハーネスはクラッシュし、コンテキストを失い、復旧できなかった。",
    day3Desc: "NES コードはゼロ行。丸一日ハーネスだけ——コンテキストリセットの生存、障害からのリトライ、次の Issue の自動取得。",
    day4Desc: "最大のハーネス改修日 — PR 13本。Stop hook、自動復旧、bot レビュアー、stuck プロトコル。以降の全てを支える機構。",
    day56Desc: "nestest トレース合格。PPU 描画が動き出した。APU が音を出し始めた。ループが安定してきた。",
    day7Desc: "1日で NES Issue を26本消化。ハーネスが回った——Issue → Branch → PR → Review → Merge をキューが空になるまで繰り返した。",
    day8Desc: "ハーネス PR はゼロ。NES だけ。ループは一晩中、介入なしで回り続けた。",
    loopTitle: "自走ループ",
    loopDesc: "シェルスクリプトとイベント駆動 hook がサイクルを回す——ワーカーが Issue を完了 → フラグ書込 → Stop hook 検出 → loop-helper が /clear → 新セッションが次の open Issue を取得。コードレビューは bot 名義で7角度の finder を実行。stuck プロトコルで30分停滞を検出。auto-recover でクラッシュから自動復旧。",
    prsLabel: "merged PRs",
    issuesLabel: "Issues closed",
    daysLabel: "日間",
    nesPrsLabel: "NES",
    harnessPrsLabel: "Harness",
    oracleTitle: "参照 OK",
    oracleItems: [
      "nesdev.org wiki — NES ハードウェアドキュメント",
      "6502 命令セット仕様書",
      "iNES / NES 2.0 ヘッダフォーマット",
      "nes-test-roms (submodule) — テスト ROM",
    ],
    denyTitle: "参照 NG",
    denyDesc: "既存 NES エミュレータのソースコード全て — 16リポジトリ、言語・ライセンス不問。",
    enforceDesc: "pre-tool-use hooks が deny list の WebFetch URL をブロック。構造的な制約であり、完全な遮断ではない——WebSearch 結果やローカルファイルはブロックされない。",
    wipNote: "263個中81個のテスト ROM が合格。残り182個。このプロジェクトは開発中。",
  },
  footer: {
    license: "MIT License",
    builtWith: "Claude Code による自律開発",
  },
};

const zh: Translations = {
  nav: { github: "GitHub" },
  kv: {
    headline: "nightowl-nes",
    sub: "A NES emulator, built from scratch in TypeScript.\nZero runtime dependencies. Zero lines of human code.",
    typewriterPrefix: "Just the ",
    typewriterWords: ["specs.", "AI.", "loop."],
  },
  emulator: {
    title: "游玩",
    romSelect: "选择 ROM (.nes)",
    status: "拖放或选择 .nes ROM 文件开始",
    helpToggle: "操作帮助 ▼",
    helpToggleClose: "操作帮助 ▲",
    keyboard1p: "1P 键盘",
    keyboard2p: "2P 键盘",
    gamepad: "手柄",
    other: "其他",
    direction: "方向",
    fullscreen: "全屏",
    save: "保存 (Slot 1~4)",
    load: "读取 (Slot 1~4)",
    dropText: "将 .nes 文件拖放到此处",
    saveBanner: "💾 已找到存档数据 ",
    deleteSave: "删除存档",
  },
  quality: {
    sectionLabel: "精度",
    headline: "每个操作码。每条扫描线。每个通道。",
    subtitle: "4,237行 TypeScript。1,572项测试。零运行时依赖。经 NES 硬件规范验证。",
    cpuLabel: "CPU",
    cpuDesc: "256个操作码中实现216个 — 官方151 + 非官方65 — 仅依据6502规范实现。",
    ppuLabel: "PPU",
    ppuDesc: "背景 + 精灵渲染、loopy滚动寄存器、Sprite 0 Hit检测、扫描线精确时序。",
    apuLabel: "APU",
    apuDesc: "全部5个通道 — Pulse×2、Triangle、Noise、DMC — 非线性混音。",
    mapperLabel: "映射器",
    mapperDesc: "20种映射器，覆盖约85–90%的商用NES游戏库。",
    testLabel: "测试",
    testDesc: "1,572通过 / 6跳过 / 0失败。每次提交均通过 CI 验证。",
    assertLabel: "断言",
    assertDesc: "217,919次expect()调用，在操作码、寄存器和像素级别验证正确性。",
    nestestLabel: "nestest",
    nestestDesc: "CPU验证黄金标准ROM。8,991行追踪比对。通过。",
    romLabel: "测试 ROM",
    romDesc: "使用 nes-test-roms 中263个ROM中的81个。CPU 24 / PPU 33 / APU 14 / Mapper 7 / 其他 3。剩余182个。",
    sourceLabel: "源码",
    sourceDesc: "4,237行TypeScript。不多一行。",
    depsLabel: "依赖",
    depsDesc: "零运行时依赖。TypeScript、Vite、Vitest仅用于开发。",
  },
  harness: {
    sectionLabel: "线束",
    headline: "人类编写的代码：零行。",
    subtitle: "你刚刚体验的模拟器，由 Claude Code 通过自驱动循环执行 GitHub Flow 构建。模拟器是看得见的成果。线束是它存在的原因。",
    revealLine: "人类创建 Issue，早上做代码审查。其余全部由机器完成。",
    storyTitle: "8天",
    storyIntro: "前四天几乎全部投入在线束上。让AI运行一个可持续的开发循环——创建分支、提交、开PR、审查自己的代码、合并、获取下一个Issue——是最困难的部分。",
    day12Desc: "CPU骨架和首次循环尝试。线束崩溃、丢失上下文、无法恢复。",
    day3Desc: "NES代码零行。整天只做线束——上下文重置存活、故障重试、自动获取下一个Issue。",
    day4Desc: "最大的线束改写日——13个PR。Stop hook、自动恢复、bot审查者、卡住协议。支撑后续一切的机制。",
    day56Desc: "nestest追踪通过。PPU渲染启动。APU开始出声。循环趋于稳定。",
    day7Desc: "一天内解决26个NES Issue。线束运转了——Issue → Branch → PR → Review → Merge，重复直到队列清空。",
    day8Desc: "线束PR为零。只有NES。循环整夜运行，无需干预。",
    loopTitle: "自驱动循环",
    loopDesc: "Shell脚本和事件驱动hook编排周期——工作者完成Issue → 写入标志 → Stop hook触发 → loop-helper执行/clear → 新会话获取下一个open Issue。代码审查以bot身份运行7角度finder。stuck协议在30分钟无进展后退回draft。auto-recover从崩溃中自动恢复。",
    prsLabel: "merged PRs",
    issuesLabel: "Issues closed",
    daysLabel: "天",
    nesPrsLabel: "NES",
    harnessPrsLabel: "Harness",
    oracleTitle: "允许参考",
    oracleItems: [
      "nesdev.org wiki — NES硬件文档",
      "6502指令集规范",
      "iNES / NES 2.0头格式",
      "nes-test-roms (submodule) — 测试ROM",
    ],
    denyTitle: "禁止参考",
    denyDesc: "所有现有NES模拟器源代码 — 16个已知仓库，不限语言、不限许可证。",
    enforceDesc: "pre-tool-use hooks阻止deny list中的WebFetch URL。结构性约束，非完全封锁——WebSearch结果和本地文件不会被阻止。",
    wipNote: "263个测试ROM中81个通过。剩余182个。本项目正在积极开发中。",
  },
  footer: {
    license: "MIT License",
    builtWith: "由 Claude Code 自主构建",
  },
};

const translations: Record<Locale, Translations> = { en, ja, zh };

const STORAGE_KEY = "nightowl-nes-locale";

function getDefaultLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "ja" || saved === "zh") return saved;
  } catch {
    // localStorage が使えない環境（Safari プライベート等）
  }
  const lang = navigator.language.toLowerCase();
  if (lang.startsWith("ja")) return "ja";
  if (lang.startsWith("zh")) return "zh";
  return "en";
}

let currentLocale: Locale = getDefaultLocale();
const listeners: Array<(locale: Locale) => void> = [];

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
  try { localStorage.setItem(STORAGE_KEY, locale); } catch { /* noop */ }
  for (const fn of listeners) fn(locale);
}

export function onLocaleChange(fn: (locale: Locale) => void): void {
  listeners.push(fn);
}

export function t(): Translations {
  return translations[currentLocale];
}

export type { Locale };
