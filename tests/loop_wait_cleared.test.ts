import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

// scripts/loop-wait-cleared.sh の wait_cleared() を直接動かすテスト。
// 名札ファイルの「出現」を idle シグナルとして待つ関数なので、
//   - 既に在る            → 即 0
//   - 後から現れる        → 現れた時点で 0
//   - 来ない              → max 秒で 1 (呼び出し側は画面 scrape に fallback)
// を検証する。実 tmux も実 Claude も不要・決定的・高速。

const REPO = process.cwd();
const WAIT_LIB = join(REPO, "scripts", "loop-wait-cleared.sh");

// wait_cleared を呼び、終了コードを返す (0=シグナル受信 / 1=timeout)。
// execSync は非ゼロ終了で throw するので、status を拾って数値で返す。
function callWaitCleared(sig: string, maxSeconds: number): number {
  try {
    execSync('bash -c \'source "$WAIT_LIB" && wait_cleared "$SIG" "$MAX"\'', {
      env: { ...process.env, WAIT_LIB, SIG: sig, MAX: String(maxSeconds) },
      encoding: "utf-8",
    });
    return 0;
  } catch (err) {
    const status = (err as { status?: number }).status;
    return typeof status === "number" ? status : -1;
  }
}

describe("wait_cleared", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "loopcleared-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("既にシグナルが在れば即座に 0 を返す", () => {
    const sig = join(dir, "loop-cleared.0.txt");
    writeFileSync(sig, "");
    const start = Date.now();
    expect(callWaitCleared(sig, 5)).toBe(0);
    // すぐ返ること (ポーリング 1 周未満の体感; 余裕を見て 3s 未満)。
    expect(Date.now() - start).toBeLessThan(3000);
  });

  it("シグナルが来なければ max 秒で 1 を返す (fallback 用)", () => {
    const sig = join(dir, "loop-cleared.0.txt");
    const start = Date.now();
    expect(callWaitCleared(sig, 2)).toBe(1);
    // 約 2s 待って timeout する (早抜けしていないこと)。
    // date +%s の秒境界タイミングにより 1s 台で返ることがあるため余裕を持たせる。
    expect(Date.now() - start).toBeGreaterThanOrEqual(900);
  });

  it("後からシグナルが現れたら 0 を返す", () => {
    const sig = join(dir, "loop-cleared.0.txt");
    // execSync は同期ブロックするので JS の timer では名札を出せない (イベントループ停止)。
    // シェル側でサブシェルを background させ、wait_cleared のポーリング中に出現させる。
    let status = -1;
    try {
      execSync('bash -c \'source "$WAIT_LIB"; ( sleep 1; : > "$SIG" ) & wait_cleared "$SIG" "$MAX"\'', {
        env: { ...process.env, WAIT_LIB, SIG: sig, MAX: "10" },
        encoding: "utf-8",
      });
      status = 0;
    } catch (err) {
      status = (err as { status?: number }).status ?? -1;
    }
    expect(status).toBe(0);
  });
});
