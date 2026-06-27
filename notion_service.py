from datetime import date
from notion_client import Client
import config

# Initialisation du client Notion avec le jeton secret
notion = Client(auth=config.NOTION_TOKEN)

# Cache pour stocker la résolution Database ID -> Data Source ID
DATABASE_TO_DATA_SOURCE_CACHE = {}

def get_data_source_id(db_id):
    """
    Résout l'ID de conteneur de base de données en l'ID de sa source de données (data_source) sous-jacente.
    Met en cache le résultat pour optimiser les appels d'API.
    """
    if not db_id or db_id == "a_configurer":
        return db_id
        
    if db_id in DATABASE_TO_DATA_SOURCE_CACHE:
        return DATABASE_TO_DATA_SOURCE_CACHE[db_id]
        
    try:
        db = notion.databases.retrieve(database_id=db_id)
        data_sources = db.get("data_sources", [])
        if data_sources:
            ds_id = data_sources[0]["id"]
            DATABASE_TO_DATA_SOURCE_CACHE[db_id] = ds_id
            return ds_id
    except Exception as e:
        print(f"[ATTENTION] Impossible de résoudre le Data Source ID pour la base {db_id}: {e}")
        
    # En cas d'échec, on retourne l'ID original (pour compatibilité ascendante)
    return db_id

def query_database(database_id, filter_obj=None):
    """
    Interroge une base de données Notion en utilisant l'API REST des Data Sources.
    """
    ds_id = get_data_source_id(database_id)
    body = {}
    if filter_obj:
        body["filter"] = filter_obj
    
    return notion.request(
        path=f"data_sources/{ds_id}/query",
        method="POST",
        body=body,
    )

def get_prop_value(properties, prop_name):
    """
    Extrait la valeur d'une propriété Notion de manière sécurisée
    selon son type (title, rich_text, select, number, date, checkbox).
    """
    if prop_name not in properties:
        return None
    
    prop = properties[prop_name]
    prop_type = prop.get("type")
    
    if prop_type == "title":
        titles = prop.get("title", [])
        return "".join([t.get("plain_text", "") for t in titles]) if titles else ""
        
    elif prop_type == "rich_text":
        texts = prop.get("rich_text", [])
        return "".join([t.get("plain_text", "") for t in texts]) if texts else ""
        
    elif prop_type == "select":
        select_val = prop.get("select")
        return select_val.get("name") if select_val else None
        
    elif prop_type == "number":
        return prop.get("number")
        
    elif prop_type == "date":
        date_val = prop.get("date")
        return date_val.get("start") if date_val else None
        
    elif prop_type == "checkbox":
        return prop.get("checkbox", False)
    
    elif prop_type == "multi_select":
        m_select = prop.get("multi_select", [])
        return [item.get("name") for item in m_select if item.get("name")]
    
    elif prop_type == "formula":
        formula_val = prop.get("formula", {})
        f_type = formula_val.get("type")
        if f_type == "string":
            return formula_val.get("string", "")
        elif f_type == "number":
            return formula_val.get("number")
        elif f_type == "boolean":
            return formula_val.get("boolean")
        elif f_type == "date":
            d = formula_val.get("date")
            return d.get("start") if d else None
        return str(formula_val)
        
    return None

def fetch_daily_studies(target_date_str):
    """Récupère les sessions d'études pour la date cible."""
    response = query_database(
        database_id=config.DATABASE_STUDIES,
        filter_obj={
            "property": "Date",
            "date": {
                "equals": target_date_str
            }
        }
    )
    
    studies = []
    for page in response.get("results", []):
        props = page.get("properties", {})
        matiere = get_prop_value(props, "Matiére") or get_prop_value(props, "Matière")
        session_type = get_prop_value(props, "Type")
        
        note_raw = get_prop_value(props, "Note") or get_prop_value(props, "Note sur 20")
        note = None
        if note_raw is not None:
            try:
                note_str = str(note_raw).split('/')[0].strip()
                if note_str:
                    note = float(note_str)
            except ValueError:
                note = note_raw
                
        studies.append({
            "matiere": matiere or "Non renseignée",
            "type": session_type or "Non renseigné",
            "note": note
        })
    return studies

def fetch_daily_expenses(target_date_str):
    """Récupère les dépenses pour la date cible."""
    response = query_database(
        database_id=config.DATABASE_EXPENSES,
        filter_obj={
            "property": "Date",
            "date": {
                "equals": target_date_str
            }
        }
    )
    
    expenses = []
    for page in response.get("results", []):
        props = page.get("properties", {})
        depense = get_prop_value(props, "Dépense")
        categorie = get_prop_value(props, "Catégorie")
        
        # Le montant est saisi en RMB dans "Montant (RMB 🇨🇳)"
        montant_raw = get_prop_value(props, "Montant (RMB 🇨🇳)") or get_prop_value(props, "Montant")
        montant = 0.0
        if montant_raw is not None:
            try:
                montant = float(str(montant_raw).replace(",", ".").strip())
            except ValueError:
                pass
                
        # La conversion en DH est automatique via la formule "En Dirham 🇲🇦"
        montant_dh_raw = get_prop_value(props, "En Dirham 🇲🇦")
        montant_dh = 0.0
        if montant_dh_raw is not None:
            try:
                # La formule retourne "137.0 DH", on extrait le nombre
                montant_dh = float(str(montant_dh_raw).replace("DH", "").replace(",", ".").strip())
            except ValueError:
                pass
                
        expenses.append({
            "depense": depense or "Dépense sans nom",
            "categorie": categorie or "Autre",
            "montant_rmb": montant,
            "montant_dh": montant_dh
        })
    return expenses

