import pytest
import sys
import os
from collections import defaultdict

# Add backend to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.db import SessionLocal
from app.models.models import Video, Concert, Song

def is_overlapping(start_a, dur_a, start_b, dur_b, padding=30.0):
    """Interval graph overlap math used by Pairwise Calibrator and MultiAnglePlayer."""
    end_a = start_a + dur_a
    end_b = start_b + dur_b
    return not (end_a < start_b - padding or start_a > end_b + padding)

def compute_relative_seek(anchor_current_time, anchor_offset, target_offset):
    """Computes where target video B should seek when anchor video A is playing."""
    concert_time = anchor_current_time + anchor_offset
    expected_target_time = concert_time - target_offset
    return max(0.0, expected_target_time)

def test_interval_graph_overlap_logic():
    """Test standard overlap cases, boundary cases, and far apart non-overlapping cases."""
    # Video A: [100s ~ 300s] (dur 200s)
    # Video B: [250s ~ 450s] (dur 200s) -> Overlaps
    assert is_overlapping(100.0, 200.0, 250.0, 200.0) is True

    # Video C: [340s ~ 500s] -> With 30s padding (end_a + 30 = 330s vs start_c = 340s), should NOT overlap
    assert is_overlapping(100.0, 200.0, 340.0, 160.0, padding=30.0) is False

    # Video D: [320s ~ 500s] -> Within 30s padding (end_a + 30 = 330s >= start_d = 320s), should overlap
    assert is_overlapping(100.0, 200.0, 320.0, 180.0, padding=30.0) is True

def test_isolated_single_node_filtering():
    """Test that isolated single nodes (fancams with no overlaps) are separated from connected clusters."""
    videos = [
        {'id': 1, 'start': 0.0, 'dur': 180.0},
        {'id': 2, 'start': 100.0, 'dur': 180.0},
        {'id': 3, 'start': 6000.0, 'dur': 200.0}, # Isolated single node
    ]

    adj = defaultdict(set)
    for i in range(len(videos)):
        for j in range(i + 1, len(videos)):
            a, b = videos[i], videos[j]
            if is_overlapping(a['start'], a['dur'], b['start'], b['dur'], padding=10.0):
                adj[a['id']].add(b['id'])
                adj[b['id']].add(a['id'])

    # Find components
    visited = set()
    components = []
    for item in videos:
        vid = item['id']
        if vid not in visited:
            comp = []
            q = [vid]
            visited.add(vid)
            while q:
                curr = q.pop(0)
                comp.append(curr)
                for neighbor in adj[curr]:
                    if neighbor not in visited:
                        visited.add(neighbor)
                        q.append(neighbor)
            components.append(comp)

    multi_node_comps = [c for c in components if len(c) > 1]
    single_node_comps = [c for c in components if len(c) == 1]

    assert len(multi_node_comps) == 1
    assert set(multi_node_comps[0]) == {1, 2}
    assert len(single_node_comps) == 1
    assert single_node_comps[0] == [3]

def test_pairwise_relative_delta_calculation():
    """Test fine-tuning nudges, float precision, and relative seek calculations."""
    anchor_offset = 6250.0
    target_offset = 6250.0

    # Nudge +0.05s
    nudge_step = 0.05
    new_target_offset = round(target_offset + nudge_step, 2)
    assert new_target_offset == 6250.05

    # Anchor is at 10.0s into the video
    # Concert time = 10.0 + 6250.0 = 6260.0s
    # Target (with offset 6250.05s) should be at 6260.0 - 6250.05 = 9.95s
    target_seek = compute_relative_seek(10.0, anchor_offset, new_target_offset)
    assert round(target_seek, 2) == 9.95

def test_seoul_finale_be_as_one_pairwise_cluster():
    """Verify live database integrity for the Seoul Day 3 'Be as ONE' cluster (1753, 1468, etc.)."""
    db = SessionLocal()
    try:
        sana_1753 = db.query(Video).filter(Video.id == 1753).first()
        mina_1468 = db.query(Video).filter(Video.id == 1468).first()

        assert sana_1753 is not None, "Sana 1753 fancam missing"
        assert mina_1468 is not None, "Mina 1468 fancam missing"
        assert sana_1753.concert_id == 82, "Sana 1753 must belong to Seoul Day 3 (Concert 82)"
        assert mina_1468.concert_id == 82, "Mina 1468 must belong to Seoul Day 3 (Concert 82)"

        # Both must overlap within Be as ONE time window (6250s)
        dur_1753 = sana_1753.duration if (sana_1753.duration and sana_1753.duration > 0) else 218.0
        dur_1468 = mina_1468.duration if (mina_1468.duration and mina_1468.duration > 0) else 225.0

        assert is_overlapping(sana_1753.sync_offset, dur_1753, mina_1468.sync_offset, dur_1468) is True
    finally:
        db.close()

def test_incheon_do_it_again_pairwise_cluster():
    """Verify live database integrity for the Incheon Day 2 'Do It Again' cluster (1741, 1729)."""
    db = SessionLocal()
    try:
        nayeon_1741 = db.query(Video).filter(Video.id == 1741).first()
        mina_1729 = db.query(Video).filter(Video.id == 1729).first()

        assert nayeon_1741 is not None, "Nayeon 1741 fancam missing"
        assert mina_1729 is not None, "Mina 1729 fancam missing"
        assert nayeon_1741.concert_id == 2, "Nayeon 1741 must belong to Incheon Day 2 (Concert 2)"
        assert mina_1729.concert_id == 2, "Mina 1729 must belong to Incheon Day 2 (Concert 2)"

        dur_1741 = nayeon_1741.duration if (nayeon_1741.duration and nayeon_1741.duration > 0) else 222.0
        dur_1729 = mina_1729.duration if (mina_1729.duration and mina_1729.duration > 0) else 213.0

        assert is_overlapping(nayeon_1741.sync_offset, dur_1741, mina_1729.sync_offset, dur_1729) is True
    finally:
        db.close()

def test_smart_filtering_separates_full_concerts_from_fancams():
    """Verify that full concerts (>600s or keyword) are separated so single fancams prioritize matching same-song clips."""
    videos = [
        {'id': 1489, 'title': 'TWICE Full Concert Seoul Finale', 'duration': 8389.0, 'sync_offset': 0.0},
        {'id': 1753, 'title': 'SANA Be as ONE Fancam', 'duration': 218.0, 'sync_offset': 6250.0},
        {'id': 1468, 'title': 'MINA Be as ONE Fancam', 'duration': 225.0, 'sync_offset': 6250.0},
    ]

    anchor = videos[1] # Sana
    fancams = []
    full_concerts = []

    for v in videos:
        if v['id'] == anchor['id']:
            continue
        if v['duration'] > 600 or 'full concert' in v['title'].lower():
            full_concerts.append(v)
        else:
            fancams.append(v)

    # Sana should pair with Mina fancam first, NOT the full concert
    assert len(fancams) == 1
    assert fancams[0]['id'] == 1468
    assert len(full_concerts) == 1
    assert full_concerts[0]['id'] == 1489
