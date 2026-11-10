import {
  MEMORY_SIZE,
  VRAM_BASE,
  VRAM_COLS,
  VRAM_ROWS,
  IVT_BASE,
  BOOTLOADER_ADDR,
  STACK_TOP,
  PORT_KBD_DATA,
  PORT_KBD_STATUS,
  PORT_VGA_INDEX,
  PORT_VGA_DATA,
  COLOR_LIGHT_GRAY,
  COLOR_BLACK,
} from './constants';

export interface CPUFlags {
  carry: boolean;
  zero: boolean;
  sign: boolean;
  overflow: boolean;
  interrupt: boolean;
}

export class CPU {
  public memory: Uint8Array;
  public ports: Uint8Array;

  // Registers
  public AX: number = 0;
  public BX: number = 0;
  public CX: number = 0;
  public DX: number = 0;
  public SI: number = 0;
  public DI: number = 0;
  public BP: number = STACK_TOP;
  public SP: number = STACK_TOP;
  public IP: number = BOOTLOADER_ADDR;
  public CS: number = 0x0000;
  public DS: number = 0x0000;
  public SS: number = 0x0000;
  public ES: number = 0x0000;

  public flags: CPUFlags = {
    carry: false,
    zero: false,
    sign: false,
    overflow: false,
    interrupt: true,
  };

  public halted: boolean = false;
  public cycleCount: number = 0;
  public pendingInterrupts: number[] = [];

  // Hardware Cursor
  public cursorCol: number = 0;
  public cursorRow: number = 0;
  public currentAttr: number = (COLOR_BLACK << 4) | COLOR_LIGHT_GRAY;

  // Terminal History Scrollback Buffer
  public scrollback: Array<{ chars: Uint8Array; attrs: Uint8Array }> = [];
  public scrollbackOffset: number = 0; // 0 = live bottom, > 0 = scrolled up N lines
  private displayBuffer: Uint8Array = new Uint8Array(MEMORY_SIZE);

  public interruptHandlers: Map<number, () => void> = new Map();

  public installInterruptHandler(intNum: number, handler: () => void): void {
    this.interruptHandlers.set(intNum, handler);
  }

  public inb(port: number): number {
    return this.readPort(port);
  }

  public outb(port: number, val: number): void {
    this.writePort(port, val);
  }

  public interrupt(intNum: number): void {
    const handler = this.interruptHandlers.get(intNum);
    if (handler) {
      handler();
    }
    this.dispatchInterrupt(intNum);
  }

  constructor() {
    this.memory = new Uint8Array(MEMORY_SIZE);
    this.ports = new Uint8Array(65536);
    this.initVRAM();
    this.initIVT();
  }

  public reset(entryPoint: number = BOOTLOADER_ADDR): void {
    this.AX = 0;
    this.BX = 0;
    this.CX = 0;
    this.DX = 0;
    this.SI = 0;
    this.DI = 0;
    this.BP = STACK_TOP;
    this.SP = STACK_TOP;
    this.IP = entryPoint;
    this.CS = 0;
    this.DS = 0;
    this.SS = 0;
    this.ES = 0;
    this.flags = {
      carry: false,
      zero: false,
      sign: false,
      overflow: false,
      interrupt: true,
    };
    this.halted = false;
    this.cycleCount = 0;
    this.pendingInterrupts = [];
    this.cursorCol = 0;
    this.cursorRow = 0;
    this.initVRAM();
  }

  public initVRAM(): void {
    // Fill VRAM with spaces (0x20) and standard attribute (0x07 = light gray on black)
    for (let i = 0; i < VRAM_COLS * VRAM_ROWS; i++) {
      const offset = VRAM_BASE + i * 2;
      this.memory[offset] = 0x20; // ' '
      this.memory[offset + 1] = 0x07;
    }
  }

  public initIVT(): void {
    // Setup initial default vectors
    for (let i = 0; i < 256; i++) {
      this.setIVT(i, 0x0000, 0xF000 + i * 4);
    }
  }

  public setIVT(intNum: number, cs: number, ip: number): void {
    const offset = IVT_BASE + intNum * 4;
    this.memory[offset] = ip & 0xFF;
    this.memory[offset + 1] = (ip >> 8) & 0xFF;
    this.memory[offset + 2] = cs & 0xFF;
    this.memory[offset + 3] = (cs >> 8) & 0xFF;
  }

