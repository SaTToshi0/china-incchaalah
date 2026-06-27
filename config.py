import os
from dotenv import load_dotenv

# Charger les variables du fichier .env s'il existe
load_dotenv(override=True)

# Liste des variables requises pour le bon fonctionnement de l'application
REQUIRED_ENV_VARS = [
    "NOTION_TOKEN",
    "NOTION_DATABASE_STUDIES",
    "NOTION_DATABASE_EXPENSES",
    "NOTION_DATABASE_INCOME",
    "NOTION_DATABASE_HEALTH",
    "NOTION_DATABASE_REPORTS",
    "NOTION_DATABASE_PLAN",
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

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
