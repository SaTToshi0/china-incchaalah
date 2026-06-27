"""Script de diagnostic v2 : affiche le schema complet de chaque base Notion."""
import sys
import io
import json

# Forcer la sortie en UTF-8
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from notion_client import Client
import config

notion = Client(auth=config.NOTION_TOKEN)

databases = {
    "Etudes": config.DATABASE_STUDIES,
    "Depenses": config.DATABASE_EXPENSES,
    "Revenus": config.DATABASE_INCOME,
    "Sante": config.DATABASE_HEALTH,
}

for name, db_id in databases.items():
    print(f"\n{'='*60}")
    print(f"Base : {name} (ID: {db_id})")
    print(f"{'='*60}")
    try:
        db = notion.databases.retrieve(database_id=db_id)
        
        # Titre
        title_parts = db.get("title", [])
        db_title = "".join([t.get("plain_text", "") for t in title_parts])
        print(f"Titre Notion : {db_title}")
        
        # Proprietes
        props = db.get("properties", {})
        print(f"Nombre de proprietes : {len(props)}")
        
        if len(props) == 0:
            # Afficher les cles disponibles dans la reponse pour diagnostiquer
            print(f"Cles de la reponse API : {list(db.keys())}")
            # Essayer d'afficher le JSON brut (tronque)
            raw = json.dumps(db, indent=2, ensure_ascii=False)
            # N'afficher que les 2000 premiers caracteres
            print(f"Reponse brute (tronquee) :\n{raw[:2000]}")
        else:
            for prop_name, prop_data in props.items():
                prop_type = prop_data.get("type", "?")
                extra = ""
                if prop_type == "select":
                    options = prop_data.get("select", {}).get("options", [])
                    opt_names = [o.get("name", "?") for o in options]
                    extra = f" -> Options: {opt_names}"
                print(f"  - '{prop_name}' (type: {prop_type}){extra}")
                
    except Exception as e:
        print(f"[ERREUR] {e}")

print("\n[INFO] Diagnostic termine.")
