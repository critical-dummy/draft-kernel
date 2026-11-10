export interface SourceFile {
  name: string;
  language: 'c' | 'h' | 'asm';
  description: string;
  content: string;
}

export const KERNEL_SOURCES: SourceFile[] = [
  {
    name: 'bios.h',
    language: 'h',
    description: 'BIOS Hardware Interface, Memory Maps & IVT Offsets',
    content: `/*
 * bios.h - Draft Emulator Basic Input/Output System Header
 * Architecture: 16-bit Virtual Real Mode / 32-bit Protected Handoff
 */

#ifndef _DRAFT_BIOS_H_
#define _DRAFT_BIOS_H_

#include <stdint.h>

#define BIOS_SEGMENT         0xF000
#define BOOT_SECTOR_ORIGIN   0x7C00
#define KERNEL_LOAD_OFFSET   0x1000
#define VRAM_TEXT_BASE       0xB800
#define VRAM_COLS            80
#define VRAM_ROWS            25

/* Interrupt Vector Table (IVT) Offsets */
#define IVT_DIVIDE_ERROR     0x00
#define IVT_KEYBOARD         0x09
#define IVT_VIDEO_SERVICE    0x10
#define IVT_DISK_SERVICE     0x13
#define IVT_TIMER_TICK       0x20
#define IVT_SYSCALL_GATE     0x80

/* Hardware I/O Ports */
#define PORT_KEYBOARD_DATA   0x60
#define PORT_KEYBOARD_CMD    0x64
#define PORT_COM1_SERIAL     0x3F8

typedef struct {
    uint16_t ax, bx, cx, dx;
    uint16_t si, di, bp, sp;
    uint16_t ip, cs, flags;
} __attribute__((packed)) bios_regs_t;

void bios_init(void);
void bios_post_check(void);
void bios_install_ivt(void);
void bios_print_string(const char *str, uint8_t color);
int  bios_load_sector(uint8_t drive, uint32_t lba, void *dst);

#endif /* _DRAFT_BIOS_H_ */
`,
  },
  {
    name: 'bios.c',
    language: 'c',
    description: 'BIOS Power-On Self Test (POST), Video Services & Bootloader Invocation',
    content: `/*
 * bios.c - Draft Emulator BIOS Implementation
 * Runs at 0xF000 during cold boot
 */

#include "bios.h"

static volatile uint16_t *vram = (uint16_t *)VRAM_TEXT_BASE;
static uint16_t cursor_pos = 0;

void bios_post_check(void) {
    bios_print_string("[BIOS] ROM v1.4.0 (Draft Virtual Machine)\r\n", 0x0A);
    bios_print_string("[BIOS] RAM Check: 65,536 Bytes OK\r\n", 0x07);
    bios_print_string("[BIOS] Primary Display: VGA Text 80x25\r\n", 0x07);
    bios_print_string("[BIOS] Peripheral: PS/2 Keyboard, COM1 (0x3F8) OK\r\n", 0x07);
}

void bios_print_string(const char *str, uint8_t color) {
    while (*str) {
        if (*str == '\\r') {
            cursor_pos = (cursor_pos / VRAM_COLS) * VRAM_COLS;
        } else if (*str == '\\n') {
            cursor_pos += VRAM_COLS;
        } else {
            vram[cursor_pos++] = ((uint16_t)color << 8) | (uint8_t)(*str);
        }
        str++;
    }
}

void bios_init(void) {
    bios_post_check();
    bios_install_ivt();

    bios_print_string("[BIOS] Booting from Drive 0 (Floppy/VDisk)...\r\n", 0x0E);
    
    /* Load Sector 0 into 0x7C00 */
    uint16_t *boot_sig = (uint16_t *)(BOOT_SECTOR_ORIGIN + 510);
    if (*boot_sig != 0xAA55) {
        bios_print_string("[BIOS] FATAL: Invalid Boot Signature (Missing 0xAA55)\r\n", 0x0C);
        for (;;) { __asm__ volatile("hlt"); }
    }

    bios_print_string("[BIOS] Handoff control to Bootloader at 0x7C00\r\n\r\n", 0x0A);
    
    /* Far jump to 0x0000:0x7C00 */
    void (*boot_entry)(void) = (void (*)(void))BOOT_SECTOR_ORIGIN;
    boot_entry();
}
`,
  },
  {
    name: 'boot.asm',
    language: 'asm',
    description: '16-bit Master Boot Record (MBR) Bootloader (0x7C00)',
    content: `; ===================================================================
; boot.asm - Draft Kernel MBR Bootloader (Sector 0)
; Assembled with NASM -> 512 bytes binary
; ===================================================================

[BITS 16]
[ORG 0x7C00]

boot_start:
    cli                     ; Disable interrupts during setup
    xor ax, ax              ; AX = 0
    mov ds, ax              ; Set DS, ES, SS segments to 0
    mov es, ax
    mov ss, ax
    mov sp, 0x7BFE          ; Stack grows downward from below bootloader

    sti                     ; Re-enable interrupts

    ; Print Bootloader Greeting via BIOS INT 0x10
    mov si, msg_loading
    call print_string

    ; Load Draft Kernel binary from disk to 0x1000
    mov bx, 0x1000          ; Target memory address
    mov dh, 16              ; Read 16 sectors (8KB kernel core)
    mov dl, 0x00            ; Drive 0
    call disk_read

    ; Jump to Kernel entry point
    mov si, msg_jumping
    call print_string

    jmp 0x0000:0x1000       ; Jump to Draft Kernel!

print_string:
    lodsb
    or al, al
    jz .done
    mov ah, 0x0E            ; BIOS teletype function
    int 0x10
    jmp print_string
.done:
    ret

disk_read:
    ; Simulated disk read routine
    ret

msg_loading: db "[BOOT] Draft Bootloader v0.8 loaded at 0x7C00", 13, 10, 0
msg_jumping: db "[BOOT] Transferring control to Draft Kernel (0x1000)...", 13, 10, 0

; Pad remaining bytes to 510 and append MBR signature (0xAA55)
times 510 - ($ - $$) db 0
dw 0xAA55
`,
  },
  {
    name: 'kernel.h',
    language: 'h',
    description: 'Draft Kernel System Structures, VFS, and Process Scheduler Header',
    content: `/*
 * kernel.h - Draft Kernel Architecture & System Declarations
 * Draft OS Micro-Kernel Project
 */

#ifndef _DRAFT_KERNEL_H_
#define _DRAFT_KERNEL_H_

#include <stdint.h>

#define MAX_PROCESSES   16
#define STACK_SIZE      2048
#define KERNEL_VERSION  "Draft Kernel v0.8.2-x86"

typedef enum {
    TASK_RUNNING = 0,
    TASK_READY,
    TASK_BLOCKED,
    TASK_ZOMBIE
} task_state_t;

typedef struct task_struct {
    uint32_t pid;
    uint32_t ppid;
    char     name[32];
    task_state_t state;
    uint32_t priority;
    uint32_t esp;
    uint32_t cr3;            /* Page directory base */
    uint32_t cpu_ticks;
    uint32_t memory_kb;
    struct task_struct *next;
} task_t;

/* Syscall numbers */
#define SYS_EXIT    1
#define SYS_FORK    2
#define SYS_READ    3
#define SYS_WRITE   4
#define SYS_OPEN    5
#define SYS_CLOSE   6
#define SYS_GETPID  20
#define SYS_PS      50

void kernel_main(void);
void scheduler_init(void);
void schedule_round_robin(void);
void vfs_init(void);
int  sys_dispatch(uint32_t syscall_num, uint32_t arg1, uint32_t arg2, uint32_t arg3);

#endif /* _DRAFT_KERNEL_H_ */
`,
  },
  {
    name: 'kernel.c',
    language: 'c',
    description: 'Draft Kernel Main Entry Point, Process Initialization & Shell Loop',
    content: `/*
 * kernel.c - Draft Kernel Core Implementation
 * Entry point at 0x1000 after BIOS/Bootloader handoff
 */

#include "kernel.h"
#include "bios.h"

static task_t process_table[MAX_PROCESSES];
static task_t *current_task = 0;

void kernel_main(void) {
    bios_print_string("====================================================\\r\\n", 0x0B);
    bios_print_string("      Welcome to " KERNEL_VERSION " \\r\\n", 0x0F);
    bios_print_string("      Monolithic Core / Round-Robin Task Scheduler\\r\\n", 0x03);
    bios_print_string("====================================================\\r\\n\\r\\n", 0x0B);

    bios_print_string("[KERNEL] Initializing Virtual Memory & GDT... OK\\r\\n", 0x07);
    bios_print_string("[KERNEL] Mounting Virtual File System (VFS)... OK\\r\\n", 0x07);
    bios_print_string("[KERNEL] Registering Syscall Interrupt Gate (INT 0x80)... OK\\r\\n", 0x07);
    bios_print_string("[KERNEL] Spawning Task 0: [swapper/idle]... OK\\r\\n", 0x07);
    bios_print_string("[KERNEL] Spawning Task 1: [init/draft-core]... OK\\r\\n", 0x07);
    bios_print_string("[KERNEL] Spawning Task 2: [ttyd/shell]... OK\\r\\n\\r\\n", 0x07);

    scheduler_init();

    bios_print_string("Draft OS Kernel ready. Type 'help' for available commands.\\r\\n", 0x0A);
    bios_print_string("draft-os:/# ", 0x0E);

    /* Main kernel execution loop */
    for (;;) {
        __asm__ volatile("sti; hlt");
    }
}

void scheduler_init(void) {
    /* Process 0: swapper */
    process_table[0].pid = 0;
    process_table[0].state = TASK_RUNNING;
    process_table[0].memory_kb = 32;

    /* Process 1: init */
    process_table[1].pid = 1;
    process_table[1].state = TASK_READY;
    process_table[1].memory_kb = 128;

    /* Process 2: shell */
    process_table[2].pid = 2;
    process_table[2].state = TASK_READY;
    process_table[2].memory_kb = 64;

    current_task = &process_table[0];
}
`,
  },
];
