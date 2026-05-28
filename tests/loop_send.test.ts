import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// scripts/loop-send.sh の loop_send() を実 tmux に対して動かす E2E テスト。
// 受信側は raw モードの `cat`（tty による行編集・改行変換を介さず生バイトを捕捉）。
// これにより loop_send が「与えたテキストを一字一句 + 末尾に submit の \r 1 個」で
// 送れているかをバイト一致で検証できる。受け手を実 Claude にしないことで決定的・無料・高速。
//
// 注意: nightly CI は tmux をインストールしてからこのスイートを走らせる
// (.github/workflows/nightly.yml)。tmux が無い環境では describe.skip で素通りする
// （ローカル開発者向けの配慮）。CI で必ず tmux を入れることでスイートが実行される。

const REPO = process.cwd();
const SEND_LIB = join(REPO, "scripts", "loop-send.sh");

function hasTmux(): boolean {
  try {
    execSync("command -v tmux", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// node/bun で subprocess を起こさずに同期スリープする。
function sleepSync(ms: number): void {
  const sab = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(sab, 0, 0, ms);
}

// loop_send を呼ぶ。body は環境変数経由で渡し、シェルのコマンドラインに一切載せない
// （特殊文字・$()・引用符・絵文字が展開/破壊されないようにするため）。
function callLoopSend(pane: string, body: string): void {
  execSync('bash -c \'source "$SEND_LIB" && loop_send "$PANE" "$BODY"\'', {
    env: { ...process.env, SEND_LIB, PANE: pane, BODY: body },
    encoding: "utf-8",
  });
}

// raw cat 受信 tmux セッションを立て、loop_send で body を流し、受信した生バイトを返す。
// 各呼び出しで独立セッション + 独立 outfile を使い、前のケースのバイト混入を防ぐ。
function sendAndCapture(body: string): Buffer {
  const dir = mkdtempSync(join(tmpdir(), "loopsend-"));
  const outfile = join(dir, "recv.bin");
  const recvScript = join(dir, "recv.sh");
  const session = `loopsend_test_${process.pid}_${Math.random().toString(36).slice(2)}`;
  // 受信ダミー: raw モードにして cat で outfile へ。echo を切り端末変換を排除する。
  writeFileSync(recvScript, `#!/bin/bash\nstty raw -echo 2>/dev/null\nexec cat > '${outfile}'\n`);

  try {
    execSync(`tmux new-session -d -s '${session}' -x 240 -y 50 "bash '${recvScript}'"`, {
      stdio: "ignore",
    });

    // pane が現れ、内部の shell + stty + cat が起動するまで待つ。
    let pane = "";
    for (let i = 0; i < 40 && !pane; i++) {
      try {
        pane = execSync(`tmux list-panes -t '${session}' -F '#{pane_id}'`, { encoding: "utf-8" })
          .trim()
          .split("\n")[0]
          ?.trim() ?? "";
      } catch {
        /* セッション生成直後の取りこぼしは無視してリトライ */
      }
      if (!pane) sleepSync(50);
    }
    if (!pane) throw new Error("受信 pane が生成されなかった");
    sleepSync(150); // cat + stty raw の起動余裕

    callLoopSend(pane, body);

    // 受信が body + \r 相当の長さに達して安定するまでポーリング。
    const wantLen = Buffer.byteLength(body, "utf-8") + 1; // +1 = 末尾 \r
    let last = -1;
    let buf = Buffer.alloc(0);
    for (let i = 0; i < 50; i++) {
      try {
        buf = readFileSync(outfile);
      } catch {
        buf = Buffer.alloc(0);
      }
      if (buf.length >= wantLen && buf.length === last) break; // 目標長に達し変化が止まった
      last = buf.length;
      sleepSync(80);
    }
    return buf;
  } finally {
    try {
      execSync(`tmux kill-session -t '${session}'`, { stdio: "ignore" });
    } catch {
      /* 既に死んでいれば無視 */
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

// body + 末尾 \r(submit)を期待バイト列として 16 進で比較する（差分時の可読性のため）。
function expectBytesAreBodyPlusCR(body: string): void {
  const got = sendAndCapture(body);
  const want = Buffer.concat([Buffer.from(body, "utf-8"), Buffer.from([0x0d])]);
  expect(got.toString("hex")).toBe(want.toString("hex"));
}

const d = hasTmux() ? describe : describe.skip;

d("loop_send: 単一行テキストの byte-perfect 送信 (CI ゲート)", () => {
  // 実際に自走ループで流れるのは単一行のゴール文 / "/clear ..." コマンド。
  // 任意テキストで壊れないこと(plugin 化方針)も兼ねて特殊系を厚く並べる。
  const cases: Array<[string, string]> = [
    ["ascii", "next goal simple"],
    [
      "現実のゴール文",
      "次の pending 夜を CLAUDE.md 自走連鎖プロトコルに従い実装→PR→sub-agentレビュー→triage→全PASSなら auto-merge arm、完了後 latest.md 更新と次フラグ書込まで行え、or stop after 50 turns",
    ],
    ["/clear コマンド", "/clear loop-clear-20260528-1300"],
    ["日本語+絵文字+矢印", "次の pending 夜を実装→PR→auto-merge ✨"],
    ["シェルメタ文字", "a\"b'c\\d$e`f(g)h"],
    ["ハイフン始まり", "-foo --bar"],
    ["コマンド置換はリテラル(注入安全)", "$(echo PWNED)"],
    ["タブと連続スペース", "a\tb   c"],
    ["2000 文字長文", "x".repeat(2000)],
  ];

  it.each(cases)("%s を一字一句 + 末尾 \\r で届ける", (_label, body) => {
    expectBytesAreBodyPlusCR(body);
  });
});

d("loop_send: 複数行の既知挙動の記録 (真の挙動は L3 / 実 TUI)", () => {
  // raw 受信(bracketed paste mode 無効)では、tmux は内部の \n を \r に変換して送る
  // = 各行が submit される。これは実 Claude TUI(bracketed paste 有効)の挙動とは異なり、
  // ダミーでは再現できない。真の複数行挙動は L3 スモーク(scripts/loop-send-smoke.sh)で
  // 実セッションに対して目視する。ここでは raw レベルの事実を固定し、将来の実装変更
  // (例: paste-buffer -p の扱い)でこの前提が変わったら CI で気づけるようにする。
  it("raw 受信では内部 \\n が \\r に潰れる(=単純 paste では複数行不可)", () => {
    const got = sendAndCapture("line1\nline2\nline3");
    const want = Buffer.from("line1\rline2\rline3\r", "latin1");
    expect(got.toString("hex")).toBe(want.toString("hex"));
  });
});
