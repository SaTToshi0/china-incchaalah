from datetime import date
from notion_client import Client
import config

# Initialisation du client Notion
notion = Client(auth=config.NOTION_TOKEN)

# Date d'aujourd'hui pour l'injection
TODAY = date.today().isoformat()

def add_study(matiere, type_session, note=None, date_str=TODAY):
    """Ajoute une ligne d'étude dans la base Études."""
    properties = {
        "Type": {
            "title": [{"type": "text", "text": {"content": type_session}}]
        },
        "Matiére": {
            "select": {"name": matiere}
        },
        "Date": {
            "date": {"start": date_str}
        },
        "sur 20": {
            "rich_text": [{"type": "text", "text": {"content": "/20"}}]
        }
    }
    if note is not None:
        properties["Note"] = {
            "rich_text": [{"type": "text", "text": {"content": str(note)}}]
        }
    else:
        properties["Note"] = {
            "rich_text": []
        }
        
    try:
        notion.pages.create(
            parent={"database_id": config.DATABASE_STUDIES},
            properties=properties
        )
        print(f"[SUCCÈS] Étude ajoutée : {matiere} ({type_session})")
    except Exception as e:
        print(f"[ERREUR] Lors de l'ajout de l'étude '{matiere}': {e}")

def add_expense(depense, categorie, montant, montant_dh, date_str=TODAY):
    """Ajoute une ligne de dépense."""
    properties = {
        "Dépense": {
            "title": [{"type": "text", "text": {"content": depense}}]
        },
        "Catégorie": {
            "rich_text": [{"type": "text", "text": {"content": categorie}}]
        },
        "Montant": {
            "rich_text": [{"type": "text", "text": {"content": str(montant)}}]
        },
        "En DH": {
            "rich_text": [{"type": "text", "text": {"content": str(montant_dh)}}]
        },
        "Date": {
            "date": {"start": date_str}
        },
        "Commentaire": {
            "rich_text": []
        }
    }
    try:
        notion.pages.create(
            parent={"database_id": config.DATABASE_EXPENSES},
            properties=properties
        )
        print(f"[SUCCÈS] Dépense ajoutée : {depense} ({montant} € / {montant_dh} DH)")
    except Exception as e:
        print(f"[ERREUR] Lors de l'ajout de la dépense '{depense}': {e}")

def add_income(source, montant, date_str=TODAY):
    """Ajoute une rentrée d'argent."""
    properties = {
        "Entrée": {
            "title": [{"type": "text", "text": {"content": source}}]
        },
        "Montant": {
            "rich_text": [{"type": "text", "text": {"content": str(montant)}}]
        },
        "Date": {
            "date": {"start": date_str}
        }
    }
    try:
        notion.pages.create(
            parent={"database_id": config.DATABASE_INCOME},
            properties=properties
        )
        print(f"[SUCCÈS] Revenu ajouté : {source} ({montant} €)")
    except Exception as e:
        print(f"[ERREUR] Lors de l'ajout du revenu '{source}': {e}")

def add_health(sleep_hours, meals, sport, date_str=TODAY):
    """Ajoute le suivi de santé quotidien."""
    properties = {
        "Jour": {
            "title": [{"type": "text", "text": {"content": date_str}}]
        },
        "Sommeil": {
            "rich_text": [{"type": "text", "text": {"content": str(sleep_hours)}}]
        },
        "Repas": {
            "rich_text": [{"type": "text", "text": {"content": meals}}]
        },
        "Sport": {
            "select": {"name": sport}
        }
    }
    try:
        notion.pages.create(
            parent={"database_id": config.DATABASE_HEALTH},
            properties=properties
        )
        print(f"[SUCCÈS] Santé & Nutrition ajoutée pour le {date_str}")
    except Exception as e:
        print(f"[ERREUR] Lors de l'ajout de la santé: {e}")

def main():
    print(f"[INFO] Début de l'injection des données de test pour aujourd'hui ({TODAY})...")
    
    # 1. Études
    add_study("Algèbre Linéaire", "TD")
    add_study("Projet Python", "Projet", note=16.5)
    
    # 2. Dépenses
    add_expense("Déjeuner RU", "Nourriture", 3.50, 38.50)
    add_expense("Ticket de bus", "Transport", 1.90, 20.90)
    
    # 3. Revenus
    add_income("Bourse mensuelle", 500)
    
    # 4. Santé & Nutrition
    # Le sport doit correspondre à une option courte pour le select (ex: 'Course' ou 'Aucun')
    add_health(7.5, "Matin: Tartines. Midi: Pâtes pesto au RU. Soir: Salade césar.", "Course")
    
    print("\n[INFO] Injection terminée ! Veuillez vérifier vos bases de données Notion.")

if __name__ == "__main__":
    # Vérification que la configuration est bien présente avant de lancer
    try:
        config.check_config()
        main()
    except ValueError as e:
        print(f"[ERREUR] Configuration : {e}")
