/**
 * PPU (Picture Processing Unit)。
 *
 * レジスタ I/O ($2000-$2007) + スキャンライン描画エンジン。
 * loopy レジスタ (v/t/x/w) ベースのスクロール実装。
 * 仕様参照: https://www.nesdev.org/wiki/PPU_scrolling
 *
 * loopy v/t bit layout (15 bit):
 *   yyy NN YYYYY XXXXX
 *   ||| || ||||| +++++-- coarse X scroll (0-31)
 *   ||| || +++++------- coarse Y scroll (0-29)
 *   ||| ++------------ nametable select (2 bit)
 *   +++--------------- fine Y scroll (0-7)
 */

import type { Mirroring } from "./cart.ts";
import type { Mapper } from "./mappers/index.ts";

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
  /** ネームテーブルミラーリングモード (カートから設定) */
  mirroring: Mirroring = "vertical";
  /** CHR ROM/RAM アクセスを委譲する Mapper (null 時は内部 chrRam を使用) */
  mapper: Mapper | null = null;

  /** $2000 PPUCTRL */
  ctrl = 0;
  /** $2001 PPUMASK */
  mask = 0;
  /** $2002 PPUSTATUS — bit7: vblank, bit6: sprite 0 hit, bit5: sprite overflow */
  status = 0;
  /** $2003 OAMADDR */
  oamAddr = 0;

  /** loopy v — current VRAM address (15 bit) */
  v = 0;
  /** loopy t — temporary VRAM address (15 bit) */
  t = 0;
  /** loopy x — fine X scroll (3 bit) */
  x = 0;
  /** loopy w — write toggle (false = 1st write, true = 2nd write) */
  w = false;

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

  /** scanline 開始時の v 水平成分 (coarseX + NT X bit) — 描画用 */
  private slInitCoarseX = 0;
  private slInitNtX = 0;

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
    this.v = 0;
    this.t = 0;
    this.x = 0;
    this.w = false;
    this.readBuffer = 0;
    this.dot = 0;
    this.scanline = 0;
    this.frameComplete = false;
    this.bgNametable = 0;
    this.bgAttribute = 0;
    this.bgPatternLo = 0;
    this.bgPatternHi = 0;
    this.bgFetchedCol = -1;
    this.bgColorIdx = 0;
    this.slInitCoarseX = 0;
    this.slInitNtX = 0;
    this.spriteCount = 0;
    this.sprite0InLine = false;
  }

  // --- loopy ヘルパー (v/t の bit field 操作) ---

  /** v/t から coarse X を取得 (bit 0-4) */
  static coarseX(reg: number): number { return reg & 0x1f; }
  /** v/t から coarse Y を取得 (bit 5-9) */
  static coarseY(reg: number): number { return (reg >> 5) & 0x1f; }
  /** v/t から NT 選択を取得 (bit 10-11) */
  static ntSelect(reg: number): number { return (reg >> 10) & 0x03; }
  /** v/t から fine Y を取得 (bit 12-14) */
  static fineY(reg: number): number { return (reg >> 12) & 0x07; }

  /** v/t に coarse X を設定 */
  static setCoarseX(reg: number, val: number): number {
    return (reg & ~0x1f) | (val & 0x1f);
  }
  /** v/t に coarse Y を設定 */
  static setCoarseY(reg: number, val: number): number {
    return (reg & ~0x03e0) | ((val & 0x1f) << 5);
  }
  /** v/t に fine Y を設定 */
  static setFineY(reg: number, val: number): number {
    return (reg & ~0x7000) | ((val & 0x07) << 12);
  }

  /** hori(v) = hori(t): coarse X + NT X bit をコピー */
  private copyHorizontal(): void {
    this.v = (this.v & ~0x041f) | (this.t & 0x041f);
  }

  /** vert(v) = vert(t): coarse Y + fine Y + NT Y bit をコピー */
  private copyVertical(): void {
    this.v = (this.v & ~0x7be0) | (this.t & 0x7be0);
  }

  /** coarse X increment */
  private incrementCoarseX(): void {
    if ((this.v & 0x1f) === 31) {
      this.v &= ~0x1f;
      this.v ^= 0x0400;
    } else {
      this.v++;
    }
  }

  /** Y increment (fine Y → coarse Y → NT Y 切替) */
  private incrementY(): void {
    if ((this.v & 0x7000) !== 0x7000) {
      this.v += 0x1000;
    } else {
      this.v &= ~0x7000;
      let y = (this.v & 0x03e0) >> 5;
      if (y === 29) {
        y = 0;
        this.v ^= 0x0800;
      } else if (y === 31) {
        y = 0;
      } else {
        y++;
      }
      this.v = (this.v & ~0x03e0) | (y << 5);
    }
  }

  // --- 後方互換ヘルパー (テスト用に loopy レジスタ経由でスクロール値を設定) ---

  /** loopy t/x から scrollX 相当の値を取得 */
  get scrollX(): number {
    return (Ppu.coarseX(this.t) << 3) | this.x;
  }
  /** scrollX 相当の値を loopy t/x に設定 */
  set scrollX(val: number) {
    this.t = Ppu.setCoarseX(this.t, val >> 3);
    this.x = val & 0x07;
  }

  /** loopy t から scrollY 相当の値を取得 */
  get scrollY(): number {
    return (Ppu.coarseY(this.t) << 3) | Ppu.fineY(this.t);
  }
  /** scrollY 相当の値を loopy t に設定 (240 以上で NT Y フリップ) */
  set scrollY(val: number) {
    let coarseY = val >> 3;
    const fineY = val & 0x07;
    // ctrl 由来の NT Y を基準に、scroll >= 240 なら相対フリップ
    const baseNtY = (this.ctrl & 0x02) !== 0 ? 0x0800 : 0;
    let scrollNtY = 0;
    if (coarseY >= 30) {
      coarseY -= 30;
      scrollNtY = 0x0800;
    }
    this.t = (this.t & ~0x0800) | (baseNtY ^ scrollNtY);
    this.t = Ppu.setCoarseY(this.t, coarseY);
    this.t = Ppu.setFineY(this.t, fineY);
  }

  /** $2000-$2007 の read (addr は 0-7 にマスク済みで渡される想定) */
  read(reg: number): number {
    switch (reg) {
      case 2: {
        const val = this.status;
        this.status &= 0x7f;
        this.w = false;
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
        // NT 選択 bit (bit 0-1) を t の bit 10-11 に反映
        this.t = (this.t & ~0x0c00) | ((value & 0x03) << 10);
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
        if (!this.w) {
          // 1st write: fine X → x, coarse X → t
          this.x = value & 0x07;
          this.t = Ppu.setCoarseX(this.t, value >> 3);
        } else {
          // 2nd write: fine Y → t[12:14], coarse Y → t[5:9]
          this.t = Ppu.setFineY(this.t, value & 0x07);
          this.t = Ppu.setCoarseY(this.t, value >> 3);
        }
        this.w = !this.w;
        break;
      case 6:
        if (!this.w) {
          // 1st write: hi byte → t (bit 8-14、bit 15 クリア)
          this.t = (this.t & 0x00ff) | ((value & 0x3f) << 8);
        } else {
          // 2nd write: lo byte → t、t → v
          this.t = (this.t & 0xff00) | value;
          this.v = this.t;
        }
        this.w = !this.w;
        break;
      case 7:
        this.writeVram(value);
        break;
    }
  }

  /** PPU を 1 ドット進める */
  tick(): void {
    const renderEnabled = (this.mask & 0x18) !== 0;

    if (this.scanline < VISIBLE_LINES) {
      this.tickVisible();
      if (renderEnabled) this.tickScrollVisible();
    } else if (this.scanline === VBLANK_LINE && this.dot === 1) {
      this.status |= 0x80;
      if ((this.ctrl & 0x80) !== 0 && this.onNmi) {
        this.onNmi();
      }
    } else if (this.scanline === PRE_RENDER_LINE) {
      if (this.dot === 1) {
        this.status &= 0x1f;
      }
      if (renderEnabled) this.tickScrollPreRender();
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

  /** 可視スキャンライン (0-239) のスクロール更新 */
  private tickScrollVisible(): void {
    const dot = this.dot;
    if (dot >= 1 && dot <= 256) {
      if ((dot & 0x07) === 0) {
        this.incrementCoarseX();
      }
      if (dot === 256) {
        this.incrementY();
      }
    }
    if (dot === 257) {
      this.copyHorizontal();
    }
  }

  /** pre-render scanline のスクロール更新 */
  private tickScrollPreRender(): void {
    const dot = this.dot;
    if (dot >= 1 && dot <= 256) {
      if ((dot & 0x07) === 0) {
        this.incrementCoarseX();
      }
      if (dot === 256) {
        this.incrementY();
      }
    }
    if (dot === 257) {
      this.copyHorizontal();
    }
    if (dot >= 280 && dot <= 304) {
      this.copyVertical();
    }
  }

  /** 現在フェッチ済みの背景タイル列 (再フェッチ判定用) */
  private bgFetchedCol = -1;

  /** 可視ライン (0-239) の描画処理 */
  private tickVisible(): void {
    const dot = this.dot;

    if (dot === 0) {
      this.slInitCoarseX = Ppu.coarseX(this.v);
      this.slInitNtX = (Ppu.ntSelect(this.v) & 1);
      this.bgFetchedCol = -1;
    }
    if (dot === 1) {
      this.evaluateSprites();
    }

    if (dot < 1 || dot > SCREEN_W) return;

    const screenX = dot - 1;
    const fbIdx = this.scanline * SCREEN_W + screenX;
    this.renderBgPixel(screenX, fbIdx);
    this.renderSpritePixel(screenX, fbIdx);
  }

  /**
   * 背景ピクセルを framebuffer に出力。
   * scanline 開始時の水平スクロール値 + screenX + fine X からタイル位置を計算。
   * v の coarseX increment は状態管理用で、描画には初期値を使う。
   */
  private renderBgPixel(screenX: number, fbIdx: number): void {
    if ((this.mask & 0x08) === 0) {
      this.framebuffer[fbIdx] = this.palette[0] ?? 0;
      this.bgColorIdx = 0;
      return;
    }

    const totalX = this.slInitCoarseX * 8 + this.x + screenX;
    const tileCol = (totalX >> 3) & 0x1f;
    const ntXFlip = (totalX >> 8) & 1;
    const fineX = totalX & 0x07;

    const ntY = (Ppu.ntSelect(this.v) >> 1) & 1;
    const ntSelect = (ntY << 1) | (this.slInitNtX ^ ntXFlip);
    const coarseY = Ppu.coarseY(this.v);
    const fineY = Ppu.fineY(this.v);

    const fetchKey = (ntSelect << 15) | (coarseY << 10) | (tileCol << 5) | fineY;
    if (fetchKey !== this.bgFetchedCol) {
      this.bgFetchedCol = fetchKey;
      this.fetchBgTileLoopy(tileCol, coarseY, fineY, ntSelect);
    }

    const bitPos = 7 - fineX;
    const lo = (this.bgPatternLo >> bitPos) & 1;
    const hi = (this.bgPatternHi >> bitPos) & 1;
    const colorIdx = (hi << 1) | lo;
    this.bgColorIdx = colorIdx;

    const palAddr = colorIdx === 0 ? 0 : (this.bgAttribute << 2) | colorIdx;
    this.framebuffer[fbIdx] = this.palette[palAddr] ?? 0;
  }

  /** 背景タイル fetch (loopy ベース) */
  private fetchBgTileLoopy(coarseX: number, coarseY: number, fineY: number, ntSelect: number): void {
    const ntBase = 0x2000 + (ntSelect << 10);
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

        const sprFineY = (attr & 0x80) !== 0 ? 7 - row : row;
        const patAddr = ptBase + tileIdx * 16 + sprFineY;
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
  private renderSpritePixel(screenX: number, fbIdx: number): void {
    if ((this.mask & 0x10) === 0) return;

    const bgOpaque = this.bgColorIdx !== 0;

    for (let i = this.spriteCount - 1; i >= 0; i--) {
      const base = i * 4;
      const attr = this.secOam[base + 2] ?? 0;
      const sprX = this.secOam[base + 3] ?? 0;

      const col = screenX - sprX;
      if (col < 0 || col >= 8) continue;

      const sprFineX = (attr & 0x40) !== 0 ? col : 7 - col;
      const lo = ((this.sprPatternLo[i] ?? 0) >> sprFineX) & 1;
      const hi = ((this.sprPatternHi[i] ?? 0) >> sprFineX) & 1;
      const colorIdx = (hi << 1) | lo;

      if (colorIdx === 0) continue;

      const palAddr = 0x10 + ((attr & 0x03) << 2) + colorIdx;

      if (this.sprite0InLine && i === 0 && bgOpaque && screenX < 255) {
        this.status |= 0x40;
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
      if (this.mapper) return this.mapper.readChr(addr);
      return this.chrRam[addr] ?? 0;
    }
    if (addr < 0x3f00) {
      return this.vram[this.mirrorNametable(addr)] ?? 0;
    }
    return this.palette[addr & 0x1f] ?? 0;
  }

  private readVram(): number {
    const addr = this.v & 0x3fff;
    this.incrementVramAddr();

    if (addr >= 0x3f00) {
      this.readBuffer = this.vram[this.mirrorNametable(addr)] ?? 0;
      return this.palette[addr & 0x1f] ?? 0;
    }

    if (addr < 0x2000) {
      const buffered = this.readBuffer;
      this.readBuffer = this.mapper
        ? this.mapper.readChr(addr)
        : (this.chrRam[addr & 0x1fff] ?? 0);
      return buffered;
    }

    const buffered = this.readBuffer;
    this.readBuffer = this.vram[this.mirrorNametable(addr)] ?? 0;
    return buffered;
  }

  private writeVram(value: number): void {
    const addr = this.v & 0x3fff;
    this.incrementVramAddr();

    if (addr >= 0x3f00) {
      const palIdx = addr & 0x1f;
      this.palette[palIdx] = value;
      if ((palIdx & 0x03) === 0) {
        this.palette[palIdx ^ 0x10] = value;
      }
    } else if (addr < 0x2000) {
      if (this.mapper) {
        this.mapper.writeChr(addr, value);
      } else {
        this.chrRam[addr & 0x1fff] = value;
      }
    } else {
      this.vram[this.mirrorNametable(addr)] = value;
    }
  }

  private incrementVramAddr(): void {
    this.v = (this.v + ((this.ctrl & 0x04) !== 0 ? 32 : 1)) & 0x7fff;
  }

  /** ネームテーブルミラーリング (VRAM 2KB 内オフセットを返す) */
  private mirrorNametable(addr: number): number {
    const relative = (addr - 0x2000) & 0xfff;
    if (this.mirroring === "vertical") {
      return relative & 0x7ff;
    }
    return ((relative & 0x800) >> 1) | (relative & 0x3ff);
  }
}
