import { CPU } from './cpu';
import {
  BOOTLOADER_ADDR,
  VRAM_COLS,
  VRAM_ROWS,
  PORT_KBD_DATA,
  COLOR_LIGHT_GREEN,
  COLOR_LIGHT_CYAN,
  COLOR_WHITE,
  COLOR_LIGHT_GRAY,
  COLOR_GREEN,
  COLOR_RED,
  COLOR_YELLOW,
  COLOR_BLUE,
} from './constants';

export interface TaskStruct {
  user: string;
  pid: number;
  ppid: number;
  cpu: number;
  mem: number;
  vsz: number;
  rss: number;
  tty: string;
  stat: string;
  start: string;
  time: string;
  command: string;
  ticks?: number;
}

export interface Inode {
  name: string;
  isDir: boolean;
  size: number;
  content?: string;
  children?: Record<string, Inode>;
}

export enum BootPhase {
  APPLE_EFI_START = 'APPLE_EFI_START',
  APPLE_RAM_TEST = 'APPLE_RAM_TEST',
  APPLE_DEVICES = 'APPLE_DEVICES',
  DARWIN_BOOTLOADER = 'DARWIN_BOOTLOADER',
  DARWIN_XNU_DMESG = 'DARWIN_XNU_DMESG',
  LAUNCHD_INIT = 'LAUNCHD_INIT',
  MACOS_LOGIN = 'MACOS_LOGIN',
  RUNNING = 'RUNNING',
}

export class DraftOS {
  public cpu: CPU;
  public tasks: TaskStruct[] = [];
  public nextPid: number = 300;
  public vfsRoot: Inode;
  public cwd: string = '/Users/user';
  public jiffies: number = 0;
  public inputBuffer: string = '';
  public history: string[] = [];
  public historyIdx: number = -1;
  public shiftHeld: boolean = false;

  // Real Dynamic Boot Process State
  public bootPhase: BootPhase = BootPhase.APPLE_EFI_START;
  public bootStep: number = 0;
  public ramCount: number = 0;
  public dmesgLog: string[] = [];
  private dmesgIndex: number = 0;
  private launchdIndex: number = 0;

  // Installed packages cache
  public installedPackages: Set<string> = new Set(['bash', 'zsh', 'sh', 'sw_vers', 'vm_stat', 'diskutil', 'system_profiler', 'apt', 'brew']);

  // Darwin / XNU Kernel dmesg sequence for DraftOS (macOS Sonoma implementation)
  private static readonly DARWIN_DMESG_ENTRIES: Array<{ text: string; color: number }> = [
    { text: '[    0.000000] Darwin Kernel Version 23.5.0: Mon Nov 10 06:27:00 PST 2026; root:xnu-10063.121.3~1/RELEASE_ARM64_T8103 (DraftOS)', color: 0x0F },
    { text: '[    0.000000] standard timeslicing quantum is 10000 us (Mach Scheduling Core)', color: 0x07 },
    { text: '[    0.000000] vm_page_bootstrap: 4194304 free pages and 12492 wired pages', color: 0x07 },
    { text: '[    0.000000] AppleARMPE: CPU 0..7 active (4 Performance @ 3.49GHz, 4 Efficiency @ 2.06GHz)', color: 0x0A },
    { text: '[    0.001240] AppleMobileFileIntegrity: AMFI initialized (DraftOS Permissive Security Policy)', color: 0x07 },
    { text: '[    0.002890] IORegistryEntry: Root object initialized, class IOPlatformExpertDevice', color: 0x07 },
    { text: '[    0.004120] AppleVGAController: Framebuffer 0xB800 mapped, resolution 640x400x16 text', color: 0x0B },
    { text: '[    0.006240] ApplePS2Keyboard: Port 0x60 attached (IRQ 1, Standard PS/2 / USB HID)', color: 0x07 },
    { text: '[    0.008450] apfs_module_start:1682: load: com.apple.filesystems.apfs, v2236.120.1', color: 0x07 },
    { text: '[    0.012390] apfs_vfsop_mount:1420: mounted volume DraftOS on /dev/disk1s1 (APFS Container)', color: 0x0A },
    { text: '[    0.016720] AppleCredentialManager: initialized credentials subsystem', color: 0x07 },
    { text: '[    0.021040] BSD root: disk1s1, major 1, minor 1, encrypted: no', color: 0x0B },
    { text: '[    0.025810] launchd: Starting Darwin userland runtime (/sbin/launchd PID 1)', color: 0x0F },
  ];

  // macOS / Darwin launchd system services
  private static readonly LAUNCHD_SERVICES: string[] = [
    'com.apple.syslogd (System Logging Daemon)',
    'com.apple.UserEventAgent (System Event Core)',
    'com.apple.opendirectoryd (Directory Services)',
    'com.apple.WindowServer -daemon (Quartz Compositor & Metal Engine)',
    'com.apple.coreaudiod (Core Audio HAL Service)',
    'com.apple.bluetoothd (IOBluetooth Subsystem)',
    'com.apple.dock (Application Dock & Mission Control)',
    'com.apple.Finder (macOS Desktop File Manager)',
    'com.apple.loginwindow.console (Virtual Console ttys000 Ready)',
  ];

  constructor() {
    this.cpu = new CPU();
    this.vfsRoot = this.createDefaultMacVFS();
    this.initMacProcessTable();
    this.installISR();
    this.startAppleColdBoot();
  }

  /**
   * @brief Starts the Apple EFI Boot ROM sequence
   */
  public startAppleColdBoot(): void {
    this.bootPhase = BootPhase.APPLE_EFI_START;
    this.bootStep = 0;
    this.ramCount = 0;
    this.dmesgIndex = 0;
    this.launchdIndex = 0;
    this.dmesgLog = [];
    this.inputBuffer = '';
    this.cwd = '/Users/user';
    this.cpu.reset(BOOTLOADER_ADDR);

    // Apple Inc. EFI Boot ROM Header
    this.cpu.printString('Apple Inc. EFI Boot ROM v428.140.1.0.0\r\n', 0x0F);
    this.cpu.printString('Model: Mac14,2 (Apple Virtual Platform / DraftOS Architecture)\r\n', 0x07);
    this.cpu.printString('Chip: Apple Virtual M-Series (8 Cores: 4P + 4E @ 3.49 GHz)\r\n', 0x07);
    this.cpu.printString('Testing Unified LPDDR5 Memory: ', 0x07);

    this.bootPhase = BootPhase.APPLE_RAM_TEST;
  }

  /**
   * @brief Skip boot directly to shell prompt
   */
  public skipBoot(): void {
    if (this.bootPhase === BootPhase.RUNNING) return;
    this.cpu.memory[BOOTLOADER_ADDR + 510] = 0x55;
    this.cpu.memory[BOOTLOADER_ADDR + 511] = 0xAA;
    this.cpu.initVRAM();
    this.cpu.cursorRow = 0;
    this.cpu.cursorCol = 0;
    this.printMacLoginBanner();
    this.bootPhase = BootPhase.RUNNING;
  }

  public boot(): void {
    this.skipBoot();
  }

  /**
   * @brief Hardware timer tick (PIT 50ms)
   */
  public tickTimer(): void {
    this.jiffies++;

    if (this.bootPhase !== BootPhase.RUNNING) {
      this.advanceBoot();
      return;
    }

    this.cpu.interrupt(0x20);

    for (const t of this.tasks) {
      if (t.stat.startsWith('R')) {
        t.ticks = (t.ticks || 0) + 1;
      }
    }
  }

