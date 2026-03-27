import sys
import os
import asyncio
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from playwright.async_api import async_playwright

# 프로젝트 루트를 path에 추가
sys.path.append(os.path.join(os.getcwd(), "backend"))
from app.models.models import Video

DATABASE_URL = "sqlite:///twice_fancam.db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

async def fetch_description_web():
    print("🚀 Playwright 기반 마스터 영상 설명 수집 시작 (89개)...")
    
    target_videos = db.query(Video).filter(
        (Video.angle == 'Full-Concert') | (Video.title.like('%Full Concert%')),
        (Video.description == None) | (Video.description == "")
    ).limit(10).all() # Limit to 10 for quick testing
    
    if not target_videos:
        print("✅ 업데이트 대상이 없습니다.")
        return

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36")
        page = await context.new_page()
        
        for video in target_videos:
            url = f"https://www.youtube.com/watch?v={video.youtube_id}"
            print(f"🌐 Navigating to: {video.title[:30]}...")
            
            try:
                await page.goto(url, wait_until="networkidle", timeout=15000)
                # 'Show more' 버튼 클릭하여 전체 설명 펼치기 (유튜브 UI에 따라 다름)
                try:
                    await page.click("tp-yt-paper-button#expand", timeout=3000)
                except:
                    pass
                
                # 설명란 텍스트 추출
                desc_element = await page.wait_for_selector("div#description-inner", timeout=5000)
                if desc_element:
                    desc = await desc_element.inner_text()
                    video.description = desc
                    print(f"✅ Success! ({len(desc)} chars)")
                    db.commit()
                
                await asyncio.sleep(2) # 봇 감지 회피
            except Exception as e:
                print(f"❌ Failed: {e}")
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(fetch_description_web())
    db.close()
