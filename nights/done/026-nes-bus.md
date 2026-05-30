# 夜 026: nestest 完走 + NES バス + Console 骨格

## ゴール (/goal)

```
/goal night/026-nes-bus ブランチで実装し、 nightly CI 緑、 PR が main に merge commit 完了、 nights/pending/026-nes-bus.md が nights/done/ に移動済み、 or stop after 80 turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 026 merged`

## 前提

- 夜 025 done: 全 illegal opcode (SLO/RLA/SRE/RRA 他) 実装済み。nestest trace 8974 行到達
- nestest.log 全 8991 行。残り 17 行 (8975-8991) は完了ルーチン (APU レジスタ書き込み = 成功ビープ)
- 残り 17 行で使う CPU 命令 (LDA/STA/ORA/BEQ/JSR/RTS) は全て実装済み
- 現在の Bus はインターフェースのみ (`src/core/bus.ts`)。テスト内にインライン実装あり
- 具象 Bus / PPU / APU は未実装

## ブランチ運用

`night/026-nes-bus` ブランチで実装、完了時に PR を立てる。main 直 push は hook で deny。

## 設計概要

### NES メモリマップ (nesdev wiki 正典)

| アドレス | 用途 | サイズ |
|---------|------|-------|
| `$0000-$07FF` | 内蔵 RAM | 2KB |
| `$0800-$1FFF` | RAM ミラー (0x800 周期) | - |
| `$2000-$2007` | PPU レジスタ | 8 bytes |
| `$2008-$3FFF` | PPU レジスタミラー (8 byte 周期) | - |
| `$4000-$4017` | APU + I/O レジスタ | 24 bytes |
| `$4018-$401F` | テスト用 (通常無効) | 8 bytes |
| `$4020-$FFFF` | カートリッジ空間 (Mapper 依存) | - |

### PPU レジスタスタブ ($2000-$2007)

最小スタブ。レジスタ値を保持し read/write を受け付けるだけ。描画ロジックは後の夜。

| レジスタ | アドレス | R/W | スタブ動作 |
|---------|---------|-----|----------|
| PPUCTRL | $2000 | W | 値を格納 |
| PPUMASK | $2001 | W | 値を格納 |
| PPUSTATUS | $2002 | R | bit7 (vblank) 返却 + vblank クリア + アドレスラッチリセット |
| OAMADDR | $2003 | W | 値を格納 |
| OAMDATA | $2004 | R/W | OAM[oamAddr] 読み書き + addr インクリメント (write 時) |
| PPUSCROLL | $2005 | W×2 | ダブルライト (toggle で X/Y 格納) |
| PPUADDR | $2006 | W×2 | ダブルライト (toggle で hi/lo → vramAddr 組立) |
| PPUDATA | $2007 | R/W | vramAddr から読み書き + addr += (PPUCTRL bit2 ? 32 : 1) |

### APU + I/O スタブ ($4000-$4017)

全て no-op ストア / 0 返却。nestest 完了ルーチンの STA $4015/$4004-$4007 が通る最低限。
$4016 (コントローラ 1) / $4017 (コントローラ 2 + APU フレームカウンタ) も将来拡張ポイントとして read/write 枠を設ける。

### Console 骨格

CPU + Bus + PPU(stub) を繋いで step() で 1 命令実行できるエントリポイント。

## サブゴール

1. **G1: PPU レジスタスタブ** — `src/core/ppu.ts` に PpuRegisters クラス。$2000-$2007 の read/write、vblank フラグ、ダブルライトラッチ、VRAM バッファリング
2. **G2: NES Bus 具象実装** — `src/core/nes-bus.ts` に NesBus クラス。RAM + PPU dispatch + APU/IO スタブ + Cart ROM。メモリミラーリング対応
3. **G3: Console 骨格** — `src/core/console.ts` に NesConsole クラス。CPU + Bus + PPU を wiring、step() で 1 CPU 命令実行
4. **G4: nestest 完走** — TRACE_LINES を 8974 → 8991 に引き上げ (全行到達)
5. **G5: バス + PPU スタブのユニットテスト** — RAM ミラーリング、PPU レジスタ dispatch、PPUSTATUS vblank クリア副作用、ダブルライト挙動

各サブゴールは独立 commit 単位 (Conventional Commits)。

## 実装ステップ

1. `git checkout main && git pull`
2. `git checkout -b night/026-nes-bus`
3. G1: `src/core/ppu.ts` に PPU レジスタスタブ実装
4. G2: `src/core/nes-bus.ts` に NesBus 実装 (PPU/APU dispatch + RAM mirror)
5. G3: `src/core/console.ts` に Console 骨格
6. G4: `TRACE_LINES` を 8991 に引き上げ → `bun test`
7. G5: バス・PPU スタブのユニットテスト追加
8. `bun test` 全 pass / `bunx tsc --noEmit` 警告ゼロ / `bunx eslint` 警告ゼロ
9. `git mv nights/pending/026-nes-bus.md nights/done/026-nes-bus.md`
10. `git push -u origin night/026-nes-bus`
11. `gh pr create`
12. `code-review --fix` → triage → 全 PASS なら merge

## 検証チャンネル (transcript 出力ルール)

- テスト pass: `✅ PASS: <test_name>`
- テスト fail: `❌ FAIL: <reason>`
- 型チェック: `✅ TYPECHECK: clean`
- PR 作成: `🔀 PR OPENED: <URL>`
- main merge 確認: `🎯 GOAL CONDITION MET: night 026 merged`

## 実装上の注意

