// Hardware Memory Map
export const MEMORY_SIZE = 65536; // 64 KB RAM
export const IVT_BASE = 0x0000;    // Interrupt Vector Table: 0x0000 - 0x03FF
export const BDA_BASE = 0x0400;    // BIOS Data Area: 0x0400 - 0x04FF
export const BOOTLOADER_ADDR = 0x7C00; // MBR Boot Sector: 0x7C00 - 0x7DFF
export const KERNEL_ADDR = 0x1000;     // Draft Kernel Entry: 0x1000
export const VRAM_BASE = 0xB800;       // Color Text Video Memory (80x25 = 2000 chars * 2 bytes = 4000 bytes)
export const VRAM_COLS = 80;
export const VRAM_ROWS = 25;
export const STACK_TOP = 0xFFFE;

// Hardware Ports
export const PORT_PIT_DATA = 0x40;
export const PORT_PIT_CMD = 0x43;
export const PORT_KBD_DATA = 0x60;
export const PORT_KBD_STATUS = 0x64;
export const PORT_VGA_INDEX = 0x3D4;
export const PORT_VGA_DATA = 0x3D5;
export const PORT_SERIAL = 0x3F8;

// Standard IRQ numbers
export const IRQ_TIMER = 0x20;    // INT 0x20 (PIT)
export const IRQ_KEYBOARD = 0x21; // INT 0x21 (PS/2 Keyboard)
export const INT_SYSCALL = 0x80;  // INT 0x80 (Kernel Syscall)
export const INT_BIOS_VIDEO = 0x10; // INT 0x10 (BIOS Display)

// VGA Text Colors
export const COLOR_BLACK = 0x0;
export const COLOR_BLUE = 0x1;
export const COLOR_GREEN = 0x2;
export const COLOR_CYAN = 0x3;
export const COLOR_RED = 0x4;
export const COLOR_MAGENTA = 0x5;
export const COLOR_BROWN = 0x6;
export const COLOR_LIGHT_GRAY = 0x7;
export const COLOR_DARK_GRAY = 0x8;
export const COLOR_LIGHT_GREEN = 0xA;
export const COLOR_LIGHT_CYAN = 0xB;
export const COLOR_YELLOW = 0xE;
export const COLOR_WHITE = 0xF;
