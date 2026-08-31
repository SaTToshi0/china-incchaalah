import os
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from notion_client import Client
import config
from dotenv import load_dotenv

load_dotenv(override=True)
notion = Client(auth=config.NOTION_TOKEN)

print("=== Test 1: Query database using 'Jour' ===")
try:
    response = notion.request(
        path=f"data_sources/{notion.databases.retrieve(database_id=config.DATABASE_PLAN)['data_sources'][0]['id']}/query",
        method="POST",
        body={
            "filter": {
                "property": "Jour",
                "date": {
                    "equals": "2026-06-30"
                }
            }
        }
    )
    print("Success with 'Jour'! Found:", len(response.get("results", [])))
except Exception as e:
    print("Error with 'Jour':", e)

print("\n=== Test 2: Query database using 'Date' ===")
try:
    response = notion.request(
        path=f"data_sources/{notion.databases.retrieve(database_id=config.DATABASE_PLAN)['data_sources'][0]['id']}/query",
        method="POST",
        body={
            "filter": {
                "property": "Date",
                "date": {
                    "equals": "2026-06-30"
                }
            }
        }
    )
    print("Success with 'Date'! Found:", len(response.get("results", [])))
    for p in response.get("results", []):
        props = p["properties"]
        obj = props["Objectif"]["title"][0]["plain_text"] if props["Objectif"]["title"] else "(No name)"
        print(f"  - {obj}")
except Exception as e:
    print("Error with 'Date':", e)