  /**
   * @brief Real-time stepping through Apple EFI -> Darwin Kernel -> launchd -> macOS Login
   */
  private advanceBoot(): void {
    this.bootStep++;

    switch (this.bootPhase) {
      case BootPhase.APPLE_RAM_TEST: {
        this.ramCount = Math.min(65536, this.ramCount + 8192);
        this.cpu.cursorRow = 3;
        this.cpu.cursorCol = 31;
        const text = `${this.ramCount.toString().padStart(5, ' ')} MB`;
        this.cpu.printString(text, 0x0B);

        if (this.ramCount >= 65536) {
          this.cpu.printString(' OK\r\n\r\n', 0x0A);
          this.bootPhase = BootPhase.APPLE_DEVICES;
          this.bootStep = 0;
        }
        break;
      }

      case BootPhase.APPLE_DEVICES: {
        if (this.bootStep === 1) {
          this.cpu.printString('Apple SSD AP0512Z: 500.28 GB APFS Container [disk1s1] Verified\r\n', 0x07);
        } else if (this.bootStep === 2) {
          this.cpu.printString('Security Policy: Permissive (DraftOS Custom Kernel Extensions Allowed)\r\n', 0x08);
        } else if (this.bootStep === 3) {
          this.cpu.printString('ApplePS2Keyboard & Trackpad: Attached (IRQ 1, IRQ 12)\r\n', 0x07);
          this.cpu.printString('Graphics: Apple Metal Shading Pipeline Initialized\r\n\r\n', 0x07);
          this.bootPhase = BootPhase.DARWIN_BOOTLOADER;
          this.bootStep = 0;
        }
        break;
      }

      case BootPhase.DARWIN_BOOTLOADER: {
        if (this.bootStep === 1) {
          this.cpu.printString('Darwin Bootloader v3.2.0 (OpenCore/DraftOS Edition)\r\n', 0x0E);
        } else if (this.bootStep === 2) {
          this.cpu.printString('Loading /System/Library/Kernels/kernel.release.t8103 ...\r\n', 0x07);
        } else if (this.bootStep === 3) {
          this.cpu.printString('Starting Darwin/XNU Kernel in verbose console mode...\r\n\r\n', 0x0A);
          this.bootPhase = BootPhase.DARWIN_XNU_DMESG;
          this.bootStep = 0;
        }
        break;
      }

      case BootPhase.DARWIN_XNU_DMESG: {
        for (let i = 0; i < 2 && this.dmesgIndex < DraftOS.DARWIN_DMESG_ENTRIES.length; i++) {
          const entry = DraftOS.DARWIN_DMESG_ENTRIES[this.dmesgIndex++];
          this.cpu.printString(entry.text + '\r\n', entry.color);
          this.dmesgLog.push(entry.text);
        }

        if (this.dmesgIndex >= DraftOS.DARWIN_DMESG_ENTRIES.length) {
          this.bootPhase = BootPhase.LAUNCHD_INIT;
          this.bootStep = 0;
          this.cpu.printString('\r\ncom.apple.launchd: Initializing macOS userland targets...\r\n', 0x0F);
        }
        break;
      }

      case BootPhase.LAUNCHD_INIT: {
        if (this.launchdIndex < DraftOS.LAUNCHD_SERVICES.length) {
          const svc = DraftOS.LAUNCHD_SERVICES[this.launchdIndex++];
          this.cpu.printString('[  ', 0x07);
          this.cpu.printString('OK', 0x0A);
          this.cpu.printString('  ] Started ' + svc + '\r\n', 0x07);
        } else {
          this.bootPhase = BootPhase.MACOS_LOGIN;
          this.bootStep = 0;
        }
        break;
      }

      case BootPhase.MACOS_LOGIN: {
        this.printMacLoginBanner();
        this.bootPhase = BootPhase.RUNNING;
        break;
      }
    }
  }

  /**
   * @brief Displays the authentic macOS login banner
   */
  public printMacLoginBanner(): void {
    this.cpu.printString('\r\nLast login: Mon Nov 10 06:27:14 2026 on ttys000\r\n', 0x07);
    this.cpu.printString('DraftOS 14.5 (macOS Sonoma implementation - Darwin 23.5.0)\r\n', 0x0F);
    this.cpu.printString('The default interactive shell is now zsh.\r\n', 0x07);
    this.cpu.printString('Type "help" or "man" to see macOS utilities & apt package manager.\r\n\r\n', 0x0E);
    this.printPrompt();
  }

  public printPrompt(): void {
    const displayDir = this.cwd === '/Users/user' ? '~' : this.cwd;
    this.cpu.printString(`draft-mac:${displayDir} user$ `, 0x0A);
  }

  public initMacProcessTable(): void {
    this.tasks = [
      { user: 'root', pid: 1, ppid: 0, cpu: 0.0, mem: 0.8, vsz: 18412, rss: 6240, tty: '?', stat: 'Ss', start: '06:27', time: '0:01.2', command: '/sbin/launchd' },
      { user: 'root', pid: 54, ppid: 1, cpu: 0.0, mem: 0.2, vsz: 5120, rss: 1840, tty: '?', stat: 'Ss', start: '06:27', time: '0:00.1', command: '/usr/sbin/syslogd' },
      { user: 'root', pid: 68, ppid: 1, cpu: 0.0, mem: 0.3, vsz: 6840, rss: 2410, tty: '?', stat: 'Ss', start: '06:27', time: '0:00.2', command: '/usr/libexec/UserEventAgent (System)' },
      { user: 'root', pid: 92, ppid: 1, cpu: 0.0, mem: 0.4, vsz: 9410, rss: 3120, tty: '?', stat: 'Ss', start: '06:27', time: '0:00.4', command: '/usr/libexec/opendirectoryd' },
      { user: '_windowserver', pid: 142, ppid: 1, cpu: 1.2, mem: 2.4, vsz: 84120, rss: 28410, tty: '?', stat: 'Ss', start: '06:27', time: '0:04.8', command: '/System/Library/PrivateFrameworks/WindowServer -daemon' },
      { user: '_coreaudiod', pid: 180, ppid: 1, cpu: 0.1, mem: 0.6, vsz: 14210, rss: 5410, tty: '?', stat: 'Ss', start: '06:27', time: '0:00.5', command: '/usr/sbin/coreaudiod' },
      { user: 'user', pid: 210, ppid: 1, cpu: 0.2, mem: 1.1, vsz: 34120, rss: 12410, tty: '?', stat: 'S', start: '06:27', time: '0:01.1', command: '/System/Library/CoreServices/Dock.app/Contents/MacOS/Dock' },
      { user: 'user', pid: 220, ppid: 1, cpu: 0.2, mem: 1.4, vsz: 42100, rss: 16840, tty: '?', stat: 'S', start: '06:27', time: '0:01.5', command: '/System/Library/CoreServices/Finder.app/Contents/MacOS/Finder' },
      { user: 'root', pid: 240, ppid: 1, cpu: 0.0, mem: 0.4, vsz: 8120, rss: 3200, tty: '?', stat: 'Ss', start: '06:27', time: '0:00.2', command: '/System/Library/CoreServices/loginwindow.app/Contents/MacOS/loginwindow' },
      { user: 'user', pid: 250, ppid: 240, cpu: 0.0, mem: 0.5, vsz: 9412, rss: 3840, tty: 'ttys000', stat: 'S', start: '06:27', time: '0:00.1', command: '-zsh' },
    ];
  }

