import json
from groq import Groq
import config

# Initialisation du client Groq avec la clé API
client = Groq(api_key=config.GROQ_API_KEY)

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
                {"role": "user", "content": formatted_data}
            ],
            response_format={"type": "json_object"},
            temperature=0.7
        )
        
        raw_content = response.choices[0].message.content
        result_json = json.loads(raw_content)
        
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