- NES Bus は `Bus` インターフェースを implements する具象クラス
- RAM ミラー: `addr & 0x7FF` で 2KB にマスク ($0000-$1FFF 全域)
- PPU レジスタミラー: `0x2000 + (addr & 0x7)` で 8 byte 周期にマスク ($2000-$3FFF)
- PPUSTATUS ($2002) の read は vblank フラグクリア + アドレスラッチリセットの副作用あり
- PPUDATA ($2007) の read は内部バッファ経由 (パレットRAM $3F00+ を除く)。スタブ段階では 0 返却でよいが、バッファリング機構は入れておく
- PPU の VRAM は 2KB (name table 用)。パレット RAM は 32 bytes。スタブ段階で確保
- APU の完了ルーチン (STA $4015 等) は write を受けるだけでよい (動作不要)
- Console.step() は CPU 1 命令を実行して消費 cycle 数を返す
- nestest trace テストの makeNestestBus はそのまま残す (nestest 専用の軽量 bus として。NesBus に差し替えない)
- `cart.ts` の parseINes が返す Cartridge 型を NesBus が受け取る形にする

## コミット粒度 (Conventional Commits)

- `feat(core/ppu): PPU レジスタスタブ実装`
- `feat(core/bus): NES Bus 具象実装 (RAM + PPU dispatch + APU/IO スタブ)`
- `feat(core): Console 骨格 (CPU + Bus + PPU wiring)`
- `test(core/cpu): nestest trace 完走 (TRACE_LINES 8974→8991)`
- `test(core/bus): NES Bus アドレスディスパッチ + RAM ミラーリングテスト`
- `test(core/ppu): PPU レジスタスタブテスト`
- `chore(nights): 026 を done に移動`

最低 5 commit。

## DoD (完了条件)

- [ ] `night/026-nes-bus` ブランチで作業
- [ ] `src/core/ppu.ts` に PpuRegisters クラスが存在する
- [ ] PPUCTRL ($2000) write で値を格納
- [ ] PPUMASK ($2001) write で値を格納
- [ ] PPUSTATUS ($2002) read で vblank フラグ (bit7) を返却し、読後にクリア
- [ ] PPUSTATUS read でアドレスラッチ (write toggle) をリセット
- [ ] OAMADDR ($2003) write で OAM アドレスを格納
- [ ] OAMDATA ($2004) read/write で OAM にアクセス、write 時 addr インクリメント
- [ ] PPUSCROLL ($2005) ダブルライトで scrollX/scrollY を格納
- [ ] PPUADDR ($2006) ダブルライトで vramAddr を組み立て (hi → lo)
- [ ] PPUDATA ($2007) read/write で VRAM にアクセス、addr を自動インクリメント
- [ ] PPUDATA read のバッファリング機構 (パレット以外は 1 read 遅延)
- [ ] PPU 内部に VRAM 2KB + パレット RAM 32 bytes を確保
- [ ] `src/core/nes-bus.ts` に NesBus クラスが存在する
- [ ] NesBus が `Bus` インターフェースを implements している
- [ ] RAM ($0000-$07FF): 2KB read/write
- [ ] RAM ミラー ($0800-$1FFF): `addr & 0x7FF` で同一 RAM にアクセス
- [ ] PPU レジスタ ($2000-$2007): PpuRegisters に dispatch
- [ ] PPU レジスタミラー ($2008-$3FFF): `0x2000 + (addr & 0x7)` で dispatch
- [ ] APU + I/O ($4000-$4017): write は格納 / read は 0 返却 (最小スタブ)
- [ ] Cart ($4020-$FFFF): PRG ROM read (Mapper 0 = NROM)
- [ ] `src/core/console.ts` に NesConsole クラスが存在する
- [ ] NesConsole.step() が CPU 1 命令を実行して消費 cycle 数を返す
- [ ] NesConsole のコンストラクタで CPU + NesBus + PpuRegisters を wiring
- [ ] `TRACE_LINES` を 8991 に引き上げ、nestest trace test 全行 pass
- [ ] NES Bus の RAM ミラーリングのユニットテスト (書き込み→ミラーアドレスから読み出し)
- [ ] NES Bus の PPU レジスタディスパッチのユニットテスト ($2000 write → PPU に反映)
- [ ] NES Bus の PPU ミラーのユニットテスト ($2008 write = $2000 write)
- [ ] NES Bus の APU 領域が write 受付 / read 0 返却のテスト
- [ ] PPUSTATUS read の vblank クリア副作用テスト
- [ ] PPUSCROLL / PPUADDR のダブルライト toggle テスト
- [ ] PPUDATA read バッファリングテスト
- [ ] `bun test` 全 pass
- [ ] `bunx tsc --noEmit` 警告ゼロ
- [ ] `bunx eslint 'src/**/*.ts' 'tests/**/*.ts' --max-warnings 0` 警告ゼロ
- [ ] git log に最低 5 commit
- [ ] `nights/pending/026-nes-bus.md` を `nights/done/` に `git mv`
- [ ] PR が立っており merge commit で main に反映済み

## 詰まったら (nesdev wiki のみ参照)

- https://www.nesdev.org/wiki/PPU_registers (PPU レジスタ仕様)
- https://www.nesdev.org/wiki/PPU_memory_map (PPU メモリマップ)
- https://www.nesdev.org/wiki/CPU_memory_map (CPU メモリマップ)
- https://www.nesdev.org/wiki/APU (APU 概要)

30 分以上同じエラーで詰んだら stuck/ に隔離 → PR draft 戻し → セッション終了。
