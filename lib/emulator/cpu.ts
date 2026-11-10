import { CPURegisters, CPUFlags, EmulatorStats, RegisterName } from './types';

export const MEMORY_SIZE = 65536; // 64 KB
export const VRAM_START = 0xB800;
export const VRAM_COLS = 80;
export const VRAM_ROWS = 25;
export const BOOTLOADER_ADDR = 0x7C00;
export const KERNEL_ENTRY_ADDR = 0x1000;

export enum Opcode {
  NOP = 0x00,
  MOV_REG_IMM = 0x01,  // [OP, REG_IDX, IMM_HI, IMM_LO]
  MOV_REG_REG = 0x02,  // [OP, DST_REG, SRC_REG]
  LOAD_MEM = 0x03,     // [OP, DST_REG, ADDR_HI, ADDR_LO]
  STORE_MEM = 0x04,    // [OP, SRC_REG, ADDR_HI, ADDR_LO]
  ADD = 0x05,          // [OP, DST_REG, SRC_REG]
  SUB = 0x06,          // [OP, DST_REG, SRC_REG]
  CMP = 0x07,          // [OP, REG1, REG2]
  JMP = 0x08,          // [OP, ADDR_HI, ADDR_LO]
  JZ = 0x09,           // [OP, ADDR_HI, ADDR_LO]
  JNZ = 0x0A,          // [OP, ADDR_HI, ADDR_LO]
  CALL = 0x0B,         // [OP, ADDR_HI, ADDR_LO]
  RET = 0x0C,          // [OP]
  PUSH = 0x0D,         // [OP, REG_IDX]
  POP = 0x0E,          // [OP, REG_IDX]
  INT = 0x0F,          // [OP, INT_NUM]
  HLT = 0x10,          // [OP]
  OUT_PORT = 0x11,     // [OP, PORT, REG_IDX]
  IN_PORT = 0x12,      // [OP, PORT, REG_IDX]
}

export const REG_MAP: Record<number, RegisterName> = {
  0: 'R0',
  1: 'R1',
  2: 'R2',
  3: 'R3',
  4: 'R4',
  5: 'R5',
  6: 'R6',
  7: 'R7',
  8: 'PC',
  9: 'SP',
  10: 'BP',
};

export class VirtualCPU {
  public memory: Uint8Array;
  public registers: CPURegisters;
  public stats: EmulatorStats;
  public ports: Record<number, number>;
  public ttyOutput: string[] = [];

  constructor() {
    this.memory = new Uint8Array(MEMORY_SIZE);
    this.registers = this.createDefaultRegisters();
    this.stats = {
      cycles: 0,
      instructionsExecuted: 0,
      uptimeSeconds: 0,
      clockSpeedHz: 100,
      halted: false,
      irqPending: null,
    };
    this.ports = {
      0x3F8: 0, // Serial / COM1
      0x60: 0,  // PS/2 Keyboard Data
    };
    this.initHardwareVectors();
  }

  private createDefaultRegisters(): CPURegisters {
    return {
      R0: 0,
      R1: 0,
      R2: 0,
      R3: 0,
      R4: 0,
      R5: 0,
      R6: 0,
      R7: 0,
      PC: BOOTLOADER_ADDR,
      SP: 0x7BFE,
      BP: 0x7BFE,
      flags: {
        zero: false,
        carry: false,
        sign: false,
        interrupt: true,
      },
    };
  }

  public reset(entryPoint: number = BOOTLOADER_ADDR): void {
    this.registers = this.createDefaultRegisters();
    this.registers.PC = entryPoint;
    this.stats.cycles = 0;
    this.stats.instructionsExecuted = 0;
    this.stats.halted = false;
    this.stats.irqPending = null;
    this.ttyOutput = [];
  }

  public initHardwareVectors(): void {
    // Write boot signature 0x55AA at 0x7DFE
    this.memory[0x7DFE] = 0x55;
    this.memory[0x7DFF] = 0xAA;

    // IVT 0x10 (Video Service vector -> 0xF000)
    this.writeWord(0x10 * 4, 0xF000);
    // IVT 0x20 (Timer vector -> 0xF100)
    this.writeWord(0x20 * 4, 0xF100);
    // IVT 0x80 (Kernel Syscall vector -> 0x1000)
    this.writeWord(0x80 * 4, KERNEL_ENTRY_ADDR);
  }

