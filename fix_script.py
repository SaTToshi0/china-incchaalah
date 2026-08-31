import re
with open("static/script.js", "r", encoding="utf-8") as f:
    content = f.read()

old1 = """    const checkedGood = good.checked || [];
    const totalGood = good.total || [];
    const streaks = good.streaks || {};
    const autoHabits = good.auto_habits || [];"""

new1 = """    const checkedGood = good.checked || [];
    const totalGood = good.total || [];
    const streaks = good.streaks || {};
    const autoHabits = good.auto_habits || [];
    const weights = good.weights || {};"""

content = content.replace(old1, new1)

old2 = """    // Good habits
    if (totalGood.length === 0) {
        goodList.innerHTML = `<p style="font-size: 11.5px; color: #868e96; font-style: italic; padding: 8px 0;">Aucune bonne habitude dans Notion.</p>`;
    } else {
        goodList.innerHTML = totalGood.map(name => {
            const isChecked = checkedGood.includes(name);
            const streak = streaks[name] || 0;
            const isAuto = streak > 30;
            const checkClass = isChecked ? 'checked-good' : '';
            const checkMark = isChecked ? '?' : '';

            return `
                <div class="habit-row" onclick="toggleGoodHabit('${name.replace(/'/g, "\\'")}', ${!isChecked})">
                    <div class="habit-row-left">
                        <div class="habit-checkbox ${checkClass}">${checkMark}</div>
                        <span class="habit-name">${name}</span>
                    </div>
                    <div class="habit-row-right">
                        ${isAuto ? '<span class="habit-auto-badge">AUTO</span>' : ''}
                        <span class="habit-streak">?? ${streak}j</span>
                    </div>
                </div>
            `;
        }).join('');
    }"""

new2 = """    // Good habits
    if (totalGood.length === 0) {
        goodList.innerHTML = `<p style="font-size: 11.5px; color: #868e96; font-style: italic; padding: 8px 0;">Aucune bonne habitude dans Notion.</p>`;
    } else {
        const morningHabits = totalGood.filter(h => !h.trim().startsWith('??'));
        const eveningHabits = totalGood.filter(h => h.trim().startsWith('??'));

        const renderGroup = (habits) => {
            return habits.map(name => {
                const isChecked = checkedGood.includes(name);
                const streak = streaks[name] || 0;
                const isAuto = streak > 30;
                const weight = weights[name] || 2;
                const checkClass = isChecked ? 'checked-good' : '';
                const checkMark = isChecked ? '?' : '';

                return `
                    <div class="habit-row" onclick="toggleGoodHabit('${name.replace(/'/g, "\\'")}', ${!isChecked})">
                        <div class="habit-row-left">
                            <div class="habit-checkbox ${checkClass}">${checkMark}</div>
                            <span class="habit-name">${name}</span>
                        </div>
                        <div class="habit-row-right">
                            <button class="habit-weight-btn w${weight}" onclick="event.stopPropagation(); cycleHabitWeight('${name.replace(/'/g, "\\'")}', ${weight})">P${weight}</button>
                            ${isAuto ? '<span class="habit-auto-badge">AUTO</span>' : ''}
                            <span class="habit-streak">?? ${streak}j</span>
                        </div>
                    </div>
                `;
            }).join('');
        };
        
        let html = '';
        if (morningHabits.length > 0) {
            html += `<div style="font-size: 12px; font-weight: 600; color: var(--text-main); margin: 8px 0 4px 0;">?? Habitudes du Matin</div>`;
            html += renderGroup(morningHabits);
        }
        if (eveningHabits.length > 0) {
            html += `<div style="font-size: 12px; font-weight: 600; color: var(--text-main); margin: 12px 0 4px 0;">?? Habitudes du Soir</div>`;
            html += renderGroup(eveningHabits);
        }
        goodList.innerHTML = html;
    }"""

content = content.replace(old2, new2)

old3 = """async function toggleGoodHabit(name, newValue) {"""

new3 = """function cycleHabitWeight(name, currentWeight) {
    let newWeight = currentWeight + 1;
    if (newWeight > 3) newWeight = 1;
    changeHabitWeight(name, newWeight);
}

async function changeHabitWeight(name, weight) {
    try {
        const res = await fetch('/api/good_habits/weight', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, weight: weight })
        });
        const val = await res.json();
        if (val.success) loadHabitsData();
    } catch(err) {
        console.error('Failed to change habit weight:', err);
    }
}

async function toggleGoodHabit(name, newValue) {"""

content = content.replace(old3, new3)

with open("static/script.js", "w", encoding="utf-8") as f:
    f.write(content)
