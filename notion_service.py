from datetime import date
from notion_client import Client
import config
import json

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
    
    elif prop_type == "status":
        status_val = prop.get("status")
        return status_val.get("name") if status_val else None
    
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

import time

PLAN_CACHE = {}
OBJECTIVE_DETAILS_CACHE = {}
CACHE_DURATION = 3  # Cache de 3 secondes pour protéger l'API Notion

def clear_objective_details_cache():
    """Vide le cache des détails d'objectifs."""
    OBJECTIVE_DETAILS_CACHE.clear()

def fetch_daily_plan(target_date_str):
    """Version avec cache pour éviter les requêtes trop fréquentes vers Notion (polling)."""
    now = time.time()
    if target_date_str in PLAN_CACHE:
        cached_data, timestamp = PLAN_CACHE[target_date_str]
        if now - timestamp < CACHE_DURATION:
            return cached_data
            
    # Récupération réelle si non présent ou expiré
    data = fetch_daily_plan_raw(target_date_str)
    PLAN_CACHE[target_date_str] = (data, now)
    return data

def fetch_daily_plan_raw(target_date_str):
    """Récupère directement le plan du jour depuis l'API de Notion."""
    try:
        response = query_database(
            database_id=config.DATABASE_PLAN,
            filter_obj={
                "property": "Date",
                "date": {
                    "equals": target_date_str
                }
            }
        )
        
        plan_items = []
        for page in response.get("results", []):
            props = page.get("properties", {})
            objectif = get_prop_value(props, "Task")
            categorie = get_prop_value(props, "Catégorie")
            priorite = get_prop_value(props, "Priorité")
            fait = get_prop_value(props, "Fait") or False
            resultat = get_prop_value(props, "Résultat")
            diagnostic = get_prop_value(props, "🧠 Diagnostic") or []
            ressenti = get_prop_value(props, "😊 Ressenti")
            impact = get_prop_value(props, "🎯 Impact")
            status = get_prop_value(props, "Status") or "🟢 Actif"
            
            if resultat == "✅ Réussie":
                fait = True
            elif resultat == "❌ Échouée":
                fait = False
            
            plan_items.append({
                "id": page.get("id"),
                "objectif": objectif or "Sans titre",
                "categorie": categorie or "Autre",
                "priorite": priorite or "Basse",
                "fait": fait,
                "status": status,
                "resultat": resultat or "Non spécifié",
                "diagnostic": diagnostic,
                "ressenti": ressenti or "Non spécifié",
                "impact": impact or "Non spécifié"
            })
        return plan_items
    except Exception as e:
        print(f"[ATTENTION] Impossible de récupérer le plan du jour : {e}")
        return []

def validate_plan_task_properties(properties):
    """Valide les propriétés d'une tâche avant l'envoi à Notion pour éviter les erreurs de schéma."""
    allowed_categories = ['📚 Études', '🏃 Sport', '🏥 Santé', '👥 Social', '🧑 Personnel', '💳 Finances', '🏠 Maison']
    allowed_priorities = ['🔴 Haute', '🟡 Moyenne', '🟢 Basse']
    allowed_statuses = ['🟢 Actif', '🗄️ Archivé', '♻️ Replanifier']
    
    validated = {}
    for key, val in properties.items():
        if key == "Catégorie":
            if val in allowed_categories:
                validated[key] = val
            else:
                print(f"[VALIDATION] [WARN] Catégorie '{val}' invalide. Ignorée.")
        elif key == "Priorité":
            if val in allowed_priorities:
                validated[key] = val
            else:
                print(f"[VALIDATION] [WARN] Priorité '{val}' invalide. Ignorée.")
        elif key == "Status":
            if val in allowed_statuses:
                validated[key] = val
            else:
                print(f"[VALIDATION] [WARN] Status '{val}' invalide. Ignorée.")
        else:
            validated[key] = val
    return validated

# ═══════════════════════════════════════════════════════════════════════════
# Notion Default Template Cloning Cache & Logic
# ═══════════════════════════════════════════════════════════════════════════

TEMPLATE_CACHE = {
    "icon": None,
    "blocks": None
}

FALLBACK_TEMPLATE_BLOCKS = [
    {
        "type": "callout",
        "callout": {
            "rich_text": [
                {
                    "type": "text",
                    "text": {"content": "Please complete your end-of-day review .\n("},
                    "annotations": {"bold": True}
                },
                {
                    "type": "text",
                    "text": {"content": "Diagnostic"},
                    "annotations": {"bold": True, "color": "red"}
                },
                {
                    "type": "text",
                    "text": {"content": "  ·  "},
                    "annotations": {"bold": True, "color": "gray"}
                },
                {
                    "type": "text",
                    "text": {"content": "Key Takeaways"},
                    "annotations": {"bold": True, "color": "red"}
                },
                {
                    "type": "text",
                    "text": {"content": "  ·  "},
                    "annotations": {"bold": True, "color": "red"}
                },
                {
                    "type": "text",
                    "text": {"content": "tomorrow’s action"},
                    "annotations": {"bold": True}
                },
                {
                    "type": "text",
                    "text": {"content": ")"}
                }
            ],
            "icon": {"type": "icon", "icon": {"name": "exit", "color": "red"}},
            "color": "gray_background"
        }
    },
    {"type": "divider", "divider": {}},
    {
        "type": "image",
        "image": {
            "type": "external",
            "external": {
                "url": "https://files.catbox.moe/jje8qb.png"
            }
        }
    },
    {
        "type": "quote",
        "quote": {
            "rich_text": [
                {
                    "type": "text",
                    "text": {"content": "Qu'est-ce qui m'a empêché d'être efficace ?"},
                    "annotations": {"bold": True, "color": "red_background"}
                }
            ]
        }
    },
    {"type": "paragraph", "paragraph": {"rich_text": []}},
    {"type": "divider", "divider": {}},
    {
        "type": "image",
        "image": {
            "type": "external",
            "external": {
                "url": "https://files.catbox.moe/zfmnri.png"
            }
        }
    },
    {
        "type": "quote",
        "quote": {
            "rich_text": [
                {
                    "type": "text",
                    "text": {"content": "Quelle est la leçon principale ?"},
                    "annotations": {"bold": True, "color": "red_background"}
                }
            ]
        }
    },
    {"type": "paragraph", "paragraph": {"rich_text": []}},
    {"type": "divider", "divider": {}},
    {
        "type": "image",
        "image": {
            "type": "external",
            "external": {
                "url": "https://files.catbox.moe/wans4d.png"
            }
        }
    },
    {
        "type": "quote",
        "quote": {
            "rich_text": [
                {
                    "type": "text",
                    "text": {"content": "Que vais-je faire différemment la prochaine fois ?"},
                    "annotations": {"bold": True, "color": "blue_background"}
                }
            ]
        }
    },
    {"type": "paragraph", "paragraph": {"rich_text": []}}
]

def remove_null_keys_recursive(d):
    if not isinstance(d, dict):
        return d
    cleaned = {}
    for k, v in d.items():
        if v is None:
            continue
        if isinstance(v, dict):
            cleaned[k] = remove_null_keys_recursive(v)
        elif isinstance(v, list):
            cleaned[k] = [remove_null_keys_recursive(item) if isinstance(item, dict) else item for item in v]
        else:
            cleaned[k] = v
    return cleaned

def clean_cloned_block(block, img_idx=0):
    btype = block.get("type")
    cleaned = {"type": btype}
    
    bdata = block.get(btype, {})
    cleaned_data = json.loads(json.dumps(bdata))
    cleaned_data = remove_null_keys_recursive(cleaned_data)
    
    if btype == "image":
        catbox_urls = [
            "https://files.catbox.moe/jje8qb.png",
            "https://files.catbox.moe/zfmnri.png",
            "https://files.catbox.moe/wans4d.png"
        ]
        img_url = catbox_urls[img_idx] if img_idx < len(catbox_urls) else catbox_urls[0]
        cleaned_data["type"] = "external"
        cleaned_data["external"] = {
            "url": img_url
        }
        if "file" in cleaned_data:
            del cleaned_data["file"]
        img_idx += 1
            
    cleaned[btype] = cleaned_data
    return cleaned, img_idx

def get_template_from_database():
    """
    Tente de charger dynamiquement l'icône et les blocs du template de référence.
    Renvoie un tuple (icon, blocks).
    """
    if TEMPLATE_CACHE["blocks"] is not None:
        return TEMPLATE_CACHE["icon"], TEMPLATE_CACHE["blocks"]
        
    ref_page_id = None
    
    # 1. Chercher d'abord une tâche nommée "ChimPan"
    try:
        results = query_database(
            database_id=config.DATABASE_PLAN,
            filter_obj={
                "property": "Task",
                "title": {
                    "equals": "ChimPan"
                }
            }
        )
        pages = results.get("results", [])
        if pages:
            ref_page_id = pages[0].get("id")
    except Exception as e:
        print(f"[TEMPLATE] Recherche par titre 'ChimPan' échouée : {e}")
        
    # 2. Si pas trouvé, chercher la page modèle spécifique
    if not ref_page_id:
        ref_page_id = "3a37b78b-ada1-80b5-9f90-c410e6f30fdb"

    # 3. Si on a trouvé une page de référence, on récupère son icône et ses blocs
    if ref_page_id:
        try:
            page_obj = notion.pages.retrieve(page_id=ref_page_id)
            ref_icon = page_obj.get("icon")
            
            cleaned_icon = {
                "type": "external",
                "external": {
                    "url": "https://files.catbox.moe/1nipsq.png"
                }
            }
                
            # Récupérer les blocs
            children = notion.blocks.children.list(block_id=ref_page_id, page_size=100)
            blocks_raw = children.get("results", [])
            
            cleaned_blocks = []
            img_idx = 0
            for b in blocks_raw:
                cleaned_b, img_idx = clean_cloned_block(b, img_idx)
                cleaned_blocks.append(cleaned_b)
                
            TEMPLATE_CACHE["icon"] = cleaned_icon
            TEMPLATE_CACHE["blocks"] = cleaned_blocks
            return cleaned_icon, cleaned_blocks
        except Exception as e:
            print(f"[TEMPLATE] [ERREUR] Impossible de charger le template de référence : {e}")
            
    # 4. Fallback si rien n'est trouvé
    print("[TEMPLATE] Utilisation de la structure de secours (fallback)")
    default_icon = {
        "type": "external",
        "external": {
            "url": "https://files.catbox.moe/1nipsq.png"
        }
    }
    return default_icon, FALLBACK_TEMPLATE_BLOCKS

def get_clean_url_path(url):
    import urllib.parse
    parsed = urllib.parse.urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}{parsed.path}"

