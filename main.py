import sys
import io
from datetime import date, datetime

# Forcer la sortie en UTF-8 pour compatibilité Windows et GitHub Actions
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import config
import notion_service
import llm_client

from datetime import datetime, timedelta, timezone

def get_china_date():
    """Retourne la date actuelle en Chine (Nanjing, UTC+8) au format YYYY-MM-DD."""
    utc_now = datetime.now(timezone.utc)
    china_now = utc_now + timedelta(hours=8)
    return china_now.date().isoformat()

def get_target_date():
    """
    Récupère la date cible pour le rapport.
    Si une date au format YYYY-MM-DD est passée en argument, on l'utilise.
    Sinon, on utilise la date d'aujourd'hui en Chine (UTC+8).
    """
    if len(sys.argv) > 1:
        date_input = sys.argv[1]
        try:
            parts = date_input.split("-")
            if len(parts) == 3 and len(parts[0]) == 4:
                return date_input
            else:
                raise ValueError
        except ValueError:
            print(f"[ATTENTION] Format de date invalide: '{date_input}'. Utilisation du format YYYY-MM-DD requis.")
            print("Utilisation de la date d'aujourd'hui en Chine par défaut.")
            
    return get_china_date()


def check_report_already_exists(target_date):
    """
    Vérifie si un rapport existe déjà pour la date cible dans la base Rapports Parents.
    Retourne l'ID de la page existante si trouvée, sinon None.
    """
    try:
        response = notion_service.query_database(
            database_id=config.DATABASE_REPORTS,
            filter_obj={
                "property": "Date",
                "title": {
                    "equals": f"Rapport du {target_date}"
                }
            }
        )
        results = response.get("results", [])
        if results:
            return results[0].get("id")
    except Exception:
        pass
    return None

def main():
    # 1. Vérification de la configuration
    try:
        config.check_config()
    except ValueError as e:
        print(f"[ERREUR] Configuration initiale : {e}")
        sys.exit(1)
        
    # 2. Détermination de la date cible
    target_date = get_target_date()
    now = datetime.now().strftime("%H:%M:%S")
    print(f"[INFO] Date cible pour le rapport : {target_date} (exécuté à {now})\n")
    
    # 3. Extraction des données depuis Notion
    print("[INFO] Récupération des données depuis Notion...")
    try:
        studies = notion_service.fetch_daily_studies(target_date)
        print(f"   - Études : {len(studies)} session(s) trouvée(s)")
        
        expenses = notion_service.fetch_daily_expenses(target_date)
        print(f"   - Dépenses : {len(expenses)} transaction(s) trouvée(s)")
        
        income = notion_service.fetch_daily_income(target_date)
        print(f"   - Revenus : {len(income)} entrée(s) trouvée(s)")
        
        health = notion_service.fetch_daily_health(target_date)
        health_status = "trouvé" if health else "aucun enregistrement"
        print(f"   - Santé & Nutrition : {health_status}")
        
        plan = notion_service.fetch_daily_plan(target_date)
        print(f"   - Plan du Jour : {len(plan)} objectif(s) trouvé(s)")
    except Exception as e:
        print(f"[ERREUR] Lors de la communication avec Notion : {e}")
        print("Veuillez vérifier vos IDs de bases de données et votre NOTION_TOKEN.")
        sys.exit(1)
        
    # 4. Génération du rapport via l'IA
    print("\n[IA] Génération du rapport quotidien par l'IA (Groq)...")
    report_data = llm_client.generate_parent_dashboard(studies, expenses, income, health, plan)
    
    print(f"   - Score calculé : {report_data['score']}/100")
    print(f"   - Humeur globale : {report_data['humeur']}")
    print("   - Rapport rédigé avec succès.")
    
    # 5. Mise à jour du message en temps réel sur la page principale
    print("\n[NOTION] Mise à jour du message en temps réel pour les parents...")
    try:
        notion_service.update_or_create_parent_status_callout(
            score=report_data['score'],
            humeur=report_data['humeur'],
            resume=report_data['resume'],
            etudes=report_data['etudes'],
            finances=report_data['finances'],
            sante=report_data['sante'],
            conseil=report_data['conseil'],
            plan_items=plan
        )

    except Exception as e:
        print(f"[ERREUR] Lors de la mise à jour du bloc de statut en temps réel : {e}")

if __name__ == "__main__":
    main()
