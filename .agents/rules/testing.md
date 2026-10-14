---
name: bugfix_tdd_policy
title: Bugfix Test-First (Red-Green) Policy
activation: Always On
---

# 🧪 Bugfix Test-First (Red-Green) Policy

## 1. Fail-First Regression Test (Red -> Green)
- **버그를 수정할 때는 반드시 해당 버그를 재현하여 실패(Fail)하는 테스트를 먼저 작성한 뒤(Red), 프로덕션 코드를 수정하여 테스트를 통과(Green)시킨다.**
- 테스트 없이 프로덕션 코드만 먼저 수정하지 않는다. 코드베이스가 커질수록 회귀 버그(Regression)를 방지하기 위해 모든 버그 수정은 자동화된 회귀 테스트와 함께 커밋되어야 한다.

## 2. Verification Workflow
1. **Reproduce (Red)**: 버그 조건을 재현하는 단위/통합 테스트를 추가하고, 수정 전 상태에서 실제로 실패하는지 실행하여 확인한다.
2. **Fix (Green)**: 최소한의 명확한 코드 변경으로 버그를 해결하고 방금 작성한 테스트가 통과하는지 확인한다.
3. **Full Suite Check**: 백엔드(`source .venv/bin/activate && pytest`) 및 프론트엔드(`npm test -- --run`) 전체 테스트 스위트를 실행해 기존 기능에 부작용이 없는지 검증한다.
