import os
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from notion_client import Client
import config
from dotenv import load_dotenv

load_dotenv(override=True)
notion = Client(auth=config.NOTION_TOKEN)

# --- DÉPENSES ---
print("=== 💸 Base DÉPENSES ===")
db = notion.databases.retrieve(database_id=config.DATABASE_EXPENSES)
ds_id = db['data_sources'][0]['id']
ds = notion.request(path=f'data_sources/{ds_id}', method='GET')
print(f"Data Source ID: {ds_id}")
for prop_name, prop_data in ds['properties'].items():
    ptype = prop_data['type']
    extra = ""
    if ptype == 'formula':
        extra = f" → {prop_data['formula']['expression'][:60]}"
    print(f"  {prop_name}: {ptype}{extra}")

# Query entries to see data
results = notion.request(path=f'data_sources/{ds_id}/query', method='POST', body={})
print(f"\nEntries: {len(results['results'])}")
for page in results['results'][:3]:
    props = page['properties']
    for pn, pv in props.items():
        if pv['type'] == 'title':
            t = pv['title'][0]['plain_text'] if pv['title'] else "(vide)"
            print(f"  > {pn}: {t}")
        elif pv['type'] == 'rich_text':
            rt = pv.get('rich_text', [])
            t = rt[0]['plain_text'] if rt else "(vide)"
            print(f"  > {pn}: {t}")
        elif pv['type'] == 'formula':
            print(f"  > {pn}: [formula] {pv.get('formula', {})}")

# --- REVENUS ---
print("\n=== 💰 Base REVENUS ===")
db2 = notion.databases.retrieve(database_id=config.DATABASE_INCOME)
ds_id2 = db2['data_sources'][0]['id']
ds2 = notion.request(path=f'data_sources/{ds_id2}', method='GET')
print(f"Data Source ID: {ds_id2}")
for prop_name, prop_data in ds2['properties'].items():
    ptype = prop_data['type']
    extra = ""
    if ptype == 'formula':
        extra = f" → {prop_data['formula']['expression'][:60]}"
    print(f"  {prop_name}: {ptype}{extra}")

# Query entries
results2 = notion.request(path=f'data_sources/{ds_id2}/query', method='POST', body={})
print(f"\nEntries: {len(results2['results'])}")
for page in results2['results'][:3]:
    props = page['properties']
    for pn, pv in props.items():
        if pv['type'] == 'title':
            t = pv['title'][0]['plain_text'] if pv['title'] else "(vide)"
            print(f"  > {pn}: {t}")
        elif pv['type'] == 'rich_text':
            rt = pv.get('rich_text', [])
            t = rt[0]['plain_text'] if rt else "(vide)"
            print(f"  > {pn}: {t}")
