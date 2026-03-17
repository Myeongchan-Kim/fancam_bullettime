import os
import json
import time
from playwright.sync_api import sync_playwright
from ai_parser import parse_fancam_metadata

USER_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "user_data")

def run_recommendation_feed():
    if not os.path.exists(USER_DATA_DIR):
        print("경고: user_data 폴더가 없습니다. 로그인 프로필이 생성되지 않았습니다.")
        return

    print("Step 2: Recommendation Feed Crawler 시작...")
    
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=USER_DATA_DIR,
            headless=True, # 백그라운드 크론잡으로 매일 실행될 것을 가정
            channel="chrome",
            args=["--disable-blink-features=AutomationControlled"]
        )
        
        page = context.pages[0] if context.pages else context.new_page()
        page.goto("https://www.youtube.com/")
        
        # 메인 페이지 추천 동영상 렌더링 대기
        page.wait_for_selector("ytd-rich-grid-media", timeout=15000)
        time.sleep(3) # 추가적인 스크롤 및 로딩 대기
        
        # 홈 화면의 추천 동영상(최대 10개) 수집
        rich_items = page.locator("ytd-rich-grid-media").all()[:10]
        
        valid_fancams = []
        
        for idx, item in enumerate(rich_items):
            try:
                title_elem = item.locator("#video-title-link")
                title = title_elem.get_attribute("title")
                url = "https://www.youtube.com" + title_elem.get_attribute("href")
                
                channel_elem = item.locator("#text.ytd-channel-name")
                channel = channel_elem.first.inner_text()
                
                print(f"\n[추천 영상 {idx+1}] 제목: {title}")
                print(f"채널: {channel}")
                
                # AI 파싱 모듈 호출
                metadata = parse_fancam_metadata(title, channel)
                
                if metadata and metadata.get("is_valid_fancam") is True:
                    print("=> [발굴 성공!] 유효한 직캠입니다.")
                    print("추출된 메타데이터:", json.dumps(metadata, ensure_ascii=False))
                    # 여기에 추후 DB Insert 로직 추가
                    valid_fancams.append({"title": title, "url": url, "metadata": metadata})
                else:
                    print("=> [패스] 투어 직캠이 아니거나 일반 영상입니다.")
                    
            except Exception as e:
                print(f"[항목 파싱 에러] {e}")
                continue
                
        print(f"\nStep 2 크롤링 완료. 총 {len(valid_fancams)}개의 신규 직캠을 발굴했습니다.")
        context.close()

if __name__ == "__main__":
    run_recommendation_feed()
