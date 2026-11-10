import { VirtualCPU, KERNEL_ENTRY_ADDR, BOOTLOADER_ADDR, Opcode } from './cpu';
import { Process, VFSNode } from './types';

export class DraftKernel {
  public cpu: VirtualCPU;
  public processes: Process[];
  public nextPid: number = 4;
  public vfs: VFSNode;
  public commandHistory: string[] = [];
  public currentPath: string = '/';
  public booted: boolean = false;
  public bootLogs: string[] = [];
  public terminalLines: { text: string; color?: string }[] = [];

  constructor() {
    this.cpu = new VirtualCPU();
    this.processes = this.initProcessTable();
    this.vfs = this.initVFS();
  }

  private initProcessTable(): Process[] {
    return [
      {
        pid: 0,
        ppid: 0,
        name: 'swapper/idle',
        state: 'RUNNING',
        priority: 0,
        cpuTicks: 1420,
        memoryKb: 32,
      },
      {
        pid: 1,
        ppid: 0,
        name: 'init/draft-core',
        state: 'READY',
        priority: 1,
        cpuTicks: 450,
        memoryKb: 128,
      },
      {
        pid: 2,
        ppid: 1,
        name: 'kworker/vfs',
        state: 'READY',
        priority: 2,
        cpuTicks: 210,
        memoryKb: 64,
      },
      {
        pid: 3,
        ppid: 1,
        name: 'ttyd/shell',
        state: 'RUNNING',
        priority: 3,
        cpuTicks: 380,
        memoryKb: 96,
      },
    ];
  }

  private initVFS(): VFSNode {
    return {
      name: '/',
      type: 'dir',
      children: {
        bin: {
          name: 'bin',
          type: 'dir',
          children: {
            sh: { name: 'sh', type: 'file', size: 14320, permissions: 'rwxr-xr-x' },
            ls: { name: 'ls', type: 'file', size: 8192, permissions: 'rwxr-xr-x' },
            cat: { name: 'cat', type: 'file', size: 5120, permissions: 'rwxr-xr-x' },
            ps: { name: 'ps', type: 'file', size: 9240, permissions: 'rwxr-xr-x' },
            kill: { name: 'kill', type: 'file', size: 4096, permissions: 'rwxr-xr-x' },
            uname: { name: 'uname', type: 'file', size: 3072, permissions: 'rwxr-xr-x' },
            memmap: { name: 'memmap', type: 'file', size: 6144, permissions: 'rwxr-xr-x' },
            echo: { name: 'echo', type: 'file', size: 2048, permissions: 'rwxr-xr-x' },
            clear: { name: 'clear', type: 'file', size: 1024, permissions: 'rwxr-xr-x' },
          },
        },
        etc: {
          name: 'etc',
          type: 'dir',
          children: {
            hostname: {
              name: 'hostname',
              type: 'file',
              content: 'draft-kernel-box',
              size: 16,
              permissions: 'rw-r--r--',
            },
            'os-release': {
              name: 'os-release',
              type: 'file',
              content:
                'NAME="Draft OS"\nVERSION="0.8.2-x86"\nID=draft\nPRETTY_NAME="Draft Kernel (Pure JS Virtual Machine)"\nHOME_URL="emulator://draft-kernel"',
              size: 128,
              permissions: 'rw-r--r--',
            },
            motd: {
              name: 'motd',
              type: 'file',
              content:
                'Welcome to Draft Kernel v0.8.2!\nAll subsystems active. Pure JavaScript emulator engine running smoothly.',
              size: 104,
              permissions: 'rw-r--r--',
            },
          },
        },
        proc: {
          name: 'proc',
          type: 'dir',
          children: {
            cpuinfo: {
              name: 'cpuinfo',
              type: 'file',
              content:
                'processor\t: 0\nmodel name\t: Draft Virtual CPU @ 100MHz\nfeatures\t: fpu vme de pse tsc msr pae mce cx8 apic\nbogoMIPS\t: 200.00\ncache size\t: 64 KB',
              size: 154,
              permissions: 'r--r--r--',
            },
            meminfo: {
              name: 'meminfo',
              type: 'file',
              content:
                'MemTotal:          65536 kB\nMemFree:           48128 kB\nMemAvailable:      52400 kB\nBuffers:            2048 kB\nCached:             8192 kB',
              size: 140,
              permissions: 'r--r--r--',
            },
            version: {
              name: 'version',
              type: 'file',
              content: 'Draft Kernel version 0.8.2-x86 (gcc 13.2.0, NASM 2.16) Mon Nov 10 2026',
              size: 72,
              permissions: 'r--r--r--',
            },
          },
        },
        dev: {
          name: 'dev',
          type: 'dir',
          children: {
            tty0: { name: 'tty0', type: 'file', size: 0, permissions: 'rw-rw----' },
            vda: { name: 'vda', type: 'file', size: 65536, permissions: 'brw-rw----' },
            null: { name: 'null', type: 'file', size: 0, permissions: 'crw-rw-rw-' },
            zero: { name: 'zero', type: 'file', size: 0, permissions: 'crw-rw-rw-' },
          },
        },
        home: {
          name: 'home',
          type: 'dir',
          children: {
            user: {
              name: 'user',
              type: 'dir',
              children: {
                'readme.txt': {
                  name: 'readme.txt',
                  type: 'file',
                  content:
                    'Draft Kernel Project Notes:\n- Emulator: Pure JS virtual machine (64KB RAM, 8 registers, full ISA)\n- BIOS & Bootloader: Written in C and NASM ASM\n- Kernel: Monolithic core with round-robin scheduler & VFS\nType "help" to see available commands.',
                  size: 245,
                  permissions: 'rw-r--r--',
                },
              },
            },
          },
        },
      },
    };
  }

