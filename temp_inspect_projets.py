import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

sys.path.append(r'c:\Users\eloua\Downloads\China incchaalah')
from dotenv import load_dotenv
load_dotenv(dotenv_path=r'c:\Users\eloua\Downloads\China incchaalah\.env')

from notion_client import Client
import config

notion = Client(auth=config.NOTION_TOKEN)

# Dump raw Projets DB schema
db = notion.databases.retrieve(database_id=config.DATABASE_PROJETS)
print("TOP-LEVEL KEYS:", list(db.keys()))
print()

# Try to find properties
props = db.get('properties', db.get('schema', {}))
print("PROPERTIES TYPE:", type(props))
print()

if isinstance(props, dict):
    for name in props:
        print("  PROP:", repr(name), "->", type(props[name]))
elif isinstance(props, list):
    for p in props:
        print("  PROP:", p)
else:
    # Dump everything
    print(json.dumps(db, indent=2, ensure_ascii=False, default=str)[:3000])
