import sys
import io
import os

# Assurer le support des caractères spéciaux
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# Ajout du dossier parent au path pour les imports locaux
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from notion_client import Client
import config
import notion_service

notion = Client(auth=config.NOTION_TOKEN)

class DayCloser:
    def __init__(self, target_date: str):
        self.target_date = target_date
        self.db_plan_id = config.DATABASE_PLAN
        
    def check_trigger_and_close(self):
        """
        Vérifie si le trigger de clôture est activé sur au moins une tâche.
        Si oui, lance le pipeline de clôture.
        """
        print(f"[CLÔTURE] Vérification des triggers de clôture pour le {self.target_date}...")
        try:
            # Récupérer les tâches de la date cible qui ont Clôturer = True
            response = notion_service.query_database(
                database_id=self.db_plan_id,
                filter_obj={
                    "and": [
                        {"property": "Date", "date": {"equals": self.target_date}},
                        {"property": "Clôturer", "checkbox": {"equals": True}}
                    ]
                }
            )
            trigger_tasks = response.get("results", [])
            if trigger_tasks:
                print(f"[CLÔTURE] Déclencheur activé détecté sur {len(trigger_tasks)} tâche(s). Lancement de la clôture...")
                self.execute_pipeline()
                return True
            return False
        except Exception as e:
            print(f"[CLÔTURE] [ERREUR] Erreur lors de la vérification du déclencheur : {e}")
            return False

    def fetch_active_tasks(self):
        """Récupère toutes les tâches du jour et antérieures ayant le statut 'Actif' ou 'Replanifier'."""
        try:
            response = notion_service.query_database(
                database_id=self.db_plan_id,
                filter_obj={
                    "and": [
                        {
                            "or": [
                                {"property": "Status", "select": {"equals": "🟢 Actif"}},
                                {"property": "Status", "select": {"equals": "♻️ Replanifier"}}
                            ]
                        },
                        {"property": "Date", "date": {"on_or_before": self.target_date}}
                    ]
                }
            )
            return response.get("results", [])
        except Exception as e:
            print(f"[CLÔTURE] [ERREUR] Impossible de récupérer les tâches actives/replanifiées : {e}")
            return []

    def close_and_archive_tasks(self, tasks):
        """
        Met à jour le statut des tâches selon la logique exacte du bouton Notion :
        1. Status == '🟢 Actif' et Fait == True -> '🗄️ Archivé'
        2. Status == '🟢 Actif' et Fait == False -> '♻️ Replanifier'
        3. Status == '♻️ Replanifier' et Fait == True -> '🗄️ Archivé'
        Dans tous les cas, décoche 'Clôturer' (le remet à False).
        """
        if not tasks:
            print("[CLÔTURE] Aucune tâche à traiter.")
            return 0
            
        print(f"[CLÔTURE] Traitement et clôture de {len(tasks)} tâche(s)...")
        updated_count = 0
        
        for task in tasks:
            page_id = task.get("id")
            props = task.get("properties", {})
            
            # Récupérer la valeur réelle de Status et Fait
            status = notion_service.get_prop_value(props, "Status")
            fait = notion_service.get_prop_value(props, "Fait") or False
            
            new_status = None
            if status == "🟢 Actif" and fait:
                new_status = "🗄️ Archivé"
            elif status == "🟢 Actif" and not fait:
                new_status = "♻️ Replanifier"
            elif status == "♻️ Replanifier" and fait:
                new_status = "🗄️ Archivé"
                
            # Préparer les propriétés à mettre à jour
            update_props = {
                "Clôturer": {
                    "checkbox": False
                }
            }
            if new_status:
                update_props["Status"] = {
                    "select": {
                        "name": new_status
                    }
                }
                
            try:
                notion.pages.update(
                    page_id=page_id,
                    properties=update_props
                )
                updated_count += 1
            except Exception as e:
                print(f"  ❌ Erreur lors de la mise à jour de la page {page_id} : {e}")
                
        print(f"[CLÔTURE] {updated_count} tâche(s) traitée(s) et réinitialisée(s) avec succès.")
        return updated_count

    def execute_pipeline(self):
        """
        Pipeline principal de clôture de journée.
        Facilement extensible pour ajouter des analyses avancées.
        """
        print("\n=== DÉBUT DU PIPELINE DE CLÔTURE DE JOURNÉE ===")
        
        # 1. Récupérer toutes les tâches actives de la journée
        active_tasks = self.fetch_active_tasks()
        
        # 2. Clôturer et archiver les tâches
        archived_count = self.close_and_archive_tasks(active_tasks)
        
        # 3. Mettre à jour le tableau de bord avec les données finales de la journée
        print("[CLÔTURE] Recalcul final et mise à jour du tableau de bord...")
        try:
            # Récupérer les données du jour pour régénérer le rapport final
            studies = notion_service.fetch_daily_studies(self.target_date)
            expenses = notion_service.fetch_daily_expenses(self.target_date)
            income = notion_service.fetch_daily_income(self.target_date)
            health = notion_service.fetch_daily_health(self.target_date)
            plan = notion_service.fetch_daily_plan(self.target_date)
            
            # Appeler l'IA pour générer le bilan final de la journée
            import llm_client
            report_data = llm_client.generate_parent_dashboard(studies, expenses, income, health, plan)
            
            # Mettre à jour le callout et les blocs en temps réel
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
            print("[CLÔTURE] [SUCCÈS] Tableau de bord mis à jour avec le rapport final.")
        except Exception as e:
            print(f"[CLÔTURE] [ERREUR] Impossible de mettre à jour le tableau de bord : {e}")
            
        print("=== FIN DU PIPELINE DE CLÔTURE DE JOURNÉE ===\n")
        return {
            "tasks_processed": len(active_tasks),
            "tasks_archived": archived_count
        }

if __name__ == "__main__":
    # Test autonome
    from datetime import datetime, timezone, timedelta
    utc_now = datetime.now(timezone.utc)
    china_now = utc_now + timedelta(hours=8)
    china_today = china_now.date().isoformat()
    
    closer = DayCloser(china_today)
    closer.execute_pipeline()