  public boot(): void {
    this.bootLogs = [];
    this.terminalLines = [];
    this.cpu.reset(BOOTLOADER_ADDR);

    // Populate bootloader binary at 0x7C00
    // Simulating: MOV R0, 0x1000; JMP 0x1000
    this.cpu.memory[0x7C00] = Opcode.MOV_REG_IMM;
    this.cpu.memory[0x7C01] = 0; // R0
    this.cpu.memory[0x7C02] = 0x00;
    this.cpu.memory[0x7C03] = 0x10; // 0x1000
    this.cpu.memory[0x7C04] = Opcode.JMP;
    this.cpu.memory[0x7C05] = 0x00;
    this.cpu.memory[0x7C06] = 0x10; // JMP to 0x1000

    // Populate kernel binary at 0x1000
    // MOV R1, 0x42; MOV R2, 0x10; ADD R1, R2; NOP
    this.cpu.memory[0x1000] = Opcode.MOV_REG_IMM;
    this.cpu.memory[0x1001] = 1; // R1
    this.cpu.memory[0x1002] = 0x42;
    this.cpu.memory[0x1003] = 0x00;
    this.cpu.memory[0x1004] = Opcode.MOV_REG_IMM;
    this.cpu.memory[0x1005] = 2; // R2
    this.cpu.memory[0x1006] = 0x10;
    this.cpu.memory[0x1007] = 0x00;
    this.cpu.memory[0x1008] = Opcode.ADD;
    this.cpu.memory[0x1009] = 1; // dst: R1
    this.cpu.memory[0x100A] = 2; // src: R2
    this.cpu.memory[0x100B] = Opcode.NOP;

    this.bootLogs = [
      '[BIOS] ROM v1.4.0 (Draft Virtual Machine Architecture)',
      '[BIOS] System RAM: 65,536 Bytes Verified (64 KB OK)',
      '[BIOS] Probing Bus: PS/2 Keyboard [PORT 0x60], COM1 [PORT 0x3F8]',
      '[BIOS] VRAM Text Buffer configured at 0xB800 (80x25 Cells)',
      '[BIOS] Inspecting Boot Sector at 0x7C00... Signature 0xAA55 Verified',
      '[BOOT] Draft Bootloader v0.8: Relocating Kernel to 0x1000...',
      '[BOOT] Enabling Protected Mode Handoff (A20 Gate Active)',
      '[BOOT] Jumping to Draft Kernel entry point at 0x1000',
      '------------------------------------------------------------',
      '           DRAFT KERNEL v0.8.2-x86 (Pure JS Emulator)       ',
      '------------------------------------------------------------',
      '[KERNEL] Core initialized. Memory paging active.',
      '[KERNEL] Virtual File System mounted on /',
      '[KERNEL] Process scheduler initialized: 4 baseline tasks.',
      '[KERNEL] Interactive Shell attached to /dev/tty0',
      'System ready. Type "help" for a list of kernel commands.',
    ];

    for (const log of this.bootLogs) {
      this.terminalLines.push({ text: log });
    }

    this.booted = true;
  }

