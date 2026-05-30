/**
 * PPU (Picture Processing Unit) レジスタスタブ。
 *
 * CPU バスからアクセスされる 8 本のレジスタ ($2000-$2007) を実装する。
 * 描画ロジック (背景/スプライトのラスタライズ) は後の夜で追加予定。
 * この段階では「レジスタ I/O が仕様通りに動く最小実装」を目指す。
 *
 * 仕様参照: https://www.nesdev.org/wiki/PPU_registers
 */

const CHR_RAM_SIZE = 0x2000;
const VRAM_SIZE = 0x800;
const PALETTE_SIZE = 0x20;
const OAM_SIZE = 256;

export class Ppu {
  /** $2000 PPUCTRL */
  ctrl = 0;
  /** $2001 PPUMASK */
  mask = 0;
  /** $2002 PPUSTATUS — bit7: vblank, bit6: sprite 0 hit, bit5: sprite overflow */
  status = 0;
  /** $2003 OAMADDR */
  oamAddr = 0;

  /** ダブルライト toggle (false = 1st write, true = 2nd write) */
  private writeToggle = false;
  /** PPUSCROLL X (1st write) */
  scrollX = 0;
  /** PPUSCROLL Y (2nd write) */
  scrollY = 0;
  /** PPUADDR 組み立て用 (hi byte → lo byte) */
  private addrHi = 0;
  /** PPUDATA 用 VRAM アドレス (14bit) */
  vramAddr = 0;
  /** PPUDATA read バッファ (パレット以外は 1 read 遅延) */
  private readBuffer = 0;

  readonly chrRam = new Uint8Array(CHR_RAM_SIZE);
  readonly vram = new Uint8Array(VRAM_SIZE);
  readonly palette = new Uint8Array(PALETTE_SIZE);
  readonly oam = new Uint8Array(OAM_SIZE);

  /** $2000-$2007 の read (addr は 0-7 にマスク済みで渡される想定) */
  read(reg: number): number {
    switch (reg) {
      case 2: {
        const val = this.status;
        this.status &= 0x7f;
        this.writeToggle = false;
        return val;
      }
      case 4:
        return this.oam[this.oamAddr] ?? 0;
      case 7:
        return this.readVram();
      default:
        return 0;
    }
  }

  /** $2000-$2007 の write (addr は 0-7 にマスク済み、value は 0-255 で渡される想定) */
  write(reg: number, value: number): void {
    const v = value;
    switch (reg) {
      case 0:
        this.ctrl = v;
        break;
      case 1:
        this.mask = v;
        break;
      case 3:
        this.oamAddr = v;
        break;
      case 4:
        this.oam[this.oamAddr] = v;
        this.oamAddr = (this.oamAddr + 1) & 0xff;
        break;
      case 5:
        if (!this.writeToggle) {
          this.scrollX = v;
        } else {
          this.scrollY = v;
        }
        this.writeToggle = !this.writeToggle;
        break;
      case 6:
        if (!this.writeToggle) {
          this.addrHi = v & 0x3f;
        } else {
          this.vramAddr = ((this.addrHi << 8) | v) & 0x3fff;
        }
        this.writeToggle = !this.writeToggle;
        break;
      case 7:
        this.writeVram(v);
        break;
    }
  }

  private readVram(): number {
    const addr = this.vramAddr & 0x3fff;
    this.incrementVramAddr();

    if (addr >= 0x3f00) {
      this.readBuffer = this.vram[this.mirrorNametable(addr)] ?? 0;
      return this.palette[addr & 0x1f] ?? 0;
    }

    if (addr < 0x2000) {
      const buffered = this.readBuffer;
      this.readBuffer = this.chrRam[addr & 0x1fff] ?? 0;
      return buffered;
    }

    const buffered = this.readBuffer;
    this.readBuffer = this.vram[this.mirrorNametable(addr)] ?? 0;
    return buffered;
  }

  private writeVram(value: number): void {
    const addr = this.vramAddr & 0x3fff;
    this.incrementVramAddr();

    if (addr >= 0x3f00) {
      const palIdx = addr & 0x1f;
      this.palette[palIdx] = value;
      if ((palIdx & 0x03) === 0) {
        this.palette[palIdx ^ 0x10] = value;
      }
    } else if (addr < 0x2000) {
      this.chrRam[addr & 0x1fff] = value;
    } else {
      this.vram[this.mirrorNametable(addr)] = value;
    }
  }

  private incrementVramAddr(): void {
    this.vramAddr = (this.vramAddr + ((this.ctrl & 0x04) !== 0 ? 32 : 1)) & 0x3fff;
  }

  /** ネームテーブルミラーリング (スタブ段階では垂直ミラー相当: NT0=NT2, NT1=NT3) */
  private mirrorNametable(addr: number): number {
    return (addr - 0x2000) & (VRAM_SIZE - 1);
  }
}
