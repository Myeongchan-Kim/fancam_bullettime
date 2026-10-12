import os
import sys
from sqlalchemy import text

# 프로젝트 루트를 sys.path에 추가
sys.path.append(os.path.join(os.getcwd(), "backend"))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.getcwd(), "backend", ".env"))

from app.db import SessionLocal

def enable_row_level_security():
    """
    Supabase public 스키마 내 모든 테이블에 Row-Level Security(RLS)를 활성화합니다.
    - PostgREST 공개 REST API (anon / authenticated)를 통한 무단 접근 차단
    - rolbypassrls=True 인 관리자 계정(postgres) 및 백엔드(FastAPI) 연결은 정상 유지
    """
    db = SessionLocal()
    try:
        print("🔒 [1/2] public 스키마 내 모든 테이블 목록 조회 중...", flush=True)
        tables_res = db.execute(text("""
            SELECT tablename, rowsecurity
            FROM pg_tables
            WHERE schemaname = 'public';
        """)).fetchall()

        if not tables_res:
            print("❌ public 스키마에 테이블이 존재하지 않습니다.", flush=True)
            return

        print(f"총 {len(tables_res)}개 테이블 발견:")
        for t, rls in tables_res:
            print(f" - {t:<30} (현재 RLS: {rls})")

        print("\n🔒 [2/2] Row-Level Security(RLS) 활성화 적용 시작...", flush=True)
        for t, rls in tables_res:
            if not rls:
                db.execute(text(f'ALTER TABLE "{t}" ENABLE ROW LEVEL SECURITY;'))
                print(f"  ✅ {t} -> RLS 활성화 완료")
            else:
                print(f"  ℹ️ {t} -> 이미 RLS 활성화 상태")

        db.commit()
        print("\n✨ 모든 변경 사항 DB 커밋 완료!", flush=True)

        # 최종 상태 재검증
        verify_res = db.execute(text("""
            SELECT tablename, rowsecurity
            FROM pg_tables
            WHERE schemaname = 'public'
            ORDER BY tablename;
        """)).fetchall()

        print("\n📊 최종 RLS 상태:")
        all_enabled = True
        for t, rls in verify_res:
            status_str = "ENABLED ✅" if rls else "DISABLED ❌"
            print(f" - {t:<30} : {status_str}")
            if not rls:
                all_enabled = False

        if all_enabled:
            print("\n🎉 모든 public 테이블에 Row-Level Security가 안전하게 활성화되었습니다.")
        else:
            print("\n⚠️ 일부 테이블에 RLS가 활성화되지 않았습니다. 로그를 확인하세요.")

    except Exception as e:
        db.rollback()
        print(f"❌ RLS 활성화 도중 에러 발생: {e}", flush=True)
        raise
    finally:
        db.close()

if __name__ == "__main__":
    enable_row_level_security()
