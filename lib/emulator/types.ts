export type RegisterName = 'R0' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'PC' | 'SP' | 'BP';

export interface CPUFlags {
  zero: boolean;
  carry: boolean;
  sign: boolean;
  interrupt: boolean;
}

export interface CPURegisters {
  R0: number;
  R1: number;
  R2: number;
  R3: number;
  R4: number;
  R5: number;
  R6: number;
  R7: number;
  PC: number;
  SP: number;
  BP: number;
  flags: CPUFlags;
}

export interface Process {
  pid: number;
  ppid: number;
  name: string;
  state: 'RUNNING' | 'READY' | 'BLOCKED' | 'ZOMBIE';
  priority: number;
  cpuTicks: number;
  memoryKb: number;
}

export interface VFSNode {
  name: string;
  type: 'file' | 'dir';
  content?: string;
  size?: number;
  permissions?: string;
  children?: Record<string, VFSNode>;
}

export interface EmulatorStats {
  cycles: number;
  instructionsExecuted: number;
  uptimeSeconds: number;
  clockSpeedHz: number;
  halted: boolean;
  irqPending: number | null;
}
