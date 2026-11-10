import test from 'node:test';
import assert from 'node:assert/strict';
import { VirtualCPU, Opcode, BOOTLOADER_ADDR, KERNEL_ENTRY_ADDR } from './cpu';
import { DraftKernel } from './kernel';

test('VirtualCPU initializes with 64KB RAM and hardware vectors', () => {
  const cpu = new VirtualCPU();
  assert.equal(cpu.memory.length, 65536);
  assert.equal(cpu.registers.PC, BOOTLOADER_ADDR);
  assert.equal(cpu.memory[0x7DFE], 0x55);
  assert.equal(cpu.memory[0x7DFF], 0xAA);
});

test('VirtualCPU executes MOV, ADD, and updates flags', () => {
  const cpu = new VirtualCPU();
  // Assemble: MOV R1, 10; MOV R2, 25; ADD R1, R2; HLT
  let pc = 0x2000;
  cpu.registers.PC = pc;

  // MOV R1, 10
  cpu.memory[pc++] = Opcode.MOV_REG_IMM;
  cpu.memory[pc++] = 1; // R1
  cpu.memory[pc++] = 10;
  cpu.memory[pc++] = 0;

  // MOV R2, 25
  cpu.memory[pc++] = Opcode.MOV_REG_IMM;
  cpu.memory[pc++] = 2; // R2
  cpu.memory[pc++] = 25;
  cpu.memory[pc++] = 0;

  // ADD R1, R2
  cpu.memory[pc++] = Opcode.ADD;
  cpu.memory[pc++] = 1; // dst
  cpu.memory[pc++] = 2; // src

  // HLT
  cpu.memory[pc++] = Opcode.HLT;

  cpu.step(); // MOV R1
  assert.equal(cpu.registers.R1, 10);

  cpu.step(); // MOV R2
  assert.equal(cpu.registers.R2, 25);

  cpu.step(); // ADD
  assert.equal(cpu.registers.R1, 35);
  assert.equal(cpu.registers.flags.zero, false);

  cpu.step(); // HLT
  assert.equal(cpu.stats.halted, true);
});

test('VirtualCPU push and pop stack operates in LIFO order', () => {
  const cpu = new VirtualCPU();
  const initialSp = cpu.registers.SP;

  cpu.push(0x1234);
  assert.equal(cpu.registers.SP, initialSp - 2);

  cpu.push(0xABCD);
  assert.equal(cpu.registers.SP, initialSp - 4);

  const val1 = cpu.pop();
  assert.equal(val1, 0xABCD);

  const val2 = cpu.pop();
  assert.equal(val2, 0x1234);
  assert.equal(cpu.registers.SP, initialSp);
});

test('VirtualCPU VRAM text buffer handles character and newline output', () => {
  const cpu = new VirtualCPU();
  cpu.writeStringToVRAM('DRAFT');
  const lines = cpu.getVRAMText();
  assert.ok(lines[0].startsWith('DRAFT'));
});

test('DraftKernel boots and loads initial processes and VFS', () => {
  const kernel = new DraftKernel();
  kernel.boot();

  assert.equal(kernel.booted, true);
  assert.ok(kernel.processes.length >= 4);
  assert.equal(kernel.processes[0].name, 'swapper/idle');
  assert.equal(kernel.processes[1].name, 'init/draft-core');
  assert.ok(kernel.bootLogs.some((log) => log.includes('DRAFT KERNEL')));
});

test('DraftKernel shell processes uname, ps, ls, and memmap commands', () => {
  const kernel = new DraftKernel();
  kernel.boot();

  const unameOut = kernel.executeCommand('uname -a');
  assert.ok(unameOut[0].includes('DraftOS'));

  const psOut = kernel.executeCommand('ps');
  assert.ok(psOut.some((line) => line.includes('swapper/idle')));

  const lsOut = kernel.executeCommand('ls /bin');
  assert.ok(lsOut[0].includes('sh'));
  assert.ok(lsOut[0].includes('ps'));

  const memOut = kernel.executeCommand('memmap');
  assert.ok(memOut.some((line) => line.includes('0x7C00')));
});

test('DraftKernel process management: spawn and kill', () => {
  const kernel = new DraftKernel();
  kernel.boot();
  const initialCount = kernel.processes.length;

  const spawnOut = kernel.executeCommand('spawn user-app');
  assert.ok(spawnOut[0].includes('Process spawned'));
  assert.equal(kernel.processes.length, initialCount + 1);

  const newPid = kernel.processes[kernel.processes.length - 1].pid;
  const killOut = kernel.executeCommand(`kill ${newPid}`);
  assert.ok(killOut[0].includes('Terminated process'));
  assert.equal(kernel.processes.length, initialCount);
});