  public createDefaultMacVFS(): Inode {
    return {
      name: '/',
      isDir: true,
      size: 4096,
      children: {
        Applications: { name: 'Applications', isDir: true, size: 4096, children: {} },
        Library: { name: 'Library', isDir: true, size: 4096, children: {} },
        System: {
          name: 'System',
          isDir: true,
          size: 4096,
          children: {
            Library: {
              name: 'Library',
              isDir: true,
              size: 4096,
              children: {
                Kernels: {
                  name: 'Kernels',
                  isDir: true,
                  size: 4096,
                  children: {
                    'kernel.release.t8103': { name: 'kernel.release.t8103', isDir: false, size: 38410290, content: 'Mach-O 64-bit arm64e kernel executable (Darwin 23.5.0)' },
                  },
                },
                CoreServices: {
                  name: 'CoreServices',
                  isDir: true,
                  size: 4096,
                  children: {
                    'SystemVersion.plist': {
                      name: 'SystemVersion.plist',
                      isDir: false,
                      size: 480,
                      content:
                        '<?xml version="1.0" encoding="UTF-8"?>\n' +
                        '<plist version="1.0">\n' +
                        '<dict>\n' +
                        '    <key>ProductBuildVersion</key>\n' +
                        '    <string>23F79</string>\n' +
                        '    <key>ProductCopyright</key>\n' +
                        '    <string>1983-2026 Apple Inc. / DraftOS</string>\n' +
                        '    <key>ProductName</key>\n' +
                        '    <string>macOS (DraftOS Implementation)</string>\n' +
                        '    <key>ProductUserVisibleVersion</key>\n' +
                        '    <string>14.5</string>\n' +
                        '    <key>ProductVersion</key>\n' +
                        '    <string>14.5</string>\n' +
                        '</dict>\n' +
                        '</plist>\n',
                    },
                  },
                },
              },
            },
          },
        },
        Users: {
          name: 'Users',
          isDir: true,
          size: 4096,
          children: {
            user: {
              name: 'user',
              isDir: true,
              size: 4096,
              children: {
                '.zshrc': {
                  name: '.zshrc',
                  isDir: false,
                  size: 320,
                  content: 'PROMPT="%m:%~ %n$ "\nexport PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"\nalias ll="ls -la"\n',
                },
                Desktop: { name: 'Desktop', isDir: true, size: 4096, children: {} },
                Documents: {
                  name: 'Documents',
                  isDir: true,
                  size: 4096,
                  children: {
                    'welcome.txt': { name: 'welcome.txt', isDir: false, size: 142, content: 'Welcome to DraftOS (macOS implementation).\nUse apt update and apt install to install packages.\n' },
                  },
                },
                Downloads: { name: 'Downloads', isDir: true, size: 4096, children: {} },
              },
            },
          },
        },
        Volumes: {
          name: 'Volumes',
          isDir: true,
          size: 4096,
          children: {
            DraftOS: { name: 'DraftOS', isDir: true, size: 4096, children: {} },
          },
        },
        bin: {
          name: 'bin',
          isDir: true,
          size: 4096,
          children: {
            zsh: { name: 'zsh', isDir: false, size: 842100, content: 'Mach-O 64-bit executable arm64' },
            bash: { name: 'bash', isDir: false, size: 1184200, content: 'Mach-O 64-bit executable arm64' },
            sh: { name: 'sh', isDir: false, size: 125400, content: 'Mach-O 64-bit executable arm64' },
            ls: { name: 'ls', isDir: false, size: 142100, content: 'Mach-O 64-bit executable arm64' },
            cat: { name: 'cat', isDir: false, size: 54100, content: 'Mach-O 64-bit executable arm64' },
            echo: { name: 'echo', isDir: false, size: 34200, content: 'Mach-O 64-bit executable arm64' },
          },
        },
        usr: {
          name: 'usr',
          isDir: true,
          size: 4096,
          children: {
            bin: {
              name: 'bin',
              isDir: true,
              size: 4096,
              children: {
                sw_vers: { name: 'sw_vers', isDir: false, size: 42100, content: 'Mach-O 64-bit executable' },
                vm_stat: { name: 'vm_stat', isDir: false, size: 38400, content: 'Mach-O 64-bit executable' },
                diskutil: { name: 'diskutil', isDir: false, size: 142100, content: 'Mach-O 64-bit executable' },
                system_profiler: { name: 'system_profiler', isDir: false, size: 184200, content: 'Mach-O 64-bit executable' },
                apt: { name: 'apt', isDir: false, size: 284100, content: 'Mach-O 64-bit executable - Advanced Package Tool' },
                brew: { name: 'brew', isDir: false, size: 42100, content: 'Ruby / POSIX sh script' },
                say: { name: 'say', isDir: false, size: 32100, content: 'Mach-O 64-bit executable' },
              },
            },
            local: {
              name: 'local',
              isDir: true,
              size: 4096,
              children: {
                bin: { name: 'bin', isDir: true, size: 4096, children: {} },
              },
            },
          },
        },
        etc: {
          name: 'etc',
          isDir: true,
          size: 4096,
          children: {
            hosts: { name: 'hosts', isDir: false, size: 120, content: '127.0.0.1\tlocalhost draft-mac.local\n255.255.255.255\tbroadcast\n::1\tlocalhost\n' },
            'os-release': {
              name: 'os-release',
              isDir: false,
              size: 240,
              content:
                'NAME="DraftOS"\n' +
                'PRETTY_NAME="DraftOS 14.5 (macOS Sonoma implementation)"\n' +
                'VERSION="14.5"\n' +
                'ID="draftos"\n' +
                'DARWIN_VERSION="23.5.0"\n',
            },
            zshrc: { name: 'zshrc', isDir: false, size: 180, content: '# System-wide .zshrc for DraftOS\n' },
          },
        },
        dev: {
          name: 'dev',
          isDir: true,
          size: 2048,
          children: {
            disk0: { name: 'disk0', isDir: false, size: 0, content: '' },
            disk1s1: { name: 'disk1s1', isDir: false, size: 0, content: 'APFS Volume DraftOS' },
            ttys000: { name: 'ttys000', isDir: false, size: 0, content: '' },
            null: { name: 'null', isDir: false, size: 0, content: '' },
            zero: { name: 'zero', isDir: false, size: 0, content: '' },
          },
        },
        tmp: { name: 'tmp', isDir: true, size: 4096, children: {} },
        var: {
          name: 'var',
          isDir: true,
          size: 4096,
          children: {
            log: { name: 'log', isDir: true, size: 4096, children: {} },
          },
        },
      },
    };
  }

  private installISR(): void {
    this.cpu.installInterruptHandler(0x21, () => {
      // IRQ 1 PS/2 Keyboard
    });

    this.cpu.installInterruptHandler(0x80, () => {
      // INT 0x80 Syscall
    });
  }

  public isExecutingCommand: boolean = false;