  public readWord(addr: number): number {
    const lo = this.memory[addr % MEMORY_SIZE];
    const hi = this.memory[(addr + 1) % MEMORY_SIZE];
    return (hi << 8) | lo;
  }

  public writeWord(addr: number, val: number): void {
    this.memory[addr % MEMORY_SIZE] = val & 0xFF;
    this.memory[(addr + 1) % MEMORY_SIZE] = (val >> 8) & 0xFF;
  }

  public getReg(idx: number): number {
    const name = REG_MAP[idx];
    if (!name) return 0;
    if (name === 'PC') return this.registers.PC;
    if (name === 'SP') return this.registers.SP;
    if (name === 'BP') return this.registers.BP;
    return this.registers[name];
  }

  public setReg(idx: number, val: number): void {
    const name = REG_MAP[idx];
    if (!name) return;
    const sanitized = val & 0xFFFF;
    if (name === 'PC') this.registers.PC = sanitized;
    else if (name === 'SP') this.registers.SP = sanitized;
    else if (name === 'BP') this.registers.BP = sanitized;
    else this.registers[name] = sanitized;
  }

  public push(val: number): void {
    this.registers.SP = (this.registers.SP - 2) & 0xFFFF;
    this.writeWord(this.registers.SP, val);
  }

  public pop(): number {
    const val = this.readWord(this.registers.SP);
    this.registers.SP = (this.registers.SP + 2) & 0xFFFF;
    return val;
  }

  public step(): boolean {
    if (this.stats.halted) return false;

    // Handle pending hardware IRQ
    if (this.stats.irqPending !== null && this.registers.flags.interrupt) {
      const irq = this.stats.irqPending;
      this.stats.irqPending = null;
      this.triggerInterrupt(irq);
    }

    const pc = this.registers.PC;
    const op = this.memory[pc];
    this.registers.PC = (this.registers.PC + 1) & 0xFFFF;
    this.stats.cycles += 1;
    this.stats.instructionsExecuted += 1;

    switch (op) {
      case Opcode.NOP:
        break;

      case Opcode.MOV_REG_IMM: {
        const regIdx = this.memory[this.registers.PC];
        const imm = this.readWord((this.registers.PC + 1) & 0xFFFF);
        this.registers.PC = (this.registers.PC + 3) & 0xFFFF;
        this.setReg(regIdx, imm);
        break;
      }

      case Opcode.MOV_REG_REG: {
        const dst = this.memory[this.registers.PC];
        const src = this.memory[(this.registers.PC + 1) & 0xFFFF];
        this.registers.PC = (this.registers.PC + 2) & 0xFFFF;
        this.setReg(dst, this.getReg(src));
        break;
      }

      case Opcode.LOAD_MEM: {
        const dst = this.memory[this.registers.PC];
        const addr = this.readWord((this.registers.PC + 1) & 0xFFFF);
        this.registers.PC = (this.registers.PC + 3) & 0xFFFF;
        this.setReg(dst, this.readWord(addr));
        break;
      }

      case Opcode.STORE_MEM: {
        const src = this.memory[this.registers.PC];
        const addr = this.readWord((this.registers.PC + 1) & 0xFFFF);
        this.registers.PC = (this.registers.PC + 3) & 0xFFFF;
        this.writeWord(addr, this.getReg(src));
        break;
      }

      case Opcode.ADD: {
        const dst = this.memory[this.registers.PC];
        const src = this.memory[(this.registers.PC + 1) & 0xFFFF];
        this.registers.PC = (this.registers.PC + 2) & 0xFFFF;
        const res = this.getReg(dst) + this.getReg(src);
        this.setReg(dst, res);
        this.updateFlags(res & 0xFFFF, res > 0xFFFF);
        break;
      }

      case Opcode.SUB: {
        const dst = this.memory[this.registers.PC];
        const src = this.memory[(this.registers.PC + 1) & 0xFFFF];
        this.registers.PC = (this.registers.PC + 2) & 0xFFFF;
        const res = this.getReg(dst) - this.getReg(src);
        this.setReg(dst, res);
        this.updateFlags(res & 0xFFFF, res < 0);
        break;
      }

      case Opcode.CMP: {
        const r1 = this.memory[this.registers.PC];
        const r2 = this.memory[(this.registers.PC + 1) & 0xFFFF];
        this.registers.PC = (this.registers.PC + 2) & 0xFFFF;
        const diff = this.getReg(r1) - this.getReg(r2);
        this.updateFlags(diff & 0xFFFF, diff < 0);
        break;
      }

      case Opcode.JMP: {
        const target = this.readWord(this.registers.PC);
        this.registers.PC = target;
        break;
      }

      case Opcode.JZ: {
        const target = this.readWord(this.registers.PC);
        this.registers.PC = (this.registers.PC + 2) & 0xFFFF;
        if (this.registers.flags.zero) {
          this.registers.PC = target;
        }
        break;
      }

      case Opcode.JNZ: {
        const target = this.readWord(this.registers.PC);
        this.registers.PC = (this.registers.PC + 2) & 0xFFFF;
        if (!this.registers.flags.zero) {
          this.registers.PC = target;
        }
        break;
      }

      case Opcode.CALL: {
        const target = this.readWord(this.registers.PC);
        this.registers.PC = (this.registers.PC + 2) & 0xFFFF;
        this.push(this.registers.PC);
        this.registers.PC = target;
        break;
      }

      case Opcode.RET: {
        this.registers.PC = this.pop();
        break;
      }

      case Opcode.PUSH: {
        const reg = this.memory[this.registers.PC];
        this.registers.PC = (this.registers.PC + 1) & 0xFFFF;
        this.push(this.getReg(reg));
        break;
      }

      case Opcode.POP: {
        const reg = this.memory[this.registers.PC];
        this.registers.PC = (this.registers.PC + 1) & 0xFFFF;
        this.setReg(reg, this.pop());
        break;
      }

      case Opcode.INT: {
        const intNum = this.memory[this.registers.PC];
        this.registers.PC = (this.registers.PC + 1) & 0xFFFF;
        this.triggerInterrupt(intNum);
        break;
      }

      case Opcode.OUT_PORT: {
        const port = this.memory[this.registers.PC];
        const reg = this.memory[(this.registers.PC + 1) & 0xFFFF];
        this.registers.PC = (this.registers.PC + 2) & 0xFFFF;
        const val = this.getReg(reg) & 0xFF;
        this.ports[port] = val;
        if (port === 0x3F8) {
          const char = String.fromCharCode(val);
          this.writeCharToVRAM(char);
        }
        break;
      }

      case Opcode.HLT: {
        this.stats.halted = true;
        break;
      }

      default:
        // Unknown opcode - treat as NOP
        break;
    }

    return true;
  }

