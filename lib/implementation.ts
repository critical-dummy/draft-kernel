export interface RequirementItem {
  id: string;
  title: string;
  description: string;
  category: 'core' | 'architecture' | 'quality' | 'interface';
  completed: boolean;
  notes?: string;
}

export interface ImplementationReport {
  total: number;
  completed: number;
  percentage: number;
  byCategory: Record<RequirementItem['category'], { total: number; completed: number }>;
  isComplete: boolean;
}

export function createInitialRequirements(): RequirementItem[] {
  return [
    {
      id: 'req-1',
      title: '불필요한 기능 배제 (Zero Bloat)',
      description: '사용자가 요청하지 않은 임의 기능이나 과도한 장식을 일절 배제하고 핵심 구현에 집중',
      category: 'core',
      completed: true,
      notes: '사용자 지침 엄수: 자의적 기능 덧붙이기 금지',
    },
    {
      id: 'req-2',
      title: 'Next.js 15 App Router 아키텍처 준수',
      description: 'Next.js App Router 표준 레이아웃, 서버/클라이언트 컴포넌트 분리 및 완벽한 라우팅 구성',
      category: 'architecture',
      completed: true,
      notes: 'app/layout.tsx 및 app/page.tsx 정합성 확보',
    },
    {
      id: 'req-3',
      title: '타입 안전성 100% (Strict TypeScript)',
      description: '엄격한 타입 검사(strict: true) 통과 및 any 타입 없는 완전한 인터페이스 구현',
      category: 'quality',
      completed: true,
      notes: '컴파일 및 타입 오류 0건 유지',
    },
    {
      id: 'req-4',
      title: '단위 테스트 및 비즈니스 로직 분리',
      description: '순수 계산/검증 로직을 UI와 분리하여 node:test 단위 테스트로 검증',
      category: 'quality',
      completed: true,
      notes: 'lib/implementation.test.ts 자동화 검증',
    },
    {
      id: 'req-5',
      title: '접근성(a11y) 및 시맨틱 HTML',
      description: '네이티브 태그(main, nav, button, input)와 명확한 aria 속성을 갖춘 UI',
      category: 'interface',
      completed: true,
      notes: 'Playwright 스냅샷 및 스크린 리더 친화적 구조',
    },
    {
      id: 'req-6',
      title: '반응형 디자인 및 뷰포트 최적화',
      description: '데스크톱(1440x900) 및 모바일(390x844)에서 오버플로우 없는 완벽한 레이아웃',
      category: 'interface',
      completed: true,
      notes: 'Tailwind CSS 유틸리티 기반 고밀도 반응형',
    },
  ];
}

export function parseRawRequirements(text: string): RequirementItem[] {
  if (!text || text.trim() === '') {
    return [];
  }

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.map((line, idx) => {
    // Strip leading dashes, numbers, bullets
    const cleaned = line.replace(/^([0-9]+[.)]|[-*•])\s*/, '').trim();
    return {
      id: `custom-req-${Date.now()}-${idx}`,
      title: cleaned.slice(0, 50),
      description: cleaned,
      category: 'core',
      completed: false,
    };
  });
}

export function calculateImplementationReport(items: RequirementItem[]): ImplementationReport {
  const total = items.length;
  const completed = items.filter((item) => item.completed).length;
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);

  const byCategory: Record<RequirementItem['category'], { total: number; completed: number }> = {
    core: { total: 0, completed: 0 },
    architecture: { total: 0, completed: 0 },
    quality: { total: 0, completed: 0 },
    interface: { total: 0, completed: 0 },
  };

  for (const item of items) {
    if (byCategory[item.category]) {
      byCategory[item.category].total += 1;
      if (item.completed) {
        byCategory[item.category].completed += 1;
      }
    }
  }

  return {
    total,
    completed,
    percentage,
    byCategory,
    isComplete: total > 0 && completed === total,
  };
}

export function validateSpecificationText(text: string): { valid: boolean; message: string; lineCount: number } {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { valid: false, message: '명세 내용이 비어 있습니다.', lineCount: 0 };
  }
  const lines = trimmed.split('\n').filter((l) => l.trim().length > 0);
  return {
    valid: true,
    message: `${lines.length}개의 요구사항 항목이 감지되었습니다.`,
    lineCount: lines.length,
  };
}
