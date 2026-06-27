# 🎓 Système de Suivi Étudiant Notion & Groq

Ce système permet à un étudiant à l'étranger de rassurer ses parents de manière automatisée en générant un tableau de bord quotidien. Le script extrait les données quotidiennes depuis vos bases Notion (Études, Dépenses, Revenus, Santé), les envoie à l'IA Groq (Llama 3) pour rédiger un rapport bienveillant, et réinjecte ce rapport dans une base de données Notion dédiée aux parents.

---

## 🛠️ Étape 1 : Configuration sur Notion

### 1. Créer une Intégration Notion
1. Allez sur [Notion Developers - My Integrations](https://www.notion.so/my-integrations).
2. Cliquez sur **+ New integration**.
3. Donnez-lui un nom (ex: "Suivi Parents"), associez-la à votre espace de travail et validez.
4. Copiez le **Internal Integration Token** (commençant par `ntn_...`). Vous le collerez dans le fichier `.env` sous la clé `NOTION_TOKEN`.

### 2. Partager vos Bases de Données avec l'Intégration
Pour chaque base de données (`Études`, `Dépenses`, `Revenus`, `Santé & Nutrition` et `Rapports Parents`) :
1. Ouvrez la base de données (en tant que page complète).
2. Cliquez sur les trois petits points `...` en haut à droite.
3. Allez dans **Connections** (ou Connecter à) -> **Add connections** et sélectionnez votre intégration ("Suivi Parents").

### 3. Récupérer les IDs des Bases de Données
Pour chaque base :
1. Copiez le lien de la base de données.
2. Le lien se présente ainsi : `https://www.notion.so/workspace_name/DATABASE_ID?v=...`
3. L'identifiant correspond aux 32 caractères situés après le nom de l'espace de travail et avant le point d'interrogation `?`.
   - *Exemple :* Si l'URL est `https://www.notion.so/myworkspace/a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6?v=123`, l'ID est `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`.

---

## 💻 Étape 2 : Installation & Configuration Locale

1. **Copier le fichier de configuration** :
   Dans le dossier du projet, renommez ou copiez le fichier `.env.example` en `.env` :
   ```bash
   cp .env.example .env
   ```
2. **Remplir le fichier `.env`** :
   Ouvrez le fichier `.env` et remplacez les valeurs fictives par vos identifiants réels :
   - `NOTION_TOKEN` : Votre jeton d'intégration Notion
   - Les 5 IDs de base de données récupérés à l'étape 1.
   - La clé `GROQ_API_KEY` est déjà pré-remplie avec votre clé.

3. **Installer les dépendances** :
   Si ce n'est pas déjà fait, installez les bibliothèques requises :
   ```bash
   pip install -r requirements.txt
   ```

---

## 🚀 Étape 3 : Utilisation & Phase de Test

### 1. Injecter des données de test
Puisque vos bases de données Notion sont actuellement vides, vous devez d'abord injecter de fausses données pour tester le bon fonctionnement du code.
Lancez le script d'injection :
```bash
python seed_data.py
```
*Vérifiez sur Notion : vous devriez voir des lignes ajoutées dans vos 4 bases de données avec la date d'aujourd'hui.*

### 2. Générer le rapport quotidien
Pour récupérer les données du jour, générer le rapport via l'IA et l'écrire dans la base `Rapports Parents`, lancez :
```bash
python main.py
```

*Optionnel :* Si vous souhaitez générer le rapport pour une date spécifique du passé (au format YYYY-MM-DD), passez-la en argument :
```bash
python main.py 2026-06-25
```

---

## 📈 Étape 4 : Automatisation Future

Une fois le système validé et stable, vous pourrez l'automatiser pour qu'il s'exécute automatiquement chaque soir (par exemple à 22h00) :

### Option A : GitHub Actions (Gratuit et Cloud)
Vous pouvez créer un workflow GitHub Actions qui lance le script tous les jours.
Il suffira d'ajouter vos clés d'API (Notion & Groq) dans les **Repository Secrets** de GitHub.

### Option B : Planificateur de tâches Windows (Local)
Si votre PC est allumé en soirée :
1. Ouvrez le **Planificateur de tâches** de Windows.
2. Créez une tâche de base qui se déclenche tous les jours à l'heure souhaitée.
3. Configurez l'action pour démarrer un programme : pointez vers votre exécutable `python.exe` et ajoutez le chemin de `main.py` en argument.
