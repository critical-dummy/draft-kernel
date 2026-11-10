; ==============================================================================
; Draft MBR (Master Boot Record) Stage 1 Bootloader
; Loaded by BIOS INT 19h at physical address 0x0000:0x7C00
; ==============================================================================
[BITS 16]
[ORG 0x7C00]

start:
    cli                     ; Disable interrupts during setup
    xor ax, ax              ; Zero segment registers (CS=0, DS=0, ES=0, SS=0)
    mov ds, ax
    mov es, ax
    mov ss, ax
    mov sp, 0x7C00          ; Stack grows downward from bootloader entry
    sti                     ; Re-enable interrupts

    ; Print MBR Stage 1 Banner via BIOS INT 10h Teletype
    mov si, msg_loading
    call print_string

    ; Check partition table entry 1 at 0x7DBE
    mov si, 0x7DBE
    cmp byte [si], 0x80     ; Is partition active / bootable?
    jne no_active_part

    ; Read Stage 2 / Kernel setup sectors via BIOS INT 13h
    mov ah, 0x02            ; BIOS Read Sectors
    mov al, 16              ; Count: 16 sectors (8 KB)
    mov ch, 0               ; Cylinder: 0
    mov cl, 2               ; Sector: 2 (immediately after MBR)
    mov dh, 0               ; Head: 0
    mov dl, 0x80            ; Drive: First Hard Drive (C:)
    mov bx, 0x1000          ; Destination: 0x0000:0x1000
    int 0x13
    jc disk_error

    ; Jump to Kernel Protected Mode Entry Point
    jmp 0x0000:0x1000

disk_error:
    mov si, msg_disk_err
    call print_string
    hlt

no_active_part:
    mov si, msg_no_part
    call print_string
    hlt

print_string:
    lodsb
    or al, al
    jz .done
    mov ah, 0x0E            ; INT 10h Teletype
    mov bh, 0
    mov bl, 0x07            ; Light gray
    int 0x10
    jmp print_string
.done:
    ret

msg_loading:  db "GRUB loading stage 1.5...", 13, 10, 0
msg_disk_err: db "Error reading boot device.", 13, 10, 0
msg_no_part:  db "No active boot partition found.", 13, 10, 0

; Fill remaining space up to 446 bytes
times 446 - ($ - $$) db 0

; Standard Partition Table (64 bytes)
; Partition 1: Linux Native (0x83), Active (0x80)
db 0x80, 0x01, 0x01, 0x00, 0x83, 0x0F, 0x10, 0x3F
dd 0x00000800, 0x00100000

; Partition 2, 3, 4: Empty
times 48 db 0

; MBR Boot Signature
dw 0xAA55
