"""
Whole Concert Arranger CLI Runner
---------------------------------
Executes the Top-Down Backbone-First Whole Concert Auto-Calibration pipeline
for a given concert ID.

Usage:
    uv run python scripts/run_whole_concert_arrange.py --concert-id 2 --dry-run
    uv run python scripts/run_whole_concert_arrange.py --concert-id 2 --commit
"""

import os
import sys
import argparse
import json
import logging

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.db import SessionLocal
from app.services.concert_arranger import arrange_whole_concert

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(description="Whole Concert Arranger Runner")
    parser.add_argument("--concert-id", type=int, default=2, help="Target concert ID (default: 2 for 0720 Incheon Day 2)")
    parser.add_argument("--commit", action="store_true", help="Commit changes to database (default: dry-run)")
    parser.add_argument("--deep-two-pass", action="store_true", help="Run full two-pass decomposition on medleys")
    parser.add_argument("--save-json", type=str, default="", help="Path to save full JSON results")
    args = parser.parse_args()

    dry_run = not args.commit

    db = SessionLocal()
    try:
        logger.info(f"Starting Whole Concert Arranger for Concert #{args.concert_id} (dry_run={dry_run}, deep_two_pass={args.deep_two_pass})...")
        res = arrange_whole_concert(db, concert_id=args.concert_id, dry_run=dry_run, deep_two_pass=args.deep_two_pass)
        print("\n" + "="*50)
        print("CONCERT ARRANGE RESULT:")
        print("="*50)
        print(f"Master Video ID: {res['stats']['master_video_id']}")
        print(f"Total Videos: {res['stats']['total_videos']}")
        print(f"Gate 1:1 Locked: {res['stats']['gate_1to1_locked']}")
        print(f"Gate Cuts Diverted: {res['stats']['gate_cuts_diverted']}")
        print(f"Macro Anchored: {res['stats']['macro_anchored_count']}")
        print(f"Unresolved: {res['stats']['unresolved_count']}")

        if args.save_json:
            with open(args.save_json, "w", encoding="utf-8") as f:
                json.dump(res, f, indent=2, ensure_ascii=False)
            logger.info(f"Full results saved to {args.save_json}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
