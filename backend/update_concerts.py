import os
import sys
from datetime import datetime

# Add the app directory to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.main import SessionLocal
from app.models.models import Concert

def run_concert_migration():
    db = SessionLocal()
    
    # Missing or incomplete concerts from search vs DB comparison
    new_concerts = [
        {"date": "2026-01-22", "city": "Inglewood", "country": "USA", "venue": "Kia Forum"},
        {"date": "2026-01-24", "city": "Inglewood", "country": "USA", "venue": "Kia Forum"},
        {"date": "2026-01-28", "city": "Phoenix", "country": "USA", "venue": "PHX Arena"},
        {"date": "2026-01-31", "city": "Dallas", "country": "USA", "venue": "American Airlines Center"},
        {"date": "2026-02-01", "city": "Dallas", "country": "USA", "venue": "American Airlines Center"},
        {"date": "2026-02-13", "city": "Washington, D.C.", "country": "USA", "venue": "Capital One Arena"},
        {"date": "2026-02-14", "city": "Washington, D.C.", "country": "USA", "venue": "Capital One Arena"},
        {"date": "2026-02-20", "city": "Belmont Park", "country": "USA", "venue": "UBS Arena"},
        {"date": "2026-02-24", "city": "Philadelphia", "country": "USA", "venue": "Xfinity Mobile Arena"},
        {"date": "2026-02-27", "city": "Atlanta", "country": "USA", "venue": "State Farm Arena"},
        {"date": "2026-03-03", "city": "Montreal", "country": "Canada", "venue": "Bell Centre"},
        {"date": "2026-03-06", "city": "Hamilton", "country": "Canada", "venue": "TD Coliseum"},
        {"date": "2026-03-07", "city": "Hamilton", "country": "Canada", "venue": "TD Coliseum"},
    ]

    try:
        print("Starting Concert Data Migration...")
        
        for c_data in new_concerts:
            # Parse date string to datetime object
            c_date = datetime.strptime(c_data["date"], "%Y-%m-%d")
            
            # Check if this concert already exists (by date and city)
            existing = db.query(Concert).filter(
                Concert.city == c_data["city"],
                Concert.date >= c_date,
                Concert.date < c_date.replace(hour=23, minute=59)
            ).first()
            
            if existing:
                print(f"Skipping (Already Exists): {c_data['city']} on {c_data['date']}")
            else:
                new_c = Concert(
                    date=c_date,
                    city=c_data["city"],
                    country=c_data["country"],
                    venue=c_data["venue"]
                )
                db.add(new_c)
                print(f"Added: {c_data['city']} on {c_data['date']} at {c_data['venue']}")
        
        db.commit()
        print("Concert migration completed successfully!")
        
    except Exception as e:
        db.rollback()
        print(f"Migration failed: {str(e)}")
    finally:
        db.close()

if __name__ == "__main__":
    run_concert_migration()