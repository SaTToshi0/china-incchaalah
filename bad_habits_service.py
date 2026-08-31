import os
import json
import time
from datetime import datetime, timezone

# Seuils d'influence pour le calcul dynamique des états (facilement modifiables)
THRESHOLD_ACTIVE = 75.0
THRESHOLD_AFFAIBLIE = 50.0
THRESHOLD_TRES_FAIBLE = 25.0

STATE_ACTIVE = "Active"
STATE_AFFAIBLIE = "Affaiblie"
STATE_TRES_FAIBLE = "Très faible"
STATE_DORMANTE = "Dormante"

BAD_HABITS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bad_habits.json")


def calculate_habit_state(influence: float) -> str:
    """
    Calcule dynamiquement l'état d'une mauvaise habitude selon son influence.
    Cet état n'est PAS enregistré en base de données.
    """
    try:
        inf = float(influence)
    except (ValueError, TypeError):
        inf = 100.0

    if inf >= THRESHOLD_ACTIVE:
        return STATE_ACTIVE
    elif inf >= THRESHOLD_AFFAIBLIE:
        return STATE_AFFAIBLIE
    elif inf >= THRESHOLD_TRES_FAIBLE:
        return STATE_TRES_FAIBLE
    else:
        return STATE_DORMANTE


def load_raw_bad_habits_file() -> dict:
    """Charge le fichier JSON brut des mauvaises habitudes."""
    if not os.path.exists(BAD_HABITS_FILE):
        default_data = {"habits": []}
        save_raw_bad_habits_file(default_data)
        return default_data

    try:
        with open(BAD_HABITS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            if "habits" not in data or not isinstance(data["habits"], list):
                data["habits"] = []
            return data
    except Exception as e:
        print(f"[WARN] bad_habits_service: Erreur lecture {BAD_HABITS_FILE} ({e}). Réinitialisation...")
        default_data = {"habits": []}
        return default_data


def save_raw_bad_habits_file(data: dict) -> bool:
    """Enregistre la structure brute dans bad_habits.json."""
    try:
        with open(BAD_HABITS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"[ERROR] bad_habits_service.save_raw_bad_habits_file: {e}")
        return False


def get_all_bad_habits() -> list:
    """
    Retourne toutes les mauvaises habitudes avec l'état calculé dynamiquement
    pour chaque élément.
    """
    data = load_raw_bad_habits_file()
    habits = data.get("habits", [])

    result = []
    for h in habits:
        h_copy = dict(h)
        # S'assurer des types corrects
        h_copy["poids"] = int(h_copy.get("poids", 2))
        h_copy["influence"] = float(h_copy.get("influence", 100.0))
        h_copy["nombre_rechutes"] = int(h_copy.get("nombre_rechutes", 0))
        h_copy["dates_rechutes"] = h_copy.get("dates_rechutes", [])
        if not isinstance(h_copy["dates_rechutes"], list):
            h_copy["dates_rechutes"] = []
        # Calcul de l'état dynamique (non sauvegardé)
        h_copy["etat"] = calculate_habit_state(h_copy["influence"])
        result.append(h_copy)

    return result


def get_bad_habit_by_id(habit_id: str) -> dict:
    """Récupère une mauvaise habitude spécifique par son ID."""
    habits = get_all_bad_habits()
    for h in habits:
        if h.get("id") == habit_id:
            return h
    return None


def add_bad_habit(nom: str, description: str = "", poids: int = 2) -> dict:
    """
    Crée une nouvelle mauvaise habitude :
    - influence = 100%
    - date_creation = ISO utcnow
    - date_derniere_rechute = None
    - nombre_rechutes = 0
    - dates_rechutes = []
    """
    data = load_raw_bad_habits_file()
    habits = data.get("habits", [])

    habit_id = f"bh_{int(time.time() * 1000)}"
    now_iso = datetime.now(timezone.utc).isoformat()

    valid_poids = int(poids) if poids in [1, 2, 3] else 2

    new_habit = {
        "id": habit_id,
        "nom": nom.strip(),
        "description": description.strip(),
        "poids": valid_poids,
        "influence": 100.0,
        "date_creation": now_iso,
        "date_derniere_rechute": None,
        "nombre_rechutes": 0,
        "dates_rechutes": []
    }

    habits.append(new_habit)
    data["habits"] = habits
    save_raw_bad_habits_file(data)

    new_habit_copy = dict(new_habit)
    new_habit_copy["etat"] = calculate_habit_state(new_habit_copy["influence"])
    return new_habit_copy


def update_bad_habit(habit_id: str, updates: dict) -> dict:
    """Met à jour les propriétés autorisées d'une mauvaise habitude."""
    data = load_raw_bad_habits_file()
    habits = data.get("habits", [])

    target = None
    for h in habits:
        if h.get("id") == habit_id:
            target = h
            break

    if not target:
        return None

    if "nom" in updates:
        target["nom"] = str(updates["nom"]).strip()
    if "description" in updates:
        target["description"] = str(updates["description"]).strip()
    if "poids" in updates and int(updates["poids"]) in [1, 2, 3]:
        target["poids"] = int(updates["poids"])
    if "influence" in updates:
        target["influence"] = float(updates["influence"])

    data["habits"] = habits
    save_raw_bad_habits_file(data)

    target_copy = dict(target)
    target_copy["etat"] = calculate_habit_state(target_copy["influence"])
    return target_copy


def delete_bad_habit(habit_id: str) -> bool:
    """Supprime une mauvaise habitude."""
    data = load_raw_bad_habits_file()
    habits = data.get("habits", [])

    new_habits = [h for h in habits if h.get("id") != habit_id]
    if len(new_habits) == len(habits):
        return False

    data["habits"] = new_habits
    save_raw_bad_habits_file(data)
    return True


def toggle_relapse(habit_id: str, date_str: str = None) -> dict:
    """
    Bascule (ajoute ou annule) une rechute pour une mauvaise habitude à une date donnée (defaut: aujourd'hui UTC).
    - Si la date est présente dans dates_rechutes, elle est annulée.
    - Sinon, la rechute du jour est enregistrée.
    """
    if not date_str:
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    data = load_raw_bad_habits_file()
    habits = data.get("habits", [])

    target = None
    for h in habits:
        if h.get("id") == habit_id:
            target = h
            break

    if not target:
        return None

    dates_rechutes = target.get("dates_rechutes", [])
    if not isinstance(dates_rechutes, list):
        dates_rechutes = []

    if date_str in dates_rechutes:
        # Annuler la rechute du jour
        dates_rechutes.remove(date_str)
        target["nombre_rechutes"] = max(0, int(target.get("nombre_rechutes", 1)) - 1)
    else:
        # Déclarer la rechute du jour
        dates_rechutes.append(date_str)
        target["date_derniere_rechute"] = datetime.now(timezone.utc).isoformat()
        target["nombre_rechutes"] = int(target.get("nombre_rechutes", 0)) + 1

    target["dates_rechutes"] = dates_rechutes
    data["habits"] = habits
    save_raw_bad_habits_file(data)

    target_copy = dict(target)
    target_copy["etat"] = calculate_habit_state(target_copy["influence"])
    target_copy["relapsed_today"] = date_str in dates_rechutes
    return target_copy


def declare_relapse(habit_id: str, date_str: str = None) -> dict:
    """
    Enregistre une rechute pour une mauvaise habitude à une date donnée.
    """
    return toggle_relapse(habit_id, date_str)