def fetch_daily_income(target_date_str):
    """Récupère les revenus pour la date cible."""
    response = query_database(
        database_id=config.DATABASE_INCOME,
        filter_obj={
            "property": "Date",
            "date": {
                "equals": target_date_str
            }
        }
    )
    
    incomes = []
    for page in response.get("results", []):
        props = page.get("properties", {})
        # "Entrée" (titre) contient le montant en RMB
        entree_raw = get_prop_value(props, "Entrée")
        montant_rmb = 0.0
        source = entree_raw or "Source inconnue"
        if entree_raw is not None:
            try:
                montant_rmb = float(str(entree_raw).replace(",", ".").strip())
            except ValueError:
                pass
        
        # La conversion en DH est automatique via la formule "En Dirham 🇲🇦"
        montant_dh_raw = get_prop_value(props, "En Dirham 🇲🇦")
        montant_dh = 0.0
        if montant_dh_raw is not None:
            try:
                montant_dh = float(str(montant_dh_raw).replace("DH", "").replace(",", ".").strip())
            except ValueError:
                pass
                
        incomes.append({
            "source": source,
            "montant_rmb": montant_rmb,
            "montant_dh": montant_dh
        })
    return incomes

def fetch_daily_health(target_date_str):
    """Récupère les données santé & nutrition pour la date cible."""
    response = query_database(
        database_id=config.DATABASE_HEALTH,
        filter_obj={
            "property": "Jour",
            "title": {
                "equals": target_date_str
            }
        }
    )
    
    results = response.get("results", [])
    if not results:
        return None
        
    props = results[0].get("properties", {})
    
    sommeil_raw = get_prop_value(props, "Sommeil")
    sommeil = sommeil_raw
    if isinstance(sommeil_raw, str):
        try:
            sommeil = float(sommeil_raw.replace("h", "").strip())
        except ValueError:
            pass
            
    repas = get_prop_value(props, "Repas")
    sport = get_prop_value(props, "Sport")
    
    return {
        "jour": target_date_str,
        "sommeil": sommeil,
        "repas": repas or "Non renseigné",
        "sport": sport or "Aucun"
    }

def fetch_daily_plan(target_date_str):
    """Récupère le plan du jour pour la date cible."""
    try:
        response = query_database(
            database_id=config.DATABASE_PLAN,
            filter_obj={
                "property": "Jour",
                "date": {
                    "equals": target_date_str
                }
            }
        )
        
        plan_items = []
        for page in response.get("results", []):
            props = page.get("properties", {})
            objectif = get_prop_value(props, "Objectif")
            categorie = get_prop_value(props, "Catégorie")
            priorite = get_prop_value(props, "Priorité")
            fait = get_prop_value(props, "Fait") or False
            resultat = get_prop_value(props, "Résultat")
            diagnostic = get_prop_value(props, "🧠 Diagnostic") or []
            ressenti = get_prop_value(props, "😊 Ressenti")
            impact = get_prop_value(props, "🎯 Impact")
            
            # Pour la compatibilité ascendante, si le Résultat select est coché comme réussi,
            # ou si la checkbox "Fait" est cochée, on considère la tâche faite.
            if resultat == "✅ Réussie":
                fait = True
            elif resultat == "❌ Échouée":
                fait = False
            
            plan_items.append({
                "objectif": objectif or "Sans titre",
                "categorie": categorie or "Autre",
                "priorite": priorite or "Basse",
                "fait": fait,
                "resultat": resultat or "Non spécifié",
                "diagnostic": diagnostic,
                "ressenti": ressenti or "Non spécifié",
                "impact": impact or "Non spécifié"
            })
        return plan_items
    except Exception as e:
        print(f"[ATTENTION] Impossible de récupérer le plan du jour : {e}")
        return []



def compute_plan_stats(plan_items):
    """Calcule le nombre d'objectifs faits, le total et le pourcentage de réussite."""
    if not plan_items:
        return {
            "faits": 0,
            "total": 0,
            "pourcentage": 0
        }
    
    faits = sum(1 for item in plan_items if item["fait"])
    total = len(plan_items)
    pourcentage = round((faits / total) * 100) if total > 0 else 0
    return {
        "faits": faits,
        "total": total,
        "pourcentage": pourcentage
    }


