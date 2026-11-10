/**
 * @file boot.h
 * @brief Master Boot Record (MBR) and Linux Kernel Bootloader Protocol
 */

#ifndef _DRAFT_BOOT_H_
#define _DRAFT_BOOT_H_

#include <stdint.h>

#define MBR_BOOT_SIGNATURE  0xAA55
#define SECTOR_SIZE         512
#define LINUX_BOOT_ADDR     0x00100000  /* 1 MB Protected Mode Kernel Load */
#define REAL_MODE_ENTRY     0x00007C00

/* MBR Partition Table Entry (16 bytes) */
typedef struct {
    uint8_t  boot_indicator;  /* 0x80 = Active / Bootable, 0x00 = Inactive */
    uint8_t  start_head;
    uint8_t  start_sector : 6;
    uint16_t start_cylinder : 10;
    uint8_t  partition_type;  /* 0x83 = Linux Native EXT4 */
    uint8_t  end_head;
    uint8_t  end_sector : 6;
    uint16_t end_cylinder : 10;
    uint32_t lba_start;       /* Logical Block Address of first sector */
    uint32_t sector_count;    /* Number of sectors in partition */
} __attribute__((packed)) partition_entry_t;

/* Standard 512-byte Master Boot Record */
typedef struct {
    uint8_t           bootstrap_code[446];
    partition_entry_t partitions[4];
    uint16_t          boot_signature;
} __attribute__((packed)) mbr_sector_t;

/* Bootloader functions */
int boot_mbr_entry(void);
int load_linux_kernel(uint32_t partition_lba);

#endif /* _DRAFT_BOOT_H_ */