  private updateFlags(val: number, carry: boolean): void {
    this.registers.flags.zero = val === 0;
    this.registers.flags.sign = (val & 0x8000) !== 0;
    this.registers.flags.carry = carry;
  }

  public triggerInterrupt(intNum: number): void {
    // Push FLAGS and return PC
    this.push(this.registers.PC);

    if (intNum === 0x10) {
      // BIOS Video Service
      const service = (this.registers.R0 >> 8) & 0xFF;
      if (service === 0x0E) {
        // Teletype output
        const char = String.fromCharCode(this.registers.R0 & 0xFF);
        this.writeCharToVRAM(char);
      }
    } else if (intNum === 0x80) {
      // Draft Kernel Syscall
      const syscall = this.registers.R0;
      if (syscall === 1) {
        // sys_exit
        this.stats.halted = true;
      } else if (syscall === 4) {
        // sys_write (R1: fd, R2: buffer address, R3: length)
        const addr = this.registers.R2;
        const len = this.registers.R3;
        let str = '';
        for (let i = 0; i < len; i++) {
          str += String.fromCharCode(this.memory[(addr + i) % MEMORY_SIZE]);
        }
        this.writeStringToVRAM(str);
      }
    }

    // Vector dispatch if mapped in IVT
    const vectorAddr = this.readWord(intNum * 4);
    if (vectorAddr !== 0 && vectorAddr !== KERNEL_ENTRY_ADDR) {
      this.registers.PC = vectorAddr;
    }
  }

  private vramCursor: number = 0;

  public writeCharToVRAM(char: string, attr: number = 0x07): void {
    if (char === '\n') {
      const row = Math.floor(this.vramCursor / VRAM_COLS);
      this.vramCursor = (row + 1) * VRAM_COLS;
    } else if (char === '\r') {
      const row = Math.floor(this.vramCursor / VRAM_COLS);
      this.vramCursor = row * VRAM_COLS;
    } else {
      const offset = VRAM_START + this.vramCursor * 2;
      if (offset + 1 < MEMORY_SIZE) {
        this.memory[offset] = char.charCodeAt(0);
        this.memory[offset + 1] = attr; // Color: Light Gray on Black
      }
      this.vramCursor++;
    }

    // Scroll if overflow
    if (this.vramCursor >= VRAM_COLS * VRAM_ROWS) {
      this.scrollVRAM();
    }
  }