def fetch_monthly_stats():
    """
    Récupère les statistiques agrégées du mois en cours depuis toutes les bases de données.
    Retourne un dictionnaire avec les stats clés pour le dashboard des parents.
    """
    from datetime import datetime, timezone, timedelta
    
    utc_now = datetime.now(timezone.utc)
    china_now = utc_now + timedelta(hours=8)
    
    # Premier jour du mois en cours
    first_day = china_now.replace(day=1).strftime("%Y-%m-%d")
    today = china_now.strftime("%Y-%m-%d")
    
    stats = {
        "derniere_note": None,
        "derniere_note_sur20": None,
        "derniere_mention": None,
        "derniere_matiere": None,
        "nb_sessions_mois": 0,
        "total_depenses_rmb": 0.0,
        "total_depenses_dh": 0.0,
        "nb_depenses_mois": 0,
        "total_revenus_rmb": 0.0,
        "total_revenus_dh": 0.0,
        "nb_revenus_mois": 0,
        "derniere_sante": None,
    }
    
    # --- Études du mois ---
    try:
        response = query_database(
            database_id=config.DATABASE_STUDIES,
            filter_obj={
                "property": "Date",
                "date": {
                    "on_or_after": first_day
                }
            }
        )
        results = response.get("results", [])
        stats["nb_sessions_mois"] = len(results)
        
        # Trouver la dernière note (la plus récente)
        latest_date = None
        for page in results:
            props = page.get("properties", {})
            date_val = get_prop_value(props, "Date")
            note_raw = get_prop_value(props, "Note")
            
            if note_raw and str(note_raw).strip():
                if latest_date is None or (date_val and date_val >= latest_date):
                    latest_date = date_val
                    try:
                        note_num = float(str(note_raw).replace(",", ".").strip())
                        stats["derniere_note"] = note_num
                        stats["derniere_note_sur20"] = round(note_num / 5, 2)
                        stats["derniere_matiere"] = get_prop_value(props, "Matiére")
                        
                        # Déterminer la mention
                        if note_num >= 90:
                            stats["derniere_mention"] = "A — Excellent (优秀)"
                        elif note_num >= 80:
                            stats["derniere_mention"] = "B — Très bien (良好)"
                        elif note_num >= 70:
                            stats["derniere_mention"] = "C — Bien (中等)"
                        elif note_num >= 60:
                            stats["derniere_mention"] = "D — Passable (及格)"
                        else:
                            stats["derniere_mention"] = "F — Échec (不及格)"
                    except ValueError:
                        pass
    except Exception as e:
        print(f"[ATTENTION] Erreur lors de la récupération des études du mois : {e}")
    
    # --- Dépenses du mois ---
    try:
        response = query_database(
            database_id=config.DATABASE_EXPENSES,
            filter_obj={
                "property": "Date",
                "date": {
                    "on_or_after": first_day
                }
            }
        )
        results = response.get("results", [])
        stats["nb_depenses_mois"] = len(results)
        
        for page in results:
            props = page.get("properties", {})
            montant_raw = get_prop_value(props, "Montant (RMB 🇨🇳)") or get_prop_value(props, "Montant")
            if montant_raw:
                try:
                    stats["total_depenses_rmb"] += float(str(montant_raw).replace(",", ".").strip())
                except ValueError:
                    pass
            
            dh_raw = get_prop_value(props, "En Dirham 🇲🇦")
            if dh_raw:
                try:
                    stats["total_depenses_dh"] += float(str(dh_raw).replace("DH", "").replace(",", ".").strip())
                except ValueError:
                    pass
    except Exception as e:
        print(f"[ATTENTION] Erreur lors de la récupération des dépenses du mois : {e}")
    
    # --- Revenus du mois ---
    try:
        response = query_database(
            database_id=config.DATABASE_INCOME,
            filter_obj={
                "property": "Date",
                "date": {
                    "on_or_after": first_day
                }
            }
        )
        results = response.get("results", [])
        stats["nb_revenus_mois"] = len(results)
        
        for page in results:
            props = page.get("properties", {})
            entree_raw = get_prop_value(props, "Entrée")
            if entree_raw:
                try:
                    stats["total_revenus_rmb"] += float(str(entree_raw).replace(",", ".").strip())
                except ValueError:
                    pass
            
            dh_raw = get_prop_value(props, "En Dirham 🇲🇦")
            if dh_raw:
                try:
                    stats["total_revenus_dh"] += float(str(dh_raw).replace("DH", "").replace(",", ".").strip())
                except ValueError:
                    pass
    except Exception as e:
        print(f"[ATTENTION] Erreur lors de la récupération des revenus du mois : {e}")
    
    # --- Dernière entrée Santé ---
    try:
        response = query_database(
            database_id=config.DATABASE_HEALTH,
            filter_obj=None  # Récupérer toutes les entrées
        )
        results = response.get("results", [])
        if results:
            # Prendre la dernière entrée
            last_health = results[-1]
            props = last_health.get("properties", {})
            sommeil_raw = get_prop_value(props, "Sommeil")
            repas = get_prop_value(props, "Repas")
            sport = get_prop_value(props, "Sport")
            stats["derniere_sante"] = {
                "sommeil": sommeil_raw or "?",
                "repas": repas or "Non renseigné",
                "sport": sport or "Aucun"
            }
    except Exception as e:
        print(f"[ATTENTION] Erreur lors de la récupération de la santé : {e}")
    
    return stats