  public handleKeyDown(key: string, keyCode: number): void {
    if (this.bootPhase !== BootPhase.RUNNING) {
      this.skipBoot();
      return;
    }

    if (key === 'Shift') {
      this.shiftHeld = true;
      return;
    }

    this.cpu.outb(PORT_KBD_DATA, keyCode & 0xFF);
    this.cpu.interrupt(0x21);

    if (key === 'Enter') {
      if (this.isExecutingCommand) return;

      this.cpu.printString('\r\n');
      const cmd = this.inputBuffer.trim();
      this.inputBuffer = '';
      if (cmd.length > 0) {
        this.history.push(cmd);
        this.historyIdx = this.history.length;
        this.isExecutingCommand = true;
        this.executeCommand(cmd).finally(() => {
          this.isExecutingCommand = false;
        });
      } else {
        this.printPrompt();
      }
    } else if (key === 'Backspace') {
      if (this.inputBuffer.length > 0) {
        this.inputBuffer = this.inputBuffer.slice(0, -1);
        if (this.cpu.cursorCol > 0) {
          this.cpu.cursorCol--;
          const offset = 0xB800 + (this.cpu.cursorRow * VRAM_COLS + this.cpu.cursorCol) * 2;
          this.cpu.memory[offset] = 0x20;
          this.cpu.memory[offset + 1] = 0x07;
        }
      }
    } else if (key === 'ArrowUp') {
      if (this.history.length > 0 && this.historyIdx > 0) {
        this.historyIdx--;
        this.replaceInputLine(this.history[this.historyIdx]);
      }
    } else if (key === 'ArrowDown') {
      if (this.historyIdx < this.history.length - 1) {
        this.historyIdx++;
        this.replaceInputLine(this.history[this.historyIdx]);
      } else {
        this.historyIdx = this.history.length;
        this.replaceInputLine('');
      }
    } else if (key.length === 1) {
      this.inputBuffer += key;
      this.cpu.printChar(key.charCodeAt(0), 0x0F);
    }
  }

  public handleKeyUp(key: string): void {
    if (key === 'Shift') {
      this.shiftHeld = false;
    }
  }

  private replaceInputLine(newLine: string): void {
    while (this.inputBuffer.length > 0) {
      if (this.cpu.cursorCol > 0) {
        this.cpu.cursorCol--;
        const offset = 0xB800 + (this.cpu.cursorRow * VRAM_COLS + this.cpu.cursorCol) * 2;
        this.cpu.memory[offset] = 0x20;
        this.cpu.memory[offset + 1] = 0x07;
      }
      this.inputBuffer = this.inputBuffer.slice(0, -1);
    }
    this.inputBuffer = newLine;
    this.cpu.printString(newLine, 0x0F);
  }

  /**
   * @brief Executes commands in DraftOS (macOS implementation)
   */
  public async executeCommand(fullCmd: string): Promise<void> {
    let redirectionFile: string | null = null;
    let append = false;
    let cmdToRun = fullCmd;

    if (fullCmd.includes('>>')) {
      const parts = fullCmd.split('>>');
      cmdToRun = parts[0].trim();
      redirectionFile = parts[1].trim();
      append = true;
    } else if (fullCmd.includes('>')) {
      const parts = fullCmd.split('>');
      cmdToRun = parts[0].trim();
      redirectionFile = parts[1].trim();
      append = false;
    }

    const tokens = cmdToRun.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      this.printPrompt();
      return;
    }

    const cmd = tokens[0];
    const args = tokens.slice(1);

    let output = '';

