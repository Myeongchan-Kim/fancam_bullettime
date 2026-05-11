import os
from sqlalchemy.orm import joinedload
from app.main import SessionLocal
from app.models.models import Video, Song, Concert

def find_candidates():
    db = SessionLocal()
    
    # Fetch videos excluding sync_offset == 0
    videos = db.query(Video).options(joinedload(Video.songs), joinedload(Video.concert)).filter(
        Video.sync_offset != 0,
        Video.sync_offset != None
    ).all()
    
    full_concert_keywords = ['full concert', 'full show', 'full live', 'full-concert', '풀캠', '풀버전', '전체']
    
    clusters = {}
    
    for v in videos:
        # Exclude full concerts
        t = v.title.lower()
        if any(kw in t for kw in full_concert_keywords) or v.duration > 3600:
            continue
            
        if not v.concert_id or not v.songs:
            continue
            
        # Group by concert and song
        for song in v.songs:
            key = (v.concert.city, v.concert.date, song.name, v.concert_id, song.id)
            if key not in clusters:
                clusters[key] = []
            
            # Avoid duplicate counting if same video is somehow added twice
            if v not in clusters[key]:
                clusters[key].append(v)

    # Sort clusters by number of videos
    sorted_clusters = sorted(clusters.items(), key=lambda x: len(x[1]), reverse=True)
    
    print("🌟 Top Multi-Angle Candidates 🌟")
    print("=" * 50)
    
    for (city, date, song_name, c_id, s_id), v_list in sorted_clusters[:10]:
        if len(v_list) < 2:
            break
            
        print(f"\n📍 {city} ({date.strftime('%Y-%m-%d')}) - 🎵 {song_name}")
        print(f"   Concert ID: {c_id} | Song ID: {s_id} | Total Angles: {len(v_list)}")
        
        # Show top 3 examples
        for v in v_list[:3]:
            print(f"   - [ID: {v.id}] {v.title[:50]}... (Offset: {v.sync_offset}s)")
        if len(v_list) > 3:
            print(f"   - ... and {len(v_list) - 3} more")

    db.close()

if __name__ == "__main__":
    find_candidates()
