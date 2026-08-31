"""
Moteur de calcul de l'influence des mauvaises habitudes.
Ce composant est préparé pour accueillir le futur système de bilans quotidiens.

En V1 : L'influence reste inchangée (aucun calcul automatique, aucune diminution automatique).
Le futur bilan quotidien utilisera la fonction evaluate_influence_change pour recalculer l'influence.
"""

def evaluate_influence_change(habit: dict, daily_review_data: dict = None) -> float:
    """
    Calcule et retourne la nouvelle valeur d'influence d'une mauvaise habitude.
    
    :param habit: Dictionnaire représentant la mauvaise habitude.
    :param daily_review_data: Données issues du bilan quotidien (futur composant).
    :return: Nouvelle valeur d'influence (float entre 0.0 et 100.0).
    """
    if not habit:
        return 100.0
        
    current_influence = float(habit.get("influence", 100.0))
    
    if not daily_review_data:
        # En V1, sans bilan quotidien, l'influence ne varie jamais automatiquement
        return current_influence
        
    # TODO (Future Version) : Connecter l'algorithme d'évolution de l'influence
    # basé sur les bilans quotidiens, les rechutes déclarées et le niveau d'engagement.
    return current_influence
