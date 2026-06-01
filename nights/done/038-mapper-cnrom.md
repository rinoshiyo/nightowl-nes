# 夜 038: CNROM mapper (mapper 3) 実装

## ゴール (/goal)

```
/goal night/038-mapper-cnrom ブランチで実装し、 nightly CI 緑、 PR が main に merge commit 完了、 nights/pending/038-mapper-cnrom.md が nights/done/ に移動済み、 or stop after 80 turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 038 merged`

## 前提

- 夜 032 done: Mapper 抽象化済み (`Mapper` interface + `createMapper` + NROM/UxROM)
- 夜 037 done: CPU IRQ ハンドリング + APU IRQ 伝達
- NROM (mapper 0) は固定バンク、UxROM (mapper 2) は PRG バンク切替
- CNROM は CHR バンク切替のみの最もシンプルな mapper の一つ
- 仕様参照:
  - https://www.nesdev.org/wiki/CNROM
  - https://www.nesdev.org/wiki/Mapper

## ブランチ運用

`night/038-mapper-cnrom` ブランチで実装、完了時に PR を立てる。main 直 push は hook で deny。

## 設計概要

### CNROM の仕様

- PRG ROM: 16KB or 32KB 固定 (バンク切替なし、NROM と同じ)
- CHR ROM: 8KB × N バンク (最大 4 バンク = 32KB)
- バンク切替: CPU $8000-$FFFF への書き込みで CHR バンクを選択
  - 書き込み値の下位 2 ビットが CHR バンク番号
- ミラーリング: カート固定 (ハードウェアで決定)

### 実装方針

1. `src/core/mappers/cnrom.ts` に `MapperCnrom` クラスを作成
2. PRG ROM の読み書きは NROM と同じ (16KB or 32KB 固定)
3. CHR ROM は 8KB バンク切替: `writePrg` で CHR バンク番号を更新
4. `createMapper` に `case 3` を追加

## サブゴール

1. **G1: MapperCnrom 実装** — PRG 固定 + CHR 8KB バンク切替
2. **G2: createMapper に登録** — `case 3: return new MapperCnrom(cart)`
3. **G3: テスト** — バンク切替動作、初期バンク、境界値

## 実装ステップ

1. `git checkout main && git pull`
2. `git checkout -b night/038-mapper-cnrom`
3. G1: `src/core/mappers/cnrom.ts` に MapperCnrom 実装
4. G2: `src/core/mappers/mapper.ts` の `createMapper` に case 3 追加
5. G2: `src/core/mappers/index.ts` に export 追加
6. G3: `tests/mapper_cnrom.test.ts` にテスト作成
7. `bun test` + `bunx tsc --noEmit` + `bunx eslint 'src/**/*.ts' 'tests/**/*.ts' --max-warnings 0`
8. `git mv nights/pending/038-mapper-cnrom.md nights/done/038-mapper-cnrom.md`
9. `git push -u origin night/038-mapper-cnrom`
10. `gh pr create`
11. `code-review --fix` → triage → 全 PASS なら merge

## 検証チャンネル

- テスト pass: `✅ PASS: <test_name>`
- 型チェック: `✅ TYPECHECK: clean`
- PR 作成: `🔀 PR OPENED: <URL>`
- main merge 確認: `🎯 GOAL CONDITION MET: night 038 merged`

## コミット粒度 (Conventional Commits)

- `feat(core): CNROM mapper (mapper 3) 実装`
- `feat(core): createMapper に CNROM (mapper 3) を登録`
- `test(core): CNROM mapper テスト`
- `chore(nights): 038 を done に移動`

最低 5 commit。

## DoD (完了条件)

- [ ] `night/038-mapper-cnrom` ブランチで作業
- [ ] `MapperCnrom` クラスが `src/core/mappers/cnrom.ts` に存在する
- [ ] `MapperCnrom` が `Mapper` interface を実装している
- [ ] PRG ROM の読み出しが NROM と同じ動作 (16KB/32KB 固定)
- [ ] CHR ROM の読み出しが選択されたバンクから行われる
- [ ] CPU $8000-$FFFF への書き込みで CHR バンクが切り替わる
- [ ] バンク番号の下位ビットのみが使用される (バンク数に応じたマスク)
- [ ] 初期状態でバンク 0 が選択されている
- [ ] `createMapper` で mapper 3 が `MapperCnrom` にマッピングされる
- [ ] `src/core/mappers/index.ts` から `MapperCnrom` が export されている
- [ ] 既存の nestest trace テスト pass (TRACE_LINES = 8991)
- [ ] 既存の全テスト pass
- [ ] CNROM mapper テストが pass
- [ ] `bun test` 全 pass
- [ ] `bunx tsc --noEmit` 警告ゼロ
- [ ] `bunx eslint 'src/**/*.ts' 'tests/**/*.ts' --max-warnings 0` 警告ゼロ
- [ ] git log に最低 5 commit
- [ ] `nights/pending/038-mapper-cnrom.md` を `nights/done/` に `git mv`
- [ ] PR が立っており merge commit で main に反映済み

## 実装上の注意

- CNROM の CHR バンク数はカートによって異なる (1, 2, or 4 バンク)
- バンク番号マスクは `chrRomSize / 0x2000 - 1` で計算 (2 の冪を前提)
- writePrg は書き込み値からバンク番号を抽出するだけ
- CHR RAM ではなく CHR ROM なので writeChr は no-op (書き込み無視)
- PRG ROM の読み出しは NROM と同じロジック: 16KB なら $C000-$FFFF がミラー

## 詰まったら

- nesdev wiki CNROM: https://www.nesdev.org/wiki/CNROM
- 既存の NROM/UxROM 実装を参考に

30 分以上同じエラーで詰んだら stuck/ に隔離 → PR draft 戻し → セッション終了。