  public getIVT(intNum: number): { cs: number; ip: number } {
    const offset = IVT_BASE + intNum * 4;
    const ip = this.memory[offset] | (this.memory[offset + 1] << 8);
    const cs = this.memory[offset + 2] | (this.memory[offset + 3] << 8);
    return { cs, ip };
  }

  public readWord(addr: number): number {
    const a = addr & 0xFFFF;
    const lo = this.memory[a];
    const hi = this.memory[(a + 1) & 0xFFFF];
    return (hi << 8) | lo;
  }

  public writeWord(addr: number, val: number): void {
    const a = addr & 0xFFFF;
    this.memory[a] = val & 0xFF;
    this.memory[(a + 1) & 0xFFFF] = (val >> 8) & 0xFF;
  }

  public push(val: number): void {
    this.SP = (this.SP - 2) & 0xFFFF;
    this.writeWord(this.SP, val);
  }

  public pop(): number {
    const val = this.readWord(this.SP);
    this.SP = (this.SP + 2) & 0xFFFF;
    return val;
  }

  public triggerInterrupt(intNum: number): void {
    this.pendingInterrupts.push(intNum);
  }

  public step(): boolean {
    if (this.halted) {
      if (this.pendingInterrupts.length > 0 && this.flags.interrupt) {
        this.halted = false;
      } else {
        return false;
      }
    }

    // Process pending hardware/software interrupts
    if (this.pendingInterrupts.length > 0 && this.flags.interrupt) {
      const intNum = this.pendingInterrupts.shift()!;
      this.dispatchInterrupt(intNum);
      return true;
    }

    const pc = this.IP;
    const opcode = this.memory[pc];
    this.IP = (this.IP + 1) & 0xFFFF;
    this.cycleCount++;

    switch (opcode) {
      case 0x90: // NOP
        break;

      case 0xFA: // CLI
        this.flags.interrupt = false;
        break;

      case 0xFB: // STI
        this.flags.interrupt = true;
        break;

      case 0xF4: // HLT
        this.halted = true;
        break;

      case 0xB8: // MOV AX, imm16
        this.AX = this.readWord(this.IP);
        this.IP = (this.IP + 2) & 0xFFFF;
        break;

      case 0xBB: // MOV BX, imm16
        this.BX = this.readWord(this.IP);
        this.IP = (this.IP + 2) & 0xFFFF;
        break;

      case 0xB9: // MOV CX, imm16
        this.CX = this.readWord(this.IP);
        this.IP = (this.IP + 2) & 0xFFFF;
        break;

      case 0xBA: // MOV DX, imm16
        this.DX = this.readWord(this.IP);
        this.IP = (this.IP + 2) & 0xFFFF;
        break;

      case 0xBE: // MOV SI, imm16
        this.SI = this.readWord(this.IP);
        this.IP = (this.IP + 2) & 0xFFFF;
        break;

      case 0xBF: // MOV DI, imm16
        this.DI = this.readWord(this.IP);
        this.IP = (this.IP + 2) & 0xFFFF;
        break;

      case 0x01: { // ADD reg, reg (simulated custom opcode for clarity)
        const dst = this.memory[this.IP++];
        const src = this.memory[this.IP++];
        this.AX = (this.AX + this.BX) & 0xFFFF;
        this.flags.zero = this.AX === 0;
        this.flags.sign = (this.AX & 0x8000) !== 0;
        break;
      }

      case 0xEB: { // JMP rel8
        let offset = this.memory[this.IP++];
        if (offset & 0x80) offset -= 0x100; // Sign extend
        this.IP = (this.IP + offset) & 0xFFFF;
        break;
      }

      case 0xE9: { // JMP near imm16
        const offset = this.readWord(this.IP);
        this.IP = (this.IP + 2 + offset) & 0xFFFF;
        break;
      }

      case 0x74: { // JZ rel8
        let offset = this.memory[this.IP++];
        if (offset & 0x80) offset -= 0x100;
        if (this.flags.zero) {
          this.IP = (this.IP + offset) & 0xFFFF;
        }
        break;
      }

      case 0x75: { // JNZ rel8
        let offset = this.memory[this.IP++];
        if (offset & 0x80) offset -= 0x100;
        if (!this.flags.zero) {
          this.IP = (this.IP + offset) & 0xFFFF;
        }
        break;
      }

      case 0xCD: { // INT imm8
        const intNum = this.memory[this.IP++];
        this.dispatchInterrupt(intNum);
        break;
      }

      case 0xCF: { // IRET
        this.IP = this.pop();
        this.CS = this.pop();
        const f = this.pop();
        this.flags.carry = (f & 0x01) !== 0;
        this.flags.zero = (f & 0x40) !== 0;
        this.flags.sign = (f & 0x80) !== 0;
        this.flags.interrupt = (f & 0x200) !== 0;
        break;
      }

      case 0xE4: { // IN AL, imm8 (port)
        const port = this.memory[this.IP++];
        this.AX = (this.AX & 0xFF00) | this.readPort(port);
        break;
      }

      case 0xE6: { // OUT imm8, AL (port)
        const port = this.memory[this.IP++];
        this.writePort(port, this.AX & 0xFF);
        break;
      }

      default:
        // Default: advance PC
        break;
    }

    return true;
  }