    // Check if command is an installed package or custom command
    switch (cmd) {
      case 'help':
      case 'man': {
        output =
          'DraftOS 14.5 (macOS Sonoma implementation) Shell Commands:\r\n' +
          '  sw_vers            - Print macOS and DraftOS release version\r\n' +
          '  system_profiler    - Report macOS hardware & memory configuration\r\n' +
          '  vm_stat            - Mach Virtual Memory Statistics (active, wired, free)\r\n' +
          '  diskutil list      - List APFS containers and GUID partition layout\r\n' +
          '  csrutil status     - Check System Integrity Protection (SIP) status\r\n' +
          '  nvram [-p]         - Print non-volatile OpenCore/EFI RAM variables\r\n' +
          '  sysctl [-a]        - Retrieve kernel state (hw.ncpu, hw.model, etc.)\r\n' +
          '  say <text>         - Speech synthesis utility\r\n' +
          '  open <file>        - Open file or document\r\n' +
          '  defaults read      - Read macOS property list defaults\r\n' +
          '  uname [-a|-r|-m]   - Display Darwin Kernel release and architecture\r\n' +
          '  apt update         - [REAL] Update package index from repository\r\n' +
          '  apt list           - [REAL] List available repository packages\r\n' +
          '  apt search <term>  - [REAL] Search package catalog\r\n' +
          '  apt install <pkg>  - [REAL] Download and install package from repo\r\n' +
          '  brew <cmd>         - Homebrew interface (aliased to apt package core)\r\n' +
          '  ps [aux]           - List Darwin tasks and launchd services\r\n' +
          '  top / htop         - Live process viewer\r\n' +
          '  dmesg              - Print Darwin/XNU kernel boot ring buffer\r\n' +
          '  ls [-la] [path]    - List files with permissions and size\r\n' +
          '  cd [path]          - Change working directory\r\n' +
          '  pwd                - Print working directory\r\n' +
          '  cat <file>         - View file contents\r\n' +
          '  echo <text>        - Print text (supports > and >> redirection)\r\n' +
          '  mkdir / touch / rm - Manage files and directories\r\n' +
          '  grep / wc / whoami - POSIX file search, word count, user identity\r\n' +
          '  clear / reboot     - Clear screen / Warm reboot EFI bootloader\r\n' +
          '  [PageUp / PageDown]- Scroll terminal history buffer up and down\r\n';
        break;
      }

      case 'sw_vers': {
        output =
          'ProductName:\t\tmacOS (DraftOS Implementation)\r\n' +
          'ProductVersion:\t\t14.5\r\n' +
          'BuildVersion:\t\t23F79\r\n';
        break;
      }

      case 'uname': {
        const flag = args[0] || '';
        if (flag === '-a' || flag === '--all') {
          output = 'Darwin draft-mac.local 23.5.0 Darwin Kernel Version 23.5.0: Mon Nov 10 06:27:00 PST 2026; root:xnu-10063.121.3~1/RELEASE_ARM64_T8103 arm64 (DraftOS)\r\n';
        } else if (flag === '-r') {
          output = '23.5.0\r\n';
        } else if (flag === '-m') {
          output = 'arm64\r\n';
        } else if (flag === '-s') {
          output = 'Darwin\r\n';
        } else if (flag === '-v') {
          output = 'Darwin Kernel Version 23.5.0 (DraftOS XNU)\r\n';
        } else {
          output = 'Darwin\r\n';
        }
        break;
      }

      case 'system_profiler': {
        const query = args[0] || 'SPHardwareDataType';
        if (query.includes('Memory') || query === 'SPMemoryDataType') {
          output =
            'Memory:\r\n\r\n' +
            '    Memory Slots:\r\n\r\n' +
            '      ECC: Non-ECC\r\n' +
            '      Upgradeable Memory: No\r\n\r\n' +
            '    BANK 0/LPDDR5:\r\n' +
            '      Size: 64 GB\r\n' +
            '      Type: Unified Memory (DraftOS Architecture)\r\n' +
            '      Speed: 6400 MT/s\r\n' +
            '      Status: OK\r\n';
        } else {
          output =
            'Hardware:\r\n\r\n' +
            '    Hardware Overview:\r\n\r\n' +
            '      Model Name: Mac Virtual Machine\r\n' +
            '      Model Identifier: Mac14,2\r\n' +
            '      Model Number: Z1680004KH/A\r\n' +
            '      Chip: Apple Virtual M-Series (DraftOS Architecture)\r\n' +
            '      Total Number of Cores: 8 (4 performance and 4 efficiency)\r\n' +
            '      Memory: 64 GB Unified Memory\r\n' +
            '      System Firmware Version: 10151.101.3\r\n' +
            '      OS Loader Version: 10151.101.3\r\n' +
            '      Serial Number (system): DRAFT8XNU2026\r\n' +
            '      Hardware UUID: 417C2A34-7EFD-4FB2-9863-F73653F07B16\r\n' +
            '      Provisioning UDID: 417C2A34-7EFD-4FB2-9863-F73653F07B16\r\n' +
            '      Activation Lock Status: Disabled\r\n';
        }
        break;
      }

      case 'vm_stat': {
        output =
          'Mach Virtual Memory Statistics: (page size of 16384 bytes)\r\n' +
          'Pages free:                              1824102.\r\n' +
          'Pages active:                             841203.\r\n' +
          'Pages inactive:                           612940.\r\n' +
          'Pages speculative:                         49102.\r\n' +
          'Pages throttled:                               0.\r\n' +
          'Pages wired down:                         384102.\r\n' +
          'Pages purgeable:                           28410.\r\n' +
          '"Translation faults":                   12840912.\r\n' +
          'Pages copy-on-write:                      481029.\r\n' +
          'Pages zero filled:                       9401284.\r\n' +
          'Pages reactivated:                         12094.\r\n' +
          'Pages purged:                               8410.\r\n' +
          'File-backed pages:                        491028.\r\n' +
          'Anonymous pages:                          963115.\r\n' +
          'Pages stored in compressor:                    0.\r\n' +
          'Pageins:                                   48102.\r\n' +
          'Pageouts:                                      0.\r\n';
        break;
      }

      case 'diskutil': {
        output =
          '/dev/disk0 (internal, physical):\r\n' +
          '   #:                       TYPE NAME                    SIZE       IDENTIFIER\r\n' +
          '   0:      GUID_partition_scheme                        *500.3 GB   disk0\r\n' +
          '   1:                        EFI EFI                     314.6 MB   disk0s1\r\n' +
          '   2:                 Apple_APFS Container disk1         499.9 GB   disk0s2\r\n\r\n' +
          '/dev/disk1 (synthesized):\r\n' +
          '   #:                       TYPE NAME                    SIZE       IDENTIFIER\r\n' +
          '   0:      APFS Container Scheme -                      +499.9 GB   disk1\r\n' +
          '                                Physical Store disk0s2\r\n' +
          '   1:                APFS Volume DraftOS - Data          142.4 GB   disk1s1\r\n' +
          '   2:                APFS Volume DraftOS                 15.3 GB    disk1s2\r\n' +
          '   3:                APFS Volume Preboot                 1.8 GB     disk1s3\r\n' +
          '   4:                APFS Volume Recovery                1.1 GB     disk1s4\r\n';
        break;
      }

      case 'csrutil': {
        output = 'System Integrity Protection status: enabled (Apple Silicon DraftOS policy).\r\n';
        break;
      }

      case 'nvram': {
        output =
          'boot-args\tdebug=0x100 keepsyms=1 -v\r\n' +
          'SystemAudioVolume\t%80\r\n' +
          'efi-backup-boot-device-data\t%02%01%0c%00...\r\n' +
          'prev-lang:kbd\ten-US:0\r\n';
        break;
      }

      case 'sysctl': {
        const query = args[0] || '-a';
        if (query.includes('ncpu')) {
          output = 'hw.ncpu: 8\r\n';
        } else if (query.includes('model')) {
          output = 'hw.model: Mac14,2\r\n';
        } else if (query.includes('brand_string') || query.includes('cpu')) {
          output = 'machdep.cpu.brand_string: Apple Virtual M-Series (DraftOS Architecture)\r\n';
        } else if (query.includes('ostype')) {
          output = 'kern.ostype: Darwin\r\n';
        } else if (query.includes('osrelease')) {
          output = 'kern.osrelease: 23.5.0\r\n';
        } else {
          output =
            'hw.ncpu: 8\r\n' +
            'hw.byteorder: 1234\r\n' +
            'hw.memsize: 68719476736\r\n' +
            'hw.model: Mac14,2\r\n' +
            'machdep.cpu.brand_string: Apple Virtual M-Series\r\n' +
            'kern.ostype: Darwin\r\n' +
            'kern.osrelease: 23.5.0\r\n' +
            'kern.version: Darwin Kernel Version 23.5.0: DraftOS/XNU\r\n';
        }
        break;
      }

      case 'say': {
        const textToSay = args.join(' ') || 'Hello from DraftOS!';
        output = `[Voice Output: "${textToSay}"]\r\n`;
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          try {
            const utterance = new SpeechSynthesisUtterance(textToSay);
            window.speechSynthesis.speak(utterance);
          } catch {
            // Speech synthesis fallback
          }
        }
        break;
      }

      case 'open': {
        const target = args[0];
        if (!target) {
          output = 'Usage: open <filename>\r\n';
        } else {
          const resolved = this.resolvePath(target);
          const node = this.getNode(resolved);
          if (!node) {
            output = `The file ${target} does not exist.\r\n`;
          } else if (node.isDir) {
            output = `Opened directory '${target}' in Finder.\r\n`;
          } else {
            output = `[Opening ${target} in TextEdit]:\r\n--------------------------------\r\n${node.content || ''}\r\n--------------------------------\r\n`;
          }
        }
        break;
      }

      case 'defaults': {
        output =
          '(\r\n' +
          '    {\r\n' +
          '        AppleInterfaceStyle = Dark;\r\n' +
          '        AppleLanguages = ( "en-US", "ko-KR" );\r\n' +
          '        AppleLocale = "en_US";\r\n' +
          '        DraftOSEmulator = "Bare-Metal JS Engine";\r\n' +
          '    }\r\n' +
          ')\r\n';
        break;
      }

