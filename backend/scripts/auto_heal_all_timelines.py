import os
import sys
import re
import statistics
from datetime import datetime

# 프로젝트 루트를 sys.path에 추가
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.db import SessionLocal
from app.models.models import Video, Concert, ConcertSetlist, Song, video_song_association

def auto_heal_all():
    db = SessionLocal()
    try:
        print("🚀 [Step 1] 전체 콘서트 셋리스트 수집 및 글로벌 마스터 타임라인 계산...")
        
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
                # 셋리스트가 아예 없는 경우 템플릿 복제
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
                # start_time이 None인 항목들 채우기
                for item in c_items:
                    if item.start_time is None:
                        if item.song_id and item.song_id in canonical_song_times:
                            item.start_time = canonical_song_times[item.song_id]
                        elif item.event_name and item.event_name.strip().lower() in canonical_event_times:
                            item.start_time = canonical_event_times[item.event_name.strip().lower()]

        db.commit()
        print(f"✅ {concerts_healed}개 콘서트에 셋리스트를 성공적으로 전파했습니다.")

        # 4. 미태그 비디오 곡 및 콘서트 자동 식별
        print("\n🚀 [Step 3] 곡 미태그 영상 텍스트 분석 및 곡 자동 연결...")
        all_songs = db.query(Song).all()
        
        # 곡 이름 매칭용 정규식 패턴 생성 (긴 이름 우선)
        sorted_songs = sorted(all_songs, key=lambda s: len(s.name), reverse=True)
        
        untagged_videos = db.query(Video).filter(~Video.songs.any()).all()
        tagged_count = 0

        for v in untagged_videos:
            title_lower = (v.title or "").lower()
            matched_songs = []
            
            for s in sorted_songs:
                s_name_clean = s.name.lower().replace("(rock ver.)", "").replace("(solo)", "").replace("(encore)", "").strip()
                if len(s_name_clean) < 3:
                    continue
                
                # 단어 경계 또는 특수문자 포함 매칭
                if s_name_clean in title_lower:
                    matched_songs.append(s)
                    break # 가장 먼저 매칭된 대표 곡 선택
            
            if matched_songs:
                v.songs = matched_songs
                v.song_id = matched_songs[0].id
                tagged_count += 1

        db.commit()
        print(f"✅ {tagged_count}개 영상에 곡 태그를 자동으로 식별하여 부여했습니다.")

        # 5. sync_offset == 0 인 모든 직캠 영상 일괄 타임라인 매핑
        print("\n🚀 [Step 4] sync_offset = 0 영상 일괄 마스터 타임라인 자동 치유...", flush=True)
        
        # 메모리 상에 (concert_id, song_id) -> start_time 맵 구성하여 N+1 쿼리 제거
        all_setlists_fresh = db.query(ConcertSetlist).filter(ConcertSetlist.start_time.isnot(None), ConcertSetlist.start_time > 0).all()
        setlist_lookup = {}
        for item in all_setlists_fresh:
            if item.concert_id and item.song_id:
                key = (item.concert_id, item.song_id)
                if key not in setlist_lookup or item.start_time < setlist_lookup[key]:
                    setlist_lookup[key] = float(item.start_time)

        from sqlalchemy.orm import joinedload
        zero_offset_videos = db.query(Video).options(joinedload(Video.songs)).filter(
            Video.sync_offset == 0,
            Video.angle != 'Full-Concert',
            ~Video.title.like('%Full Concert%')
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
            
            # (2) 글로벌 마스터 타임라인에서 찾기 (Fallback)
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
