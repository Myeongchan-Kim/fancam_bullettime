---
name: concert-fancam-sync-pipeline
description: >-
  Use this skill when performing batch synchronization of fancams for a concert,
  calibrating multi-angle timelines against a master concert video, running iterative
  vision clustering, split cut detection, P2P peer audio sync, or resolving sync drifts.
---

# 🎬 Concert Fancam Multi-Modal Precision Sync Pipeline

콘서트 전체 직캠 인벤토리를 마스터 풀캠 영상(예: Incheon Day 2 #1094)의 타임라인과 일치시키는 **선제적 분할(Split-First) 기반의 6단계(Pass 0~5) 점진적(Iterative) 동기화 파이프라인**입니다.

---

## 📐 파이프라인 아키텍처 개요

```text
[Pass 0: 불변 참값 고정]
       │
       ▼
[Pass 1: 선제적 연속성 검사 & Split 분할] ──(다곡/메들리 분할)──┐
       │                                                      │
       ▼                                                      ▼
[Pass 2: 시각(Vision) 의상/무대 기반 군집 배치] <──────────── 단일 조각들로 정제
       │
       ▼
[Pass 3: 군집 내 P2P 초고속 동기화 (오디오 파동 전파)]
       │
       ▼
[Pass 4: 잔여 조각 마스터 ±10초 안전 락온 (가드레일 적용)]
       │
       ▼
[Pass 5: 타임라인 정렬 & 부모-자식 트리 캐스케이드 커밋]
```

---

## 🛠️ 세부 실행 절차 (Pass 0 ~ Pass 5)

### 📌 Pass 0. 불변 참값 고정 (Zero Phase)
- **목적**: 사용자가 직접 검증하거나 수동 확정한 참값 보존.
- **규칙**:
  - `calibration_status == "manually_verified"` 또는 `calibration_method == "manual_studio"`인 영상(예: #1714 `-11.73s`)은 **덮어쓰기 금지(Freeze)**.
  - 마스터 풀캠 영상(`Video.duration >= 7200s`, e.g. #1094)의 셋리스트 챕터 시작점을 Ground Truth 타임라인 축으로 로드.

### 📌 Pass 1. 선제적 연속성 검사 & Split 분할 (Split-First)
- **목적**: 2~3곡이 섞여 있는 메들리/다곡 영상을 사전 분할하여, 단일 곡 군집 매칭 시 발생하는 연산 낭비와 오류 원천 차단.
- **대상**:
  - `duration >= 180s` (3분 이상) 이거나 제목/설명란에 복수 곡명이 포함된 영상.
- **프로빙 방식**:
  - 영상의 **시작(t = 5.0s)**과 **종료 직전(t = duration - 10.0s)** 2개 포인트만 가벼운 오디오 지문 추출.
  - $\Delta(\text{End Offset} - \text{Start Offset}) \le 2.0s$ $\rightarrow$ **단일 직캠**으로 통과.
  - $\Delta > 2.0s$ $\rightarrow$ 중간 컷/다곡 전환 감지! 즉시 `app.crawler.recursive_segment_calibrator`를 호출하여 `VideoSyncSegment` 분할 레코드 생성.
- **결과**: 모든 영상이 **1조각 = 1곡/1무대**의 원자적(Atomic) 순수 조각으로 정제됨.

### 📌 Pass 2. 시각(Vision) 의상/무대 기반 군집 배치 (Clustering)
- **목적**: 투어 타이틀로 잘못 매핑된 직캠을 실제 무대 시간대로 재배치.
- **도구**: `app.crawler.visual_classifier.classify_fancam_visually`
- **프로빙 방식**:
  - 조각의 대표 프레임(썸네일 또는 중간 프레임) 추출.
  - DB `songs.stage_outfit`(액트별 의상), `songs.visual_notes`(무대 연출)와 대조.
  - 판별된 `identified_song` 및 셋리스트 앵커 시간대 슬롯(Clustering Slot)에 배속.

### 📌 Pass 3. 군집 내 P2P 초고속 동기화 (P2P Wave)
- **목적**: 3시간 마스터 영상을 풀 다운로드하지 않고, 동일 군집 내 기검증 앵커와 5초 만에 고속 동기화.
- **도구**: `scripts.precision_sync_calibrator.calibrate_video_peer_anchor`
- **동작**:
  - 군집 내 이미 락온된 직캠(Peer Anchor)과 대상 직캠의 10초 오디오 슬라이스 상호상관(Cross-Correlation).
  - 점수 $Score \ge 0.15$ 시 상대 오프셋 도출:
    $$\text{offset}_{\text{target}} = \text{offset}_{\text{peer}} + \text{peer\_matched\_sec} - \text{probe\_local\_t}$$
  - `parent_video_id` 및 `relative_offset` 기록 후 앵커 멤버로 승격.

### 📌 Pass 4. 잔여 조각 마스터 ±10초 안전 락온 (Fine Audio Lock)
- **목적**: 독무, 솔로 이동, 관객 소음 등으로 P2P가 실패한 소수 고립 조각 락온.
- **도구**: `scripts.precision_sync_calibrator.calibrate_video_3point`
- **핵심 가드레일 (Safety Rule)**:
  > **[철칙]** 1단계/셋리스트 기준점 대비 **반드시 $\pm 10$초 이내(`search_radius <= 10.0`)에서만 오디오 피크를 탐색**한다.
  > 인트로 BGM, 무가사 구간, 함성으로 인해 엉뚱한 먼 시간대로 튀는 현상을 100% 방지.

### 📌 Pass 5. 타임라인 정렬 & 부모-자식 트리 캐스케이드 커밋
- **도구**: `app.services.calibration.record_video_calibration`, `cascade_update_children_offsets`
- **동작**:
  - 앵커 노드가 미세 조정될 경우 트리 하위 자식 노드들에게 델타($\Delta$) 전파.
  - 모든 조각의 `sync_offset`, `calibration_status = 'ai_calibrated'`, `calibration_method` 확정.
  - 타임라인 시각화(`TimelineLanesCanvas`)에서 라운딩 없는 칼각 바 형태로 즉시 렌더링 검증.

---

## ⚡ 빠른 실행 가이드 (CLI Helpers)

가상환경 활성화 상태에서 실행:

```bash
# 1. 특정 콘서트(예: 0720 Incheon concert_id=2) 배치 파이프라인 드라이런
source .venv/bin/activate && python3 -m scripts.precision_sync_calibrator --concert-id 2 --dry-run

# 2. 특정 단일 영상 AI 정밀싱크 수동 트리거 (API 엔드포인트)
curl -X POST "http://localhost:8000/api/v1/videos/{video_id}/ai-sync" -H "Authorization: Bearer ADMIN_TOKEN"
```