def make_progress_bar(score, humeur):
    """Génère un indicateur de progression visuel sous forme d'émojis."""
    total_blocks = 10
    filled = int(round((score / 100.0) * total_blocks))
    empty = total_blocks - filled
    char = "🟢" if humeur == "Vert" else ("🟡" if humeur == "Orange" else "🔴")
    bar = char * filled + "⚪" * empty
    return f"{bar} {score}%"

def create_callout_block(title, content, emoji, color):
    """Crée la structure d'un bloc encadré (Callout) coloré avec icône."""
    return {
        "object": "block",
        "type": "callout",
        "callout": {
            "rich_text": [
                {
                    "type": "text",
                    "text": {
                        "content": f"{title}\n",
                        "link": None
                    },
                    "annotations": {
                        "bold": True
                    }
                },
                {
                    "type": "text",
                    "text": {
                        "content": content,
                        "link": None
                    }
                }
            ],
            "icon": {
                "type": "emoji",
                "emoji": emoji
            },
            "color": color
        }
    }

def create_columns_2(block_left, block_right):
    """Crée une mise en page à 2 colonnes dans Notion."""
    return {
        "object": "block",
        "type": "column_list",
        "column_list": {
            "children": [
                {
                    "object": "block",
                    "type": "column",
                    "column": {
                        "children": [block_left]
                    }
                },
                {
                    "object": "block",
                    "type": "column",
                    "column": {
                        "children": [block_right]
                    }
                }
            ]
        }
    }

def create_columns_3(block_left, block_mid, block_right):
    """Crée une mise en page à 3 colonnes dans Notion."""
    return {
        "object": "block",
        "type": "column_list",
        "column_list": {
            "children": [
                {
                    "object": "block",
                    "type": "column",
                    "column": {
                        "children": [block_left]
                    }
                },
                {
                    "object": "block",
                    "type": "column",
                    "column": {
                        "children": [block_mid]
                    }
                },
                {
                    "object": "block",
                    "type": "column",
                    "column": {
                        "children": [block_right]
                    }
                }
            ]
        }
    }

def create_daily_report(date_str, score, humeur, resume, etudes, finances, sante, conseil):
    """
    Crée une nouvelle page dans la base de données Notion "Rapports Parents"
    avec une mise en page riche (cartes colorées, colonnes, barre de progression).
    """
    ds_id = get_data_source_id(config.DATABASE_REPORTS)
    
    # 1. En-tête principal de la journée (Jauge de progression)
    progress_str = make_progress_bar(score, humeur)
    header_content = (
        f"Score de Productivité : {score}/100\n"
        f"Progression : {progress_str}\n"
        f"Humeur générale : {humeur} " + ("🟢" if humeur == "Vert" else ("🟡" if humeur == "Orange" else "🔴"))
    )
    
    header_color = "green_background" if humeur == "Vert" else ("orange_background" if humeur == "Orange" else "red_background")
    header_emoji = "🏆" if score >= 80 else ("💪" if score >= 50 else "🛌")
    
    header_block = create_callout_block(
        title=f"✨ Rapport Quotidien de Rayane - {date_str} ✨",
        content=header_content,
        emoji=header_emoji,
        color=header_color
    )
    
    # 2. Résumé de la journée et conseil de l'IA (2 colonnes)
    resume_block = create_callout_block(
        title="🌟 Résumé de ma journée",
        content=resume,
        emoji="📝",
        color="gray_background"
    )
    
    conseil_block = create_callout_block(
        title="💡 Conseil de l'IA",
        content=conseil,
        emoji="💡",
        color="blue_background"
    )
    
    columns_summary = create_columns_2(resume_block, conseil_block)
    
    # 3. Séparateur
    divider_block = {
        "object": "block",
        "type": "divider",
        "divider": {}
    }
    
    # 4. Détails des 3 catégories (3 colonnes)
    etudes_block = create_callout_block(
        title="📚 Mes Études",
        content=etudes,
        emoji="📚",
        color="default"
    )
    
    finances_block = create_callout_block(
        title="💰 Mes Finances",
        content=finances,
        emoji="💳",
        color="yellow_background"
    )
    
    sante_block = create_callout_block(
        title="🍏 Santé & Nutrition",
        content=sante,
        emoji="🍏",
        color="purple_background"
    )
    
    columns_details = create_columns_3(etudes_block, finances_block, sante_block)
    
    # Construction de la liste des blocs enfants
    blocks = [
        header_block,
        {
            "object": "block",
            "type": "paragraph",
            "paragraph": {"rich_text": []}
        },  # Ligne vide pour aérer
        columns_summary,
        divider_block,
        columns_details
    ]
    
    new_page_data = {
        "parent": {"type": "data_source_id", "data_source_id": ds_id},
        "properties": {
            "Date": {
                "title": [
                    {
                        "type": "text",
                        "text": {"content": f"Rapport du {date_str}"}
                    }
                ]
            },
            "Score de Productivité": {
                "number": score
            },
            "Humeur": {
                "select": {
                    "name": humeur
                }
            }
        },
        "children": blocks
    }
    
    response = notion.pages.create(**new_page_data)
    return response.get("id")

