import os
from playwright.sync_api import sync_playwright

USER_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "user_data")

def init_browser_profile():
    print(f"User Data Directory: {USER_DATA_DIR}")
    print("브라우저가 열리면 'twice.once.fancam.maina@gmail.com' 계정으로 로그인해주세요.")
    print("로그인을 완료하고 엔터키를 누르면 프로필이 저장되고 종료됩니다.")
    
    with sync_playwright() as p:
        # Persistent Context를 사용하여 쿠키, 세션 등 모든 브라우저 데이터 유지
        context = p.chromium.launch_persistent_context(
            user_data_dir=USER_DATA_DIR,
            headless=False, # 로그인해야 하므로 화면 표시
            channel="chrome", # 실제 설치된 크롬 사용 권장 (봇 탐지 회피 목적)
            args=["--disable-blink-features=AutomationControlled"] # 자동화 탐지 완화
        )
        
        page = context.pages[0] if context.pages else context.new_page()
        page.goto("https://accounts.google.com/ServiceLogin?service=youtube&continue=https://www.youtube.com/signin?action_handle_signin=true")
        
        # 유저가 직접 로그인 과정을 수행하도록 대기
        input(">>> 로그인이 완료되고 유튜브 메인화면이 보이면 [Enter]를 누르세요...")
        
        print("프로필 세션 저장 완료.")
        context.close()

if __name__ == "__main__":
    init_browser_profile()