      // Real APT package manager implementation connecting to real repository endpoint
      case 'apt':
      case 'apt-get':
      case 'brew': {
        const sub = args[0] || 'help';
        const pkgArg = args[1] || '';

        if (sub === 'update') {
          this.cpu.printString('Hit:1 https://repo.draftos.org/draftos-mac sonoma InRelease\r\n', 0x07);
          this.cpu.printString('Get:2 https://repo.draftos.org/draftos-mac sonoma/main arm64 Packages [842 kB]\r\n', 0x07);

          try {
            const res = await fetch('/api/apt?action=update');
            const data = await res.json();
            const pkgCount = data.packages ? data.packages.length : 10;
            this.cpu.printString(`Fetched 2,262 kB in 0s (4,524 kB/s)\r\n`, 0x0A);
            this.cpu.printString(`Reading package lists... Done\r\n`, 0x0F);
            this.cpu.printString(`Building dependency tree... Done\r\n`, 0x07);
            this.cpu.printString(`All packages are up to date (${pkgCount} packages available in repository).\r\n`, 0x0A);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this.cpu.printString(`Reading package lists... Done (Cached)\r\nAll packages are up to date.\r\n`, 0x07);
          }
          this.printPrompt();
          return;
        }

        if (sub === 'list') {
          this.cpu.printString('Listing available packages from https://repo.draftos.org...\r\n', 0x0F);
          try {
            const res = await fetch('/api/apt?action=list');
            const data = await res.json();
            if (data.packages) {
              for (const p of data.packages) {
                const status = this.installedPackages.has(p.name) ? '[installed]' : '';
                this.cpu.printString(`  ${p.name.padEnd(12, ' ')} ${p.version.padEnd(10, ' ')} - ${p.description} ${status}\r\n`, 0x07);
              }
            }
          } catch {
            this.cpu.printString('cowsay, neofetch, tree, sl, fortune, figlet, nano, curl, python3, htop\r\n', 0x07);
          }
          this.printPrompt();
          return;
        }

        if (sub === 'search') {
          const query = pkgArg.toLowerCase();
          try {
            const res = await fetch('/api/apt?action=list');
            const data = await res.json();
            const matches = (data.packages || []).filter((p: { name: string; description: string }) =>
              p.name.includes(query) || p.description.toLowerCase().includes(query)
            );
            this.cpu.printString(`Sorting... Done\r\nFull Text Search... Done\r\n`, 0x07);
            for (const m of matches) {
              this.cpu.printString(`${m.name}/${m.version} [${m.section}]\r\n  ${m.description}\r\n`, 0x0B);
            }
          } catch {
            this.cpu.printString(`Found package: ${pkgArg}\r\n`, 0x07);
          }
          this.printPrompt();
          return;
        }

        if (sub === 'install') {
          if (!pkgArg) {
            this.cpu.printString('Usage: apt install <package-name>\r\n', 0x0C);
            this.printPrompt();
            return;
          }

          this.cpu.printString(`Reading package lists... Done\r\nBuilding dependency tree... Done\r\n`, 0x07);
          this.cpu.printString(`The following NEW packages will be installed:\r\n  ${pkgArg}\r\n`, 0x0A);
          this.cpu.printString(`0 upgraded, 1 newly installed, 0 to remove.\r\n`, 0x07);
          this.cpu.printString(`Need to get archives from https://repo.draftos.org...\r\n`, 0x07);

          try {
            const res = await fetch(`/api/apt?action=install&package=${encodeURIComponent(pkgArg)}`);
            const data = await res.json();

            if (data.status === 'success' && data.package) {
              const p = data.package;
              this.cpu.printString(`Get:1 https://repo.draftos.org/draftos-mac sonoma/main arm64 ${p.name} [${p.size} B]\r\n`, 0x0B);
              this.cpu.printString(`Fetched ${p.size} B in 0s\r\n`, 0x07);
              this.cpu.printString(`Selecting previously unselected package ${p.name}.\r\n`, 0x07);
              this.cpu.printString(`Preparing to unpack .../${p.name}_${p.version}_arm64.deb ...\r\n`, 0x07);
              this.cpu.printString(`Unpacking ${p.name} (${p.version}) into /usr/bin/${p.name} ...\r\n`, 0x07);

              // Unpack files into Virtual File System
              if (p.files) {
                for (const [filePath, content] of Object.entries(p.files)) {
                  this.createFile(filePath, String(content));
                }
              }

              this.installedPackages.add(p.name);
              this.cpu.printString(`Setting up ${p.name} (${p.version}) ...\r\n`, 0x0A);
              this.cpu.printString(`Processing triggers for man-db ... Done\r\n`, 0x07);
              this.cpu.printString(`[+] Successfully installed '${p.name}'. You can now run '${p.name}'.\r\n`, 0x0A);
            } else {
              this.cpu.printString(`E: Unable to locate package ${pkgArg}\r\nAvailable packages: cowsay, neofetch, tree, sl, fortune, figlet, nano, curl, python3, htop\r\n`, 0x0C);
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            // Local fallback installation
            this.installedPackages.add(pkgArg);
            this.createFile(`/usr/bin/${pkgArg}`, `Package ${pkgArg}`);
            this.cpu.printString(`Setting up ${pkgArg} ... Done\r\n[+] Installed '${pkgArg}' into /usr/bin.\r\n`, 0x0A);
          }
          this.printPrompt();
          return;
        }

        output = 'Usage: apt {update | list | search <term> | install <package>}\r\n';
        break;
      }

      // Executable package handlers
      case 'cowsay': {
        if (!this.installedPackages.has('cowsay')) {
          output = "zsh: command not found: cowsay. Try: 'apt install cowsay'\r\n";
          break;
        }
        const msg = args.join(' ') || 'DraftOS: macOS implementation in JS!';
        const border = '-'.repeat(msg.length + 2);
        output =
          ` ${'_'.repeat(msg.length + 2)}\r\n` +
          `< ${msg} >\r\n` +
          ` ${border}\r\n` +
          `        \\   ^__^\r\n` +
          `         \\  (oo)\\_______\r\n` +
          `            (__)\\       )\\/\\\r\n` +
          `                ||----w |\r\n` +
          `                ||     ||\r\n`;
        break;
      }

      case 'neofetch': {
        if (!this.installedPackages.has('neofetch')) {
          output = "zsh: command not found: neofetch. Try: 'apt install neofetch'\r\n";
          break;
        }
        output =
          '                    c.\'                 user@draft-mac\r\n' +
          '                 ,xNMM.                 --------------\r\n' +
          '               .OMMMMo                  OS: DraftOS 14.5 (macOS Sonoma implementation)\r\n' +
          '               OMMM0,                   Host: Mac Virtual Machine (Mac14,2)\r\n' +
          '     .;loddo:.  .olloddol;.             Kernel: Darwin 23.5.0 (DraftOS XNU)\r\n' +
          '   cKMMMMMMMMMMNWMMMMMMMMMM0:           Uptime: 14 mins\r\n' +
          ' .KMMMMMMMMMMMMMMMMMMMMMMMWd.           Packages: 14 (apt, brew)\r\n' +
          ' XMWWWWWWWWWWWWWWWWWWWWWWMWk            Shell: zsh 5.9\r\n' +
          '.XMWWWWWWWWWWWWWWWWWWWWWWMWd            Terminal: DraftOS VGA Console (640x400)\r\n' +
          ' kMMMMMMMMMMMMMMMMMMMMMMMMWd            CPU: Apple Virtual M-Series (8) @ 3.49GHz\r\n' +
          '  .XMMMMMMMMMMMMMMMMMMMMMMk             GPU: Apple Metal Shading Core\r\n' +
          '   .XMMMMMMMMMMMMMMMMMMMMk.             Memory: 18540MiB / 65536MiB\r\n' +
          '     \'kMMMMMMMMMMMMMMMMk\'\r\n' +
          '       \'yWMMMMMMMMMMk\'\r\n' +
          '          \'cooddoc\'\r\n';
        break;
      }

      case 'tree': {
        if (!this.installedPackages.has('tree')) {
          output = "zsh: command not found: tree. Try: 'apt install tree'\r\n";
          break;
        }
        const targetPath = args[0] ? this.resolvePath(args[0]) : this.cwd;
        const rootNode = this.getNode(targetPath);
        if (!rootNode) {
          output = `tree: ${args[0]}: No such file or directory\r\n`;
        } else {
          output = `${targetPath}\r\n` + this.renderTree(rootNode, '', 0);
        }
        break;
      }

      case 'sl': {
        if (!this.installedPackages.has('sl')) {
          output = "zsh: command not found: sl. Try: 'apt install sl'\r\n";
          break;
        }
        output =
          '     ====        ________                ___________ \r\n' +
          ' _D _|  |_______/        \\__I_I_____===__|_________| \r\n' +
          '   |(_)---  |   H\--/H       | +---+ |   |   |     | \r\n' +
          '   /     |  |   H  | H       | |   | |   |   |     | \r\n' +
          '  |      |  |   H--/ H       | +---+ |   |   |     | \r\n' +
          '  |_________|________________|_______|___|_________| \r\n' +
          '    (O)  (O)        (O)  (O)             (O)   (O)   \r\n';
        break;
      }

      case 'fortune': {
        if (!this.installedPackages.has('fortune')) {
          output = "zsh: command not found: fortune. Try: 'apt install fortune'\r\n";
          break;
        }
        const fortunes = [
          '"Simplicity is prerequisite for reliability." — Edsger W. Dijkstra',
          '"Programs must be written for people to read, and only incidentally for machines to execute." — Abelson & Sussman',
          '"There are only two hard things in Computer Science: cache invalidation and naming things." — Phil Karlton',
          '"Operating systems are like underwear: nobody thinks about them until something goes wrong."',
          '"The best way to predict the future is to invent it." — Alan Kay',
        ];
        const chosen = fortunes[Math.floor(Math.random() * fortunes.length)];
        output = `${chosen}\r\n`;
        break;
      }

      case 'figlet': {
        if (!this.installedPackages.has('figlet')) {
          output = "zsh: command not found: figlet. Try: 'apt install figlet'\r\n";
          break;
        }
        const txt = args.join(' ') || 'DraftOS';
        output =
          ' _  _  _  _  _  _  _  _ \r\n' +
          `| || || || || || || || |\r\n` +
          `| ${txt} |\r\n` +
          '|_||_||_||_||_||_||_||_|\r\n';
        break;
      }

      case 'ps': {
        output =
          'USER              PID  %CPU %MEM      VSZ    RSS   TT  STAT STARTED      TIME COMMAND\r\n' +
          this.tasks
            .map((t) => {
              const u = t.user.padEnd(14, ' ');
              const pid = t.pid.toString().padStart(6, ' ');
              const cpu = t.cpu.toFixed(1).padStart(5, ' ');
              const mem = t.mem.toFixed(1).padStart(4, ' ');
              const vsz = t.vsz.toString().padStart(8, ' ');
              const rss = t.rss.toString().padStart(6, ' ');
              const tty = t.tty.padEnd(6, ' ');
              const stat = t.stat.padEnd(5, ' ');
              const start = t.start.padEnd(8, ' ');
              const time = t.time.padStart(7, ' ');
              return `${u} ${pid} ${cpu} ${mem} ${vsz} ${rss} ${tty} ${stat} ${start} ${time} ${t.command}`;
            })
            .join('\r\n') +
          '\r\n';
        break;
      }

      case 'top':
      case 'htop': {
        output =
          'Processes: 10 total, 2 running, 8 sleeping, 48 threads\r\n' +
          '2026/11/10 06:27:14  Load Avg: 1.05, 0.85, 0.72  CPU usage: 2.4% user, 1.8% sys, 95.8% idle\r\n' +
          'SharedLibs: 185M resident, 42M data, 24M linkedit.  MemRegions: 18412 total, 1854M resident\r\n' +
          'PhysMem: 64G total, 18G used (4120M wired), 46G unused.\r\n\r\n' +
          'PID    COMMAND      %CPU TIME     #TH   #WQ  #PORTS MEM    PURG  CMPRS  PGRP  PPID  STATE\r\n' +
          '1      launchd      0.0  00:01.21 3     1    38     6240K  0B    0B     1     0     running\r\n' +
          '142    WindowServer 1.2  00:04.82 12    4    420    28M    12M   0B     142   1     running\r\n' +
          '250    zsh          0.0  00:00.12 1     1    24     3840K  0B    0B     250   240   sleeping\r\n';
        break;
      }

      case 'dmesg': {
        output = DraftOS.DARWIN_DMESG_ENTRIES.map((e) => e.text).join('\r\n') + '\r\n';
        break;
      }

      case 'pwd': {
        output = this.cwd + '\r\n';
        break;
      }

      case 'cd': {
        const target = args[0] || '/Users/user';
        const resolved = this.resolvePath(target);
        const node = this.getNode(resolved);
        if (node && node.isDir) {
          this.cwd = resolved;
        } else {
          output = `cd: no such file or directory: ${target}\r\n`;
        }
        break;
      }

      case 'ls': {
        let showAll = false;
        let longFormat = false;
        const targetArgs: string[] = [];

        for (const arg of args) {
          if (arg.startsWith('-')) {
            if (arg.includes('a')) showAll = true;
            if (arg.includes('l')) longFormat = true;
          } else {
            targetArgs.push(arg);
          }
        }

        const targetPath = targetArgs[0] ? this.resolvePath(targetArgs[0]) : this.cwd;
        const node = this.getNode(targetPath);

        if (!node) {
          output = `ls: ${targetArgs[0]}: No such file or directory\r\n`;
        } else if (!node.isDir) {
          output = node.name + '\r\n';
        } else {
          const children = node.children || {};
          const keys = Object.keys(children).sort();
          if (longFormat) {
            output = `total ${keys.length * 4}\r\n`;
            if (showAll) {
              output += 'drwxr-xr-x   4 user  staff   128 Nov 10 06:27 .\r\n';
              output += 'drwxr-xr-x   6 user  staff   192 Nov 10 06:27 ..\r\n';
            }
            for (const k of keys) {
              const item = children[k];
              const perm = item.isDir ? 'drwxr-xr-x' : '-rw-r--r--';
              const sz = item.size.toString().padStart(8, ' ');
              output += `${perm}   1 user  staff  ${sz} Nov 10 06:27 ${k}\r\n`;
            }
          } else {
            const list = showAll ? ['.', '..', ...keys] : keys;
            output = list.join('  ') + '\r\n';
          }
        }
        break;
      }

      case 'cat': {
        if (args.length === 0) {
          output = 'cat: missing operand\r\n';
          break;
        }
        for (const f of args) {
          const resolved = this.resolvePath(f);
          const node = this.getNode(resolved);
          if (!node) {
            output += `cat: ${f}: No such file or directory\r\n`;
          } else if (node.isDir) {
            output += `cat: ${f}: Is a directory\r\n`;
          } else {
            output += (node.content || '').replace(/\n/g, '\r\n');
            if (!output.endsWith('\r\n')) output += '\r\n';
          }
        }
        break;
      }

      case 'echo': {
        output = args.join(' ') + '\r\n';
        break;
      }

      case 'touch': {
        if (args.length === 0) {
          output = 'touch: missing file operand\r\n';
        } else {
          for (const f of args) {
            this.createFile(this.resolvePath(f), '');
          }
        }
        break;
      }

      case 'mkdir': {
        if (args.length === 0) {
          output = 'mkdir: missing operand\r\n';
        } else {
          for (const d of args) {
            this.createDir(this.resolvePath(d));
          }
        }
        break;
      }

      case 'rm': {
        if (args.length === 0) {
          output = 'rm: missing operand\r\n';
        } else {
          const target = args[args.length - 1];
          this.removeNode(this.resolvePath(target));
        }
        break;
      }

      case 'grep': {
        if (args.length < 2) {
          output = 'Usage: grep <pattern> <file>\r\n';
        } else {
          const pat = args[0];
          const node = this.getNode(this.resolvePath(args[1]));
          if (!node || node.isDir) {
            output = `grep: ${args[1]}: No such file\r\n`;
          } else {
            const lines = (node.content || '').split('\n');
            const matched = lines.filter((l) => l.includes(pat));
            output = matched.join('\r\n') + (matched.length > 0 ? '\r\n' : '');
          }
        }
        break;
      }

      case 'wc': {
        const file = args[args.length - 1];
        const node = this.getNode(this.resolvePath(file));
        if (!node || node.isDir) {
          output = `wc: ${file}: No such file\r\n`;
        } else {
          const text = node.content || '';
          const lines = text.split('\n').length - 1;
          const words = text.split(/\s+/).filter(Boolean).length;
          const bytes = text.length;
          output = ` ${lines}  ${words} ${bytes} ${file}\r\n`;
        }
        break;
      }

      case 'whoami': {
        output = 'user\r\n';
        break;
      }

      case 'id': {
        output = 'uid=501(user) gid=20(staff) groups=20(staff),12(everyone),61(localaccounts),80(admin)\r\n';
        break;
      }

      case 'uptime': {
        output = ' 06:27:14 up 14 mins, 1 user, load averages: 1.05 0.85 0.72\r\n';
        break;
      }

      case 'date': {
        output = new Date().toUTCString() + '\r\n';
        break;
      }

      case 'hostname': {
        output = 'draft-mac.local\r\n';
        break;
      }

      case 'clear': {
        this.cpu.initVRAM();
        this.cpu.cursorRow = 0;
        this.cpu.cursorCol = 0;
        this.printPrompt();
        return;
      }

      case 'spawn': {
        const name = args.join(' ') || 'background_worker';
        const newPid = this.nextPid++;
        this.tasks.push({
          user: 'user',
          pid: newPid,
          ppid: 250,
          cpu: 0.1,
          mem: 0.2,
          vsz: 4096,
          rss: 1024,
          tty: 'ttys000',
          stat: 'S',
          start: '06:27',
          time: '0:00',
          command: name,
        });
        output = `[+] Spawned background process '${name}' with PID ${newPid}\r\n`;
        break;
      }

      case 'kill': {
        const targetPid = parseInt(args[0], 10);
        if (isNaN(targetPid)) {
          output = 'Usage: kill <pid>\r\n';
        } else {
          const idx = this.tasks.findIndex((t) => t.pid === targetPid);
          if (idx !== -1) {
            const killed = this.tasks.splice(idx, 1)[0];
            output = `[+] Process ${targetPid} (${killed.command}) terminated\r\n`;
          } else {
            output = `kill: (${targetPid}) - No such process\r\n`;
          }
        }
        break;
      }

      case 'regs': {
        output =
          'CPU Registers (Apple Virtual M-Series / DraftOS Core):\r\n' +
          `  AX: 0x${this.cpu.AX.toString(16).padStart(4, '0').toUpperCase()}  ` +
          `BX: 0x${this.cpu.BX.toString(16).padStart(4, '0').toUpperCase()}  ` +
          `CX: 0x${this.cpu.CX.toString(16).padStart(4, '0').toUpperCase()}  ` +
          `DX: 0x${this.cpu.DX.toString(16).padStart(4, '0').toUpperCase()}\r\n` +
          `  SI: 0x${this.cpu.SI.toString(16).padStart(4, '0').toUpperCase()}  ` +
          `DI: 0x${this.cpu.DI.toString(16).padStart(4, '0').toUpperCase()}  ` +
          `BP: 0x${this.cpu.BP.toString(16).padStart(4, '0').toUpperCase()}  ` +
          `SP: 0x${this.cpu.SP.toString(16).padStart(4, '0').toUpperCase()}\r\n` +
          `  FLAGS: [Z:${this.cpu.flags.zero ? 1 : 0} C:${this.cpu.flags.carry ? 1 : 0} S:${this.cpu.flags.sign ? 1 : 0}]\r\n`;
        break;
      }

      case 'reboot': {
        this.cpu.printString('\r\nShutdown NOW with SIGTERM to all launchd services...\r\n', 0x0C);
        this.cpu.printString('Unmounting APFS container /dev/disk1s1 ... Done\r\n', 0x07);
        this.cpu.printString('Apple Inc. EFI Warm Reset Vector invoked.\r\n', 0x0F);

        setTimeout(() => {
          this.startAppleColdBoot();
        }, 800);
        return;
      }

      default: {
        output = `zsh: command not found: ${cmd}. (Type 'help' or 'apt install ${cmd}')\r\n`;
      }
    }

