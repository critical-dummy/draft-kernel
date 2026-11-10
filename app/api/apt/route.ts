import { NextRequest, NextResponse } from 'next/server';

export interface RepoPackage {
  name: string;
  version: string;
  section: string;
  size: number;
  description: string;
  files: Record<string, string>; // path -> content
}

const PACKAGE_REPOSITORY: Record<string, RepoPackage> = {
  cowsay: {
    name: 'cowsay',
    version: '1.4-1',
    section: 'games',
    size: 18432,
    description: 'Configurable talking cow in ASCII art',
    files: {
      '/usr/bin/cowsay': '#!/usr/bin/perl - cowsay package binary executable',
      '/usr/share/cows/default.cow': '$the_cow = "\\n   ^__^\\n   (oo)\\\\_______\\n   (__)\\\\       )\\\\/\\\\\\n       ||----w |\\n       ||     ||";',
      '/usr/share/man/man1/cowsay.1': 'cowsay - configurable talking cow',
    },
  },
  neofetch: {
    name: 'neofetch',
    version: '7.1.0-2',
    section: 'utils',
    size: 124928,
    description: 'Fast, highly customizable system information tool written in POSIX sh',
    files: {
      '/usr/bin/neofetch': '#!/usr/bin/env bash - neofetch system info tool',
      '/etc/neofetch/config.conf': 'print_info() { info title; info os; info host; info kernel; }',
    },
  },
  tree: {
    name: 'tree',
    version: '2.1.0-1',
    section: 'utils',
    size: 53248,
    description: 'Displays an indented tree view of file hierarchies',
    files: {
      '/usr/bin/tree': 'ELF 64-bit LSB executable, x86-64 / arm64, dynamically linked',
      '/usr/share/man/man1/tree.1': 'tree - list contents of directories in a tree-like format',
    },
  },
  sl: {
    name: 'sl',
    version: '5.02-1',
    section: 'games',
    size: 32768,
    description: 'Correct you if you accidentally type sl instead of ls',
    files: {
      '/usr/bin/sl': 'ELF 64-bit LSB executable - Steam Locomotive simulator',
      '/usr/share/man/man1/sl.1': 'sl - cure your bad habit of mistyping',
    },
  },
  fortune: {
    name: 'fortune',
    version: '1.9.9-1',
    section: 'games',
    size: 42180,
    description: 'Print a random, hopefully interesting, adage or quote',
    files: {
      '/usr/bin/fortune': 'ELF 64-bit LSB executable, fortune-mod',
      '/usr/share/games/fortunes/literature': 'A computer lets you make more mistakes faster than any other invention.',
    },
  },
  figlet: {
    name: 'figlet',
    version: '2.2.5-3',
    section: 'text',
    size: 61440,
    description: 'Frank, Ian and Glenn\'s Letters - make large character banners',
    files: {
      '/usr/bin/figlet': 'ELF 64-bit LSB executable, banner generator',
      '/usr/share/figlet/standard.flf': 'flf2a$ 6 5 20 15 29 0 143 229',
    },
  },
  nano: {
    name: 'nano',
    version: '7.2-1',
    section: 'editors',
    size: 268400,
    description: 'Small, friendly text editor inspired by Pico',
    files: {
      '/usr/bin/nano': 'ELF 64-bit LSB executable, GNU nano 7.2',
      '/etc/nanorc': 'set nowrap\nset tabsize 4\n',
    },
  },
  curl: {
    name: 'curl',
    version: '8.0.1-1',
    section: 'web',
    size: 198656,
    description: 'Command line tool for transferring data with URL syntax',
    files: {
      '/usr/bin/curl': 'ELF 64-bit LSB executable, libcurl/8.0.1 OpenSSL/3.0.8',
    },
  },
  python3: {
    name: 'python3',
    version: '3.11.2-6',
    section: 'python',
    size: 5821000,
    description: 'Interactive high-level object-oriented language',
    files: {
      '/usr/bin/python3': 'ELF 64-bit LSB executable, Python 3.11.2',
    },
  },
  htop: {
    name: 'htop',
    version: '3.2.2-1',
    section: 'admin',
    size: 148900,
    description: 'Interactive process viewer and system monitor',
    files: {
      '/usr/bin/htop': 'ELF 64-bit LSB executable, ncurses process viewer',
    },
  },
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') || 'update';
  const pkgName = searchParams.get('package') || '';

  if (action === 'update' || action === 'list') {
    const packages = Object.values(PACKAGE_REPOSITORY).map((p) => ({
      name: p.name,
      version: p.version,
      section: p.section,
      size: p.size,
      description: p.description,
    }));

    return NextResponse.json({
      status: 'success',
      repo: 'https://repo.draftos.org/draftos-mac sonoma/main',
      timestamp: new Date().toISOString(),
      packages,
    });
  }

  if (action === 'install') {
    if (!pkgName) {
      return NextResponse.json({ status: 'error', message: 'Missing package parameter' }, { status: 400 });
    }

    const pkg = PACKAGE_REPOSITORY[pkgName.toLowerCase()];
    if (!pkg) {
      return NextResponse.json(
        {
          status: 'error',
          message: `E: Unable to locate package ${pkgName}`,
          available: Object.keys(PACKAGE_REPOSITORY),
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: 'success',
      package: pkg,
    });
  }

  return NextResponse.json({ status: 'error', message: `Unknown action '${action}'` }, { status: 400 });
}