  public dispatchInterrupt(intNum: number): void {
    // Pack flags
    let f = 0x0002; // Bit 1 is always 1 in 8086 FLAGS
    if (this.flags.carry) f |= 0x0001;
    if (this.flags.zero) f |= 0x0040;
    if (this.flags.sign) f |= 0x0080;
    if (this.flags.interrupt) f |= 0x0200;

    this.push(f);
    this.push(this.CS);
    this.push(this.IP);

    this.flags.interrupt = false; // Disable interrupts during ISR entry

    if (intNum === 0x10) {
      // BIOS INT 0x10: Video Services
      this.handleBiosVideo();
      this.IP = this.pop();
      this.CS = this.pop();
      this.pop(); // discard flags
      this.flags.interrupt = true;
      return;
    }

    const vector = this.getIVT(intNum);
    this.CS = vector.cs;
    this.IP = vector.ip;
  }

  public handleBiosVideo(): void {
    const ah = (this.AX >> 8) & 0xFF;
    const al = this.AX & 0xFF;

    if (ah === 0x0E) {
      // Teletype character output (AL = char)
      this.writeChar(String.fromCharCode(al), this.currentAttr);
    } else if (ah === 0x00) {
      // Set video mode (clear screen)
      this.initVRAM();
      this.cursorCol = 0;
      this.cursorRow = 0;
    } else if (ah === 0x02) {
      // Set cursor position (DH = row, DL = col)
      this.cursorRow = (this.DX >> 8) & 0xFF;
      this.cursorCol = this.DX & 0xFF;
    }
  }

  public writeChar(char: string, attr: number = 0x07): void {
    if (char === '\n') {
      this.cursorRow++;
      this.cursorCol = 0;
    } else if (char === '\r') {
      this.cursorCol = 0;
    } else if (char === '\t') {
      const nextTab = Math.min(VRAM_COLS, (Math.floor(this.cursorCol / 8) + 1) * 8);
      while (this.cursorCol < nextTab) {
        this.writeChar(' ', attr);
      }
      return;
    } else if (char === '\b') {
      if (this.cursorCol > 0) {
        this.cursorCol--;
        const offset = VRAM_BASE + (this.cursorRow * VRAM_COLS + this.cursorCol) * 2;
        this.memory[offset] = 0x20;
        this.memory[offset + 1] = attr;
      }
    } else {
      if (this.cursorCol >= VRAM_COLS) {
        this.cursorCol = 0;
        this.cursorRow++;
      }
      if (this.cursorRow >= VRAM_ROWS) {
        this.scrollVRAM();
        this.cursorRow = VRAM_ROWS - 1;
      }
      const offset = VRAM_BASE + (this.cursorRow * VRAM_COLS + this.cursorCol) * 2;
      this.memory[offset] = char.charCodeAt(0);
      this.memory[offset + 1] = attr;
      this.cursorCol++;
    }

    if (this.cursorRow >= VRAM_ROWS) {
      this.scrollVRAM();
      this.cursorRow = VRAM_ROWS - 1;
    }

    this.updateVgaCursor();
  }

  public printChar(charCodeOrChar: number | string, attr: number = 0x07): void {
    const char = typeof charCodeOrChar === 'number' ? String.fromCharCode(charCodeOrChar) : charCodeOrChar;
    this.writeChar(char, attr);
  }

  public printString(str: string, attr: number = 0x07): void {
    for (let i = 0; i < str.length; i++) {
      this.writeChar(str[i], attr);
    }
  }

