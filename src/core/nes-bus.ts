/**
 * NES CPU バスの具象実装。
 *
 * CPU から見える 16bit アドレス空間をメモリマップに従って各デバイスに dispatch する。
 * 仕様参照: https://www.nesdev.org/wiki/CPU_memory_map
 */

import type { Bus } from "./bus.ts";
import type { Cart } from "./cart.ts";
import type { Controller } from "./controller.ts";
import type { Ppu } from "./ppu.ts";

const RAM_SIZE = 0x800;

export class NesBus implements Bus {
  private readonly ram = new Uint8Array(RAM_SIZE);
  private readonly apuIo = new Uint8Array(0x18);

  /** OAM DMA 転送で消費する CPU サイクル (0 = DMA なし) */
  dmaCycles = 0;

  constructor(
    private readonly ppu: Ppu,
    private readonly cart: Cart,
    private readonly controller1: Controller,
  ) {}

  read(addr: number): number {
    addr &= 0xffff;

    if (addr < 0x2000) {
      return this.ram[addr & 0x7ff] ?? 0;
    }
    if (addr < 0x4000) {
      return this.ppu.read(addr & 0x7);
    }
    if (addr === 0x4016) {
      return this.controller1.read();
    }
    if (addr < 0x4018) {
      return this.apuIo[addr - 0x4000] ?? 0;
    }
    if (addr < 0x4020) {
      return 0;
    }
    if (addr >= 0x8000) {
      return this.cart.prgRom[(addr - 0x8000) % this.cart.prgRom.length] ?? 0;
    }
    return 0;
  }

  write(addr: number, value: number): void {
    addr &= 0xffff;
    const v = value & 0xff;

    if (addr < 0x2000) {
      this.ram[addr & 0x7ff] = v;
      return;
    }
    if (addr < 0x4000) {
      this.ppu.write(addr & 0x7, v);
      return;
    }
    if (addr === 0x4014) {
      this.executeDma(v);
      return;
    }
    if (addr === 0x4016) {
      this.controller1.write(v);
      return;
    }
    if (addr < 0x4018) {
      this.apuIo[addr - 0x4000] = v;
      return;
    }
  }

  /** $4014 OAM DMA: CPU ページから 256 バイトを PPU OAM に転送 */
  private executeDma(page: number): void {
    const base = (page & 0xff) << 8;
    for (let i = 0; i < 256; i++) {
      this.ppu.oam[(this.ppu.oamAddr + i) & 0xff] = this.read(base + i);
    }
    this.dmaCycles = 513;
  }
}
