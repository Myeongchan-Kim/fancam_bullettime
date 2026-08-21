import sys
import os

# 프로젝트 루트를 sys.path에 추가
sys.path.append(os.path.join(os.getcwd(), "backend"))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.getcwd(), "backend", ".env"))

from app.db import SessionLocal
from app.models.models import Contribution
from app.api.v1.utils import internal_approve_contribution

def approve_all_pending_contributions():
    db = SessionLocal()
    try:
        print("🚀 미처리 기여(Contributions) 일괄 승인 및 싱크 반영 시작...", flush=True)
        
        pending_contributions = db.query(Contribution).filter(Contribution.is_processed == False).all()
        total_pending = len(pending_contributions)
        print(f"🔍 보류 중인 기여: {total_pending}개 발견", flush=True)

        if total_pending == 0:
            print("✅ 처리할 기여가 없습니다.", flush=True)
            return

        success_count = 0
        skipped_count = 0

        for idx, contrib in enumerate(pending_contributions, start=1):
            try:
                # internal_approve_contribution를 사용하여 DB 직접 반영 및 상태 업데이트
                internal_approve_contribution(db, contrib.id)
                success_count += 1
                if idx % 20 == 0 or idx == total_pending:
                    db.commit() # 주기적인 부분 커밋으로 안전성 보장
                    print(f"⏳ 진행 상황: {idx}/{total_pending}개 처리 완료...", flush=True)
            except Exception as e:
                db.rollback()
                print(f"❌ 기여 ID {contrib.id} 처리 중 에러 발생 (건너뜀): {e}", flush=True)
                skipped_count += 1

        db.commit()
        print(f"\n✨ 일괄 승인 작업 완료!", flush=True)
        print(f"📊 총 {success_count}개 기여 승인 완료 (에러 스킵: {skipped_count}개)", flush=True)

        # 승인 완료 후 다시 한번 오프셋 0인 비디오들에 대해 최종 마스터 싱크 보정 구동
        print("\n🚀 승인 완료된 영상들 대상 타임라인 자동 치유 실행...", flush=True)
        from scripts.auto_heal_all_timelines import auto_heal_all
        auto_heal_all()

    except Exception as e:
        print(f"❌ 예외 발생: {e}", flush=True)
    finally:
        db.close()

if __name__ == "__main__":
    approve_all_pending_contributions()