  public scrollVRAM(): void {
    const bytesPerRow = VRAM_COLS * 2;

    // Save top row into scrollback history
    const rowChars = new Uint8Array(VRAM_COLS);
    const rowAttrs = new Uint8Array(VRAM_COLS);
    for (let c = 0; c < VRAM_COLS; c++) {
      rowChars[c] = this.memory[VRAM_BASE + c * 2];
      rowAttrs[c] = this.memory[VRAM_BASE + c * 2 + 1];
    }
    this.scrollback.push({ chars: rowChars, attrs: rowAttrs });
    if (this.scrollback.length > 2000) {
      this.scrollback.shift();
    }

    for (let r = 0; r < VRAM_ROWS - 1; r++) {
      const src = VRAM_BASE + (r + 1) * bytesPerRow;
      const dst = VRAM_BASE + r * bytesPerRow;
      for (let i = 0; i < bytesPerRow; i++) {
        this.memory[dst + i] = this.memory[src + i];
      }
    }
    // Clear last row
    const lastRow = VRAM_BASE + (VRAM_ROWS - 1) * bytesPerRow;
    for (let c = 0; c < VRAM_COLS; c++) {
      this.memory[lastRow + c * 2] = 0x20; // ' '
      this.memory[lastRow + c * 2 + 1] = 0x07;
    }
  }

  public pageUp(lines: number = 10): void {
    this.scrollbackOffset = Math.min(this.scrollback.length, this.scrollbackOffset + lines);
  }

  public pageDown(lines: number = 10): void {
    this.scrollbackOffset = Math.max(0, this.scrollbackOffset - lines);
  }

  public resetScroll(): void {
    this.scrollbackOffset = 0;
  }

  public getDisplayMemory(): Uint8Array {
    if (this.scrollbackOffset === 0) {
      return this.memory;
    }

    // Copy live memory
    this.displayBuffer.set(this.memory);

    // Calculate virtual rows
    const totalHistory = this.scrollback.length;
    for (let r = 0; r < VRAM_ROWS; r++) {
      // Virtual row index
      const v = totalHistory - this.scrollbackOffset + r;
      const rowOffset = VRAM_BASE + r * VRAM_COLS * 2;

      if (v < 0) {
        // Empty row above history
        for (let c = 0; c < VRAM_COLS; c++) {
          this.displayBuffer[rowOffset + c * 2] = 0x20;
          this.displayBuffer[rowOffset + c * 2 + 1] = 0x07;
        }
      } else if (v < totalHistory) {
        // Line from scrollback
        const item = this.scrollback[v];
        for (let c = 0; c < VRAM_COLS; c++) {
          this.displayBuffer[rowOffset + c * 2] = item.chars[c];
          this.displayBuffer[rowOffset + c * 2 + 1] = item.attrs[c];
        }
      } else {
        // Line from live VRAM
        const liveRow = v - totalHistory;
        const liveOffset = VRAM_BASE + liveRow * VRAM_COLS * 2;
        for (let c = 0; c < VRAM_COLS; c++) {
          this.displayBuffer[rowOffset + c * 2] = this.memory[liveOffset + c * 2];
          this.displayBuffer[rowOffset + c * 2 + 1] = this.memory[liveOffset + c * 2 + 1];
        }
      }
    }

    // Draw subtle scroll indicator on row 0 (right aligned)
    const indicator = ` [▲ SCROLL: -${this.scrollbackOffset}] `;
    const startCol = VRAM_COLS - indicator.length;
    const indOffset = VRAM_BASE + startCol * 2;
    for (let i = 0; i < indicator.length; i++) {
      this.displayBuffer[indOffset + i * 2] = indicator.charCodeAt(i);
      this.displayBuffer[indOffset + i * 2 + 1] = 0x70; // Black text on light gray background
    }

    return this.displayBuffer;
  }

  public updateVgaCursor(): void {
    const pos = this.cursorRow * VRAM_COLS + this.cursorCol;
    this.ports[PORT_VGA_DATA] = pos & 0xFF;
  }

  public readPort(port: number): number {
    return this.ports[port & 0xFFFF];
  }

  public writePort(port: number, val: number): void {
    const p = port & 0xFFFF;
    this.ports[p] = val & 0xFF;

    if (p === 0x3F8) { // COM1 output
      this.writeChar(String.fromCharCode(val & 0xFF));
    }
  }
}
