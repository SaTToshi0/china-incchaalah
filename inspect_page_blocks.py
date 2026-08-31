import os
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from notion_client import Client
import config
from dotenv import load_dotenv

load_dotenv(override=True)
notion = Client(auth=config.NOTION_TOKEN)

page_id = "2337b78bada180e08944c25e95553f5f"
print(f"=== Inspecting page blocks for page: {page_id} ===")

try:
    response = notion.blocks.children.list(block_id=page_id)
    for i, block in enumerate(response.get("results", [])):
        b_type = block.get("type")
        b_id = block.get("id")
        print(f"[{i}] Type: {b_type} | ID: {b_id}")
        
        # Print text content if any
        if b_type in block:
            details = block[b_type]
            if "rich_text" in details:
                text = "".join([t.get("plain_text", "") for t in details["rich_text"]])
                print(f"    Text: {text}")
            elif "title" in details:
                text = "".join([t.get("plain_text", "") for t in details["title"]])
                print(f"    Title: {text}")
except Exception as e:
    print("Error:", e)
