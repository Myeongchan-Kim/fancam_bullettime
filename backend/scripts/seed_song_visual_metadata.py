import sys
import os
import logging
from dotenv import load_dotenv

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from app.db import SessionLocal
from app.models.models import Song

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

SONG_METADATA_MAP = {
    # --- ACT 1: Opening & Intense EDM / Fierce Warrior ---
    "FOUR (Intro)": {
        "act": "Act 1 (Opening)",
        "stage_outfit": "블랙 레더 & 메탈릭 실버/골드 전사 아머 룩, 하이 부츠",
        "visual_notes": "웅장한 VCR 오프닝 영상 직후, 메인 무대 리프트 상승, 다크 조명 및 불꽃 특수효과",
        "description": "콘서트 오프닝 인트로"
    },
    "THIS IS FOR": {
        "act": "Act 1 (Opening)",
        "stage_outfit": "블랙/메탈릭 또는 올화이트 깃털/프린지 오프닝 전사 의상",
        "visual_notes": "9인 전원 메인 무대 일렬 대형, 다이내믹 레이저 및 불꽃 연출",
        "description": "6th 월드투어 타이틀곡 & 메인 오프닝 퍼포먼스"
    },
    "Strategy": {
        "act": "Act 1 (Opening)",
        "stage_outfit": "Act 1 블랙 레더/메탈릭 또는 락시크 룩",
        "visual_notes": "빠른 템포 안무, 전광판 Strategy 타이포그래피 그래픽",
        "description": "Act 1 타이틀 연계 댄스 트랙"
    },
    "MAKE ME GO": {
        "act": "Act 1 (Opening)",
        "stage_outfit": "Act 1 블랙 레더/메탈릭 아머 룩",
        "visual_notes": "무대 뒤 프롬프터 'SONG #3 MAKE ME GO' 표시, 그루비한 안무 대형",
        "description": "Act 1 세 번째 그루브 댄스 트랙"
    },
    "SET ME FREE": {
        "act": "Act 1 (Opening)",
        "stage_outfit": "화이트 & 네이비 아머 또는 블랙 메탈릭 전사 룩",
        "visual_notes": "오프닝 강렬한 킥 안무, 레이저 빔 및 불꽃 기둥 연출",
        "description": "Act 1 메인 타이틀 트랙"
    },
    "I CAN'T STOP ME": {
        "act": "Act 1 (Opening)",
        "stage_outfit": "Act 1 블랙/메탈릭 전사 의상",
        "visual_notes": "나연 센터 인트로, 시그니처 레트로 신스웨이브 안무",
        "description": "Act 1 레트로 신스팝 메인 히트곡"
    },
    "OPTIONS": {
        "act": "Act 1 (Opening)",
        "stage_outfit": "Act 1 블랙/메탈릭 또는 테크웨어 룩",
        "visual_notes": "강렬한 비트, 멤버들의 힙한 제스처 및 군무",
        "description": "Act 1 댄스 수록곡"
    },
    "MOONLIGHT SUNRISE": {
        "act": "Act 1 (Opening)",
        "stage_outfit": "Act 1 메탈릭 실버 & 블랙 룩",
        "visual_notes": "푸른 달빛 배경 그래픽, 매혹적인 보컬 & 유려한 페어 안무",
        "description": "글로벌 영어 싱글 퍼포먼스"
    },
    "MARS": {
        "act": "Act 1 (Opening)",
        "stage_outfit": "Act 1 전사 의상",
        "visual_notes": "붉은 행성 비주얼 배경, 몽환적인 신스 사운드",
        "description": "Act 1 수록곡"
    },

    # --- ACT 2: Solo Stages (멤버별 독창적 의상/악기/소품) ---
    "MEEEEEE": {
        "act": "Act 2 (Solo)",
        "stage_outfit": "나연: 데님 & 핑크/화이트 팝 아이돌 스트리트 룩",
        "visual_notes": "핸드마이크, 밝고 에너지 넘치는 나연 단독 퍼포먼스",
        "description": "나연 솔로 무대"
    },
    "POP!": {
        "act": "Act 2 (Solo)",
        "stage_outfit": "나연: 비비드 컬러/레드 점프수트 또는 키치 팝 의상",
        "visual_notes": "화려한 손동작 팝 안무, 댄서들과의 경쾌한 군무",
        "description": "나연 솔로 데뷔곡"
    },
    "FIX A DRINK": {
        "act": "Act 2 (Solo)",
        "stage_outfit": "정연: 레트로 그런지 수트 또는 컬러풀 팝 앙상블",
        "visual_notes": "스탠딩 마이크 또는 리코더/플루트 악기 연주 퍼포먼스",
        "description": "정연 솔로 무대"
    },
    "Juice": {
        "act": "Act 2 (Solo)",
        "stage_outfit": "정연: 레트로 그린/블루 펑키 수트",
        "visual_notes": "리코더 연주 솔로 인트로, 위트 넘치는 댄서들과의 브로드웨이 풍 쇼",
        "description": "정연 솔로 커버/퍼포먼스"
    },
    "MOVE LIKE THAT": {
        "act": "Act 2 (Solo)",
        "stage_outfit": "모모: 레드 & 블랙 댄스 기어, 크롭탑 & 와이드 팬츠",
        "visual_notes": "강렬한 파워 댄스, 댄스 브레이크 독무 및 폴/리프트 안무",
        "description": "모모 솔로 댄스 스테이지"
    },
    "MOVE": {
        "act": "Act 2 (Solo)",
        "stage_outfit": "모모: 버건디/블랙 관능적 댄스웨어",
        "visual_notes": "폴 댄스(봉) 인트로, 절도 있고 매혹적인 솔로 안무",
        "description": "모모 솔로 댄스 퍼포먼스"
    },
    "DECAFFEINATED": {
        "act": "Act 2 (Solo)",
        "stage_outfit": "사나: 메탈릭 실버 슬립 드레스 또는 브라운 코르셋 앙상블",
        "visual_notes": "슬릭한 포니테일, 매혹적인 솔로 보컬 & 시크한 런웨이 워킹",
        "description": "사나 솔로 무대"
    },
    "New Rules": {
        "act": "Act 2 (Solo)",
        "stage_outfit": "사나: 실버 메탈릭 드레스 & 롱부츠",
        "visual_notes": "돌출 무대 런웨이, 도발적이고 세련된 팝 안무",
        "description": "사나 솔로 퍼포먼스"
    },
    "RIGHT HAND GIRL": {
        "act": "Act 2 (Solo)",
        "stage_outfit": "사나: 브라운 코르셋 & 깃털/프릴 디테일 솔로 룩",
        "visual_notes": "사나 단독 댄스 및 감각적인 보컬 제스처",
        "description": "사나 솔로 수록곡 무대"
    },
    "ATM": {
        "act": "Act 2 (Solo)",
        "stage_outfit": "지효: 록스타 레드 레더 자켓 & 블랙 팬츠",
        "visual_notes": "일렉트릭 기타/스탠드 마이크, 폭발적인 락 보컬 샤우팅",
        "description": "지효 솔로 락 스테이지"
    },
    "Nightmare": {
        "act": "Act 2 (Solo)",
        "stage_outfit": "지효: 레드 벨벳 롱드레스 / 락커 가죽 룩",
        "visual_notes": "어두운 붉은 조명, 마이크 스탠드를 활용한 파워풀한 고음",
        "description": "지효 자작 솔로곡"
    },
    "Killin' Me Good": {
        "act": "Act 2 (Solo)",
        "stage_outfit": "지효: 스포티 힙합 크롭탑 & 블랙 팬츠",
        "visual_notes": "파워풀한 리듬 댄스, 댄서들과의 강렬한 텐션",
        "description": "지효 솔로 타이틀곡"
    },
    "STONE COLD": {
        "act": "Act 2 (Solo)",
        "stage_outfit": "미나: 블랙 레이스 시스루 드레스 또는 페도라 룩",
        "visual_notes": "우아한 발레 턴, 감각적인 조명과 페도라 소품 활용",
        "description": "미나 솔로 무대"
    },
    "7 rings": {
        "act": "Act 2 (Solo)",
        "stage_outfit": "미나: 관능적인 올블랙 레이스 & 페도라 모자",
        "visual_notes": "돌출 무대 의자 댄스, 페도라를 활용한 유려한 팝 댄스",
        "description": "미나 솔로 댄스 커버"
    },
    "CHESS": {
        "act": "Act 2 (Solo)",
        "stage_outfit": "다현: 우아한 화이트 실크 드레스 & 업스타일 헤어",
        "visual_notes": "그랜드 피아노 독주 인트로 직후 감미로운 솔로 보컬",
        "description": "다현 솔로 피아노 & 보컬 무대"
    },
    "Try": {
        "act": "Act 2 (Solo)",
        "stage_outfit": "다현: 순백의 롱 드레스",
        "visual_notes": "화이트 그랜드 피아노 라이브 연주, 감성적인 피아노 발라드",
        "description": "다현 솔로 피아노 무대"
    },
    "IN MY ROOM": {
        "act": "Act 2 (Solo)",
        "stage_outfit": "채영: 캐주얼 락시크 룩, 빈티지 티셔츠 & 체크 팬츠",
        "visual_notes": "어쿠스틱 기타 라이브 연주, 아늑한 룸 세트 연출",
        "description": "채영 솔로 자작곡 무대"
    },
    "SHOOT (Firecracker)": {
        "act": "Act 2 (Solo)",
        "stage_outfit": "채영: 힙합 그런지 룩, 카고 팬츠 & 비니/헤어밴드",
        "visual_notes": "빠른 랩 딜리버리, 다이내믹한 핸드제스처와 레이저 연출",
        "description": "채영 솔로 랩 퍼포먼스"
    },
    "My Guitar": {
        "act": "Act 2 (Solo)",
        "stage_outfit": "채영: 빈티지 어쿠스틱 룩",
        "visual_notes": "통기타 단독 연주 및 감성적인 자작곡 보컬",
        "description": "채영 솔로 자작곡"
    },
    "DIVE IN": {
        "act": "Act 2 (Solo)",
        "stage_outfit": "쯔위: 블루/블랙 시폰 드레스 또는 슬릿 롱드레스",
        "visual_notes": "푸른 파도 비주얼 이펙트, 우아한 실루엣 댄스",
        "description": "쯔위 솔로 무대"
    },
    "Run Away": {
        "act": "Act 2 (Solo)",
        "stage_outfit": "쯔위: 우아한 실버/블랙 미니드레스 & 하이힐",
        "visual_notes": "쯔위 솔로 데뷔곡, 매혹적인 신스팝 보컬과 댄서 페어링",
        "description": "쯔위 솔로 데뷔 타이틀곡"
    },
    "Done for Me": {
        "act": "Act 2 (Solo)",
        "stage_outfit": "쯔위: 블랙 벨벳 슬리브리스 드레스",
        "visual_notes": "의자(Chair) 소품을 활용한 우아하고 절제된 솔로 댄스",
        "description": "쯔위 솔로 커버 무대"
    },

    # --- ACT 3: Grand Hits & Elegant Formal ---
    "FEEL SPECIAL": {
        "act": "Act 3 (Hits)",
        "stage_outfit": "화려한 파스텔 실크 가운, 화이트/골드 칵테일 드레스",
        "visual_notes": "황금빛 LED 궁전 배경, 채영 랩 파트 시 멤버들이 길을 터주는 대형",
        "description": "TWICE 대표 힐링 앤섬 & Act 3 메인 트랙"
    },
    "CRY FOR ME": {
        "act": "Act 3 (Hits)",
        "stage_outfit": "고혹적인 레드 또는 블랙 & 화이트 정장 드레스",
        "visual_notes": "드라마틱한 안무, 멤버들의 애절한 표정 연기 및 엔딩 장미 연출",
        "description": "다크 이모셔널 퍼포먼스"
    },
    "FANCY": {
        "act": "Act 3 (Hits)",
        "stage_outfit": "Act 3 화이트/파스텔 정장 또는 그런지 락 페스티벌 룩",
        "visual_notes": "9명 전원 손잡고 일렬로 서는 오프닝 대형, 시그니처 핑거 제스처 안무",
        "description": "대표 메가 히트곡"
    },
    "FANCY (Rock ver.)": {
        "act": "Act 3 (Hits)",
        "stage_outfit": "락 페스티벌 감성의 화이트/그런지 룩",
        "visual_notes": "라이브 밴드 사운드에 맞춰 헤드뱅잉 및 점프 유도",
        "description": "FANCY 락 버전 편곡"
    },
    "The Feels": {
        "act": "Act 3 (Hits)",
        "stage_outfit": "Act 3 세련된 화이트/핑크 앙상블",
        "visual_notes": "스탠딩 마이크 댄스, 'Boy I Boy I Boy I know' 손가락 안무",
        "description": "첫 영어 싱글 메가히트곡"
    },
    "I GOT YOU": {
        "act": "Act 3 (Hits)",
        "stage_outfit": "에테리얼 파스텔 쉬폰 드레스",
        "visual_notes": "하늘/구름 LED 배경, 멤버들이 서로를 감싸 안는 감성적인 대형",
        "description": "청량 감성 글로벌 싱글"
    },
    "What Is Love?": {
        "act": "Act 3 (Hits)",
        "stage_outfit": "화이트/네이비 스쿨룩 또는 페스티벌 메들리 룩",
        "visual_notes": "물음표(?) 손동작 안무, 멤버들의 하트 제스처",
        "description": "타이틀곡 메들리 핵심 트랙"
    },
    "CHEER UP": {
        "act": "Act 3 (Hits)",
        "stage_outfit": "Act 3 타이틀 메들리 또는 앵콜 룩",
        "visual_notes": "사나의 '샤샤샤' 킬링파트, 두 팔을 번쩍 드는 에너지 넘치는 안무",
        "description": "국민 히트곡 메들리"
    },
    "LIKEY": {
        "act": "Act 3 (Hits)",
        "stage_outfit": "Act 3 메들리 룩",
        "visual_notes": "모모 댄스 브레이크, 'L'자 손가락 카메라 포즈",
        "description": "대표 히트곡 메들리"
    },
    "YES or YES": {
        "act": "Act 3 (Hits)",
        "stage_outfit": "Act 3 메들리 룩",
        "visual_notes": "손가락 핑거스냅 및 주사위 던지기 안무",
        "description": "대표 타이틀곡 메들리"
    },

    # --- ACT 4: Encore, Casual & Fan Interaction ---
    "TALK": {
        "act": "Act 4 (Encore/Talk)",
        "stage_outfit": "투어 굿즈 티셔츠(블랙/화이트 'THIS IS FOR'), 후드티, 캔디봉",
        "visual_notes": "공연장 전체 객석 조명 온, 돌출 무대와 토롯코(이동차) 이동, 팬들과 인사",
        "description": "멤버별 멘트 및 소통 타임"
    },
    "Dance the Night Away": {
        "act": "Act 4 (Encore/Talk)",
        "stage_outfit": "투어 굿즈 티셔츠 & 캔디봉",
        "visual_notes": "신나는 락 편곡, 대규모 불꽃놀이 폭죽 및 컨페티(꽃가루) 피날레",
        "description": "콘서트 대미를 장식하는 신나는 서머 피날레"
    },
    "Dance the Night Away (Rock ver.)": {
        "act": "Act 4 (Encore/Talk)",
        "stage_outfit": "투어 굿즈 티셔츠 & 편안한 캐주얼 룩",
        "visual_notes": "객석 전체 점프 유도, 대형 불꽃놀이 폭죽 피날레",
        "description": "락 버전 앵콜 피날레"
    },
    "TT": {
        "act": "Act 4 (Encore/Talk)",
        "stage_outfit": "투어 티셔츠, 머리띠, 인형 소품",
        "visual_notes": "TT 눈물 손동작, 자유로운 돌출 무대 이동",
        "description": "룰렛 앵콜 곡"
    },
    "Heart Shaker": {
        "act": "Act 4 (Encore/Talk)",
        "stage_outfit": "투어 굿즈 티셔츠 & 슬로건 타월",
        "visual_notes": "앙증맞은 하트 댄스, 팬들과의 떼창",
        "description": "룰렛 앵콜 곡"
    }
}

def seed_songs():
    db = SessionLocal()
    try:
        updated_count = 0
        all_songs = db.query(Song).all()
        logger.info(f"🌱 총 {len(all_songs)}개 Song 데이터에 시각적 착장/무대 가이드를 시딩합니다...")

        for song in all_songs:
            # Match metadata
            meta = None
            for key, val in SONG_METADATA_MAP.items():
                if key.lower().replace(" ", "") == song.name.lower().replace(" ", ""):
                    meta = val
                    break
                elif key.lower() in song.name.lower() or song.name.lower() in key.lower():
                    meta = val
                    break

            if meta:
                song.act = meta.get("act")
                song.stage_outfit = meta.get("stage_outfit")
                song.visual_notes = meta.get("visual_notes")
                if not song.description:
                    song.description = meta.get("description")
                updated_count += 1
                logger.info(f"  ✨ [Update] '{song.name}' -> Act: {song.act} | Outfit: {song.stage_outfit[:30]}...")

        db.commit()
        logger.info(f"\n🎉 [완료] {updated_count}/{len(all_songs)}개 Song의 DB 시각 메타데이터 시딩 성공!")
    finally:
        db.close()

if __name__ == "__main__":
    seed_songs()
