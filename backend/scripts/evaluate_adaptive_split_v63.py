"""
Adaptive Multi-Anchor Split Pipeline Prototype & Evaluation for Video #63 vs #1094.
Tests:
1. Downstream setlist anchor recovery for escaping the 60s window trap
2. Adaptive binary search cut localization for sub-second boundary precision
3. Relaxed duration thresholds (15s) and deeper tree recursion
"""

import sys
import os
import time
import json
import numpy as np
import psycopg2
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from scripts.precision_sync_calibrator import download_audio_slice, cross_correlate

load_dotenv('.env')

YT_TARGET = 'ZBjTY0h1fuc' # Video #63 (8384s)
YT_MASTER = 'dxY6TEGf6fM' # Video #1094 (10998s)

def load_db_data():
    conn = psycopg2.connect(os.getenv('DATABASE_URL'))
    cur = conn.cursor()
    # Load GT
    cur.execute('''
        SELECT video_start_time, video_end_time, sync_offset, label
        FROM video_sync_segments
        WHERE video_id = 63
        ORDER BY video_start_time ASC;
    ''')
    gt_segs = cur.fetchall()
    
    # Load setlist
    cur.execute('''
        SELECT cs.id, cs.start_time, cs.event_name, s.name
        FROM concert_setlists cs
        LEFT JOIN songs s ON cs.song_id = s.id
        WHERE cs.concert_id = 2
        ORDER BY cs.start_time ASC;
    ''')
    setlist_rows = cur.fetchall()
    conn.close()
    
    setlists = []
    for r in setlist_rows:
        s_id, s_time, ev_name, s_name = r
        if s_time is not None:
            setlists.append({
                'id': s_id,
                'start_time': float(s_time),
                'name': s_name or ev_name
            })
    return gt_segs, setlists

def probe_local(t_tgt, est_off, win=60.0, dur=8.0):
    est_m = max(0.0, t_tgt + est_off)
    s_start = max(0.0, est_m - win / 2.0)
    tgt_w = download_audio_slice(YT_TARGET, t_tgt, dur, f'adap_{int(t_tgt)}_{int(dur)}')
    ref_w = download_audio_slice(YT_MASTER, s_start, win, f'adap_m_{int(s_start)}_{int(win)}')
    m_sec, conf = cross_correlate(tgt_w, ref_w, s_start)
    if conf < 0.10 or m_sec < 0:
        return {'success': False, 'offset': est_off, 'conf': conf, 'm_sec': m_sec}
    return {'success': True, 'offset': round(m_sec - t_tgt, 2), 'conf': round(conf, 3), 'm_sec': m_sec}

def recover_offset_via_setlist(t_tgt, min_master_t, setlists, max_probes=10):
    """
    Search downstream in Master using setlist start times as acoustic anchors.
    """
    tgt_w = download_audio_slice(YT_TARGET, t_tgt, 8.0, f'adap_rec_{int(t_tgt)}')
    candidate_setlists = [s for s in setlists if s['start_time'] >= min_master_t - 60.0]
    
    best_match = None
    best_conf = 0.0
    for s in candidate_setlists[:max_probes]:
        m_center = s['start_time'] + 30.0
        ref_w = download_audio_slice(YT_MASTER, max(0.0, m_center - 45.0), 90.0, f'adap_ref_s_{int(m_center)}')
        m_sec, conf = cross_correlate(tgt_w, ref_w, max(0.0, m_center - 45.0))
        if conf > best_conf:
            best_conf = conf
            best_match = {'success': True, 'offset': round(m_sec - t_tgt, 2), 'conf': round(conf, 3), 'name': s['name']}
        if conf >= 0.15: # Early exit on confident lock
            return best_match
            
    if best_conf >= 0.11:
        return best_match
    return {'success': False, 'offset': None, 'conf': best_conf}

def binary_search_cut(t_left, t_right, off_left, off_right, steps=5):
    """
    Narrow down the cut boundary between t_left and t_right to within ~1-2 seconds.
    """
    l = t_left
    r = t_right
    for _ in range(steps):
        mid = (l + r) / 2.0
        tgt_w = download_audio_slice(YT_TARGET, mid, 4.0, f'bsc_{int(mid*10)}')
        
        # Test left
        ml = max(0, mid + off_left)
        refl = download_audio_slice(YT_MASTER, max(0, ml - 10.0), 20.0, f'refl_{int(ml*10)}')
        _, conf_l = cross_correlate(tgt_w, refl, max(0, ml - 10.0))
        
        # Test right
        mr = max(0, mid + off_right)
        refr = download_audio_slice(YT_MASTER, max(0, mr - 10.0), 20.0, f'refr_{int(mr*10)}')
        _, conf_r = cross_correlate(tgt_w, refr, max(0, mr - 10.0))
        
        if conf_l >= conf_r:
            l = mid
        else:
            r = mid
    return round((l + r) / 2.0, 1)

