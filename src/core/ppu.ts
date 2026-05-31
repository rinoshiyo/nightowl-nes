/**
 * PPU (Picture Processing Unit)。
 *
 * レジスタ I/O ($2000-$2007) + スキャンライン描画エンジン。
 * 仕様参照: https://www.nesdev.org/wiki/PPU_rendering
 */

const CHR_RAM_SIZE = 0x2000;
const VRAM_SIZE = 0x800;
const PALETTE_SIZE = 0x20;
const OAM_SIZE = 256;

const DOTS_PER_LINE = 341;
export const VISIBLE_LINES = 240;
const VBLANK_LINE = 241;
const PRE_RENDER_LINE = 261;
const TOTAL_LINES = 262;
export const SCREEN_W = 256;

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

  /** 256×240 フレームバッファ (NES カラーインデックス 0-63) */
  readonly framebuffer = new Uint8Array(SCREEN_W * VISIBLE_LINES);

  /** 現在のドット位置 (0-340) */
  dot = 0;
  /** 現在のスキャンライン (0-261) */
  scanline = 0;
  /** フレーム完了フラグ (1 フレーム描画終了時に true) */
  frameComplete = false;

  /** NMI 通知コールバック */
  onNmi: (() => void) | null = null;

  /** 背景 fetch 用の内部バッファ */
  private bgNametable = 0;
  private bgAttribute = 0;
  private bgPatternLo = 0;
  private bgPatternHi = 0;

  /** 背景カラーインデックス (0=透明) — sprite 0 hit / priority 判定用 */
  private bgColorIdx = 0;

  /** secondary OAM (スキャンラインごとの最大 8 スプライト × 4 バイト) */
  private readonly secOam = new Uint8Array(32);
  /** スプライトパターンキャッシュ (evaluateSprites で fetch 済み) */
  private readonly sprPatternLo = new Uint8Array(8);
  private readonly sprPatternHi = new Uint8Array(8);
  /** 現スキャンラインの有効スプライト数 */
  private spriteCount = 0;
  /** sprite 0 が secondary OAM に含まれるか */
  private sprite0InLine = false;

  /** PPU 状態をリセット */
  reset(): void {
    this.ctrl = 0;
    this.mask = 0;
    this.status = 0;
    this.oamAddr = 0;
    this.writeToggle = false;
    this.scrollX = 0;
    this.scrollY = 0;
    this.addrHi = 0;
    this.vramAddr = 0;
    this.readBuffer = 0;
    this.dot = 0;
    this.scanline = 0;
    this.frameComplete = false;
    this.bgNametable = 0;
    this.bgAttribute = 0;
    this.bgPatternLo = 0;
    this.bgPatternHi = 0;
    this.bgColorIdx = 0;
    this.spriteCount = 0;
    this.sprite0InLine = false;
  }

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
    switch (reg) {
      case 0:
        this.ctrl = value;
        break;
      case 1:
        this.mask = value;
        break;
      case 3:
        this.oamAddr = value;
        break;
      case 4:
        this.oam[this.oamAddr] = value;
        this.oamAddr = (this.oamAddr + 1) & 0xff;
        break;
      case 5:
        if (!this.writeToggle) {
          this.scrollX = value;
        } else {
          this.scrollY = value;
        }
        this.writeToggle = !this.writeToggle;
        break;
      case 6:
        if (!this.writeToggle) {
          this.addrHi = value & 0x3f;
        } else {
          this.vramAddr = ((this.addrHi << 8) | value) & 0x3fff;
        }
        this.writeToggle = !this.writeToggle;
        break;
      case 7:
        this.writeVram(value);
        break;
    }
  }

  /** PPU を 1 ドット進める */
  tick(): void {
    if (this.scanline < VISIBLE_LINES) {
      this.tickVisible();
    } else if (this.scanline === VBLANK_LINE && this.dot === 1) {
      this.status |= 0x80;
      if ((this.ctrl & 0x80) !== 0 && this.onNmi) {
        this.onNmi();
      }
    } else if (this.scanline === PRE_RENDER_LINE && this.dot === 1) {
      this.status &= 0x1f;
    }

    this.dot++;
    if (this.dot >= DOTS_PER_LINE) {
      this.dot = 0;
      this.scanline++;
      if (this.scanline >= TOTAL_LINES) {
        this.scanline = 0;
        this.frameComplete = true;
      }
    }
  }

  /** 可視ライン (0-239) の描画処理 */
  private tickVisible(): void {
    const dot = this.dot;

    if (dot === 1) {
      this.evaluateSprites();
    }

    if (dot < 1 || dot > SCREEN_W) return;

    const x = dot - 1;
    if ((x & 7) === 0) {
      this.fetchBgTile(x >> 3);
    }

    const fbIdx = this.scanline * SCREEN_W + x;
    this.renderBgPixel(x, fbIdx);
    this.renderSpritePixel(x, fbIdx);
  }

  /** 背景タイル 1 つ分の fetch (NT → AT → pattern lo → pattern hi) */
  private fetchBgTile(tileX: number): void {
    const scanline = this.scanline;
    const coarseX = tileX & 0x1f;
    const coarseY = (scanline >> 3) & 0x1f;
    const fineY = scanline & 7;

    const ntBase = 0x2000 + ((this.ctrl & 0x03) << 10);
    const ntAddr = ntBase + coarseY * 32 + coarseX;
    this.bgNametable = this.ppuRead(ntAddr);

    const atAddr = ntBase + 0x03c0 + ((coarseY >> 2) << 3) + (coarseX >> 2);
    const atByte = this.ppuRead(atAddr);
    const atShift = ((coarseY & 2) << 1) | (coarseX & 2);
    this.bgAttribute = (atByte >> atShift) & 0x03;

    const ptBase = (this.ctrl & 0x10) !== 0 ? 0x1000 : 0;
    const ptAddr = ptBase + this.bgNametable * 16 + fineY;
    this.bgPatternLo = this.ppuRead(ptAddr);
    this.bgPatternHi = this.ppuRead(ptAddr + 8);
  }

  /** 背景ピクセルを framebuffer に出力 */
  private renderBgPixel(x: number, fbIdx: number): void {
    if ((this.mask & 0x08) === 0) {
      this.framebuffer[fbIdx] = this.palette[0] ?? 0;
      this.bgColorIdx = 0;
      return;
    }

    const bitPos = 7 - (x & 7);
    const lo = (this.bgPatternLo >> bitPos) & 1;
    const hi = (this.bgPatternHi >> bitPos) & 1;
    const colorIdx = (hi << 1) | lo;
    this.bgColorIdx = colorIdx;

    const palAddr = colorIdx === 0 ? 0 : (this.bgAttribute << 2) | colorIdx;
    this.framebuffer[fbIdx] = this.palette[palAddr] ?? 0;
  }

  /** スキャンラインごとのスプライト評価 (OAM から最大 8 スプライトを secondary OAM に選出) */
  private evaluateSprites(): void {
    const spriteHeight = 8;
    const ptBase = (this.ctrl & 0x08) !== 0 ? 0x1000 : 0;
    this.spriteCount = 0;
    this.sprite0InLine = false;

    for (let i = 0; i < 64; i++) {
      const y = this.oam[i * 4] ?? 0;
      const row = this.scanline - y - 1;
      if (row < 0 || row >= spriteHeight) continue;

      if (this.spriteCount < 8) {
        if (i === 0) this.sprite0InLine = true;
        const idx = this.spriteCount;
        const base = idx * 4;
        const tileIdx = this.oam[i * 4 + 1] ?? 0;
        const attr = this.oam[i * 4 + 2] ?? 0;
        this.secOam[base] = y;
        this.secOam[base + 1] = tileIdx;
        this.secOam[base + 2] = attr;
        this.secOam[base + 3] = this.oam[i * 4 + 3] ?? 0;

        const fineY = (attr & 0x80) !== 0 ? 7 - row : row;
        const patAddr = ptBase + tileIdx * 16 + fineY;
        this.sprPatternLo[idx] = this.ppuRead(patAddr);
        this.sprPatternHi[idx] = this.ppuRead(patAddr + 8);

        this.spriteCount++;
      } else {
        this.status |= 0x20;
        break;
      }
    }
  }

  /** スプライトピクセルを framebuffer に合成 */
  private renderSpritePixel(x: number, fbIdx: number): void {
    if ((this.mask & 0x10) === 0) return;

    const bgOpaque = this.bgColorIdx !== 0;

    for (let i = this.spriteCount - 1; i >= 0; i--) {
      const base = i * 4;
      const attr = this.secOam[base + 2] ?? 0;
      const sprX = this.secOam[base + 3] ?? 0;

      const col = x - sprX;
      if (col < 0 || col >= 8) continue;

      const fineX = (attr & 0x40) !== 0 ? col : 7 - col;
      const lo = ((this.sprPatternLo[i] ?? 0) >> fineX) & 1;
      const hi = ((this.sprPatternHi[i] ?? 0) >> fineX) & 1;
      const colorIdx = (hi << 1) | lo;

      if (colorIdx === 0) continue;

      const palAddr = 0x10 + ((attr & 0x03) << 2) + colorIdx;

      if (this.sprite0InLine && i === 0 && bgOpaque && x < 255) {
        if ((this.mask & 0x08) !== 0) {
          this.status |= 0x40;
        }
      }

      const behindBg = (attr & 0x20) !== 0;
      if (!behindBg || !bgOpaque) {
        this.framebuffer[fbIdx] = this.palette[palAddr] ?? 0;
      }
    }
  }

  /** PPU アドレス空間の read (CHR + VRAM + パレット) */
  ppuRead(addr: number): number {
    addr &= 0x3fff;
    if (addr < 0x2000) {
      return this.chrRam[addr] ?? 0;
    }
    if (addr < 0x3f00) {
      return this.vram[this.mirrorNametable(addr)] ?? 0;
    }
    return this.palette[addr & 0x1f] ?? 0;
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

  /** ネームテーブルミラーリング (垂直ミラー: NT0=NT2, NT1=NT3) */
  private mirrorNametable(addr: number): number {
    return (addr - 0x2000) & (VRAM_SIZE - 1);
  }
}
