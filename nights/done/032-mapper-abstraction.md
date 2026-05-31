# 夜 032: Mapper 抽象化 (NROM + UxROM)

## ゴール (/goal)

```
/goal night/032-mapper-abstraction ブランチで実装し、 nightly CI 緑、 PR が main に merge commit 完了、 nights/pending/032-mapper-abstraction.md が nights/done/ に移動済み、 or stop after 80 turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 032 merged`

## 前提

- 夜 031 done: PPU スクロール (coarse + fine X/Y) 実装済み
- nestest trace 全 8991 行完走 (TRACE_LINES 変更なし)
- 現在の PRG ROM アクセスは `NesBus.read()` に直接 `cart.prgRom[(addr - 0x8000) % cart.prgRom.length]` とハードコード — mapper 0 (NROM) の挙動
- CHR ROM アクセスは `Ppu.chrRam` に固定 (CHR ROM カートでもパース結果を直接使っていない場合あり — 要確認)
- `Cart` interface は mapper 番号を parse 済み (`header.mapper`)
- 仕様参照: https://www.nesdev.org/wiki/Mapper / https://www.nesdev.org/wiki/NROM / https://www.nesdev.org/wiki/UxROM

## ブランチ運用

`night/032-mapper-abstraction` ブランチで実装、完了時に PR を立てる。main 直 push は hook で deny。

## 設計概要

### Mapper インターフェース

```typescript
export interface Mapper {
  /** CPU アドレス空間 $8000-$FFFF の読み出し */
  readPrg(addr: number): number;
  /** CPU アドレス空間 $8000-$FFFF への書き込み (バンク切替レジスタ等) */
  writePrg(addr: number, value: number): void;
  /** PPU アドレス空間 $0000-$1FFF の読み出し (CHR ROM/RAM) */
  readChr(addr: number): number;
  /** PPU アドレス空間 $0000-$1FFF への書き込み (CHR RAM 時のみ有効) */
  writeChr(addr: number, value: number): void;
}
```

### Mapper 0 (NROM)

- PRG ROM: 16KB → $8000-$BFFF = $C000-$FFFF (ミラー)、32KB → $8000-$FFFF そのまま
- CHR: chrRomSize > 0 なら CHR ROM (read only)、0 なら CHR RAM (8KB read/write)
- バンク切替なし ($8000-$FFFF への write は無視)

### Mapper 2 (UxROM)

- PRG ROM: 可変バンク (16KB × N banks)
  - $8000-$BFFF: 切替可能バンク (bankSelect レジスタで選択)
  - $C000-$FFFF: 最終バンクに固定
- CHR: CHR RAM 8KB (UxROM は CHR ROM を持たない)
- バンク切替: $8000-$FFFF への write で下位ビットがバンク番号になる
- バンクマスク: prgBanks 数に応じたビットマスク

### NesBus の変更

- `cart: Cart` に加えて `mapper: Mapper` を持つ
- $8000-$FFFF の read/write を `mapper.readPrg()` / `mapper.writePrg()` に委譲
- $6000-$7FFF (PRG RAM/SRAM) は mapper 0/2 では未実装 (将来夜)

### PPU の変更

- CHR アクセスを `mapper.readChr()` / `mapper.writeChr()` に委譲
- `chrRam` は mapper 内部に移動 (mapper が CHR ROM/RAM を所有)

### createMapper ファクトリ

```typescript
export function createMapper(cart: Cart): Mapper {
  switch (cart.header.mapper) {
    case 0: return new MapperNrom(cart);
    case 2: return new MapperUxrom(cart);
    default: throw new Error(`Unsupported mapper: ${cart.header.mapper}`);
  }
}
```

## サブゴール

1. **G1: Mapper インターフェース定義 + NROM 実装** — `src/core/mappers/` に interface + mapper0。NesBus を mapper 経由に変更。既存テスト全 pass 維持
2. **G2: PPU CHR アクセスを mapper 経由に変更** — PPU が `mapper.readChr()` / `writeChr()` を呼ぶ。CHR ROM カートで read-only、CHR RAM カートで read/write
3. **G3: UxROM (mapper 2) 実装** — バンク切替ロジック + テスト
4. **G4: テスト + 統合確認** — mapper 0/2 のバンクアクセス・切替テスト。既存全テスト pass

## 実装ステップ

