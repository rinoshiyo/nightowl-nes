/**
 * バッテリーバックアップ付き PRG RAM の永続化。
 *
 * ROM の SHA-256 ハッシュをキーとして localStorage に PRG RAM を保存/復元する。
 * hasBattery = true のカートリッジでのみ使用する。
 */

const SAVE_PREFIX = "nightowl-sram-";

export async function computeRomHash(prgRom: Uint8Array): Promise<string> {
  const buf = new ArrayBuffer(prgRom.byteLength);
  new Uint8Array(buf).set(prgRom);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const arr = new Uint8Array(digest);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function savePrgRam(romHash: string, data: Uint8Array): void {
  const key = SAVE_PREFIX + romHash;
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]!);
  }
  localStorage.setItem(key, btoa(binary));
}

export function loadPrgRam(romHash: string): Uint8Array | null {
  const key = SAVE_PREFIX + romHash;
  const encoded = localStorage.getItem(key);
  if (encoded === null) return null;
  const binary = atob(encoded);
  const data = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    data[i] = binary.charCodeAt(i);
  }
  return data;
}

export function hasSaveData(romHash: string): boolean {
  return localStorage.getItem(SAVE_PREFIX + romHash) !== null;
}

export function deleteSaveData(romHash: string): void {
  localStorage.removeItem(SAVE_PREFIX + romHash);
}

export function listSaveKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key !== null && key.startsWith(SAVE_PREFIX)) {
      keys.push(key.slice(SAVE_PREFIX.length));
    }
  }
  return keys;
}
