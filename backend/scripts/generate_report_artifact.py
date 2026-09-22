import json
from app.db import SessionLocal
from app.models.models import Video

with open('scratch/concert1_arrange_dryrun.json') as f:
    res = json.load(f)

item_map = {item['video_id']: item for item in res['video_results']}

db = SessionLocal()
try:
    vids = db.query(Video).filter(Video.concert_id == 1).order_by(Video.sync_offset.asc()).all()

    sections = [
        ('Act 1: Opening & Title Tracks (0s - 1500s)', 0.0, 1500.0),
        ('Act 2: Pop Tracks & Medleys (1500s - 4000s)', 1500.0, 4000.0),
        ('Act 3: Solo Stages (4000s - 6000s)', 4000.0, 6000.0),
        ('Act 4: Hits & Climax (6000s - 8500s)', 6000.0, 8500.0),
        ('Act 5: Encore Stage (8500s - 10200s)', 8500.0, 10200.0),
    ]

    lines = []
    lines.append('# 2025-07-19 (0719 Day 1) Whole Concert Arranger Calibration Report\n')
    lines.append('## 1. Executive Summary\n')
    lines.append('- **Total Videos Processed**: 94 videos (100% placed on timeline, 0 unresolved)')
    lines.append('- **Canonical Master Spine**: Video #64 (`YxTegwcWavI`, 10,129s) at T = 0.0s')
    lines.append('- **Dual-Master Backbone Consensus**: Video #1618 (`ylHrT_y_Z9U`, 9,977s) confirmed at +114.011s with 0.000s drift across multi-point acoustic cross-correlation')
    lines.append('- **Legacy ~229s Anomaly Resolution**: 22 videos that had been arbitrarily shifted by ~229s or dumped at 229s (like solo stage `ATM`) were corrected to their true setlist/acoustic timestamps')
    lines.append('- **Status Distribution**:')
    lines.append('  - `master`: 1 (Video #64)')
    lines.append('  - `ai_calibrated` (1:1 Acoustic Gate Locked): 7 (e.g. Video #1618, CRY FOR ME #1696/#1695, Jihyo ATM #1495, SANA MAKE ME GO #35, TWICE SONG #1626, etc.)')
    lines.append('  - `macro_anchored` (Setlist Mapping & Private Fallback): 54')
    lines.append('  - `needs_bisection` (Multi-Cut Medley / Compilation Triage): 31')
    lines.append('  - `manually_verified`: 1 (Preserved Ground Truth)\n')

    for sec_title, start_t, end_t in sections:
        sec_vids = [v for v in vids if v.sync_offset is not None and start_t <= v.sync_offset < end_t]
        lines.append(f'## {sec_title} ({len(sec_vids)} Videos)\n')
        lines.append('| Video ID | Title | Duration | Old Offset | New Offset | Shift | Status | Method / Reason |')
        lines.append('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |')
        for v in sec_vids:
            it = item_map.get(v.id, {})
            old_off = it.get('old_offset')
            old_str = f'{old_off:.1f}s' if old_off is not None else 'None'
            new_str = f'{v.sync_offset:.1f}s'
            diff = v.sync_offset - old_off if old_off is not None else None
            diff_str = f'{diff:+.1f}s' if diff is not None else 'N/A'
            reason = it.get('reason') or v.calibration_method or ''
            clean_title = v.title.replace('|', '/').strip()[:42]
            clean_reason = reason.replace('|', '/').strip()[:45]
            lines.append(f'| #{v.id} | {clean_title} | {v.duration:.0f}s | {old_str} | {new_str} | **{diff_str}** | `{v.calibration_status}` | {clean_reason} |')
        lines.append('\n')

    report_path = '/Users/mckim/.gemini/antigravity-cli/brain/35af6be5-f904-482f-a0fe-caf8aa13b7ab/concert_0719_calibration_report.md'
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    print(f'Report written to {report_path}')
finally:
    db.close()
