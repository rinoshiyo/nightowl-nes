# 夜 020: illegal SBC (EB) + DCP 全 7 opcode

## ゴール (/goal)

```
/goal night/020-illegal-sbc-dcp ブランチで実装し、 nightly CI 緑、 PR が main に merge commit 完了、 nights/pending/020-illegal-sbc-dcp.md が nights/done/ に移動済み、 or stop after 80 turns
```

完了時 transcript 必須出力: `🎯 GOAL CONDITION MET: night 020 merged`

## 前提

- 夜 019 done: illegal LAX (6) + SAX (4) 実装済み。nestest trace 5722 行到達
- 起点 = nestest.log 5723 行目 (SBC テストブロックのセットアップ)
- 5729 行 `E8D8  EB 40  *SBC #$40` が最初の illegal SBC
- 5828 行 `E92E  C3 45  *DCP ($45,X)` が最初の DCP
- 正規 SBC (immediate/zeroPage/absolute/etc) は実装済み
- 全アドレッシングモードは実装済み

## ブランチ運用

`night/020-illegal-sbc-dcp` ブランチで実装、完了時に PR を立てる。main 直 push は hook で deny。

## 対象 opcode と仕様

### *SBC (illegal SBC immediate duplicate)

opcode `EB` は正規 SBC immediate (`E9`) と全く同じ挙動。
A - M - !C → A、C/Z/N/V フラグ更新。

| opcode | アドレッシング | byte | cycle | nestest 初出行 |
|--------|---------------|------|-------|---------------|
| `EB` | immediate | 2 | 2 | 5729 |

exec ロジック: 正規 SBC immediate (`E9`) と同一。既存の SBC exec を再利用する。

### DCP (DEC + CMP 合成命令)

メモリ値を DEC (1 減算) し、結果を A と比較 (CMP)。
つまり `tmp = M - 1; [M] = tmp; CMP A, tmp` を 1 命令で行う。
C/Z/N フラグは CMP の結果で更新。V フラグは変更しない。

| opcode | アドレッシング | byte | cycle | nestest 初出行 |
|--------|---------------|------|-------|---------------|
| `C3` | (indirect,X) | 2 | 8 | 5828 |
| `C7` | zeroPage | 2 | 5 | 5898 |
| `CF` | absolute | 3 | 6 | 5968 |
| `D3` | (indirect),Y | 2 | 8 | 6042 |
| `D7` | zeroPage,X | 2 | 6 | 6122 |
| `DB` | absolute,Y | 3 | 7 | 6192 |
| `DF` | absolute,X | 3 | 7 | 6272 |

exec ロジック:
```
val = bus.read(op.addr)
val = (val - 1) & 0xff
bus.write(op.addr, val)
// CMP: A - val の結果でフラグ更新
diff = cpu.a - val
C = (cpu.a >= val)
Z = (diff & 0xff) === 0
N = (diff & 0x80) !== 0
return 0  // RMW 系なので追加 cycle なし (base cycle に含まれる)
```

## サブゴール

1. **G1: *SBC (EB) 登録** — 正規 SBC exec を再利用して opcode EB を登録
2. **G2: DCP exec 関数** — DEC + CMP の合成 exec を実装
3. **G3: DCP × 7 opcode 登録** — `C3/C7/CF/D3/D7/DB/DF` を OPCODES テーブルに追加
4. **G4: nestest trace 延伸** — `TRACE_LINES` を 5722 → 6334 に引き上げ
5. **G5: *SBC 単体テスト** — EB が E9 と同一挙動であることの確認
6. **G6: DCP 単体テスト** — 各アドレッシングモードで DEC+CMP / C/Z/N フラグ / V 不変

各サブゴールは独立 commit 単位 (Conventional Commits)。

## 実装ステップ

1. `git checkout main && git pull`
2. `git checkout -b night/020-illegal-sbc-dcp`
3. G1: `opcodes.ts` に *SBC (EB) を追加 (正規 SBC exec 再利用)
4. G2-G3: `opcodes.ts` に DCP exec + 7 opcode 追加
5. G4: `TRACE_LINES` を 6334 に引き上げ → `bun test`
6. G5-G6: 単体テスト追加
7. `bun test` 全 pass / `bunx tsc --noEmit` 警告ゼロ / `bunx eslint` 警告ゼロ
8. `git mv nights/pending/020-illegal-sbc-dcp.md nights/done/020-illegal-sbc-dcp.md`
9. `git push -u origin night/020-illegal-sbc-dcp`
10. `gh pr create`
11. `code-review --fix` → triage → 全 PASS なら merge

## 検証チャンネル (transcript 出力ルール)

- テスト pass: `✅ PASS: <test_name>`
- テスト fail: `❌ FAIL: <reason>`
- 型チェック: `✅ TYPECHECK: clean`
- PR 作成: `🔀 PR OPENED: <URL>`
- main merge 確認: `🎯 GOAL CONDITION MET: night 020 merged`

## 実装上の注意

- *SBC (EB) は `name: "*SBC"` (nestest.log 表記)
- DCP は `name: "*DCP"` (nestest.log 表記)
- *SBC は正規 SBC immediate と完全同一。既存 exec を使い回す
- DCP は RMW 系: read → modify → write。cycle 数に page cross ペナルティはない (全て base cycle に含まれる)
- DCP の CMP 部分は V フラグを変更しない (正規 CMP と同じ)
- DCP の cycle 数は正規 DEC + 正規 CMP の合計ではなく、独自の base cycle

## コミット粒度 (Conventional Commits)

- *SBC + DCP 実装 + TRACE_LINES + テスト + nights/done 移動 = 最低 4 commit

## DoD (完了条件)

- [ ] `night/020-illegal-sbc-dcp` ブランチで作業
- [ ] *SBC (EB) が OPCODES テーブルに登録済み、正規 SBC と同一挙動
- [ ] DCP 7 opcode (`C3/C7/CF/D3/D7/DB/DF`) が OPCODES テーブルに登録済み
- [ ] DCP exec: メモリ値を DEC → A と CMP → C/Z/N フラグ更新、V 不変
- [ ] DCP の cycle 数が正しい (indX=8, zp=5, abs=6, indY=8, zpX=6, absY=7, absX=7)
- [ ] `TRACE_LINES` を 6334 に引き上げ、nestest trace test pass
- [ ] *SBC 単体テスト (EB = E9 同一挙動)
- [ ] DCP 単体テスト (各モード × DEC+CMP / フラグ)
- [ ] `bun test` 全 pass
- [ ] `bunx tsc --noEmit` 警告ゼロ
- [ ] `bunx eslint 'src/**/*.ts' 'tests/**/*.ts' --max-warnings 0` 警告ゼロ
- [ ] git log に最低 4 commit
- [ ] `nights/pending/020-illegal-sbc-dcp.md` を `nights/done/` に `git mv`
- [ ] PR が立っており merge commit で main に反映済み

## 詰まったら (nesdev wiki のみ参照)

- https://www.nesdev.org/wiki/CPU_unofficial_opcodes (DCP/SBC の仕様)
- https://www.nesdev.org/obelisk-6502-guide/reference.html

30 分以上同じエラーで詰んだら stuck/ に隔離 → PR draft 戻し → セッション終了。
