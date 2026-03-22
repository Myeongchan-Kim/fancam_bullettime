import os
import sys
from datetime import datetime

# Add the app directory to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.main import SessionLocal
from app.models.models import Concert

def sync_with_wikipedia():
    db = SessionLocal()
    
    try:
        print("Syncing Concert Data with Wikipedia...")

        # 1. Update Venue Names & Specific Info
        # Taipei: Arena -> Dome
        db.query(Concert).filter(Concert.city == "Taipei").update({"venue": "Taipei Dome"})
        
        # Turin: Pala Alpitour -> Inalpi Arena
        db.query(Concert).filter(Concert.city == "Turin").update({"venue": "Inalpi Arena"})
        
        # Phoenix: PHX Arena -> Mortgage Matchup Center
        db.query(Concert).filter(Concert.city == "Phoenix").update({"venue": "Mortgage Matchup Center"})
        
        # Osaka/Nagoya/Fukuoka: Add Full Names
        db.query(Concert).filter(Concert.city == "Osaka").update({"venue": "Kyocera Dome Osaka"})
        db.query(Concert).filter(Concert.city == "Nagoya").update({"venue": "Vantelin Dome Nagoya"})
        db.query(Concert).filter(Concert.city == "Fukuoka").update({"venue": "Mizuho PayPay Dome Fukuoka"})

        # 2. Add Missing Taipei Date (March 21)
        taipei_mar21 = datetime(2026, 3, 21)
        existing_t21 = db.query(Concert).filter(Concert.city == "Taipei", Concert.date == taipei_mar21).first()
        if not existing_t21:
            db.add(Concert(date=taipei_mar21, city="Taipei", country="Taiwan", venue="Taipei Dome"))
            print("Added: Taipei on 2026-03-21")

        # 3. Add Missing Tokyo Japan National Stadium Shows
        tokyo_shows = [
            {"date": "2026-04-25", "city": "Tokyo", "country": "Japan", "venue": "Japan National Stadium"},
            {"date": "2026-04-26", "city": "Tokyo", "country": "Japan", "venue": "Japan National Stadium"},
            {"date": "2026-04-28", "city": "Tokyo", "country": "Japan", "venue": "Japan National Stadium"},
        ]
        
        for t_data in tokyo_shows:
            t_date = datetime.strptime(t_data["date"], "%Y-%m-%d")
            existing = db.query(Concert).filter(Concert.city == "Tokyo", Concert.date == t_date).first()
            if not existing:
                db.add(Concert(date=t_date, city=t_data["city"], country=t_data["country"], venue=t_data["venue"]))
                print(f"Added: {t_data['city']} on {t_data['date']} at {t_data['venue']}")

        db.commit()
        print("Wikipedia Sync completed successfully!")
        
    except Exception as e:
        db.rollback()
        print(f"Sync failed: {str(e)}")
    finally:
        db.close()

if __name__ == "__main__":
    sync_with_wikipedia()