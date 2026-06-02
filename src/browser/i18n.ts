type Locale = "en" | "ja" | "zh";

interface Translations {
  nav: { github: string };
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
  about: {
    title: string;
    subtitle: string;
    desc1: string;
    desc2: string;
    desc3: string;
  };
  constraints: {
    title: string;
    subtitle: string;
    oracleTitle: string;
    oracleItems: string[];
    denyTitle: string;
    denyDesc: string;
    enforceDesc: string;
  };
  compat: {
    title: string;
    subtitle: string;
    cpu: string;
    cpuDesc: string;
    ppu: string;
    ppuDesc: string;
    apu: string;
    apuDesc: string;
    mapper: string;
    mapperDesc: string;
  };
  tests: {
    title: string;
    subtitle: string;
    nestest: string;
    nestestDesc: string;
    unit: string;
    unitDesc: string;
    expects: string;
    expectsDesc: string;
  };
  footer: {
    license: string;
    builtWith: string;
  };
}

const en: Translations = {
  nav: { github: "GitHub" },
  emulator: {
    title: "Emulator",
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
  about: {
    title: "About",
    subtitle: "An AI-built NES emulator that never looked at existing code",
    desc1: "Built with Claude Code's autonomous loop: GitHub Flow (Issue → Branch → PR → Review → Merge) running continuously without human intervention.",
    desc2: "Human involvement is limited to seeding Issues and morning code reviews.",
    desc3: "60+ nights of continuous autonomous development.",
  },
  constraints: {
    title: "Constraints",
    subtitle: "The rules that define this experiment",
    oracleTitle: "Allowed References (Oracle)",
    oracleItems: [
      "nesdev.org wiki (NES hardware docs)",
      "6502 instruction set specification",
      "iNES / NES 2.0 header format",
    ],
    denyTitle: "Denied References",
    denyDesc: "All existing NES emulator source code — any language, any license. No peeking, no snippets.",
    enforceDesc: "Structurally enforced via pre-tool-use hooks with a deny list.",
  },
  compat: {
    title: "Compatibility",
    subtitle: "What's implemented",
    cpu: "CPU",
    cpuDesc: "opcodes (official 151 + unofficial 105)",
    ppu: "PPU",
    ppuDesc: "Full implementation (Sprite 0 Hit, loopy scroll, scanline timing)",
    apu: "APU",
    apuDesc: "channels + expansion audio support",
    mapper: "Mappers",
    mapperDesc: "supported (~85–90% of NES library)",
  },
  tests: {
    title: "Tests",
    subtitle: "Quality assurance",
    nestest: "nestest trace",
    nestestDesc: "CPU instruction accuracy verification via official test ROM",
    unit: "Unit tests",
    unitDesc: "passing",
    expects: "Assertions",
    expectsDesc: "expect() calls",
  },
  footer: {
    license: "MIT License",
    builtWith: "Built with Claude Code",
  },
};

const ja: Translations = {
  nav: { github: "GitHub" },
  emulator: {
    title: "エミュレータ",
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
  about: {
    title: "概要",
    subtitle: "既存コードを一切見ずに AI がスクラッチ実装した NES エミュレータ",
    desc1: "Claude Code の自走ループ機構（GitHub Flow: Issue → Branch → PR → Review → Merge を人手を介さず自動で回し続ける）で構築。",
    desc2: "人間の関与は Issue のシード（作成）と朝のコードレビューのみ。",
    desc3: "60夜以上の継続的な自律開発実績。",
  },
  constraints: {
    title: "制約",
    subtitle: "この実験を定義するルール",
    oracleTitle: "参照 OK（Oracle）",
    oracleItems: [
      "nesdev.org wiki（NES ハードウェアドキュメント）",
      "6502 命令セット仕様書",
      "iNES / NES 2.0 ヘッダフォーマット",
    ],
    denyTitle: "参照 NG",
    denyDesc: "既存 NES エミュレータのソースコード全て — 言語問わず、ライセンス問わず。",
    enforceDesc: "pre-tool-use hooks の deny list で構造的に強制。",
  },
  compat: {
    title: "互換性",
    subtitle: "実装状況",
    cpu: "CPU",
    cpuDesc: "オプコード（公式 151 + 非公式 105）",
    ppu: "PPU",
    ppuDesc: "完全実装（Sprite 0 Hit, loopy スクロール, スキャンラインタイミング）",
    apu: "APU",
    apuDesc: "チャンネル + 拡張音源対応",
    mapper: "マッパー",
    mapperDesc: "対応（NES ライブラリの ~85–90%）",
  },
  tests: {
    title: "テスト",
    subtitle: "品質保証",
    nestest: "nestest trace",
    nestestDesc: "公式テスト ROM による CPU 命令の正確性検証",
    unit: "ユニットテスト",
    unitDesc: "パス",
    expects: "アサーション",
    expectsDesc: "expect() 呼び出し",
  },
  footer: {
    license: "MIT License",
    builtWith: "Claude Code で構築",
  },
};

const zh: Translations = {
  nav: { github: "GitHub" },
  emulator: {
    title: "模拟器",
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
  about: {
    title: "关于",
    subtitle: "一个从未参考现有代码的 AI 构建 NES 模拟器",
    desc1: "由 Claude Code 自主循环机制构建（GitHub Flow: Issue → Branch → PR → Review → Merge 自动循环）。",
    desc2: "人类参与仅限于创建 Issue 和每日代码审查。",
    desc3: "超过 60 夜的持续自主开发。",
  },
  constraints: {
    title: "约束",
    subtitle: "定义这个实验的规则",
    oracleTitle: "允许参考 (Oracle)",
    oracleItems: [
      "nesdev.org wiki（NES 硬件文档）",
      "6502 指令集规范",
      "iNES / NES 2.0 头格式",
    ],
    denyTitle: "禁止参考",
    denyDesc: "所有现有 NES 模拟器源代码 — 不限语言、不限许可证。",
    enforceDesc: "通过 pre-tool-use hooks 的 deny list 结构性强制。",
  },
  compat: {
    title: "兼容性",
    subtitle: "实现状况",
    cpu: "CPU",
    cpuDesc: "操作码（官方 151 + 非官方 105）",
    ppu: "PPU",
    ppuDesc: "完整实现（Sprite 0 Hit, loopy 滚动, 扫描线时序）",
    apu: "APU",
    apuDesc: "通道 + 扩展音源支持",
    mapper: "映射器",
    mapperDesc: "支持（NES 游戏库的 ~85–90%）",
  },
  tests: {
    title: "测试",
    subtitle: "质量保证",
    nestest: "nestest trace",
    nestestDesc: "通过官方测试 ROM 验证 CPU 指令的准确性",
    unit: "单元测试",
    unitDesc: "通过",
    expects: "断言",
    expectsDesc: "expect() 调用",
  },
  footer: {
    license: "MIT License",
    builtWith: "使用 Claude Code 构建",
  },
};

const translations: Record<Locale, Translations> = { en, ja, zh };

const STORAGE_KEY = "nightowl-nes-locale";

function getDefaultLocale(): Locale {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "en" || saved === "ja" || saved === "zh") return saved;
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
  localStorage.setItem(STORAGE_KEY, locale);
  for (const fn of listeners) fn(locale);
}

export function onLocaleChange(fn: (locale: Locale) => void): void {
  listeners.push(fn);
}

export function t(): Translations {
  return translations[currentLocale];
}

export type { Locale, Translations };