  public writeStringToVRAM(str: string, attr: number = 0x07): void {
    for (let i = 0; i < str.length; i++) {
      this.writeCharToVRAM(str[i], attr);
    }
  }

  public scrollVRAM(): void {
    const rowBytes = VRAM_COLS * 2;
    for (let r = 0; r < VRAM_ROWS - 1; r++) {
      const src = VRAM_START + (r + 1) * rowBytes;
      const dst = VRAM_START + r * rowBytes;
      for (let i = 0; i < rowBytes; i++) {
        this.memory[dst + i] = this.memory[src + i];
      }
    }
    // Clear last line
    const lastLine = VRAM_START + (VRAM_ROWS - 1) * rowBytes;
    for (let i = 0; i < rowBytes; i += 2) {
      this.memory[lastLine + i] = 0x20; // Space
      this.memory[lastLine + i + 1] = 0x07;
    }
    this.vramCursor = (VRAM_ROWS - 1) * VRAM_COLS;
  }

  public getVRAMText(): string[] {
    const lines: string[] = [];
    for (let r = 0; r < VRAM_ROWS; r++) {
      let line = '';
      for (let c = 0; c < VRAM_COLS; c++) {
        const offset = VRAM_START + (r * VRAM_COLS + c) * 2;
        const code = this.memory[offset];
        line += code >= 32 && code <= 126 ? String.fromCharCode(code) : ' ';
      }
      lines.push(line);
    }
    return lines;
  }

  public disassemble(addr: number, count: number = 8): { address: string; hex: string; mnemonic: string }[] {
    const list: { address: string; hex: string; mnemonic: string }[] = [];
    let curr = addr;

    for (let i = 0; i < count && curr < MEMORY_SIZE; i++) {
      const op = this.memory[curr];
      const addrHex = `0x${curr.toString(16).padStart(4, '0').toUpperCase()}`;

      switch (op) {
        case Opcode.NOP:
          list.push({ address: addrHex, hex: '00', mnemonic: 'NOP' });
          curr += 1;
          break;
        case Opcode.MOV_REG_IMM: {
          const reg = REG_MAP[this.memory[curr + 1]] || '??';
          const val = this.readWord(curr + 2);
          const hex = `${this.memory[curr].toString(16).padStart(2, '0')} ${this.memory[curr + 1].toString(16).padStart(2, '0')} ${this.memory[curr + 2].toString(16).padStart(2, '0')} ${this.memory[curr + 3].toString(16).padStart(2, '0')}`.toUpperCase();
          list.push({ address: addrHex, hex, mnemonic: `MOV ${reg}, 0x${val.toString(16).toUpperCase()}` });
          curr += 4;
          break;
        }
        case Opcode.MOV_REG_REG: {
          const dst = REG_MAP[this.memory[curr + 1]] || '??';
          const src = REG_MAP[this.memory[curr + 2]] || '??';
          list.push({ address: addrHex, hex: `02 ${this.memory[curr + 1].toString(16)} ${this.memory[curr + 2].toString(16)}`, mnemonic: `MOV ${dst}, ${src}` });
          curr += 3;
          break;
        }
        case Opcode.ADD: {
          const dst = REG_MAP[this.memory[curr + 1]] || '??';
          const src = REG_MAP[this.memory[curr + 2]] || '??';
          list.push({ address: addrHex, hex: `05 ${this.memory[curr + 1].toString(16)} ${this.memory[curr + 2].toString(16)}`, mnemonic: `ADD ${dst}, ${src}` });
          curr += 3;
          break;
        }
        case Opcode.INT: {
          const num = this.memory[curr + 1];
          list.push({ address: addrHex, hex: `0F ${num.toString(16).padStart(2, '0').toUpperCase()}`, mnemonic: `INT 0x${num.toString(16).toUpperCase()}` });
          curr += 2;
          break;
        }
        case Opcode.HLT:
          list.push({ address: addrHex, hex: '10', mnemonic: 'HLT' });
          curr += 1;
          break;
        default: {
          list.push({ address: addrHex, hex: op.toString(16).padStart(2, '0').toUpperCase(), mnemonic: `DB 0x${op.toString(16).padStart(2, '0').toUpperCase()}` });
          curr += 1;
          break;
        }
      }
    }
    return list;
  }
}