def adaptive_segment_range(t_start, t_end, est_off, setlists, depth=0, max_depth=5):
    dur = t_end - t_start
    margin = min(8.0, dur * 0.1)
    p_start = t_start + margin
    p_end = max(p_start + 4.0, t_end - margin)
    
    if dur < 25.0 or depth >= max_depth:
        # Base case
        mid = (t_start + t_end) / 2.0
        res = probe_local(mid, est_off)
        final_off = res['offset'] if res['success'] else est_off
        return [{
            'start': t_start,
            'end': t_end,
            'offset': final_off,
            'conf': res.get('conf', 0.0),
            'depth': depth
        }]
        
    res_s = probe_local(p_start, est_off)
    res_e = probe_local(p_end, est_off)
    
    # Check if end probe lost sync
    if not res_e['success'] and res_s['success']:
        # End probe lost sync -> likely a jump cut occurred!
        # Try downstream recovery at p_end
        min_m = p_start + res_s['offset']
        recovered = recover_offset_via_setlist(p_end, min_m, setlists)
        if recovered['success']:
            res_e = recovered
            print(f"      [Recovery @ {p_end:.1f}s]: Found new offset {recovered['offset']:+.2f}s (conf={recovered['conf']}) via {recovered.get('name')}")

    if res_s['success'] and res_e['success']:
        drift = abs(res_e['offset'] - res_s['offset'])
        if drift <= 1.5:
            # Flat segment!
            avg_off = round((res_s['offset'] + res_e['offset']) / 2.0, 2)
            avg_conf = round((res_s['conf'] + res_e['conf']) / 2.0, 3)
            return [{
                'start': t_start,
                'end': t_end,
                'offset': avg_off,
                'conf': avg_conf,
                'depth': depth
            }]
        else:
            # Cut detected between p_start and p_end!
            # Use binary search to locate cut boundary
            cut_t = binary_search_cut(p_start, p_end, res_s['offset'], res_e['offset'])
            print(f"    ✂️ [Depth {depth}] Cut localized at {cut_t:.1f}s (drift: {drift:.2f}s, off: {res_s['offset']:+.2f} -> {res_e['offset']:+.2f})")
            
            left = adaptive_segment_range(t_start, cut_t, res_s['offset'], setlists, depth + 1, max_depth)
            right = adaptive_segment_range(cut_t, t_end, res_e['offset'], setlists, depth + 1, max_depth)
            return left + right

    # If only one probe succeeded or none, bisect cautiously
    mid_t = (t_start + t_end) / 2.0
    left_off = res_s['offset'] if res_s['success'] else est_off
    right_off = res_e['offset'] if res_e['success'] else est_off
    left = adaptive_segment_range(t_start, mid_t, left_off, setlists, depth + 1, max_depth)
    right = adaptive_segment_range(mid_t, t_end, right_off, setlists, depth + 1, max_depth)
    return left + right

if __name__ == '__main__':
    gt_segs, setlists = load_db_data()
    print(f"Loaded {len(gt_segs)} GT segments and {len(setlists)} setlist anchors.")
    
    # Test on the difficult interval [1090.0, 2180.0] where old algorithm failed 100%
    print("\n" + "="*80)
    print("RUNNING ADAPTIVE SPLIT ON [1090.0s ~ 2180.0s] (Talks, VCRs, Mina & Chaeyoung show)")
    print("="*80)
    
    t0 = time.time()
    results = adaptive_segment_range(1090.0, 2180.0, -3.54, setlists, depth=0, max_depth=5)
    cost = time.time() - t0
    
    print(f"\nCompleted in {cost:.2f}s! Produced {len(results)} segments:")
    for idx, r in enumerate(results):
        dur = r['end'] - r['start']
        print(f"[{idx+1:02d}] [{r['start']:6.1f}s ~ {r['end']:6.1f}s] ({dur:5.1f}s) | offset={r['offset']:+8.2f}s | conf={r['conf']:.3f} | depth={r['depth']}")