def download_and_upload_to_catbox(s3_url):
    """
    Télécharge l'image temporaire de Notion et l'uploade sur Catbox pour avoir un lien public permanent.
    Met en cache le résultat localement dans public_url_cache.json.
    """
    import os
    import json
    import urllib.parse
    import urllib.request
    import requests
    
    cache_dir = r"c:\Users\eloua\Downloads\China incchaalah\static\uploads"
    if not os.path.exists(cache_dir):
        os.makedirs(cache_dir, exist_ok=True)
        
    cache_path = os.path.join(cache_dir, "public_url_cache.json")
    clean_key = get_clean_url_path(s3_url)
    
    # Charger le cache
    cache = {}
    if os.path.exists(cache_path):
        try:
            with open(cache_path, 'r', encoding='utf-8') as f:
                cache = json.load(f)
        except Exception:
            pass
            
    # Si déjà dans le cache, on retourne l'URL publique
    if clean_key in cache:
        print(f"[CATBOX CACHE] Trouvé dans le cache : {cache[clean_key]}")
        return cache[clean_key]
        
    # Sinon, on télécharge l'image temporairement
    try:
        parsed = urllib.parse.urlparse(s3_url)
        filename = os.path.basename(parsed.path)
        filename = urllib.parse.unquote(filename)
        if not filename:
            import uuid
            filename = f"img_{uuid.uuid4().hex}.png"
            
        local_path = os.path.join(cache_dir, filename)
        
        # Télécharger
        req = urllib.request.Request(
            s3_url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            with open(local_path, 'wb') as out_file:
                out_file.write(response.read())
                
        # Uploader sur Catbox
        with open(local_path, 'rb') as file_data:
            r = requests.post(
                'https://catbox.moe/user/api.php', 
                data={'reqtype': 'fileupload'}, 
                files={'fileToUpload': file_data},
                timeout=20
            )
            
        if r.status_code == 200 and r.text.startswith("http"):
            public_url = r.text.strip()
            print(f"[CATBOX CACHE] Image uploadée avec succès : {public_url} ✅")
            
            # Mettre à jour le cache
            cache[clean_key] = public_url
            with open(cache_path, 'w', encoding='utf-8') as f:
                json.dump(cache, f, indent=2)
                
            # Supprimer le fichier local temporaire
            try:
                os.remove(local_path)
            except Exception:
                pass
                
            return public_url
    except Exception as e:
        print(f"[CATBOX CACHE] Erreur lors de l'hébergement public : {e}")
        
    return s3_url

def clean_objective_cloned_block(block):
    btype = block.get("type")
    cleaned = {"type": btype}
    
    bdata = block.get(btype, {})
    cleaned_data = json.loads(json.dumps(bdata))
    cleaned_data = remove_null_keys_recursive(cleaned_data)
    
    if btype == "image":
        file_info = cleaned_data.get("file") or cleaned_data.get("external")
        url = file_info.get("url", "") if file_info else ""
        
        if "Diagnostic" in url or "diagnostic" in url:
            public_url = "https://iili.io/Cwh9DrB.png"
        elif "Key_Takeaways" in url or "key_takeaways" in url:
            public_url = "https://iili.io/CwhH63N.png"
        elif "tomorrows_action" in url or "Tomorrow" in url or "action" in url:
            public_url = "https://iili.io/Cwjr1lj.png"
        elif url:
            public_url = download_and_upload_to_catbox(url)
        else:
            public_url = "https://iili.io/Cwh9DrB.png"
            
        cleaned_data["type"] = "external"
        cleaned_data["external"] = {
            "url": public_url
        }
        if "file" in cleaned_data:
            del cleaned_data["file"]
                
    cleaned[btype] = cleaned_data
    return cleaned

def get_objective_template_info():
    """
    Tente de charger l'icône et les blocs du template d'objectif de référence.
    Template ID: 3927b78b-ada1-8040-a4c2-f527979f211e
    """
    ref_page_id = "3927b78b-ada1-8040-a4c2-f527979f211e"
    try:
        page_obj = notion.pages.retrieve(page_id=ref_page_id)
        ref_icon = page_obj.get("icon")
        
        cleaned_icon = None
        if ref_icon:
            if ref_icon.get("type") == "file":
                s3_url = ref_icon.get("file", {}).get("url")
                if s3_url:
                    public_icon_url = download_and_upload_to_catbox(s3_url)
                    cleaned_icon = {
                        "type": "external",
                        "external": {
                            "url": public_icon_url
                        }
                    }
            else:
                cleaned_icon = ref_icon
                
        children = notion.blocks.children.list(block_id=ref_page_id, page_size=100)
        blocks_raw = children.get("results", [])
        
        cleaned_blocks = []
        for b in blocks_raw:
            cleaned_b = clean_objective_cloned_block(b)
            cleaned_blocks.append(cleaned_b)
            
        return cleaned_icon, cleaned_blocks
    except Exception as e:
        print(f"[TEMPLATE OBJECTIF] Impossible de charger le template par ID ({e}), recherche par titre vide...")
        try:
            results = query_database(config.DATABASE_OBJECTIFS)
            pages = results.get("results", [])
            for p in pages:
                props = p.get("properties", {})
                title = ""
                goal = props.get("Goal", {})
                if goal.get("title"):
                    title = "".join(t.get("plain_text", "") for t in goal["title"])
                if not title.strip():
                    pid = p.get("id")
                    page_obj = notion.pages.retrieve(page_id=pid)
                    ref_icon = page_obj.get("icon")
                    cleaned_icon = None
                    if ref_icon:
                        if ref_icon.get("type") == "file":
                            s3_url = ref_icon.get("file", {}).get("url")
                            if s3_url:
                                public_icon_url = download_and_upload_to_catbox(s3_url)
                                cleaned_icon = {
                                    "type": "external",
                                    "external": {
                                        "url": public_icon_url
                                    }
                                }
                        else:
                            cleaned_icon = ref_icon
                            
                    children = notion.blocks.children.list(block_id=pid, page_size=100)
                    blocks_raw = children.get("results", [])
                    cleaned_blocks = []
                    for b in blocks_raw:
                        cleaned_b = clean_objective_cloned_block(b)
                        cleaned_blocks.append(cleaned_b)
                    return cleaned_icon, cleaned_blocks
        except Exception as ex:
            print(f"[TEMPLATE OBJECTIF] Fallback recherche échoué : {ex}")
            
        return None, []

def get_task_template_info():
    """
    Tente de charger l'icône et les blocs du template de TÂCHE (Plan du jour) de référence.
    Template ID: 3a37b78b-ada1-80b5-9f90-c410e6f30fdb
    """
    ref_page_id = "3a37b78b-ada1-80b5-9f90-c410e6f30fdb"
    try:
        cleaned_icon = {
            "type": "external",
            "external": {
                "url": "https://iili.io/Cwh2KEx.png"
            }
        }
                
        children = notion.blocks.children.list(block_id=ref_page_id, page_size=100)
        blocks_raw = children.get("results", [])
        
        cleaned_blocks = []
        for b in blocks_raw:
            cleaned_b = clean_objective_cloned_block(b)
            cleaned_blocks.append(cleaned_b)
            
        return cleaned_icon, cleaned_blocks
    except Exception as e:
        print(f"[TEMPLATE TÂCHE] Impossible de charger le template par ID ({e}), recherche fallback...")
        try:
            results = query_database(config.DATABASE_PLAN)
            pages = results.get("results", [])
            for p in pages:
                props = p.get("properties", {})
                title = ""
                task_title = props.get("Task", {})
                if task_title.get("title"):
                    title = "".join(t.get("plain_text", "") for t in task_title["title"])
                if not title.strip():
                    pid = p.get("id")
                    page_obj = notion.pages.retrieve(page_id=pid)
                    ref_icon = page_obj.get("icon")
                    cleaned_icon = None
                    if ref_icon:
                        if ref_icon.get("type") == "file":
                            s3_url = ref_icon.get("file", {}).get("url")
                            if s3_url:
                                public_icon_url = download_and_upload_to_catbox(s3_url)
                                cleaned_icon = {
                                    "type": "external",
                                    "external": {
                                        "url": public_icon_url
                                    }
                                }
                        else:
                            cleaned_icon = ref_icon
                            
                    children = notion.blocks.children.list(block_id=pid, page_size=100)
                    blocks_raw = children.get("results", [])
                    cleaned_blocks = []
                    for b in blocks_raw:
                        cleaned_b = clean_objective_cloned_block(b)
                        cleaned_blocks.append(cleaned_b)
                    return cleaned_icon, cleaned_blocks
        except Exception as ex:
            print(f"[TEMPLATE TÂCHE] Fallback recherche échoué : {ex}")
            
        return None, []

def create_task_in_database(properties):
    """
    Crée une tâche avec les propriétés fournies et applique le template cloné de TÂCHE.
    Gère le fallback du parent (database_id vs data_source_id).
    """
    # Récupérer l'icône et les blocs du template de TÂCHE
    icon, template_blocks = get_task_template_info()
    
    ds_id = get_data_source_id(config.DATABASE_PLAN)
    
    # Création de la page
    try:
        response = notion.pages.create(
            parent={"type": "database_id", "database_id": config.DATABASE_PLAN},
            properties=properties,
            icon=icon
        )
    except Exception as e:
        print(f"[WARN] Création tâche dans database_id échouée ({e}), fallback avec data_source_id.")
        response = notion.pages.create(
            parent={"type": "data_source_id", "data_source_id": ds_id},
            properties=properties,
            icon=icon
        )
        
    new_page_id = response.get("id")
    
    # Ajouter les blocs enfants du template de TÂCHE
    if new_page_id and template_blocks:
        try:
            notion.blocks.children.append(block_id=new_page_id, children=template_blocks)
        except Exception as e:
            print(f"[ERREUR] Impossible d'ajouter les blocs enfants du template à la page {new_page_id} : {e}")
            
    return new_page_id

def create_plan_task(date_str, nom, categorie="🧑 Personnel", priorite="🟢 Basse", status="🟢 Actif"):
    """Crée une nouvelle tâche dans la base Plan du Jour avec le template par défaut."""
    PLAN_CACHE.clear()  # Invalider le cache car une tâche est ajoutée
    clear_objective_details_cache()
    
    # Validation pré-action
    props_to_validate = {"Catégorie": categorie, "Priorité": priorite}
    validated = validate_plan_task_properties(props_to_validate)
    categorie = validated.get("Catégorie", "🧑 Personnel")
    priorite = validated.get("Priorité", "🟢 Basse")
    
    properties = {
        "Task": {
            "title": [{"type": "text", "text": {"content": nom}}]
        },
        "Date": {
            "date": {"start": date_str}
        },
        "Catégorie": {
            "select": {"name": categorie}
        },
        "Priorité": {
            "select": {"name": priorite}
        },
        "Status": {
            "select": {"name": status}
        },
        "Fait": {
            "checkbox": False
        }
    }
    return create_task_in_database(properties)

def update_plan_task(page_id, updated_properties):
    """Met à jour les propriétés d'une tâche existante après validation."""
    PLAN_CACHE.clear()  # Invalider le cache
    clear_objective_details_cache()
    
    # Validation pré-action
    validated_properties = validate_plan_task_properties(updated_properties)
    formatted_props = {}
    for key, val in validated_properties.items():
        if key == "Fait":
            formatted_props["Fait"] = {"checkbox": bool(val)}
        elif key == "Status":
            formatted_props["Status"] = {"select": {"name": val}}
        elif key == "Priorité":
            formatted_props["Priorité"] = {"select": {"name": val}}
        elif key == "Catégorie":
            formatted_props["Catégorie"] = {"select": {"name": val}}
        elif key == "Résultat":
            formatted_props["Résultat"] = {"select": {"name": val}}
        elif key == "😊 Ressenti":
            formatted_props["😊 Ressenti"] = {"select": {"name": val}}
        elif key == "🎯 Impact":
            formatted_props["🎯 Impact"] = {"select": {"name": val}}
        elif key == "🧠 Diagnostic":
            if isinstance(val, list):
                formatted_props["🧠 Diagnostic"] = {"multi_select": [{"name": v} for v in val]}
            else:
                formatted_props["🧠 Diagnostic"] = {"multi_select": [{"name": val}]}
        elif key == "Objectif":
            formatted_props["Objectif"] = {"title": [{"type": "text", "text": {"content": val}}]}
        elif key == "Date":
            formatted_props["Date"] = {"date": {"start": val}}
            
    response = notion.pages.update(
        page_id=page_id,
        properties=formatted_props
    )
    return response

def delete_plan_task(page_id):
    """Archive la page (supprime la tâche) dans Notion."""
    PLAN_CACHE.clear()  # Invalider le cache
    clear_objective_details_cache()
    return notion.pages.update(page_id=page_id, archived=True)

def fetch_database_properties():
    """Récupère les options de propriétés (select/multi-select) de la base Plan du Jour."""
    try:
        db = notion.databases.retrieve(database_id=config.DATABASE_PLAN)
        data_sources = db.get("data_sources", [])
        if data_sources:
            ds_id = data_sources[0]["id"]
            ds = notion.request(path=f"data_sources/{ds_id}", method="GET")
            properties = ds.get("properties", {})
        else:
            properties = db.get("properties", {})
            
        schema = {}
        for prop_name, prop_data in properties.items():
            ptype = prop_data.get("type")
            if ptype == "select":
                options = prop_data.get("select", {}).get("options", [])
                schema[prop_name] = {
                    "type": "select",
                    "options": [{"name": o.get("name"), "color": o.get("color")} for o in options]
                }
            elif ptype == "multi_select":
                options = prop_data.get("multi_select", {}).get("options", [])
                schema[prop_name] = {
                    "type": "multi_select",
                    "options": [{"name": o.get("name"), "color": o.get("color")} for o in options]
                }
        return schema
    except Exception as e:
        print(f"[ERREUR] Lors de la récupération du schéma de la base : {e}")
        return {}

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

def update_nouvelles_de_rayane(data, photo_urls=None):
    """
    Met à jour la page 'Nouvelles de Rayane' sur Notion en préservant les bannières d'images de l'utilisateur.
    Le contenu de chaque section est inséré directement sous sa bannière d'image correspondante.
    """
    page_id = "2337b78bada180e08944c25e95553f5f"
    from datetime import datetime, timedelta, timezone

    utc_now = datetime.now(timezone.utc)
    china_now = utc_now + timedelta(hours=8)
    morocco_now = utc_now + timedelta(hours=1)

    china_time = china_now.strftime('%H:%M')
    morocco_time = morocco_now.strftime('%H:%M')
    update_time_str = morocco_now.strftime('%d/%m/%Y à %H:%M')

    date_str_fr = data.get('date_fr', morocco_now.strftime('%A %d %B %Y'))

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

    def _h3(text):
        return {
            "object": "block",
            "type": "heading_3",
            "heading_3": {"rich_text": [_rt(text, bold=True)]}
        }

    def _image_toggle(label, img_url):
        return {
            "object": "block",
            "type": "toggle",
            "toggle": {
                "rich_text": [_rt(f"📸 {label}", bold=True, italic=True, color="blue")],
                "children": [
                    {
                        "object": "block",
                        "type": "image",
                        "image": {
                            "type": "external",
                            "external": {"url": img_url}
                        }
                    }
                ]
            }
        }

    photo_urls = photo_urls or {}

    # --- 1. SOUMISSON : Préparation des blocs de chaque section ---

    # SECTION 1: SOMMEIL
    sommeil = data.get('sommeil', {})
    coucher = sommeil.get('coucher', 'N/A')
    reveil = sommeil.get('reveil', 'N/A')
    duree = sommeil.get('duree', 'N/A')
    sec_sommeil = [
        _para(
            _rt(f"Couché à : {coucher}  ·  Réveillé à : {reveil}  ·  Durée : ", italic=False),
            _rt(duree, bold=True, color="blue")
        )
    ]

    # SECTION 2: REPAS
    sec_repas = []
    repas_list = data.get('repas', [])
    if repas_list:
        for idx, r in enumerate(repas_list):
            nom = r.get('nom', 'Repas')
            desc = r.get('desc', '').strip()
            desc_text = f" : {desc}" if desc else ""
            sec_repas.append(_para(
                _rt(f"• {nom}", bold=True),
                _rt(desc_text)
            ))
            pk = f"photo_repas_{idx}"
            if pk in photo_urls and photo_urls[pk].startswith("http"):
                sec_repas.append(_image_toggle(f"Cliquez sur la flèche pour voir la photo du repas ({nom})", photo_urls[pk]))
    else:
        sec_repas.append(_para(_rt("Aucun repas renseigné aujourd'hui.", italic=True, color="gray")))

    # SECTION 3: SPORT
    sec_sport = []
    sports_list = data.get('sports', [])
    if not sports_list and data.get('sport'):
        sp = data.get('sport', {})
        if sp.get('fait'):
            sports_list = [{'nom': 'Sport', 'desc': sp.get('desc', ''), 'km': ''}]

    if sports_list:
        for idx, s in enumerate(sports_list):
            nom_s = s.get('nom', 'Activité sportive')
            km_val = s.get('km', '').strip()
            desc_s = s.get('desc', '').strip()
            
            detail_parts = []
            if km_val:
                detail_parts.append(f"{km_val} km")
            if desc_s:
                detail_parts.append(desc_s)
            
            detail_str = f" ({' · '.join(detail_parts)})" if detail_parts else ""
            sec_sport.append(_para(
                _rt("✅ ", bold=True),
                _rt(nom_s, bold=True, color="green"),
                _rt(detail_str)
            ))

            pk = f"photo_sport_{idx}"
            if pk not in photo_urls and "photo_sport" in photo_urls:
                pk = "photo_sport"
            if pk in photo_urls and photo_urls[pk].startswith("http"):
                sec_sport.append(_image_toggle(f"Cliquez sur la flèche pour voir la photo officielle ({nom_s})", photo_urls[pk]))
    else:
        sec_sport.append(_para(_rt("❌ Aucune activité sportive renseignée aujourd'hui.", color="gray")))

    # SECTION 4: BUDGET
    budget = data.get('budget', {})
    prevu = budget.get('prevu', 0)
    depense = budget.get('depense', 0)
    diff = prevu - depense
    if diff > 0:
        statut_b = f"💚 Économisé {diff:.2f} ¥"
    elif diff == 0:
        statut_b = "✅ Budget respecté"
    else:
        statut_b = f"⚠️ Dépassé de {abs(diff):.2f} ¥"

    sec_budget = [
        _para(
            _rt(f"Budget prévu : {prevu:.2f} ¥  ·  Dépensé : {depense:.2f} ¥  ·  ", bold=False),
            _rt(statut_b, bold=True)
        )
    ]

    # SECTION 5: ÉTUDES
    sec_etudes = []
    notes = data.get('notes', [])
    if notes:
        for n in notes:
            mat = n.get('matiere', 'Matière')
            t_exam = n.get('type', 'Examen')
            note_100_raw = n.get('note', '')
            try:
                n100 = float(str(note_100_raw).replace(',', '.'))
                n20 = round(n100 / 5, 2)
                
                if n100 >= 90:
                    mention = "A — Excellent (优秀)"
                elif n100 >= 80:
                    mention = "B — Très bien (良好)"
                elif n100 >= 70:
                    mention = "C — Bien (中等)"
                elif n100 >= 60:
                    mention = "D — Passable (及格)"
                else:
                    mention = "F — À travailler"

                note_txt = f"{n100:.0f}/100  ➜  {n20}/20  ({mention})"
            except (ValueError, TypeError):
                note_txt = f"{note_100_raw}/100"

            sec_etudes.append(_para(
                _rt(f"• {mat} ", bold=True),
                _rt(f"({t_exam}) : "),
                _rt(note_txt, bold=True, color="blue")
            ))
    else:
        sec_etudes.append(_para(_rt("Aucune note enregistrée aujourd'hui.", italic=True, color="gray")))

    # --- 2. GESTION ET PROTECTION DES BANNIÈRES SUR NOTION ---
    try:
        existing = notion.blocks.children.list(block_id=page_id).get("results", [])
        
        # Trouver le Callout d'en-tête et le paragraphe d'horaire s'ils existent
        callout_id = None
        time_para_id = None
        banner_images = []

        for b in existing:
            b_type = b.get("type")
            b_id = b.get("id")
            if b_type == "callout" and not callout_id:
                callout_id = b_id
            elif b_type == "paragraph":
                rt = b.get("paragraph", {}).get("rich_text", [])
                txt = "".join([t.get("plain_text", "") for t in rt])
                if ("Nanjing" in txt or "Agadir" in txt) and not time_para_id:
                    time_para_id = b_id
            elif b_type == "image":
                banner_images.append(b_id)

        # Mettre à jour le Callout et l'horaire si présents
        if callout_id:
            try:
                notion.blocks.update(
                    block_id=callout_id,
                    callout={
                        "rich_text": [_rt(f"📋 Rapport du {date_str_fr}\nMis à jour le {update_time_str} (Heure Maroc)", bold=True)],
                        "icon": {"type": "emoji", "emoji": "📢"},
                        "color": "blue_background"
                    }
                )
            except Exception as e:
                print(f"[ATTENTION] Màj callout header : {e}")

        if time_para_id:
            try:
                notion.blocks.update(
                    block_id=time_para_id,
                    paragraph={
                        "rich_text": [
                            _rt("🕐 🇨🇳 Nanjing : ", bold=True),
                            _rt(china_time),
                            _rt("  •  🇲🇦 Agadir : ", bold=True),
                            _rt(morocco_time)
                        ]
                    }
                )
            except Exception as e:
                print(f"[ATTENTION] Màj time paragraph : {e}")

        # Si les 5 bannières d'images existent sur la page :
        if len(banner_images) >= 5:
            print(f"[SUIVIE] 5 Bannières d'images trouvées sur la page. Insertion directe sous chaque bannière ✅")

            banner_sommeil = banner_images[0]
            banner_repas   = banner_images[1]
            banner_sport   = banner_images[2]
            banner_budget  = banner_images[3]
            banner_etudes  = banner_images[4]

            banner_set = set(banner_images[:5])

            # Supprimer SEULEMENT les anciens blocs de contenu (entre les bannières)
            for b in existing:
                b_id = b.get("id")
                b_type = b.get("type")
                if b_id in banner_set or b_id == callout_id or b_id == time_para_id or b_type == "divider":
                    continue
                try:
                    notion.blocks.delete(block_id=b_id)
                except Exception:
                    pass

            # Insérer le contenu de chaque section directement sous sa bannière !
            notion.blocks.children.append(block_id=page_id, children=sec_sommeil, after=banner_sommeil)
            notion.blocks.children.append(block_id=page_id, children=sec_repas, after=banner_repas)
            notion.blocks.children.append(block_id=page_id, children=sec_sport, after=banner_sport)
            notion.blocks.children.append(block_id=page_id, children=sec_budget, after=banner_budget)
            notion.blocks.children.append(block_id=page_id, children=sec_etudes, after=banner_etudes)

            print("[SUIVIE] Mise à jour sous bannières Notion réussie ✅")
            return True

        else:
            print("[INFO] Bannières manquantes. Réécriture classique...")
            # Nettoyage et réécriture globale classique si pas 5 bannières
            for b in existing:
                try:
                    notion.blocks.delete(block_id=b.get("id"))
                except Exception:
                    pass

            full_children = [
                {
                    "object": "block",
                    "type": "callout",
                    "callout": {
                        "rich_text": [_rt(f"📋 Rapport du {date_str_fr}\nMis à jour le {update_time_str} (Heure Maroc)", bold=True)],
                        "icon": {"type": "emoji", "emoji": "📢"},
                        "color": "blue_background"
                    }
                },
                {"object": "block", "type": "divider", "divider": {}},
                _para(_rt("🕐 🇨🇳 Nanjing : ", bold=True), _rt(china_time), _rt("  •  🇲🇦 Agadir : ", bold=True), _rt(morocco_time)),
                {"object": "block", "type": "divider", "divider": {}},
                _h3("😴 Sommeil"),
                *sec_sommeil,
                _h3("🍽️ Repas du jour"),
                *sec_repas,
                _h3("🏃 Activités Physiques & Sport"),
                *sec_sport,
                _h3("💰 Budget du Jour"),
                *sec_budget,
                _h3("📚 Études & Examens"),
                *sec_etudes
            ]

            notion.blocks.children.append(block_id=page_id, children=full_children)
            return True

    except Exception as e:
        print(f"[ERREUR] Écriture page Notion 'Nouvelles de Rayane' : {e}")
        import traceback
        traceback.print_exc()
        return False


def add_souvenir_to_notion(data, photo_urls=None):
    """
    Ajoute un nouveau souvenir sous le Callout 'Moments & Voyages' sur Notion,
    avec gestion multi-paragraphes pour les longues descriptions et mise à jour de la date.
    """
    page_id = "2337b78bada180e08944c25e95553f5f"
    from datetime import datetime, timedelta, timezone

    utc_now = datetime.now(timezone.utc)
    morocco_now = utc_now + timedelta(hours=1)
    update_time_str = morocco_now.strftime('%d/%m/%Y à %H:%M')

    titre = data.get('titre', 'Souvenir').strip()
    date_val = data.get('date', morocco_now.strftime('%d/%m/%Y')).strip()
    histoire = data.get('histoire', '').strip()

    # Extraction des URLs de photos publiques
    photo_list = []
    if isinstance(photo_urls, dict):
        for k, v in photo_urls.items():
            if isinstance(v, str) and v.strip():
                url = v.strip()
                if not url.startswith('http'):
                    url = f"http://127.0.0.1:5000{url}"
                photo_list.append(url)
    elif isinstance(photo_urls, list):
        for v in photo_urls:
            if isinstance(v, str) and v.strip():
                url = v.strip()
                if not url.startswith('http'):
                    url = f"http://127.0.0.1:5000{url}"
                photo_list.append(url)

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

    # Blocs à insérer pour ce souvenir
    new_blocks = []

    # Paragraphe Titre + Date
    new_blocks.append(_para(
        _rt("📸 ", bold=True),
        _rt(f"{titre} ", bold=True, color="blue"),
        _rt(f"· {date_val}", italic=True, color="gray")
    ))

    # Récit multi-lignes (séparé en paragraphes propres sur Notion)
    if histoire:
        lines = histoire.split('\n')
        for idx_l, line in enumerate(lines):
            line_str = line.strip()
            if line_str:
                prefix = "💬 " if idx_l == 0 else ""
                new_blocks.append(_para(
                    _rt(prefix, bold=True),
                    _rt(line_str, italic=True)
                ))

    # Toggle Album Photos (si photos présentes)
    if photo_list:
        children_images = []
        for url in photo_list:
            children_images.append({
                "object": "block",
                "type": "image",
                "image": {
                    "type": "external",
                    "external": {"url": url}
                }
            })
        
        new_blocks.append({
            "object": "block",
            "type": "toggle",
            "toggle": {
                "rich_text": [_rt(f"📸 Album Photo ({titre}) — {len(photo_list)} photo(s) (Cliquez pour afficher)", bold=True, color="blue")],
                "children": children_images
            }
        })

    # Ligne de séparation
    new_blocks.append({"object": "block", "type": "divider", "divider": {}})

    try:
        existing = notion.blocks.children.list(block_id=page_id).get("results", [])
        
        mv_callout_id = None
        mv_divider_id = None

        for idx, b in enumerate(existing):
            b_type = b.get("type")
            b_id = b.get("id")
            if b_type == "callout":
                rt = b.get("callout", {}).get("rich_text", [])
                txt = "".join([t.get("plain_text", "") for t in rt])
                if "Moments" in txt or "Voyages" in txt:
                    mv_callout_id = b_id
                    if idx + 1 < len(existing) and existing[idx + 1].get("type") == "divider":
                        mv_divider_id = existing[idx + 1].get("id")

        if mv_callout_id:
            try:
                notion.blocks.update(
                    block_id=mv_callout_id,
                    callout={
                        "rich_text": [_rt(f"Moments & Voyages — Mis à jour le {update_time_str} (Heure Maroc)", bold=True)],
                        "icon": {"type": "emoji", "emoji": "👍"},
                        "color": "blue_background"
                    }
                )
            except Exception as e:
                print(f"[ATTENTION] Màj Callout Moments & Voyages: {e}")

        target_after = mv_divider_id or mv_callout_id
        if target_after:
            notion.blocks.children.append(block_id=page_id, children=new_blocks, after=target_after)
            print(f"[SUIVIE] Souvenir '{titre}' inséré avec succès sous Moments & Voyages ✅")
            return True
        else:
            callout_block = {
                "object": "block",
                "type": "callout",
                "callout": {
                    "rich_text": [_rt(f"Moments & Voyages — Mis à jour le {update_time_str} (Heure Maroc)", bold=True)],
                    "icon": {"type": "emoji", "emoji": "👍"},
                    "color": "blue_background"
                }
            }
            notion.blocks.children.append(block_id=page_id, children=[callout_block, {"object": "block", "type": "divider", "divider": {}}, *new_blocks])
            return True

    except Exception as e:
        print(f"[ERREUR] Ajout souvenir Notion : {e}")
        import traceback
        traceback.print_exc()
        return False


def add_voyage_to_notion(data, photo_urls=None):
    """
    Ajoute un voyage complet avec ses étapes personnalisées (Jour 1, Jour 2, etc.) sur Notion sous 'Moments & Voyages'.
    Prend en compte la gestion multi-paragraphes des récits et les photos par étape.
    """
    page_id = "2337b78bada180e08944c25e95553f5f"
    from datetime import datetime, timedelta, timezone

    utc_now = datetime.now(timezone.utc)
    morocco_now = utc_now + timedelta(hours=1)
    update_time_str = morocco_now.strftime('%d/%m/%Y à %H:%M')

    titre = data.get('titre', 'Voyage').strip()
    dates_val = data.get('dates', morocco_now.strftime('%d/%m/%Y')).strip()
    mode = data.get('mode', 'direct')
    etapes = data.get('etapes', [])

    photo_urls = photo_urls or {}

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

    statut_badge = "🔴 VOYAGE EN DIRECT" if mode == 'direct' else "🏁 CARNET RECAPITULATIF"

    new_blocks = []

    # En-tête Voyage
    new_blocks.append(_para(
        _rt("✈️ ", bold=True),
        _rt(f"{titre} ", bold=True, color="blue"),
        _rt(f"· {dates_val}  ", italic=True, color="gray"),
        _rt(f"[{statut_badge}]", bold=True, color="green")
    ))

    # Parcourir chaque étape du voyage
    if etapes:
        for idx, etape in enumerate(etapes):
            nom_e = etape.get('nom', f'Étape {idx+1}').strip()
            desc_e = etape.get('desc', '').strip()

            if nom_e:
                new_blocks.append(_para(
                    _rt(f"📌 {nom_e}", bold=True, color="purple")
                ))

            if desc_e:
                lines = desc_e.split('\n')
                for line in lines:
                    if line.strip():
                        new_blocks.append(_para(_rt(line.strip(), italic=True)))

            pk = f"photo_etape_{idx}"
            etape_photos = []
            if isinstance(photo_urls, dict):
                for k, v in photo_urls.items():
                    if (k == pk or k.startswith(f"{pk}_") or f"etape_{idx}" in k) and isinstance(v, str) and v.strip():
                        url = v.strip()
                        if not url.startswith('http'):
                            url = f"http://127.0.0.1:5000{url}"
                        etape_photos.append(url)
            elif isinstance(photo_urls, list):
                for v in photo_urls:
                    if isinstance(v, str) and v.strip():
                        url = v.strip()
                        if not url.startswith('http'):
                            url = f"http://127.0.0.1:5000{url}"
                        etape_photos.append(url)

            if etape_photos:
                children_images = []
                for url in etape_photos:
                    children_images.append({
                        "object": "block",
                        "type": "image",
                        "image": {
                            "type": "external",
                            "external": {"url": url}
                        }
                    })
                new_blocks.append({
                    "object": "block",
                    "type": "toggle",
                    "toggle": {
                        "rich_text": [_rt(f"📸 Album Photo ({nom_e}) — {len(etape_photos)} photo(s)", bold=True, color="blue")],
                        "children": children_images
                    }
                })

    new_blocks.append({"object": "block", "type": "divider", "divider": {}})

    try:
        existing = notion.blocks.children.list(block_id=page_id).get("results", [])
        
        mv_callout_id = None
        mv_divider_id = None

        for idx_b, b in enumerate(existing):
            b_type = b.get("type")
            b_id = b.get("id")
            if b_type == "callout":
                rt = b.get("callout", {}).get("rich_text", [])
                txt = "".join([t.get("plain_text", "") for t in rt])
                if "Moments" in txt or "Voyages" in txt:
                    mv_callout_id = b_id
                    if idx_b + 1 < len(existing) and existing[idx_b + 1].get("type") == "divider":
                        mv_divider_id = existing[idx_b + 1].get("id")

        if mv_callout_id:
            try:
                notion.blocks.update(
                    block_id=mv_callout_id,
                    callout={
                        "rich_text": [_rt(f"Moments & Voyages — Mis à jour le {update_time_str} (Heure Maroc)", bold=True)],
                        "icon": {"type": "emoji", "emoji": "👍"},
                        "color": "blue_background"
                    }
                )
            except Exception:
                pass

        target_after = mv_divider_id or mv_callout_id
        if target_after:
            notion.blocks.children.append(block_id=page_id, children=new_blocks, after=target_after)
            print(f"[SUIVIE] Voyage '{titre}' inséré avec succès sur Notion ✅")
            return True
        else:
            callout_block = {
                "object": "block",
                "type": "callout",
                "callout": {
                    "rich_text": [_rt(f"Moments & Voyages — Mis à jour le {update_time_str} (Heure Maroc)", bold=True)],
                    "icon": {"type": "emoji", "emoji": "👍"},
                    "color": "blue_background"
                }
            }
            notion.blocks.children.append(block_id=page_id, children=[callout_block, {"object": "block", "type": "divider", "divider": {}}, *new_blocks])
            return True

    except Exception as e:
        print(f"[ERREUR] Ajout voyage Notion : {e}")
        import traceback
        traceback.print_exc()
        return False





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


# ═══════════════════════════════════════════════════════════════════════════
DAYS_IN_PROGRESS_PROPERTIES_ENSURED = False

def _ensure_days_in_progress_properties(obj_db_id: str) -> bool:
    """
    S'assure que les propriétés 'Date début En cours' (date) et 'Jours en cours' (formule)
    existent dans la base 🎯 Objectifs.
    """
    try:
        r = _requests.get(
            f"https://api.notion.com/v1/databases/{obj_db_id}",
            headers=_NOTION_HEADERS(),
        )
        existing = r.json().get("properties", {})
        
        properties_payload = {}
        if "Date début En cours" not in existing:
            print("[Formula] Création de la propriété 'Date début En cours'...")
            properties_payload["Date début En cours"] = {"date": {}}
            
        if "Jours en cours" not in existing:
            print("[Formula] Création de la propriété 'Jours en cours'...")
            properties_payload["Jours en cours"] = {
                "formula": {
                    "expression": "if(or(prop(\"Status\") == \"En cours\", prop(\"Status\") == \"In progress\"), dateBetween(now(), prop(\"Date début En cours\"), \"days\"), toNumber(empty()))"
                }
            }
            
        if properties_payload:
            patch = _requests.patch(
                f"https://api.notion.com/v1/databases/{obj_db_id}",
                headers=_NOTION_HEADERS(),
                json={"properties": properties_payload},
            )
            if patch.status_code == 200:
                print("[Formula] Propriétés d'objectifs créées avec succès ✅")
                return True
            else:
                print(f"[Formula] Erreur création propriétés: {patch.text[:200]}")
                return False
        return True
    except Exception as e:
        print(f"[Formula] Erreur dans _ensure_days_in_progress_properties: {e}")
        return False

def fetch_objectifs():
    """
    Récupère tous les objectifs depuis la base 🎯 Objectifs.
    Retourne une liste de dictionnaires avec les propriétés clés,
    y compris l'effort (rollup), la progression (formula), et les relations.
    """
    global DAYS_IN_PROGRESS_PROPERTIES_ENSURED
    if not DAYS_IN_PROGRESS_PROPERTIES_ENSURED:
        if _ensure_days_in_progress_properties(config.DATABASE_OBJECTIFS):
            DAYS_IN_PROGRESS_PROPERTIES_ENSURED = True
            
    try:
        response = query_database(database_id=config.DATABASE_OBJECTIFS)
        objectifs = []
        for page in response.get("results", []):
            props = page.get("properties", {})
            
            # Titre de l'objectif
            title = get_prop_value(props, "Goal") or "Sans titre"
            
            # Checkbox: objectif marqué comme atteint manuellement
            atteint = get_prop_value(props, "Checkbox") or False
            
            # Effort rollup (% des tâches cochées)
            effort_raw = get_prop_value(props, "⚡ Effort")
            effort = 0
            if effort_raw is not None:
                try:
                    effort = round(float(effort_raw))
                except (ValueError, TypeError):
                    effort = 0
            
            # Progression formula
            prog_val = get_prop_value(props, "Progression")
            if isinstance(prog_val, (int, float)):
                if prog_val <= 1.0:
                    progression = f"{round(prog_val * 100)}%"
                else:
                    progression = f"{round(prog_val)}%"
            else:
                progression = str(prog_val) if prog_val is not None else "0%"
            
            # Relations
            tasks_rel = props.get("📋 Plan du Jour", {}).get("relation", [])
            projets_rel = props.get("🧩 Projets ", {}).get("relation", [])
            parent_rel = props.get("Parent", {}).get("relation", [])
            parent_id = parent_rel[0].get("id") if parent_rel else None
            
            # Due Date
            due_date = get_prop_value(props, "Due Date")
            
            # Status
            status = get_prop_value(props, "Status") or "Not started"
            if "pause" in status.lower():
                status = "Paused"
            
            # Catégorie
            categorie = get_prop_value(props, "Catégorie")
            
            # Date de création
            date_creation = get_prop_value(props, "Date")
            
            # Jours en cours (formule)
            jours_en_cours = get_prop_value(props, "Jours en cours")
            
            # Lire/Backfiller la Date début En cours pour le calcul de durée
            date_debut_en_cours = get_prop_value(props, "Date début En cours")
            if status in ["En cours", "In progress", "🟡 En cours"] and not date_debut_en_cours:
                from datetime import datetime
                today_str = datetime.now().strftime("%Y-%m-%d")
                try:
                    notion.pages.update(
                        page_id=page.get("id"),
                        properties={"Date début En cours": {"date": {"start": today_str}}}
                    )
                    date_debut_en_cours = today_str
                    print(f"[Formula] Backfill Date début En cours pour l'objectif '{title}' ✅")
                except Exception as ex:
                    print(f"[Formula] Erreur backfill pour {title}: {ex}")
            elif status not in ["En cours", "In progress", "🟡 En cours"] and date_debut_en_cours:
                try:
                    notion.pages.update(
                        page_id=page.get("id"),
                        properties={"Date début En cours": {"date": None}}
                    )
                    date_debut_en_cours = None
                    print(f"[Formula] Nettoyage Date début En cours pour l'objectif '{title}' ✅")
                except Exception as ex:
                    print(f"[Formula] Erreur nettoyage pour {title}: {ex}")
                    
            is_unstructured = False
            page_id = page.get("id")
            if page_id in OBJECTIVE_DETAILS_CACHE:
                is_unstructured = OBJECTIVE_DETAILS_CACHE[page_id].get("unstructured", False)
            else:
                try:
                    full_data = fetch_objective_full_data(page_id)
                    is_unstructured = full_data.get("unstructured", False)
                except Exception as ex:
                    print(f"[WARN] Error pre-fetching full data for unstructured check: {ex}")
                    is_unstructured = False

            objectifs.append({
                "id": page_id,
                "title": title,
                "atteint": atteint,
                "effort": effort,
                "progression": progression,
                "nb_tasks": len(tasks_rel),
                "projet_ids": [r.get("id") for r in projets_rel],
                "parent_id": parent_id,
                "due_date": due_date,
                "status": status,
                "category": categorie,
                "date_creation": date_creation,
                "jours_en_cours": jours_en_cours,
                "unstructured": is_unstructured
            })
        return objectifs
    except Exception as e:
        print(f"[ERREUR] Impossible de récupérer les objectifs : {e}")
        return []


def parse_task_priority_coef(text):
    """
    Détermine le coefficient de priorité d'une tâche L2.
    Priorité Haute = 3 (🔴, ⭐, (Haute), [Haute], (H), [H])
    Priorité Moyenne = 2 (défaut)
    Priorité Basse = 1 (🟢, (Basse), [Basse], (B), [B])
    """
    text_lower = text.lower()
    if any(p in text_lower for p in ["(haute)", "[haute]", "haute priority", "priorité haute", "coef 3", "coef: 3", "(h)", "[h]", "🔴", "⭐"]):
        return 3
    elif any(p in text_lower for p in ["(basse)", "[basse]", "basse priority", "priorité basse", "coef 1", "coef: 1", "(b)", "[b]", "🟢"]):
        return 1
    return 2

def parse_indicator_weight(text):
    """
    Détermine le poids / coefficient d'un indicateur L1 par rapport à l'objectif.
    Ex: (Poids 3), [Coef 2], (3), [2]. Par défaut = 1.
    """
    import re
    text_lower = text.lower()
    m = re.search(r'[\(\[](?:poids|coef)\s*(\d+)[\)\]]', text_lower)
    if m:
        return int(m.group(1))
    m = re.search(r'[\(\[]\s*(\d+)\s*[\)\]]\s*$', text_lower)
    if m:
        return int(m.group(1))
    return 1

def fetch_objective_full_data(objective_id, nocache=False):
    """
    Récupère toutes les données détaillées d'un objectif :
    - Critères de réussite
    - Indicateurs (cases à cocher de niveau 1)
    - Tâches (cases à cocher de niveau 2, c'est-à-dire enfants de l'indicateur)
    Calcule la progression de l'objectif (0% à 100%) selon la logique OKR pondérée :
    - La progression de l'indicateur est la moyenne pondérée de ses tâches enfants (Règle A).
    - La progression de l'objectif est la moyenne pondérée de ses indicateurs (Règle B).
    """
    if not nocache and objective_id in OBJECTIVE_DETAILS_CACHE:
        return OBJECTIVE_DETAILS_CACHE[objective_id]
        
    try:
        # Récupérer les tâches de la base de données liée pour lire les vraies priorités
        task_priority_map = {}
        task_checked_map = {}
        try:
            filter_obj = {
                "property": "🎯 Objectifs :",
                "relation": {
                    "contains": objective_id
                }
            }
            db_response = query_database(database_id=config.DATABASE_PLAN, filter_obj=filter_obj)
            db_results = db_response.get("results", [])
            for page in db_results:
                props = page.get("properties", {})
                t_title = "".join(t.get("plain_text", "") for t in props.get("Task", {}).get("title", [])).strip()
                p_val = props.get("Priorité", {}).get("select", {})
                p_name = p_val.get("name") if p_val else ""
                is_checked = props.get("Fait", {}).get("checkbox", False)
                
                if t_title:
                    key = t_title.lower()
                    task_priority_map[key] = p_name
                    task_checked_map[key] = is_checked
        except Exception as dbe:
            print(f"[WARN] Impossible de requêter les tâches liées depuis la base de données : {dbe}")

        response = notion.blocks.children.list(block_id=objective_id)
        results = response.get("results", [])
        
        critere_blocks = []
        indicators = []
        
        quote_count = 0
        current_section = None
        
        for block in results:
            btype = block.get("type")
            
            if btype == "quote":
                quote_count += 1
                if quote_count == 1:
                    current_section = "critere"
                    continue
                elif quote_count == 2:
                    current_section = "indicateurs"
                    continue
                else:
                    current_section = None
                    
            content = ""
            if btype == "paragraph":
                content = "".join(t.get("plain_text", "") for t in block.get("paragraph", {}).get("rich_text", []))
            elif btype == "bulleted_list_item":
                content = "• " + "".join(t.get("plain_text", "") for t in block.get("bulleted_list_item", {}).get("rich_text", []))
            elif btype == "numbered_list_item":
                content = "1. " + "".join(t.get("plain_text", "") for t in block.get("numbered_list_item", {}).get("rich_text", []))
            elif btype == "quote":
                content = "".join(t.get("plain_text", "") for t in block.get("quote", {}).get("rich_text", []))
            elif btype in ["heading_1", "heading_2", "heading_3"]:
                content = "".join(t.get("plain_text", "") for t in block.get(btype, {}).get("rich_text", []))
            
            content = content.strip()
            
            if current_section == "critere":
                if content and not ("quel est votre" in content.lower() or "quel sont vos" in content.lower()):
                    critere_blocks.append(content)
            elif current_section == "indicateurs":
                if btype == "to_do":
                    todo = block.get("to_do", {})
                    text = "".join(t.get("plain_text", "") for t in todo.get("rich_text", []))
                    if text.strip() and not ("quel sont vos" in text.lower()):
                        indicators.append({
                            "id": block.get("id"),
                            "text": text.strip(),
                            "block_checked": todo.get("checked", False),
                            "tasks": []
                        })
                        
        # Pour chaque indicateur, calculer la progression pondérée des tâches
        weighted_indicators_progress_sum = 0.0
        total_indicator_weights_sum = 0.0
        
        for ind in indicators:
            ind_text = ind["text"]
            ind_weight = parse_indicator_weight(ind_text)
            ind["weight"] = ind_weight
            
            try:
                child_response = notion.blocks.children.list(block_id=ind["id"])
                child_results = child_response.get("results", [])
                
                tasks = []
                has_db_tasks = len(task_priority_map) > 0
                for child in child_results:
                    if child.get("type") == "to_do":
                        ctodo = child.get("to_do", {})
                        ctext = "".join(t.get("plain_text", "") for t in ctodo.get("rich_text", []))
                        if ctext.strip():
                            key = ctext.strip().lower()
                            
                            # If task page in DATABASE_PLAN was deleted/archived in Notion, skip and clean up orphan block
                            if has_db_tasks and key not in task_priority_map:
                                try:
                                    notion.blocks.delete(block_id=child.get("id"))
                                except Exception:
                                    pass
                                continue

                            db_priority = task_priority_map.get(key)
                            
                            if db_priority:
                                if any(p in db_priority.lower() for p in ["haute", "🔴"]):
                                    coef = 3
                                elif any(p in db_priority.lower() for p in ["basse", "🟢"]):
                                    coef = 1
                                else:
                                    coef = 2
                            else:
                                coef = parse_task_priority_coef(ctext)
                                
                            is_checked = task_checked_map.get(key, ctodo.get("checked", False))
                            
                            tasks.append({
                                "id": child.get("id"),
                                "text": ctext.strip(),
                                "checked": is_checked,
                                "coef": coef
                            })
                ind["tasks"] = tasks
                
                # Déterminer la progression de l'indicateur (Règle A)
                if tasks:
                    sum_completed_coefs = sum(t["coef"] for t in tasks if t["checked"])
                    sum_total_coefs = sum(t["coef"] for t in tasks)
                    ind_progress = (sum_completed_coefs / sum_total_coefs * 100.0) if sum_total_coefs > 0 else 0.0
                    ind["checked"] = all(t["checked"] for t in tasks)
                    ind["progress"] = round(ind_progress)
                else:
                    ind["checked"] = ind["block_checked"]
                    ind["progress"] = 100 if ind["block_checked"] else 0
                
                weighted_indicators_progress_sum += ind["progress"] * ind_weight
                total_indicator_weights_sum += ind_weight
                
            except Exception as ex:
                print(f"[ERROR] fetch child blocks for indicator {ind['id']}: {ex}")
                ind["checked"] = ind["block_checked"]
                ind["progress"] = 100 if ind["block_checked"] else 0
                weighted_indicators_progress_sum += ind["progress"] * ind_weight
                total_indicator_weights_sum += ind_weight
                
        # Calculer le pourcentage de progression de l'objectif (Règle B)
        progress = 0
        if total_indicator_weights_sum > 0:
            progress = round(weighted_indicators_progress_sum / total_indicator_weights_sum)
            
        critere = "\n".join(critere_blocks) if critere_blocks else "Non spécifié"
        
        # Validité de l'objectif
        has_critere = bool(critere_blocks and critere != "Non spécifié")
        has_indicators = len(indicators) > 0
        has_started = progress > 0
        is_valid = has_critere and has_indicators and has_started
        
        # Mettre à jour la propriété de progression de la page dans Notion
        try:
            notion.pages.update(
                page_id=objective_id,
                properties={
                    "Progression": {"number": progress / 100.0}
                }
            )
        except Exception as pe:
            print(f"[WARN] Impossible de mettre à jour la progression de l'objectif {objective_id} : {pe}")
            
        # Fetch Status directly from objective page properties
        obj_status = "Not started"
        try:
            obj_page = notion.pages.retrieve(page_id=objective_id)
            obj_props = obj_page.get("properties", {})
            obj_status = get_prop_value(obj_props, "Status") or "Not started"
        except Exception as se:
            print(f"[WARN] Error fetching objective status: {se}")

        # Compute unstructured flag: true if has indicators but at least one indicator has zero tasks
        unstructured = False
        if len(indicators) > 0:
            for ind in indicators:
                if len(ind.get("tasks", [])) == 0:
                    unstructured = True
                    break

        res_data = {
            "id": objective_id,
            "critere": critere,
            "indicators": indicators,
            "progress": progress,
            "is_valid": is_valid,
            "has_critere": has_critere,
            "has_indicators": has_indicators,
            "has_started": has_started,
            "status": obj_status,
            "unstructured": unstructured
        }
        
        OBJECTIVE_DETAILS_CACHE[objective_id] = res_data
        return res_data
    except Exception as e:
        print(f"[ERROR] fetch_objective_full_data for {objective_id}: {e}")
        fallback_data = {
            "id": objective_id,
            "critere": "Non spécifié",
            "indicators": [],
            "progress": 0,
            "is_valid": False,
            "has_critere": False,
            "has_indicators": False,
            "has_started": False,
            "status": "Not started",
            "unstructured": False
        }
        return fallback_data

def link_objective_to_module(objective_id, module_id):
    """
    Associe un objectif à un module Notion en mettant à jour la relation 'Objectifs' du module.
    """
    try:
        module_page = notion.pages.retrieve(page_id=module_id)
        props = module_page.get("properties", {})
        
        relation_key = None
        current_relations = []
        for prop_key, prop_val in props.items():
            if "Objectifs" in prop_key and prop_val.get("type") == "relation":
                relation_key = prop_key
                current_relations = prop_val.get("relation", [])
                break
                
        if relation_key:
            new_relations = list(current_relations)
            if not any(r.get("id") == objective_id for r in new_relations):
                new_relations.append({"id": objective_id})
            notion.pages.update(
                page_id=module_id,
                properties={
                    relation_key: {
                        "relation": new_relations
                    }
                }
            )
            print(f"[LINK] Module {module_id} lié avec succès à l'objectif {objective_id}")
            return True
    except Exception as e:
        print(f"[WARN] Impossible de lier le module {module_id} à l'objectif {objective_id} : {e}")
    return False

def fetch_objective_details(page_id):
    """
    Rétrocompatibilité pour récupérer le contenu d'un objectif.
    """
    data = fetch_objective_full_data(page_id)
    ind_str = ", ".join(ind["text"] for ind in data["indicators"]) if data["indicators"] else "Non spécifié"
    return {
        "critere": data["critere"],
        "indicateurs": ind_str
    }

def get_objective_category(objective_id):
    """
    Récupère la catégorie directement depuis la propriété 'Catégorie' (select) de l'objectif.
    """
    try:
        obj_page = notion.pages.retrieve(page_id=objective_id)
        props = obj_page.get("properties", {})
        
        for prop_key, prop_val in props.items():
            if "Cat" in prop_key and prop_val.get("type") == "select":
                sel = prop_val.get("select")
                if sel and sel.get("name"):
                    return sel.get("name")
    except Exception as e:
        print(f"[ERROR] get_objective_category for {objective_id}: {e}")
        
    return None

def update_objective_category(objective_id, category):
    """
    Met à jour la propriété 'Catégorie' (select) d'un objectif dans Notion.
    """
    try:
        properties = {
            "Catégorie": {"select": {"name": category}}
        }
        notion.pages.update(page_id=objective_id, properties=properties)
        return True
    except Exception as e:
        print(f"[ERROR] update_objective_category for {objective_id}: {e}")
        return False

def create_objective_in_database(properties, children=None, icon=None):
    """
    Crée un objectif avec les propriétés fournies dans la base 🎯 Objectifs.
    Si children est fourni, les blocs enfants seront ajoutés au contenu de la page.
    """
    try:
        create_kwargs = {
            "parent": {"type": "database_id", "database_id": config.DATABASE_OBJECTIFS},
            "properties": properties
        }
        if children:
            create_kwargs["children"] = children
        if icon:
            create_kwargs["icon"] = icon
        response = notion.pages.create(**create_kwargs)
        return response.get("id")
    except Exception as e:
        print(f"[WARN] Création objectif dans database_id échouée ({e}), fallback avec data_source_id.")
        ds_id = get_data_source_id(config.DATABASE_OBJECTIFS)
        create_kwargs = {
            "parent": {"type": "data_source_id", "data_source_id": ds_id},
            "properties": properties
        }
        if children:
            create_kwargs["children"] = children
        if icon:
            create_kwargs["icon"] = icon
        response = notion.pages.create(**create_kwargs)
        return response.get("id")

def fetch_objective_indicators(objective_id):
    """
    Récupère la liste des indicateurs (blocs to_do) sous le bloc quote
    'Quel sont vos INDICATEURS ?' d'un objectif Notion.
    """
    try:
        response = notion.blocks.children.list(block_id=objective_id)
        results = response.get("results", [])
        
        indicators = []
        under_indicators_section = False
        
        for block in results:
            btype = block.get("type")
            
            # Détecter le début de la section indicateurs
            if btype == "quote":
                text = "".join(t.get("plain_text", "") for t in block.get("quote", {}).get("rich_text", [])).lower()
                if "indicateur" in text:
                    under_indicators_section = True
                    continue
            
            if under_indicators_section:
                # Si on rencontre un autre quote ou un divider ou une image, on continue quand même à chercher les to_do
                if btype == "to_do":
                    text = "".join(t.get("plain_text", "") for t in block.get("to_do", {}).get("rich_text", []))
                    if text.strip():
                        indicators.append({
                            "id": block.get("id"),
                            "text": text.strip()
                        })
                        
        # Si aucun quote n'a été matché ou si les indicateurs sont vides, on prend les to_do de premier niveau
        if not indicators:
            for block in results:
                if block.get("type") == "to_do":
                    text = "".join(t.get("plain_text", "") for t in block.get("to_do", {}).get("rich_text", []))
                    if text.strip():
                        indicators.append({
                            "id": block.get("id"),
                            "text": text.strip()
                        })
                        
        return indicators
    except Exception as e:
        print(f"[ERROR] fetch_objective_indicators for {objective_id}: {e}")
        return []

def create_objective_indicator(objective_id, indicator_text):
    """
    Crée un nouvel indicateur (bloc to_do) dans la section des indicateurs
    d'un objectif. Retourne le block_id du nouvel indicateur créé.
    """
    try:
        new_block = {
            "object": "block",
            "type": "to_do",
            "to_do": {
                "rich_text": [{"type": "text", "text": {"content": indicator_text}}],
                "checked": False
            }
        }
        res = notion.blocks.children.append(block_id=objective_id, children=[new_block])
        new_results = res.get("results", [])
        if new_results:
            return new_results[0].get("id")
    except Exception as e:
        print(f"[ERROR] create_objective_indicator: {e}")
    return None

def get_objective_module_id(objective_id):
    """
    Retourne l'ID du module académique lié à cet objectif, s'il existe.
    """
    try:
        modules = fetch_modules()
        for m in modules:
            for obj in m.get("objectifs", []):
                if obj.get("id") == objective_id:
                    return m.get("id")
    except Exception as e:
        print(f"[ERROR] get_objective_module_id for {objective_id}: {e}")
    return None

def fetch_projets():
    """
    Récupère tous les projets depuis la base 🧩 Projets.
    Retourne une liste avec le status, la progression des objectifs,
    et les objectifs liés.
    """
    try:
        response = query_database(database_id=config.DATABASE_PROJETS)
        projets = []
        for page in response.get("results", []):
            props = page.get("properties", {})
            
            title = get_prop_value(props, "Project") or "Sans titre"
            
            # Status (status type)
            status_prop = props.get("Status", {})
            status = None
            if status_prop.get("type") == "status":
                s = status_prop.get("status")
                status = s.get("name") if s else None
            
            # Progression Objectifs rollup (average effort)
            prog_raw = get_prop_value(props, "📊 Progression Objectifs")
            progression = 0
            if prog_raw is not None:
                try:
                    progression = round(float(prog_raw))
                except (ValueError, TypeError):
                    progression = 0
            
            # Résumé Projet formula
            resume = get_prop_value(props, "🏆 Résumé Projet") or ""
            
            # Objectifs liés (note: non-breaking space \xa0 in property name)
            obj_rel = props.get("🎯\xa0Objectifs", {}).get("relation", [])
            
            projets.append({
                "id": page.get("id"),
                "title": title,
                "status": status or "Not started",
                "progression": progression,
                "resume": resume,
                "objectif_ids": [r.get("id") for r in obj_rel]
            })
        return projets
    except Exception as e:
        print(f"[ERREUR] Impossible de récupérer les projets : {e}")
        return []


def fetch_goals_dashboard():
    """
    Construit le tableau de bord complet Objectifs & Projets.
    Associe chaque projet à ses objectifs avec les métriques de progression.
    """
    objectifs = fetch_objectifs()
    projets = fetch_projets()
    
    # Créer un index des objectifs par ID
    obj_by_id = {o["id"]: o for o in objectifs}
    
    # Enrichir chaque projet avec ses objectifs détaillés
    dashboard_projets = []
    objectifs_orphelins = set(o["id"] for o in objectifs)
    
    for projet in projets:
        projet_objectifs = []
        for oid in projet["objectif_ids"]:
            if oid in obj_by_id:
                projet_objectifs.append(obj_by_id[oid])
                objectifs_orphelins.discard(oid)
        
        dashboard_projets.append({
            **projet,
            "objectifs": projet_objectifs
        })
    
    # Objectifs non rattachés à un projet
    orphelins = [obj_by_id[oid] for oid in objectifs_orphelins if oid in obj_by_id]
    
    # Stats globales
    total_objectifs = len(objectifs)
    objectifs_atteints = sum(1 for o in objectifs if o["atteint"])
    effort_moyen = round(sum(o["effort"] for o in objectifs) / total_objectifs) if total_objectifs > 0 else 0
    
    return {
        "projets": dashboard_projets,
        "objectifs_orphelins": orphelins,
        "stats": {
            "total_objectifs": total_objectifs,
            "objectifs_atteints": objectifs_atteints,
            "effort_moyen": effort_moyen,
            "total_projets": len(projets)
        }
    }


def get_objective_success_criterion(page_id):
    """
    Parcourt les blocs de la page de l'objectif pour trouver la citation
    'Quel est votre critère de réussite ?' et extrait le texte du paragraphe suivant.
    """
    try:
        response = notion.blocks.children.list(block_id=page_id)
        blocks = response.get("results", [])
        
        target_idx = None
        for i, block in enumerate(blocks):
            b_type = block.get("type")
            if b_type == "quote":
                rich_text = block.get("quote", {}).get("rich_text", [])
                text = "".join([t.get("plain_text", "") for t in rich_text]).lower()
                if "critère" in text or "critere" in text or "reussite" in text or "réussite" in text:
                    target_idx = i
                    break
        
        if target_idx is not None and target_idx + 1 < len(blocks):
            next_block = blocks[target_idx + 1]
            if next_block.get("type") == "paragraph":
                rich_text = next_block.get("paragraph", {}).get("rich_text", [])
                criterion = "".join([t.get("plain_text", "") for t in rich_text]).strip()
                if criterion:
                    return criterion
                    
        return "Non spécifié (le paragraphe sous la citation 'Quel est votre critère de réussite ?' est vide)."
    except Exception as e:
        print(f"[ERREUR] Impossible de lire le critère de réussite : {e}")
        return "Erreur lors de la lecture du critère dans Notion."


def create_sub_objective(parent_id, name):
    """
    Crée un sous-objectif (indicateur) dans la base 🎯 Objectifs,
    relié à la page parente parent_id via la relation Sous-objectifs.
    """
    ds_id = get_data_source_id(config.DATABASE_OBJECTIFS)
    properties = {
        "Goal": {
            "title": [{"type": "text", "text": {"content": name}}]
        },
        "Sous-objectifs": {
            "relation": [{"id": parent_id}]
        }
    }
    try:
        response = notion.pages.create(
            parent={"type": "data_source_id", "data_source_id": ds_id},
            properties=properties
        )
        return response.get("id")
    except Exception as e:
        print(f"[ERREUR] Impossible de créer le sous-objectif : {e}")
        return None


def create_plan_task_linked(date_str, nom, objective_id, categorie="🧑 Personnel", priorite="🟢 Basse", status="🟢 Actif"):
    """
    Crée une tâche dans la base Plan du Jour liée à un objectif ou sous-objectif,
    avec possibilité de définir son statut de départ (ex: '🟣En attente').
    """
    PLAN_CACHE.clear()
    clear_objective_details_cache()
    
    # Validation pré-action
    props_to_validate = {"Catégorie": categorie, "Priorité": priorite}
    validated = validate_plan_task_properties(props_to_validate)
    categorie = validated.get("Catégorie", "🧑 Personnel")
    priorite = validated.get("Priorité", "🟢 Basse")
    
    ds_id = get_data_source_id(config.DATABASE_PLAN)
    
    # Résoudre la relation 📚 Module si l'objectif est lié à un module
    module_id = get_objective_module_id(objective_id)
    
    properties = {
        "Task": {
            "title": [{"type": "text", "text": {"content": nom}}]
        },
        "Date": {
            "date": {"start": date_str}
        },
        "Catégorie": {
            "select": {"name": categorie}
        },
        "Priorité": {
            "select": {"name": priorite}
        },
        "Status": {
            "select": {"name": status}
        },
        "Fait": {
            "checkbox": False
        },
        "🎯\xa0Objectifs :": {
            "relation": [{"id": objective_id}]
        }
    }
    
    if module_id:
        properties["📚 Module"] = {
            "relation": [{"id": module_id}]
        }
    
    return create_task_in_database(properties)


def append_indicators_to_objective_page(parent_page_id, indicators):
    """
    Écrit les indicateurs déterminés (sous-objectifs) directement
    sous forme de bullet points dans le corps de la page de l'objectif dans Notion.
    """
    children = [
        {
            "object": "block",
            "type": "heading_3",
            "heading_3": {
                "rich_text": [
                    {
                        "type": "text",
                        "text": {"content": "🎯 Indicateurs Déterminés"}
                    }
                ]
            }
        }
    ]
    for ind in indicators:
        children.append({
            "object": "block",
            "type": "bulleted_list_item",
            "bulleted_list_item": {
                "rich_text": [
                    {
                        "type": "text",
                        "text": {"content": ind}
                    }
                ]
            }
        })
    try:
        notion.blocks.children.append(
            block_id=parent_page_id,
            children=children
        )
        return True
    except Exception as e:
        print(f"[ERREUR] Impossible d'écrire les indicateurs dans la page : {e}")
        return False

def save_bilan_step(task_id, step, content):
    """
    Écrit ou met à jour la réponse sous la section correspondante dans le template de la tâche.
    Les sections possibles sont : 'diagnostic', 'takeaways', 'tomorrow_action'.
    Chaque section est représentée par un bloc de type 'quote' contenant des mots-clés spécifiques.
    """
    try:
        # Récupérer les blocs enfants de la page
        response = notion.blocks.children.list(block_id=task_id)
        blocks = response.get("results", [])
        
        # Mots-clés pour identifier chaque section
        step_keywords = {
            "diagnostic": ["efficace", "diagnostic", "🩺"],
            "takeaways": ["leçon", "lecon", "retiens", "takeaway", "💡"],
            "tomorrow_action": ["différemment", "differemment", "action", "demain", "🚀"]
        }
        
        keywords = step_keywords.get(step, [])
        target_block_idx = None
        target_block_id = None
        
        for i, block in enumerate(blocks):
            b_type = block.get("type")
            if b_type == "quote":
                rich_text = block.get("quote", {}).get("rich_text", [])
                text = "".join([t.get("plain_text", "") for t in rich_text]).lower()
                
                # Vérifier si un des mots-clés correspond à la citation
                if any(kw.lower() in text for kw in keywords):
                    target_block_idx = i
                    target_block_id = block.get("id")
                    break
        
        if not target_block_id:
            print(f"[ATTENTION] Section '{step}' introuvable dans la page {task_id}.")
            return False
            
        # Vérifier si le bloc suivant est un paragraphe
        next_block_idx = target_block_idx + 1
        next_block = blocks[next_block_idx] if next_block_idx < len(blocks) else None
        
        if next_block and next_block.get("type") == "paragraph":
            # On met à jour le paragraphe existant
            notion.blocks.update(
                block_id=next_block.get("id"),
                paragraph={
                    "rich_text": [
                        {
                            "type": "text",
                            "text": {"content": content}
                        }
                    ]
                }
            )
            print(f"[Succès] Paragraphe mis à jour sous la section '{step}' (ID: {next_block.get('id')})")
        else:
            # On insère un nouveau paragraphe juste après le bloc cible
            notion.blocks.children.append(
                block_id=task_id,
                children=[
                    {
                        "object": "block",
                        "type": "paragraph",
                        "paragraph": {
                            "rich_text": [
                                {
                                    "type": "text",
                                    "text": {"content": content}
                                }
                            ]
                        }
                    }
                ],
                after=target_block_id
            )
            print(f"[Succès] Nouveau paragraphe inséré sous la section '{step}' après le bloc {target_block_id}")
            
        return True
    except Exception as e:
        print(f"[Erreur] Impossible d'écrire le bilan Notion : {e}")
        return False


# ════════════════════════════════════════════════════════════════════════════
#  HABITS ↔ OBJECTIFS — Système de progression
# ════════════════════════════════════════════════════════════════════════════

import requests as _requests
from datetime import date as _date, timedelta as _timedelta

_NOTION_HEADERS = lambda: {
    "Authorization": f"Bearer {config.NOTION_TOKEN}",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
}


def _raw_query(db_id, filter_obj=None, sorts=None, page_size=50):
    """Direct REST query (bypasses the Data Source wrapper) for inline DBs."""
    body = {"page_size": page_size}
    if filter_obj:
        body["filter"] = filter_obj
    if sorts:
        body["sorts"] = sorts
    r = _requests.post(
        f"https://api.notion.com/v1/databases/{db_id}/query",
        headers=_NOTION_HEADERS(),
        json=body,
    )
    if r.status_code != 200:
        print(f"[_raw_query] Error {r.status_code}: {r.text[:300]}")
        return {"results": []}
    return r.json()


def _raw_patch_page(page_id, properties):
    """PATCH a Notion page's properties via REST."""
    r = _requests.patch(
        f"https://api.notion.com/v1/pages/{page_id}",
        headers=_NOTION_HEADERS(),
        json={"properties": properties},
    )
    return r.status_code == 200, r.json()


def _get_formula_number(prop_data):
    """Extract the numeric value from a formula property."""
    fv = prop_data.get("formula", {})
    return fv.get("number") or 0.0


def get_habits_scores_for_date(target_date_str: str) -> dict:
    """
    Returns Score Matin and Score Soir for a given date (YYYY-MM-DD).
    Reads directly from the Habits tracker inline database.
    Returns dict: {"score_matin": float, "score_soir": float, "found": bool}
    """
    result = {"score_matin": 0.0, "score_soir": 0.0, "found": False, "date": target_date_str}
    try:
        db_id = config.DATABASE_HABITS.replace("-", "")
        # Format with dashes for API
        db_id_fmt = f"{db_id[:8]}-{db_id[8:12]}-{db_id[12:16]}-{db_id[16:20]}-{db_id[20:]}"

        data = _raw_query(
            db_id_fmt,
            filter_obj={"property": config.HABIT_DATE_PROP, "date": {"equals": target_date_str}},
        )
        rows = data.get("results", [])
        if not rows:
            print(f"[Habits] Aucune ligne trouvée pour {target_date_str}")
            return result

        row = rows[0]
        props = row.get("properties", {})

        # Score Matin
        if config.HABIT_SCORE_MATIN in props:
            result["score_matin"] = _get_formula_number(props[config.HABIT_SCORE_MATIN])
        else:
            # Fallback: count morning checkboxes manually
            checked = sum(
                1 for p in config.HABIT_MORNING_PROPS
                if props.get(p, {}).get("checkbox", False)
            )
            result["score_matin"] = round(checked / len(config.HABIT_MORNING_PROPS), 2)

        # Score Soir
        if config.HABIT_SCORE_SOIR in props:
            result["score_soir"] = _get_formula_number(props[config.HABIT_SCORE_SOIR])
        else:
            checked = sum(
                1 for p in config.HABIT_EVENING_PROPS
                if props.get(p, {}).get("checkbox", False)
            )
            result["score_soir"] = round(checked / len(config.HABIT_EVENING_PROPS), 2)

        result["found"] = True
        print(f"[Habits] {target_date_str} → Score Matin={result['score_matin']:.0%}, Score Soir={result['score_soir']:.0%}")
        return result

    except Exception as e:
        print(f"[Habits] Erreur lors de la lecture des scores: {e}")
        return result


def get_todays_objectives_from_calendar(target_date_str: str) -> list:
    """
    Détermine les objectifs actifs pour la journée spécifiée :
    1. Query la base Objectifs pour trouver ceux dont la 'Planification' correspond à target_date_str.
    2. Récupère toutes les tâches du Plan du Jour pour aujourd'hui et les associe à ces objectifs.
    3. Prend en compte les coefficients de priorité (Haute=3, Moyenne=2, Basse=1).
    """
    try:
        # ── 1. Query les tâches du jour dans Plan du Jour
        plan_db_id = config.DATABASE_PLAN
        if "-" not in plan_db_id:
            plan_db_id = f"{plan_db_id[:8]}-{plan_db_id[8:12]}-{plan_db_id[12:16]}-{plan_db_id[16:20]}-{plan_db_id[20:]}"
        
        # On lit toutes les tâches du jour (actives ou en attente)
        tasks_data = _raw_query(
            plan_db_id,
            filter_obj={"property": config.PLAN_DATE_PROP, "date": {"equals": target_date_str}}
        )
        
        # Regrouper les tâches par ID d'objectif
        obj_tasks_map = {}
        for row in tasks_data.get("results", []):
            props = row.get("properties", {})
            obj_rel = props.get(config.PLAN_OBJ_REL_PROP, {}).get("relation", [])
            fait = props.get(config.PLAN_FAIT_PROP, {}).get("checkbox", False)
            priorite_raw = (props.get(config.PLAN_PRIORITE_PROP, {}).get("select") or {}).get("name", "🟡 Moyenne")
            
            # Coefficients de priorité demandés par l'utilisateur : Haute=3, Moyenne=2, Basse=1
            if "Haute" in priorite_raw:
                priority_weight = 3.0
            elif "Basse" in priorite_raw:
                priority_weight = 1.0
            else:
                priority_weight = 2.0
                
            task_info = {
                "id": row.get("id"),
                "fait": fait,
                "priority_weight": priority_weight
            }
            for obj_ref in obj_rel:
                oid = obj_ref.get("id")
                if oid:
                    obj_tasks_map.setdefault(oid, []).append(task_info)
                    
        # ── 2. Query les objectifs planifiés aujourd'hui via 'Planification'
        obj_db_id = config.DATABASE_OBJECTIFS
        if "-" not in obj_db_id:
            obj_db_id = f"{obj_db_id[:8]}-{obj_db_id[8:12]}-{obj_db_id[12:16]}-{obj_db_id[16:20]}-{obj_db_id[20:]}"
            
        obj_data = _raw_query(
            obj_db_id,
            filter_obj={"property": "Planification", "date": {"equals": target_date_str}}
        )
        
        # Mettre en cache tous les objectifs actifs pour aujourd'hui
        active_objs = {}
        for page in obj_data.get("results", []):
            active_objs[page["id"]] = page
            
        # Ajouter également tout objectif qui a des tâches planifiées aujourd'hui
        for oid in obj_tasks_map.keys():
            if oid not in active_objs:
                try:
                    r = _requests.get(f"https://api.notion.com/v1/pages/{oid}", headers=_NOTION_HEADERS())
                    if r.status_code == 200:
                        active_objs[oid] = r.json()
                except Exception as e:
                    print(f"[Calendar] Erreur lors du chargement de l'objectif {oid}: {e}")
                    
        # Construire la liste de retour structurée
        results = []
        for oid, page in active_objs.items():
            props = page.get("properties", {})
            
            # Récupérer les relations de sous-objectifs (indicateurs)
            sub_refs = props.get("Sous-objectifs", {}).get("relation", [])
            sub_ids = [ref.get("id") for ref in sub_refs if ref.get("id")]
            
            results.append({
                "obj_id": oid,
                "name": get_prop_value(props, "Goal") or "Objectif sans titre",
                "sub_objectifs": sub_ids,
                "tasks": obj_tasks_map.get(oid, [])
            })
            
        print(f"[Calendar] {len(results)} objectifs actifs identifiés pour {target_date_str}")
        return results
    except Exception as e:
        print(f"[Calendar] Erreur dans get_todays_objectives_from_calendar: {e}")
        return []


def _ensure_progression_property(obj_db_id: str) -> bool:
    """
    Ensures the 'Progression' number property exists on the Objectifs database.
    Creates it if missing. Returns True if ready.
    """
    try:
        r = _requests.get(
            f"https://api.notion.com/v1/databases/{obj_db_id}",
            headers=_NOTION_HEADERS(),
        )
        existing = r.json().get("properties", {})
        if config.OBJ_PROGRESS_PROP not in existing:
            print(f"[Progression] Création de la propriété '{config.OBJ_PROGRESS_PROP}'...")
            patch = _requests.patch(
                f"https://api.notion.com/v1/databases/{obj_db_id}",
                headers=_NOTION_HEADERS(),
                json={"properties": {config.OBJ_PROGRESS_PROP: {"number": {"format": "percent"}}}},
            )
            if patch.status_code == 200:
                print(f"[Progression] Propriété '{config.OBJ_PROGRESS_PROP}' créée ✅")
            else:
                print(f"[Progression] Erreur création: {patch.text[:200]}")
                return False
        return True
    except Exception as e:
        print(f"[Progression] Erreur _ensure: {e}")
        return False


def compute_daily_objective_progression(
    obj_entry: dict,
    score_matin: float,
    score_soir_yesterday: float,
) -> float:
    """
    Calcule la contribution quotidienne de progression pour un objectif :
    - Tâches (coefficientées par priorité: Haute=3, Moyenne=2, Basse=1) -> 80% du score.
    - Score Matin -> +15% de boost.
    - Score Soir (hier) -> +5% de boost.
    """
    tasks = obj_entry.get("tasks", [])
    if not tasks:
        # S'il n'y a pas de tâche directe, le score est uniquement dicté par les habitudes (comme push minimal)
        task_score = 0.0
    else:
        total_weight = sum(t["priority_weight"] for t in tasks)
        done_weight  = sum(t["priority_weight"] for t in tasks if t["fait"])
        task_score   = done_weight / total_weight if total_weight > 0 else 0.0

    # Boosts d'habitudes (0.15 max matin, 0.05 max soir)
    morning_boost = score_matin * 0.15
    evening_boost = score_soir_yesterday * 0.05

    # Score journalier brut
    daily_raw = task_score * 0.80 + morning_boost + evening_boost

    # Progression max par jour = 5% (représenté par 5.0)
    daily_contribution_pct = round(min(daily_raw * 5.0, 5.0), 2)
    return daily_contribution_pct


def apply_daily_habit_boost(target_date_str: str = None) -> dict:
    """
    Calcule et applique la progression quotidienne de tous les objectifs de la journée :
    1. Lit les habitudes du jour et de la veille.
    2. Identifie les objectifs actifs (planifiés via 'Planification' ou ayant des tâches liées).
    3. Traite séparément les sous-objectifs (indicateurs) et les objectifs parents.
    4. Écrit les résultats dans la colonne Progression sur Notion.
    """
    if target_date_str is None:
        target_date_str = _date.today().isoformat()

    yesterday_str = (_date.fromisoformat(target_date_str) - _timedelta(days=1)).isoformat()

    # ── 1. Habitudes ─────────────────────────────────────────────────────────
    today_scores     = get_habits_scores_for_date(target_date_str)
    yesterday_scores = get_habits_scores_for_date(yesterday_str)

    score_matin          = today_scores["score_matin"]
    score_soir_yesterday = yesterday_scores["score_soir"]

    # ── 2. Objectifs actifs de la journée ────────────────────────────────────
    obj_entries = get_todays_objectives_from_calendar(target_date_str)
    if not obj_entries:
        return {
            "success": True,
            "date": target_date_str,
            "score_matin": score_matin,
            "score_soir_hier": score_soir_yesterday,
            "objectives": [],
            "message": "Aucun objectif planifié pour aujourd'hui.",
        }

    # ── 3. S'assurer que Progression existe ──────────────────────────────────
    obj_db_id = config.DATABASE_OBJECTIFS
    if "-" not in obj_db_id:
        obj_db_id = f"{obj_db_id[:8]}-{obj_db_id[8:12]}-{obj_db_id[12:16]}-{obj_db_id[16:20]}-{obj_db_id[20:]}"
    _ensure_progression_property(obj_db_id)

    # Séparer les objectifs par type (avec indicateurs vs sans indicateurs)
    # pour calculer en premier les sous-objectifs, puis en déduire la moyenne pour les parents.
    results = []
    
    # Étape A : Calculer en premier les indicateurs (sous-objectifs qui ont des tâches directes)
    indicators_prog = {}  # id -> float (progression 0.0 - 1.0)
    
    for entry in obj_entries:
        obj_id = entry["obj_id"]
        # Si cet objectif n'a PAS de sous-objectifs (c'est donc lui-même un indicateur de dernier niveau)
        # ou s'il a des tâches directes attribuées.
        if not entry.get("sub_objectifs") or entry.get("tasks"):
            try:
                # Récupérer la progression actuelle
                r = _requests.get(f"https://api.notion.com/v1/pages/{obj_id}", headers=_NOTION_HEADERS())
                page_data = r.json()
                props = page_data.get("properties", {})

                obj_name = ""
                for pn, pd in props.items():
                    if pd.get("type") == "title":
                        rt = pd.get("title", [])
                        obj_name = rt[0].get("plain_text", "") if rt else ""
                        break

                current_prog = 0.0
                if config.OBJ_PROGRESS_PROP in props:
                    current_prog = props[config.OBJ_PROGRESS_PROP].get("number") or 0.0

                contribution_pct = compute_daily_objective_progression(
                    entry, score_matin, score_soir_yesterday
                )
                contribution_fraction = contribution_pct / 100.0
                new_prog = min(round(current_prog + contribution_fraction, 4), 1.0)

                # Sauvegarder dans Notion
                ok, _ = _raw_patch_page(obj_id, {config.OBJ_PROGRESS_PROP: {"number": new_prog}})
                
                indicators_prog[obj_id] = new_prog
                
                results.append({
                    "obj_id": obj_id,
                    "obj_name": obj_name,
                    "type": "Indicateur",
                    "tasks_count": len(entry["tasks"]),
                    "tasks_done": sum(1 for t in entry["tasks"] if t["fait"]),
                    "contribution_pct": contribution_pct,
                    "old_progression": round(current_prog * 100, 1),
                    "new_progression": round(new_prog * 100, 1),
                    "ok": ok
                })
            except Exception as e:
                print(f"[Progression] Erreur indicateur {obj_id}: {e}")
                results.append({"obj_id": obj_id, "error": str(e)})

    # Étape B : Calculer les objectifs parents comme la moyenne de leurs indicateurs (sous-objectifs)
    for entry in obj_entries:
        obj_id = entry["obj_id"]
        # Si cet objectif a des sous-objectifs ET aucune tâche directe liée
        if entry.get("sub_objectifs") and not entry.get("tasks"):
            try:
                r = _requests.get(f"https://api.notion.com/v1/pages/{obj_id}", headers=_NOTION_HEADERS())
                page_data = r.json()
                props = page_data.get("properties", {})

                obj_name = ""
                for pn, pd in props.items():
                    if pd.get("type") == "title":
                        rt = pd.get("title", [])
                        obj_name = rt[0].get("plain_text", "") if rt else ""
                        break

                current_prog = 0.0
                if config.OBJ_PROGRESS_PROP in props:
                    current_prog = props[config.OBJ_PROGRESS_PROP].get("number") or 0.0

                # Lire la progression de chaque sous-objectif
                sub_progressions = []
                for sub_id in entry["sub_objectifs"]:
                    # Si on vient de le calculer, on utilise la valeur en mémoire
                    if sub_id in indicators_prog:
                        sub_progressions.append(indicators_prog[sub_id])
                    else:
                        # Sinon on interroge Notion
                        try:
                            r_sub = _requests.get(f"https://api.notion.com/v1/pages/{sub_id}", headers=_NOTION_HEADERS())
                            if r_sub.status_code == 200:
                                sub_props = r_sub.json().get("properties", {})
                                prog = 0.0
                                if config.OBJ_PROGRESS_PROP in sub_props:
                                    prog = sub_props[config.OBJ_PROGRESS_PROP].get("number") or 0.0
                                sub_progressions.append(prog)
                        except Exception as ex:
                            print(f"[Progression] Erreur lecture sous-objectif {sub_id}: {ex}")

                # Progression moyenne
                if sub_progressions:
                    new_prog = sum(sub_progressions) / len(sub_progressions)
                    new_prog = min(round(new_prog, 4), 1.0)
                else:
                    new_prog = current_prog

                contrib_pct = round((new_prog - current_prog) * 100, 2)

                # Sauvegarder dans Notion
                ok, _ = _raw_patch_page(obj_id, {config.OBJ_PROGRESS_PROP: {"number": new_prog}})

                results.append({
                    "obj_id": obj_id,
                    "obj_name": obj_name,
                    "type": "Objectif Parent",
                    "tasks_count": 0,
                    "tasks_done": 0,
                    "contribution_pct": contrib_pct,
                    "old_progression": round(current_prog * 100, 1),
                    "new_progression": round(new_prog * 100, 1),
                    "ok": ok
                })
            except Exception as e:
                print(f"[Progression] Erreur objectif parent {obj_id}: {e}")
                results.append({"obj_id": obj_id, "error": str(e)})

    return {
        "success": True,
        "date": target_date_str,
        "score_matin": score_matin,
        "score_soir_hier": score_soir_yesterday,
        "objectives": results,
    }


def get_habits_today_summary(target_date_str: str = None) -> dict:
    """
    Returns a structured summary of today's habits (morning + evening)
    for display in the chat.
    """
    if target_date_str is None:
        target_date_str = _date.today().isoformat()

    db_id = config.DATABASE_HABITS.replace("-", "")
    db_id_fmt = f"{db_id[:8]}-{db_id[8:12]}-{db_id[12:16]}-{db_id[16:20]}-{db_id[20:]}"

    data = _raw_query(
        db_id_fmt,
        filter_obj={"property": config.HABIT_DATE_PROP, "date": {"equals": target_date_str}},
    )
    rows = data.get("results", [])

    morning = {}
    evening = {}
    score_matin = 0.0
    score_soir  = 0.0

    if rows:
        props = rows[0].get("properties", {})
        for p in config.HABIT_MORNING_PROPS:
            morning[p] = props.get(p, {}).get("checkbox", False)
        for p in config.HABIT_EVENING_PROPS:
            evening[p] = props.get(p, {}).get("checkbox", False)
        score_matin = _get_formula_number(props.get(config.HABIT_SCORE_MATIN, {}))
        score_soir  = _get_formula_number(props.get(config.HABIT_SCORE_SOIR, {}))

    return {
        "date": target_date_str,
        "morning": morning,
        "evening": evening,
        "score_matin": score_matin,
        "score_soir": score_soir,
        "found": bool(rows),
    }

# --- GESTION DES MODULES ET ÉVALUATIONS ---

def fetch_modules():
    """Récupère tous les modules depuis la base Notion DATABASE_MODULES."""
    try:
        response = query_database(config.DATABASE_MODULES)
        try:
            objectifs = fetch_objectifs()
            obj_map = {obj["id"]: obj["title"] for obj in objectifs}
        except Exception as obj_err:
            print(f"[ATTENTION] Impossible de lier les objectifs aux modules : {obj_err}")
            obj_map = {}

        modules = []
        for page in response.get("results", []):
            props = page.get("properties", {})
            name = get_prop_value(props, "Module")
            
            # Résoudre la relation 🎯 Objectifs (peut contenir un espace insécable \xa0)
            objectifs_rel = []
            for prop_key, prop_val in props.items():
                if "Objectifs" in prop_key and prop_val.get("type") == "relation":
                    objectifs_rel = prop_val.get("relation", [])
                    break
            
            linked_objectifs = []
            for r in objectifs_rel:
                obj_id = r.get("id")
                if obj_id in obj_map:
                    linked_objectifs.append({
                        "id": obj_id,
                        "title": obj_map[obj_id]
                    })
            
            modules.append({
                "id": page.get("id"),
                "name": name or "Module sans nom",
                "objectifs": linked_objectifs
            })
        return modules
    except Exception as e:
        print(f"[ERREUR] fetch_modules : {e}")
        return []

def create_module(name):
    """Crée un nouveau module dans Notion."""
    ds_id = get_data_source_id(config.DATABASE_MODULES)
    properties = {
        "Module": {
            "title": [{"type": "text", "text": {"content": name}}]
        }
    }
    response = notion.pages.create(
        parent={"type": "data_source_id", "data_source_id": ds_id},
        properties=properties
    )
    return response.get("id")

def delete_module_cascade(module_id):
    """
    Supprime un module en cascade :
    1. Archive la page du module.
    2. Archive toutes les évaluations liées.
    3. Archive tous les objectifs parents liés.
    4. Archive les sous-objectifs associés aux objectifs parents archivés.
    5. Archive toutes les tâches du plan liées aux objectifs archivés.
    """
    # 1. Archiver le module
    try:
        notion.pages.update(page_id=module_id, archived=True)
        print(f"[CASCADE] Module {module_id} archivé.")
    except Exception as e:
        print(f"[CASCADE ERROR] Impossible d'archiver le module {module_id}: {e}")
        
    # 2. Archiver toutes les évaluations liées (DATABASE_STUDIES)
    try:
        evals = fetch_all_evaluations()
        for ev in evals:
            if ev.get("module_id") == module_id:
                try:
                    notion.pages.update(page_id=ev["id"], archived=True)
                    print(f"[CASCADE] Évaluation {ev['id']} ({ev['type']}) archivée.")
                except Exception as ev_err:
                    print(f"[CASCADE ERROR] Évaluation {ev['id']}: {ev_err}")
    except Exception as e:
        print(f"[CASCADE ERROR] Fetch/archive evaluations: {e}")
        
    # 3 & 4. Archiver tous les objectifs parents liés & leurs sous-objectifs
    archived_obj_ids = set()
    try:
        response = query_database(database_id=config.DATABASE_OBJECTIFS)
        all_objs = response.get("results", [])
        
        # Trouver les parents liés
        for page in all_objs:
            props = page.get("properties", {})
            modules_rel = props.get("📚 Modules ", {}).get("relation", []) or props.get("📚 Modules", {}).get("relation", [])
            has_link = any(r.get("id") == module_id for r in modules_rel)
            
            if has_link:
                obj_id = page.get("id")
                try:
                    notion.pages.update(page_id=obj_id, archived=True)
                    archived_obj_ids.add(obj_id)
                    print(f"[CASCADE] Objectif parent {obj_id} archivé.")
                except Exception as obj_err:
                    print(f"[CASCADE ERROR] Objectif parent {obj_id}: {obj_err}")
                    
        # Trouver les sous-objectifs liés aux parents archivés
        if archived_obj_ids:
            for page in all_objs:
                sub_id = page.get("id")
                if sub_id in archived_obj_ids:
                    continue
                props = page.get("properties", {})
                parent_rel = props.get("Parent", {}).get("relation", [])
                if parent_rel and parent_rel[0].get("id") in archived_obj_ids:
                    try:
                        notion.pages.update(page_id=sub_id, archived=True)
                        archived_obj_ids.add(sub_id)
                        print(f"[CASCADE] Sous-objectif {sub_id} archivé.")
                    except Exception as sub_err:
                        print(f"[CASCADE ERROR] Sous-objectif {sub_id}: {sub_err}")
    except Exception as e:
        print(f"[CASCADE ERROR] Fetch/archive objectives: {e}")
        
    # 5. Archiver toutes les tâches du plan (DATABASE_PLAN) liées à un de ces objectifs
    if archived_obj_ids:
        try:
            plan_response = query_database(database_id=config.DATABASE_PLAN)
            for page in plan_response.get("results", []):
                task_id = page.get("id")
                props = page.get("properties", {})
                
                # Relation '🎯 Objectifs :'
                objectifs_rel = []
                for prop_key, prop_val in props.items():
                    if "Objectifs" in prop_key and prop_val.get("type") == "relation":
                        objectifs_rel = prop_val.get("relation", [])
                        break
                        
                # Vérifier si la relation contient un objectif archivé
                has_archived_link = any(r.get("id") in archived_obj_ids for r in objectifs_rel)
                if has_archived_link:
                    try:
                        notion.pages.update(page_id=task_id, archived=True)
                        print(f"[CASCADE] Tâche plan {task_id} archivée car liée à un objectif archivé.")
                    except Exception as task_err:
                        print(f"[CASCADE ERROR] Tâche plan {task_id}: {task_err}")
        except Exception as e:
            print(f"[CASCADE ERROR] Fetch/archive plan tasks: {e}")

def fetch_all_evaluations():
    """Récupère toutes les évaluations (études) depuis la base Notion DATABASE_STUDIES."""
    response = query_database(config.DATABASE_STUDIES)
    evaluations = []
    for page in response.get("results", []):
        props = page.get("properties", {})
        
        # Le nom/type de l'évaluation (titre)
        title = get_prop_value(props, "Type")
        
        # Le module associé (relation " Module")
        module_rel = props.get(" Module", {}).get("relation", [])
        module_id = module_rel[0].get("id") if module_rel else None
        
        statut = get_prop_value(props, "Statut") or "À venir"
        date_exam = get_prop_value(props, "Date")
        note_100_raw = get_prop_value(props, "Note/100")
        
        note_20_formula = props.get("Note /20", {}).get("formula", {}).get("number")
        if note_20_formula is None:
            # Fallback en cas d'absence
            try:
                note_20_formula = float(note_100_raw) / 5 if note_100_raw else None
            except:
                note_20_formula = None
                
        evaluations.append({
            "id": page.get("id"),
            "type": title or "Évaluation",
            "module_id": module_id,
            "status": "completed" if statut == "Terminer" else "pending",
            "date": date_exam,
            "note_100": note_100_raw,
            "note_20": note_20_formula
        })
    return evaluations

def create_evaluation(type_eval, module_id, date_str):
    """Crée une nouvelle évaluation liée à un module dans la base DATABASE_STUDIES."""
    ds_id = get_data_source_id(config.DATABASE_STUDIES)
    properties = {
        "Type": {
            "title": [{"type": "text", "text": {"content": type_eval}}]
        },
        "Statut": {
            "select": {"name": "À venir"}
        }
    }
    if module_id:
        properties[" Module"] = {
            "relation": [{"id": module_id}]
        }
    if date_str:
        properties["Date"] = {
            "date": {"start": date_str}
        }
    response = notion.pages.create(
        parent={"type": "data_source_id", "data_source_id": ds_id},
        properties=properties
    )
    return response.get("id")

def update_evaluation(page_id, status, note_100):
    """Met à jour le statut et/ou la note d'une évaluation existante."""
    properties = {}
    if status == "completed":
        properties["Statut"] = {"select": {"name": "Terminer"}}
    elif status == "pending":
        properties["Statut"] = {"select": {"name": "À venir"}}
        
    if note_100 is not None:
        properties["Note/100"] = {
            "rich_text": [{"type": "text", "text": {"content": str(note_100)}}]
        }
    else:
        properties["Note/100"] = {
            "rich_text": []
        }
        
    response = notion.pages.update(
        page_id=page_id,
        properties=properties
    )
    return response

def delete_evaluation(page_id):
    """Archive (supprime) la page d'évaluation."""
    return notion.pages.update(page_id=page_id, archived=True)

def update_indicator_weight_in_block(block_id, weight):
    """
    Met à jour le texte du bloc de l'indicateur pour y inclure le nouveau poids (Poids X).
    """
    try:
        block = notion.blocks.retrieve(block_id=block_id)
        btype = block.get("type")
        if btype != "to_do":
            return False
            
        todo = block.get("to_do", {})
        rich_text = todo.get("rich_text", [])
        text = "".join(t.get("plain_text", "") for t in rich_text).strip()
        if not text:
            return False
            
        import re
        # Nettoyer l'ancien poids (ex: (Poids X), [Poids X], (Coef X), [Coef X])
        text = re.sub(r'\s*[\(\[](?:poids|coef)\s*\d+[\)\]]', '', text, flags=re.IGNORECASE)
        # Nettoyer les (X) ou [X] à la fin
        text = re.sub(r'\s*[\(\[]\s*\d+\s*[\)\]]$', '', text)
        
        # Ajouter le nouveau poids
        new_text = f"{text} (Poids {weight})"
        
        notion.blocks.update(
            block_id=block_id,
            to_do={
                "rich_text": [{
                    "type": "text",
                    "text": {"content": new_text}
                }]
            }
        )
        clear_objective_details_cache()
        return True
    except Exception as e:
        print(f"[ERROR] update_indicator_weight_in_block: {e}")
        return False

def sync_block_state_to_task_database(block_id, checked):
    """
    Trouve la page correspondante dans DATABASE_PLAN par son titre et coche/décoche la propriété 'Fait'.
    """
    try:
        block = notion.blocks.retrieve(block_id=block_id)
        btype = block.get("type")
        if btype != "to_do":
            return
            
        todo = block.get("to_do", {})
        rich_text = todo.get("rich_text", [])
        text = "".join(t.get("plain_text", "") for t in rich_text).strip()
        if not text:
            return
            
        # Chercher dans DATABASE_PLAN
        filter_obj = {
            "property": "Task",
            "title": {
                "equals": text
            }
        }
        response = query_database(database_id=config.DATABASE_PLAN, filter_obj=filter_obj)
        results = response.get("results", [])
        
        for page in results:
            page_id = page["id"]
            notion.pages.update(
                page_id=page_id,
                properties={
                    "Fait": {"checkbox": checked}
                }
            )
            print(f"[INFO] Synced task page {page_id} ('{text}') checked={checked}")
            
    except Exception as e:
        print(f"[WARN] sync_block_state_to_task_database failed: {e}")

def fetch_uncompleted_past_tasks(current_date):
    """
    Récupère toutes les tâches du plan (DATABASE_PLAN) antérieures à current_date
    ayant le statut '🟢 Actif' ou '♻️ Replanifier' (non archivées).
    """
    try:
        response = query_database(
            database_id=config.DATABASE_PLAN,
            filter_obj={
                "and": [
                    {
                        "or": [
                            {"property": "Status", "select": {"equals": "🟢 Actif"}},
                            {"property": "Status", "select": {"equals": "♻️ Replanifier"}}
                        ]
                    },
                    {"property": "Date", "date": {"on_or_before": current_date}}
                ]
            }
        )

        uncompleted = []
        for page in response.get("results", []):
            props = page.get("properties", {})
            task_name = get_prop_value(props, "Task") or "Sans titre"
            categorie = get_prop_value(props, "Catégorie") or "Autre"
            fait = get_prop_value(props, "Fait") or False
            date_val = get_prop_value(props, "Date")
            status = get_prop_value(props, "Status") or "🟢 Actif"

            # Auto-archive tasks completed yesterday
            if fait:
                try:
                    notion.pages.update(
                        page_id=page["id"],
                        properties={
                            "Status": {"select": {"name": "🗄️ Archivé"}},
                            "Clôturer": {"checkbox": False}
                        }
                    )
                except Exception as e:
                    print(f"[WARN] Auto-archive failed for page {page['id']}: {e}")
            else:
                uncompleted.append({
                    "id": page["id"],
                    "objectif": task_name,
                    "categorie": categorie,
                    "date": date_val,
                    "status": status
                })
        return uncompleted
    except Exception as e:
        print(f"[ERREUR] fetch_uncompleted_past_tasks: {e}")
        return []

def batch_reschedule_tasks(updates):
    """
    Mise à jour groupée de la date et du statut des tâches replanifiées dans Notion.
    updates = [{"id": "page_id", "date": "YYYY-MM-DD" or None}, ...]
    """
    success_count = 0
    for item in updates:
        page_id = item.get("id")
        new_date = item.get("date")
        if not page_id:
            continue

        props = {
            "Status": {"select": {"name": "♻️ Replanifier"}},
            "Clôturer": {"checkbox": False}
        }
        if new_date:
            props["Date"] = {"date": {"start": new_date}}
        else:
            props["Date"] = {"date": None}

        try:
            notion.pages.update(page_id=page_id, properties=props)
            success_count += 1
        except Exception as e:
            print(f"[ERREUR] batch_reschedule_tasks page {page_id}: {e}")
    return success_count


def extract_date_from_row(row):
    """
    Extrait la date YYYY-MM-DD d'une ligne de la base d'habitudes.
    Cherche d'abord la propriété 'date' (Date), puis le titre 'Name' (ex: '2026-08-01 ').
    """
    props = row.get("properties", {})
    d_val = get_prop_value(props, config.HABIT_DATE_PROP)
    if d_val:
        return str(d_val).strip()
    name_val = get_prop_value(props, "Name")
    if name_val:
        import re
        m = re.search(r"\d{4}-\d{2}-\d{2}", str(name_val))
        if m:
            return m.group(0)
    return ""

def fetch_good_habits_and_streaks(target_date_str=None):
    """
    Lit DATABASE_HABITS (Notion Base 1 / Base 2).
    - Bonnes habitudes cochées aujourd'hui.
    - Streak pour chaque bonne habitude (nombre de jours consécutifs cochés).
    """
    if target_date_str is None:
        target_date_str = date.today().isoformat()

    try:
        db_id = config.DATABASE_HABITS.replace("-", "")
        db_id_fmt = f"{db_id[:8]}-{db_id[8:12]}-{db_id[12:16]}-{db_id[16:20]}-{db_id[20:]}"
        
        # Query up to 40 entries for streak calculation
        data = query_database(
            database_id=db_id_fmt,
            filter_obj=None
        )
        results = data.get("results", [])
        
        habit_names = list(config.HABIT_MORNING_PROPS + config.HABIT_EVENING_PROPS)
        if results:
            props = results[0].get("properties", {})
            for k, v in props.items():
                if v.get("type") == "checkbox" and k not in habit_names and k != "Fait":
                    habit_names.append(k)

        checked_today = []
        total_today = list(habit_names)
        streaks = {name: 0 for name in habit_names}
        
        # Sort rows descending by date extracted from row (Name or date property)
        sorted_rows = sorted(results, key=lambda x: extract_date_from_row(x), reverse=True)
        
        today_row = None
        for r in sorted_rows:
            r_date = extract_date_from_row(r)
            if r_date == target_date_str:
                today_row = r
                break
                
        if today_row:
            props_today = today_row.get("properties", {})
            for name in habit_names:
                is_checked = props_today.get(name, {}).get("checkbox", False)
                if is_checked:
                    checked_today.append(name)

        # Calculate streaks
        for name in habit_names:
            streak = 0
            for row in sorted_rows:
                r_date = extract_date_from_row(row)
                is_checked = row.get("properties", {}).get(name, {}).get("checkbox", False)
                if is_checked:
                    streak += 1
                else:
                    # Ignore today if it hasn't been checked yet, to not break an active streak
                    if r_date == target_date_str:
                        continue
                    break
            streaks[name] = streak

        return {
            "checked_today": checked_today,
            "total_today": total_today,
            "streaks": streaks,
            "has_row": (today_row is not None)
        }
    except Exception as e:
        print(f"[ERROR] fetch_good_habits_and_streaks: {e}")
        return {
            "checked_today": [],
            "total_today": [],
            "streaks": {},
            "has_row": False
        }


import os

def get_bad_habits_state(date_str):
    """Récupère l'état des mauvaises habitudes."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bad_habits.json")
    if not os.path.exists(path):
        default_state = {
            "habits": [
                {"id": "bh1", "name": "Scroller TikTok"},
                {"id": "bh2", "name": "Manger du fastfood"}
            ],
            "checked_days": {}
        }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(default_state, f, ensure_ascii=False, indent=2)
            
    try:
        with open(path, "r", encoding="utf-8") as f:
            state = json.load(f)
    except Exception:
        state = {
            "habits": [
                {"id": "bh1", "name": "Scroller TikTok"},
                {"id": "bh2", "name": "Manger du fastfood"}
            ],
            "checked_days": {}
        }
        
    habits = state.get("habits", [])
    checked_ids = state.get("checked_days", {}).get(date_str, [])
    
    return {
        "all_habits": habits,
        "checked_ids": checked_ids
    }

def save_bad_habits_state(state):
    """Enregistre l'état global des mauvaises habitudes."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bad_habits.json")
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[ERROR] save_bad_habits_state: {e}")

def get_habit_weights():
    """Récupère les poids des bonnes habitudes (par défaut: 2)."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "habit_weights.json")
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def set_habit_weight(habit_name, weight):
    """Enregistre le poids d'une bonne habitude (1, 2 ou 3)."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "habit_weights.json")
    weights = get_habit_weights()
    weights[habit_name] = int(weight)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(weights, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"[ERROR] set_habit_weight: {e}")
        return False

def toggle_good_habit(habit_name, date_str, new_value):
    """
    Toggle a good habit checkbox in Notion for the given date.
    Finds row by matching date in 'date' property or 'Name' title.
    If no row exists for this date, create one with title 'YYYY-MM-DD '.
    """
    try:
        db_id = config.DATABASE_HABITS.replace("-", "")
        db_id_fmt = f"{db_id[:8]}-{db_id[8:12]}-{db_id[12:16]}-{db_id[16:20]}-{db_id[20:]}"
        stats_page_id = "24b7b78b-ada1-80aa-846d-c8f779f7c2f2"
        
        # Query all rows in DATABASE_HABITS to match by extract_date_from_row
        data = query_database(database_id=db_id_fmt, filter_obj=None)
        results = data.get("results", [])
        
        target_row = None
        for r in results:
            r_date = extract_date_from_row(r)
            if r_date == date_str:
                target_row = r
                break
        
        if target_row:
            page_id = target_row.get("id")
            props = target_row.get("properties", {})
            
            # Resolve property name if exact key is slightly different
            target_prop = habit_name
            if habit_name not in props:
                for k in props.keys():
                    if k.strip().lower() == habit_name.strip().lower():
                        target_prop = k
                        break

            update_props = {
                target_prop: {"checkbox": bool(new_value)}
            }
            # Set date property if it was empty
            if not get_prop_value(props, config.HABIT_DATE_PROP):
                update_props[config.HABIT_DATE_PROP] = {"date": {"start": date_str}}

            # Set Stats relation if it is missing or empty
            if "Stats" in props and not props.get("Stats", {}).get("relation"):
                update_props["Stats"] = {"relation": [{"id": stats_page_id}]}

            notion.pages.update(
                page_id=page_id,
                properties=update_props
            )
            print(f"[NOTION SUCCESS] Updated '{target_prop}' = {new_value} for date {date_str} (Page: {page_id})")
            return {"success": True, "action": "updated", "page_id": page_id}
        else:
            # Create new row matching user's template format
            ds_id = get_data_source_id(db_id_fmt)
            title_name = f"{date_str} "
            properties = {
                "Name": {"title": [{"text": {"content": title_name}}]},
                config.HABIT_DATE_PROP: {"date": {"start": date_str}},
                habit_name: {"checkbox": bool(new_value)},
                "Stats": {"relation": [{"id": stats_page_id}]}
            }
            try:
                response = notion.pages.create(
                    parent={"type": "database_id", "database_id": db_id_fmt},
                    properties=properties
                )
            except Exception:
                response = notion.pages.create(
                    parent={"type": "data_source_id", "data_source_id": ds_id},
                    properties=properties
                )
            new_id = response.get("id")
            print(f"[NOTION SUCCESS] Created new row '{title_name}' with '{habit_name}' = {new_value} (Page: {new_id})")
            return {"success": True, "action": "created", "page_id": new_id}
    except Exception as e:
        print(f"[ERROR] toggle_good_habit: {e}")
        return {"success": False, "error": str(e)}

