# TWICE World Tour 360° Fancam Archive 🍭

[English](#english) | [한국어](#한국어)

---

<a name="english"></a>
## English

> **"What if we could stitch together the viewpoints of all those fans' smartphone cameras?"**

This project began with a simple spark of imagination while watching a TWICE concert. Looking at the sea of glowing smartphones in the crowd, we wondered: what if we could connect those thousands of individual perspectives into a single timeline? Our ultimate goal is to create a **360° Bullet Time** experience where you can seamlessly jump between different angles of the same performance, just like a scene from *The Matrix*.

### Our Vision 🎯
By aligning countless scattered fancams onto a single timeline, we are building a completely new way to experience live performances.
- **Seamless Multi-angle:** Switch instantly between different angles (front, side, rear, etc.) of the same moment with a single click.
- **Immersive Archiving:** Preserving TWICE’s world tour not just as flat videos, but as 3-dimensional data with a true sense of space.
- **Fan-Driven Project:** A platform where ONCEs from around the world contribute new videos and fine-tune synchronization together.

### The Reality 🚩
**To be honest, there are still quite a few gaps. 😅**
We are in the early stages where AI is busy scouring YouTube to collect videos and setlists. There are many legendary fancams we haven't found yet, and some sync timings might be slightly off. 

However, we believe that as these scattered pieces are brought together by the community, this will become an incredibly fun and unique archive. Please lend us your "collective intelligence" to help us achieve the perfect 360° view!

### What We're Building 🤖
- **AI-Powered Discovery:** Using Playwright and Gemini 2.0 AI to find and categorize hidden gems 24/7.
- **Smart Sync Pipeline:** Analyzing metadata and descriptions to automatically place videos on the master timeline.
- **Interactive Wiki:** A system where anyone can fine-tune offsets by 0.01s and pin stage locations on a map.

### How to Contribute 🤝
This archive is fueled by your participation.
- Submit new angles of a performance.
- Fine-tune sync offsets for existing videos.
- Suggest new features or report bugs.

#### ⏱️ Sync Guide (How to set Time Offset)
To achieve perfect "Bullet Time", all videos must be aligned to a single **Master Timeline**.
1. **Reference Point**: The Master Timeline starts (0:00) at the very beginning of the concert (usually the first VCR or the "This is for..." intro).
2. **sync_offset**: This value represents the number of seconds from the concert start to the beginning of the fancam.
   - *Example*: If a fancam starts exactly when the 10th minute (600s) of the concert begins, its `sync_offset` should be `600`.
3. **How to Adjust**:
   - If the fancam is **faster** than the master (shows action too early): **Increase** the `sync_offset`.
   - If the fancam is **slower** than the master (shows action too late): **Decrease** the `sync_offset`.

Every 0.01-second adjustment helps make the stage more immersive. Feel free to contribute!

---

<a name="한국어"></a>
## 한국어

> **"저 수많은 팬들의 핸드폰 카메라 시선들을 하나로 이어 붙이면 어떨까?"**

이 프로젝트는 어느 날 트와이스의 공연 영상을 보다가, 객석을 가득 채운 수많은 팬들의 핸드폰 불빛을 보며 떠올린 작은 상상에서 시작되었습니다. 수백, 수천 개의 서로 다른 위치에서 촬영된 직캠(Fancam)들을 하나의 시간 축으로 완벽하게 연결하여, 마치 영화 '매트릭스'의 **불릿 타임(Bullet Time)**처럼 무대를 360도 전 방위에서 자유롭게 넘나들며 감상하는 경험을 만드는 것이 우리의 궁극적인 목표입니다.

### Our Vision 🎯
흩어져 있는 수많은 직캠들을 하나의 타임라인으로 정렬하여, 기존에 없던 새로운 방식의 무대 감상 환경을 구축합니다.
- **끊김 없는 멀티앵글:** 멤버의 정면 직캠을 감상하다가, 클릭 한 번으로 같은 순간의 다른 각도(측면, 후면 등) 영상으로 즉시 전환할 수 있습니다.
- **입체적인 무대 아카이빙:** 트와이스의 투어 무대들을 단편적인 영상이 아닌, 공간감이 살아있는 입체적인 데이터로 보존합니다.
- **팬 참여형 프로젝트:** 전 세계 원스(ONCE)들이 직접 새로운 영상을 제보하고 미세한 싱크를 조절하며 함께 완성해 나가는 플랫폼입니다.

### The Reality 🚩
**솔직히 말씀드리면, 지금은 빈틈이 꽤 많습니다. 😅**
현재는 AI가 열심히 유튜브를 돌아다니며 영상과 셋리스트를 모으고 있는 초기 단계라, 아직 못 찾은 레전드 직캠도 많고 싱크가 어긋난 부분도 꽤 있습니다.

하지만 이 파편화된 조각들이 여러분의 손길로 하나둘 맞춰진다면, 정말 어디에도 없는 재미있는 무대 아카이브가 될 거라 확신합니다. 완벽한 360도 뷰를 위해 원스 여러분의 집단지성을 맘껏 발휘해 주세요!

### What We're Building 🤖
- **AI-Powered Discovery:** Playwright와 Gemini 2.0 AI를 통해 우리가 놓친 소중한 영상들을 24시간 내내 찾아내고 분류합니다.
- **Smart Sync Pipeline:** 파편화된 영상들의 메타데이터와 설명을 분석하여 마스터 타임라인에 자동으로 배치하는 실험을 진행 중입니다.
- **Interactive Wiki:** 누구나 0.01초 단위로 오프셋을 직접 수정하고 위치를 핀으로 찍어 아카이브의 완성도를 높일 수 있는 시스템을 구축했습니다.

### How to Contribute 🤝
이 아카이브는 여러분의 참여로 채워집니다. 
- 아직 등록되지 않은 새로운 각도의 영상 제보
- 어긋난 싱크 오프셋(sync_offset)의 정교한 수정
- 더 나은 사용자 경험을 위한 기능 제안

#### ⏱️ 싱크 가이드 (타임 오프셋 맞추는 법)
완벽한 '불릿 타임'을 위해 모든 영상은 하나의 **마스터 타임라인**에 정렬되어야 합니다.
1. **기준점**: 마스터 타임라인의 0초(0:00)는 콘서트의 완전한 시작 지점입니다 (보통 오프닝 VCR 혹은 "This is for..." 문구가 나오는 인트로 시점).
2. **싱크 오프셋(sync_offset)**: 해당 직캠이 콘서트 시작 후 **몇 초 뒤에 시작하는지**를 나타내는 값입니다.
   - *예시*: 어떤 직캠이 콘서트 시작 후 정확히 10분(600초) 뒤의 상황을 담고 있다면, 해당 영상의 오프셋은 `600`이 되어야 합니다.
3. **조정 방법**:
   - 직캠이 마스터 영상보다 **빠를 때** (화면이 먼저 나올 때): 오프셋 값을 **키웁니다**.
   - 직캠이 마스터 영상보다 **느릴 때** (화면이 나중에 나올 때): 오프셋 값을 **줄입니다**.

여러분의 0.01초 수정 하나하나가 모여 트와이스의 무대를 더 입체적으로 만듭니다. 가벼운 마음으로 제보해 주세요!

---

## Getting Started 🚀

### 1. Backend Setup
```bash
cd backend
# Recommended using 'uv' package manager
uv run python -m app.main
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### 3. Run Crawler
```bash
cd backend
# Step 2: Infinite Recommendation Crawler
uv run python -m app.crawler.step2_recommendation
```

## Architecture 🏗️
Please refer to [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed system design and data models.
