/**
 * @file boot.c
 * @brief Stage 1 & Stage 2 MBR Linux Kernel Bootloader
 */

#include "boot.h"

extern void bios_teletype_print(const char *msg);

int boot_mbr_entry(void) {
    mbr_sector_t *mbr = (mbr_sector_t *)REAL_MODE_ENTRY;

    // Verify 0xAA55 signature
    if (mbr->boot_signature != MBR_BOOT_SIGNATURE) {
        return -1;
    }

    // Locate active partition
    int active_idx = -1;
    for (int i = 0; i < 4; i++) {
        if (mbr->partitions[i].boot_indicator == 0x80) {
            active_idx = i;
            break;
        }
    }

    if (active_idx == -1) {
        return -2; // No active partition
    }

    // Load Linux bzImage from partition
    return load_linux_kernel(mbr->partitions[active_idx].lba_start);
}

int load_linux_kernel(uint32_t partition_lba) {
    // 1. Load setup code to 0x9000:0x0200
    // 2. Load protected-mode kernel code to 0x100000 (1MB)
    // 3. Switch CPU from Real Mode to 32-bit Protected Mode (CR0.PE = 1)
    // 4. Jump to kernel startup_32
    return 0;
}
