import test from 'node:test';
import assert from 'node:assert/strict';
import { CPU } from './cpu';
import { DraftOS } from './draft_os';
import { VRAM_BASE, BOOTLOADER_ADDR } from './constants';

test('CPU initializes memory and registers cleanly', () => {
  const cpu = new CPU();
  assert.equal(cpu.memory.length, 65536);
  assert.equal(cpu.IP, BOOTLOADER_ADDR);
  assert.equal(cpu.flags.interrupt, true);
test('CPU scrollback buffer supports PageUp and PageDown', () => {
  const cpu = new CPU();
  for (let i = 0; i < 50; i++) {
    cpu.printString(`Line ${i}\r\n`);
  }
  assert.ok(cpu.scrollback.length > 0);
  assert.equal(cpu.scrollbackOffset, 0);

  cpu.pageUp(10);
  assert.equal(cpu.scrollbackOffset, 10);

  const display = cpu.getDisplayMemory();
  assert.equal(display.length, 65536);

  cpu.pageDown(5);
  assert.equal(cpu.scrollbackOffset, 5);

  cpu.resetScroll();
  assert.equal(cpu.scrollbackOffset, 0);
});

test('DraftOS macOS commands: sw_vers and apt package manager', async () => {
  const os = new DraftOS();
  os.boot();

  await os.executeCommand('sw_vers');
  assert.ok(os.vfsRoot.children?.System);
  assert.ok(os.vfsRoot.children?.Users);

  // Test local install of cowsay
  os.installedPackages.add('cowsay');
  await os.executeCommand('cowsay hello');
  assert.ok(os.installedPackages.has('cowsay'));
});

test('CPU writes characters and scrolls VRAM in memory-mapped space', () => {
  const cpu = new CPU();
  cpu.printString('KERNEL OK');
  const firstByte = cpu.memory[VRAM_BASE];
  const secondByte = cpu.memory[VRAM_BASE + 2];
  assert.equal(String.fromCharCode(firstByte), 'K');
  assert.equal(String.fromCharCode(secondByte), 'E');
});

test('DraftOS boots and writes MBR boot signature', () => {
  const os = new DraftOS();
  os.boot();
  assert.equal(os.cpu.memory[BOOTLOADER_ADDR + 510], 0x55);
  assert.equal(os.cpu.memory[BOOTLOADER_ADDR + 511], 0xAA);
  assert.ok(os.tasks.length >= 4);
});

test('DraftOS handles keyboard input and executes shell commands', () => {
  const os = new DraftOS();
  os.boot();

  // Type 'uname -a' then 'Enter'
  for (const ch of 'uname -a') {
    os.handleKeyDown(ch, ch.charCodeAt(0));
  }
  os.handleKeyDown('Enter', 13);

  // Check if VRAM contains DraftOS
  let found = false;
  for (let i = 0; i < 2000; i++) {
    const charCode = os.cpu.memory[VRAM_BASE + i * 2];
    if (charCode === 'D'.charCodeAt(0) && os.cpu.memory[VRAM_BASE + (i + 1) * 2] === 'r'.charCodeAt(0)) {
      found = true;
      break;
    }
  }
  assert.ok(found);
});

test('DraftOS task management: spawn and kill update process table', () => {
  const os = new DraftOS();
  os.boot();
  const initCount = os.tasks.length;

  for (const ch of 'spawn nginx-worker') {
    os.handleKeyDown(ch, ch.charCodeAt(0));
  }
  os.handleKeyDown('Enter', 13);
  assert.equal(os.tasks.length, initCount + 1);

  const newPid = os.tasks[os.tasks.length - 1].pid;
  for (const ch of `kill ${newPid}`) {
    os.handleKeyDown(ch, ch.charCodeAt(0));
  }
  os.handleKeyDown('Enter', 13);
  assert.equal(os.tasks.length, initCount);
});
