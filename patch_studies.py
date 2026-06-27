import os
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from notion_client import Client
import config
from dotenv import load_dotenv

load_dotenv(override=True)
notion = Client(auth=config.NOTION_TOKEN)

# Exchange rate: 1 CNY (RMB) ≈ 1.37 MAD (Dirham marocain)
TAUX_CNY_MAD = 1.37

# ===========================
# 💸 DÉPENSES
# ===========================
print("=== 💸 DÉPENSES ===")
db = notion.databases.retrieve(database_id=config.DATABASE_EXPENSES)
ds_id = db['data_sources'][0]['id']

# Step 1: Delete old useless properties
print("\n[1/3] Suppression de 'Résumé Dépense' et 'En DH'...")
try:
    notion.request(
        path=f'data_sources/{ds_id}',
        method='PATCH',
        body={
            'properties': {
                'Résumé Dépense': None,
                'En DH': None
            }
        }
    )
    print("  ✅ Supprimées !")
except Exception as e:
    print(f"  ❌ Erreur: {e}")

# Step 2: Create "En Dirham 🇲🇦" formula
print("\n[2/3] Création de 'En Dirham 🇲🇦' (Montant × 1.37)...")
formula_dh_depenses = f'if(empty(prop("Montant")), "", format(round(toNumber(prop("Montant")) * {TAUX_CNY_MAD} * 100) / 100) + " DH")'
try:
    notion.request(
        path=f'data_sources/{ds_id}',
        method='PATCH',
        body={
            'properties': {
                'En Dirham 🇲🇦': {
                    'formula': {
                        'expression': formula_dh_depenses
                    }
                }
            }
        }
    )
    print("  ✅ 'En Dirham 🇲🇦' créée !")
except Exception as e:
    print(f"  ❌ Erreur: {e}")

# Step 3: Rename "Montant" to make it clear it's in RMB
print("\n[3/3] Renommage de 'Montant' → 'Montant (RMB 🇨🇳)'...")
try:
    notion.request(
        path=f'data_sources/{ds_id}',
        method='PATCH',
        body={
            'properties': {
                'Montant': {
                    'name': 'Montant (RMB 🇨🇳)'
                }
            }
        }
    )
    print("  ✅ Renommée !")
except Exception as e:
    print(f"  ❌ Erreur: {e}")

# Verify Dépenses
print("\n--- Schéma final DÉPENSES ---")
db = notion.databases.retrieve(database_id=config.DATABASE_EXPENSES)
ds = notion.request(path=f'data_sources/{db["data_sources"][0]["id"]}', method='GET')
for pn, pv in ds['properties'].items():
    pt = pv['type']
    extra = ""
    if pt == 'formula':
        expr = pv['formula']['expression'][:70]
        extra = f" → {expr}..."
    print(f"  {pn}: {pt}{extra}")

# ===========================
# 💰 REVENUS
# ===========================
print("\n\n=== 💰 REVENUS ===")
db2 = notion.databases.retrieve(database_id=config.DATABASE_INCOME)
ds_id2 = db2['data_sources'][0]['id']

# Step 1: Delete old "Montant" (rich_text) and recreate as formula
print("\n[1/2] Suppression de l'ancien 'Montant'...")
try:
    notion.request(
        path=f'data_sources/{ds_id2}',
        method='PATCH',
        body={
            'properties': {
                'Montant': None
            }
        }
    )
    print("  ✅ Supprimé !")
except Exception as e:
    print(f"  ❌ Erreur: {e}")

# Step 2: Create "En Dirham 🇲🇦" formula based on "Entrée" (title = montant en RMB)
print("\n[2/2] Création de 'En Dirham 🇲🇦' (Entrée × 1.37)...")
formula_dh_revenus = f'if(empty(prop("Entrée")), "", format(round(toNumber(prop("Entrée")) * {TAUX_CNY_MAD} * 100) / 100) + " DH")'
try:
    notion.request(
        path=f'data_sources/{ds_id2}',
        method='PATCH',
        body={
            'properties': {
                'En Dirham 🇲🇦': {
                    'formula': {
                        'expression': formula_dh_revenus
                    }
                }
            }
        }
    )
    print("  ✅ 'En Dirham 🇲🇦' créée !")
except Exception as e:
    print(f"  ❌ Erreur: {e}")

# Verify Revenus
print("\n--- Schéma final REVENUS ---")
db2 = notion.databases.retrieve(database_id=config.DATABASE_INCOME)
ds2 = notion.request(path=f'data_sources/{db2["data_sources"][0]["id"]}', method='GET')
for pn, pv in ds2['properties'].items():
    pt = pv['type']
    extra = ""
    if pt == 'formula':
        expr = pv['formula']['expression'][:70]
        extra = f" → {expr}..."
    print(f"  {pn}: {pt}{extra}")

print("\n\n🎉 Terminé !")
print(f"Taux de change utilisé : 1 RMB = {TAUX_CNY_MAD} DH")
print("Tapez un montant en RMB et la conversion en Dirham se fait toute seule !")
