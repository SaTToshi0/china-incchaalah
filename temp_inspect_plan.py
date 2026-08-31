import os
import sys
import io
import json

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from notion_client import Client
import config
from dotenv import load_dotenv

load_dotenv(override=True)
notion = Client(auth=config.NOTION_TOKEN)

print("=== 📋 Base PLAN DU JOUR ===")
db_id = config.DATABASE_PLAN
print(f"Database ID: {db_id}")

try:
    db = notion.databases.retrieve(database_id=db_id)
    print("Database metadata keys:", list(db.keys()))
    
    # Check if there are data sources
    data_sources = db.get("data_sources", [])
    if data_sources:
        ds_id = data_sources[0]["id"]
        print(f"Data Source ID found: {ds_id}")
        ds = notion.request(path=f'data_sources/{ds_id}', method='GET')
        print("Data Source properties:")
        for prop_name, prop_data in ds['properties'].items():
            ptype = prop_data['type']
            extra = ""
            if ptype == 'select':
                options = prop_data.get('select', {}).get('options', [])
                opt_names = [o.get('name') for o in options]
                extra = f" -> Options: {opt_names}"
            elif ptype == 'multi_select':
                options = prop_data.get('multi_select', {}).get('options', [])
                opt_names = [o.get('name') for o in options]
                extra = f" -> Options: {opt_names}"
            print(f"  {prop_name}: {ptype}{extra}")
            
        # Let's query
        results = notion.request(path=f'data_sources/{ds_id}/query', method='POST', body={})
        print(f"\nEntries found: {len(results.get('results', []))}")
        if results.get('results'):
            first_page = results['results'][0]
            print("\nFirst entry properties:")
            for p_name, p_val in first_page.get('properties', {}).items():
                print(f"  {p_name}: {p_val['type']} -> {p_val}")
    else:
        print("No data sources, this is a standard Notion database.")
        print("Database properties:")
        for prop_name, prop_data in db['properties'].items():
            ptype = prop_data['type']
            extra = ""
            if ptype == 'select':
                options = prop_data.get('select', {}).get('options', [])
                opt_names = [o.get('name') for o in options]
                extra = f" -> Options: {opt_names}"
            print(f"  {prop_name}: {ptype}{extra}")
            
        results = notion.databases.query(database_id=db_id)
        print(f"\nEntries found: {len(results.get('results', []))}")
        if results.get('results'):
            first_page = results['results'][0]
            print("\nFirst entry properties:")
            for p_name, p_val in first_page.get('properties', {}).items():
                print(f"  {p_name}: {p_val['type']} -> {p_val}")
                
except Exception as e:
    print(f"[ERREUR] : {e}")
