import os
from dotenv import load_dotenv

# Charger les variables du fichier .env s'il existe
load_dotenv(override=True)
# trigger reload

# Liste des variables requises pour le bon fonctionnement de l'application
REQUIRED_ENV_VARS = [
    "NOTION_TOKEN",
    "NOTION_DATABASE_STUDIES",
    "NOTION_DATABASE_EXPENSES",
    "NOTION_DATABASE_INCOME",
    "NOTION_DATABASE_HEALTH",
    "NOTION_DATABASE_REPORTS",
    "NOTION_DATABASE_PLAN",
    "NOTION_DATABASE_OBJECTIFS",
    "NOTION_DATABASE_PROJETS",
    "GROQ_API_KEY",
]

def check_config():
    """
    Vérifie si toutes les variables d'environnement obligatoires sont définies.
    Lève une exception ValueError en cas de configuration manquante.
    """
    missing_vars = [var for var in REQUIRED_ENV_VARS if not os.getenv(var)]
    if missing_vars:
        raise ValueError(
            f"Configuration incomplète. Les variables suivantes manquent dans votre fichier .env : "
            f"{', '.join(missing_vars)}. Veuillez copier .env.example vers .env et les remplir."
        )

# Configuration globale de l'application
NOTION_TOKEN = os.getenv("NOTION_TOKEN")
DATABASE_STUDIES = os.getenv("NOTION_DATABASE_STUDIES")
DATABASE_EXPENSES = os.getenv("NOTION_DATABASE_EXPENSES")
DATABASE_INCOME = os.getenv("NOTION_DATABASE_INCOME")
DATABASE_HEALTH = os.getenv("NOTION_DATABASE_HEALTH")
DATABASE_REPORTS = os.getenv("NOTION_DATABASE_REPORTS")
DATABASE_PLAN = os.getenv("NOTION_DATABASE_PLAN")
DATABASE_OBJECTIFS = os.getenv("NOTION_DATABASE_OBJECTIFS", "3927b78bada1802ca3c9cef47b53a3a2")
DATABASE_PROJETS = os.getenv("NOTION_DATABASE_PROJETS", "3947b78bada180f89ba8cf3520becbf7")
DATABASE_HABITS  = os.getenv("NOTION_DATABASE_HABITS",  "24b7b78bada1806cb949da2842d07bba")
DATABASE_STATS   = os.getenv("NOTION_DATABASE_STATS",   "24b7b78bada18090a1b4e15f41657dd9")
DATABASE_MODULES = os.getenv("NOTION_DATABASE_MODULES", "3927b78b-ada1-8028-9751-e768204c1392")

# ── Habits tracker property names ──────────────────────────────────────────
# Morning habits (🌅)
HABIT_MORNING_PROPS = [
    "English (45min)",
    "Science (5Hs)",
    "Reading (2 EN pages)",
    "Performing S",
    "Learning Notion (1H)",
]
# Evening / closure habits (🌙)
HABIT_EVENING_PROPS = [
    "\U0001f319 Planifier demain",
    "\U0001f319 Bilan journ\u00e9e",
    "\U0001f319 \u00c9crans off",
    "\U0001f319 Sommeil \u00e0 l'heure",
]
HABIT_SCORE_MATIN = "Score Matin"
HABIT_SCORE_SOIR  = "Score Soir"
HABIT_DATE_PROP   = "date"

# Plan du Jour property names
PLAN_DATE_PROP      = "Date"
PLAN_FAIT_PROP      = "Fait"
PLAN_PRIORITE_PROP  = "Priorité"
PLAN_OBJ_REL_PROP   = "\U0001f3af\xa0Objectifs :"

# Objectifs property names
OBJ_PROGRESS_PROP   = "Progression"   # will be created if missing
OBJ_STATUS_PROP     = "Status"

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_VISION_MODEL = os.getenv("GROQ_VISION_MODEL", "llama-3.2-11b-vision-preview")

