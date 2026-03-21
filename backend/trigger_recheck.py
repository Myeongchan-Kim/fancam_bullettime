import os
import sys
import time
import requests
from dotenv import load_dotenv

# Load environment variables
dotenv_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(dotenv_path)

API_BASE_URL = "http://localhost:8000/api/admin"
ADMIN_KEY = os.environ.get("ADMIN_SECRET_KEY", "admin_secret_123") # 기본값 fallback

HEADERS = {
    "x-admin-key": ADMIN_KEY
}

def start_job():
    try:
        response = requests.post(f"{API_BASE_URL}/recheck/start", headers=HEADERS)
        if response.status_code == 200:
            print("🚀 Recheck job started successfully!")
        elif response.status_code == 400:
            print("⚠️ Recheck job is already running.")
        elif response.status_code == 403:
            print("❌ Admin Access Denied. Check your ADMIN_SECRET_KEY.")
            sys.exit(1)
        else:
            print(f"❌ Failed to start job: {response.text}")
            sys.exit(1)
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to backend API. Is the server running on port 8000?")
        sys.exit(1)

def monitor_job():
    print("⏳ Monitoring job progress...\n")
    while True:
        try:
            res = requests.get(f"{API_BASE_URL}/recheck/status", headers=HEADERS)
            if res.status_code == 200:
                data = res.json()
                status = data.get("status")
                total = data.get("total_videos", 0)
                processed = data.get("processed_videos", 0)
                created = data.get("contributions_created", 0)
                error = data.get("error_message")
                
                # Terminal output overwriting
                print(f"\rStatus: [{status}] | Progress: {processed}/{total} | 'Other' Contributions Created: {created}", end="")
                
                if status == "Finished":
                    print("\n\n✅ Job completed successfully!")
                    break
                elif status == "Error":
                    print(f"\n\n❌ Job failed with error: {error}")
                    break
            else:
                print(f"\n❌ Error fetching status: {res.status_code}")
                break
        except Exception as e:
            print(f"\n❌ Error during monitoring: {e}")
            break
            
        time.sleep(2)

if __name__ == "__main__":
    print("--- TWICE World Tour 360° Fancam Archive ---")
    print("Starting manual recheck agent...\n")
    start_job()
    monitor_job()
