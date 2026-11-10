import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialRequirements,
  parseRawRequirements,
  calculateImplementationReport,
  validateSpecificationText,
} from './implementation';

test('createInitialRequirements initializes standard verification requirements', () => {
  const reqs = createInitialRequirements();
  assert.equal(reqs.length, 6);
  assert.ok(reqs.every((r) => r.id && r.title && r.category));
  assert.equal(reqs[0].title, '불필요한 기능 배제 (Zero Bloat)');
});

test('calculateImplementationReport computes accurate percentages and categories', () => {
  const reqs = createInitialRequirements();
  const report = calculateImplementationReport(reqs);

  assert.equal(report.total, 6);
  assert.equal(report.completed, 6);
  assert.equal(report.percentage, 100);
  assert.equal(report.isComplete, true);
  assert.equal(report.byCategory.core.total, 1);
  assert.equal(report.byCategory.quality.total, 2);
});

test('calculateImplementationReport handles incomplete states correctly', () => {
  const items = [
    { id: '1', title: 'A', description: 'desc', category: 'core' as const, completed: true },
    { id: '2', title: 'B', description: 'desc', category: 'core' as const, completed: false },
  ];
  const report = calculateImplementationReport(items);
  assert.equal(report.total, 2);
  assert.equal(report.completed, 1);
  assert.equal(report.percentage, 50);
  assert.equal(report.isComplete, false);
});

test('parseRawRequirements converts multiline specifications into structured items', () => {
  const raw = `1. 사용자 로그인 기능 구현
2. 데이터 검증 로직 추가
- 반응형 모바일 최적화`;

  const parsed = parseRawRequirements(raw);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].title, '사용자 로그인 기능 구현');
  assert.equal(parsed[1].title, '데이터 검증 로직 추가');
  assert.equal(parsed[2].title, '반응형 모바일 최적화');
  assert.ok(parsed.every((p) => p.completed === false));
});

test('parseRawRequirements handles empty strings gracefully', () => {
  const parsed = parseRawRequirements('   \n  \n');
  assert.equal(parsed.length, 0);
});

test('validateSpecificationText checks non-empty inputs accurately', () => {
  const emptyRes = validateSpecificationText('   ');
  assert.equal(emptyRes.valid, false);

  const validRes = validateSpecificationText('항목 1\n항목 2');
  assert.equal(validRes.valid, true);
  assert.equal(validRes.lineCount, 2);
});
