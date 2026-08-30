import os
import sys
import re
import statistics
from datetime import datetime

# 프로젝트 루트를 sys.path에 추가
sys.path.append(os.path.join(os.getcwd(), "backend"))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.getcwd(), "backend", ".env"))

from app.db import SessionLocal
from app.models.models import Video, Concert, ConcertSetlist, Song, video_song_association
from sqlalchemy.orm import joinedload

# 특수 솔로 무대 및 앵콜 곡 기본 오프셋 매핑
CANONICAL_DEFAULTS = {
    'FIREWORK (Solo)': 3932.0,
    'CONFETTI (Solo)': 3291.0,
    'ABCD (Solo)': 3423.0,
    'Killin\' Me Good (Solo)': 3832.0,
    'RUN AWAY (Solo)': 3170.0,
    'POP! (Solo)': 3423.0,
    '7 Rings (Solo)': 3291.0,
    'My Guitar (Solo)': 3680.0,
    'Can\'t Stop The Feeling! (Solo)': 3547.0,
    'Try (Solo)': 2820.0,
    'Money (Solo)': 3832.0,
    'DIVE IN (Solo)': 3170.0,
    'STONE COLD (Solo)': 3291.0,
    'MEEEEEE (Solo)': 3423.0,
    'FIX A DRINK (Solo)': 3547.0,
    'SHOOT (Firecracker)': 3680.0,
    'ATM (Solo)': 3832.0,
    'DECAFFEINATED (Solo)': 3932.0,
    'MOVE LIKE THAT (Solo)': 4060.0,
    'Cheer Up (Encore)': 6100.0,
    'CHILLAX (Encore)': 6150.0,
    'TT (Encore)': 6200.0,
    'Be as ONE (Encore)': 6250.0,
    'LIKEY (Encore)': 6250.0,
    'Jelly Jelly (Encore)': 6300.0,
    'Knock Knock (Encore)': 6300.0,
    'Signal (Encore)': 6350.0,
    'Heart Shaker (Encore)': 6400.0,
    'GOT THE THRILLS (Encore)': 6450.0,
    'I\'m gonna be a star (Encore)': 7709.0,
    'Ending': 7709.0,
}

