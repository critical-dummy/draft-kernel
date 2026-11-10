/**
 * @file bios.h
 * @brief IBM PC / AT Compatible BIOS Architecture Specification
 * Real Mode 16-bit Interrupt Vector Table (IVT) and BIOS Data Area (BDA)
 */

#ifndef _DRAFT_BIOS_H_
#define _DRAFT_BIOS_H_

#include <stdint.h>

/* Physical Memory Map Constants */
#define IVT_BASE_ADDR        0x00000000
#define BDA_BASE_ADDR        0x00000400  /* 0x0040:0x0000 BIOS Data Area */
#define CONV_MEM_TOP         0x0009FFFF  /* 640 KB Conventional Memory */
#define VIDEO_VRAM_ADDR      0x000B8000  /* 80x25 Color Text Mode VRAM */
#define MBR_LOAD_ADDR        0x00007C00  /* 0x0000:0x7C00 Boot Sector */
#define BIOS_ROM_BASE        0x000F0000  /* 64 KB BIOS ROM Base */
#define RESET_VECTOR_ADDR    0x000FFFF0  /* 0xFFFF:0x0000 Power-on Reset */

/* BIOS Data Area (BDA) Offsets */
#define BDA_EQUIP_LIST       0x0410  /* Word: Installed hardware flags */
#define BDA_MEM_SIZE_KB      0x0413  /* Word: Conventional RAM in KB (640) */
#define BDA_KBD_HEAD         0x041A  /* Word: Head pointer in kbd buffer */
#define BDA_KBD_TAIL         0x041C  /* Word: Tail pointer in kbd buffer */
#define BDA_KBD_BUF_START    0x041E  /* 32-byte circular keyboard buffer */
#define BDA_VIDEO_MODE       0x0449  /* Byte: Active display mode (0x03) */
#define BDA_VIDEO_COLS       0x044A  /* Word: Screen columns (80) */
#define BDA_CURSOR_POS       0x0450  /* 8 Words: Cursor pos for pages 0-7 */
#define BDA_TIMER_TICKS      0x046C  /* Dword: Ticks since midnight */

/* Standard BIOS Interrupt Numbers */
#define INT_DIV_BY_ZERO      0x00
#define INT_SINGLE_STEP      0x01
#define INT_NMI              0x02
#define INT_BREAKPOINT       0x03
#define INT_TIMER_TICK       0x08    /* IRQ 0: 18.2065 Hz system timer */
#define INT_KBD_HARDWARE     0x09    /* IRQ 1: PS/2 Keyboard scan code */
#define INT_VIDEO_SERVICES   0x10    /* Video display routines */
#define INT_EQUIPMENT_CHECK  0x11    /* Returns equipment word in AX */
#define INT_MEMORY_SIZE      0x12    /* Returns conventional memory in AX */
#define INT_DISK_SERVICES    0x13    /* Low-level disk read/write/seek */
#define INT_SERIAL_COMM      0x14    /* RS-232 serial communications */
#define INT_SYSTEM_SERVICES  0x15    /* E820 memory map, APM, wait */
#define INT_KBD_SERVICES     0x16    /* Software keyboard getch/status */
#define INT_PRINTER_SERVICES 0x17    /* Parallel printer services */
#define INT_BOOTSTRAP_LOADER 0x19    /* INT 19h: Load sector 0 into 0x7C00 */
#define INT_RTC_SERVICES     0x1A    /* Real-Time Clock read/set */

/* INT 10h Video Sub-functions */
#define V_SET_MODE           0x00
#define V_SET_CURSOR_TYPE    0x01
#define V_SET_CURSOR_POS     0x02
#define V_GET_CURSOR_POS     0x03
#define V_SCROLL_UP          0x06
#define V_SCROLL_DOWN        0x07
#define V_READ_CHAR_ATTR     0x08
#define V_WRITE_CHAR_ATTR    0x09
#define V_TELETYPE_OUTPUT    0x0E

/* INT 13h Disk Sub-functions */
#define D_RESET_DISK         0x00
#define D_GET_STATUS         0x01
#define D_READ_SECTORS       0x02
#define D_WRITE_SECTORS      0x03
#define D_VERIFY_SECTORS     0x04
#define D_GET_DRIVE_PARAMS   0x08

/* BIOS Hardware Configuration Record */
typedef struct {
    uint16_t cpu_speed_mhz;
    uint16_t conv_mem_kb;
    uint32_t ext_mem_kb;
    uint8_t  floppy_drives;
    uint8_t  hard_drives;
    uint16_t pci_device_count;
    uint8_t  boot_drive_id;      /* 0x00: Floppy A, 0x80: HDD 0 */
} bios_config_t;

/* BIOS Function Prototypes */
void bios_post_entry(void);
void bios_init_ivt(void);
void bios_init_bda(void);
void bios_test_memory(uint32_t *out_mem_kb);
void bios_probe_hardware(bios_config_t *cfg);
int  bios_int10_handler(uint8_t ah, uint8_t al, uint8_t bh, uint8_t bl, uint8_t ch, uint8_t cl, uint8_t dh, uint8_t dl);
int  bios_int13_handler(uint8_t ah, uint8_t drive, uint8_t cyl, uint8_t head, uint8_t sec, uint8_t count, void *buf);
int  bios_int19_bootstrap(uint8_t drive_id);

#endif /* _DRAFT_BIOS_H_ */