1. `git checkout main && git pull`
2. `git checkout -b night/032-mapper-abstraction`
3. G1: `src/core/mappers/mapper.ts` に Mapper interface + `createMapper()` 定義
4. G1: `src/core/mappers/nrom.ts` に MapperNrom 実装
5. G1: `src/core/nes-bus.ts` を mapper 経由に変更 ($8000-$FFFF の read/write)
6. G1: `bun test` で既存テスト全 pass 確認
7. G2: `src/core/ppu.ts` の CHR アクセスを mapper 経由に変更
8. G2: `src/core/console.ts` で mapper を生成し PPU・Bus に渡す wiring
9. G2: `bun test` で既存テスト全 pass 確認
10. G3: `src/core/mappers/uxrom.ts` に MapperUxrom 実装
11. G3: `createMapper()` に case 2 追加
12. G4: `tests/mapper_nrom.test.ts` + `tests/mapper_uxrom.test.ts` 作成
13. `bun test` + `bunx tsc --noEmit` + `bunx eslint`
14. `git mv nights/pending/032-mapper-abstraction.md nights/done/032-mapper-abstraction.md`
15. `git push -u origin night/032-mapper-abstraction`
16. `gh pr create`
17. `code-review --fix` → triage → 全 PASS なら merge

## 検証チャンネル

- テスト pass: `✅ PASS: <test_name>`
- 型チェック: `✅ TYPECHECK: clean`
- PR 作成: `🔀 PR OPENED: <URL>`
- main merge 確認: `🎯 GOAL CONDITION MET: night 032 merged`

## コミット粒度 (Conventional Commits)

- `feat(core): Mapper インターフェース定義 + NROM (mapper 0) 実装`
- `refactor(core): NesBus PRG アクセスを Mapper 経由に変更`
- `refactor(core): PPU CHR アクセスを Mapper 経由に変更`
- `feat(core): UxROM (mapper 2) バンク切替実装`
- `test(core): Mapper NROM / UxROM テスト`
- `chore(nights): 032 を done に移動`

最低 5 commit。

## DoD (完了条件)

- [ ] `night/032-mapper-abstraction` ブランチで作業
- [ ] `Mapper` interface が `src/core/mappers/mapper.ts` に定義されている
- [ ] `readPrg` / `writePrg` / `readChr` / `writeChr` の 4 メソッドを持つ
- [ ] `createMapper(cart)` ファクトリが mapper 番号に応じた実装を返す
- [ ] MapperNrom: 16KB ROM → $C000-$FFFF がミラー
- [ ] MapperNrom: 32KB ROM → $8000-$FFFF 全域マップ
- [ ] MapperNrom: CHR ROM ありカートで readChr が正しくデータを返す
- [ ] MapperNrom: CHR RAM (chrRomSize=0) カートで writeChr/readChr が動作
- [ ] MapperNrom: $8000-$FFFF への write は無視 (エラーにならない)
- [ ] MapperUxrom: 初期状態でバンク 0 が $8000-$BFFF にマップ
- [ ] MapperUxrom: $C000-$FFFF が最終バンクに固定
- [ ] MapperUxrom: $8000-$FFFF write でバンク番号が切り替わる
- [ ] MapperUxrom: バンク番号は prgBanks 数でマスクされる
- [ ] MapperUxrom: CHR RAM 8KB が readChr/writeChr で動作
- [ ] NesBus が $8000-$FFFF の read/write を mapper に委譲している
- [ ] PPU が CHR アクセス ($0000-$1FFF) を mapper に委譲している
- [ ] NesConsole が createMapper で mapper を生成し Bus/PPU に渡す
- [ ] 未サポート mapper 番号で Error が throw される
- [ ] 既存の nestest trace テスト pass (TRACE_LINES = 8991)
- [ ] 既存の PPU テスト (背景・スプライト・スクロール) が全 pass
- [ ] 既存のコントローラテストが pass
- [ ] mapper_nrom テストが pass
- [ ] mapper_uxrom テストが pass
- [ ] `bun test` 全 pass
- [ ] `bunx tsc --noEmit` 警告ゼロ
- [ ] `bunx eslint 'src/**/*.ts' 'tests/**/*.ts' --max-warnings 0` 警告ゼロ
- [ ] git log に最低 5 commit
- [ ] `nights/pending/032-mapper-abstraction.md` を `nights/done/` に `git mv`
- [ ] PR が立っており merge commit で main に反映済み

## 実装上の注意

- Mapper 実装は `src/core/mappers/` ディレクトリに配置
- 既存テストは全て mapper 0 のカート (nestest.nes = 16KB PRG + 8KB CHR) で動いている — mapper 0 への置き換え後も挙動が変わらないことが最重要
- PPU の `chrRam` を mapper に移すので、既存テストで `ppu.chrRam` を直接操作している箇所は mapper 経由に書き換え
- UxROM テストは人工カート (複数 PRG バンク) を作成してバンク切替を検証
- $6000-$7FFF (SRAM) は mapper 0/2 では open bus — 将来夜で対応

## 詰まったら

- nesdev wiki NROM: https://www.nesdev.org/wiki/NROM
- nesdev wiki UxROM: https://www.nesdev.org/wiki/UxROM
- nesdev wiki Mapper: https://www.nesdev.org/wiki/Mapper

30 分以上同じエラーで詰んだら stuck/ に隔離 → PR draft 戻し → セッション終了。
