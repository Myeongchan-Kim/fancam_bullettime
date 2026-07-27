import os
from sqlalchemy import create_engine, inspect

# Try port 6543 for transaction mode pooler
DATABASE_URL = "postgresql://postgres.snwhknvcllzsnsvhvsqu:ymAzPfgo6rOdqAZQ@aws-0-us-west-2.pooler.supabase.com:6543/postgres?sslmode=require"

def check_schema():
    try:
        engine = create_engine(DATABASE_URL)
        inspector = inspect(engine)
        
        tables = inspector.get_table_names()
        print(f"Tables: {tables}")
        
        if 'videos' in tables:
            columns = [c['name'] for c in inspector.get_columns('videos')]
            print(f"Columns in 'videos': {columns}")
            if 'is_shorts' in columns:
                print("✅ 'is_shorts' exists in 'videos'")
            else:
                print("❌ 'is_shorts' missing in 'videos'")
                
        if 'contributions' in tables:
            columns = [c['name'] for c in inspector.get_columns('contributions')]
            print(f"Columns in 'contributions': {columns}")
            if 'suggested_is_shorts' in columns:
                print("✅ 'suggested_is_shorts' exists in 'contributions'")
            else:
                print("❌ 'suggested_is_shorts' missing in 'contributions'")
                
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_schema()