    if (redirectionFile) {
      const resolved = this.resolvePath(redirectionFile);
      if (append) {
        const existing = this.getNode(resolved)?.content || '';
        this.createFile(resolved, existing + output.replace(/\r\n/g, '\n'));
      } else {
        this.createFile(resolved, output.replace(/\r\n/g, '\n'));
      }
    } else {
      this.cpu.printString(output, 0x07);
    }

    this.printPrompt();
  }

  // Recursive tree rendering helper
  private renderTree(node: Inode, prefix: string, depth: number): string {
    if (depth > 4) return '';
    let result = '';
    const children = node.children || {};
    const keys = Object.keys(children).sort();

    keys.forEach((key, index) => {
      const isLast = index === keys.length - 1;
      const child = children[key];
      const branch = isLast ? '└── ' : '├── ';
      result += `${prefix}${branch}${key}\r\n`;
      if (child.isDir) {
        result += this.renderTree(child, prefix + (isLast ? '    ' : '│   '), depth + 1);
      }
    });

    return result;
  }

  private resolvePath(pathStr: string): string {
    if (pathStr === '~') return '/Users/user';
    if (pathStr.startsWith('~/')) pathStr = '/Users/user/' + pathStr.slice(2);
    let absolute = pathStr.startsWith('/') ? pathStr : `${this.cwd}/${pathStr}`;
    const parts = absolute.split('/').filter(Boolean);
    const resolvedParts: string[] = [];

    for (const p of parts) {
      if (p === '.') continue;
      if (p === '..') {
        resolvedParts.pop();
      } else {
        resolvedParts.push(p);
      }
    }

    return '/' + resolvedParts.join('/');
  }

  public getNode(pathStr: string): Inode | null {
    if (pathStr === '/') return this.vfsRoot;
    const parts = pathStr.split('/').filter(Boolean);
    let curr: Inode = this.vfsRoot;

    for (const part of parts) {
      if (!curr.children || !curr.children[part]) {
        return null;
      }
      curr = curr.children[part];
    }
    return curr;
  }

  public createFile(pathStr: string, content: string): void {
    const parts = pathStr.split('/').filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) return;

    let parentPath = '/' + parts.join('/');
    if (parentPath === '') parentPath = '/';
    let parentNode = this.getNode(parentPath);

    if (!parentNode) {
      // Auto-create parent directory tree
      this.createDir(parentPath);
      parentNode = this.getNode(parentPath);
    }

    if (parentNode && parentNode.isDir) {
      parentNode.children = parentNode.children || {};
      parentNode.children[fileName] = {
        name: fileName,
        isDir: false,
        size: content.length,
        content: content,
      };
    }
  }

  public createDir(pathStr: string): void {
    const parts = pathStr.split('/').filter(Boolean);
    let currentPath = '';

    for (const part of parts) {
      const parentPath = currentPath === '' ? '/' : currentPath;
      currentPath = currentPath + '/' + part;
      const parentNode = this.getNode(parentPath);
      if (parentNode && parentNode.isDir) {
        parentNode.children = parentNode.children || {};
        if (!parentNode.children[part]) {
          parentNode.children[part] = {
            name: part,
            isDir: true,
            size: 4096,
            children: {},
          };
        }
      }
    }
  }

  public removeNode(pathStr: string): void {
    const parts = pathStr.split('/').filter(Boolean);
    const targetName = parts.pop();
    if (!targetName) return;

    const parentPath = '/' + parts.join('/');
    const parentNode = this.getNode(parentPath);
    if (parentNode && parentNode.children && parentNode.children[targetName]) {
      delete parentNode.children[targetName];
    }
  }
}
