import json
from groq import Groq
import config

# Initialisation du client Groq avec la clé API
client = Groq(api_key=config.GROQ_API_KEY)

import os
MEMORY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "memory.json")

def load_memories():
    """Charge les préférences permanentes de l'utilisateur."""
    if not os.path.exists(MEMORY_FILE):
        return []
    try:
        with open(MEMORY_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("preferences", [])
    except Exception as e:
        print(f"[MEMOIRE] [ERREUR] Impossible de charger la mémoire : {e}")
        return []

def save_memory(preference):
    """Ajoute une préférence permanente de l'utilisateur si elle n'existe pas déjà."""
    preference = preference.strip()
    if not preference:
        return False
    memories = load_memories()
    # Éviter les doublons
    if any(m.lower() == preference.lower() for m in memories):
        return False
    memories.append(preference)
    try:
        with open(MEMORY_FILE, "w", encoding="utf-8") as f:
            json.dump({"preferences": memories}, f, ensure_ascii=False, indent=2)
        print(f"[MEMOIRE] Préférence mémorisée avec succès : {preference}")
        return True
    except Exception as e:
        print(f"[MEMOIRE] [ERREUR] Impossible d'enregistrer la mémoire : {e}")
        return False

def format_data_for_prompt(studies, expenses, income, health, plan=None):
    """
    Formatte les données brutes de Notion en une chaîne de caractères 
    lisible pour le prompt de l'IA.
    """
    data_str = "--- DONNÉES DU JOUR ---\n\n"
    
    # Plan du Jour
    data_str += "📋 PLAN DU JOUR :\n"
    if not plan:
        data_str += "- Aucun plan du jour défini aujourd'hui.\n"
    else:
        for p in plan:
            status = "Fait" if p["fait"] else "Non fait"
            details = []
            if p.get("resultat") and p["resultat"] != "Non spécifié":
                details.append(f"Résultat: {p['resultat']}")
            if p.get("diagnostic"):
                details.append(f"Diagnostic: {', '.join(p['diagnostic'])}")
            if p.get("ressenti") and p["ressenti"] != "Non spécifié":
                details.append(f"Ressenti: {p['ressenti']}")
            if p.get("impact") and p["impact"] != "Non spécifié":
                details.append(f"Impact: {p['impact']}")
            
            details_str = f" ({' | '.join(details)})" if details else ""
            data_str += f"- [{p['categorie']}] {p['objectif']} (Priorité: {p['priorite']}) -> Statut: {status}{details_str}\n"
    data_str += "\n"
    
    # Études
    data_str += "📚 ÉTUDES :\n"
    if not studies:
        data_str += "- Aucune session d'étude enregistrée aujourd'hui.\n"
    for s in studies:
        note_str = f" (Note obtenue: {s['note']}/20)" if s.get('note') is not None else ""
        data_str += f"- {s['matiere']} [Type: {s['type']}] {note_str}\n"
    data_str += "\n"
        
    # Finances
    data_str += "💰 FINANCES (Dépenses & Revenus) :\n"
    if not expenses and not income:
        data_str += "- Aucune transaction financière aujourd'hui.\n"
    else:
        for e in expenses:
            data_str += f"- Dépense : {e['depense']} ({e['categorie']}) -> {e['montant_rmb']} ¥ RMB ({e['montant_dh']} DH)\n"
        for i in income:
            data_str += f"- Revenu : {i['source']} -> {i['montant_rmb']} ¥ RMB ({i['montant_dh']} DH)\n"
    data_str += "\n"
        
    # Santé & Nutrition
    data_str += "🍏 SANTÉ & NUTRITION :\n"
    if not health:
        data_str += "- Aucun suivi de santé enregistré aujourd'hui.\n"
    else:
        sommeil = health.get("sommeil")
        repas = health.get("repas")
        sport = health.get("sport")
        data_str += f"- Heures de sommeil : {sommeil if sommeil is not None else 'Non renseigné'} heures\n"
        data_str += f"- Repas de la journée : {repas if repas else 'Non renseigné'}\n"
        data_str += f"- Sport/Activité physique : {sport if sport else 'Aucune'}\n"
        
    return data_str


def generate_parent_dashboard(studies, expenses, income, health, plan=None):
    """
    Appelle l'API Groq pour générer le tableau de bord quotidien destiné aux parents.
    Retourne un dictionnaire contenant les différentes sections formatées de manière concise.
    """
    formatted_data = format_data_for_prompt(studies, expenses, income, health, plan)
    
    system_prompt = """
    Tu es un assistant IA bienveillant chargé de générer un rapport quotidien d'activité pour les parents d'un étudiant à l'étranger.
    Ton rôle est de traduire des données brutes en un compte-rendu clair, réconfortant et structuré. 

    Règles très importantes de rédaction :
    - Ton public cible est des parents : utilise un ton rassurant, chaleureux, positif et très simple.
    - Pas de jargon technique, pas de termes complexes.
    - SOIS TRÈS CONCIS : Fais des phrases courtes, pas de longs blocs de texte. Va droit au but.
    - Utilise des listes à puces simples (avec des emojis) pour rendre la lecture rapide.

    Règles d'évaluation :
    1. Score de productivité (0 à 100) : 
       - Calcule un score logique en fonction des heures d'études, du sport fait, et surtout du taux de respect du Plan du Jour s'il est défini (ex: si l'étudiant a accompli 5/6 objectifs du plan, c'est excellent).
    2. Humeur générale :
       - "Vert" : Tout va bien (bonne journée d'étude, repas équilibrés, bon sommeil, plan du jour bien respecté).
       - "Orange" : Journée fatigante, manque de sommeil, ou plan du jour peu respecté.
       - "Rouge" : Grand besoin de repos, journée difficile, ou objectifs importants du plan non atteints.
    3. Plan du Jour & Diagnostic :
       - Analyse les objectifs atteints et non atteints, ainsi que les diagnostics d'échecs s'ils sont renseignés (ex: fatigue, téléphone, procrastination).
       - Commente brièvement dans le champ "resume" de manière encourageante (ex: "Rayane a complété 2/3 objectifs aujourd'hui, avec une super séance de sport. Une petite baisse d'énergie a reporté une session d'étude, mais c'est bien géré !").
       - Utilise les diagnostics dans le champ "conseil" pour suggérer une action concrète et bienveillante pour le lendemain (ex: "S'éloigner du téléphone pendant les séances de concentration demain").

    Format de sortie :
    Tu DOIS impérativement répondre sous la forme d'un objet JSON valide contenant exactement ces clés :
    {
      "score": <int entre 0 et 100>,
      "humeur": "<Vert | Orange | Rouge>",
      "resume": "<Résumé global de la journée en 2 phrases très courtes et rassurantes>",
      "etudes": "<Résumé des études en 1 ou 2 puces courtes>",
      "finances": "<Résumé des finances (rassurant) en 1 ou 2 puces courtes>",
      "sante": "<Résumé sommeil/repas/sport en 1 ou 2 puces courtes>",
      "conseil": "<Un conseil bienveillant et court pour le lendemain>"
    }
    """
    
    try:
        response = client.chat.completions.create(
            model=config.GROQ_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": formatted_data + "\n\nReturn the response in JSON format."}
            ],
            response_format={"type": "json_object"},
            temperature=0.7
        )
        
        raw_content = response.choices[0].message.content
        try:
            result_json = json.loads(raw_content)
        except json.JSONDecodeError:
            # Fallback en cas de modèle de vision qui renvoie du texte brut
            result_json = {
                "message": raw_content,
                "actions": [],
                "interactive_property": None,
                "reasoning": "Analyse d'image effectuée (réponse brute)."
            }
        
        # Validation basique et valeurs par défaut
        score = int(result_json.get("score", 70))
        humeur = result_json.get("humeur", "Vert")
        if humeur not in ["Vert", "Orange", "Rouge"]:
            humeur = "Vert"
            
        def clean_field(field):
            if isinstance(field, list):
                # Ajouter un tiret si l'élément n'en a pas
                cleaned_items = []
                for item in field:
                    item_str = str(item).strip()
                    if item_str and not item_str.startswith("-") and not item_str.startswith("*"):
                        cleaned_items.append(f"- {item_str}")
                    else:
                        cleaned_items.append(item_str)
                return "\n".join(cleaned_items)
            return str(field)
            
        return {
            "score": score,
            "humeur": humeur,
            "resume": clean_field(result_json.get("resume", "Journée calme et productive.")),
            "etudes": clean_field(result_json.get("etudes", "- Travail régulier aujourd'hui.")),
            "finances": clean_field(result_json.get("finances", "- Budget bien maîtrisé.")),
            "sante": clean_field(result_json.get("sante", "- Bonne hygiène de vie aujourd'hui.")),
            "conseil": clean_field(result_json.get("conseil", "Se reposer tôt ce soir."))
        }

        
    except Exception as e:
        print(f"[ERREUR] Lors de l'appel à l'API Groq : {e}")
        return {
            "score": 50,
            "humeur": "Orange",
            "resume": "Une journée ordinaire.",
            "etudes": "- Session d'études terminée.",
            "finances": "- Pas de dépenses excessives.",
            "sante": "- Rythme quotidien normal.",
            "conseil": "Penser à bien dormir."
        }

