/** ドラッグ&ドロップされたファイルが .nes かどうか検証する */
export function isNesFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".nes");
}
