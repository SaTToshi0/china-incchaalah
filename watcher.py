"""Script Watcher : Surveille les modifications sur Notion et met à jour le statut en temps réel."""
import time
from datetime import datetime, date, timedelta, timezone

def get_china_date():
    """Retourne la date actuelle en Chine (Nanjing, UTC+8) au format YYYY-MM-DD."""
    utc_now = datetime.now(timezone.utc)
    china_now = utc_now + timedelta(hours=8)
    return china_now.date().isoformat()

import sys
import io

# Forcer la sortie en UTF-8
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import notion_service
import llm_client
import config

def get_max_last_edited_time(target_date):
    """
    Récupère la date de dernière modification la plus récente 
    parmi toutes les pages des 4 bases de données sources pour la date cible.
    """
    last_edited_times = []
    
    # 1. Études
    try:
        res = notion_service.query_database(config.DATABASE_STUDIES, {
            "property": "Date", "date": {"equals": target_date}
        })
        for page in res.get("results", []):
            last_edited_times.append(page.get("last_edited_time"))
    except Exception:
        pass
        
    # 2. Dépenses
    try:
        res = notion_service.query_database(config.DATABASE_EXPENSES, {
            "property": "Date", "date": {"equals": target_date}
        })
        for page in res.get("results", []):
            last_edited_times.append(page.get("last_edited_time"))
    except Exception:
        pass
        
    # 3. Revenus
    try:
        res = notion_service.query_database(config.DATABASE_INCOME, {
            "property": "Date", "date": {"equals": target_date}
        })
        for page in res.get("results", []):
            last_edited_times.append(page.get("last_edited_time"))
    except Exception:
        pass
        
    # 4. Santé & Nutrition
    try:
        res = notion_service.query_database(config.DATABASE_HEALTH, {
            "property": "Jour", "title": {"equals": target_date}
        })
        for page in res.get("results", []):
            last_edited_times.append(page.get("last_edited_time"))
    except Exception:
        pass
        
    # 5. Plan du Jour
    try:
        res = notion_service.query_database(config.DATABASE_PLAN, {
            "property": "Jour", "date": {"equals": target_date}
        })
        for page in res.get("results", []):
            last_edited_times.append(page.get("last_edited_time"))
    except Exception:
        pass

        
    # Nettoyer et retourner le max
    valid_times = [t for t in last_edited_times if t]
    if not valid_times:
        return None
    return max(valid_times)

def run_update(target_date):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Changement détecté ! Mise à jour en cours...")
    
    # 1. Extraire
    studies = notion_service.fetch_daily_studies(target_date)
    expenses = notion_service.fetch_daily_expenses(target_date)
    income = notion_service.fetch_daily_income(target_date)
    health = notion_service.fetch_daily_health(target_date)
    plan = notion_service.fetch_daily_plan(target_date)
    
    # 2. IA
    report_data = llm_client.generate_parent_dashboard(studies, expenses, income, health, plan)
    
    # 3. Synchroniser la carte du Tableau de Bord (vue Galerie)
    try:
        report_page_id = notion_service.sync_dashboard_gallery_card(
            date_str=target_date,
            score=report_data['score'],
            humeur=report_data['humeur'],
            resume=report_data['resume'],
            etudes=report_data['etudes'],
            finances=report_data['finances'],
            sante=report_data['sante'],
            conseil=report_data['conseil']
        )
        print(f"   - [SUCCÈS] Carte Galerie mise à jour (ID: {report_page_id})")
    except Exception as e:
        print(f"   - [ERREUR] Synchronisation Galerie : {e}")
        
    # 4. Écrire dans le Callout et sections en temps réel sur la page principale
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
        print(f"   - [ERREUR] Écriture Callout/Plan/IA : {e}")
        
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Mise à jour terminée.\n")


def main():
    target_date = get_china_date()
    print(f"============================================================")
    print(f"Watcher Notion lancé pour la date : {target_date}")
    print(f"Le script vérifie les modifications toutes les 15 secondes...")
    print(f"Appuyez sur Ctrl+C pour arrêter le script.")
    print(f"============================================================\n")
    
    last_processed_time = None
    
    # Premier passage pour initialiser le timestamp
    print("[INFO] Initialisation du statut...")
    last_processed_time = get_max_last_edited_time(target_date)
    # Lancer une première mise à jour pour s'assurer que le callout est à jour
    run_update(target_date)
    
    while True:
        try:
            # Vérifier si on a changé de jour en Chine (Nanjing, UTC+8)
            current_date = get_china_date()
            if current_date != target_date:
                print(f"\n[{datetime.now().strftime('%H:%M:%S')}] [INFO] Passage au jour suivant en Chine : {target_date} -> {current_date}")
                target_date = current_date
                last_processed_time = None  # Reset pour forcer la mise à jour
                run_update(target_date)
                
            # Vérifier si un déclencheur de clôture de journée a été activé
            from actions.close_day import DayCloser
            closer = DayCloser(target_date)
            if closer.check_trigger_and_close():
                last_processed_time = get_max_last_edited_time(target_date)
                
            time.sleep(15)
            current_max_time = get_max_last_edited_time(target_date)
            
            if current_max_time and (last_processed_time is None or current_max_time > last_processed_time):
                last_processed_time = current_max_time
                run_update(target_date)
                
        except KeyboardInterrupt:
            print("\n[INFO] Watcher arrêté par l'utilisateur.")
            sys.exit(0)
        except Exception as e:
            print(f"[ERREUR WACTHER] {e}")
            time.sleep(10) # Attendre un peu avant de réessayer en cas d'erreur réseau


if __name__ == "__main__":
    try:
        config.check_config()
        main()
    except ValueError as e:
        print(f"[ERREUR] Configuration : {e}")