def split_text_for_notion(text, max_len=1800):
    """
    Découpe une longue chaîne de caractères en morceaux de max_len pour l'API Notion.
    """
    chunks = []
    for i in range(0, len(text), max_len):
        chunks.append({
            "type": "text",
            "text": {
                "content": text[i:i+max_len]
            }
        })
    return chunks

def update_or_create_parent_status_callout(score, humeur, resume, etudes, finances, sante, conseil, plan_items=None):
    """
    Met à jour (ou crée) les 3 zones d'affichage sur la page principale 'Nouvelles de Rayane' :
    - Zone A : Callout principal simplifié (optimisé mobile)
    - Zone B : Toggle 'Plan du Jour' dépliable avec objectifs en cases à cocher
    - Zone C : Bloc Quote 'Résumé IA + Conseil' séparé
    """
    page_id = "2337b78bada180e08944c25e95553f5f"  # ID de la page 'Nouvelles de Rayane'

    from datetime import datetime, timedelta, timezone
    utc_now = datetime.now(timezone.utc)
    china_now = utc_now + timedelta(hours=8)
    morocco_now = utc_now + timedelta(hours=1)

    monthly = fetch_monthly_stats()

    # --- Préparation des données ---
    china_time = china_now.strftime('%H:%M')
    morocco_time = morocco_now.strftime('%H:%M')
    china_hour = china_now.hour
    sleep_status = "💤 Dort" if (china_hour >= 23 or china_hour < 7) else "☀️ Éveillé"
    humeur_emoji = "🟢" if humeur == "Vert" else ("🟡" if humeur == "Orange" else "🔴")

    if monthly["derniere_note"] is not None:
        etudes_note = f"{monthly['derniere_note_sur20']:.1f}/20"
        etudes_matiere = monthly.get('derniere_matiere', '')
        etudes_mention = monthly.get('derniere_mention', '')
    else:
        etudes_note = "N/A"
        etudes_matiere = ""
        etudes_mention = ""

    solde_rmb = monthly["total_revenus_rmb"] - monthly["total_depenses_rmb"]
    solde_dh = monthly["total_revenus_dh"] - monthly["total_depenses_dh"]
    solde_emoji = "✅" if solde_rmb >= 0 else "⚠️"

    s = monthly["derniere_sante"]
    health_sleep = f"{s['sommeil']}h" if s and s.get('sommeil') is not None else "N/A"
    health_repas = s['repas'] if s else "N/A"
    health_sport = s['sport'] if s else "N/A"

    dep_str = f"-{monthly['total_depenses_rmb']:.0f} ¥ (-{monthly['total_depenses_dh']:.0f} DH)" if monthly["nb_depenses_mois"] > 0 else "0 ¥ (0 DH)"
    rev_str = f"+{monthly['total_revenus_rmb']:.0f} ¥ (+{monthly['total_revenus_dh']:.0f} DH)" if monthly["nb_revenus_mois"] > 0 else "0 ¥ (0 DH)"
    sol_str = f"{solde_rmb:+.0f} ¥ ({solde_dh:+.0f} DH)"

    def _rt(text, bold=False, italic=False, color="default"):
        return {
            "type": "text",
            "text": {"content": text},
            "annotations": {"bold": bold, "italic": italic, "color": color}
        }

    def _para(*segments):
        return {
            "object": "block",
            "type": "paragraph",
            "paragraph": {"rich_text": list(segments)}
        }

    def _divider():
        return {"object": "block", "type": "divider", "divider": {}}

    # --- ZONE A : Blocs enfants du Callout ---
    callout_children = [
        _para(
            _rt("🕐 🇨🇳 Nanjing : ", bold=True),
            _rt(f"{china_time} ({sleep_status})"),
            _rt("  •  🇲🇦 Maroc : ", bold=True),
            _rt(morocco_time)
        ),
        _divider(),
        _para(
            _rt("🌟 Productivité : ", bold=True),
            _rt(f"{score}/100"),
            _rt("  •  Humeur : ", bold=True),
            _rt(f"{humeur_emoji} {humeur}")
        ),
        _para(
            _rt(f"📚 Études : Dernière note : {etudes_note}" + (f" ({etudes_matiere})" if etudes_matiere else "") + f"  •  Sessions ce mois : {monthly['nb_sessions_mois']}")
        ),
        _para(
            _rt("💰 Solde mensuel : ", bold=True),
            _rt(f"{sol_str}  •  Dépenses : {dep_str}  •  Revenus : {rev_str}")
        ),
        _para(
            _rt("🏥 Santé : ", bold=True),
            _rt(f"Sommeil : {health_sleep}  •  Repas : {health_repas}  •  Sport : {health_sport}")
        ),
        _divider(),
        _para(
            _rt(f"☁️ Akatsuki Portal v2.2 — Mis à jour le {morocco_now.strftime('%d/%m/%Y à %H:%M')} (Heure Maroc)\n", italic=True, color="gray"),
            _rt("🔄 Prochaine transition : 00:00 (Nanjing 🇨🇳) | 17:00 (Maroc 🇲🇦)", italic=True, color="gray")
        )
    ]



    # --- Recherche des blocs existants ---
    callout_id = None
    toggle_id = None
    quote_id = None

    try:
        response = notion.blocks.children.list(block_id=page_id)
        for block in response.get("results", []):
            b_type = block.get("type")
            b_id = block.get("id")
            
            if b_type == "callout":
                rt = block["callout"].get("rich_text", [])
                text_content = "".join([t.get("plain_text", "") for t in rt])
                if "Statut de Rayane" in text_content or "Akatsuki Portal" in text_content or "Nanjing" in text_content:
                    callout_id = b_id
            elif b_type == "toggle":
                rt = block["toggle"].get("rich_text", [])
                text_content = "".join([t.get("plain_text", "") for t in rt])
                if "Plan du Jour" in text_content or "📋 Plan" in text_content:
                    toggle_id = b_id
            elif b_type == "quote":
                rt = block["quote"].get("rich_text", [])
                text_content = "".join([t.get("plain_text", "") for t in rt])
                if "Pour plus de détail" not in text_content:
                    quote_id = b_id
    except Exception as e:
        print(f"[ATTENTION] Impossible de lister les blocs de la page principale : {e}")
        return False

    # --- ZONE A : Mise à jour ou création du Callout ---
    if callout_id:
        print(f"[INFO] Callout existant trouvé ({callout_id}). Mise à jour...")
        try:
            existing_children = notion.blocks.children.list(block_id=callout_id)
            for child in existing_children.get("results", []):
                try:
                    notion.blocks.delete(block_id=child.get("id"))
                except Exception:
                    pass
        except Exception:
            pass

        try:
            notion.blocks.update(
                block_id=callout_id,
                callout={
                    "rich_text": [
                        _rt("📢 Statut de Rayane — ", bold=True),
                        _rt(f"{sleep_status}  •  {score}/100  •  {humeur_emoji} {humeur}")
                    ],
                    "icon": {"type": "emoji", "emoji": "☁️"},
                    "color": "gray_background"
                }
            )
            notion.blocks.children.append(block_id=callout_id, children=callout_children)
        except Exception as e:
            print(f"[ERREUR] Lors de la mise à jour du callout : {e}")
            return False
    else:
        print("[INFO] Aucun callout trouvé. Création d'un nouveau...")
        try:
            res = notion.blocks.children.append(
                block_id=page_id,
                children=[
                    {
                        "object": "block",
                        "type": "callout",
                        "callout": {
                            "rich_text": [
                                _rt("📢 Statut de Rayane — ", bold=True),
                                _rt(f"{sleep_status}  •  {score}/100  •  {humeur_emoji} {humeur}")
                            ],
                            "icon": {"type": "emoji", "emoji": "☁️"},
                            "color": "gray_background",
                            "children": callout_children
                        }
                    }
                ]
            )
            callout_id = res.get("results", [{}])[0].get("id")
        except Exception as e:
            print(f"[ERREUR] Lors de la création du callout : {e}")
            return False

    # --- ZONE B : Mise à jour ou création du Toggle ---
    stats = compute_plan_stats(plan_items)
    if plan_items:
        toggle_title = f"📋 Plan du Jour — {stats['faits']}/{stats['total']} objectifs ✅ ({stats['pourcentage']}%)"
        toggle_children = []
        for item in plan_items:
            toggle_children.append({
                "object": "block",
                "type": "to_do",
                "to_do": {
                    "rich_text": [
                        _rt(f"[{item['categorie']}] {item['objectif']} ({item['priorite']})")
                    ],
                    "checked": item["fait"]
                }
            })
    else:
        toggle_title = "📋 Plan du Jour — Aucun plan défini aujourd'hui"
        toggle_children = [
            _para(_rt("Aucun objectif n'a été planifié pour ce jour.", italic=True, color="gray"))
        ]

    if toggle_id:
        print(f"[INFO] Toggle existant trouvé ({toggle_id}). Mise à jour...")
        try:
            existing_children = notion.blocks.children.list(block_id=toggle_id)
            for child in existing_children.get("results", []):
                try:
                    notion.blocks.delete(block_id=child.get("id"))
                except Exception:
                    pass
        except Exception:
            pass

        try:
            notion.blocks.update(
                block_id=toggle_id,
                toggle={
                    "rich_text": [_rt(toggle_title, bold=True)]
                }
            )
            notion.blocks.children.append(block_id=toggle_id, children=toggle_children)
        except Exception as e:
            print(f"[ERREUR] Lors de la mise à jour du toggle : {e}")
    else:
        print("[INFO] Aucun toggle trouvé. Création...")
        try:
            res = notion.blocks.children.append(
                block_id=page_id,
                children=[
                    {
                        "object": "block",
                        "type": "toggle",
                        "toggle": {
                            "rich_text": [_rt(toggle_title, bold=True)],
                            "children": toggle_children
                        }
                    }
                ],
                after=callout_id
            )
            toggle_id = res.get("results", [{}])[0].get("id")
        except Exception as e:
            print(f"[ERREUR] Lors de la création du toggle : {e}")

    # --- ZONE C : Mise à jour ou création de la Quote ---
    # Agréger les diagnostics de la journée
    obstacles = set()
    succes = set()
    if plan_items:
        for item in plan_items:
            diag_list = item.get("diagnostic", [])
            for d in diag_list:
                if d == "✨ Tout s'est bien passé":
                    succes.add(d)
                else:
                    obstacles.add(d)

    obstacles_str = ", ".join(list(obstacles)) if obstacles else "Aucun obstacle signalé"
    succes_str = ", ".join(list(succes)) if succes else "Aucun levier signalé"

    quote_rich_text = [
        _rt("🧠 DIAGNOSTIC DE PRODUCTIVITÉ GLOBALE\n", bold=True),
        _rt("──────────────────────────────────────────────────\n", color="gray"),
        _rt("🎯 Bilan : ", bold=True),
        _rt(f"{resume}\n\n", italic=True),
        
        _rt("📈 Points Forts : ", bold=True, color="green"),
        _rt(f"{succes_str}\n", italic=True),
        
        _rt("⚠️ Points de Vigilance : ", bold=True, color="red"),
        _rt(f"{obstacles_str}\n\n", italic=True),
        
        _rt("💡 Conseil Action : ", bold=True, color="orange"),
        _rt(f"{conseil}\n", italic=True)
    ]


    if quote_id:
        print(f"[INFO] Quote existante trouvée ({quote_id}). Mise à jour...")
        try:
            notion.blocks.update(
                block_id=quote_id,
                quote={
                    "rich_text": quote_rich_text
                }
            )
        except Exception as e:
            print(f"[ERREUR] Lors de la mise à jour de la quote : {e}")
    else:
        print("[INFO] Aucune quote trouvée. Création...")
        try:
            notion.blocks.children.append(
                block_id=page_id,
                children=[
                    {
                        "object": "block",
                        "type": "quote",
                        "quote": {
                            "rich_text": quote_rich_text
                        }
                    }
                ],
                after=toggle_id
            )
        except Exception as e:
            print(f"[ERREUR] Lors de la création de la quote : {e}")


