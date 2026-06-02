type Locale = "en" | "ja" | "zh";

interface Translations {
  nav: { github: string };
  kv: {
    headline: string;
    sub: string;
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
  };
  reveal: {
    sectionLabel: string;
    headline: string;
    subtitle: string;
    revealLine: string;
    loopTitle: string;
    loopDesc: string;
    nightsLabel: string;
    nightsDesc: string;
    oracleTitle: string;
    oracleItems: string[];
    denyTitle: string;
    denyDesc: string;
    enforceDesc: string;
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
    sub: "A NES emulator, built from scratch.\nNo existing code was ever referenced.",
    typewriterWords: ["specs.", "silicon.", "soul."],
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
    headline: "Every opcode. Every channel. Every scanline.",
    subtitle: "Not a proof of concept. A production-grade emulator with full hardware coverage and rigorous test infrastructure.",
    cpuLabel: "CPU",
    cpuDesc: "All 256 opcodes — 151 official + 105 unofficial — faithfully implemented from the 6502 specification alone.",
    ppuLabel: "PPU",
    ppuDesc: "Pixel-perfect rendering: Sprite 0 Hit detection, loopy scrolling, and scanline-accurate timing.",
    apuLabel: "APU",
    apuDesc: "All 5 audio channels with expansion audio support, delivering authentic 8-bit sound.",
    mapperLabel: "Mappers",
    mapperDesc: "20 mappers covering ~85–90% of the entire NES game library.",
    testLabel: "Tests",
    testDesc: "Comprehensive test suite with continuous integration.",
    assertLabel: "Assertions",
    assertDesc: "Individual verification points ensuring correctness at every level.",
    nestestLabel: "nestest",
    nestestDesc: "The gold-standard CPU test ROM — every instruction, every flag, every edge case. Passed.",
  },
  reveal: {
    sectionLabel: "The Experiment",
    headline: "Zero lines of human-written code.",
    subtitle: "Everything you just played was written by an AI that never saw another emulator.",
    revealLine: "No human wrote a single line. Not one function. Not one fix.",
    loopTitle: "Autonomous GitHub Flow",
    loopDesc: "Issue, branch, PR, code review, merge — every night, without human hands on the keyboard. Claude Code runs the full development cycle autonomously.",
    nightsLabel: "nights",
    nightsDesc: "Of continuous autonomous development. Human involvement: seeding Issues and morning code reviews.",
    oracleTitle: "Allowed References",
    oracleItems: [
      "nesdev.org wiki — NES hardware documentation",
      "6502 instruction set specification",
      "iNES / NES 2.0 header format",
    ],
    denyTitle: "Denied References",
    denyDesc: "All existing NES emulator source code — any language, any license. Structurally enforced.",
    enforceDesc: "Pre-tool-use hooks with a deny list prevent even accidental access to existing implementations.",
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
    sub: "スクラッチ実装の NES エミュレータ。\n既存のコードは一切参照していない。",
    typewriterWords: ["仕様.", "回路.", "魂."],
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
    headline: "全オプコード。全チャンネル。全スキャンライン。",
    subtitle: "概念実証ではない。完全なハードウェアカバレッジと厳格なテスト基盤を備えた本格エミュレータ。",
    cpuLabel: "CPU",
    cpuDesc: "256オプコード全実装 — 公式151 + 非公式105 — 6502仕様書のみから忠実に実装。",
    ppuLabel: "PPU",
    ppuDesc: "ピクセルパーフェクト描画: Sprite 0 Hit 検出、loopy スクロール、スキャンライン精度タイミング。",
    apuLabel: "APU",
    apuDesc: "5チャンネル全実装、拡張音源対応。本物の8ビットサウンドを再現。",
    mapperLabel: "マッパー",
    mapperDesc: "20マッパー対応 — NES ゲームライブラリの約85〜90%をカバー。",
    testLabel: "テスト",
    testDesc: "CI 統合された包括的テストスイート。",
    assertLabel: "アサーション",
    assertDesc: "あらゆるレベルで正確性を保証する個別検証ポイント。",
    nestestLabel: "nestest",
    nestestDesc: "CPU テストの最高基準 ROM — 全命令、全フラグ、全エッジケース。合格。",
  },
  reveal: {
    sectionLabel: "実験",
    headline: "人間が書いたコードは、ゼロ行。",
    subtitle: "いま触ったエミュレータは、既存の実装を一切見ていない AI が書いた。",
    revealLine: "人間が書いたコードは一行もない。関数ひとつ。修正ひとつ。すべて AI。",
    loopTitle: "自律 GitHub Flow",
    loopDesc: "Issue、ブランチ、PR、コードレビュー、マージ — 毎晩、人間がキーボードに触れることなく。Claude Code が開発サイクル全体を自律的に実行。",
    nightsLabel: "夜",
    nightsDesc: "継続的な自律開発の実績。人間の関与は Issue のシードと朝のコードレビューのみ。",
    oracleTitle: "参照OK",
    oracleItems: [
      "nesdev.org wiki — NES ハードウェアドキュメント",
      "6502 命令セット仕様書",
      "iNES / NES 2.0 ヘッダフォーマット",
    ],
    denyTitle: "参照NG",
    denyDesc: "既存 NES エミュレータのソースコード全て — 言語・ライセンス不問。構造的に強制。",
    enforceDesc: "pre-tool-use hooks の deny list により、既存実装への偶発的なアクセスすら防止。",
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
    sub: "从零构建的 NES 模拟器。\n从未参考任何现有代码。",
    typewriterWords: ["规格.", "芯片.", "灵魂."],
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
    headline: "每个操作码。每个通道。每条扫描线。",
    subtitle: "不是概念验证，而是具备完整硬件覆盖和严格测试体系的生产级模拟器。",
    cpuLabel: "CPU",
    cpuDesc: "全部256个操作码 — 官方151 + 非官方105 — 仅从6502规范忠实实现。",
    ppuLabel: "PPU",
    ppuDesc: "像素级完美渲染: Sprite 0 Hit 检测、loopy 滚动、扫描线精确时序。",
    apuLabel: "APU",
    apuDesc: "全部5个音频通道，支持扩展音源，还原正宗8位音效。",
    mapperLabel: "映射器",
    mapperDesc: "支持20种映射器 — 覆盖约85-90%的NES游戏库。",
    testLabel: "测试",
    testDesc: "集成持续集成的全面测试套件。",
    assertLabel: "断言",
    assertDesc: "在每个层级确保正确性的独立验证点。",
    nestestLabel: "nestest",
    nestestDesc: "CPU 测试的黄金标准 ROM — 每条指令、每个标志、每个边界情况。通过。",
  },
  reveal: {
    sectionLabel: "实验",
    headline: "人类编写的代码：零行。",
    subtitle: "你刚刚体验的模拟器，由一个从未见过其他模拟器的 AI 编写。",
    revealLine: "没有一行人类代码。没有一个函数。没有一次修复。全部由 AI 完成。",
    loopTitle: "自主 GitHub Flow",
    loopDesc: "Issue、分支、PR、代码审查、合并 — 每晚自动运行，无需人类触碰键盘。Claude Code 自主执行完整开发周期。",
    nightsLabel: "夜",
    nightsDesc: "持续自主开发的实绩。人类参与仅限于创建 Issue 和每日代码审查。",
    oracleTitle: "允许参考",
    oracleItems: [
      "nesdev.org wiki — NES 硬件文档",
      "6502 指令集规范",
      "iNES / NES 2.0 头格式",
    ],
    denyTitle: "禁止参考",
    denyDesc: "所有现有 NES 模拟器源代码 — 不限语言、不限许可证。结构性强制执行。",
    enforceDesc: "通过 pre-tool-use hooks 的 deny list，防止对现有实现的任何访问。",
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
