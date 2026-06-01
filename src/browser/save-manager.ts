/**
 * バッテリーバックアップ付き PRG RAM の永続化。
 *
 * ROM の SHA-256 ハッシュをキーとして localStorage に PRG RAM を保存/復元する。
 * hasBattery = true のカートリッジでのみ使用する。
 */

const SAVE_PREFIX = "nightowl-sram-";

export async function computeRomHash(prgRom: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", prgRom as unknown as BufferSource);
  const arr = new Uint8Array(digest);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function savePrgRam(romHash: string, data: Uint8Array): void {
  const key = SAVE_PREFIX + romHash;
  const chunks: string[] = [];
  for (let i = 0; i < data.length; i++) {
    chunks.push(String.fromCharCode(data[i]!));
  }
  try {
    localStorage.setItem(key, btoa(chunks.join("")));
  } catch {
    // QuotaExceededError — localStorage 容量超過時は黙って諦める
  }
}

export function loadPrgRam(romHash: string): Uint8Array | null {
  const key = SAVE_PREFIX + romHash;
  const encoded = localStorage.getItem(key);
  if (encoded === null) return null;
  try {
    const binary = atob(encoded);
    const data = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      data[i] = binary.charCodeAt(i);
    }
    return data;
  } catch {
    // base64 デコード失敗 — 破損データとして無視
    return null;
  }
}

export function hasSaveData(romHash: string): boolean {
  return localStorage.getItem(SAVE_PREFIX + romHash) !== null;
}

export function deleteSaveData(romHash: string): void {
  localStorage.removeItem(SAVE_PREFIX + romHash);
}
