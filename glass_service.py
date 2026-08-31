"""
Service dédié au calcul de la capacité et du remplissage du verre d'eau.
Superpose l'eau propre (bonnes habitudes) et l'eau trouble (mauvaises habitudes).
Poids 1 = 1.0 place
Poids 2 = 2.0 places
Poids 3 = 3.0 places
"""

import notion_service
import bad_habits_service

def calculate_glass_state(date_str: str) -> dict:
    """
    Calcule l'état complet du verre d'eau pour une date donnée.
    - Capacité totale : Somme des poids (1, 2, 3) des bonnes habitudes (min 5.0)
    - Eau propre (clean_volume) : Somme des poids des bonnes habitudes cochées aujourd'hui (hors streak > 30j)
    - Eau trouble (trouble_volume) : Somme de (Poids * Influence / 100) uniquement pour les mauvaises habitudes rechutées ce jour-là
    - Overflow (eau expulsée) : surplus qui dépasse la capacité totale
    - Places occupées dans le grand verre : clean_volume + (trouble_volume - overflow_spilled) <= total_capacity
    """
    try:
        good_habits = notion_service.fetch_good_habits_and_streaks(date_str)
        bad_habits_list = bad_habits_service.get_all_bad_habits()
        weights = notion_service.get_habit_weights()

        checked_good = good_habits.get("checked_today", [])
        total_good = good_habits.get("total_today", [])
        streaks = good_habits.get("streaks", {})

        # Streak > 30j -> habitudes automatiques (prend 0 place)
        auto_habits = [name for name, streak in streaks.items() if streak > 30]

        # 1. Calcul du volume d'eau propre : Poids 1 = 1.0, Poids 2 = 2.0, Poids 3 = 3.0
        clean_volume = 0.0
        for habit_name in checked_good:
            if habit_name not in auto_habits:
                w = float(weights.get(habit_name, 2))
                clean_volume += w

        # 2. Calcul du volume d'eau trouble : uniquement les mauvaises habitudes RECHUTÉES aujourd'hui
        trouble_volume = 0.0
        processed_bad_habits = []
        for bh in bad_habits_list:
            bh_copy = dict(bh)
            dates_rechutes = bh_copy.get("dates_rechutes", [])
            last_relapse = bh_copy.get("date_derniere_rechute")

            # Une habitude a rechuté ce jour si date_str est dans dates_rechutes
            has_relapsed_today = (date_str in dates_rechutes)
            bh_copy["relapsed_today"] = has_relapsed_today

            if has_relapsed_today:
                p = float(bh_copy.get("poids", 2))
                inf = float(bh_copy.get("influence", 100.0))
                trouble_volume += p * (inf / 100.0)

            processed_bad_habits.append(bh_copy)

        # 3. Calcul de la capacité totale adaptative du verre : somme des poids de toutes les bonnes habitudes
        total_capacity = 0.0
        for habit_name in total_good:
            w = float(weights.get(habit_name, 2))
            total_capacity += w
        total_capacity = max(5.0, total_capacity) if total_good else 5.0

        # 4. Calcul de l'expulsion (overflow) et du volume effectif dans le grand verre
        total_raw_places = clean_volume + trouble_volume
        if total_raw_places > total_capacity and trouble_volume > 0:
            overflow_spilled = round(min(trouble_volume, total_raw_places - total_capacity), 2)
        else:
            overflow_spilled = 0.0

        # Volume d'eau trouble restant RÉELLEMENT dans le grand verre
        trouble_in_glass = round(max(0.0, trouble_volume - overflow_spilled), 2)

        # Les places occupées dans le verre = eau propre + eau trouble restante dans le verre (<= total_capacity)
        places_occupees = round(clean_volume + trouble_in_glass, 2)

        return {
            "success": True,
            "date": date_str,
            "good_habits": {
                "checked": checked_good,
                "total": total_good,
                "streaks": streaks,
                "auto_habits": auto_habits,
                "weights": weights
            },
            "bad_habits": {
                "all_habits": processed_bad_habits
            },
            "clean_volume": round(clean_volume, 2),
            "trouble_volume": round(trouble_volume, 2),
            "trouble_in_glass": trouble_in_glass,
            "mini_glass_spilled": overflow_spilled,
            "overflow_spilled": overflow_spilled,
            "places_occupees": places_occupees,
            "total_capacity": round(total_capacity, 2),
            "is_full": places_occupees >= total_capacity
        }
    except Exception as e:
        print(f"[ERROR] glass_service.calculate_glass_state: {e}")
        return {
            "success": False,
            "error": str(e),
            "date": date_str
        }


def get_weekly_glass_states(start_date_str: str = None) -> dict:
    """
    Calcule l'état du verre d'eau pour les 7 jours de la semaine à partir d'une date (Lundi à Dimanche).
    """
    from datetime import datetime, timedelta

    french_days = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
    french_months = ["Janv.", "Févr.", "Mars", "Avril", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."]

    try:
        if start_date_str:
            dt_input = datetime.strptime(start_date_str, "%Y-%m-%d")
        else:
            dt_input = datetime.now()
    except Exception:
        dt_input = datetime.now()

    # Alignement systématique sur le Lundi de la semaine
    lundi_dt = dt_input - timedelta(days=dt_input.weekday())
    dimanche_dt = lundi_dt + timedelta(days=6)

    today_str = datetime.now().strftime("%Y-%m-%d")

    days_data = []
    for i in range(7):
        cur_dt = lundi_dt + timedelta(days=i)
        cur_str = cur_dt.strftime("%Y-%m-%d")

        glass_state = calculate_glass_state(cur_str)

        day_name = french_days[i]
        display_date = f"{cur_dt.day} {french_months[cur_dt.month - 1]}"

        has_row = glass_state.get("good_habits", {}).get("has_row", False)
        clean_v = glass_state.get("clean_volume", 0.0)
        trouble_v = glass_state.get("trouble_volume", 0.0)
        is_today = (cur_str == today_str)
        has_data = is_today or has_row or (clean_v > 0) or (trouble_v > 0)

        days_data.append({
            "date": cur_str,
            "day_name": day_name,
            "display_date": display_date,
            "clean_volume": clean_v,
            "trouble_volume": trouble_v,
            "trouble_in_glass": glass_state.get("trouble_in_glass", 0.0),
            "mini_glass_spilled": glass_state.get("mini_glass_spilled", 0.0),
            "total_capacity": glass_state.get("total_capacity", 6.0),
            "is_today": is_today,
            "has_data": has_data
        })

    range_label = f"Semaine du {lundi_dt.day} {french_months[lundi_dt.month - 1]} au {dimanche_dt.day} {french_months[dimanche_dt.month - 1]} {dimanche_dt.year}"

    return {
        "success": True,
        "start_date": lundi_dt.strftime("%Y-%m-%d"),
        "end_date": dimanche_dt.strftime("%Y-%m-%d"),
        "range_label": range_label,
        "days": days_data
    }

