"""
add_formulas.py
Adds formula properties to the Études, Dépenses, and Rapports Parents databases
using the Notion data_sources API.
"""

import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from notion_client import Client
import config

notion = Client(auth=config.NOTION_TOKEN)


def resolve_data_source_id(database_id: str) -> str:
    """Retrieve the data_source_id for a given database."""
    db = notion.databases.retrieve(database_id=database_id)
    data_sources = db.get('data_sources', [])
    if not data_sources:
        raise RuntimeError(f"No data_sources found for database {database_id}")
    return data_sources[0]['id']


def add_formula(ds_id: str, prop_name: str, expression: str) -> dict:
    """Add a formula property to a data source via PATCH."""
    return notion.request(
        path=f'data_sources/{ds_id}',
        method='PATCH',
        body={
            'properties': {
                prop_name: {
                    'formula': {
                        'expression': expression
                    }
                }
            }
        }
    )


def main():
    # ── 1. Études — "Résumé" ────────────────────────────────────────────
    print("=" * 60)
    print("1/3  Études → Résumé")
    print("=" * 60)
    try:
        ds_id = resolve_data_source_id(config.DATABASE_STUDIES)
        print(f"  Data source ID: {ds_id}")
        result = add_formula(
            ds_id,
            'Résumé',
            'prop("Matiére") + " — " + prop("Type")'
        )
        print("  ✅ Formula 'Résumé' added successfully to Études.")
    except Exception as e:
        print(f"  ❌ Error: {e}")

    # ── 2. Dépenses — "Résumé Dépense" ─────────────────────────────────
    print()
    print("=" * 60)
    print("2/3  Dépenses → Résumé Dépense")
    print("=" * 60)
    try:
        ds_id = resolve_data_source_id(config.DATABASE_EXPENSES)
        print(f"  Data source ID: {ds_id}")
        result = add_formula(
            ds_id,
            'Résumé Dépense',
            'prop("Dépense") + " : " + prop("Montant") + "€"'
        )
        print("  ✅ Formula 'Résumé Dépense' added successfully to Dépenses.")
    except Exception as e:
        print(f"  ❌ Error: {e}")

    # ── 3. Rapports Parents — "Indicateur" ──────────────────────────────
    print()
    print("=" * 60)
    print("3/3  Rapports Parents → Indicateur")
    print("=" * 60)
    try:
        # We already know the ds_id for Rapports Parents
        ds_id = '614ea278-bba4-41ba-95d9-58b7ed9c7eb9'
        print(f"  Data source ID: {ds_id} (pre-resolved)")
        result = add_formula(
            ds_id,
            'Indicateur',
            'if(prop("Score de Productivité") >= 80, "🟢 Excellent", if(prop("Score de Productivité") >= 50, "🟡 Correct", "🔴 À surveiller"))'
        )
        print("  ✅ Formula 'Indicateur' added successfully to Rapports Parents.")
    except Exception as e:
        print(f"  ❌ Error: {e}")

    print()
    print("=" * 60)
    print("Done — all formula additions attempted.")
    print("=" * 60)


if __name__ == '__main__':
    main()
