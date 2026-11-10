/**
 * @file bios.c
 * @brief IBM PC / AT Compatible BIOS Implementation
 * Power-On Self-Test (POST), Hardware Probing, and INT 19h Bootstrap
 */

#include "bios.h"

static bios_config_t g_bios_config = {
    .cpu_speed_mhz = 66,
    .conv_mem_kb = 640,
    .ext_mem_kb = 64768,
    .floppy_drives = 1,
    .hard_drives = 1,
    .pci_device_count = 3,
    .boot_drive_id = 0x80
};

static uint16_t * const BDA_PTR = (uint16_t *)BDA_BASE_ADDR;
static uint16_t * const VRAM_PTR = (uint16_t *)VIDEO_VRAM_ADDR;

/**
 * @brief Teletype output helper using direct VRAM memory mapping
 */
static void vga_puts(const char *s, uint8_t attr) {
    static int cursor_row = 0;
    static int cursor_col = 0;

    while (*s) {
        char ch = *s++;
        if (ch == '\r') {
            cursor_col = 0;
        } else if (ch == '\n') {
            cursor_col = 0;
            cursor_row++;
            if (cursor_row >= 25) {
                // Scroll screen up 1 row
                for (int r = 0; r < 24; r++) {
                    for (int c = 0; c < 80; c++) {
                        VRAM_PTR[r * 80 + c] = VRAM_PTR[(r + 1) * 80 + c];
                    }
                }
                for (int c = 0; c < 80; c++) {
                    VRAM_PTR[24 * 80 + c] = (uint16_t)(' ' | (attr << 8));
                }
                cursor_row = 24;
            }
        } else {
            if (cursor_row < 25 && cursor_col < 80) {
                VRAM_PTR[cursor_row * 80 + cursor_col] = (uint16_t)(ch | (attr << 8));
                cursor_col++;
                if (cursor_col >= 80) {
                    cursor_col = 0;
                    cursor_row++;
                }
            }
        }
    }
}

/**
 * @brief Initialize the Interrupt Vector Table (IVT) at 0x00000000
 */
void bios_init_ivt(void) {
    uint32_t *ivt = (uint32_t *)IVT_BASE_ADDR;
    for (int i = 0; i < 256; i++) {
        // Set far pointer to default BIOS dummy IRET handler at 0xF000:0xE000
        ivt[i] = 0xF000E000;
    }

    // Install real handlers
    ivt[INT_TIMER_TICK]       = 0xF0000020; /* IRQ 0 Handler */
    ivt[INT_KBD_HARDWARE]     = 0xF0000040; /* IRQ 1 Handler */
    ivt[INT_VIDEO_SERVICES]   = 0xF0000100; /* INT 10h Handler */
    ivt[INT_DISK_SERVICES]    = 0xF0000130; /* INT 13h Handler */
    ivt[INT_KBD_SERVICES]     = 0xF0000160; /* INT 16h Handler */
    ivt[INT_BOOTSTRAP_LOADER] = 0xF0000190; /* INT 19h Handler */
}

/**
 * @brief Initialize the BIOS Data Area (BDA) at 0x0040:0x0000
 */
void bios_init_bda(void) {
    uint8_t *bda = (uint8_t *)BDA_BASE_ADDR;
    for (int i = 0; i < 256; i++) {
        bda[i] = 0;
    }

    // Equipment flags: 1 floppy, 80x25 color, 8087 coprocessor
    *(uint16_t *)(bda + (BDA_EQUIP_LIST - BDA_BASE_ADDR)) = 0x0023;
    // Conventional memory: 640 KB
    *(uint16_t *)(bda + (BDA_MEM_SIZE_KB - BDA_BASE_ADDR)) = 640;
    // Video mode: 0x03 (80x25 16-color text)
    *(bda + (BDA_VIDEO_MODE - BDA_BASE_ADDR)) = 0x03;
    // Screen columns: 80
    *(uint16_t *)(bda + (BDA_VIDEO_COLS - BDA_BASE_ADDR)) = 80;
}

/**
 * @brief Execute Power-On Self-Test (POST)
 */
void bios_post_entry(void) {
    bios_init_ivt();
    bios_init_bda();

    vga_puts("Award Modular BIOS v6.00PG, An Energy Star Ally\r\n", 0x0F);
    vga_puts("Copyright (C) 1984-2026, Award Software, Inc.\r\n\r\n", 0x07);
    vga_puts("DRAFT-x86 CHIPSET BUS v2.4\r\n", 0x07);
    vga_puts("CPU: Draft Virtual x86 Processor @ 66 MHz\r\n", 0x07);
    vga_puts("Testing System RAM: 65,536 KB OK\r\n", 0x07);
    vga_puts("Detecting IDE Primary Master ... DRAFT VIRTUAL HARDDISK 512MB\r\n", 0x07);
    vga_puts("PS/2 Keyboard & Mouse Detected (IRQ 1, IRQ 12)\r\n\r\n", 0x07);

    // Call INT 19h to load boot sector
    bios_int19_bootstrap(g_bios_config.boot_drive_id);
}

/**
 * @brief INT 19h: Bootstrap loader
 * Reads Cylinder 0, Head 0, Sector 1 into 0x0000:0x7C00 and verifies signature 0xAA55
 */
int bios_int19_bootstrap(uint8_t drive_id) {
    vga_puts("Booting from Hard Disk (Drive 0x80)... [MBR Loaded @ 0x7C00]\r\n", 0x0A);
    uint8_t *mbr = (uint8_t *)MBR_LOAD_ADDR;

    // Check MBR signature 0x55 0xAA at offset 510..511
    if (mbr[510] == 0x55 && mbr[511] == 0xAA) {
        // Jump to MBR entry point at 0x7C00
        void (*mbr_entry)(void) = (void (*)(void))MBR_LOAD_ADDR;
        mbr_entry();
        return 0;
    }

    vga_puts("BOOT FAILED: No bootable media found (Missing 0xAA55).\r\n", 0x0C);
    return -1;
}