  public executeCommand(input: string): string[] {
    const trimmed = input.trim();
    if (!trimmed) return [];

    this.commandHistory.push(trimmed);
    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    const out: string[] = [];

    // Simulate CPU cycles on command execution
    for (let i = 0; i < 4; i++) {
      this.cpu.step();
    }

    switch (cmd) {
      case 'help':
        out.push('Draft Kernel Shell - Built-in Commands:');
        out.push('  help            - Show this command reference');
        out.push('  uname [-a]      - Print kernel and machine architecture');
        out.push('  ps              - List process table with PID, State, CPU');
        out.push('  top             - Show system summary and top tasks');
        out.push('  spawn <name>    - Create and schedule a new process');
        out.push('  kill <pid>      - Terminate a running process');
        out.push('  ls [path]       - List files and directories in VFS');
        out.push('  cat <path>      - Print contents of a file');
        out.push('  memmap          - Print physical & virtual memory segment map');
        out.push('  regs            - Dump CPU registers (PC, SP, FLAGS, R0-R7)');
        out.push('  step            - Execute 1 CPU cycle on emulator hardware');
        out.push('  disasm [count]  - Disassemble memory instructions from PC');
        out.push('  echo <text>     - Print text to console');
        out.push('  free            - Display total and available memory');
        out.push('  reboot          - Re-execute BIOS POST & Kernel bootloader');
        out.push('  clear           - Clear terminal screen buffer');
        break;

      case 'uname':
        if (args[0] === '-a' || !args[0]) {
          out.push('DraftOS 0.8.2-x86 #1 SMP PREEMPT Mon Nov 10 2026 i686 GNU/Draft');
        } else {
          out.push('DraftOS');
        }
        break;

      case 'ps':
        out.push('  PID  PPID  PRI  STATE    MEM(KB)   TICKS  COMMAND');
        out.push('----------------------------------------------------');
        for (const p of this.processes) {
          const pid = p.pid.toString().padStart(5);
          const ppid = p.ppid.toString().padStart(5);
          const pri = p.priority.toString().padStart(4);
          const state = p.state.padEnd(8);
          const mem = p.memoryKb.toString().padStart(7);
          const ticks = p.cpuTicks.toString().padStart(7);
          out.push(`${pid} ${ppid} ${pri}  ${state} ${mem} ${ticks}  ${p.name}`);
        }
        break;

      case 'top':
        out.push(`Tasks: ${this.processes.length} total, 2 running, 2 sleeping, 0 zombie`);
        out.push(`%Cpu(s): 3.2 us, 1.1 sy, 0.0 ni, 95.7 id, 0.0 wa`);
        out.push(`KiB Mem : 65536 total, 48128 free, 17408 used`);
        out.push('');
        out.push('  PID USER      PR  VIRT  RES  %CPU %MEM     TIME+ COMMAND');
        for (const p of this.processes) {
          out.push(
            `  ${p.pid.toString().padEnd(3)} root      ${p.priority}   ${p.memoryKb}K   ${p.memoryKb}K   1.2  0.4   0:0${p.cpuTicks % 60} ${p.name}`
          );
        }
        break;

      case 'spawn': {
        const procName = args[0] || `worker-${this.nextPid}`;
        const newProc: Process = {
          pid: this.nextPid++,
          ppid: 1,
          name: procName,
          state: 'RUNNING',
          priority: 5,
          cpuTicks: 1,
          memoryKb: 48,
        };
        this.processes.push(newProc);
        out.push(`[KERNEL] Process spawned: PID ${newProc.pid} (${newProc.name})`);
        break;
      }

      case 'kill': {
        const targetPid = parseInt(args[0], 10);
        if (isNaN(targetPid)) {
          out.push('Usage: kill <pid>');
          break;
        }
        if (targetPid <= 1) {
          out.push(`[KERNEL] Error: Cannot kill system critical process (PID ${targetPid})`);
          break;
        }
        const idx = this.processes.findIndex((p) => p.pid === targetPid);
        if (idx === -1) {
          out.push(`[KERNEL] Process PID ${targetPid} not found`);
        } else {
          const removed = this.processes.splice(idx, 1)[0];
          out.push(`[KERNEL] Terminated process PID ${removed.pid} (${removed.name}) [SIGKILL]`);
        }
        break;
      }

      case 'ls': {
        const targetPath = args[0] || this.currentPath;
        const node = this.resolvePath(targetPath);
        if (!node) {
          out.push(`ls: cannot access '${targetPath}': No such file or directory`);
        } else if (node.type === 'file') {
          out.push(node.name);
        } else if (node.children) {
          const entries = Object.values(node.children).map((c) =>
            c.type === 'dir' ? `${c.name}/` : c.name
          );
          out.push(entries.join('   '));
        }
        break;
      }

      case 'cat': {
        if (!args[0]) {
          out.push('Usage: cat <filename>');
          break;
        }
        const node = this.resolvePath(args[0]);
        if (!node) {
          out.push(`cat: ${args[0]}: No such file or directory`);
        } else if (node.type === 'dir') {
          out.push(`cat: ${args[0]}: Is a directory`);
        } else {
          out.push(node.content || `[Binary payload: ${node.size || 0} bytes]`);
        }
        break;
      }

      case 'memmap':
        out.push('Draft Physical & Virtual Memory Layout:');
        out.push('  0x0000 - 0x03FF : Interrupt Vector Table (IVT - 1KB)');
        out.push('  0x0400 - 0x0FFF : BIOS Data Area & Stack (3KB)');
        out.push('  0x1000 - 0x7BFF : Draft Kernel Core & Syscalls (27KB)');
        out.push('  0x7C00 - 0x7DFF : MBR Bootloader Sector (512B, [0xAA55])');
        out.push('  0x8000 - 0xB7FF : User Space, Task Stack & Heap (14KB)');
        out.push('  0xB800 - 0xBF9F : Text Mode VRAM (80x25 Color Buffer, 4KB)');
        out.push('  0xC000 - 0xFFFF : BIOS ROM & Hardware Drivers (16KB)');
        out.push('');
        out.push(`Current PC: 0x${this.cpu.registers.PC.toString(16).toUpperCase().padStart(4, '0')} | SP: 0x${this.cpu.registers.SP.toString(16).toUpperCase().padStart(4, '0')}`);
        break;

      case 'regs': {
        const r = this.cpu.registers;
        out.push('CPU Register State (Draft Virtual Processor):');
        out.push(
          `  R0: 0x${r.R0.toString(16).padStart(4, '0').toUpperCase()}   R1: 0x${r.R1.toString(16).padStart(4, '0').toUpperCase()}   R2: 0x${r.R2.toString(16).padStart(4, '0').toUpperCase()}   R3: 0x${r.R3.toString(16).padStart(4, '0').toUpperCase()}`
        );
        out.push(
          `  R4: 0x${r.R4.toString(16).padStart(4, '0').toUpperCase()}   R5: 0x${r.R5.toString(16).padStart(4, '0').toUpperCase()}   R6: 0x${r.R6.toString(16).padStart(4, '0').toUpperCase()}   R7: 0x${r.R7.toString(16).padStart(4, '0').toUpperCase()}`
        );
        out.push(
          `  PC: 0x${r.PC.toString(16).padStart(4, '0').toUpperCase()}   SP: 0x${r.SP.toString(16).padStart(4, '0').toUpperCase()}   BP: 0x${r.BP.toString(16).padStart(4, '0').toUpperCase()}   FLAGS: [Z:${r.flags.zero ? 1 : 0} C:${r.flags.carry ? 1 : 0} S:${r.flags.sign ? 1 : 0} I:${r.flags.interrupt ? 1 : 0}]`
        );
        break;
      }

      case 'step': {
        const prevPc = this.cpu.registers.PC;
        this.cpu.step();
        out.push(`[CPU] Executed 1 cycle at 0x${prevPc.toString(16).toUpperCase().padStart(4, '0')} -> New PC: 0x${this.cpu.registers.PC.toString(16).toUpperCase().padStart(4, '0')}`);
        break;
      }

      case 'disasm': {
        const count = parseInt(args[0], 10) || 6;
        const listing = this.cpu.disassemble(this.cpu.registers.PC, count);
        out.push(`Disassembly at PC (0x${this.cpu.registers.PC.toString(16).toUpperCase().padStart(4, '0')}):`);
        for (const item of listing) {
          out.push(`  ${item.address}  ${item.hex.padEnd(12)}  ${item.mnemonic}`);
        }
        break;
      }

      case 'echo':
        out.push(args.join(' '));
        break;

      case 'free':
        out.push('              total        used        free      shared  buff/cache   available');
        out.push('Mem:          65536       17408       48128           0        2048       52400');
        out.push('Swap:             0           0           0');
        break;

      case 'clear':
        this.terminalLines = [];
        return [];

      case 'reboot':
        this.boot();
        out.push('[SYSTEM] Reboot sequence triggered.');
        break;

      default:
        out.push(`draft-sh: command not found: ${cmd}. Type 'help' for available commands.`);
        break;
    }

    return out;
  }

  public resolvePath(pathStr: string): VFSNode | null {
    if (pathStr === '/' || !pathStr) return this.vfs;
    const clean = pathStr.startsWith('/') ? pathStr.slice(1) : pathStr;
    const segments = clean.split('/').filter(Boolean);

    let curr: VFSNode = this.vfs;
    for (const seg of segments) {
      if (!curr.children || !curr.children[seg]) {
        return null;
      }
      curr = curr.children[seg];
    }
    return curr;
  }
}