def auto_heal_all():
    db = SessionLocal()
    try:
        print("🚀 [Step 1] 전체 콘서트 셋리스트 수집 및 글로벌 마스터 타임라인 계산...")
        
        # 0. 필수 솔로/앵콜 곡 DB 생성 보장
        for sname, def_time in CANONICAL_DEFAULTS.items():
            if sname != 'Ending':
                existing = db.query(Song).filter(Song.name == sname).first()
                if not existing:
                    db.add(Song(name=sname))
        db.commit()

        # 1. 모든 셋리스트 항목에서 곡별 시작 시간들을 모아 평균/중앙값 계산
        all_setlists = db.query(ConcertSetlist).filter(ConcertSetlist.start_time.isnot(None)).all()
        song_times_map = {} # song_id -> list of start_times
        event_times_map = {} # event_name -> list of start_times

        for item in all_setlists:
            if item.song_id:
                song_times_map.setdefault(item.song_id, []).append(float(item.start_time))
            elif item.event_name:
                event_times_map.setdefault(item.event_name.strip().lower(), []).append(float(item.start_time))

        canonical_song_times = {s_id: statistics.median(times) for s_id, times in song_times_map.items() if times}
        canonical_event_times = {ev: statistics.median(times) for ev, times in event_times_map.items() if times}

        # 기본값 주입
        all_db_songs = db.query(Song).all()
        for s in all_db_songs:
            if s.name in CANONICAL_DEFAULTS and s.id not in canonical_song_times:
                canonical_song_times[s.id] = CANONICAL_DEFAULTS[s.name]

        print(f"📊 총 {len(canonical_song_times)}개 곡의 글로벌 마스터 기준 시작 시간을 도출했습니다.")

        from sqlalchemy import func
        richest_concert = db.query(Concert).join(ConcertSetlist).group_by(Concert.id).order_by(func.count(ConcertSetlist.id).desc()).first()
        
        template_items = []
        if richest_concert:
            template_items = db.query(ConcertSetlist).filter(ConcertSetlist.concert_id == richest_concert.id).order_by(ConcertSetlist.display_order).all()
            print(f"📋 복제 템플릿 기준 콘서트: {richest_concert.city} ({richest_concert.date}) - 총 {len(template_items)}개 항목")

        # 3. 셋리스트가 비어있거나 부족한 콘서트들에 셋리스트 복제 및 null start_time 보정
        print("\n🚀 [Step 2] 셋리스트 미등록/결측 콘서트 자동 보정 및 전파...")
        all_concerts = db.query(Concert).all()
        concerts_healed = 0

        for concert in all_concerts:
            c_items = db.query(ConcertSetlist).filter(ConcertSetlist.concert_id == concert.id).all()
            if len(c_items) == 0 and template_items:
                for item in template_items:
                    default_time = canonical_song_times.get(item.song_id, item.start_time)
                    db.add(ConcertSetlist(
                        concert_id=concert.id,
                        song_id=item.song_id,
                        event_name=item.event_name,
                        start_time=default_time,
                        display_order=item.display_order
                    ))
                concerts_healed += 1
            else:
                for item in c_items:
                    if item.start_time is None:
                        if item.song_id and item.song_id in canonical_song_times:
                            item.start_time = canonical_song_times[item.song_id]
                        elif item.event_name and item.event_name.strip().lower() in canonical_event_times:
                            item.start_time = canonical_event_times[item.event_name.strip().lower()]

        db.commit()
        print(f"✅ {concerts_healed}개 콘서트에 셋리스트를 성공적으로 전파했습니다.")

        # 4. 영상 텍스트 정밀 분석 및 곡 자동 식별 (투어명 THIS IS FOR 분리 & 솔로/앵콜 특화)
        print("\n🚀 [Step 3] 영상 텍스트 정밀 분석 및 곡 자동 연결...", flush=True)
        all_songs = db.query(Song).all()
        
        # 'THIS IS FOR' (투어명과 중복되는 곡)는 가장 마지막에 후순위로 평가
        def song_priority(s):
            if s.name == 'THIS IS FOR':
                return 0
            return len(s.name)

        sorted_songs = sorted(all_songs, key=song_priority, reverse=True)
        
        # 정규식 패턴 사전 컴파일 (초고속 실행)
        compiled_song_patterns = []
        for s in sorted_songs:
            if s.name == 'THIS IS FOR':
                continue
            s_name_clean = s.name.lower().replace("(rock ver.)", "").replace("(solo)", "").replace("(encore)", "").strip()
            if len(s_name_clean) < 2:
                continue
            pattern = re.compile(r'\b' + re.escape(s_name_clean) + r'\b', re.IGNORECASE)
            compiled_song_patterns.append((s, pattern))

        this_is_for_song = next((s for s in all_songs if s.name == 'THIS IS FOR'), None)
        other_kw_pattern = re.compile(r'\b(fancy|strategy|firework|confetti|abcd|killin|run away|pop|yes or yes|feel special|cheer up|dance the night away|one spark|set me free|make me go|mars|options|likey|tt|knock knock|heart shaker|signal|got the thrill)\b', re.IGNORECASE)
        this_is_for_pattern = re.compile(r'\bthis is for\b', re.IGNORECASE)

        # 멤버별 솔로 무대 키워드 맵 (제목에 곡명 없이 멤버 솔로만 적힌 경우 대응)
        member_solo_map = {
            'mina solo': next((s for s in all_songs if s.name == 'STONE COLD (Solo)' or s.name == 'CONFETTI (Solo)'), None),
            'sana solo': next((s for s in all_songs if s.name == 'DECAFFEINATED (Solo)' or s.name == 'FIREWORK (Solo)'), None),
            'momo solo': next((s for s in all_songs if s.name == 'MOVE LIKE THAT (Solo)'), None),
            'jihyo solo': next((s for s in all_songs if s.name == 'ATM (Solo)' or s.name == "Killin' Me Good (Solo)"), None),
            'nayeon solo': next((s for s in all_songs if s.name == 'MEEEEEE (Solo)' or s.name == 'ABCD (Solo)'), None),
            'tzuyu solo': next((s for s in all_songs if s.name == 'DIVE IN (Solo)' or s.name == 'RUN AWAY (Solo)'), None),
            'chaeyoung solo': next((s for s in all_songs if s.name == 'SHOOT (Firecracker)'), None),
            'jeongyeon solo': next((s for s in all_songs if s.name == 'FIX A DRINK (Solo)'), None),
        }

        # 대상: 곡이 없거나, 오프셋이 0이거나, 단독 'THIS IS FOR'로만 태그된 풀콘서트 제외 영상들
        candidate_videos = db.query(Video).options(joinedload(Video.songs)).filter(
            Video.angle != 'Full-Concert',
            ~Video.title.ilike('%full concert%'),
            ~Video.title.ilike('%full ver%')
        ).all()

        target_videos = []
        for v in candidate_videos:
            curr_names = [s.name for s in v.songs]
            # 이미 THIS IS FOR가 아닌 정상 곡이 매칭되어 있고 오프셋이 정상인 경우 제외
            if len(curr_names) >= 1 and curr_names[0] != 'THIS IS FOR' and v.sync_offset > 0:
                continue
            target_videos.append(v)

        print(f"🔍 정밀 분석 대상 영상: {len(target_videos)}개", flush=True)

        tagged_count = 0

        for v in target_videos:
            title_raw = v.title or ""
            # 문자열 정규화: 특수 따옴표 및 변형어 처리
            title_norm = title_raw.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
            title_norm = re.sub(r'\bkilling\b', "killin'", title_norm, flags=re.IGNORECASE)
            
            curr_ids = [s.id for s in v.songs]
            
            matched_songs = []
            for s, pattern in compiled_song_patterns:
                if pattern.search(title_norm):
                    matched_songs.append(s)
                    break

            # 멤버 솔로 키워드 매칭
            if not matched_songs:
                for kw, solo_song in member_solo_map.items():
                    if solo_song and kw in title_norm.lower():
                        matched_songs.append(solo_song)
                        break

            # 구체적 곡이 없고 순수하게 'THIS IS FOR'만 있는 경우
            if not matched_songs and this_is_for_song and this_is_for_pattern.search(title_norm):
                if not other_kw_pattern.search(title_norm):
                    matched_songs.append(this_is_for_song)

            new_ids = [s.id for s in matched_songs]
            if matched_songs and (curr_ids != new_ids or v.sync_offset == 0):
                v.songs = matched_songs
                v.song_id = matched_songs[0].id
                tagged_count += 1
                if tagged_count % 50 == 0:
                    db.commit()
                    print(f"⏳ 태깅 진행: {tagged_count}개 반영 완료...", flush=True)

        db.commit()
        print(f"✅ 총 {tagged_count}개 영상의 곡 태그를 정밀 분석하여 업데이트했습니다.", flush=True)

        # 5. sync_offset == 0 인 모든 직캠 영상 일괄 타임라인 매핑
        print("\n🚀 [Step 4] sync_offset = 0 영상 일괄 마스터 타임라인 자동 치유...", flush=True)
        
        all_setlists_fresh = db.query(ConcertSetlist).filter(ConcertSetlist.start_time.isnot(None), ConcertSetlist.start_time > 0).all()
        setlist_lookup = {}
        for item in all_setlists_fresh:
            if item.concert_id and item.song_id:
                key = (item.concert_id, item.song_id)
                if key not in setlist_lookup or item.start_time < setlist_lookup[key]:
                    setlist_lookup[key] = float(item.start_time)

        zero_offset_videos = db.query(Video).options(joinedload(Video.songs)).filter(
            Video.sync_offset == 0,
            Video.angle != 'Full-Concert',
            ~Video.title.ilike('%full concert%'),
            ~Video.title.ilike('%full ver%')
        ).all()

        offset_updated_count = 0
        skipped_count = 0

        for video in zero_offset_videos:
            target_start_time = None
            
            # (1) 콘서트 셋리스트에서 찾기
            if video.concert_id and video.songs:
                for s in video.songs:
                    key = (video.concert_id, s.id)
                    if key in setlist_lookup:
                        sl_time = setlist_lookup[key]
                        if target_start_time is None or sl_time < target_start_time:
                            target_start_time = sl_time
            
            # (2) 글로벌 마스터 타임라인 또는 캐노니컬 기본값에서 찾기 (Fallback)
            if target_start_time is None and video.songs:
                for s in video.songs:
                    if s.id in canonical_song_times:
                        m_time = canonical_song_times[s.id]
                        if target_start_time is None or m_time < target_start_time:
                            target_start_time = float(m_time)

            if target_start_time is not None and target_start_time > 0:
                video.sync_offset = target_start_time
                offset_updated_count += 1
            else:
                skipped_count += 1

        db.commit()
        print(f"\n🎉 [성공] 총 {offset_updated_count}개 영상의 sync_offset을 마스터 타임라인으로 자동 치유 완료! (스킵: {skipped_count}개)", flush=True)

    except Exception as e:
        db.rollback()
        print(f"❌ 오류 발생: {e}", flush=True)
    finally:
        db.close()

if __name__ == "__main__":
    auto_heal_all()