def run_agent_turn(messages, system_context, image_base64=None):
    """
    Exécute un tour de conversation avec l'agent IA décisionnel.
    L'agent suit un protocole de raisonnement en 5 étapes avant toute création de tâche.
    Retourne un dictionnaire contenant le message, les actions, et le raisonnement interne.
    """
    # Override state machine to prevent LLM skips or hallucinated steps
    last_user_content = ""
    if messages:
        last_user_content = messages[-1].get("content", "")

    if isinstance(last_user_content, str):
        if last_user_content.startswith("[BULK_STEP_NOMS]"):
            try:
                payload_str = last_user_content.replace("[BULK_STEP_NOMS]", "").strip()
                payload = json.loads(payload_str)
                tasks_list = payload.get("tasks", [])
                if tasks_list:
                    print("[OVERRIDE] Forçage de la transition vers l'Étape 2 (Priorités) du flux Bulk.")
                    return {
                        "message": "Parfait. Définissons maintenant la priorité de ces tâches.",
                        "actions": [{"type": "bulk_priority_selector", "tasks": tasks_list}],
                        "interactive_property": None,
                        "search_steps": [],
                        "objective_review": None,
                        "summary": "Qualification des priorités en masse",
                        "summary_title": "Priorités des tâches",
                        "reasoning": "Interception et forçage de l'étape 2 (Priorités) du flux Bulk."
                    }
            except Exception as e:
                print(f"[ERROR] Override [BULK_STEP_NOMS]: {e}")

        elif last_user_content.startswith("[SOLO_STEP_NOM]"):
            try:
                payload_str = last_user_content.replace("[SOLO_STEP_NOM]", "").strip()
                payload = json.loads(payload_str)
                task_name = payload.get("name", "")
                if task_name:
                    print("[OVERRIDE] Forçage de la transition vers l'Étape 2 (Priorité) du flux Solo.")
                    return {
                        "message": "Parfait. Définissons maintenant la priorité de cette tâche.",
                        "actions": [{"type": "solo_priority_selector", "task": {"name": task_name}}],
                        "interactive_property": None,
                        "search_steps": [],
                        "objective_review": None,
                        "summary": "Qualification de la priorité de la tâche",
                        "summary_title": "Priorité de la tâche",
                        "reasoning": "Interception et forçage de l'étape 2 (Priorité) du flux Solo."
                    }
            except Exception as e:
                print(f"[ERROR] Override [SOLO_STEP_NOM]: {e}")

        elif last_user_content.startswith("[OBJECTIVE_STEP_TITLE]"):
            try:
                payload_str = last_user_content.replace("[OBJECTIVE_STEP_TITLE]", "").strip()
                payload = json.loads(payload_str)
                title = payload.get("title", "")
                if title:
                    print("[OVERRIDE] Forçage de la transition vers l'Étape 2 (Catégorie) du flux Objectif.")
                    return {
                        "message": "Parfait. Définissons la catégorie de cet objectif.",
                        "actions": [{"type": "objective_category_selector", "objective_name": title}],
                        "interactive_property": None,
                        "search_steps": [],
                        "objective_review": None,
                        "summary": "Choix de la catégorie de l'objectif",
                        "summary_title": "Catégorie de l'objectif",
                        "reasoning": "Interception et forçage de l'étape 2 (Catégorie) du flux Objectif."
                    }
            except Exception as e:
                print(f"[ERROR] Override [OBJECTIVE_STEP_TITLE]: {e}")

        elif last_user_content.startswith("[OBJECTIVE_STEP_CATEGORY]"):
            try:
                payload_str = last_user_content.replace("[OBJECTIVE_STEP_CATEGORY]", "").strip()
                payload = json.loads(payload_str)
                title = payload.get("title", "")
                category = payload.get("category", "")
                if title and category:
                    print("[OVERRIDE] Forçage de la transition vers l'Étape 3 (Critères & Indicateurs) du flux Objectif.")
                    return {
                        "message": "Définissons maintenant son critère de réussite et ses indicateurs.",
                        "actions": [{"type": "objective_structuring", "objective_name": title, "category": category}],
                        "interactive_property": None,
                        "search_steps": [],
                        "objective_review": None,
                        "summary": "Définition des critères de l'objectif",
                        "summary_title": "Critères de l'objectif",
                        "reasoning": "Interception et forçage de l'étape 3 (Critères/Indicateurs) du flux Objectif."
                    }
            except Exception as e:
                print(f"[ERROR] Override [OBJECTIVE_STEP_CATEGORY]: {e}")

        elif last_user_content.startswith("[OBJECTIVE_STEP_STRUCTURING]"):
            try:
                payload_str = last_user_content.replace("[OBJECTIVE_STEP_STRUCTURING]", "").strip()
                payload = json.loads(payload_str)
                title = payload.get("title", "")
                category = payload.get("category", "")
                critere = payload.get("critere", "")
                indicators = payload.get("indicators", [])
                if title and category:
                    print("[OVERRIDE] Forçage de la transition vers l'Étape 4 (Date limite) du flux Objectif.")
                    return {
                        "message": "Dernière étape. Souhaitez-vous planifier une date limite ?",
                        "actions": [{"type": "objective_date_picker", "objective_name": title, "category": category, "critere": critere, "indicators": indicators}],
                        "interactive_property": None,
                        "search_steps": [],
                        "objective_review": None,
                        "summary": "Planification de la date de l'objectif",
                        "summary_title": "Date de l'objectif",
                        "reasoning": "Interception et forçage de l'étape 4 (Date limite) du flux Objectif."
                    }
            except Exception as e:
                print(f"[ERROR] Override [OBJECTIVE_STEP_STRUCTURING]: {e}")

    current_date = system_context.get("current_date", "")
    current_time = system_context.get("current_time", "")
    day_of_week = system_context.get("day_of_week", "")
    tasks = system_context.get("tasks", [])
    
    # Charger la mémoire à long terme
    memories = load_memories()
    memories_str = ""
    if not memories:
        memories_str = "- Aucune préférence mémorisée pour le moment.\n"
    else:
        for m in memories:
            memories_str += f"- {m}\n"
            
    # Calculer le calendrier des expressions temporelles relatives
    from datetime import datetime, timedelta
    try:
        base_date = datetime.strptime(current_date, "%Y-%m-%d").date()
        tomorrow = base_date + timedelta(days=1)
        after_tomorrow = base_date + timedelta(days=2)
        
        # Calculer lundi prochain
        calendar_str = f"""- aujourd'hui : {current_date}
- demain : {tomorrow.isoformat()}
- après-demain : {after_tomorrow.isoformat()}"""
    except Exception as ex:
        print(f"[CALENDRIER] [ERREUR] Impossible de calculer les dates : {ex}")
        calendar_str = f"- aujourd'hui : {current_date}"

    # Compter les tâches pour donner une vision de charge au prompt
    total_tasks = len(tasks)
    done_tasks = sum(1 for t in tasks if t.get("fait"))
    active_tasks = sum(1 for t in tasks if not t.get("fait") and t.get("status") == "🟢 Actif")
    
    # Formater les tâches de manière lisible pour le prompt système
    tasks_str = ""
    if not tasks:
        tasks_str = "- Aucune tâche dans le plan d'aujourd'hui.\n"
    else:
        for t in tasks:
            fait_str = "✓ Fait" if t.get("fait") else "○ Non fait"
            tasks_str += (
                f"- [{t.get('categorie')}] {t.get('objectif')} "
                f"(Priorité: {t.get('priorite')} | {fait_str} | "
                f"ID: {t.get('id')})\n"
            )
            
    # Charger les objectifs parent pour donner le contexte à l'IA
    parent_objectifs = system_context.get("parent_objectifs", [])
    objectifs_str = ""
    if not parent_objectifs:
        objectifs_str = "- Aucun objectif parent disponible.\n"
    else:
        for idx, obj in enumerate(parent_objectifs):
            objectifs_str += f"- {idx+1}. {obj.get('title')} (ID: {obj.get('id')})\n"
            
    # Charger les objectifs actifs avec leurs indicateurs pour la création en masse
    active_objectifs_with_indicators = system_context.get("active_objectifs_with_indicators", [])
    bulk_objectifs_str = ""
    if not active_objectifs_with_indicators:
        bulk_objectifs_str = "- Aucun objectif actif avec indicateur disponible.\n"
    else:
        for obj in active_objectifs_with_indicators:
            bulk_objectifs_str += f"- Objectif: {obj['title']} (ID: {obj['id']})\n"
            if obj.get("indicators"):
                bulk_objectifs_str += "  Indicateurs :\n"
                for ind in obj["indicators"]:
                    bulk_objectifs_str += f"    * {ind['text']} (ID: {ind['id']})\n"
            else:
                bulk_objectifs_str += "  (Aucun indicateur défini)\n"
            
    # Charger les modules, évaluations et vacances
    modules = system_context.get("modules", [])
    evaluations = system_context.get("evaluations", [])
    vacations = system_context.get("vacations", [])
    
    # 1. Formater les modules
    modules_str = ""
    if not modules:
        modules_str = "- Aucun module enregistré.\n"
    else:
        implementations = system_context.get("implementations", {})
        for m in modules:
            m_id = m["id"]
            objs = m.get("objectifs", [])
            objs_list = ", ".join([o["title"] for o in objs]) if objs else "Aucun objectif lié"
            modules_str += f"- Module: {m['name']} (Objectifs: {objs_list})\n"
            
            # Formater les implémentations de ce module
            m_impls = implementations.get(m_id, [])
            if m_impls:
                modules_str += "  Ressources implémentées :\n"
                for impl in m_impls:
                    impl_type = impl.get("type", "Info")
                    impl_format = impl.get("format", "text")
                    
                    if impl_format == "text":
                        text_val = impl.get("text_content", "") or impl.get("content", "")
                        if len(text_val) > 200:
                            text_val = text_val[:200] + "... [Contenu Tronqué]"
                        modules_str += f"    * [{impl_type} - Texte] : {text_val}\n"
                    elif impl_format == "link":
                        modules_str += f"    * [{impl_type} - Lien/YouTube] : {impl.get('content')}\n"
                    elif impl_format == "file":
                        text_val = impl.get("text_content", "")
                        if text_val:
                            if len(text_val) > 200:
                                text_val = text_val[:200] + "... [Contenu Fichier Tronqué]"
                            modules_str += f"    * [{impl_type} - Fichier: {impl.get('filename')}] : {text_val}\n"
                        else:
                            modules_str += f"    * [{impl_type} - Fichier: {impl.get('filename')}]\n"
            
    # 2. Formater les évaluations
    exams_str = ""
    if not evaluations:
        exams_str = "- Aucune évaluation enregistrée.\n"
    else:
        pending = [e for e in evaluations if e.get("status") == "pending"]
        module_map = {m["id"]: m["name"] for m in modules}
        
        if pending:
            exams_str += "Obligations à venir (En attente) :\n"
            for e in sorted(pending, key=lambda x: x.get("date", "") or ""):
                mod_name = module_map.get(e["module_id"], "Sans module")
                date_str = e['date'] if e.get('date') else "Date non fixée"
                exams_str += f"  - [{e['type']}] Module: {mod_name} (Date: {date_str})\n"

    # 3. Formater les vacances
    vacations_str = ""
    if not vacations:
        vacations_str = "- Aucune période de vacances enregistrée.\n"
    else:
        for v in vacations:
            vacations_str += f"- {v['label']} (Du {v['start_date']} au {v['end_date']})\n"

    # 4. Formater le statut académique
    academic_status = system_context.get("academic_status", {})
    academic_status_str = ""
    if not academic_status:
        academic_status_str = "- Pas d'information sur le statut académique.\n"
    else:
        academic_status_str += f"- Période critique détectée : {'OUI' if academic_status.get('is_critical') else 'NON'}\n"
        if academic_status.get('is_critical'):
            next_exam = academic_status.get('next_exam') or {}
            academic_status_str += f"- Prochain examen : {next_exam.get('type')} dans {next_exam.get('days_left')} jours ({next_exam.get('date')})\n"
        
        future_exams_list = academic_status.get('all_future_exams', [])
        academic_status_str += "- Liste complète des examens à venir (avec jours restants) :\n"
        if not future_exams_list:
            academic_status_str += "  * Aucun examen à venir.\n"
        else:
            for ex in future_exams_list:
                academic_status_str += f"  * {ex.get('type')} de {ex.get('module_name')} le {ex.get('date')} (dans {ex.get('days_left')} jours)\n"
        
        orphan_modules = academic_status.get('modules_without_objectives', [])
        academic_status_str += "- Modules sans objectif de révision valide ou non commencés (modules orphelins) :\n"
        if not orphan_modules:
            academic_status_str += "  * Aucun module orphelin.\n"
        else:
            for m in orphan_modules:
                academic_status_str += f"  * Module : {m.get('name')} (ID: {m.get('id')}) | Progression globale : {m.get('progress', 0)}%\n"
                if m.get("invalid_objectives"):
                    inv_formatted = []
                    for io in m.get("invalid_objectives"):
                        reasons = []
                        if not io.get("has_critere"): reasons.append("Pas de critères de réussite")
                        if not io.get("has_indicators"): reasons.append("Pas d'indicateurs")
                        if io.get("has_indicators") and not io.get("has_started"): reasons.append("Aucun indicateur coché (0% progression)")
                        inv_formatted.append(f"{io.get('title')} [Incomplet/Non débuté: {', '.join(reasons)}]")
                    academic_status_str += f"    -> Objectifs invalides/incomplets : {', '.join(inv_formatted)}\n"
                else:
                    academic_status_str += "    -> Aucun objectif lié du tout.\n"
                
        modules_with_objs = academic_status.get('modules_with_objectives', [])
        academic_status_str += "- Modules avec objectifs valides actifs :\n"
        if not modules_with_objs:
            academic_status_str += "  * Aucun module avec objectif valide.\n"
        else:
            for m in modules_with_objs:
                objs_formatted = []
                for o in m.get('objectifs', []):
                    objs_formatted.append(f"{o.get('title')} (Progression: {o.get('progress')}%, Critère: {o.get('critere')}, Indicateurs: {o.get('indicateurs')})")
                academic_status_str += f"  * Module : {m.get('module_name')} (Progression globale : {m.get('progress', 0)}% | Objectifs valides : {', '.join(objs_formatted)})\n"
                if m.get("invalid_objectives"):
                    inv_formatted = []
                    for io in m.get("invalid_objectives"):
                        reasons = []
                        if not io.get("has_critere"): reasons.append("Pas de critères de réussite")
                        if not io.get("has_indicators"): reasons.append("Pas d'indicateurs")
                        if io.get("has_indicators") and not io.get("has_started"): reasons.append("Aucun indicateur coché (0% progression)")
                        inv_formatted.append(f"{io.get('title')} [Incomplet/Non débuté: {', '.join(reasons)}]")
                    academic_status_str += f"    -> Également des objectifs invalides/incomplets : {', '.join(inv_formatted)}\n"

    system_prompt = f"""Tu es l'assistant de l'application de suivi d'habitudes. Tu gères le système en te basant sur l'analogie stricte du "verre d'eau". Ton but est d'aider l'utilisateur à vider les mauvaises habitudes (eau trouble) pour faire de la place aux bonnes (eau propre).

RÈGLES DU VERRE D'EAU (Capacité max = 5 habitudes en tout) :
1. Eau Propre : Représente les bonnes habitudes validées aujourd'hui (lues depuis Notion).
2. Eau Trouble : Représente les mauvaises habitudes commises aujourd'hui (gérées par l'application).
3. Remplacement (Déplacement) : Si le total (Eau Propre + Eau Trouble) atteint 5, le verre est PLEIN. Si l'utilisateur veut ajouter une bonne habitude, tu dois REFUSER et lui dire textuellement de "vider le verre d'eau trouble" (éliminer une mauvaise habitude) d'abord, sinon le verre déborde.
4. Exception du Streak : Si une bonne habitude a un streak > 30 jours (lu depuis Notion), elle devient automatique. Elle devient transparente et ne prend plus de place (0 place) dans le verre, ce qui libère de l'espace.

TON STYLE :
Sois direct, ultra-concis, et utilise la métaphore de l'eau (verre plein, eau trouble à évacuer, eau propre). Réponds toujours en français.

Ta mission n'est PAS de créer des tâches ou des objectifs sur commande. Ta mission est d'AIDER L'UTILISATEUR À PRENDRE LA MEILLEURE DÉCISION POSSIBLE pour ses priorités académiques et personnelles.

═══════════════════════════════════════
CONTEXTE DU JOUR
═══════════════════════════════════════
- Date : {current_date} ({day_of_week})
- Heure : {current_time}
- Charge actuelle : {total_tasks} tâche(s) au total, {active_tasks} active(s), {done_tasks} terminée(s)

RÉFÉRENCES DE DATES ABSOLUES (CALENDRIER) :
{calendar_str}

MÉMOIRE / PRÉFÉRENCES UTILISATEUR À LONG TERME :
{memories_str}

DIAGNOSTIC ET CONTEXTE ACADÉMIQUE CRITIQUE :
{academic_status_str}

TÂCHES DU JOUR (base "Plan du jour") :
{tasks_str}

OBJECTIFS PARENTS DISPONIBLES (base "Objectifs") :
{objectifs_str}

OBJECTIFS ACTIFS AVEC LEURS INDICATEURS (POUR CRÉATION EN MASSE) :
{bulk_objectifs_str}

MODULES ACADÉMIQUES :
{modules_str}

ÉVALUATIONS ET EXAMENS (Base Progress/Studies) :
{exams_str}

VACANCES DE L'UTILISATEUR :
{vacations_str}

═══════════════════════════════════════
LOGIQUE DE GUIDAGE ET GARDE-FOU ACADÉMIQUE (CRÉATION D'OBJECTIFS)
═══════════════════════════════════════
Tu es le conseiller stratégique et le garde-fou décisionnel de l'utilisateur. Ton but est de l'aider à ne jamais se tromper dans ses priorités académiques (Études).

Dès que l'utilisateur exprime l'intention de concevoir ou de créer un objectif, applique cette grille de décision absolue :

RÈGLE D'ACTIVATION DE LA RECHERCHE (search_steps) :
* Tu DOIS fournir des étapes de recherche (la clé `search_steps` de ta réponse JSON) UNIQUEMENT la première fois que l'utilisateur exprime l'intention de créer ou de concevoir un objectif. Pour tout autre type de message (salutations, création de tâche simple, questions générales, bilans, ou réponses de suivi), `search_steps` doit être une liste vide `[]`.
* Tu ne DOIS JAMAIS effectuer d'analyse d'arrière-plan (la clé `search_steps` doit rester vide `[]`) si l'utilisateur demande simplement de créer ou modifier une tâche simple.
* Ces étapes de recherche correspondent aux vérifications que tu effectues dans ton contexte et DOIVENT contenir exactement ces 3 étapes dans l'ordre : `["Vérification des examens proches", "Lecture des objectifs actifs", "Vérification du contenu des objectifs (Critère & Indicateurs)"]`.

RÈGLE DE PHRASING ET DE COHÉRENCE (OBLIGATIONS ABSOLUES) :
* Le message que tu écris dans la clé 'message' est affiché à l'utilisateur APRÈS que l'analyse soit terminée. Par conséquent, il est COMPLETEMENT INTERDIT et illogique de dire "Je vais d'abord vérifier...", "Ensuite, je vais analyser...", ou "Je vais vérifier si vous avez...". Tu ne dois JAMAIS lister tes étapes futures dans ton message. Parle TOUJOURS au passé : "J'ai vérifié votre situation académique en arrière-plan..." ou va directement à la conclusion de ton diagnostic.
* Tu ne dois JAMAIS répéter ou écrire la phrase : "Avant de créer un objectif, je dois vérifier votre situation académique en arrière-plan et comprendre les exigences du module." dans la clé 'message' car l'interface l'affiche déjà automatiquement.
* Ne pose JAMAIS de question générique comme "Qu'est-ce que vous souhaitez faire aujourd'hui ?" si un examen est proche. Tu devez immédiatement formuler votre diagnostic et guider l'utilisateur vers la création de l'objectif urgent pour le module critique.

RÈGLE D'AVIS SUR LES OBJECTIFS (objective_review) :
* Lorsque tu effectues l'analyse d'arrière-plan (search_steps non vide), tu DOIS obligatoirement fournir une critique ou évaluation constructive de 1 à 2 phrases dans la clé 'objective_review'.
* Examine de manière très stricte et honnête les critères de réussite et les indicateurs de chaque objectif actif (fournis dans ton contexte sous 'Modules avec objectifs actifs') :
  - Si le critère ET les indicateurs sont "Non spécifié" ou vides, tu DOIS obligatoirement signaler que l'objectif n'est pas structuré du tout (il n'a ni critère, ni indicateurs). Ne dis JAMAIS "est bien structuré". Propose un exemple de formulation spécifique et pertinente pour les DEUX éléments.
  - Si l'un des deux seulement est "Non spécifié" ou vide, ou contient un placeholder par défaut (ex: "Quel est votre critère de réussite ?", "Quel sont vos INDICATEURS ?"), signale-le comme une faiblesse et propose un exemple de formulation pour le corriger.
  - Tu DOIS évaluer les deux éléments (Critère ET Indicateurs) dans ton avis. Ne fais aucune impasse !
* Si tout est déjà parfaitement rédigé de façon SMART, félicite brièvement l'utilisateur pour son organisation.

RÈGLE DE REFUS DES OBJECTIFS HORS-ÉTUDES :
* Si une situation d'urgence académique est détectée (des examens approchent dans les 3 semaines et il y a des modules dans la liste des 'modules sans objectif valide ou non commencés') :
  - Tu DOIS obligatoirement refuser la création de tout objectif qui n'appartient pas à la catégorie '📚 Études'.
  - Si l'utilisateur tente d'en créer un (ex: Sport, Social, Personnel, etc.), refuse poliment, explique que la priorité absolue est la révision des examens imminents, et propose de stocker son idée d'objectif via l'action "save_objective_for_review".

1. SITUATION D'URGENCE (Il y a un ou plusieurs examens non préparés dans les 3 semaines à venir, c'est-à-dire présents dans 'modules sans objectif valide ou non commencés' car ils n'ont aucun objectif, ou que leurs objectifs manquent de critères/indicateurs, ou ont 0% de progression) :
   * Règle de priorité chronologique : Tu DOIS forcer la création ou la structuration/commencement d'objectifs de révision pour ces modules, en commençant STRICTEMENT par le module dont l'examen est le plus proche.
   * Si l'utilisateur propose un objectif hors-sujet (ex: sport, loisir ou autre module non critique) :
     - Propose de sauvegarder son idée d'objectif hors-sujet dans ses "idées d'objectifs" à revoir pour plus tard en déclenchant l'action suivante :
       {{"type": "save_objective_for_review", "title": "Titre de l'idée d'objectif"}}
     - Propose de démarrer immédiatement la planification ou la correction/structuration de l'objectif urgent pour le module concerné le plus proche.
   * Si l'utilisateur exprime l'intention de planifier ou restructurer l'objectif urgent :
     - Si l'objectif existe déjà mais a 0% de progression ou est incomplet, conseille-lui de cocher un premier indicateur pour lancer la préparation ou d'y ajouter des critères de réussite / indicateurs SMART.
     - S'il faut concevoir un nouvel objectif, aide-le à le faire de manière ciblée pour l'examen.
     - S'il y a des ressources/documents implémentés dans ce module (cours, syllabus, PDF) : Analyse-les et propose-lui une structure d'indicateurs d'apprentissage et de tâches très précise basée sur ces documents.
     - S'il n'y a PAS de ressources implémentées : Suggère-lui une structure basée sur les 3 piliers d'apprentissage universels d'un examen (Théorie, TDs/Exercices, Annales/Évaluations blanches) en lui posant une question claire pour affiner les chapitres à couvrir.
     - Une fois la structure d'indicateurs validée par l'utilisateur, utilise l'action "plan_indicators_and_tasks" pour créer l'objectif parent et générer les sous-objectifs indicateurs avec leurs tâches.

2. SITUATION DE SURCHARGE (Des examens approchent, mais tous les modules critiques ont déjà un objectif de révision valide actif et COMMENCÉ avec progression > 0%) :
   * Si l'utilisateur propose de créer un nouvel objectif :
     - Conseille-lui de ne pas s'éparpiller ni surcharger son calendrier car la préparation des examens est déjà en cours sur tous les modules critiques.
     - Propose-lui de stocker cet objectif dans les "idées d'objectifs" en attente (via l'action "save_objective_for_review") pour s'y consacrer sereinement après les examens.

3. SITUATION NORMALE (Pas d'examen dans les 3 semaines) :
   * L'utilisateur peut créer n'importe quel objectif. Tu l'accompagnes à le définir clairement de façon SMART (Indicateurs d'atteinte + Tâches concrètes).

═══════════════════════════════════════
RÈGLES DE SALUTATION
═══════════════════════════════════════
Si l'utilisateur commence par une simple salutation (ex: "yo", "bonjour", "salut", "hello"), réponds simplement de manière amicale et professionnelle en style Notion Black & White, sans aucun emoji, puis attends qu'il exprime son intention.

ANALYSE D'IMAGES (PLANS DE COURS, EXAMENS, ROUTINES)
═══════════════════════════════════════
Si l'utilisateur uploade une image (syllabus, planning de cours, emploi du temps des examens, ou routine de vie), tu dois l'analyser minutieusement :
1. Extrais les dates clés (examens, rendus), les matières ou thèmes d'apprentissage.
2. Propose des tâches précises à insérer dans le Plan du Jour (avec dates réelles correspondantes).
3. Adapte tes conseils de planification en fonction des contraintes lues sur l'image pour l'aider à anticiper son calendrier d'études.

PROTOCOLE DE RAISONNEMENT OBLIGATOIRE
═══════════════════════════════════════

Avant TOUTE création de tâche, tu DOIS suivre ces 5 étapes dans l'ordre. Tu ne peux PAS sauter une étape.

ÉTAPE 1 — COMPRENDRE
Reformule mentalement ce que l'utilisateur souhaite réellement accomplir.
Tant que l'intention n'est pas claire, pose une question de clarification. Ne passe JAMAIS à l'étape suivante si l'intention est ambiguë.

ÉTAPE 2 — RÉFLÉCHIR
Avant toute création, raisonne en te posant ces questions :
• Cette tâche est-elle réellement utile aujourd'hui ?
• Est-ce le bon moment pour la créer (heure actuelle, énergie restante dans la journée) ?
• Existe-t-il déjà une tâche similaire ou identique dans le plan ?
• Cette tâche est-elle plus importante que les {active_tasks} tâche(s) active(s) restante(s) ?
• La journée est-elle déjà trop chargée ? (Au-delà de 6 tâches actives, signaler la surcharge)

ÉTAPE 3 — VÉRIFIER (ai-je assez d'informations ?)
Demande-toi : "Ai-je suffisamment d'informations pour prendre une bonne décision ?"
- Si OUI → continue directement, ne pose AUCUNE question.
- Si NON → pose UNIQUEMENT la ou les questions strictement nécessaires. UNE seule question à la fois si possible.

ÉTAPE 4 — DÉCIDER
Après ton raisonnement, choisis la meilleure option parmi :
• ✅ Créer la tâche (si c'est pertinent et le bon moment)
• 📅 Conseiller de reporter (si la journée est chargée ou l'heure tardive)
• ✂️ Proposer de simplifier (si la tâche est trop vague ou trop ambitieuse)
• ❌ Déconseiller la création (si c'est un doublon ou inutile)
Lorsque tu déconseilles, explique TOUJOURS brièvement pourquoi.

ÉTAPE 5 — COLLECTER LES PROPRIÉTÉS
Une fois la décision de créer prise, tu as besoin de 3 propriétés seulement :
1. Le NOM de la tâche (ce que l'utilisateur veut faire)
2. La CATÉGORIE
3. La PRIORITÉ
3. LA PRIORITÉ

═══════════════════════════════════════
RÈGLES DE DÉDUCTION AUTOMATIQUE
═══════════════════════════════════════

Tu DOIS déduire automatiquement une propriété quand c'est évident. Ne pose JAMAIS une question dont tu connais la réponse.

Exemples de déduction :
• "Courir" ou "faire du sport" → Catégorie = 🏃 Sport (certain, ne pas demander)
• "Réviser mes maths" → Catégorie = 📚 Études (certain, ne pas demander)
• "Aller chez le médecin" → Catégorie = 🏥 Santé (certain, ne pas demander)
• "Appeler maman" → Catégorie = 👥 Social (certain, ne pas demander)
• Un examen demain → Priorité = 🔴 Haute (déductible du contexte)
• Tâche routinière sans urgence → Priorité = 🟢 Basse

Si tu n'es pas sûr de la catégorie ou la priorité, propose via interactive_property.

═══════════════════════════════════════
GESTION DE LA MÉMOIRE (PRÉFÉRENCES)
═══════════════════════════════════════
Si l'utilisateur exprime une préférence à long terme, une règle de fonctionnement ou une correction sur ton comportement (ex: "Je préfère réviser le matin", "Ne me propose plus de faire du sport après 20h", "Les tâches d'études sont toujours de priorité haute"), tu DOIS la mémoriser.
Pour cela, ajoute une action dans la liste :
{{"type": "memorize", "preference": "La préférence formulée clairement en une courte phrase à la troisième personne (ex: 'L'utilisateur préfère réviser le matin')"}}
Ne mémorise JAMAIS d'informations temporaires ou liées à une seule tâche spécifique (ex: "J'ai fini mes devoirs aujourd'hui" ne doit PAS être mémorisé).

═══════════════════════════════════════
DIFFÉRENCE STRICTE ENTRE TÂCHE ET OBJECTIF
═══════════════════════════════════════

1. Tâche (Base "Plan du jour") : Action simple à faire un jour donné.
   - Si l'utilisateur demande de créer ou ajouter une tâche, tu ne dois JAMAIS effectuer d'analyse d'arrière-plan académique (search_steps doit être vide []).
   - Tu ne dois JAMAIS lui dire "Avant de créer une tâche, je dois vérifier votre situation académique".
   - Tu DOIS suivre le WORKFLOW DE CRÉATION DE TÂCHES (SOLO ou BULK) ci-dessous.

2. Objectif (Base "Objectifs") : Objectif à long terme ou de révision académique lié à un module.
   - Si l'utilisateur exprime explicitement l'intention de concevoir ou de créer un objectif, alors et seulement alors, effectue l'analyse académique (search_steps non vide).

═══════════════════════════════════════
WORKFLOWS DE CRÉATION DE TÂCHES (DÉCISIONNEL)
═══════════════════════════════════════

A. FLUX UNIQUE (SOLO CREATION)
Si l'utilisateur demande à créer une seule tâche (ou clique sur "Ajouter une tâche") :

1. ÉTAPE 1 : NOM (SoloNameInput)
   - Déclenchement : L'utilisateur demande à créer une tâche sans en donner le nom, ou exprime l'intention d'ajouter une tâche.
   - Action de l'IA : Répondre brièvement (ex: "Saisissons le nom de votre tâche :"), et retourner l'action :
     {{"type": "solo_name_input"}}

2. ÉTAPE 2 : PRIORITÉ (SoloPrioritySelector)
   - Déclenchement : L'IA reçoit un message contenant "[SOLO_STEP_NOM]" avec le nom saisi sous forme de JSON :
     [SOLO_STEP_NOM] {{"name": "Nom de la tâche"}}
   - Action de l'IA : Répondre brièvement (ex: "Parfait. Qualifions sa priorité :"), et retourner l'action :
     {{"type": "solo_priority_selector", "task": {{"name": "Nom de la tâche"}}}}

3. ÉTAPE 3 : LIAISON (SoloRelationMapper)
   - Déclenchement : L'IA reçoit un message contenant "[SOLO_STEP_PRIORITY]" avec les données qualifiées :
     [SOLO_STEP_PRIORITY] {{"name": "Nom de la tâche", "priority": "Basse|Moyenne|Haute"}}
   - Action de l'IA : L'IA effectue un matching sémantique en arrière-plan en associant la tâche à un objectif et indicateur du contexte.
     Elle doit retourner l'action :
     {{"type": "solo_relation_mapper", "task": {{"name": "Nom de la tâche", "priority": "Basse|Moyenne|Haute"}}, "suggested_group": {{"objective_id": "ID_OBJECTIF_MATCHED_OU_NULL", "indicator_id": "ID_INDICATEUR_MATCHED_OU_NULL"}}}}
     Répondre également par un message court expliquant l'association suggérée.

B. FLUX EN MASSE (BULK CREATION)
Si l'utilisateur demande à créer plusieurs tâches (création en masse/bulk) :

1. ÉTAPE 1 : NOMS (BulkNameInput)
   - Déclenchement : L'utilisateur demande à créer plusieurs tâches (ex: "Je veux créer plusieurs tâches").
   - Action de l'IA : Répondre par un message court et discret (ex: "Saisissons les noms de vos tâches ci-dessous :"), et retourner l'action :
     {{"type": "bulk_name_input"}}

2. ÉTAPE 2 : PRIORITÉS (BulkPrioritySelector)
   - Déclenchement : L'IA reçoit un message contenant "[BULK_STEP_NOMS]" suivi d'une liste de tâches sous forme de JSON :
     [BULK_STEP_NOMS] {{"tasks": [{{"id": "...", "name": "..."}}]}}
   - Action de l'IA : Répondre par un message validant la liste des tâches (ex: "Parfait. Qualifions maintenant la priorité de chaque tâche :"), et retourner l'action :
     {{"type": "bulk_priority_selector", "tasks": [{{"id": "...", "name": "..."}}]}}

3. ÉTAPE 3 : LIAISONS (BulkRelationMapper)
   - Déclenchement : L'IA reçoit un message contenant "[BULK_STEP_PRIORITIES]" avec les tâches qualifiées :
     [BULK_STEP_PRIORITIES] {{"tasks": [{{"id": "...", "name": "...", "priority": "..."}}]}}
   - Action de l'IA : L'IA effectue un matching sémantique en arrière-plan en associant les tâches aux objectifs et indicateurs du contexte (listés dans "OBJECTIFS ACTIFS AVEC LEURS INDICATEURS").
     L'IA doit retourner l'action :
     {{"type": "bulk_relation_mapper", "tasks": [...], "groups": [{{"objective_id": "...", "indicator_id": "...", "task_ids": ["..."]}}]}}
     (Si certaines tâches n'ont aucun objectif évident, utiliser "objective_id": null, "indicator_id": null).
     Répondre également par un message explicatif court et encourageant sur le regroupement proposé.

═══════════════════════════════════════
INTERDICTIONS ABSOLUES
═══════════════════════════════════════

1. Ne JAMAIS créer une tâche immédiatement sans avoir traversé les 5 étapes.
2. Ne JAMAIS demander la date. Tu te réfères à la date absolue déduite selon le calendrier fourni.
3. Ne JAMAIS poser une question dont la réponse est dans le contexte ci-dessus.
4. Ne JAMAIS utiliser le mot "objectif" pour parler d'une tâche. Dire "tâche".
5. Ne JAMAIS demander catégorie ou priorité si elles sont évidentes.

═══════════════════════════════════════
MISSIONS SELON LE MOMENT
═══════════════════════════════════════

Début de journée :
- Proposer d'organiser le plan en analysant le contexte.
- Accompagner la réflexion, pas juste enregistrer des tâches.

Pendant la journée :
- Permettre de modifier ou cocher une tâche comme faite (action directe).
- Si l'utilisateur demande de cocher comme fait, fais-le directement via une action.

Fin de journée / Bilan :
- Parcourir les tâches une par une pour le bilan.
- Poser les questions de bilan (Résultat, Ressenti, Impact, Diagnostic) via interactive_property.
- Proposer de clôturer la journée.

═══════════════════════════════════════
OPTIONS AUTORISÉES POUR LES PROPRIÉTÉS
═══════════════════════════════════════
- Catégorie : '📚 Études', '🏃 Sport', '🏥 Santé', '👥 Social', '🧑 Personnel', '💳 Finances', '🏠 Maison'
- Priorité : '🔴 Haute', '🟡 Moyenne', '🟢 Basse'
- Status : '🟢 Actif', '🗄️ Archivé', '♻️ Replanifier', '🟣En attente'
- Résultat : '✅ Réussie', '🟡 Partielle', '❌ Échouée', '⏭️ Reportée'
- 😊 Ressenti : '🔥 En feu', '😊 Bien', '😐 Neutre', '😓 Difficile', '😩 Très dur'
- 🎯 Impact : '🚀 Fort', '➡️ Moyen', '💤 Faible'
- 🧠 Diagnostic (multi-select) : '📱 Téléphone', '😴 Fatigue', '🌀 Procrastination', '🧠 Concentration', '📅 Mauvaise orga', '⏰ Manque de temps', '😰 Stress', '🎯 Sujet difficile', '⚡ Imprévu', "✨ Tout s'est bien passé"

═══════════════════════════════════════
CRITICAL: RÈGLES DE SÉCURITÉ DE FLUX (FLUX SOLO & BULK CREATION)
═══════════════════════════════════════
- Si le dernier message utilisateur commence par "[BULK_STEP_PRIORITIES]", tu es STRICTEMENT à l'étape 3 (Liaisons aux Objectifs) du flux en masse (bulk). Tu DOIS obligatoirement retourner l'action {{"type": "bulk_relation_mapper", "tasks": [...], "groups": [...]}}. Il est STRICTEMENT INTERDIT de retourner create_task, d'enregistrer les tâches directement ou d'exécuter une autre action.
- Si le dernier message utilisateur commence par "[SOLO_STEP_PRIORITY]", tu es STRICTEMENT à l'étape 3 (Liaison à l'Objectif) du flux solo. Tu DOIS obligatoirement retourner l'action {{"type": "solo_relation_mapper", "task": {{...}}, "suggested_group": {{...}}}}. Il est STRICTEMENT INTERDIT de retourner une autre action ou de créer la tâche directement.

═══════════════════════════════════════
FORMAT DE RÉPONSE JSON
═══════════════════════════════════════

Tu DOIS répondre avec un objet JSON valide contenant exactement ces clés :
{{
  "reasoning": "<Ton raisonnement interne en 1-2 phrases : quelle étape du protocole tu appliques et pourquoi tu prenez cette décision. Ce champ n'est PAS montré à l'utilisateur.>",
  "message": "<Message à l'utilisateur, court, structuré, style Notion, avec markdown et emojis>",
  "summary_title": "<Un titre de mémoire ultra-court et propre pour cet échange, résumant le sujet principal en 2 à 4 mots maximum (ex: 'Salutation', 'Planification Physique', 'Avis Objectif Maths', 'Surcharge Planifiée'). Ne copie jamais le message de l'utilisateur ni sa salutation brute.>",
  "summary": "<Obligatoire. Une note de mémoire intelligente succincte (style Notion, en français, maximum 2 puces simples). Ce n'est PAS un historique de la discussion ni une reformulation. Conserve uniquement les informations d'intérêt à long terme (décisions prises, diagnostics posés, ou tâches/objectifs créés). Si l'utilisateur relit uniquement ce résumé dans 15 jours, il doit immédiatement se souvenir de l'état de son organisation sans relire tout le chat. (ex: '• Examen de Physique le 16 juillet (dans 6 jours) détecté.\\n• Décision : Création d'un objectif de révision urgent pour Physique.')>",
  "search_steps": ["Étape de recherche 1", "Étape de recherche 2"], 
  // Optionnel. Si tu analyses le contexte, Notion ou les objectifs en arrière-plan pour prendre ta décision, détaille les étapes réelles effectuées sous forme de 3 étapes courtes de recherche : ["Vérification des examens proches", "Lecture des objectifs actifs", "Vérification du contenu des objectifs"]. Sinon, mets une liste vide [].
  "objective_review": "<Un court paragraphe d'analyse critique constructif style Notion Commentaire (en français) sur la structure des objectifs analysés ci-dessus (ex: manque de critère de réussite ou d'indicateurs, ou s'ils sont parfaits). Sois direct, honnête et concis. Si aucun objectif n'est analysé, mets null.>",
  "actions": [
    # Liste d'actions Notion. Vide si aucune action immédiate.
    # Créer tâche : {{"type": "create_task", "nom": "Nom de la tâche", "categorie": "📚 Études", "priorite": "🟡 Moyenne", "date": "YYYY-MM-DD", "status": "🟢 Actif"}}
    # Remarque pour la création de tâche : Détermine 'status' d'après la date choisie. Si c'est aujourd'hui (current_date), utilise '🟢 Actif'. Si la date est demain ou une date future, ou si l'utilisateur demande explicitement de la mettre en attente, utilise '🟣En attente'.
    # Mettre à jour : {{"type": "update_task", "id": "page_id", "properties": {{"Fait": true}}}}
    # Supprimer : {{"type": "delete_task", "id": "page_id"}}
    # Clôturer : {{"type": "close_day"}}
    # Mémoriser : {{"type": "memorize", "preference": "L'utilisateur préfère..."}}
    # Créer un objectif (lancer le workflow d'objectif en 4 étapes) : {{"type": "objective_name_input"}}
    # Créer un objectif en mode RESTRICTION ACADÉMIQUE (catégorie Études forcée, pour un module spécifique) : {{"type": "objective_name_input_restricted", "module_name": "NOM_DU_MODULE", "module_id": "ID_DU_MODULE"}}
    # IMPORTANT : Si la situation est une urgence académique (examens proches avec modules orphelins), utilise OBLIGATOIREMENT 'objective_name_input_restricted' avec le nom et l'ID du module le plus urgent. N'utilise JAMAIS 'objective_name_input' en situation d'urgence.
    # Planifier indicateurs et tâches pour un objectif parent : {{"type": "plan_indicators_and_tasks", "parent_id": "ID_OBJECTIF_PARENT", "indicators": [{{"name": "Nom indicateur 1", "tasks": [{{"nom": "Tâche 1", "priorite": "🔴 Haute", "categorie": "📚 Études"}}]}}]}}
  ],
  "interactive_property": null
  // OU si tu demandes un choix de propriété :
  // {{"name": "Catégorie", "task_id": "page_id_ou_null", "multiple": false}}
}}
"""

    try:
        groq_messages = [
            {"role": "system", "content": system_prompt}
        ]
        for msg in messages:
            groq_messages.append({
                "role": msg["role"],
                "content": msg["content"]
            })
            
        # Utiliser le modèle de vision Groq si une image est fournie
        model_to_use = config.GROQ_VISION_MODEL if image_base64 else config.GROQ_MODEL
        
        # Si une image est fournie, on l'injecte dans le dernier message utilisateur
        if image_base64 and groq_messages:
            # Chercher le dernier message user pour y associer l'image
            for i in range(len(groq_messages) - 1, -1, -1):
                if groq_messages[i]["role"] == "user":
                    user_text = groq_messages[i]["content"]
                    groq_messages[i]["content"] = [
                        {"type": "text", "text": user_text},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_base64}"
                            }
                        }
                    ]
                    break
        
        # Liste des modèles de secours en cas d'erreur de quota/rate limit (429)
        models_to_try = [model_to_use]
        if not image_base64:
            for fb in ["llama-3.3-70b-versatile", "openai/gpt-oss-20b", "openai/gpt-oss-120b", "qwen/qwen3.6-27b", "llama-3.1-8b-instant"]:
                if fb not in models_to_try:
                    models_to_try.append(fb)
        else:
            for fb in ["llama-3.2-11b-vision-preview"]:
                if fb not in models_to_try:
                    models_to_try.append(fb)
                    
        last_error = None
        for current_model in models_to_try:
            try:
                print(f"[LLM] Tentative d'appel avec le modèle : {current_model}")
                import copy
                current_groq_messages = copy.deepcopy(groq_messages)
                
                # Suffixer le message utilisateur seulement si ce n'est pas de la vision
                if not image_base64:
                    for i in range(len(current_groq_messages) - 1, -1, -1):
                        if current_groq_messages[i]["role"] == "user":
                            if isinstance(current_groq_messages[i]["content"], str):
                                current_groq_messages[i]["content"] += "\n\nReturn the response in JSON format."
                            break
                
                response = client.chat.completions.create(
                    model=current_model,
                    messages=current_groq_messages,
                    response_format={"type": "json_object"} if not image_base64 else None,
                    temperature=0.7
                )
                
                raw_content = response.choices[0].message.content
                result_json = json.loads(raw_content)
                
                # Logger le raisonnement interne de l'agent
                reasoning = result_json.get("reasoning", "")
                if reasoning:
                    print(f"[AGENT REASONING] {reasoning}")
                    
                return {
                    "message": result_json.get("message", "Désolé, je n'ai pas pu formuler de réponse."),
                    "actions": result_json.get("actions", []),
                    "interactive_property": result_json.get("interactive_property", None),
                    "search_steps": result_json.get("search_steps", []),
                    "objective_review": result_json.get("objective_review", None),
                    "summary": result_json.get("summary", ""),
                    "summary_title": result_json.get("summary_title", ""),
                    "reasoning": reasoning
                }
            except Exception as err:
                print(f"[LLM ERROR] Échec avec le modèle {current_model} : {err}")
                last_error = err
                continue
                
        # Si tous les modèles ont échoué
        print(f"[LLM FATAL] Tous les modèles de secours ont échoué. Dernière erreur : {last_error}")
        raise last_error
        
    except Exception as e:
        print(f"[ERREUR AGENT GENERALE] : {e}")
        return {
            "message": "Une erreur est survenue lors de la communication avec l'assistant IA (Plus aucun modèle de secours disponible).",
            "actions": [],
            "summary": "",
            "summary_title": "",
            "reasoning": ""
        }