def fetch_page_ids_by_date(database_id, date_prop, date_str, is_title_date=False):
    """Récupère les IDs des pages d'une base de données filtrées par date."""
    if is_title_date:
        filter_obj = {
            "property": date_prop,
            "title": {
                "equals": date_str
            }
        }
    else:
        filter_obj = {
            "property": date_prop,
            "date": {
                "equals": date_str
            }
        }
        
    try:
        response = query_database(database_id, filter_obj)
        return [page.get("id") for page in response.get("results", [])]
    except Exception as e:
        print(f"[ATTENTION] Impossible de récupérer les IDs de pages pour la base {database_id}: {e}")
        return []

def clear_page_blocks(page_id):
    """Supprime tous les blocs enfants d'une page."""
    try:
        response = notion.blocks.children.list(block_id=page_id)
        for block in response.get("results", []):
            try:
                notion.blocks.delete(block_id=block.get("id"))
            except Exception as e:
                pass
    except Exception as e:
        print(f"[ATTENTION] Impossible de lister les blocs pour nettoyage : {e}")

def sync_dashboard_gallery_card(date_str, score, humeur, resume, etudes, finances, sante, conseil):
    """
    Crée ou met à jour la carte dans le Tableau de Bord (vue Galerie)
    avec les relations et les blocs détaillés.
    """
    db_id = config.DATABASE_REPORTS
    from datetime import datetime, timedelta, timezone
    
    # 1. Récupération des IDs des pages d'aujourd'hui dans les bases sources
    print("[INFO] Récupération des IDs des pages sources...")
    studies_ids = fetch_page_ids_by_date(config.DATABASE_STUDIES, "Date", date_str)
    expenses_ids = fetch_page_ids_by_date(config.DATABASE_EXPENSES, "Date", date_str)
    income_ids = fetch_page_ids_by_date(config.DATABASE_INCOME, "Date", date_str)
    health_ids = fetch_page_ids_by_date(config.DATABASE_HEALTH, "Jour", date_str, is_title_date=True)
    
    # 2. Calculer l'heure actuelle en Chine (UTC+8) et au Maroc (UTC+1)
    utc_now = datetime.now(timezone.utc)
    china_now = utc_now + timedelta(hours=8)
    morocco_now = utc_now + timedelta(hours=1)
    
    china_time_str = china_now.strftime("%H:%M")
    morocco_time_str = morocco_now.strftime("%H:%M")
    
    china_hour = china_now.hour
    if china_hour >= 23 or china_hour < 7:
        sleep_status = "💤 Dort"
    else:
        sleep_status = "☀️ Actif"
        
    # 3. Vérifier si une page existe déjà pour cette date dans le Tableau de Bord
    page_id = None
    try:
        response = query_database(
            database_id=db_id,
            filter_obj={
                "property": "Name",
                "title": {
                    "equals": f"Rapport du {date_str}"
                }
            }
        )
        results = response.get("results", [])
        if results:
            page_id = results[0].get("id")
    except Exception as e:
        print(f"[ATTENTION] Recherche échouée : {e}")
        
    # 4. Préparer les propriétés de la page
    properties = {
        "Name": {
            "title": [
                {
                    "type": "text",
                    "text": {"content": f"Rapport du {date_str}"}
                }
            ]
        },
        "Productivité": {
            "number": score
        },
        "Humeur": {
            "select": {
                "name": humeur
            }
        },
        "Résumé": {
            "rich_text": [
                {
                    "type": "text",
                    "text": {"content": resume}
                }
            ]
        },
        "Conseil du jour": {
            "rich_text": [
                {
                    "type": "text",
                    "text": {"content": conseil}
                }
            ]
        },
        "Heure de Chine": {
            "rich_text": [
                {
                    "type": "text",
                    "text": {"content": f"{china_time_str} ({sleep_status})"}
                }
            ]
        },
        "Heure du Maroc": {
            "rich_text": [
                {
                    "type": "text",
                    "text": {"content": morocco_time_str}
                }
            ]
        },
        "Études": {
            "relation": [{"id": pid} for pid in studies_ids]
        },
        "Dépenses": {
            "relation": [{"id": pid} for pid in expenses_ids]
        },
        "Revenus": {
            "relation": [{"id": pid} for pid in income_ids]
        },
        "Santé": {
            "relation": [{"id": pid} for pid in health_ids]
        }
    }
    
    # 5. Générer les blocs détaillés du corps de page
    progress_bar_str = make_progress_bar(score, humeur)
    header_block = create_callout_block(
        title=f"✨ Rapport du {date_str} ✨",
        content=f"Score : {score}/100 ({progress_bar_str})\nChine : {china_time_str} | Maroc : {morocco_time_str}",
        emoji="🟢" if humeur == "Vert" else ("🟡" if humeur == "Orange" else "🔴"),
        color="green_background" if humeur == "Vert" else ("orange_background" if humeur == "Orange" else "red_background")
    )
    
    resume_block = create_callout_block(
        title="📝 Résumé de la journée",
        content=resume,
        emoji="📝",
        color="gray_background"
    )
    
    conseil_block = create_callout_block(
        title="💡 Conseil du jour",
        content=conseil,
        emoji="💡",
        color="blue_background"
    )
    
    columns_summary = create_columns_2(resume_block, conseil_block)
    
    divider_block = {"object": "block", "type": "divider", "divider": {}}
    
    etudes_block = create_callout_block("📚 Mes Études", etudes, "📚", "default")
    finances_block = create_callout_block("💰 Mes Finances", finances, "💳", "yellow_background")
    sante_block = create_callout_block("🍏 Santé & Nutrition", sante, "🍏", "purple_background")
    
    columns_details = create_columns_3(etudes_block, finances_block, sante_block)
    
    blocks = [
        header_block,
        {"object": "block", "type": "paragraph", "paragraph": {"rich_text": []}},
        columns_summary,
        divider_block,
        columns_details
    ]
    
    # 6. Création ou mise à jour de la page
    if page_id:
        print(f"[INFO] Mise à jour de la carte existante (ID: {page_id})...")
        notion.pages.update(page_id=page_id, properties=properties)
        # Nettoyer et réécrire le contenu de la page pour les détails
        clear_page_blocks(page_id)
        notion.blocks.children.append(block_id=page_id, children=blocks)
        print("[SUCCÈS] Carte Galerie mise à jour avec ses détails !")
        return page_id
    else:
        print("[INFO] Création d'une nouvelle carte Galerie...")
        ds_id = get_data_source_id(db_id)
        response = notion.pages.create(
            parent={"type": "data_source_id", "data_source_id": ds_id},
            properties=properties,
            children=blocks
        )
        new_page_id = response.get("id")
        print(f"[SUCCÈS] Nouvelle carte créée ! (ID: {new_page_id})")
        return new_page_id

