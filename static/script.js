// --- APPLICATION STATE ---
let chatHistory = [];
let currentDate = ''; // Will be populated dynamically by the selected location
let selectedTaskId = null;
let currentTasks = [];
let databaseSchema = {}; // Dynamically fetched Notion properties
let selectedLocation = localStorage.getItem('selectedLocation') || 'Agadir';
let isRequestPending = false; // Verrouillage UI de chat pendant les requêtes
let bilanState = null; // État de la session du bilan de journée
let summaryItems = []; // Résumé des échanges pour le panneau latéral
let exchangeCounter = 0; // Compteur d'échanges
let hasAnalysisRun = false; // Flag pour lancer l'analyse une seule fois par objectif

let bulkCreationState = {
    current_step: null,
    tasks: []
};
let activeObjectivesCache = null;
const indicatorsCache = {};

// Initialize currentDate using browser local time in YYYY-MM-DD format
const localToday = new Date();
const yyyy = localToday.getFullYear();
const mm = String(localToday.getMonth() + 1).padStart(2, '0');
const dd = String(localToday.getDate()).padStart(2, '0');
currentDate = `${yyyy}-${mm}-${dd}`;

// --- DOM ELEMENTS ---
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
if (chatInput) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    if (descriptor) {
        Object.defineProperty(chatInput, 'value', {
            get() {
                return descriptor.get.call(this);
            },
            set(val) {
                descriptor.set.call(this, val);
                this.style.height = 'auto';
                if (val) {
                    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
                }
            }
        });
    }
    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
    });
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            chatForm.dispatchEvent(new Event('submit'));
        }
    });
}
const activeTasksList = document.getElementById('active-tasks-list');
const completedTasksList = document.getElementById('completed-tasks-list');
const currentDateBadge = document.getElementById('current-date-badge');
const chinaTimeDisplay = document.getElementById('china-time-display');
const moroccoTimeDisplay = document.getElementById('morocco-time-display');
const statusDot = document.getElementById('status-dot');
const sidebarToggle = document.getElementById('sidebar-toggle');
const taskSidebar = document.getElementById('task-sidebar');
const btnCloseDayDirect = document.getElementById('btn-close-day-direct');
const locationSelect = document.getElementById('location-select');

// Modal Elements
const taskModal = document.getElementById('task-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalForm = document.getElementById('modal-form');
const modalTaskId = document.getElementById('modal-task-id');
const modalTaskTitle = document.getElementById('modal-task-title');
const modalResultat = document.getElementById('modal-resultat');
const modalRessenti = document.getElementById('modal-ressenti');
const modalImpact = document.getElementById('modal-impact');

// Dynamic module colors
const NOTION_PASTEL_COLORS = [
    { name: 'blue', bg: 'rgba(37, 99, 235, 0.08)', border: 'rgba(37, 99, 235, 0.2)', text: '#1e40af', hex: '#3b82f6' },
    { name: 'green', bg: 'rgba(34, 197, 94, 0.08)', border: 'rgba(34, 197, 94, 0.2)', text: '#166534', hex: '#22c55e' },
    { name: 'orange', bg: 'rgba(249, 115, 22, 0.08)', border: 'rgba(249, 115, 22, 0.2)', text: '#9a3412', hex: '#f97316' },
    { name: 'purple', bg: 'rgba(168, 85, 247, 0.08)', border: 'rgba(168, 85, 247, 0.2)', text: '#6b21a8', hex: '#a855f7' },
    { name: 'pink', bg: 'rgba(236, 72, 153, 0.08)', border: 'rgba(236, 72, 153, 0.2)', text: '#9d174d', hex: '#ec4899' },
    { name: 'yellow', bg: 'rgba(234, 179, 8, 0.08)', border: 'rgba(234, 179, 8, 0.2)', text: '#713f12', hex: '#eab308' },
    { name: 'teal', bg: 'rgba(20, 184, 166, 0.08)', border: 'rgba(20, 184, 166, 0.2)', text: '#115e59', hex: '#14b8a6' }
];

function getModuleColor(moduleId) {
    if (!moduleId) return NOTION_PASTEL_COLORS[0];
    
    const savedColors = JSON.parse(localStorage.getItem('userModuleColors') || '{}');
    if (savedColors[moduleId]) {
        const found = NOTION_PASTEL_COLORS.find(c => c.name === savedColors[moduleId]);
        if (found) return found;
    }
    
    let hash = 0;
    for (let i = 0; i < moduleId.length; i++) {
        hash = moduleId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % NOTION_PASTEL_COLORS.length;
    return NOTION_PASTEL_COLORS[index];
}

function setModuleColor(moduleId, colorName) {
    const savedColors = JSON.parse(localStorage.getItem('userModuleColors') || '{}');
    savedColors[moduleId] = colorName;
    localStorage.setItem('userModuleColors', JSON.stringify(savedColors));
    loadAcademicData();
}

function toggleModuleColorMenu(event, moduleId) {
    event.stopPropagation();
    const menu = document.getElementById(`color-menu-${moduleId}`);
    if (!menu) return;
    
    const isOpen = menu.style.display === 'flex';
    
    document.querySelectorAll('.module-color-menu').forEach(m => {
        m.style.display = 'none';
    });
    
    if (!isOpen) {
        menu.style.display = 'flex';
        
        const clickOutside = (e) => {
            if (!menu.contains(e.target) && !e.target.closest('.btn-module-color')) {
                menu.style.display = 'none';
                document.removeEventListener('click', clickOutside);
            }
        };
        document.addEventListener('click', clickOutside);
    }
}

// --- HELPER FUNCTIONS ---

// Markdown-like parser for simple list items and formatting
function formatMarkdown(text) {
    // Escape HTML to prevent XSS
    let escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
        
    // Bold: **text**
    escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Lists: lines starting with "- " or "* "
    const lines = escaped.split('\n');
    let inList = false;
    let formattedHtml = '';
    
    for (let line of lines) {
        if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
            if (!inList) {
                formattedHtml += '<ul>';
                inList = true;
            }
            formattedHtml += `<li>${line.trim().substring(2)}</li>`;
        } else {
            if (inList) {
                formattedHtml += '</ul>';
                inList = false;
            }
            formattedHtml += `<p>${line}</p>`;
        }
    }
    if (inList) {
        formattedHtml += '</ul>';
    }
    
    return formattedHtml;
}

// Append message to Chat Area (with optional image support)
function appendMessage(role, content, imageBase64 = null, searchSteps = [], academicStatus = null, objectiveReview = null) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', role);
    messageDiv.dataset.originalText = content;
    const avatar = document.createElement('div');
    avatar.classList.add('avatar');
    if (role === 'ai') {
        avatar.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M12 2v2M8 5h8M12 11V9"/>
            </svg>
        `;
    } else {
        avatar.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
            </svg>
        `;
    }
    
    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content');
    
    // Si une image est fournie, on l'affiche en dessous du texte
    if (imageBase64) {
        const img = document.createElement('img');
        img.src = imageBase64;
        img.classList.add('chat-preview-image');
        contentDiv.appendChild(img);
    }
    
    if (role === 'ai' && searchSteps && searchSteps.length > 0 && !hasAnalysisRun) {
        hasAnalysisRun = true;
        
        // Phrase d'introduction obligatoire avant l'analyse
        const introParagraph = document.createElement('div');
        introParagraph.className = 'search-intro-text';
        introParagraph.style.fontSize = '14px';
        introParagraph.style.lineHeight = '1.5';
        introParagraph.style.marginBottom = '12px';
        introParagraph.style.color = 'var(--text-main)';
        introParagraph.innerHTML = `<p>Avant de créer un objectif, je dois vérifier votre situation académique en arrière-plan et comprendre les exigences du module.</p>`;
        contentDiv.appendChild(introParagraph);

        const searchDiv = document.createElement('div');
        searchDiv.className = 'search-steps-container';
        searchDiv.innerHTML = `
            <div class="search-header">
                <span class="search-spinner"></span>
                <span>Recherche d'informations en arrière-plan...</span>
            </div>
            <div class="search-steps-list"></div>
        `;
        contentDiv.appendChild(searchDiv);
        
        const stepsList = searchDiv.querySelector('.search-steps-list');
        
        // Supprimer dynamiquement tout préfixe d'introduction ou phrase d'arrière-plan du message IA final
        let cleanContent = content || "";
        cleanContent = cleanContent.replace(/Avant de créer un objectif, je dois vérifier votre situation académique en arrière-plan et comprendre les exigences du module\./gi, "");
        cleanContent = cleanContent.replace(/Avant de créer un objectif, je dois vérifier votre situation académique en arrière-plan\./gi, "");
        cleanContent = cleanContent.replace(/J'ai vérifié votre situation académique en arrière-plan et/gi, "");
        cleanContent = cleanContent.replace(/J'ai vérifié votre situation académique en arrière-plan\./gi, "");
        cleanContent = cleanContent.trim();
        if (cleanContent) {
            // Capitaliser la première lettre après le nettoyage
            cleanContent = cleanContent.charAt(0).toUpperCase() + cleanContent.slice(1);
        }
        
        let textDiv = null;
        if (!searchSteps || searchSteps.length === 0) {
            textDiv = document.createElement('div');
            textDiv.className = 'message-text-actual';
            textDiv.style.opacity = '0';
            textDiv.style.transition = 'opacity 0.5s ease';
            textDiv.innerHTML = formatMarkdown(cleanContent);
            contentDiv.appendChild(textDiv);
        }

        // Boîte de commentaire Notion pour l'Avis de l'IA (séparée du rapport)
        let commentDiv = null;
        if (objectiveReview) {
            commentDiv = document.createElement('div');
            commentDiv.className = 'notion-comment-box';
            commentDiv.style.opacity = '0';
            commentDiv.style.transition = 'opacity 0.5s ease';
            commentDiv.style.marginTop = '12px';
            commentDiv.innerHTML = `
                <div class="notion-comment-header">
                    <span>💬</span> Avis & Suggestions de l'IA
                </div>
                <div style="font-size: 12px; font-style: italic; color: rgba(55, 53, 47, 0.75); line-height: 1.5;">
                    ${objectiveReview}
                </div>
            `;
        }

        // Boîte de décision d'autorisation (style Notion Callout)
        let decisionDiv = null;
        if (searchSteps && searchSteps.length > 0 && academicStatus) {
            const isCritical = academicStatus.is_critical;
            const hasOrphans = academicStatus.modules_without_objectives && academicStatus.modules_without_objectives.length > 0;
            
            decisionDiv = document.createElement('div');
            decisionDiv.style.opacity = '0';
            decisionDiv.style.transition = 'opacity 0.5s ease';
            decisionDiv.style.marginTop = '12px';
            
            if (isCritical && hasOrphans) {
                decisionDiv.className = 'notion-decision-banner warning';
                decisionDiv.innerHTML = `
                    <div class="decision-banner-header">
                        <span>🔴</span> Décision : Restriction Académique Active
                    </div>
                    <div class="decision-banner-body">
                        Examens proches non préparés détectés. Vous devez impérativement vous concentrer sur la catégorie <strong>📚 Études</strong>. La création d'objectifs dans d'autres catégories (Sport, Personnel, Santé, etc.) est temporairement refusée.
                    </div>
                `;
            } else {
                decisionDiv.className = 'notion-decision-banner success';
                decisionDiv.innerHTML = `
                    <div class="decision-banner-header">
                        <span>🟢</span> Décision : Libre Création d'Objectifs
                    </div>
                    <div class="decision-banner-body">
                        Aucune urgence académique non préparée. Vous êtes libre de concevoir des objectifs dans les catégories de votre choix (Sport, Santé, Personnel, Social, etc.).
                    </div>
                `;
            }
        }

        // Appending blocks in the correct visual order
        if (decisionDiv) contentDiv.appendChild(decisionDiv);
        if (commentDiv) contentDiv.appendChild(commentDiv);
        
        let stepIdx = 0;
        function showNextStep() {
            if (stepIdx < searchSteps.length) {
                if (stepIdx > 0) {
                    const prevItem = stepsList.children[stepIdx - 1];
                    if (prevItem) {
                        prevItem.className = 'search-step-item completed';
                        const prevIcon = prevItem.querySelector('.search-step-icon');
                        if (prevIcon) prevIcon.className = 'search-step-icon completed';
                    }
                }
                
                const item = document.createElement('div');
                item.className = 'search-step-item active';
                item.innerHTML = `
                    <span class="search-step-icon active"></span>
                    <span>${searchSteps[stepIdx]}...</span>
                `;
                stepsList.appendChild(item);
                chatMessages.scrollTop = chatMessages.scrollHeight;
                
                stepIdx++;
                setTimeout(showNextStep, 800);
            } else {
                if (stepIdx > 0) {
                    const prevItem = stepsList.children[stepIdx - 1];
                    if (prevItem) {
                        prevItem.className = 'search-step-item completed';
                        const prevIcon = prevItem.querySelector('.search-step-icon');
                        if (prevIcon) prevIcon.className = 'search-step-icon completed';
                    }
                }
                
                setTimeout(() => {
                    searchDiv.classList.add('completed');
                    
                    let detailsHtml = '';
                    if (academicStatus) {
                        // 1. All exams grid
                        let examsListHtml = '';
                        if (academicStatus.all_future_exams && academicStatus.all_future_exams.length > 0) {
                            examsListHtml = academicStatus.all_future_exams.map(e => {
                                const color = getModuleColor(e.module_id);
                                return `
                                    <div class="exam-item-card">
                                        <div class="exam-item-left">
                                            <span>📅</span>
                                            <span class="exam-module-name" style="color: ${color.text}; background: ${color.bg}; padding: 2px 6px; border-radius: 4px; border: 1px solid ${color.border};">${e.module_name}</span>
                                            <span class="exam-badge-type">${e.type}</span>
                                        </div>
                                        <span class="exam-date-badge">le ${e.date}</span>
                                    </div>
                                `;
                            }).join('');
                        } else {
                            examsListHtml = `<div class="exam-item-card" style="justify-content: center; color: var(--text-muted); font-style: italic;">Aucun examen à venir</div>`;
                        }

                        // 2. Modules and objectives schema
                        let schemaHtml = '';
                        const allModules = [
                            ...(academicStatus.modules_with_objectives || []),
                            ...(academicStatus.modules_without_objectives || [])
                        ];
                        if (allModules.length > 0) {
                            schemaHtml = allModules.map(m => {
                                const validObjs = m.objectifs || [];
                                const invalidObjs = m.invalid_objectives || [];
                                const allObjs = [...validObjs, ...invalidObjs];
                                
                                const hasObj = allObjs.length > 0;
                                const hasValidObj = validObjs.length > 0;
                                
                                let objText = '';
                                if (hasObj) {
                                    objText = allObjs.map(o => {
                                        if (o.is_valid) {
                                            return `🎯 ${o.title} (${o.progress}%)`;
                                        } else {
                                            return `⚠️ ${o.title} (Incomplet / ${o.progress}%)`;
                                        }
                                    }).join('<br>');
                                } else {
                                    objText = `⚠️ Aucun objectif actif`;
                                }
                                
                                // Determiner le statut de la connexion
                                let statusText = 'Orphelin';
                                let statusClass = 'warning';
                                let lineClass = 'warning';
                                
                                if (hasObj) {
                                    if (m.progress === 100) {
                                        statusText = 'Terminé (100%)';
                                        statusClass = 'active';
                                        lineClass = 'active';
                                    } else if (m.progress === 0) {
                                        statusText = 'Non débuté (0%)';
                                        statusClass = 'warning-orange';
                                        lineClass = 'warning-orange';
                                    } else {
                                        statusText = `En cours (${m.progress}%)`;
                                        statusClass = 'in-progress';
                                        lineClass = 'in-progress';
                                    }
                                }
                                
                                const objNodeClass = hasValidObj ? '' : 'empty';
                                const color = getModuleColor(m.id || m.module_id);

                                return `
                                    <div class="mapping-row">
                                        <div class="mapping-node module" style="background: ${color.bg}; border: 1px solid ${color.border}; color: ${color.text}; font-weight: 600;">
                                            ${m.module_name || m.name} (${m.progress}%)
                                        </div>
                                        <div class="mapping-connector">
                                            <span class="mapping-status-label ${statusClass}" style="${hasValidObj ? `background: ${color.text}; color: #ffffff;` : ''}">${statusText}</span>
                                            <div class="mapping-line ${lineClass}" style="${hasValidObj ? `background-color: ${color.hex};` : ''}"></div>
                                        </div>
                                        <div class="mapping-node objective ${objNodeClass}" style="${hasValidObj ? `background: ${color.bg}; border: 1px solid ${color.border}; color: ${color.text}; font-weight: 600;` : ''}">
                                            ${objText}
                                        </div>
                                    </div>
                                `;
                            }).join('');
                        } else {
                            schemaHtml = `<div style="text-align: center; color: var(--text-muted); font-style: italic; padding: 8px;">Aucun module critique détecté</div>`;
                        }

                        // 3. Detailed content of active objectives
                        let objectivesDetailsHtml = '';
                        const objectivesList = [];
                        const addObjToList = (o) => {
                            if (!objectivesList.some(item => item.id === o.id)) {
                                objectivesList.push(o);
                            }
                        };
                        
                        (academicStatus.modules_with_objectives || []).forEach(m => {
                            if (m.objectifs) m.objectifs.forEach(addObjToList);
                            if (m.invalid_objectives) m.invalid_objectives.forEach(addObjToList);
                        });
                        
                        (academicStatus.modules_without_objectives || []).forEach(m => {
                            if (m.invalid_objectives) m.invalid_objectives.forEach(addObjToList);
                        });

                        if (objectivesList.length > 0) {
                            if (objectivesList.length === 1) {
                                const o = objectivesList[0];
                                objectivesDetailsHtml = `
                                    <div class="objective-content-card active">
                                        <div class="obj-card-title" style="display: flex; align-items: center; justify-content: space-between;">
                                            <span>${o.is_valid ? '🎯' : '⚠️'} ${o.title} (${o.progress}%)</span>
                                            ${o.categorie ? `<span class="objective-category-badge" style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(55, 53, 47, 0.08); color: var(--text-main); font-weight: 500;">${o.categorie}</span>` : ''}
                                        </div>
                                        
                                        <!-- Barre de progression -->
                                        <div style="background: var(--bg-hover); height: 6px; border-radius: 3px; overflow: hidden; margin: 8px 0 12px 0;">
                                            <div style="background: ${o.progress === 100 ? '#2e7d32' : (o.progress === 0 ? '#d32f2f' : '#0288d1')}; height: 100%; width: ${o.progress}%;"></div>
                                        </div>

                                        <div class="obj-card-field">
                                            <div class="obj-card-field-label">Critère de réussite</div>
                                            <div class="obj-card-field-value">${o.critere || "Non spécifié"}</div>
                                        </div>
                                        <div class="obj-card-field" style="margin-top: 8px;">
                                            <div class="obj-card-field-label">Indicateurs</div>
                                            <div class="obj-card-field-value">${o.indicateurs || "Non spécifié"}</div>
                                        </div>
                                    </div>
                                `;
                            } else {
                                const tabsHeader = `
                                    <div class="objectives-tabs-header">
                                        ${objectivesList.map((o, idx) => `
                                            <button class="obj-tab-btn ${idx === 0 ? 'active' : ''}" data-index="${idx}">
                                                ${o.is_valid ? '🎯' : '⚠️'} ${o.title} (${o.progress}%)
                                            </button>
                                        `).join('')}
                                    </div>
                                `;
                                
                                const tabsContent = `
                                    <div class="objectives-tabs-content">
                                        ${objectivesList.map((o, idx) => `
                                            <div class="objective-content-card obj-tab-content-${idx} ${idx === 0 ? 'active' : ''}" style="${idx === 0 ? '' : 'display: none;'}">
                                                <div class="obj-card-title" style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 6px; margin-bottom: 8px;">
                                                    <span style="font-weight: 600;">${o.is_valid ? '🎯' : '⚠️'} ${o.title} (${o.progress}%)</span>
                                                    ${o.categorie ? `<span class="objective-category-badge" style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(55, 53, 47, 0.08); color: var(--text-main); font-weight: 500;">${o.categorie}</span>` : ''}
                                                </div>
                                                
                                                <!-- Barre de progression -->
                                                <div style="background: var(--bg-hover); height: 6px; border-radius: 3px; overflow: hidden; margin: 8px 0 12px 0;">
                                                    <div style="background: ${o.progress === 100 ? '#2e7d32' : (o.progress === 0 ? '#d32f2f' : '#0288d1')}; height: 100%; width: ${o.progress}%;"></div>
                                                </div>

                                                <div class="obj-card-field">
                                                    <div class="obj-card-field-label">Critère de réussite</div>
                                                    <div class="obj-card-field-value">${o.critere || "Non spécifié"}</div>
                                                </div>
                                                <div class="obj-card-field" style="margin-top: 8px;">
                                                    <div class="obj-card-field-label">Indicateurs</div>
                                                    <div class="obj-card-field-value">${o.indicateurs || "Non spécifié"}</div>
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                `;
                                objectivesDetailsHtml = tabsHeader + tabsContent;
                            }
                        } else {
                            objectivesDetailsHtml = `<div class="objective-content-card" style="text-align: center; color: var(--text-muted); font-style: italic;">Aucun objectif actif à analyser</div>`;
                        }

                        detailsHtml = `
                            <div class="search-steps-details" style="display: none;">
                                <div class="verification-report">
                                    <div class="verification-title">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                            <polyline points="14 2 14 8 20 8"/>
                                            <line x1="16" y1="13" x2="8" y2="13"/>
                                            <line x1="16" y1="17" x2="8" y2="17"/>
                                            <polyline points="10 9 9 9 8 9"/>
                                        </svg>
                                        Rapport d'Analyse Académique
                                    </div>
                                    
                                    <div class="report-section">
                                        <div class="report-section-title">1. Examens à venir détectés</div>
                                        <div class="exams-grid">${examsListHtml}</div>
                                    </div>
                                    
                                    <div class="report-section" style="margin-top: 16px;">
                                        <div class="report-section-title">2. Cartographie des objectifs</div>
                                        <div class="mapping-diagram">${schemaHtml}</div>
                                    </div>
                                    
                                    <div class="report-section" style="margin-top: 16px;">
                                        <div class="report-section-title">3. Détail du contenu des objectifs</div>
                                        <div class="objectives-details-container">${objectivesDetailsHtml}</div>
                                    </div>
                                </div>
                            </div>
                        `;
                    } else {
                        detailsHtml = `
                            <div class="search-steps-details" style="display: none; padding-top: 10px; border-top: 1px solid rgba(55, 53, 47, 0.1); margin-top: 8px;">
                                ${searchSteps.map(s => `<div style="font-size:11.5px; color:#2e7d32; margin:2px 0;">✓ ${s}</div>`).join('')}
                            </div>
                        `;
                    }

                    searchDiv.innerHTML = `
                        <div class="search-steps-summary" onclick="const details = this.nextElementSibling; details.style.display = details.style.display === 'none' ? 'block' : 'none'">
                            <span>✓</span> Recherche effectuée (${searchSteps.length} étapes) — Cliquez pour voir le rapport
                        </div>
                        ${detailsHtml}
                    `;
                    
                    // Add tab switching logic if multiple objectives exist
                    const tabBtns = searchDiv.querySelectorAll('.obj-tab-btn');
                    tabBtns.forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            e.stopPropagation(); // Avoid collapsing report details container
                            const idx = btn.getAttribute('data-index');
                            
                            // Set active tab class
                            btn.parentElement.querySelectorAll('.obj-tab-btn').forEach(b => b.classList.remove('active'));
                            btn.classList.add('active');
                            
                            // Toggle visible content card
                            const container = btn.closest('.report-section');
                            container.querySelectorAll('.objective-content-card').forEach((card, cIdx) => {
                                if (cIdx === parseInt(idx)) {
                                    card.classList.add('active');
                                    card.style.display = 'block';
                                } else {
                                    card.classList.remove('active');
                                    card.style.display = 'none';
                                }
                            });
                        });
                    });
                    
                    if (textDiv) {
                        textDiv.style.opacity = '1';
                    }
                    if (decisionDiv) {
                        decisionDiv.style.opacity = '1';
                    }
                    if (commentDiv) {
                        commentDiv.style.opacity = '1';
                    }
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }, 400);
            }
        }
        
        setTimeout(showNextStep, 300);
    } else {
        const textDiv = document.createElement('div');
        textDiv.innerHTML = role === 'ai' ? formatMarkdown(content) : `<p>${content}</p>`;
        contentDiv.appendChild(textDiv);
        
        if (role === 'user' && content !== "Image envoyée 🖼️") {
            const editBtn = document.createElement('button');
            editBtn.className = 'edit-prompt-btn';
            editBtn.title = 'Modifier le message';
            editBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
            `;
            contentDiv.appendChild(editBtn);
            
            editBtn.addEventListener('click', () => {
                if (contentDiv.querySelector('.edit-prompt-container')) return;
                
                const originalText = messageDiv.dataset.originalText;
                const editContainer = document.createElement('div');
                editContainer.className = 'edit-prompt-container';
                editContainer.innerHTML = `
                    <textarea class="edit-prompt-textarea">${originalText}</textarea>
                    <div class="edit-prompt-actions">
                        <button class="btn-cancel-edit">Annuler</button>
                        <button class="btn-resend-edit">Renvoyer</button>
                    </div>
                `;
                
                textDiv.style.display = 'none';
                editBtn.style.display = 'none';
                contentDiv.appendChild(editContainer);
                
                const textarea = editContainer.querySelector('.edit-prompt-textarea');
                textarea.focus();
                textarea.setSelectionRange(textarea.value.length, textarea.value.length);

                const adjustHeight = () => {
                    textarea.style.height = 'auto';
                    textarea.style.height = textarea.scrollHeight + 'px';
                };
                textarea.addEventListener('input', adjustHeight);
                setTimeout(adjustHeight, 20);

                textarea.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        editContainer.querySelector('.btn-resend-edit').click();
                    }
                });
                
                editContainer.querySelector('.btn-cancel-edit').addEventListener('click', () => {
                    editContainer.remove();
                    textDiv.style.display = '';
                    editBtn.style.display = '';
                });
                
                editContainer.querySelector('.btn-resend-edit').addEventListener('click', () => {
                    const newText = textarea.value.trim();
                    if (newText) {
                        const allMessages = Array.from(chatMessages.querySelectorAll('.message'));
                        const msgIdx = allMessages.indexOf(messageDiv);
                        
                        if (msgIdx !== -1) {
                            // Supprimer tous les messages du DOM à partir de celui-ci
                            for (let i = allMessages.length - 1; i >= msgIdx; i--) {
                                allMessages[i].remove();
                            }
                            
                            // Reconstruire chatHistory depuis le DOM restant
                            chatHistory = [];
                            const remaining = Array.from(chatMessages.querySelectorAll('.message'));
                            remaining.forEach(m => {
                                if (m.dataset.originalText) {
                                    const mRole = m.classList.contains('user') ? 'user' : 'assistant';
                                    chatHistory.push({ role: mRole, content: m.dataset.originalText });
                                }
                            });
                            
                            // Renvoyer le message
                            sendChatMessage(newText);
                        }
                    }
                });
            });
        }
    }
    
    // Add "Développer" button on AI messages
    if (role === 'ai') {
        const developBtn = document.createElement('button');
        developBtn.className = 'develop-btn';
        developBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17l9.2-9.2M17 17V7H7"/></svg> Développer`;
        developBtn.addEventListener('click', () => openDevelopZone(contentDiv, content));
        contentDiv.appendChild(developBtn);
    }
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Show/Hide typing indicator (with optional image scanner support)
let typingIndicator = null;
function showTypingIndicator(hasImage = false, imageBase64 = null) {
    if (typingIndicator) return;
    
    typingIndicator = document.createElement('div');
    typingIndicator.classList.add('message', 'ai');
    
    const avatar = document.createElement('div');
    avatar.classList.add('avatar');
    avatar.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M12 2v2M8 5h8M12 11V9"/>
        </svg>
    `;
    
    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content');
    
    if (hasImage && imageBase64) {
        // Animation premium de scan laser d'image
        const scanner = document.createElement('div');
        scanner.className = 'image-scan-container';
        scanner.innerHTML = `
            <img src="${imageBase64}" class="image-scan-img">
            <div class="image-scan-laser"></div>
            <div class="image-scan-text">ANALYSE EN COURS...</div>
        `;
        contentDiv.appendChild(scanner);
    } else {
        // Indicateur d'écriture classique
        const indicator = document.createElement('div');
        indicator.classList.add('typing-indicator');
        indicator.innerHTML = '<span></span><span></span><span></span>';
        contentDiv.appendChild(indicator);
    }
    
    typingIndicator.appendChild(avatar);
    typingIndicator.appendChild(contentDiv);
    chatMessages.appendChild(typingIndicator);
    
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function hideTypingIndicator() {
    if (typingIndicator && typingIndicator.parentNode) {
        typingIndicator.parentNode.removeChild(typingIndicator);
        typingIndicator = null;
    }
}

// Get Badge Classes
function getPriorityClass(priority) {
    if (priority.includes('Haute')) return 'badge-priority-high';
    if (priority.includes('Moyenne')) return 'badge-priority-medium';
    return 'badge-priority-low';
}

function getCategoryClass(category) {
    if (category.includes('Études')) return 'badge-cat-studies';
    if (category.includes('Sport')) return 'badge-cat-sport';
    if (category.includes('Santé')) return 'badge-cat-health';
    if (category.includes('Social')) return 'badge-cat-social';
    if (category.includes('Personnel')) return 'badge-cat-personnel';
    if (category.includes('Finances')) return 'badge-cat-finances';
    if (category.includes('Maison')) return 'badge-cat-maison';
    return 'badge-cat-default';
}

// Render Notion Task Items in Sidebar
function renderTasks(tasks) {
    currentTasks = tasks;
    activeTasksList.innerHTML = '';
    completedTasksList.innerHTML = '';
    
    let activeCount = 0;
    let completedCount = 0;
    
    tasks.forEach(task => {
        // Filter out archived status
        if (task.status === '🗄️ Archivé') return;
        
        const li = document.createElement('li');
        li.classList.add('task-item');
        if (task.fait) {
            li.classList.add('completed');
        }
        
        // Custom Checkbox
        const checkContainer = document.createElement('div');
        checkContainer.classList.add('task-checkbox-container');
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.classList.add('task-checkbox');
        checkbox.checked = task.fait;
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent opening modal
            toggleTask(task.id, task.fait);
        });
        checkContainer.appendChild(checkbox);
        
        // Details
        const details = document.createElement('div');
        details.classList.add('task-details');
        
        const title = document.createElement('div');
        title.classList.add('task-title');
        title.textContent = task.objectif;
        details.appendChild(title);
        
        // Metadata (Priority, Category, etc.)
        const meta = document.createElement('div');
        meta.classList.add('task-meta');
        
        const catBadge = document.createElement('span');
        catBadge.classList.add('badge', getCategoryClass(task.categorie));
        catBadge.textContent = task.categorie;
        meta.appendChild(catBadge);
        
        const priBadge = document.createElement('span');
        priBadge.classList.add('badge', getPriorityClass(task.priorite));
        priBadge.textContent = task.priorite.split(' ')[1] || task.priorite; // Strip emoji
        meta.appendChild(priBadge);
        
        // If has diagnostic or result, show indicator
        if (task.resultat && task.resultat !== 'Non spécifié') {
            const resBadge = document.createElement('span');
            resBadge.classList.add('badge');
            resBadge.style.backgroundColor = '#f1f1ef';
            resBadge.style.color = '#37352f';
            resBadge.textContent = task.resultat;
            meta.appendChild(resBadge);
        }
        
        details.appendChild(meta);
        li.appendChild(checkContainer);
        li.appendChild(details);
        
        // Double click or single click to edit details (reflection modal)
        li.addEventListener('click', () => {
            openReflectionModal(task);
        });
        
        if (task.fait) {
            completedTasksList.appendChild(li);
            completedCount++;
        } else {
            activeTasksList.appendChild(li);
            activeCount++;
        }
    });
    
    if (activeCount === 0) {
        activeTasksList.innerHTML = '<li class="empty-state">Aucune tâche active</li>';
    }
    if (completedCount === 0) {
        completedTasksList.innerHTML = '<li class="empty-state">Aucune tâche complétée</li>';
    }
}

// --- API ACTIONS ---

// Fetch System Status & Time
async function fetchStatus() {
    try {
        const response = await fetch(`/api/status?location=${selectedLocation}&date=${currentDate}`);
        const data = await response.json();
        
        if (data.config_ok) {
            statusDot.classList.add('online');
            statusDot.classList.remove('offline');
        } else {
            statusDot.classList.add('offline');
            statusDot.classList.remove('online');
            console.error('Configuration Notion incomplète:', data.error_message);
        }
        
        currentDate = data.china_date;
        currentDateBadge.textContent = `${data.day_of_week} ${currentDate.split('-').reverse().join('/')}`;
        chinaTimeDisplay.textContent = `CN : ${data.china_time}`;
        moroccoTimeDisplay.textContent = `MA : ${data.morocco_time}`;
        
        fetchTasks();
    } catch (e) {
        console.error('Erreur de communication avec le serveur:', e);
        statusDot.classList.add('offline');
        statusDot.classList.remove('online');
    }
}

// Comparateur pour éviter le scintillement (anti-flicker)
function tasksAreEqual(list1, list2) {
    if (!list1 || !list2) return false;
    if (list1.length !== list2.length) return false;
    for (let i = 0; i < list1.length; i++) {
        const t1 = list1[i];
        const t2 = list2[i];
        if (t1.id !== t2.id) return false;
        if (t1.fait !== t2.fait) return false;
        if (t1.status !== t2.status) return false;
        if (t1.objectif !== t2.objectif) return false;
        if (t1.categorie !== t2.categorie) return false;
        if (t1.priorite !== t2.priorite) return false;
        if (t1.resultat !== t2.resultat) return false;
        if (t1.ressenti !== t2.ressenti) return false;
        if (t1.impact !== t2.impact) return false;
        
        // Comparer le tableau diagnostic
        if (!t1.diagnostic || !t2.diagnostic) return false;
        if (t1.diagnostic.length !== t2.diagnostic.length) return false;
        for (let j = 0; j < t1.diagnostic.length; j++) {
            if (t1.diagnostic[j] !== t2.diagnostic[j]) return false;
        }
    }
    return true;
}

// Fetch Plan Tasks
async function fetchTasks() {
    try {
        const response = await fetch(`/api/tasks?date=${currentDate}&location=${selectedLocation}`);
        const data = await response.json();
        
        // Réaffichage uniquement en cas de modifications réelles (évite le scintillement)
        if (!tasksAreEqual(currentTasks, data.tasks)) {
            console.log("[SYNC] Modification détectée dans Notion, re-rendering...");
            renderTasks(data.tasks);
        }
    } catch (e) {
        console.error('Erreur lors de la récupération des tâches:', e);
    }
}

// Toggle Task Done/Undone Directly
async function toggleTask(id, currentStatus) {
    try {
        const response = await fetch('/api/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'toggle_task',
                id: id,
                done: currentStatus,
                date: currentDate,
                location: selectedLocation
            })
        });
        const data = await response.json();
        if (data.success) {
            renderTasks(data.tasks);
        }
    } catch (e) {
        console.error('Erreur de mise à jour de la tâche:', e);
    }
}

// Close Day Direct Trigger
async function closeDayDirect() {
    if (!confirm('Êtes-vous sûr de vouloir clôturer la journée ? Cela va archiver vos tâches actives et actualiser le tableau de bord.')) {
        return;
    }
    
    showTypingIndicator();
    try {
        const response = await fetch('/api/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'close_day',
                date: currentDate,
                location: selectedLocation
            })
        });
        const data = await response.json();
        hideTypingIndicator();
        
        if (data.success) {
            appendMessage('ai', "☀️ **Journée Clôturée !** \nLes tâches accomplies ont été archivées. Si vous avez des tâches non terminées, la fenêtre de replanification va s'afficher ci-dessous.");
            renderTasks(data.tasks);
            // Immediately open rescheduling modal for uncompleted tasks!
            checkAndPromptPendingRescheduleTasks();
        } else {
            appendMessage('ai', `❌ Une erreur est survenue lors de la clôture : ${data.error}`);
        }
    } catch (e) {
        hideTypingIndicator();
        appendMessage('ai', "❌ Impossible de se connecter au serveur pour clôturer la journée.");
    }
}

// Fonction de verrouillage de l'UI pendant les requêtes
function setUILocked(locked) {
    isRequestPending = locked;
    chatInput.disabled = locked;
    
    const sendBtn = document.getElementById('btn-send');
    if (sendBtn) {
        sendBtn.disabled = locked;
        sendBtn.style.opacity = locked ? '0.5' : '1';
    }
    
    // Désactiver les suggestions rapides
    document.querySelectorAll('.chip').forEach(chip => {
        chip.disabled = locked;
        chip.style.opacity = locked ? '0.5' : '1';
        chip.style.pointerEvents = locked ? 'none' : 'auto';
    });
}

// Fonction d'affichage de la notification de mémoire style ChatGPT
function showMemoryNotification(preference) {
    let notif = document.getElementById('memory-notification');
    if (!notif) {
        notif = document.createElement('div');
        notif.id = 'memory-notification';
        notif.className = 'memory-notification';
        document.body.appendChild(notif);
    }
    
    notif.innerHTML = `<span>✨</span> <strong>Information mémorisée :</strong> &nbsp;<em>"${preference}"</em>`;
    
    // Afficher la notification avec transition
    setTimeout(() => {
        notif.classList.add('show');
    }, 50);
    
    // Masquer après 4 secondes
    setTimeout(() => {
        notif.classList.remove('show');
    }, 4500);
}

// Chat turn send message (with support for image uploads)
async function sendChatMessage(userMessage) {
    if (!userMessage && !selectedImageBase64) return;

    if (userMessage === "Faire le bilan de fin de journée" || userMessage === "Faire le bilan de journée") {
        startBilanFlow();
        chatInput.value = '';
        return;
    }
    if (isRequestPending) return;
    
    setUILocked(true);
    
    // Afficher le message utilisateur (avec l'aperçu d'image si présente)
    const imgUrl = selectedImageBase64 ? `data:image/jpeg;base64,${selectedImageBase64}` : null;
    appendMessage('user', userMessage || "Image envoyée 🖼️", imgUrl);
    chatInput.value = '';
    
    // Ajouter à l'historique du chat
    chatHistory.push({ role: 'user', content: userMessage || "Image envoyée 🖼️" });
    
    // Afficher l'indicateur d'écriture (et le scanner si image présente)
    showTypingIndicator(!!selectedImageBase64, imgUrl);
    
    // Extraire l'image à envoyer et réinitialiser l'uploader
    const imgToSend = selectedImageBase64;
    selectedImageBase64 = null;
    
    const imageUploadInput = document.getElementById('image-upload');
    const labelUpload = document.querySelector('.btn-upload');
    if (imageUploadInput) imageUploadInput.value = '';
    if (labelUpload) {
        labelUpload.style.color = '';
        labelUpload.style.background = '';
    }
    
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: chatHistory,
                date: currentDate,
                location: selectedLocation,
                image: imgToSend
            })
        });
        const data = await response.json();
        hideTypingIndicator();
        
        if (data.message) {
            appendMessage('ai', data.message, null, data.search_steps, data.academic_status, data.objective_review);
            chatHistory.push({ role: 'assistant', content: data.message });
            // Auto-generate summary entry for the sidebar
            addSummaryItem(userMessage || "Image envoyée 🖼️", data.message, data.summary, data.summary_title);
            
            // Limit local history size
            if (chatHistory.length > 25) {
                chatHistory.splice(0, chatHistory.length - 25);
            }
        }
        
        if (data.tasks) {
            renderTasks(data.tasks);
        }
        
        // Afficher le composant sélecteur interactif Notion si l'IA le suggère
        if (data.interactive_property) {
            const prop = data.interactive_property;
            appendInteractiveSelector(prop.name, prop.task_id, prop.multiple);
        }

        // Afficher le sélecteur d'objectifs pour lier la tâche
        if (data.pending_relation) {
            const rawPri = data.pending_relation.priorite || 'Moyenne';
            const pri = rawPri.includes('Basse') ? 'Basse' : (rawPri.includes('Haute') ? 'Haute' : 'Moyenne');
            appendSoloRelationMapper({
                name: data.pending_relation.nom,
                priority: pri
            }, {
                objective_id: null,
                indicator_id: null
            });
        }
        
        // Gérer les actions de création (Bulk & Solo)
        if (data.actions_requested) {
            data.actions_requested.forEach(act => {
                if (act.type === 'bulk_name_input') {
                    appendBulkNameInput();
                } else if (act.type === 'bulk_priority_selector') {
                    appendBulkPrioritySelector(act.tasks || []);
                } else if (act.type === 'bulk_relation_mapper') {
                    appendBulkRelationMapper(act.tasks || [], act.groups || []);
                } else if (act.type === 'solo_name_input') {
                    appendSoloNameInput();
                } else if (act.type === 'solo_priority_selector') {
                    appendSoloPrioritySelector(act.task || {});
                } else if (act.type === 'solo_relation_mapper') {
                    appendSoloRelationMapper(act.task || {}, act.suggested_group || {});
                } else if (act.type === 'objective_name_input') {
                    appendObjectiveNameInput();
                } else if (act.type === 'objective_name_input_restricted') {
                    appendObjectiveNameInputRestricted(act.module_name || "", act.module_id || "");
                } else if (act.type === 'objective_category_selector') {
                    appendObjectiveCategorySelector(act.objective_name || "");
                } else if (act.type === 'objective_structuring') {
                    appendObjectiveStructuring(act.objective_name || "", act.category || "");
                } else if (act.type === 'objective_date_picker') {
                    appendObjectiveDatePicker(act.objective_name || "", act.category || "", act.critere || "", act.indicators || []);
                }
            });
        }
        
        // Afficher la notification de mémorisation si présente
        if (data.memorized) {
            showMemoryNotification(data.memorized);
        }
    } catch (e) {
        hideTypingIndicator();
        appendMessage('ai', "❌ Désolé, je n'arrive pas à communiquer avec le serveur.");
        console.error('Chat error:', e);
    } finally {
        setUILocked(false);
    }
}

function styleRequiredSelects(cardElement) {
    const selects = cardElement.querySelectorAll('select.bulk-select, select.category-select');
    selects.forEach(select => {
        const row = select.closest('.bulk-relation-select-row') || select.closest('.category-row');
        if (row && row.style.display === 'none') {
            select.style.borderColor = '#EDECE9';
            select.style.backgroundColor = '#ffffff';
            return;
        }
        
        if (select.value === "") {
            select.style.borderColor = '#e03131';
            select.style.backgroundColor = '#fff5f5';
        } else {
            select.style.borderColor = '#EDECE9';
            select.style.backgroundColor = '#ffffff';
        }
    });
}

async function sendBulkChatMessage(userDisplayMessage, backendPayload) {
    if (isRequestPending) return;
    setUILocked(true);
    
    // Afficher le message utilisateur propre
    appendMessage('user', userDisplayMessage);
    
    // Ajouter le message avec le payload technique à l'historique pour le LLM
    chatHistory.push({ role: 'user', content: backendPayload });
    
    // Afficher l'indicateur d'écriture
    showTypingIndicator(false);
    
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: chatHistory,
                date: currentDate,
                location: selectedLocation
            })
        });
        const data = await response.json();
        hideTypingIndicator();
        
        if (data.message) {
            appendMessage('ai', data.message, null, data.search_steps, data.academic_status, data.objective_review);
            chatHistory.push({ role: 'assistant', content: data.message });
            
            // Auto-generate summary entry for the sidebar
            addSummaryItem(userDisplayMessage, data.message, data.summary, data.summary_title);
            
            // Limit local history size
            if (chatHistory.length > 25) {
                chatHistory.splice(0, chatHistory.length - 25);
            }
        }
        
        if (data.tasks) {
            renderTasks(data.tasks);
        }
        
        if (data.interactive_property) {
            const prop = data.interactive_property;
            appendInteractiveSelector(prop.name, prop.task_id, prop.multiple);
        }

        if (data.pending_relation) {
            const rawPri = data.pending_relation.priorite || 'Moyenne';
            const pri = rawPri.includes('Basse') ? 'Basse' : (rawPri.includes('Haute') ? 'Haute' : 'Moyenne');
            appendSoloRelationMapper({
                name: data.pending_relation.nom,
                priority: pri
            }, {
                objective_id: null,
                indicator_id: null
            });
        }
        
        // Gérer les actions de création (Bulk & Solo)
        if (data.actions_requested) {
            data.actions_requested.forEach(act => {
                if (act.type === 'bulk_name_input') {
                    appendBulkNameInput();
                } else if (act.type === 'bulk_priority_selector') {
                    appendBulkPrioritySelector(act.tasks || []);
                } else if (act.type === 'bulk_relation_mapper') {
                    appendBulkRelationMapper(act.tasks || [], act.groups || []);
                } else if (act.type === 'solo_name_input') {
                    appendSoloNameInput();
                } else if (act.type === 'solo_priority_selector') {
                    appendSoloPrioritySelector(act.task || {});
                } else if (act.type === 'solo_relation_mapper') {
                    appendSoloRelationMapper(act.task || {}, act.suggested_group || {});
                } else if (act.type === 'objective_name_input') {
                    appendObjectiveNameInput();
                } else if (act.type === 'objective_name_input_restricted') {
                    appendObjectiveNameInputRestricted(act.module_name || "", act.module_id || "");
                } else if (act.type === 'objective_category_selector') {
                    appendObjectiveCategorySelector(act.objective_name || "");
                } else if (act.type === 'objective_structuring') {
                    appendObjectiveStructuring(act.objective_name || "", act.category || "");
                } else if (act.type === 'objective_date_picker') {
                    appendObjectiveDatePicker(act.objective_name || "", act.category || "", act.critere || "", act.indicators || []);
                }
            });
        }
        
        if (data.memorized) {
            showMemoryNotification(data.memorized);
        }
    } catch (e) {
        hideTypingIndicator();
        appendMessage('ai', "❌ Désolé, je n'arrive pas à communiquer avec le serveur.");
        console.error('Chat error:', e);
    } finally {
        setUILocked(false);
    }
}

// Récupérer le schéma des propriétés de la base Notion
async function fetchSchema() {
    try {
        const response = await fetch('/api/schema');
        databaseSchema = await response.json();
        console.log("Database schema fetched dynamically:", databaseSchema);
    } catch (e) {
        console.error("Erreur de récupération du schéma:", e);
    }
}

// Couleurs de style Notion pour les options select/multi-select
function getNotionColorStyles(colorName) {
    const colors = {
        gray: { bg: '#f1f1ef', text: '#37352f' },
        brown: { bg: '#f4eeee', text: '#3f2b1d' },
        orange: { bg: '#fbecdd', text: '#5c3b00' },
        yellow: { bg: '#fbf3db', text: '#5c3b00' },
        green: { bg: '#dbeddb', text: '#1c3d27' },
        blue: { bg: '#d3e5ef', text: '#183347' },
        purple: { bg: '#e8deee', text: '#3c2049' },
        pink: { bg: '#f9e2ed', text: '#682544' },
        red: { bg: '#ffe2dd', text: '#5d1715' },
        default: { bg: '#f1f1ef', text: '#37352f' }
    };
    return colors[colorName] || colors.default;
}

// Générer le sélecteur d'options Notion-like dans le chat (Premium Design)
function appendInteractiveSelector(propName, taskId, multiple) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'ai');
    
    const avatar = document.createElement('div');
    avatar.classList.add('avatar');
    avatar.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="display:block;"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;
    
    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content');
    contentDiv.style.width = '100%';
    
    // Determine icon and subtitle based on property name
    const propMeta = {
        'Priorité': { 
            icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>`, 
            subtitle: 'Sélectionnez le niveau de priorité', 
            accentColor: '#e8590c' 
        },
        'Catégorie': { 
            icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`, 
            subtitle: 'Choisissez la catégorie', 
            accentColor: '#2b8a3e' 
        },
        'Résultat': { 
            icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>`, 
            subtitle: 'Quel est le résultat ?', 
            accentColor: '#1971c2' 
        },
        '😊 Ressenti': { 
            icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>`, 
            subtitle: 'Comment vous sentez-vous ?', 
            accentColor: '#e67700' 
        },
        '🎯 Impact': { 
            icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.25-2.5 3.5-2.5 3.5s2.25-1 3.5-2.5M14 3.5L16.5 6M9 15l-3-3M21 3s-9 2-13 8c-1.25 1.88-1 4.5.5 6s4.12 1.75 6 .5c6-4 8-13 8-13z"></path></svg>`, 
            subtitle: "Évaluez l'impact", 
            accentColor: '#7048e8' 
        },
        '🧠 Diagnostic': { 
            icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1 0-3.12 3 3 0 0 1 0-4.88 2.5 2.5 0 0 1 0-3.12A2.5 2.5 0 0 1 9.5 2zM14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 0-3.12 3 3 0 0 0 0-4.88 2.5 2.5 0 0 0 0-3.12A2.5 2.5 0 0 0 14.5 2z"></path></svg>`, 
            subtitle: 'Identifiez les facteurs (plusieurs choix possibles)', 
            accentColor: '#d6336c' 
        },
    };
    const meta = propMeta[propName] || { 
        icon: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="display:block;"><circle cx="12" cy="12" r="3"></circle></svg>`, 
        subtitle: 'Faites votre choix', 
        accentColor: '#37352f' 
    };
    
    // Premium card container
    const card = document.createElement('div');
    card.className = 'notion-interactive-card';
    
    card.innerHTML = `
        <div class="nic-header">
            <div class="nic-icon" style="background: ${meta.accentColor}15; color: ${meta.accentColor};">${meta.icon}</div>
            <div class="nic-header-text">
                <div class="nic-title">${propName}</div>
                <div class="nic-subtitle">${meta.subtitle}</div>
            </div>
        </div>
        <div class="nic-options-grid"></div>
    `;
    
    const optionsGrid = card.querySelector('.nic-options-grid');
    
    const propSchema = databaseSchema[propName];
    if (!propSchema || !propSchema.options) {
        optionsGrid.innerHTML = '<div class="nic-empty">Aucune option disponible</div>';
        contentDiv.appendChild(card);
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(contentDiv);
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return;
    }
    
    const selectedOptions = new Set();
    
    propSchema.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'nic-option-btn';
        
        const colors = getNotionColorStyles(opt.color);
        btn.innerHTML = '<span class="nic-option-dot" style="background: ' + colors.text + ';"></span><span class="nic-option-label">' + opt.name + '</span>';
        btn.dataset.optionName = opt.name;
        btn.style.setProperty('--opt-bg', colors.bg);
        btn.style.setProperty('--opt-text', colors.text);
        btn.style.setProperty('--opt-border', colors.text + '40');
        
        btn.addEventListener('click', () => {
            if (multiple) {
                if (selectedOptions.has(opt.name)) {
                    selectedOptions.delete(opt.name);
                    btn.classList.remove('selected');
                } else {
                    selectedOptions.add(opt.name);
                    btn.classList.add('selected');
                }
                const confirmBtn = card.querySelector('.nic-confirm-btn');
                if (confirmBtn) {
                    confirmBtn.disabled = selectedOptions.size === 0;
                    confirmBtn.classList.toggle('active', selectedOptions.size > 0);
                }
            } else {
                // Single select: visual feedback then apply
                optionsGrid.querySelectorAll('.nic-option-btn').forEach(b => {
                    b.classList.remove('selected');
                    b.classList.add('disabled');
                });
                btn.classList.add('selected');
                btn.classList.remove('disabled');
                setTimeout(() => {
                    selectSingleOption(propName, opt.name, taskId, messageDiv);
                }, 200);
            }
        });
        
        optionsGrid.appendChild(btn);
    });
    
    if (multiple) {
        const footer = document.createElement('div');
        footer.className = 'nic-footer';
        footer.innerHTML = '<button class="nic-confirm-btn" disabled>Valider la sélection</button>';
        card.appendChild(footer);
        
        footer.querySelector('.nic-confirm-btn').addEventListener('click', () => {
            if (selectedOptions.size > 0) {
                selectMultiOptions(propName, Array.from(selectedOptions), taskId, messageDiv);
            }
        });
    }
    
    contentDiv.appendChild(card);
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Traiter la sélection d'une option simple
async function selectSingleOption(propName, optionName, taskId, messageElement) {
    const buttons = messageElement.querySelectorAll('.notion-select-option-btn');
    buttons.forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.4';
        btn.style.cursor = 'not-allowed';
    });
    
    if (taskId) {
        try {
            await fetch('/api/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update_task_details',
                    id: taskId,
                    properties: { [propName]: optionName },
                    date: currentDate,
                    location: selectedLocation
                })
            });
        } catch (e) {
            console.error("Erreur de mise à jour propriété:", e);
        }
    }
    
    // Envoyer au chat
    sendChatMessage(`${propName} : ${optionName}`);
}

// Traiter la sélection de plusieurs options
async function selectMultiOptions(propName, optionsArray, taskId, messageElement) {
    const buttons = messageElement.querySelectorAll('.notion-select-option-btn');
    buttons.forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.4';
        btn.style.cursor = 'not-allowed';
    });
    const confirmBtn = messageElement.querySelector('.btn-primary');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.style.opacity = '0.4';
    }
    
    if (taskId) {
        try {
            await fetch('/api/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update_task_details',
                    id: taskId,
                    properties: { [propName]: optionsArray },
                    date: currentDate,
                    location: selectedLocation
                })
            });
        } catch (e) {
            console.error("Erreur de mise à jour multi-sélection:", e);
        }
    }
    
    // Envoyer au chat
    sendChatMessage(`${propName} : ${optionsArray.join(', ')}`);
}

// --- REFLECTION MODAL ---
function openReflectionModal(task) {
    selectedTaskId = task.id;
    modalTaskId.value = task.id;
    modalTaskTitle.textContent = `[${task.categorie}] ${task.objectif}`;
    
    // Set field values
    modalResultat.value = task.resultat === 'Non spécifié' ? '✅ Réussie' : task.resultat;
    modalRessenti.value = task.ressenti;
    modalImpact.value = task.impact;
    
    // Check checkboxes
    const diagCheckboxes = document.querySelectorAll('input[name="diagnostic"]');
    diagCheckboxes.forEach(cb => {
        cb.checked = task.diagnostic.includes(cb.value);
    });
    
    taskModal.classList.add('open');
}

function closeReflectionModal() {
    taskModal.classList.remove('open');
    selectedTaskId = null;
}

// Save Modal Form details to Notion
async function saveTaskDetails(e) {
    e.preventDefault();
    
    const id = modalTaskId.value;
    const resultat = modalResultat.value;
    const ressenti = modalRessenti.value;
    const impact = modalImpact.value;
    
    // Gather checked diagnostics
    const selectedDiags = [];
    const diagCheckboxes = document.querySelectorAll('input[name="diagnostic"]:checked');
    diagCheckboxes.forEach(cb => {
        selectedDiags.push(cb.value);
    });
    
    // If the result is marked successful, we automatically check Fait = True
    const isDone = (resultat === '✅ Réussie' || resultat === '🟡 Partielle');
    
    const properties = {
        "Fait": isDone,
        "Résultat": resultat,
        "😊 Ressenti": ressenti,
        "🎯 Impact": impact,
        "🧠 Diagnostic": selectedDiags
    };
    
    closeReflectionModal();
    showTypingIndicator();
    
    try {
        const response = await fetch('/api/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'update_task_details',
                id: id,
                properties: properties,
                date: currentDate,
                location: selectedLocation
            })
        });
        const data = await response.json();
        hideTypingIndicator();
        
        if (data.success) {
            renderTasks(data.tasks);
        }
    } catch (e) {
        hideTypingIndicator();
        console.error('Error saving task details:', e);
    }
}

// --- BILAN FLOW FUNCTIONS ---
const bilanOverlay = document.getElementById('bilan-overlay');
const btnStartBilan = document.getElementById('btn-start-bilan');
const btnMinimizeBilan = document.getElementById('btn-minimize-bilan');
const btnCloseBilan = document.getElementById('btn-close-bilan');
const btnStartBilanGo = document.getElementById('btn-start-bilan-go');
const btnSubmitBilanStep = document.getElementById('btn-submit-bilan-step');
const btnFinishBilanClose = document.getElementById('btn-finish-bilan-close');
const btnCloseBilanOnly = document.getElementById('btn-close-bilan-only');
const bilanAnswerInput = document.getElementById('bilan-answer-input');

function saveBilanStateToLocalStorage() {
    if (bilanState) {
        localStorage.setItem('bilan_session_state', JSON.stringify(bilanState));
        btnStartBilan.classList.add('active');
    } else {
        localStorage.removeItem('bilan_session_state');
        btnStartBilan.classList.remove('active');
    }
}

function loadBilanStateFromLocalStorage() {
    const stored = localStorage.getItem('bilan_session_state');
    if (stored) {
        try {
            bilanState = JSON.parse(stored);
            btnStartBilan.classList.add('active');
        } catch (e) {
            console.error("Failed to parse stored bilan state", e);
            bilanState = null;
            btnStartBilan.classList.remove('active');
        }
    }
}

function getStepNumber(step) {
    if (step === 'diagnostic') return 1;
    if (step === 'takeaways') return 2;
    if (step === 'tomorrow_action') return 3;
    return 1;
}

function getStepName(step) {
    if (step === 'diagnostic') return 'Diagnostic';
    if (step === 'takeaways') return 'Ce que je retiens';
    if (step === 'tomorrow_action') return 'Action concrète pour demain';
    return '';
}

function getStepEmoji(step) {
    if (step === 'diagnostic') return '🩺';
    if (step === 'takeaways') return '💡';
    if (step === 'tomorrow_action') return '🚀';
    return '📝';
}

function getStepQuestionPrompt(step) {
    if (step === 'diagnostic') return `Comment s'est passée cette tâche ?`;
    if (step === 'takeaways') return `Qu'est-ce que tu retiens de cette tâche ?`;
    if (step === 'tomorrow_action') return `Quelle action concrète prends-tu pour demain ?`;
    return '';
}

function showBilanScreen(screenId) {
    document.querySelectorAll('.bilan-screen').forEach(screen => {
        screen.classList.remove('active');
    });
    const target = document.getElementById('bilan-screen-' + screenId);
    if (target) {
        target.classList.add('active');
    }
}

async function startBilanFlow(forceRestart = false) {
    if (!forceRestart) {
        loadBilanStateFromLocalStorage();
    } else {
        bilanState = null;
        saveBilanStateToLocalStorage();
    }
    
    bilanOverlay.classList.add('open');
    
    if (bilanState && !forceRestart) {
        // Resume directly
        renderBilanQuestion();
        showBilanScreen('question');
        return;
    }
    
    // We are starting a new session or force restarted
    // Fetch latest tasks or use currentTasks
    let tasksToAnalyze = currentTasks.filter(t => t.status !== '🗄️ Archivé');
    
    // If currentTasks is empty, fetch them
    if (tasksToAnalyze.length === 0) {
        document.getElementById('bilan-intro-text').textContent = "Chargement des tâches du jour...";
        showBilanScreen('intro');
        try {
            const response = await fetch(`/api/tasks?date=${currentDate}&location=${selectedLocation}`);
            const data = await response.json();
            tasksToAnalyze = data.tasks.filter(t => t.status !== '🗄️ Archivé');
        } catch (e) {
            console.error("Failed to fetch tasks for bilan", e);
        }
    }
    
    if (tasksToAnalyze.length === 0) {
        document.getElementById('bilan-intro-text').innerHTML = "🌅 Aucune tâche active à analyser aujourd'hui.<br>Passe une excellente soirée !";
        btnStartBilanGo.style.display = 'none';
        showBilanScreen('intro');
        return;
    }
    
    // Setup state
    btnStartBilanGo.style.display = 'inline-flex';
    document.getElementById('bilan-intro-text').innerHTML = `Aujourd'hui, tu as <strong>${tasksToAnalyze.length} tâches</strong> à analyser.`;
    
    bilanState = {
        tasks: tasksToAnalyze.map(t => ({ id: t.id, objectif: t.objectif, categorie: t.categorie })),
        currentTaskIndex: 0,
        currentStep: 'diagnostic',
        responses: {}
    };
    
    saveBilanStateToLocalStorage();
    showBilanScreen('intro');
    
    // Start automatically after 2 seconds
    setTimeout(() => {
        // Only trigger if we are still on the intro screen and the state is valid
        if (bilanState && document.getElementById('bilan-screen-intro').classList.contains('active')) {
            renderBilanQuestion();
            showBilanScreen('question');
        }
    }, 2000);
}

function renderBilanQuestion() {
    if (!bilanState) return;
    
    const task = bilanState.tasks[bilanState.currentTaskIndex];
    if (!task) {
        // Safety check: if out of bounds, finish
        showBilanScreen('completion');
        return;
    }
    
    // Update progress
    document.getElementById('bilan-task-progress').textContent = `Tâche ${bilanState.currentTaskIndex + 1} / ${bilanState.tasks.length}`;
    document.getElementById('bilan-step-progress').textContent = `Étape ${getStepNumber(bilanState.currentStep)} / 3`;
    
    const totalSteps = bilanState.tasks.length * 3;
    const currentStepNum = bilanState.currentTaskIndex * 3 + getStepNumber(bilanState.currentStep) - 1;
    const progressPercent = (currentStepNum / totalSteps) * 100;
    document.getElementById('bilan-progress-bar-fill').style.width = progressPercent + '%';
    
    // Task info
    document.getElementById('bilan-task-title-text').textContent = task.objectif;
    const catBadge = document.getElementById('bilan-task-category');
    catBadge.textContent = task.categorie;
    catBadge.className = 'bilan-task-category-badge ' + getCategoryClass(task.categorie);
    
    // Question details
    document.getElementById('bilan-section-emoji').textContent = getStepEmoji(bilanState.currentStep);
    document.getElementById('bilan-section-name').textContent = getStepName(bilanState.currentStep);
    document.getElementById('bilan-question-prompt').textContent = getStepQuestionPrompt(bilanState.currentStep);
    
    // Answer input
    const existingAnswer = (bilanState.responses[task.id] && bilanState.responses[task.id][bilanState.currentStep]) || '';
    bilanAnswerInput.value = existingAnswer;
    
    // Clear disabled state
    bilanAnswerInput.disabled = false;
    btnSubmitBilanStep.disabled = false;
    btnSubmitBilanStep.textContent = "Valider la réponse";
    
    // Focus textarea
    setTimeout(() => {
        bilanAnswerInput.focus();
    }, 100);
}

async function submitBilanStep() {
    if (!bilanState) return;
    
    const content = bilanAnswerInput.value.trim();
    if (!content) {
        alert("S'il te plaît, écris une réponse avant de valider.");
        return;
    }
    
    const task = bilanState.tasks[bilanState.currentTaskIndex];
    
    // Disable inputs
    bilanAnswerInput.disabled = true;
    btnSubmitBilanStep.disabled = true;
    btnSubmitBilanStep.textContent = "Enregistrement...";
    
    try {
        const response = await fetch('/api/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'save_bilan_step',
                id: task.id,
                step: bilanState.currentStep,
                content: content,
                date: currentDate,
                location: selectedLocation
            })
        });
        
        const data = await response.json();
        if (data.success) {
            // Save locally
            if (!bilanState.responses[task.id]) {
                bilanState.responses[task.id] = {};
            }
            bilanState.responses[task.id][bilanState.currentStep] = content;
            
            // Advance step
            if (bilanState.currentStep === 'diagnostic') {
                bilanState.currentStep = 'takeaways';
                saveBilanStateToLocalStorage();
                renderBilanQuestion();
            } else if (bilanState.currentStep === 'takeaways') {
                bilanState.currentStep = 'tomorrow_action';
                saveBilanStateToLocalStorage();
                renderBilanQuestion();
            } else if (bilanState.currentStep === 'tomorrow_action') {
                // Task completed! Show transition
                document.getElementById('bilan-transition-task-name').textContent = task.objectif;
                showBilanScreen('transition');
                
                bilanState.currentTaskIndex += 1;
                bilanState.currentStep = 'diagnostic';
                saveBilanStateToLocalStorage();
                
                setTimeout(() => {
                    if (!bilanState) return;
                    if (bilanState.currentTaskIndex >= bilanState.tasks.length) {
                        // All tasks completed
                        showBilanScreen('completion');
                        finishBilanSession(false); // keep overlay open for completion screen
                    } else {
                        renderBilanQuestion();
                        showBilanScreen('question');
                    }
                }, 1500);
            }
        } else {
            alert("Erreur lors de l'enregistrement de ta réponse dans Notion. Réessaie.");
            bilanAnswerInput.disabled = false;
            btnSubmitBilanStep.disabled = false;
            btnSubmitBilanStep.textContent = "Valider la réponse";
        }
    } catch (e) {
        console.error("Bilan save error:", e);
        alert("Impossible de communiquer avec le serveur pour enregistrer.");
        bilanAnswerInput.disabled = false;
        btnSubmitBilanStep.disabled = false;
        btnSubmitBilanStep.textContent = "Valider la réponse";
    }
}

function finishBilanSession(closeOverlayNow = true) {
    localStorage.removeItem('bilan_session_state');
    bilanState = null;
    btnStartBilan.classList.remove('active');
    
    if (closeOverlayNow) {
        bilanOverlay.classList.remove('open');
    }
}

// --- EVENT LISTENERS ---

// Chat form submission
chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = chatInput.value.trim();
    if (msg) {
        sendChatMessage(msg);
    }
});

// Quick suggestion chips
document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
        const msg = chip.getAttribute('data-msg');
        if (msg === "Ajouter une tâche") {
            appendSoloNameInput();
        } else if (msg) {
            sendChatMessage(msg);
        }
    });
});

// Direct close day button
btnCloseDayDirect.addEventListener('click', closeDayDirect);

// Mobile toggle sidebar
sidebarToggle.addEventListener('click', () => {
    taskSidebar.classList.toggle('open');
});

// Close sidebar when clicking main chat on mobile
chatMessages.addEventListener('click', () => {
    if (taskSidebar.classList.contains('open')) {
        taskSidebar.classList.remove('open');
    }
});

// Modal close events
modalCloseBtn.addEventListener('click', closeReflectionModal);
taskModal.addEventListener('click', (e) => {
    if (e.target === taskModal) {
        closeReflectionModal();
    }
});

modalForm.addEventListener('submit', saveTaskDetails);

// Bilan UI Event Listeners
btnStartBilan.addEventListener('click', () => {
    startBilanFlow();
});

btnStartBilanGo.addEventListener('click', () => {
    renderBilanQuestion();
    showBilanScreen('question');
});

btnMinimizeBilan.addEventListener('click', () => {
    bilanOverlay.classList.remove('open');
    showMemoryNotification("Bilan de journée mis en pause. Reprends-le quand tu veux !");
});

btnCloseBilan.addEventListener('click', () => {
    if (confirm("Veux-tu abandonner le bilan en cours ? Ton progrès sera conservé.")) {
        bilanOverlay.classList.remove('open');
    }
});

btnSubmitBilanStep.addEventListener('click', () => {
    submitBilanStep();
});

bilanAnswerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitBilanStep();
    }
});

btnFinishBilanClose.addEventListener('click', () => {
    bilanOverlay.classList.remove('open');
    closeDayDirect();
});

btnCloseBilanOnly.addEventListener('click', () => {
    bilanOverlay.classList.remove('open');
});

// --- INITIALIZATION ---
locationSelect.value = selectedLocation;
loadBilanStateFromLocalStorage();

// Écouteur de changement de localisation
locationSelect.addEventListener('change', () => {
    selectedLocation = locationSelect.value;
    localStorage.setItem('selectedLocation', selectedLocation);
    console.log("Changement de fuseau horaire :", selectedLocation);
    fetchStatus(); // Recharge le statut et les tâches pour cette localisation
});

fetchSchema().then(() => {
    fetchStatus();
});

// Polling synchronisation des tâches Notion en temps réel toutes les 5 secondes
setInterval(() => {
    fetchTasks();
}, 5000);

// Polling de mise à jour du statut général et des heures toutes les 60 secondes
setInterval(() => {
    fetchStatus();
}, 60000);


// ════════════════════════════════════════════════════════════════════════════
//  HABITS ↔ OBJECTIFS — Intégration Chat
// ════════════════════════════════════════════════════════════════════════════

/**
 * Renders a compact inline habit card inside a chat message.
 * @param {Object} data - Response from /habits/today
 * @param {string} type - 'morning' | 'evening' | 'both'
 */
function renderHabitsCard(data, type = 'both') {
    const scorePct = (s) => Math.round((s || 0) * 100);
    const scoreColor = (s) => {
        const p = scorePct(s);
        if (p >= 80) return '#10b981';
        if (p >= 50) return '#f59e0b';
        return '#ef4444';
    };
    const checkIcon = (done) => done
        ? `<span style="color:#10b981;font-weight:700">✓</span>`
        : `<span style="color:#6b7280">○</span>`;

    let html = `<div class="habits-card">`;

    if (type !== 'evening') {
        html += `
        <div class="habits-section">
          <div class="habits-section-header">
            <span class="habits-moment-badge morning-badge">🌅 Rituels du Matin</span>
            <span class="habits-score" style="color:${scoreColor(data.score_matin)}">
              ${scorePct(data.score_matin)}%
            </span>
          </div>
          <div class="habits-progress-bar">
            <div class="habits-progress-fill" style="width:${scorePct(data.score_matin)}%;background:${scoreColor(data.score_matin)}"></div>
          </div>
          <ul class="habits-list">`;
        for (const [name, done] of Object.entries(data.morning || {})) {
            html += `<li class="habit-item ${done ? 'done' : ''}">${checkIcon(done)} <span>${name}</span></li>`;
        }
        html += `</ul></div>`;
    }

    if (type !== 'morning') {
        html += `
        <div class="habits-section" style="margin-top:12px">
          <div class="habits-section-header">
            <span class="habits-moment-badge evening-badge">🌙 Clôture de Journée</span>
            <span class="habits-score" style="color:${scoreColor(data.score_soir)}">
              ${scorePct(data.score_soir)}%
            </span>
          </div>
          <div class="habits-circular-container">
            <div class="habits-circular-progress">
              <svg width="60" height="60" viewBox="0 0 60 60">
                <circle class="bg" cx="30" cy="30" r="25" />
                <circle class="progress" cx="30" cy="30" r="25" 
                        style="stroke-dasharray: 157; stroke-dashoffset: ${157 - (157 * scorePct(data.score_soir)) / 100}; stroke: ${scoreColor(data.score_soir)}" />
              </svg>
              <div class="percentage" style="color:${scoreColor(data.score_soir)}">${scorePct(data.score_soir)}%</div>
            </div>
          </div>
          <ul class="habits-list">`;
        for (const [name, done] of Object.entries(data.evening || {})) {
            html += `<li class="habit-item ${done ? 'done' : ''}">${checkIcon(done)} <span>${name}</span></li>`;
        }
        html += `</ul></div>`;
    }

    html += `</div>`;
    return html;
}

/**
 * Renders the progression boost result as a styled chat message.
 */
function renderBoostResult(result) {
    if (!result || !result.success) {
        return `<p>Erreur lors du calcul de la progression.</p>`;
    }

    const sm = Math.round((result.score_matin || 0) * 100);
    const ss = Math.round((result.score_soir_hier || 0) * 100);
    const scoreColor = (p) => p >= 80 ? '#10b981' : p >= 50 ? '#f59e0b' : '#ef4444';

    let html = `
    <div class="boost-result-card">
      <div class="boost-scores-row">
        <span class="boost-score-chip morning-badge">Matin <strong>${sm}%</strong></span>
        <span class="boost-score-chip evening-badge">Soir (hier) <strong>${ss}%</strong></span>
      </div>`;

    if (!result.objectives || result.objectives.length === 0) {
        html += `<p style="margin-top:10px;color:var(--text-muted)">Aucun objectif lié aux tâches d'aujourd'hui. Pensez à connecter vos tâches à un objectif dans le Plan du Jour</p>`;
    } else {
        html += `<div class="boost-objectives">`;
        for (const obj of result.objectives) {
            if (obj.error) {
                html += `<div class="boost-obj-row error-row">Erreur: ${obj.error}</div>`;
                continue;
            }
            const newP = obj.new_progression;
            const oldP = obj.old_progression;
            const contrib = obj.contribution_pct;
            html += `
            <div class="boost-obj-row">
              <div class="boost-obj-name">${obj.obj_name || 'Objectif'}</div>
              <div class="boost-obj-details">
                <span class="boost-tasks-badge">${obj.tasks_done}/${obj.tasks_count} tâches</span>
                <span class="boost-contrib">+${contrib.toFixed(1)}%</span>
              </div>
              <div class="boost-progress-bar">
                <div class="boost-progress-fill" style="width:${Math.min(oldP,100)}%;background:rgba(99,102,241,0.4)"></div>
                <div class="boost-progress-fill boost-progress-new" style="width:${Math.min(newP,100)}%;background:${scoreColor(newP)}"></div>
              </div>
              <div class="boost-progress-labels">
                <span>${oldP.toFixed(1)}%</span>
                <span style="color:${scoreColor(newP)};font-weight:700">${newP.toFixed(1)}%</span>
              </div>
            </div>`;
        }
        html += `</div>`;
    }
    html += `</div>`;
    return html;
}

/**
 * Fetch habits summary for today and show in chat (morning view).
 */
async function fetchAndShowHabits(type = 'both') {
    try {
        const res = await fetch(`/habits/today?date=${currentDate}`);
        const data = await res.json();
        if (!data.success) {
            addMessage('assistant', 'Impossible de lire les habits du jour.');
            return;
        }
        if (!data.found) {
            addMessage('assistant', `Pas de ligne dans Habits tracker pour aujourd'hui (${currentDate}). Pensez à créer votre entrée du jour dans la page Straight !`);
            return;
        }
        const label = type === 'morning' ? 'Rituels du matin' : type === 'evening' ? 'Clôture de journée' : 'Habits du jour';
        const card  = renderHabitsCard(data, type);
        addMessageRaw('assistant', `<strong>${label}</strong><br>${card}`);
    } catch (e) {
        addMessage('assistant', `Erreur habits: ${e.message}`);
    }
}

/**
 * Trigger the full habits → objectives progression boost.
 */
async function fetchAndBoostObjectives() {
    addMessage('assistant', '⏳ Calcul de la progression des objectifs en cours...');
    try {
        const res  = await fetch('/habits/boost-objectives', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: currentDate }),
        });
        const data = await res.json();

        // Remove the loading message
        const msgs = chatMessages.querySelectorAll('.message.assistant');
        if (msgs.length > 0) {
            const last = msgs[msgs.length - 1];
            if (last.textContent.includes('Calcul de')) last.remove();
        }

        const resultHtml = renderBoostResult(data);
        addMessageRaw('assistant', `<strong>📈 Mise à jour de la Progression</strong><br>${resultHtml}`);
    } catch (e) {
        addMessage('assistant', `❌ Erreur boost: ${e.message}`);
    }
}

/**
 * A raw HTML message injector (for cards with rich HTML).
 */
function addMessageRaw(role, htmlContent) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.innerHTML = htmlContent;
    messageDiv.appendChild(bubble);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ── Chat command routing ───────────────────────────────────────────────────
// Intercept specific keywords to trigger habit/objective views
const _originalHandleSubmit = chatForm.onsubmit;

chatForm.addEventListener('submit', async (e) => {
    const input = chatInput.value.trim().toLowerCase();
    // Route habit/objective shortcuts
    if (input === 'habits matin' || input === 'rituels matin') {
        e.preventDefault();
        addMessage('user', chatInput.value.trim());
        chatInput.value = '';
        await fetchAndShowHabits('morning');
        return;
    }
    if (input === 'habits soir' || input === 'clôture' || input === 'cloture') {
        e.preventDefault();
        addMessage('user', chatInput.value.trim());
        chatInput.value = '';
        await fetchAndShowHabits('evening');
        return;
    }
    if (input === 'progression' || input === 'boost objectifs' || input === 'mise à jour progression') {
        e.preventDefault();
        addMessage('user', chatInput.value.trim());
        chatInput.value = '';
        await fetchAndBoostObjectives();
        return;
    }
    if (input === 'habits' || input === 'mes habits') {
        e.preventDefault();
        addMessage('user', chatInput.value.trim());
        chatInput.value = '';
        await fetchAndShowHabits('both');
        return;
    }
    // Otherwise, let the normal handler run
}, true); // capture phase so we intercept before other listeners


// ── Gérer la sélection et conversion d'images en base64 ──────────────────
let selectedImageBase64 = null;

document.addEventListener('DOMContentLoaded', () => {
    const imageUploadInput = document.getElementById('image-upload');
    const labelUpload = document.querySelector('.btn-upload');
    
    if (imageUploadInput) {
        imageUploadInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    selectedImageBase64 = event.target.result.split(',')[1];
                    if (labelUpload) {
                        labelUpload.style.color = '#10b981';
                        labelUpload.style.background = 'rgba(16, 185, 129, 0.15)';
                    }
                };
                reader.readAsDataURL(file);
            }
        });
    }
});

// ═══════════════════════════════════════════════════════
// SIDEBAR TAB SWITCHING (Tâches / Résumé)
// ═══════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    const tabBtns = document.querySelectorAll('.sidebar-tab');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const viewName = btn.dataset.view;
            // Switch active tab
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            // Switch active view
            document.querySelectorAll('.sidebar-view').forEach(v => v.classList.remove('active'));
            const targetView = document.getElementById(viewName + '-view');
            if (targetView) targetView.classList.add('active');
        });
    });
});

// ═══════════════════════════════════════════════════════
// SUMMARY PANEL — Auto-generate summaries
// ═══════════════════════════════════════════════════════

function generateSummaryTitle(userMsg, aiMsg) {
    // Create a short title from the user's message
    let title = userMsg || '';
    if (title.length > 60) title = title.substring(0, 57) + '...';
    return title || 'Échange';
}

function generateSummaryBody(aiMsg) {
    // Extract key points from AI response (first 2-3 sentences or bullet points)
    if (!aiMsg) return '<p>Pas de contenu.</p>';
    
    const lines = aiMsg.split('\n').filter(l => l.trim());
    const keyPoints = [];
    let count = 0;
    
    for (const line of lines) {
        if (count >= 4) break;
        const trimmed = line.trim();
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            keyPoints.push(trimmed);
            count++;
        } else if (trimmed.length > 10 && count < 3) {
            // Take the first meaningful sentences
            let sentence = trimmed;
            if (sentence.length > 120) sentence = sentence.substring(0, 117) + '...';
            keyPoints.push(sentence);
            count++;
        }
    }
    
    if (keyPoints.length === 0) {
        let short = aiMsg.substring(0, 150);
        if (aiMsg.length > 150) short += '...';
        return `<p>${short.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
    }
    
    let html = '<ul>';
    keyPoints.forEach(p => {
        let clean = p.replace(/^[\-\*]\s*/, '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        // Bold **text**
        clean = clean.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        html += `<li>${clean}</li>`;
    });
    html += '</ul>';
    return html;
}

function addSummaryItem(userMsg, aiMsg, summary = null, summaryTitle = null) {
    exchangeCounter++;
    const summaryList = document.getElementById('summary-list');
    if (!summaryList) return;
    
    // Remove empty state
    const empty = summaryList.querySelector('.summary-empty');
    if (empty) empty.remove();
    
    const item = document.createElement('div');
    item.className = 'summary-item';
    
    const title = summaryTitle || generateSummaryTitle(userMsg, aiMsg);
    const body = summary ? formatMarkdown(summary) : generateSummaryBody(aiMsg);
    
    item.innerHTML = `
        <div class="summary-item-header">
            <span class="summary-chevron">›</span>
            <span class="summary-item-number">${exchangeCounter}.</span>
            <span class="summary-item-title">${title.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
        </div>
        <div class="summary-item-body">
            <div class="summary-item-content">${body}</div>
        </div>
    `;
    
    // Toggle behavior
    item.querySelector('.summary-item-header').addEventListener('click', () => {
        item.classList.toggle('open');
    });
    
    summaryList.appendChild(item);
}

// ═══════════════════════════════════════════════════════
// DEVELOP ZONE — Inline sub-chat within AI bubbles
// ═══════════════════════════════════════════════════════

function openDevelopZone(contentDiv, originalContent) {
    // Don't open twice
    if (contentDiv.querySelector('.develop-zone')) return;
    
    // Hide the develop button
    const btn = contentDiv.querySelector('.develop-btn');
    if (btn) btn.style.display = 'none';
    
    // Create develop zone
    const zone = document.createElement('div');
    zone.className = 'develop-zone';
    
    // Local sub-chat history for this develop zone
    const subHistory = [
        { role: 'assistant', content: originalContent }
    ];
    
    zone.innerHTML = `
        <div class="develop-zone-header">
            <span class="develop-zone-label">Développement</span>
            <button class="develop-close-btn">✕ Fermer</button>
        </div>
        <div class="develop-thread"></div>
        <div class="develop-input-area">
            <input type="text" class="develop-input" placeholder="Approfondir cette idée..." autocomplete="off">
            <button class="develop-send-btn">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
        </div>
    `;
    
    contentDiv.appendChild(zone);
    
    const thread = zone.querySelector('.develop-thread');
    const input = zone.querySelector('.develop-input');
    const sendBtn = zone.querySelector('.develop-send-btn');
    const closeBtn = zone.querySelector('.develop-close-btn');
    
    // Close handler
    closeBtn.addEventListener('click', () => {
        zone.remove();
        if (btn) btn.style.display = '';
    });
    
    // Send message handler
    async function sendDevelopMessage() {
        const text = input.value.trim();
        if (!text) return;
        
        // Show user message
        const userMsg = document.createElement('div');
        userMsg.className = 'develop-msg user';
        userMsg.textContent = text;
        thread.appendChild(userMsg);
        
        input.value = '';
        thread.scrollTop = thread.scrollHeight;
        
        // Show typing
        const typingDiv = document.createElement('div');
        typingDiv.className = 'develop-typing';
        typingDiv.innerHTML = '<span></span><span></span><span></span>';
        thread.appendChild(typingDiv);
        thread.scrollTop = thread.scrollHeight;
        
        // Add to sub-history
        subHistory.push({ role: 'user', content: text });
        
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: subHistory,
                    date: currentDate,
                    location: selectedLocation
                })
            });
            const data = await response.json();
            
            // Remove typing
            typingDiv.remove();
            
            if (data.message) {
                const aiMsg = document.createElement('div');
                aiMsg.className = 'develop-msg ai';
                aiMsg.innerHTML = formatMarkdown(data.message);
                thread.appendChild(aiMsg);
                
                subHistory.push({ role: 'assistant', content: data.message });
                
                // Also update summary panel with this sub-exchange
                addSummaryItem('↳ ' + text, data.message, data.summary, data.summary_title);
            }
            
            // Refresh tasks if returned
            if (data.tasks) renderTasks(data.tasks);
            
        } catch (e) {
            typingDiv.remove();
            const errMsg = document.createElement('div');
            errMsg.className = 'develop-msg ai';
            errMsg.textContent = '❌ Erreur de connexion.';
            thread.appendChild(errMsg);
        }
        
        thread.scrollTop = thread.scrollHeight;
    }
    
    // Enter to send
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendDevelopMessage();
        }
    });
    
    sendBtn.addEventListener('click', sendDevelopMessage);
    
    // Focus input
    input.focus();
    
    // Scroll main chat to show the develop zone
    const chatMessages = document.getElementById('chat-messages');
    if (chatMessages) {
        setTimeout(() => { chatMessages.scrollTop = chatMessages.scrollHeight; }, 100);
    }
}









// ═══════════════════════════════════════════════════
// MAIN CONTENT TABS (Assistant IA / Infos)
// ═══════════════════════════════════════════════════

document.querySelectorAll('.main-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        // Deactivate all tabs & views
        document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.main-view').forEach(v => v.classList.remove('active'));
        
        // Activate clicked tab & corresponding view
        tab.classList.add('active');
        const viewId = tab.getAttribute('data-main-view') + '-view';
        const viewEl = document.getElementById(viewId);
        if (viewEl) viewEl.classList.add('active');
        
        // Load data when switching to tabs
        if (tab.getAttribute('data-main-view') === 'infos') {
            loadAcademicData();
        } else if (tab.getAttribute('data-main-view') === 'objectives') {
            loadObjectivesDashboard();
        } else if (tab.getAttribute('data-main-view') === 'habits') {
            loadHabitsData();
        }
    });
});

// ═══════════════════════════════════════════════════
// ACADEMIC SYSTEM & VACATIONS LOGIC
// ═══════════════════════════════════════════════════

async function loadAcademicData() {
    try {
        const [modRes, examRes, vacRes, statusRes, revoirRes] = await Promise.all([
            fetch('/api/modules'),
            fetch('/api/exams'),
            fetch('/api/vacations'),
            fetch('/api/academic/status?date=' + currentDate),
            fetch('/api/objectifs/revoir')
        ]);
        const modules = await modRes.json();
        const exams = await examRes.json();
        const vacations = await vacRes.json();
        const status = await statusRes.json();
        const revoir = await revoirRes.json();
        
        // Update module select dropdown
        const select = document.getElementById('exam-module-select');
        if (select) {
            const currentVal = select.value;
            select.innerHTML = '<option value="">Sélectionner un module...</option>' + 
                modules.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
            select.value = currentVal;
        }
        
        // Show/Hide Warning Banner in header
        const banner = document.getElementById('critical-warning-banner');
        const bannerText = document.getElementById('critical-banner-text');
        if (banner && bannerText) {
            if (status.is_critical && status.next_exam) {
                banner.style.display = 'flex';
                const next = status.next_exam;
                if (next.is_today) {
                    const timePart = next.time ? ` à ${next.time}` : '';
                    bannerText.textContent = `Période critique : ${next.type} aujourd'hui${timePart}`;
                } else {
                    bannerText.textContent = `Période critique : ${next.type} dans ${status.days_to_exam} jour${status.days_to_exam > 1 ? 's' : ''}`;
                }
            } else {
                banner.style.display = 'none';
            }
        }
        
        renderModules(modules);
        renderExams(exams);
        renderVacations(vacations);
        renderRevoir(revoir);
    } catch (err) {
        console.error('Failed to load academic data:', err);
    }
}

// ── Render Modules ──
function renderModules(modules) {
    const container = document.getElementById('modules-list');
    if (!container) return;
    
    if (!modules || modules.length === 0) {
        container.innerHTML = `
            <div class="exams-empty-state">
                <p>Aucun module enregistré</p>
                <p class="exams-empty-hint">Créez vos modules ci-dessus pour y associer des obligations.</p>
            </div>
        `;
        return;
    }
    
    // Sort modules
    const pending = modules.filter(m => m.status === 'pending').sort((a, b) => a.name.localeCompare(b.name));
    const completed = modules.filter(m => m.status === 'completed').sort((a, b) => a.name.localeCompare(b.name));
    const sorted = [...pending, ...completed];
    
    container.innerHTML = sorted.map(m => {
        const isPending = m.status === 'pending';
        const badgeClass = isPending ? 'pending' : 'completed';
        const badgeText = isPending ? 'En cours' : 'Terminé';
        const color = getModuleColor(m.id);
        
        // Formater les badges d'objectifs reliés
        const objectivesTags = (m.objectifs && m.objectifs.length > 0)
            ? m.objectifs.map(o => {
                let displayTitle = o.title;
                let urgentPrefix = '';
                if (o.title.startsWith('[Urgent]')) {
                    displayTitle = o.title.replace('[Urgent]', '').trim();
                    urgentPrefix = '🚨 ';
                }
                return `<span class="module-obj-tag" style="background: ${color.bg}; border-color: ${color.border}; color: ${color.text}; font-weight: 600;">${urgentPrefix}${displayTitle}</span>`;
            }).join('')
            : `<span class="module-obj-tag" style="color: var(--text-muted); font-style: italic; font-weight: normal; background: transparent; border: 1px dashed var(--border-color);">Aucun objectif lié</span>`;
        
        return `
            <div class="module-card" id="module-card-${m.id}" style="border-left: 4px solid ${color.hex}; background: #FFFFFF;">
                <div class="module-header-row" style="display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%;">
                    <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                        <span class="exam-status-badge ${badgeClass}">${badgeText}</span>
                        <div class="module-info" style="flex: 1;">
                            <div class="module-title-text" style="color: #37352F; font-weight: 600; font-size: 14px;">${m.name}</div>
                            <div class="module-objectives-tags" onclick="toggleModuleObjectivesLinker('${m.id}', '${m.name.replace(/'/g, "\\'")}')" title="Lier/Délier des objectifs" style="margin-top: 4px; cursor: pointer;">${objectivesTags}</div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button class="implement-toggle-btn" data-id="${m.id}" onclick="toggleImplementPanel('${m.id}')" style="border-color: ${color.border}; color: ${color.text}; background: ${color.bg}; padding: 5px 10px; border-radius: 6px; font-size: 12px; font-weight: 500; border: 1px solid; cursor: pointer; transition: all 0.15s;">
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px; display: inline-block; vertical-align: middle;">
                                <path d="M12 5v14M5 12h14"/>
                            </svg> Implémenter
                        </button>
                        <!-- Color picker wrapper -->
                        <div class="module-color-picker-wrapper" style="position: relative; display: flex; align-items: center;">
                            <button class="btn-module-color" onclick="toggleModuleColorMenu(event, '${m.id}')" title="Changer la couleur" style="border: 1px solid ${color.border}; width: 22px; height: 22px; border-radius: 50%; background: ${color.hex}; cursor: pointer; transition: all 0.15s; padding: 0; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 2px rgba(0,0,0,0.08);">
                            </button>
                            <div class="module-color-menu" id="color-menu-${m.id}" style="display: none; position: absolute; top: 28px; right: 0; background: #ffffff; border: 1px solid #EDECE9; border-radius: 8px; padding: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); z-index: 100; flex-direction: row; gap: 5px;">
                                ${NOTION_PASTEL_COLORS.map(c => `
                                    <div onclick="setModuleColor('${m.id}', '${c.name}')" style="width: 16px; height: 16px; border-radius: 50%; background: ${c.hex}; border: 1px solid ${c.border}; cursor: pointer; transition: transform 0.1s;" onmouseenter="this.style.transform='scale(1.2)'" onmouseleave="this.style.transform='scale(1)'"></div>
                                `).join('')}
                            </div>
                        </div>

                        <button class="btn-delete-impl" onclick="deleteModule('${m.id}')" title="Supprimer ce module" style="border: 1px solid var(--border-color); padding: 5px; background: transparent; cursor: pointer; border-radius: 6px; display: flex; align-items: center; justify-content: center; transition: all 0.15s;">
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#a8a8a8" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        </button>
                    </div>
                </div>
                
                <div class="module-objectives-linker-panel" id="module-linker-panel-${m.id}" style="display: none; border-top: 1px dashed #EDECE9; margin-top: 10px; padding-top: 10px;">
                    <div style="font-size: 11px; font-weight: 700; color: #787774; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
                        <span>Lier des objectifs</span>
                        <span style="font-size: 9.5px; font-weight: normal; text-transform: none; color: #787774;">Cliquez sur un objectif pour l'associer</span>
                    </div>
                    <div class="module-linker-objectives-list" style="display: flex; flex-direction: column; gap: 4px; max-height: 180px; overflow-y: auto;">
                        <!-- Dynamically filled -->
                    </div>
                </div>
                
                <!-- Panneau d'implémentation pliable -->
                <div class="implement-panel" id="implement-panel-${m.id}" style="display: none;">
                    <div class="implementations-list" id="impl-list-${m.id}">
                        <!-- Rempli dynamiquement -->
                    </div>
                    
                    <!-- Zone d'import style NotebookLM -->
                    <div class="notebooklm-upload-zone" id="upload-zone-${m.id}" 
                         ondragover="handleImplDragOver(event, '${m.id}')" 
                         ondragleave="handleImplDragLeave(event, '${m.id}')" 
                         ondrop="handleImplDrop(event, '${m.id}')">
                        <div class="notebooklm-title">Glissez-déposez un document ou importez une ressource</div>
                        <div class="notebooklm-subtitle">PDF, Word, images ou texte de cours pour l'IA</div>
                        
                        <div class="notebooklm-options-row">
                            <button class="notebooklm-btn" onclick="showNotebookLMInput('${m.id}', 'file')">
                                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> Fichier
                            </button>
                            <button class="notebooklm-btn" onclick="showNotebookLMInput('${m.id}', 'link')">
                                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Lien Web
                            </button>
                            <button class="notebooklm-btn" onclick="showNotebookLMInput('${m.id}', 'text')">
                                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Texte
                            </button>
                        </div>
                        
                        <input type="file" id="impl-file-input-${m.id}" style="display: none;" onchange="handleImplFileSelect('${m.id}')">
                        
                        <!-- Formulaires contextuels -->
                        <div class="implement-input-box" id="impl-box-text-${m.id}">
                            <textarea id="impl-textarea-${m.id}" class="implement-textarea" placeholder="Collez ou écrivez le texte du cours ici..."></textarea>
                            <div class="implement-form-controls">
                                <select id="impl-type-text-${m.id}" class="implement-type-select">
                                    <option value="Programme">Programme du module</option>
                                    <option value="Cours">Cours & Notes</option>
                                    <option value="Infos complémentaires">Infos complémentaires</option>
                                </select>
                                <div class="implement-actions">
                                    <button class="btn-cancel-impl" onclick="hideNotebookLMInputs('${m.id}')">Annuler</button>
                                    <button class="btn-submit-impl" onclick="submitImplText('${m.id}')">Ajouter</button>
                                </div>
                            </div>
                        </div>
                        
                        <div class="implement-input-box" id="impl-box-link-${m.id}">
                            <input type="url" id="impl-link-${m.id}" class="implement-text-input" placeholder="https://example.com/cours ou lien YouTube...">
                            <div class="implement-form-controls">
                                <select id="impl-type-link-${m.id}" class="implement-type-select">
                                    <option value="Programme">Programme du module</option>
                                    <option value="Cours">Cours & Notes</option>
                                    <option value="Infos complémentaires">Infos complémentaires</option>
                                </select>
                                <div class="implement-actions">
                                    <button class="btn-cancel-impl" onclick="hideNotebookLMInputs('${m.id}')">Annuler</button>
                                    <button class="btn-submit-impl" onclick="submitImplLink('${m.id}')">Ajouter</button>
                                </div>
                            </div>
                        </div>
                        
                        <div class="implement-input-box" id="impl-box-file-${m.id}">
                            <div id="impl-file-label-${m.id}" style="font-size:12px; font-weight:500; margin-bottom:6px;"></div>
                            <div class="implement-form-controls">
                                <select id="impl-type-file-${m.id}" class="implement-type-select">
                                    <option value="Programme">Programme du module</option>
                                    <option value="Cours">Cours & Notes</option>
                                    <option value="Infos complémentaires">Infos complémentaires</option>
                                </select>
                                <div class="implement-actions">
                                    <button class="btn-cancel-impl" onclick="hideNotebookLMInputs('${m.id}')">Annuler</button>
                                    <button class="btn-submit-impl" onclick="submitImplFile('${m.id}')">Télécharger</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ── Render Évaluations / Obligations ──
function renderExams(exams) {
    const container = document.getElementById('exams-list');
    if (!container) return;
    
    if (!exams || exams.length === 0) {
        container.innerHTML = `
            <div class="exams-empty-state">
                <p>Aucune obligation enregistrée</p>
                <p class="exams-empty-hint">Ajoutez des examens, TD, DM ou Projets pour suivre votre progression.</p>
            </div>
        `;
        return;
    }
    
    const pending = exams.filter(e => e.status === 'pending').sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const completed = exams.filter(e => e.status === 'completed').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const sorted = [...pending, ...completed];
    
    container.innerHTML = sorted.map(exam => {
        const isPending = exam.status === 'pending';
        const badgeClass = isPending ? 'pending' : 'completed';
        const badgeText = isPending ? 'En attente' : 'Terminé';
        
        let dateLabel = 'Date non planifiée';
        if (exam.date) {
            try {
                let datePart = exam.date;
                let timePart = '';
                if (exam.date.includes('T')) {
                    const parts = exam.date.split('T');
                    datePart = parts[0];
                    timePart = parts[1].substring(0, 5); // HH:MM
                }
                const d = new Date(datePart + 'T00:00:00');
                const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
                dateLabel = d.toLocaleDateString('fr-FR', options);
                dateLabel = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
                if (timePart) {
                    dateLabel += ` à ${timePart}`;
                }
            } catch(err) {
                dateLabel = exam.date;
            }
        }
        
        let actionsHTML = '';
        if (isPending) {
            actionsHTML = `
                <div class="grade-input-wrapper">
                    <input type="number" class="exam-note-input" id="note-input-${exam.id}" min="0" max="100" placeholder="/100" style="height: 28px;">
                    <button class="btn-exam-action complete" onclick="completeExam('${exam.id}')" style="padding: 4px 8px;">Valider</button>
                    <button class="btn-exam-action delete" onclick="deleteExam('${exam.id}')" style="padding: 4px 8px;">✕</button>
                </div>
            `;
        } else {
            const note20Formatted = exam.note_20 !== null ? parseFloat(exam.note_20).toFixed(2) : 'N/A';
            const note100Formatted = exam.note_100 || 'N/A';
            actionsHTML = `
                <span class="exam-note-display">${note100Formatted}/100 (${note20Formatted}/20)</span>
                <button class="btn-exam-action delete" onclick="deleteExam('${exam.id}')">✕</button>
            `;
        }
        
        return `
            <div class="exam-card">
                <span class="exam-status-badge ${badgeClass}">${badgeText}</span>
                <div class="exam-info">
                    <div class="exam-matiere">${exam.type} — <span style="font-weight: normal; opacity: 0.85;">${exam.module_name}</span></div>
                    <div class="exam-date-label">${dateLabel}</div>
                </div>
                <div class="exam-actions">
                    ${actionsHTML}
                </div>
            </div>
        `;
    }).join('');
}

// ── Render Vacations ──
function renderVacations(vacations) {
    const container = document.getElementById('vacations-list');
    if (!container) return;
    
    if (!vacations || vacations.length === 0) {
        container.innerHTML = `
            <div class="exams-empty-state">
                <p>Aucune période de vacances enregistrée</p>
                <p class="exams-empty-hint">Ajoutez des dates de vacances pour que l'IA puisse en tenir compte.</p>
            </div>
        `;
        return;
    }
    
    const sorted = [...vacations].sort((a, b) => a.start_date.localeCompare(b.start_date));
    
    container.innerHTML = sorted.map(vac => {
        let startLabel = vac.start_date;
        let endLabel = vac.end_date;
        try {
            const s = new Date(vac.start_date + 'T00:00:00');
            const e = new Date(vac.end_date + 'T00:00:00');
            const options = { day: 'numeric', month: 'long', year: 'numeric' };
            startLabel = s.toLocaleDateString('fr-FR', options);
            endLabel = e.toLocaleDateString('fr-FR', options);
        } catch(err) {}
        
        return `
            <div class="vacation-card">
                <span class="exam-status-badge completed" style="background: rgba(55, 53, 47, 0.05); color: var(--text-main);">Vacances</span>
                <div class="vacation-info">
                    <div class="vacation-title-text">${vac.label}</div>
                    <div class="vacation-date-label">Du ${startLabel} au ${endLabel}</div>
                </div>
                <button class="btn-exam-action delete" onclick="deleteVacation('${vac.id}')">✕</button>
            </div>
        `;
    }).join('');
}

// ── Actions Modules ──
document.getElementById('btn-add-module')?.addEventListener('click', async () => {
    const input = document.getElementById('module-name');
    const name = input?.value.trim();
    if (!name) {
        alert('Veuillez spécifier le nom du module.');
        return;
    }
    try {
        await fetch('/api/modules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'add', name })
        });
        if (input) input.value = '';
        loadAcademicData();
    } catch (err) {
        console.error('Failed to create module:', err);
    }
});

async function toggleModuleObjectivesLinker(moduleId, moduleName) {
    const panel = document.getElementById(`module-linker-panel-${moduleId}`);
    if (!panel) return;
    
    if (panel.style.display === 'block') {
        panel.style.display = 'none';
        return;
    }
    
    // Close other linker panels
    document.querySelectorAll('.module-objectives-linker-panel').forEach(p => {
        if (p.id !== `module-linker-panel-${moduleId}`) p.style.display = 'none';
    });
    
    const listContainer = panel.querySelector('.module-linker-objectives-list');
    listContainer.innerHTML = '<div style="font-size: 11px; color: #787774; font-style: italic; padding: 6px;">Chargement des objectifs...</div>';
    panel.style.display = 'block';
    
    try {
        const res = await fetch('/api/objectifs/list');
        const allObjectives = await res.json();
        
        const statusRes = await fetch(`/api/academic/status?location=${selectedLocation}&date=${currentDate}`);
        const academicStatus = await statusRes.json();
        
        const matchingModule = (academicStatus.modules_with_objectives || []).find(m => m.id === moduleId) 
            || (academicStatus.modules_without_objectives || []).find(m => m.id === moduleId);
        
        let linkedObjIds = [];
        if (matchingModule && matchingModule.objectifs) {
            linkedObjIds = matchingModule.objectifs.map(o => o.id);
        }
        
        const unlinkedObjectives = allObjectives.filter(o => !linkedObjIds.includes(o.id));
        
        if (!unlinkedObjectives || unlinkedObjectives.length === 0) {
            listContainer.innerHTML = '<div style="font-size: 11.5px; color: #787774; font-style: italic; padding: 12px; text-align: center;">Aucun autre objectif disponible (tous sont déjà liés).</div>';
            return;
        }
        
        listContainer.innerHTML = '';
        
        unlinkedObjectives.forEach(o => {
            const row = document.createElement('div');
            row.className = `module-linker-row`;
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.justifyContent = 'space-between';
            row.style.padding = '8px 12px';
            row.style.borderRadius = '6px';
            row.style.background = 'transparent';
            row.style.border = '1px solid #EDECE9';
            row.style.cursor = 'pointer';
            row.style.transition = 'all 0.15s ease';
            row.style.marginBottom = '6px';
            
            let urgentTag = '';
            let titleText = o.title;
            if (o.title.startsWith('[Urgent]')) {
                titleText = o.title.replace('[Urgent]', '').trim();
                urgentTag = `<span style="background: #FFE2E2; color: #C92A2A; border: 1px solid #FFC9C9; font-size: 9.5px; padding: 1.5px 5px; border-radius: 4px; font-weight: 700; margin-left: 6px;">🚨 Urgent</span>`;
            }
            
            row.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div class="obj-detail-checkbox" style="width: 14px; height: 14px; border-radius: 3px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border: 1.5px solid #D3D1CB; background: transparent; color: white;">
                        <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="4" style="opacity: 0;"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </div>
                    <span style="font-size: 12px; font-weight: 500; color: #37352F;">${titleText} ${urgentTag}</span>
                </div>
                <span style="font-size: 10px; font-weight: 700; color: #787774; background: #FAF9F6; padding: 2.5px 6px; border-radius: 4px;">${o.progression}</span>
            `;
            
            row.onclick = async (e) => {
                e.stopPropagation();
                
                let newLinkedObjIds = [...linkedObjIds, o.id];
                
                row.style.pointerEvents = 'none';
                row.style.opacity = '0.6';
                
                try {
                    const response = await fetch('/api/modules/link_objectifs', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            module_id: moduleId,
                            objective_ids: newLinkedObjIds
                        })
                    });
                    const resData = await response.json();
                    if (resData.success) {
                        await loadAcademicData();
                        const newPanel = document.getElementById(`module-linker-panel-${moduleId}`);
                        if (newPanel) {
                            newPanel.style.display = 'none'; // reset so toggle opens it
                            await toggleModuleObjectivesLinker(moduleId, moduleName);
                        }
                    } else {
                        alert("Erreur de liaison : " + resData.error);
                        row.style.pointerEvents = '';
                        row.style.opacity = '';
                    }
                } catch (err) {
                    console.error("Failed to link objective:", err);
                    alert("Erreur de communication.");
                    row.style.pointerEvents = '';
                    row.style.opacity = '';
                }
            };
            
            listContainer.appendChild(row);
        });
    } catch (err) {
        console.error("Failed to toggle module linker:", err);
        listContainer.innerHTML = '<div style="font-size: 11px; color: #e03131; padding: 4px;">Erreur de chargement.</div>';
    }
}

function wireSlashCommandForCommaInput(inp) {
    inp.addEventListener('input', () => {
        const text = inp.innerText || inp.textContent || "";
        
        // If the user deleted the slash, dismiss the menu immediately
        if (!text.includes('/')) {
            if (currentSlashMenu) {
                currentSlashMenu.remove();
                currentSlashMenu = null;
            }
            return;
        }
        
        // Find position of the slash and show menu
        if (text.includes('/')) {
            if (currentSlashMenu) {
                currentSlashMenu.remove();
            }
            
            const menu = document.createElement('div');
            menu.className = 'slash-menu';
            
            const rect = inp.getBoundingClientRect();
            menu.style.position = 'fixed';
            menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
            menu.style.left = `${rect.left + window.scrollX}px`;
            
            menu.innerHTML = `
                <div class="slash-option" data-weight="1">
                    <span>Poids faible</span>
                    <span class="slash-option-tag p1">Poids 1</span>
                </div>
                <div class="slash-option" data-weight="2">
                    <span>Poids moyen</span>
                    <span class="slash-option-tag p2">Poids 2</span>
                </div>
                <div class="slash-option" data-weight="3">
                    <span>Poids fort</span>
                    <span class="slash-option-tag p3">Poids 3</span>
                </div>
            `;
            
            document.body.appendChild(menu);
            currentSlashMenu = menu;
            
            const options = menu.querySelectorAll('.slash-option');
            options.forEach(opt => {
                // Crucial: prevent focus loss so caret selection remains inside the contenteditable
                opt.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                });
                
                opt.onclick = (e) => {
                    e.stopPropagation();
                    const w = opt.getAttribute('data-weight');
                    
                    inp.focus();
                    
                    // Delete the slash character right before caret
                    const sel = window.getSelection();
                    if (sel.rangeCount > 0) {
                        const r = sel.getRangeAt(0);
                        if (inp.contains(r.startContainer)) {
                            r.setStart(r.startContainer, Math.max(0, r.startOffset - 1));
                            r.deleteContents();
                        }
                    }
                    
                    // Style attributes based on weight (Poids 1 = Green, Poids 2 = Yellow, Poids 3 = Red)
                    let bg = '#E2F9E9';
                    let color = '#1E7E34';
                    let border = '#C2F5D3';
                    if (w === "2") {
                        bg = '#FFF3BF';
                        color = '#B28600';
                        border = '#FFE3A8';
                    } else if (w === "3") {
                        bg = '#FFE2E2';
                        color = '#C92A2A';
                        border = '#FFC9C9';
                    }
                    
                    const badgeHtml = `<span class="weight-badge p${w}" contenteditable="false" data-weight="${w}" style="background: ${bg}; color: ${color}; border: 1px solid ${border}; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 10px; margin: 0 4px; display: inline-flex; align-items: center; vertical-align: middle; cursor: default; user-select: none;">Poids ${w}</span>&nbsp;`;
                    
                    insertHTMLAtCursor(badgeHtml);
                    
                    menu.remove();
                    currentSlashMenu = null;
                    
                    // Trigger input event to validate form
                    inp.dispatchEvent(new Event('input'));
                };
            });
            
            const clickOutsideHandler = (e) => {
                if (!menu.contains(e.target) && e.target !== inp) {
                    menu.remove();
                    currentSlashMenu = null;
                    document.removeEventListener('click', clickOutsideHandler);
                }
            };
            document.addEventListener('click', clickOutsideHandler);
        }
    });
}

function insertHTMLAtCursor(html) {
    const sel = window.getSelection();
    if (sel.getRangeAt && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        
        const el = document.createElement("div");
        el.innerHTML = html;
        const frag = document.createDocumentFragment();
        let node, lastNode;
        while ((node = el.firstChild)) {
            lastNode = frag.appendChild(node);
        }
        range.insertNode(frag);
        
        if (lastNode) {
            range.setStartAfter(lastNode);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }
}

function parseContentEditableIndicators(divEl) {
    // Clone element to prevent UI side-effects
    const clone = divEl.cloneNode(true);
    
    // Replace all weight badges with text representation
    clone.querySelectorAll('.weight-badge').forEach(badge => {
        const w = badge.getAttribute('data-weight');
        const textNode = document.createTextNode(`(Poids ${w})`);
        badge.parentNode.replaceChild(textNode, badge);
    });
    
    const rawText = clone.innerText || clone.textContent || "";
    return rawText.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

async function deleteModule(moduleId) {
    if (!confirm('Attention : Supprimer ce module archivera le module dans Notion, ainsi que toutes ses évaluations, objectifs, tâches liées et implémentations physiques locales. Voulez-vous continuer ?')) return;
    
    try {
        const res = await fetch('/api/modules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'delete',
                id: moduleId
            })
        });
        const data = await res.json();
        if (data.success) {
            loadAcademicData();
        } else {
            alert('Erreur lors de la suppression : ' + data.error);
        }
    } catch (err) {
        console.error('Failed to delete module:', err);
    }
}

// ── Actions Évaluations ──
document.getElementById('btn-add-exam')?.addEventListener('click', async () => {
    const typeSelect = document.getElementById('exam-type-select');
    const moduleSelect = document.getElementById('exam-module-select');
    const dateInput = document.getElementById('exam-date');
    const timeInput = document.getElementById('exam-time');
    
    const type_eval = typeSelect?.value;
    const module_id = moduleSelect?.value;
    const dateVal = dateInput?.value;
    const timeVal = timeInput?.value;
    
    if (!type_eval || !module_id) {
        alert('Veuillez sélectionner le type d\'évaluation et le module.');
        return;
    }
    
    let date = dateVal;
    if (dateVal && timeVal) {
        date = `${dateVal}T${timeVal}:00`;
    }
    
    try {
        await fetch('/api/exams', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'add', type_eval, module_id, date })
        });
        if (dateInput) dateInput.value = '';
        if (timeInput) timeInput.value = '';
        loadAcademicData();
    } catch (err) {
        console.error('Failed to create evaluation:', err);
    }
});

async function completeExam(examId) {
    const input = document.getElementById(`note-input-${examId}`);
    if (!input) return;
    const noteVal = input.value.trim();
    if (!noteVal) {
        alert('Veuillez entrer une note (sur 100).');
        return;
    }
    const note_100 = parseFloat(noteVal);
    if (isNaN(note_100) || note_100 < 0 || note_100 > 100) {
        alert('Veuillez entrer une note valide entre 0 et 100.');
        return;
    }
    
    try {
        await fetch('/api/exams', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'complete', id: examId, note_100 })
        });
        loadAcademicData();
    } catch (err) {
        console.error('Failed to complete evaluation:', err);
    }
}

async function deleteExam(examId) {
    if (!confirm('Supprimer cette évaluation ?')) return;
    try {
        await fetch('/api/exams', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete', id: examId })
        });
        loadAcademicData();
    } catch (err) {
        console.error('Failed to delete evaluation:', err);
    }
}

// ── Actions Vacances ──
document.getElementById('btn-add-vacation')?.addEventListener('click', async () => {
    const labelInput = document.getElementById('vacation-label');
    const startInput = document.getElementById('vacation-start');
    const endInput = document.getElementById('vacation-end');
    
    const label = labelInput?.value.trim();
    const start_date = startInput?.value;
    const end_date = endInput?.value;
    
    if (!label || !start_date || !end_date) {
        alert('Veuillez remplir tous les champs de vacances.');
        return;
    }
    
    try {
        await fetch('/api/vacations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'add', label, start_date, end_date })
        });
        if (labelInput) labelInput.value = '';
        if (startInput) startInput.value = '';
        if (endInput) endInput.value = '';
        loadAcademicData();
    } catch (err) {
        console.error('Failed to create vacation:', err);
    }
});

async function deleteVacation(vacId) {
    if (!confirm('Supprimer cette période de vacances ?')) return;
    try {
        await fetch('/api/vacations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete', id: vacId })
        });
        loadAcademicData();
    } catch (err) {
        console.error('Failed to delete vacation:', err);
    }
}

// ── Render Revoir ──
function renderRevoir(revoir) {
    const container = document.getElementById('revoir-list');
    if (!container) return;
    
    if (!revoir || revoir.length === 0) {
        container.innerHTML = `
            <div class="exams-empty-state">
                <p>Aucune idée d'objectif mise de côté</p>
                <p class="exams-empty-hint">L'IA y placera les objectifs mis en attente pendant les examens.</p>
            </div>
        `;
        return;
    }
    
    const sorted = [...revoir].sort((a, b) => b.created_at.localeCompare(a.created_at));
    
    container.innerHTML = sorted.map(item => {
        return `
            <div class="revoir-card">
                <div class="revoir-info">
                    <span style="font-weight: 600;">🎯 ${item.title}</span>
                </div>
                <button class="btn-exam-action delete" onclick="deleteRevoir('${item.id}')">✕</button>
            </div>
        `;
    }).join('');
}

// ── Actions Revoir ──
document.getElementById('btn-add-revoir')?.addEventListener('click', async () => {
    const input = document.getElementById('revoir-title');
    const title = input?.value.trim();
    if (!title) {
        alert("Veuillez spécifier le titre de l'idée d'objectif.");
        return;
    }
    try {
        await fetch('/api/objectifs/revoir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'add', title })
        });
        if (input) input.value = '';
        loadAcademicData();
    } catch (err) {
        console.error('Failed to create revoir item:', err);
    }
});

async function deleteRevoir(itemId) {
    if (!confirm('Supprimer cette idée d\'objectif ?')) return;
    try {
        await fetch('/api/objectifs/revoir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete', id: itemId })
        });
        loadAcademicData();
    } catch (err) {
        console.error('Failed to delete revoir item:', err);
    }
}




// ── MODULE IMPLEMENTATIONS INTERACTIVES (NotebookLM-Style) ──

const activeFiles = {};

function toggleImplementPanel(moduleId) {
    const panel = document.getElementById(`implement-panel-${moduleId}`);
    const btn = document.querySelector(`.implement-toggle-btn[data-id="${moduleId}"]`);
    if (!panel) return;
    
    if (panel.style.display === 'none') {
        panel.style.display = 'flex';
        btn.classList.add('active');
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;"><polyline points="18 15 12 9 6 15"/></svg> Fermer`;
        loadModuleImplementations(moduleId);
    } else {
        panel.style.display = 'none';
        btn.classList.remove('active');
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;"><path d="M12 5v14M5 12h14"/></svg> Implémenter`;
    }
}

async function loadModuleImplementations(moduleId) {
    const listContainer = document.getElementById(`impl-list-${moduleId}`);
    if (!listContainer) return;
    
    listContainer.innerHTML = '<div style="font-size:11px; color:var(--text-muted); padding: 4px;">Chargement des ressources...</div>';
    
    try {
        const res = await fetch(`/api/modules/implement?module_id=${moduleId}`);
        const impls = await res.json();
        
        if (!impls || impls.length === 0) {
            listContainer.innerHTML = '';
            return;
        }
        
        listContainer.innerHTML = impls.map(impl => {
            const dateStr = new Date(impl.created_at).toLocaleDateString('fr-FR', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
            });
            
            const badgeClass = impl.type === 'Programme' ? 'programme' : (impl.type === 'Cours' ? 'cours' : 'infos');
            
            let formatIcon = '';
            let titleHTML = '';
            if (impl.format === 'text') {
                formatIcon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
                const textPreview = impl.content.length > 50 ? impl.content.substring(0, 50) + '...' : impl.content;
                titleHTML = `<span class="impl-item-title" title="${impl.content}">${textPreview}</span>`;
            } else if (impl.format === 'link') {
                formatIcon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
                titleHTML = `<span class="impl-item-title"><a href="${impl.content}" target="_blank">${impl.content}</a></span>`;
            } else if (impl.format === 'file') {
                formatIcon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
                titleHTML = `<span class="impl-item-title"><a href="${impl.content}" target="_blank" download>${impl.filename || 'Fichier'}</a></span>`;
            }
            
            return `
                <div class="impl-item-card" id="impl-item-${impl.id}">
                    <div class="impl-item-info">
                        <span class="impl-badge ${badgeClass}">${impl.type}</span>
                        <span class="impl-format-icon">${formatIcon}</span>
                        ${titleHTML}
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:10px; color:var(--text-muted);">${dateStr}</span>
                        <button class="btn-delete-impl" onclick="deleteImplementation('${moduleId}', '${impl.id}')" title="Supprimer">
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('Error loading module implementations:', err);
        listContainer.innerHTML = '<div style="font-size:11px; color:#e03e3e; padding: 4px;">Erreur lors du chargement</div>';
    }
}

function showNotebookLMInput(moduleId, format) {
    document.getElementById(`impl-box-text-${moduleId}`).classList.remove('active');
    document.getElementById(`impl-box-link-${moduleId}`).classList.remove('active');
    document.getElementById(`impl-box-file-${moduleId}`).classList.remove('active');
    
    if (format === 'file') {
        document.getElementById(`impl-file-input-${moduleId}`).click();
    } else if (format === 'text') {
        document.getElementById(`impl-box-text-${moduleId}`).classList.add('active');
        document.getElementById(`impl-textarea-${moduleId}`).focus();
    } else if (format === 'link') {
        document.getElementById(`impl-box-link-${moduleId}`).classList.add('active');
        document.getElementById(`impl-link-${moduleId}`).focus();
    }
}

function hideNotebookLMInputs(moduleId) {
    document.getElementById(`impl-box-text-${moduleId}`).classList.remove('active');
    document.getElementById(`impl-box-link-${moduleId}`).classList.remove('active');
    document.getElementById(`impl-box-file-${moduleId}`).classList.remove('active');
    
    document.getElementById(`impl-textarea-${moduleId}`).value = '';
    document.getElementById(`impl-link-${moduleId}`).value = '';
    document.getElementById(`impl-file-input-${moduleId}`).value = '';
    delete activeFiles[moduleId];
}

function handleImplDragOver(e, moduleId) {
    e.preventDefault();
    document.getElementById(`upload-zone-${moduleId}`).classList.add('dragover');
}

function handleImplDragLeave(e, moduleId) {
    e.preventDefault();
    document.getElementById(`upload-zone-${moduleId}`).classList.remove('dragover');
}

function handleImplDrop(e, moduleId) {
    e.preventDefault();
    document.getElementById(`upload-zone-${moduleId}`).classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        setupFileConfirm(moduleId, files[0]);
    }
}

function handleImplFileSelect(moduleId) {
    const fileInput = document.getElementById(`impl-file-input-${moduleId}`);
    if (fileInput && fileInput.files.length > 0) {
        setupFileConfirm(moduleId, fileInput.files[0]);
    }
}

function setupFileConfirm(moduleId, file) {
    activeFiles[moduleId] = file;
    
    document.getElementById(`impl-box-text-${moduleId}`).classList.remove('active');
    document.getElementById(`impl-box-link-${moduleId}`).classList.remove('active');
    
    const fileBox = document.getElementById(`impl-box-file-${moduleId}`);
    const fileLabel = document.getElementById(`impl-file-label-${moduleId}`);
    
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    fileLabel.innerHTML = `Fichier sélectionné : <span style="font-weight:600;">${file.name}</span> (${sizeMB} Mo)`;
    fileBox.classList.add('active');
}

async function submitImplText(moduleId) {
    const content = document.getElementById(`impl-textarea-${moduleId}`).value.trim();
    const type = document.getElementById(`impl-type-text-${moduleId}`).value;
    
    if (!content) {
        alert('Veuillez écrire du texte.');
        return;
    }
    
    try {
        const res = await fetch('/api/modules/implement', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                module_id: moduleId,
                type: type,
                format: 'text',
                content: content
            })
        });
        const data = await res.json();
        if (data.success) {
            hideNotebookLMInputs(moduleId);
            loadModuleImplementations(moduleId);
        } else {
            alert('Erreur: ' + data.error);
        }
    } catch (err) {
        console.error('Error submitting text implementation:', err);
    }
}

async function submitImplLink(moduleId) {
    const content = document.getElementById(`impl-link-${moduleId}`).value.trim();
    const type = document.getElementById(`impl-type-link-${moduleId}`).value;
    
    if (!content) {
        alert('Veuillez entrer une adresse URL.');
        return;
    }
    
    try {
        const res = await fetch('/api/modules/implement', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                module_id: moduleId,
                type: type,
                format: 'link',
                content: content
            })
        });
        const data = await res.json();
        if (data.success) {
            hideNotebookLMInputs(moduleId);
            loadModuleImplementations(moduleId);
        } else {
            alert('Erreur: ' + data.error);
        }
    } catch (err) {
        console.error('Error submitting link implementation:', err);
    }
}

async function submitImplFile(moduleId) {
    const file = activeFiles[moduleId];
    const type = document.getElementById(`impl-type-file-${moduleId}`).value;
    
    if (!file) {
        alert('Aucun fichier sélectionné.');
        return;
    }
    
    const formData = new FormData();
    formData.append('module_id', moduleId);
    formData.append('type', type);
    formData.append('format', 'file');
    formData.append('file', file);
    
    const fileLabel = document.getElementById(`impl-file-label-${moduleId}`);
    fileLabel.innerHTML = `<span style="color:var(--text-muted); font-style:italic;">Importation et extraction en cours...</span>`;
    
    try {
        const res = await fetch('/api/modules/implement', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            hideNotebookLMInputs(moduleId);
            loadModuleImplementations(moduleId);
        } else {
            alert('Erreur lors du transfert : ' + data.error);
            setupFileConfirm(moduleId, file);
        }
    } catch (err) {
        console.error('Error submitting file implementation:', err);
        alert('Erreur lors de la communication avec le serveur.');
        setupFileConfirm(moduleId, file);
    }
}

async function deleteImplementation(moduleId, implId) {
    if (!confirm('Supprimer cette ressource de cours ?')) return;
    
    try {
        const res = await fetch(`/api/modules/implement/${implId}?module_id=${moduleId}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        if (data.success) {
            loadModuleImplementations(moduleId);
        } else {
            alert('Erreur: ' + data.error);
        }
    } catch (err) {
        console.error('Error deleting implementation:', err);
    }
}

/* ==========================================
   WORKFLOW DE CRÉATION EN MASSE (BULK CREATION)
   ========================================== */
async function getActiveObjectives() {
    if (activeObjectivesCache) return activeObjectivesCache;
    try {
        const res = await fetch('/api/objectifs/list');
        activeObjectivesCache = await res.json();
        return activeObjectivesCache;
    } catch(err) {
        console.error("Error loading objectives:", err);
        return [];
    }
}

async function getObjectiveIndicators(objectiveId) {
    if (!objectiveId) return [];
    if (indicatorsCache[objectiveId]) return indicatorsCache[objectiveId];
    try {
        const res = await fetch(`/api/objectifs/indicators?id=${objectiveId}`);
        const data = await res.json();
        indicatorsCache[objectiveId] = data.indicators || [];
        return indicatorsCache[objectiveId];
    } catch(err) {
        console.error("Error loading indicators:", err);
        return [];
    }
}
function appendBulkNameInput() {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'ai');
    
    const avatar = document.createElement('div');
    avatar.classList.add('avatar');
    avatar.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;
    
    const card = document.createElement('div');
    card.className = 'bulk-card step-names';
    card.innerHTML = `
        <div class="bulk-header">
            <div class="bulk-header-icon">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </div>
            <div class="bulk-header-text">
                <div class="bulk-title">Création en masse : Noms des tâches</div>
                <div class="bulk-subtitle">Étape 1 sur 3 — Appuyez sur Entrée pour ajouter une nouvelle ligne</div>
            </div>
        </div>
        <div class="bulk-table">
        </div>
        <div class="bulk-action-row">
            <button class="bulk-add-btn">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Ajouter une ligne
            </button>
            <button class="bulk-next-btn primary" disabled>Suivant : Définir les priorités →</button>
        </div>
    `;
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(card);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    const table = card.querySelector('.bulk-table');
    const addBtn = card.querySelector('.bulk-add-btn');
    const nextBtn = card.querySelector('.bulk-next-btn');
    
    bulkCreationState = {
        current_step: 'names',
        tasks: []
    };
    
    function updateNextBtnState() {
        const inputs = Array.from(table.querySelectorAll('.bulk-input'));
        const hasValidTask = inputs.some(input => input.value.trim() !== "");
        nextBtn.disabled = !hasValidTask;
    }
    
    function checkStructuralChanges() {
        const activeInputs = Array.from(table.querySelectorAll('.bulk-input')).filter(inp => inp.value.trim() !== "");
        const activeCount = activeInputs.length;
        
        const step2Card = document.querySelector('.bulk-priority-list');
        const step3Card = document.querySelector('.bulk-groups-container');
        
        if (step2Card || step3Card) {
            let currentRenderedCount = 0;
            if (step3Card) {
                currentRenderedCount = document.querySelectorAll('.bulk-relation-task-item').length;
            } else if (step2Card) {
                currentRenderedCount = step2Card.querySelectorAll('.bulk-priority-row').length;
            }
            
            let updateBtn = card.querySelector('.bulk-update-suite-btn');
            if (activeCount !== currentRenderedCount) {
                if (!updateBtn) {
                    updateBtn = document.createElement('button');
                    updateBtn.className = 'bulk-next-btn bulk-update-suite-btn';
                    updateBtn.style.marginLeft = '8px';
                    updateBtn.innerHTML = '🔄 Mettre à jour la suite';
                    updateBtn.addEventListener('click', () => {
                        nextBtn.click();
                    });
                    card.querySelector('.bulk-action-row').appendChild(updateBtn);
                }
            } else {
                if (updateBtn) {
                    updateBtn.remove();
                }
            }
        }
    }
    
    function addRow(prefilledName = "") {
        const rowCount = table.children.length + 1;
        const taskId = `temp_task_${Date.now()}_${rowCount}`;
        
        bulkCreationState.tasks.push({
            id: taskId,
            name: prefilledName,
            priority: "Moyenne",
            objective_id: null,
            indicator_id: null
        });
        
        const newRow = document.createElement('div');
        newRow.className = 'bulk-row';
        newRow.innerHTML = `
            <div class="bulk-row-num">${rowCount}</div>
            <input type="text" class="bulk-input" data-task-id="${taskId}" value="${prefilledName}" placeholder="Saisir le nom d'une tâche..." />
        `;
        table.appendChild(newRow);
        
        const input = newRow.querySelector('.bulk-input');
        input.focus();
        setupInputHandlers(input, taskId);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    function setupInputHandlers(input, taskId) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const val = input.value.trim();
                if (val !== "") {
                    const rows = Array.from(table.querySelectorAll('.bulk-row'));
                    const lastInput = rows[rows.length - 1].querySelector('.bulk-input');
                    if (lastInput.value.trim() !== "") {
                        addRow();
                    } else {
                        lastInput.focus();
                    }
                }
            }
        });
        
        input.addEventListener('input', () => {
            const newName = input.value.trim();
            
            const task = bulkCreationState.tasks.find(t => t.id === taskId);
            if (task) {
                task.name = newName;
            }
            
            const step2Input = document.querySelector(`.bulk-priority-row[data-task-id="${taskId}"] .bulk-priority-task-input`);
            if (step2Input) step2Input.value = newName;
            
            const step3Input = document.querySelector(`.bulk-relation-task-item[data-task-id="${taskId}"] .bulk-relation-task-input`);
            if (step3Input) step3Input.value = newName;
            
            updateNextBtnState();
            checkStructuralChanges();
        });
    }
    
    addRow();
    
    addBtn.addEventListener('click', () => {
        addRow();
    });
    
    nextBtn.addEventListener('click', () => {
        const inputs = Array.from(table.querySelectorAll('.bulk-input'));
        const tasks = [];
        inputs.forEach((input) => {
            const name = input.value.trim();
            if (name) {
                const taskId = input.dataset.taskId;
                const existing = bulkCreationState.tasks.find(t => t.id === taskId);
                if (existing) {
                    existing.name = name;
                    tasks.push(existing);
                } else {
                    tasks.push({
                        id: taskId,
                        name: name,
                        priority: "Moyenne",
                        objective_id: null,
                        indicator_id: null
                    });
                }
            }
        });
        
        if (tasks.length === 0) return;
        
        bulkCreationState.tasks = tasks;
        
        nextBtn.style.display = 'none';
        addBtn.style.display = 'none';
        const updateBtn = card.querySelector('.bulk-update-suite-btn');
        if (updateBtn) updateBtn.remove();
        
        const displayMsg = `J'ai saisi ${tasks.length} tâche(s) :\n` + tasks.map(t => `• ${t.name}`).join('\n') + `\n\nPassons à la qualification de leurs priorités.`;
        const payload = `[BULK_STEP_NOMS] ` + JSON.stringify({ tasks: tasks });
        sendBulkChatMessage(displayMsg, payload);
    });
}

function appendBulkPrioritySelector(tasks) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'ai');
    
    const avatar = document.createElement('div');
    avatar.classList.add('avatar');
    avatar.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>`;
    
    const card = document.createElement('div');
    card.className = 'bulk-card step-priorities';
    
    if (!bulkCreationState.tasks || bulkCreationState.tasks.length === 0) {
        bulkCreationState.tasks = tasks.map(t => ({
            id: t.id,
            name: t.name,
            priority: t.priority || "Moyenne",
            objective_id: null,
            indicator_id: null
        }));
    }
    
    let rowsHtml = bulkCreationState.tasks.map(t => `
        <div class="bulk-priority-row" data-task-id="${t.id}">
            <input type="text" class="bulk-priority-task-input bulk-input" data-task-id="${t.id}" value="${t.name}" style="font-weight: 500; padding: 2px 4px; border: none; background: transparent; width: 60%; font-size: 12px;" />
            <div class="bulk-priority-options">
                <button class="bulk-priority-badge basse ${t.priority === 'Basse' ? 'active' : ''}" data-priority="Basse">Basse</button>
                <button class="bulk-priority-badge moyenne ${t.priority === 'Moyenne' ? 'active' : ''}" data-priority="Moyenne">Moyenne</button>
                <button class="bulk-priority-badge haute ${t.priority === 'Haute' ? 'active' : ''}" data-priority="Haute">Haute</button>
            </div>
        </div>
    `).join('');
    
    card.innerHTML = `
        <div class="bulk-header">
            <div class="bulk-header-icon">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            </div>
            <div class="bulk-header-text">
                <div class="bulk-title">Création en masse : Qualification des priorités</div>
                <div class="bulk-subtitle">Étape 2 sur 3 — Cochez la priorité de chaque tâche (nom modifiable)</div>
            </div>
        </div>
        <div class="bulk-priority-list">
            ${rowsHtml}
        </div>
        <div class="bulk-action-row" style="justify-content: flex-end;">
            <button class="bulk-next-btn primary">Suivant : Associer aux Objectifs →</button>
        </div>
    `;
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(card);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    const rows = card.querySelectorAll('.bulk-priority-row');
    const nextBtn = card.querySelector('.bulk-next-btn');
    
    rows.forEach(row => {
        const taskId = row.dataset.taskId;
        const badges = row.querySelectorAll('.bulk-priority-badge');
        const nameInput = row.querySelector('.bulk-priority-task-input');
        
        nameInput.addEventListener('input', () => {
            const val = nameInput.value.trim();
            
            const task = bulkCreationState.tasks.find(t => t.id === taskId);
            if (task) task.name = val;
            
            const step1Input = document.querySelector(`.bulk-row input[data-task-id="${taskId}"]`);
            if (step1Input) step1Input.value = val;
            
            const step3Input = document.querySelector(`.bulk-relation-task-item[data-task-id="${taskId}"] .bulk-relation-task-input`);
            if (step3Input) step3Input.value = val;
        });
        
        badges.forEach(badge => {
            badge.addEventListener('click', () => {
                badges.forEach(b => b.classList.remove('active'));
                badge.classList.add('active');
                
                const task = bulkCreationState.tasks.find(t => t.id === taskId);
                if (task) {
                    task.priority = badge.dataset.priority;
                }
            });
        });
    });
    
    nextBtn.addEventListener('click', () => {
        card.querySelectorAll('.bulk-priority-badge').forEach(btn => btn.disabled = true);
        nextBtn.disabled = true;
        nextBtn.style.display = 'none';
        
        bulkCreationState.current_step = 'relations';
        
        const displayMsg = `J'ai défini les priorités pour mes tâches :\n` + bulkCreationState.tasks.map(t => `• ${t.name} (Priorité : ${t.priority})`).join('\n') + `\n\nAnalysons les objectifs et indicateurs associés.`;
        const payload = `[BULK_STEP_PRIORITIES] ` + JSON.stringify({ tasks: bulkCreationState.tasks });
        sendBulkChatMessage(displayMsg, payload);
    });
}

async function appendBulkRelationMapper(tasks, groups) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'ai');
    
    const avatar = document.createElement('div');
    avatar.classList.add('avatar');
    avatar.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`;
    
    const card = document.createElement('div');
    card.className = 'bulk-card step-relations';
    
    card.innerHTML = `
        <div class="bulk-header">
            <div class="bulk-header-icon">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <div class="bulk-header-text">
                <div class="bulk-title">Création en masse : Association aux Objectifs</div>
                <div class="bulk-subtitle">Étape 3 sur 3 — Vérifiez ou modifiez les associations (nom modifiable)</div>
            </div>
        </div>
        <div class="bulk-groups-container">
            <div class="nrc2-loading" style="margin: 20px auto;">
                <div class="nrc2-loading-dot"></div>
                <div class="nrc2-loading-dot"></div>
                <div class="nrc2-loading-dot"></div>
            </div>
        </div>
        <div class="bulk-action-row" style="justify-content: flex-end; margin-top: 14px;">
            <button class="bulk-next-btn primary" id="bulk-submit-final" disabled style="background: #000000; border-color: #000000; color: white;">
                ✓ Valider et créer les ${bulkCreationState.tasks.length} tâches dans Notion
            </button>
        </div>
    `;
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(card);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    const groupsContainer = card.querySelector('.bulk-groups-container');
    const submitBtn = card.querySelector('#bulk-submit-final');
    
    const objectivesList = await getActiveObjectives();
    groupsContainer.innerHTML = '';
    
    if (!bulkCreationState.tasks || bulkCreationState.tasks.length === 0) {
        bulkCreationState.tasks = tasks || [];
    }
    if (tasks && tasks.length > 0) {
        tasks.forEach(t => {
            if (!bulkCreationState.tasks.some(bt => bt.id === t.id)) {
                bulkCreationState.tasks.push(t);
            }
        });
    }

    const taskMap = {};
    bulkCreationState.tasks.forEach(t => {
        taskMap[t.id] = t;
    });
    
    if (groups && groups.length > 0) {
        groups.forEach(g => {
            if (g.task_ids) {
                g.task_ids.forEach(tid => {
                    if (taskMap[tid]) {
                        taskMap[tid].objective_id = g.objective_id || null;
                        taskMap[tid].indicator_id = g.indicator_id || null;
                    }
                });
            }
        });
    }

    const coveredTaskIds = new Set();
    if (groups && groups.length > 0) {
        groups.forEach(g => {
            if (g.task_ids) {
                g.task_ids.forEach(tid => {
                    if (taskMap[tid]) {
                        coveredTaskIds.add(tid);
                    }
                });
            }
        });
    }

    const uncoveredTasks = bulkCreationState.tasks.filter(t => !coveredTaskIds.has(t.id));
    if (uncoveredTasks.length > 0) {
        if (!groups) groups = [];
        groups.push({
            objective_id: null,
            indicator_id: null,
            task_ids: uncoveredTasks.map(t => t.id)
        });
    }
    
    async function getObjectiveCategory(objId) {
        if (!objId) return null;
        try {
            const res = await fetch(`/api/objectifs/category?id=${objId}`);
            const data = await res.json();
            return data.category || null;
        } catch(err) {
            console.error("Error loading category:", err);
            return null;
        }
    }
    
    function updateSubmitButtonState() {
        let isValid = true;
        bulkCreationState.tasks.forEach(t => {
            if (!t.objective_id) {
                isValid = false;
            }
            if (t.objective_id && !t.category) {
                isValid = false;
            }
            if (t.objective_id && !t.indicator_id) {
                isValid = false;
            }
        });
        submitBtn.disabled = !isValid;
        styleRequiredSelects(card);
    }
    
    bulkCreationState.tasks.forEach(t => {
        const groupEl = document.createElement('div');
        groupEl.className = 'bulk-relation-group';
        groupEl.style.padding = '12px';
        groupEl.style.background = '#FFFFFF';
        groupEl.style.border = '1px solid #EDECE9';
        groupEl.style.borderRadius = '8px';
        groupEl.style.marginBottom = '12px';
        groupEl.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.02), 0 4px 12px rgba(0, 0, 0, 0.03)';
        groupEl.style.transition = 'all 0.2s ease-in-out';
        
        groupEl.addEventListener('mouseenter', () => {
            groupEl.style.borderColor = '#DFDBCE';
            groupEl.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.04), 0 6px 16px rgba(0, 0, 0, 0.06)';
        });
        groupEl.addEventListener('mouseleave', () => {
            groupEl.style.borderColor = '#EDECE9';
            groupEl.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.02), 0 4px 12px rgba(0, 0, 0, 0.03)';
        });
        
        const taskHeader = document.createElement('div');
        taskHeader.className = 'bulk-relation-task-item';
        taskHeader.style.display = 'flex';
        taskHeader.style.alignItems = 'center';
        taskHeader.style.justifyContent = 'space-between';
        taskHeader.style.borderBottom = '1px solid #F1F0EF';
        taskHeader.style.paddingBottom = '10px';
        taskHeader.style.marginBottom = '10px';
        taskHeader.dataset.taskId = t.id;
        
        const priClass = t.priority.toLowerCase();
        taskHeader.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; width: 70%;">
                <span style="font-size: 13px; color: #37352F;">📋</span>
                <input type="text" class="bulk-relation-task-input bulk-input" data-task-id="${t.id}" value="${t.name}" style="padding: 4px 6px; border: 1px solid transparent; background: transparent; width: 100%; font-size: 13px; font-weight: 600; color: #37352F; border-radius: 4px; transition: all 0.15s;" />
            </div>
            <span class="bulk-relation-task-pri ${priClass}" style="font-size: 10px; padding: 2px 8px; border-radius: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px;">${t.priority}</span>
        `;
        
        const nameInput = taskHeader.querySelector('.bulk-relation-task-input');
        nameInput.addEventListener('focus', () => {
            nameInput.style.borderColor = '#EDECE9';
            nameInput.style.background = '#F7F6F3';
        });
        nameInput.addEventListener('blur', () => {
            nameInput.style.borderColor = 'transparent';
            nameInput.style.background = 'transparent';
        });
        
        nameInput.addEventListener('input', () => {
            const val = nameInput.value.trim();
            t.name = val;
            
            const step1Input = document.querySelector(`.bulk-row input[data-task-id="${t.id}"]`);
            if (step1Input) step1Input.value = val;
            
            const step2Input = document.querySelector(`.bulk-priority-row[data-task-id="${t.id}"] .bulk-priority-task-input`);
            if (step2Input) step2Input.value = val;
        });
        
        groupEl.appendChild(taskHeader);
        
        const selectContainer = document.createElement('div');
        selectContainer.className = 'bulk-relation-select-container';
        selectContainer.style.display = 'flex';
        selectContainer.style.flexDirection = 'column';
        selectContainer.style.gap = '8px';
        selectContainer.innerHTML = `
            <div class="bulk-relation-select-row" style="display: flex; align-items: center; gap: 8px; padding: 2px 0;">
                <span class="bulk-relation-select-label" style="font-size: 11.5px; color: #787774; min-width: 90px; font-weight: 500; display: flex; align-items: center; gap: 4px;">🎯 Objectif :</span>
                <select class="bulk-select objective-select" style="flex: 1; font-size: 12px; padding: 5px 8px; border-radius: 6px; border: 1px solid #EDECE9; background: #FFFFFF; color: #37352F; outline: none; transition: border 0.15s; cursor: pointer; max-width: none;">
                    <option value="">— Choisir un objectif (Requis) —</option>
                    ${objectivesList.map(o => `<option value="${o.id}" ${o.id === t.objective_id ? 'selected' : ''}>${o.title}</option>`).join('')}
                </select>
            </div>
            <div class="bulk-relation-select-row indicator-row" style="display: ${t.objective_id ? 'flex' : 'none'}; align-items: center; gap: 8px; padding: 2px 0;">
                <span class="bulk-relation-select-label" style="font-size: 11.5px; color: #787774; min-width: 90px; font-weight: 500; display: flex; align-items: center; gap: 4px;">📈 Indicateur :</span>
                <select class="bulk-select indicator-select" style="flex: 1; font-size: 12px; padding: 5px 8px; border-radius: 6px; border: 1px solid #EDECE9; background: #FFFFFF; color: #37352F; outline: none; transition: border 0.15s; cursor: pointer; max-width: none;">
                    <option value="">— Choisir un indicateur (Requis) —</option>
                </select>
            </div>
        `;
        
        groupEl.appendChild(selectContainer);
        groupsContainer.appendChild(groupEl);
        
        const objSelect = groupEl.querySelector('.objective-select');
        const indSelect = groupEl.querySelector('.indicator-select');
        const indRow = groupEl.querySelector('.indicator-row');
        
        const handleObjectiveCategory = async (selectedObjId) => {
            const existingCatRow = groupEl.querySelector('.category-row');
            if (existingCatRow) existingCatRow.remove();
            const existingCatLabel = groupEl.querySelector('.category-label-info');
            if (existingCatLabel) existingCatLabel.remove();
            
            if (selectedObjId) {
                const cat = await getObjectiveCategory(selectedObjId);
                if (cat) {
                    const labelInfo = document.createElement('div');
                    labelInfo.className = 'bulk-relation-select-row category-label-info';
                    labelInfo.style.fontSize = '11px';
                    labelInfo.style.color = '#787774';
                    labelInfo.style.padding = '4px 0 4px 98px';
                    labelInfo.innerHTML = `Catégorie Notion : <span style="background: rgba(35, 131, 226, 0.08); padding: 2px 6px; border-radius: 4px; font-weight: 600; color: #2383E2;">${cat}</span>`;
                    indRow.parentNode.appendChild(labelInfo);
                    
                    t.category = cat;
                } else {
                    const catRow = document.createElement('div');
                    catRow.className = 'bulk-relation-select-row category-row';
                    catRow.style.display = 'flex';
                    catRow.style.alignItems = 'center';
                    catRow.style.gap = '8px';
                    catRow.style.padding = '2px 0';
                    catRow.innerHTML = `
                        <span class="bulk-relation-select-label" style="font-size: 11.5px; color: #787774; min-width: 90px; font-weight: 500; display: flex; align-items: center; gap: 4px;">🏷️ Catégorie :</span>
                        <select class="bulk-select category-select" style="flex: 1; font-size: 12px; padding: 5px 8px; border-radius: 6px; border: 1px solid #e03131; background: #fff5f5; color: #37352F; outline: none; transition: border 0.15s; cursor: pointer; max-width: none;">
                            <option value="">— Choisir une catégorie —</option>
                            <option value="📚 Études">📚 Études</option>
                            <option value="🏃 Sport">🏃 Sport</option>
                            <option value="🏥 Santé">🏥 Santé</option>
                            <option value="👥 Social">👥 Social</option>
                            <option value="🧑 Personnel">🧑 Personnel</option>
                            <option value="💳 Finances">💳 Finances</option>
                            <option value="🏠 Maison">🏠 Maison</option>
                        </select>
                    `;
                    indRow.parentNode.appendChild(catRow);
                    
                    const catSelect = catRow.querySelector('.category-select');
                    catSelect.addEventListener('change', () => {
                        const chosenCat = catSelect.value;
                        if (chosenCat) {
                            catSelect.style.borderColor = '#EDECE9';
                        } else {
                            catSelect.style.borderColor = '#e03131';
                        }
                        t.category = chosenCat || null;
                        updateSubmitButtonState();
                    });
                }
            } else {
                t.category = null;
            }
            updateSubmitButtonState();
        };
        
        if (t.objective_id) {
            populateIndicators(t.objective_id, indSelect, indRow, t.indicator_id);
            handleObjectiveCategory(t.objective_id);
        }
        
        objSelect.addEventListener('change', async () => {
            const selectedObjId = objSelect.value;
            
            t.objective_id = selectedObjId || null;
            t.indicator_id = null;
            t.category = null;
            
            if (selectedObjId) {
                indRow.style.display = 'flex';
                await populateIndicators(selectedObjId, indSelect, indRow, null);
            } else {
                indRow.style.display = 'none';
                indSelect.innerHTML = '<option value="">— Choisir un indicateur (Requis) —</option>';
            }
            
            await handleObjectiveCategory(selectedObjId);
        });
        
        indSelect.addEventListener('change', () => {
            if (indSelect.value === 'new_indicator') {
                let newIndInput = indRow.querySelector('.new-indicator-input');
                if (!newIndInput) {
                    newIndInput = document.createElement('input');
                    newIndInput.type = 'text';
                    newIndInput.className = 'bulk-input new-indicator-input';
                    newIndInput.placeholder = 'Nom du nouvel indicateur...';
                    newIndInput.style.fontSize = '11px';
                    newIndInput.style.marginTop = '4px';
                    newIndInput.style.border = '1px solid #EDECE9';
                    newIndInput.style.padding = '2px 6px';
                    newIndInput.style.width = '100%';
                    newIndInput.style.boxSizing = 'border-box';
                    
                    indRow.appendChild(newIndInput);
                    newIndInput.focus();
                    
                    const saveNewIndicator = () => {
                        const name = newIndInput.value.trim();
                        if (name) {
                            const val = `new_indicator:${name}`;
                            const opt = document.createElement('option');
                            opt.value = val;
                            opt.textContent = `📝 (Nouveau) ${name}`;
                            indSelect.insertBefore(opt, indSelect.querySelector('option[value="new_indicator"]'));
                            indSelect.value = val;
                            
                            t.indicator_id = val;
                        } else {
                            indSelect.value = "";
                            t.indicator_id = null;
                        }
                        newIndInput.remove();
                        updateSubmitButtonState();
                    };
                    
                    newIndInput.addEventListener('keydown', (evt) => {
                        if (evt.key === 'Enter') {
                            evt.preventDefault();
                            saveNewIndicator();
                        }
                    });
                    
                    newIndInput.addEventListener('blur', () => {
                        saveNewIndicator();
                    });
                }
            } else {
                const selectedIndId = indSelect.value;
                t.indicator_id = selectedIndId || null;
            }
            updateSubmitButtonState();
        });
    });
    
    async function populateIndicators(objId, selectEl, rowEl, preselectedId) {
        selectEl.disabled = true;
        const indicators = await getObjectiveIndicators(objId);
        selectEl.disabled = false;
        
        selectEl.innerHTML = '<option value="">— Choisir un indicateur (Requis) —</option>';
        if (indicators && indicators.length > 0) {
            indicators.forEach(ind => {
                const isSelected = ind.id === preselectedId;
                selectEl.innerHTML += `<option value="${ind.id}" ${isSelected ? 'selected' : ''}>${ind.text}</option>`;
            });
        }
        
        selectEl.innerHTML += `<option value="new_indicator" style="font-weight: bold; color: #2383E2;">+ Créer un indicateur...</option>`;
        
        if (preselectedId && preselectedId.startsWith("new_indicator:")) {
            const name = preselectedId.replace("new_indicator:", "");
            const opt = document.createElement('option');
            opt.value = preselectedId;
            opt.textContent = `📝 (Nouveau) ${name}`;
            selectEl.insertBefore(opt, selectEl.querySelector('option[value="new_indicator"]'));
            selectEl.value = preselectedId;
        }
    }
    
    updateSubmitButtonState();
    
    submitBtn.addEventListener('click', async () => {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="bulk-spinner"></span> Création des tâches...';
        
        card.querySelectorAll('.bulk-select').forEach(sel => sel.disabled = true);
        card.querySelectorAll('.bulk-relation-task-input').forEach(inp => inp.disabled = true);
        
        try {
            const res = await fetch('/api/tasks/create_bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tasks: bulkCreationState.tasks,
                    date: currentDate
                })
            });
            const data = await res.json();
            
            if (data.success) {
                card.innerHTML = `
                    <div class="bulk-success-card">
                        <div class="bulk-success-icon">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                        <div class="bulk-success-title">Succès !</div>
                        <div class="bulk-success-desc">
                            <strong>${data.created_count} tâches</strong> ont été créées avec succès dans Notion et liées à vos objectifs.
                        </div>
                    </div>
                `;
                
                if (data.tasks) {
                    renderTasks(data.tasks);
                }
                
                bulkCreationState = { current_step: null, tasks: [] };
            } else {
                alert('Erreur : ' + data.error);
                submitBtn.disabled = false;
                submitBtn.innerHTML = `✓ Valider et créer les ${bulkCreationState.tasks.length} tâches dans Notion`;
                card.querySelectorAll('.bulk-select').forEach(sel => sel.disabled = false);
                card.querySelectorAll('.bulk-relation-task-input').forEach(inp => inp.disabled = false);
            }
        } catch(err) {
            console.error("Error creating bulk tasks:", err);
            alert("Erreur de communication avec le serveur.");
            submitBtn.disabled = false;
            submitBtn.innerHTML = `✓ Valider et créer les ${bulkCreationState.tasks.length} tâches dans Notion`;
            card.querySelectorAll('.bulk-select').forEach(sel => sel.disabled = false);
            card.querySelectorAll('.bulk-relation-task-input').forEach(inp => inp.disabled = false);
        }
    });
}

/* ==========================================
   WORKFLOW DE CRÉATION SOLO (SINGLE CREATION)
   ========================================== */
function appendSoloNameInput() {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'ai');
    
    const avatar = document.createElement('div');
    avatar.classList.add('avatar');
    avatar.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    
    const card = document.createElement('div');
    card.className = 'bulk-card step-names';
    card.innerHTML = `
        <div class="bulk-header">
            <div class="bulk-header-icon">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </div>
            <div class="bulk-header-text">
                <div class="bulk-title">Créer une tâche</div>
                <div class="bulk-subtitle">Étape 1 sur 3 — Saisissez le nom de la tâche</div>
            </div>
        </div>
        <div class="bulk-table">
            <div class="bulk-row">
                <div class="bulk-row-num">1</div>
                <input type="text" class="bulk-input solo-task-name-input" placeholder="Saisir le nom de la tâche..." />
            </div>
        </div>
        <div class="bulk-action-row" style="justify-content: flex-end;">
            <button class="bulk-next-btn primary" id="solo-btn-next-step1" disabled>Suivant : Définir la priorité →</button>
        </div>
    `;
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(card);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    const input = card.querySelector('.solo-task-name-input');
    const nextBtn = card.querySelector('#solo-btn-next-step1');
    
    input.focus();
    
    input.addEventListener('input', () => {
        nextBtn.disabled = input.value.trim() === "";
    });
    
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !nextBtn.disabled) {
            e.preventDefault();
            nextBtn.click();
        }
    });
    
    nextBtn.addEventListener('click', () => {
        const name = input.value.trim();
        if (!name) return;
        
        bulkCreationState = {
            current_step: 'priorities',
            tasks: [{
                id: `solo_task_${Date.now()}`,
                name: name,
                priority: "Moyenne",
                objective_id: null,
                indicator_id: null
            }]
        };
        
        input.disabled = true;
        nextBtn.disabled = true;
        nextBtn.style.display = 'none';
        
        const displayMsg = `J'ai saisi le nom de la tâche : "${name}"\nPassons à la qualification de sa priorité.`;
        const payload = `[SOLO_STEP_NOM] ` + JSON.stringify({ name: name });
        sendBulkChatMessage(displayMsg, payload);
    });
}

function appendSoloPrioritySelector(task) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'ai');
    
    const avatar = document.createElement('div');
    avatar.classList.add('avatar');
    avatar.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>`;
    
    const card = document.createElement('div');
    card.className = 'bulk-card step-priorities';
    
    const taskName = task.name || (bulkCreationState.tasks && bulkCreationState.tasks[0] ? bulkCreationState.tasks[0].name : "Tâche sans nom");
    const taskId = bulkCreationState.tasks && bulkCreationState.tasks[0] ? bulkCreationState.tasks[0].id : `solo_task_${Date.now()}`;
    
    if (!bulkCreationState.tasks || bulkCreationState.tasks.length === 0) {
        bulkCreationState.tasks = [{
            id: taskId,
            name: taskName,
            priority: "Moyenne",
            objective_id: null,
            indicator_id: null
        }];
    }
    
    const currentPriority = bulkCreationState.tasks[0].priority || "Moyenne";
    
    card.innerHTML = `
        <div class="bulk-header">
            <div class="bulk-header-icon">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            </div>
            <div class="bulk-header-text">
                <div class="bulk-title">Créer une tâche : Priorité</div>
                <div class="bulk-subtitle">Étape 2 sur 3 — Choisissez la priorité de la tâche (nom modifiable)</div>
            </div>
        </div>
        <div class="bulk-priority-list">
            <div class="bulk-priority-row" data-task-id="${taskId}">
                <input type="text" class="bulk-priority-task-input bulk-input" data-task-id="${taskId}" value="${taskName}" style="font-weight: 500; padding: 2px 4px; border: none; background: transparent; width: 60%; font-size: 12px;" />
                <div class="bulk-priority-options">
                    <button class="bulk-priority-badge basse ${currentPriority === 'Basse' ? 'active' : ''}" data-priority="Basse">Basse</button>
                    <button class="bulk-priority-badge moyenne ${currentPriority === 'Moyenne' ? 'active' : ''}" data-priority="Moyenne">Moyenne</button>
                    <button class="bulk-priority-badge haute ${currentPriority === 'Haute' ? 'active' : ''}" data-priority="Haute">Haute</button>
                </div>
            </div>
        </div>
        <div class="bulk-action-row" style="justify-content: flex-end;">
            <button class="bulk-next-btn primary" id="solo-btn-next-step2">Suivant : Associer à l'Objectif →</button>
        </div>
    `;
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(card);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    const nameInput = card.querySelector('.bulk-priority-task-input');
    const badges = card.querySelectorAll('.bulk-priority-badge');
    const nextBtn = card.querySelector('#solo-btn-next-step2');
    
    nameInput.addEventListener('input', () => {
        const val = nameInput.value.trim();
        if (bulkCreationState.tasks[0]) bulkCreationState.tasks[0].name = val;
        
        const step1Input = document.querySelector(`.bulk-row input[data-task-id="${taskId}"]`);
        if (step1Input) step1Input.value = val;
    });
    
    badges.forEach(badge => {
        badge.addEventListener('click', () => {
            badges.forEach(b => b.classList.remove('active'));
            badge.classList.add('active');
            if (bulkCreationState.tasks[0]) {
                bulkCreationState.tasks[0].priority = badge.dataset.priority;
            }
        });
    });
    
    nextBtn.addEventListener('click', () => {
        const selectedPriority = bulkCreationState.tasks[0] ? bulkCreationState.tasks[0].priority : "Moyenne";
        const finalName = bulkCreationState.tasks[0] ? bulkCreationState.tasks[0].name : taskName;
        
        nameInput.disabled = true;
        badges.forEach(btn => btn.disabled = true);
        nextBtn.disabled = true;
        nextBtn.style.display = 'none';
        
        bulkCreationState.current_step = 'relations';
        
        const displayMsg = `Priorité définie : "${selectedPriority}" pour la tâche "${finalName}".\nAssocions-la maintenant à vos objectifs.`;
        const payload = `[SOLO_STEP_PRIORITY] ` + JSON.stringify({ name: finalName, priority: selectedPriority });
        sendBulkChatMessage(displayMsg, payload);
    });
}

async function appendSoloRelationMapper(task, suggestedGroup) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'ai');
    
    const avatar = document.createElement('div');
    avatar.classList.add('avatar');
    avatar.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`;
    
    const card = document.createElement('div');
    card.className = 'bulk-card step-relations';
    
    const taskName = task.name || (bulkCreationState.tasks && bulkCreationState.tasks[0] ? bulkCreationState.tasks[0].name : "Tâche sans nom");
    const taskId = bulkCreationState.tasks && bulkCreationState.tasks[0] ? bulkCreationState.tasks[0].id : `solo_task_${Date.now()}`;
    const priority = task.priority || (bulkCreationState.tasks && bulkCreationState.tasks[0] ? bulkCreationState.tasks[0].priority : "Moyenne");
    
    if (!bulkCreationState.tasks || bulkCreationState.tasks.length === 0) {
        bulkCreationState.tasks = [{
            id: taskId,
            name: taskName,
            priority: priority,
            objective_id: suggestedGroup.objective_id,
            indicator_id: suggestedGroup.indicator_id
        }];
    } else {
        bulkCreationState.tasks[0].objective_id = suggestedGroup.objective_id;
        bulkCreationState.tasks[0].indicator_id = suggestedGroup.indicator_id;
    }
    
    card.innerHTML = `
        <div class="bulk-header">
            <div class="bulk-header-icon">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <div class="bulk-header-text">
                <div class="bulk-title">Créer une tâche : Association à l'Objectif</div>
                <div class="bulk-subtitle">Étape 3 sur 3 — Vérifiez l'association (nom modifiable)</div>
            </div>
        </div>
        
        <div class="bulk-groups-container">
            <div class="bulk-relation-group" style="padding: 12px; background: #FFFFFF; border: 1px solid #EDECE9; border-radius: 8px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02), 0 4px 12px rgba(0, 0, 0, 0.03); transition: all 0.2s ease-in-out;">
                <div class="bulk-relation-task-item" data-task-id="${taskId}" style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #F1F0EF; padding-bottom: 10px; margin-bottom: 10px;">
                    <div style="display: flex; align-items: center; gap: 8px; width: 70%;">
                        <span style="font-size: 13px; color: #37352F;">📋</span>
                        <input type="text" class="bulk-relation-task-input bulk-input" data-task-id="${taskId}" value="${taskName}" style="padding: 4px 6px; border: 1px solid transparent; background: transparent; width: 100%; font-size: 13px; font-weight: 600; color: #37352F; border-radius: 4px; transition: all 0.15s;" />
                    </div>
                    <span class="bulk-relation-task-pri ${priority.toLowerCase()}" style="font-size: 10px; padding: 2px 8px; border-radius: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px;">${priority}</span>
                </div>
                <div class="bulk-relation-select-container" style="display: flex; flex-direction: column; gap: 8px;">
                    <div class="bulk-relation-select-row" style="display: flex; align-items: center; gap: 8px; padding: 2px 0;">
                        <span class="bulk-relation-select-label" style="font-size: 11.5px; color: #787774; min-width: 90px; font-weight: 500; display: flex; align-items: center; gap: 4px;">🎯 Objectif :</span>
                        <select class="bulk-select objective-select" style="flex: 1; font-size: 12px; padding: 5px 8px; border-radius: 6px; border: 1px solid #EDECE9; background: #FFFFFF; color: #37352F; outline: none; transition: border 0.15s; cursor: pointer; max-width: none;">
                            <option value="">— Choisir un objectif (Requis) —</option>
                        </select>
                    </div>
                    <div class="bulk-relation-select-row indicator-row" style="display: none; align-items: center; gap: 8px; padding: 2px 0;">
                        <span class="bulk-relation-select-label" style="font-size: 11.5px; color: #787774; min-width: 90px; font-weight: 500; display: flex; align-items: center; gap: 4px;">📈 Indicateur :</span>
                        <select class="bulk-select indicator-select" style="flex: 1; font-size: 12px; padding: 5px 8px; border-radius: 6px; border: 1px solid #EDECE9; background: #FFFFFF; color: #37352F; outline: none; transition: border 0.15s; cursor: pointer; max-width: none;">
                            <option value="">— Choisir un indicateur (Requis) —</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="bulk-action-row" style="justify-content: flex-end; margin-top: 14px;">
            <button class="bulk-next-btn primary" id="solo-submit-final" disabled style="background: #000000; border-color: #000000; color: white;">
                ✓ Valider et créer la tâche dans Notion
            </button>
        </div>
    `;
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(card);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    const objSelect = card.querySelector('.objective-select');
    const indSelect = card.querySelector('.indicator-select');
    const indRow = card.querySelector('.indicator-row');
    const nameInput = card.querySelector('.bulk-relation-task-input');
    const submitBtn = card.querySelector('#solo-submit-final');
    const groupEl = card.querySelector('.bulk-relation-group');
    
    groupEl.addEventListener('mouseenter', () => {
        groupEl.style.borderColor = '#DFDBCE';
        groupEl.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.04), 0 6px 16px rgba(0, 0, 0, 0.06)';
    });
    groupEl.addEventListener('mouseleave', () => {
        groupEl.style.borderColor = '#EDECE9';
        groupEl.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.02), 0 4px 12px rgba(0, 0, 0, 0.03)';
    });
    
    nameInput.addEventListener('focus', () => {
        nameInput.style.borderColor = '#EDECE9';
        nameInput.style.background = '#F7F6F3';
    });
    nameInput.addEventListener('blur', () => {
        nameInput.style.borderColor = 'transparent';
        nameInput.style.background = 'transparent';
    });
    
    nameInput.addEventListener('input', () => {
        const val = nameInput.value.trim();
        if (bulkCreationState.tasks[0]) bulkCreationState.tasks[0].name = val;
        
        const step1Input = document.querySelector(`.bulk-row input[data-task-id="${taskId}"]`);
        if (step1Input) step1Input.value = val;
        
        const step2Input = document.querySelector(`.bulk-priority-row[data-task-id="${taskId}"] .bulk-priority-task-input`);
        if (step2Input) step2Input.value = val;
    });
    
    async function getObjectiveCategory(objId) {
        if (!objId) return null;
        try {
            const res = await fetch(`/api/objectifs/category?id=${objId}`);
            const data = await res.json();
            return data.category || null;
        } catch(err) {
            console.error("Error loading category:", err);
            return null;
        }
    }
    
    function updateSubmitButtonState() {
        let isValid = true;
        if (bulkCreationState.tasks && bulkCreationState.tasks[0]) {
            const t = bulkCreationState.tasks[0];
            if (!t.objective_id) {
                isValid = false;
            }
            if (t.objective_id && !t.category) {
                isValid = false;
            }
            if (t.objective_id && !t.indicator_id) {
                isValid = false;
            }
        } else {
            isValid = false;
        }
        submitBtn.disabled = !isValid;
        styleRequiredSelects(card);
    }
    
    const handleObjectiveCategory = async (selectedObjId) => {
        const existingCatRow = card.querySelector('.category-row');
        if (existingCatRow) existingCatRow.remove();
        const existingCatLabel = card.querySelector('.category-label-info');
        if (existingCatLabel) existingCatLabel.remove();
        
        if (selectedObjId) {
            const cat = await getObjectiveCategory(selectedObjId);
            if (cat) {
                const labelInfo = document.createElement('div');
                labelInfo.className = 'bulk-relation-select-row category-label-info';
                labelInfo.style.fontSize = '11px';
                labelInfo.style.color = '#787774';
                labelInfo.style.padding = '4px 0 4px 98px';
                labelInfo.innerHTML = `Catégorie Notion : <span style="background: rgba(35, 131, 226, 0.08); padding: 2px 6px; border-radius: 4px; font-weight: 600; color: #2383E2;">${cat}</span>`;
                indRow.parentNode.appendChild(labelInfo);
                
                if (bulkCreationState.tasks[0]) bulkCreationState.tasks[0].category = cat;
            } else {
                const catRow = document.createElement('div');
                catRow.className = 'bulk-relation-select-row category-row';
                catRow.style.display = 'flex';
                catRow.style.alignItems = 'center';
                catRow.style.gap = '8px';
                catRow.style.padding = '2px 0';
                catRow.innerHTML = `
                    <span class="bulk-relation-select-label" style="font-size: 11.5px; color: #787774; min-width: 90px; font-weight: 500; display: flex; align-items: center; gap: 4px;">🏷️ Catégorie :</span>
                    <select class="bulk-select category-select" style="flex: 1; font-size: 12px; padding: 5px 8px; border-radius: 6px; border: 1px solid #e03131; background: #fff5f5; color: #37352F; outline: none; transition: border 0.15s; cursor: pointer; max-width: none;">
                        <option value="">— Choisir une catégorie —</option>
                        <option value="📚 Études">📚 Études</option>
                        <option value="🏃 Sport">🏃 Sport</option>
                        <option value="🏥 Santé">🏥 Santé</option>
                        <option value="👥 Social">👥 Social</option>
                        <option value="🧑 Personnel">🧑 Personnel</option>
                        <option value="💳 Finances">💳 Finances</option>
                        <option value="🏠 Maison">🏠 Maison</option>
                    </select>
                `;
                indRow.parentNode.appendChild(catRow);
                
                const catSelect = catRow.querySelector('.category-select');
                catSelect.addEventListener('change', () => {
                    const chosenCat = catSelect.value;
                    if (chosenCat) {
                        catSelect.style.borderColor = '#EDECE9';
                    } else {
                        catSelect.style.borderColor = '#e03131';
                    }
                    if (bulkCreationState.tasks[0]) bulkCreationState.tasks[0].category = chosenCat || null;
                    updateSubmitButtonState();
                });
            }
        } else {
            if (bulkCreationState.tasks[0]) bulkCreationState.tasks[0].category = null;
        }
        updateSubmitButtonState();
    };
    
    const objectivesList = await getActiveObjectives();
    
    objectivesList.forEach(o => {
        const isSelected = o.id === suggestedGroup.objective_id;
        objSelect.innerHTML += `<option value="${o.id}" ${isSelected ? 'selected' : ''}>${o.title}</option>`;
    });
    
    async function populateIndicators(objId, selectEl, rowEl, preselectedId) {
        selectEl.disabled = true;
        const indicators = await getObjectiveIndicators(objId);
        selectEl.disabled = false;
        
        selectEl.innerHTML = '<option value="">— Choisir un indicateur (Requis) —</option>';
        if (indicators && indicators.length > 0) {
            indicators.forEach(ind => {
                const isSelected = ind.id === preselectedId;
                selectEl.innerHTML += `<option value="${ind.id}" ${isSelected ? 'selected' : ''}>${ind.text}</option>`;
            });
        }
        
        selectEl.innerHTML += `<option value="new_indicator" style="font-weight: bold; color: #2383E2;">+ Créer un indicateur...</option>`;
        
        if (preselectedId && preselectedId.startsWith("new_indicator:")) {
            const name = preselectedId.replace("new_indicator:", "");
            const opt = document.createElement('option');
            opt.value = preselectedId;
            opt.textContent = `📝 (Nouveau) ${name}`;
            selectEl.insertBefore(opt, selectEl.querySelector('option[value="new_indicator"]'));
            selectEl.value = preselectedId;
        }
    }
    
    if (suggestedGroup.objective_id) {
        indRow.style.display = '';
        await populateIndicators(suggestedGroup.objective_id, indSelect, indRow, suggestedGroup.indicator_id);
        await handleObjectiveCategory(suggestedGroup.objective_id);
    }
    
    objSelect.addEventListener('change', async () => {
        const selectedObjId = objSelect.value;
        if (bulkCreationState.tasks[0]) {
            bulkCreationState.tasks[0].objective_id = selectedObjId || null;
            bulkCreationState.tasks[0].indicator_id = null;
            bulkCreationState.tasks[0].category = null;
        }
        
        if (selectedObjId) {
            indRow.style.display = '';
            await populateIndicators(selectedObjId, indSelect, indRow, null);
        } else {
            indRow.style.display = 'none';
            indSelect.innerHTML = '<option value="">— Choisir un indicateur (Requis) —</option>';
        }
        
        await handleObjectiveCategory(selectedObjId);
    });
    
    indSelect.addEventListener('change', () => {
        if (indSelect.value === 'new_indicator') {
            let newIndInput = indRow.querySelector('.new-indicator-input');
            if (!newIndInput) {
                newIndInput = document.createElement('input');
                newIndInput.type = 'text';
                newIndInput.className = 'bulk-input new-indicator-input';
                newIndInput.placeholder = 'Nom du nouvel indicateur...';
                newIndInput.style.fontSize = '11px';
                newIndInput.style.marginTop = '4px';
                newIndInput.style.border = '1px solid #EDECE9';
                newIndInput.style.padding = '2px 6px';
                newIndInput.style.width = '100%';
                newIndInput.style.boxSizing = 'border-box';
                
                indRow.appendChild(newIndInput);
                newIndInput.focus();
                
                const saveNewIndicator = () => {
                    const name = newIndInput.value.trim();
                    if (name) {
                        const val = `new_indicator:${name}`;
                        const opt = document.createElement('option');
                        opt.value = val;
                        opt.textContent = `📝 (Nouveau) ${name}`;
                        indSelect.insertBefore(opt, indSelect.querySelector('option[value="new_indicator"]'));
                        indSelect.value = val;
                        
                        if (bulkCreationState.tasks[0]) bulkCreationState.tasks[0].indicator_id = val;
                    } else {
                        indSelect.value = "";
                        if (bulkCreationState.tasks[0]) bulkCreationState.tasks[0].indicator_id = null;
                    }
                    newIndInput.remove();
                    updateSubmitButtonState();
                };
                
                newIndInput.addEventListener('keydown', (evt) => {
                    if (evt.key === 'Enter') {
                        evt.preventDefault();
                        saveNewIndicator();
                    }
                });
                
                newIndInput.addEventListener('blur', () => {
                    saveNewIndicator();
                });
            }
        } else {
            const selectedIndId = indSelect.value;
            if (bulkCreationState.tasks[0]) {
                bulkCreationState.tasks[0].indicator_id = selectedIndId || null;
            }
        }
        updateSubmitButtonState();
    });
    
    updateSubmitButtonState();
    
    submitBtn.addEventListener('click', async () => {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="bulk-spinner"></span> Création...';
        
        objSelect.disabled = true;
        indSelect.disabled = true;
        nameInput.disabled = true;
        
        try {
            const res = await fetch('/api/tasks/create_bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tasks: bulkCreationState.tasks,
                    date: currentDate
                })
            });
            const data = await res.json();
            
            if (data.success) {
                card.innerHTML = `
                    <div class="bulk-success-card">
                        <div class="bulk-success-icon" style="background: rgba(43, 138, 62, 0.08); color: #2b8a3e;">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                        <div class="bulk-success-title">Succès !</div>
                        <div class="bulk-success-desc">
                            La tâche <strong>"${bulkCreationState.tasks[0].name}"</strong> a été créée avec succès dans Notion.
                        </div>
                    </div>
                `;
                
                if (data.tasks) {
                    renderTasks(data.tasks);
                }
                
                bulkCreationState = { current_step: null, tasks: [] };
            } else {
                alert('Erreur : ' + data.error);
                submitBtn.disabled = false;
                submitBtn.innerHTML = `✓ Valider et créer la tâche dans Notion`;
                objSelect.disabled = false;
                indSelect.disabled = false;
                nameInput.disabled = false;
            }
        } catch (err) {
            console.error("Error creating task:", err);
            alert("Erreur de communication avec le serveur.");
            submitBtn.disabled = false;
            submitBtn.innerHTML = `✓ Valider et créer la tâche dans Notion`;
            objSelect.disabled = false;
            indSelect.disabled = false;
            nameInput.disabled = false;
        }
    });
}
function appendObjectiveNameInputRestricted(moduleName, moduleId) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'ai');
    
    const avatar = document.createElement('div');
    avatar.classList.add('avatar');
    avatar.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;
    
    const card = document.createElement('div');
    card.className = 'bulk-card step-names';
    card.style.borderLeft = '3px solid #e8590c';
    card.style.background = '#FFFFFF';
    card.style.width = '100%';
    card.style.maxWidth = '100%';
    card.style.boxSizing = 'border-box';
    
    card.innerHTML = `
        <div class="bulk-header">
            <div class="bulk-header-icon" style="background: rgba(232, 89, 12, 0.08); color: #e8590c;">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <div class="bulk-header-text">
                <div class="bulk-title" style="font-size: 13.5px; font-weight: 600; color: #37352F;">Préparation d'examen urgente</div>
                <div class="bulk-subtitle" style="font-size: 11px; color: #787774;">Définissez vos objectifs de révision pour le module : ${moduleName}</div>
            </div>
        </div>
        
        <div style="margin-top: 10px; padding: 10px; background: #FFF9F2; border-radius: 6px; border: 1px solid #FFE8D6; display: flex; align-items: flex-start; gap: 8px;">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#e8590c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 1px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <div style="font-size: 11px; color: #37352F; line-height: 1.4;">
                <strong style="color: #e8590c;">Restriction académique active</strong> — Tous ces objectifs seront automatiquement classés dans la catégorie <strong>Études</strong> et liés au module <strong>${moduleName}</strong>.
            </div>
        </div>
        
        <div id="obj-restricted-list" style="margin-top: 14px; display: flex; flex-direction: column; gap: 14px;">
            <!-- Objective Items will be added here -->
        </div>
        
        <div style="margin-top: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <button class="bulk-add-row-btn" id="obj-restricted-add-btn" style="background: transparent; border: 1px dashed #DFDBCE; color: #37352F; padding: 6px 12px; border-radius: 6px; font-size: 11.5px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: 500; transition: all 0.2s; font-family: inherit;">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Ajouter un objectif
            </button>
            
            <button class="bulk-next-btn primary" id="obj-restricted-btn-submit" disabled style="background: #000000; border-color: #000000; color: white; padding: 7px 16px; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.2s; font-family: inherit;">
                Créer les objectifs dans Notion →
            </button>
        </div>
    `;
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(card);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    const listContainer = card.querySelector('#obj-restricted-list');
    const addBtn = card.querySelector('#obj-restricted-add-btn');
    const submitBtn = card.querySelector('#obj-restricted-btn-submit');
    
    let objectiveIndex = 0;
    
    function createObjectiveItem() {
        objectiveIndex++;
        const itemId = `obj-item-${objectiveIndex}`;
        const itemDiv = document.createElement('div');
        itemDiv.id = itemId;
        itemDiv.className = 'obj-item-card';
        itemDiv.style.border = '1px solid #EDECE9';
        itemDiv.style.borderRadius = '8px';
        itemDiv.style.padding = '12px';
        itemDiv.style.background = '#FAF9F6';
        itemDiv.style.position = 'relative';
        itemDiv.style.transition = 'all 0.2s';
        
        itemDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 11px; font-weight: 700; color: #787774; text-transform: uppercase; letter-spacing: 0.5px;">Objectif #${objectiveIndex}</span>
                <button class="obj-item-delete" style="background: transparent; border: none; color: #C92A2A; cursor: pointer; font-size: 11px; font-weight: 500; display: none; padding: 2px 6px; border-radius: 4px; transition: background 0.15s; font-family: inherit;">Supprimer</button>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <div>
                    <label style="font-size: 10.5px; font-weight: 600; color: #37352F; display: block; margin-bottom: 3px;">Nom de l'objectif *</label>
                    <input type="text" class="obj-item-title-input" placeholder="Ex: Maîtriser l'électromagnétisme..." style="width: 100%; border: 1px solid #EDECE9; border-radius: 6px; padding: 6px 10px; font-size: 12px; font-family: inherit; box-sizing: border-box;" />
                </div>
                <div>
                    <label style="font-size: 10.5px; font-weight: 600; color: #37352F; display: block; margin-bottom: 3px;">Critère de réussite *</label>
                    <input type="text" class="obj-item-critere-input" placeholder="Ex: Obtenir au moins 15/20 à l'examen blanc..." style="width: 100%; border: 1px solid #EDECE9; border-radius: 6px; padding: 6px 10px; font-size: 12px; font-family: inherit; box-sizing: border-box;" />
                </div>
                <div>
                    <label style="font-size: 10.5px; font-weight: 600; color: #37352F; display: block; margin-bottom: 3px;">Indicateurs (séparés par des virgules) *</label>
                    <div class="obj-item-indicators-input content-input" contenteditable="true" placeholder="Ex: Relire le cours..." style="width: 100%; min-height: 38px; border: 1px solid #EDECE9; border-radius: 6px; padding: 8px 10px; font-size: 12px; font-family: inherit; box-sizing: border-box; background: white; outline: none; overflow-y: auto;"></div>
                    <div style="font-size: 9.5px; color: #787774; margin-top: 4px;">Astuce : Tapez <strong>/</strong> pour insérer un badge de poids (Poids 1 = Faible, Poids 3 = Fort).</div>
                </div>
            </div>
        `;
        
        listContainer.appendChild(itemDiv);
        
        const titleInp = itemDiv.querySelector('.obj-item-title-input');
        const critereInp = itemDiv.querySelector('.obj-item-critere-input');
        const indicatorsInp = itemDiv.querySelector('.obj-item-indicators-input');
        wireSlashCommandForCommaInput(indicatorsInp);
        const deleteBtn = itemDiv.querySelector('.obj-item-delete');
        
        titleInp.focus();
        updateDeleteButtons();
        
        const validateAll = () => {
            let allValid = true;
            const cards = listContainer.querySelectorAll('.obj-item-card');
            cards.forEach(c => {
                const t = c.querySelector('.obj-item-title-input').value.trim();
                const cr = c.querySelector('.obj-item-critere-input').value.trim();
                const indEl = c.querySelector('.obj-item-indicators-input');
                const ind = (indEl.innerText || indEl.textContent || "").trim();
                if (!t || !cr || !ind) {
                    allValid = false;
                }
            });
            submitBtn.disabled = !allValid || cards.length === 0;
        };
        
        [titleInp, critereInp, indicatorsInp].forEach(inp => {
            inp.addEventListener('input', validateAll);
            inp.addEventListener('focus', () => {
                inp.style.borderColor = '#2383E2';
                inp.style.background = '#FFFFFF';
            });
            inp.addEventListener('blur', () => {
                inp.style.borderColor = '#EDECE9';
                inp.style.background = '';
            });
        });
        
        deleteBtn.addEventListener('click', () => {
            itemDiv.remove();
            updateDeleteButtons();
            validateAll();
        });
    }
    
    function updateDeleteButtons() {
        const cards = listContainer.querySelectorAll('.obj-item-card');
        cards.forEach(c => {
            const del = c.querySelector('.obj-item-delete');
            if (cards.length > 1) {
                del.style.display = 'block';
            } else {
                del.style.display = 'none';
            }
        });
    }
    
    createObjectiveItem();
    
    addBtn.addEventListener('click', () => {
        createObjectiveItem();
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
    
    submitBtn.addEventListener('click', async () => {
        const cards = listContainer.querySelectorAll('.obj-item-card');
        const objectivesData = [];
        
        cards.forEach(c => {
            const t = c.querySelector('.obj-item-title-input').value.trim();
            const cr = c.querySelector('.obj-item-critere-input').value.trim();
            const indEl = c.querySelector('.obj-item-indicators-input');
            const indicatorsList = parseContentEditableIndicators(indEl);
            
            objectivesData.push({
                title: `[Urgent] ${t}`,
                category: "📚 Études",
                critere: cr,
                indicators: indicatorsList,
                module_id: moduleId
            });
        });
        
        submitBtn.disabled = true;
        addBtn.disabled = true;
        addBtn.style.display = 'none';
        submitBtn.innerHTML = '<span class="bulk-spinner"></span> Création...';
        
        cards.forEach(c => {
            c.querySelector('.obj-item-title-input').disabled = true;
            c.querySelector('.obj-item-critere-input').disabled = true;
            const indEl = c.querySelector('.obj-item-indicators-input');
            indEl.contentEditable = "false";
            indEl.style.background = '#f1f0ef';
            c.querySelector('.obj-item-delete').style.display = 'none';
        });
        
        try {
            const res = await fetch('/api/objectifs/create_bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ objectives: objectivesData })
            });
            const data = await res.json();
            
            if (data.success) {
                card.innerHTML = `
                    <div class="bulk-success-card">
                        <div class="bulk-success-icon" style="background: rgba(43, 138, 62, 0.08); color: #2b8a3e;">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                        <div class="bulk-success-title">Objectifs créés !</div>
                        <div class="bulk-success-desc">
                            Les <strong>${objectivesData.length} objectifs</strong> ont été créés et liés avec succès au module <strong>${moduleName}</strong> dans Notion.
                        </div>
                    </div>
                `;
                
                if (typeof loadObjectivesDashboard === 'function') {
                    loadObjectivesDashboard();
                }
            } else {
                alert('Erreur lors de la création : ' + data.error);
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Créer les objectifs dans Notion →';
            }
        } catch (err) {
            console.error("Error creating objectives:", err);
            alert("Erreur de communication avec le serveur.");
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Créer les objectifs dans Notion →';
        }
    });
}

function appendObjectiveNameInput() {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'ai');
    
    const avatar = document.createElement('div');
    avatar.classList.add('avatar');
    avatar.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;
    
    const card = document.createElement('div');
    card.className = 'bulk-card step-names';
    card.style.borderLeft = '3px solid #2383E2'; // Blue border
    card.style.background = '#FFFFFF';
    
    card.innerHTML = `
        <div class="bulk-header">
            <div class="bulk-header-icon" style="background: rgba(35, 131, 226, 0.08); color: #2383E2;">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="2"/></svg>
            </div>
            <div class="bulk-header-text">
                <div class="bulk-title">Créer un objectif</div>
                <div class="bulk-subtitle">Étape 1 sur 4 — Saisissez le titre de l'objectif</div>
            </div>
        </div>
        <div class="bulk-table">
            <div class="bulk-row" style="border-bottom: 1px solid #EDECE9;">
                <div class="bulk-row-num" style="display: flex; align-items: center; justify-content: center;">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#787774" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="2"/></svg>
                </div>
                <input type="text" class="bulk-input objective-title-input" placeholder="Saisir le titre de l'objectif..." style="font-size: 12.5px; padding: 6px;" />
            </div>
        </div>
        <div class="bulk-action-row" style="justify-content: flex-end; margin-top: 14px;">
            <button class="bulk-next-btn primary" id="obj-btn-next-step1" disabled style="background: #000000; border-color: #000000; color: white; padding: 6px 14px; border-radius: 6px; font-size: 12px;">
                Suivant : Définir la catégorie →
            </button>
        </div>
    `;
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(card);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    const titleInput = card.querySelector('.objective-title-input');
    const nextBtn = card.querySelector('#obj-btn-next-step1');
    
    titleInput.focus();
    
    titleInput.addEventListener('input', () => {
        const val = titleInput.value.trim();
        nextBtn.disabled = !val;
    });
    
    titleInput.addEventListener('keydown', (evt) => {
        if (evt.key === 'Enter' && !nextBtn.disabled) {
            nextBtn.click();
        }
    });
    
    nextBtn.addEventListener('click', () => {
        titleInput.disabled = true;
        nextBtn.disabled = true;
        nextBtn.style.display = 'none';
        
        const titleVal = titleInput.value.trim();
        
        const displayMsg = `Titre de l'objectif : "${titleVal}"`;
        const payload = `[OBJECTIVE_STEP_TITLE] ` + JSON.stringify({ title: titleVal });
        sendBulkChatMessage(displayMsg, payload);
    });
}

function appendObjectiveCategorySelector(objectiveName) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'ai');
    
    const avatar = document.createElement('div');
    avatar.classList.add('avatar');
    avatar.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;
    
    const card = document.createElement('div');
    card.className = 'bulk-card';
    card.style.borderLeft = '3px solid #EDECE9'; 
    card.style.background = '#FFFFFF';
    
    const categories = [
        { name: "Études", value: "📚 Études", icon: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`, color: "#2383E2", bg: "rgba(35, 131, 226, 0.06)" },
        { name: "Sport", value: "🏃 Sport", icon: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path><path d="M2 12h20"></path></svg>`, color: "#e8590c", bg: "rgba(232, 89, 12, 0.06)" },
        { name: "Santé", value: "🏥 Santé", icon: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`, color: "#e03131", bg: "rgba(224, 49, 49, 0.06)" },
        { name: "Social", value: "👥 Social", icon: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`, color: "#7858c4", bg: "rgba(120, 88, 196, 0.06)" },
        { name: "Personnel", value: "🧑 Personnel", icon: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`, color: "#099268", bg: "rgba(9, 146, 104, 0.06)" },
        { name: "Finances", value: "💳 Finances", icon: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>`, color: "#f08c00", bg: "rgba(240, 140, 0, 0.06)" },
        { name: "Maison", value: "🏠 Maison", icon: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`, color: "#666666", bg: "rgba(102, 102, 102, 0.06)" }
    ];
    
    card.innerHTML = `
        <div class="bulk-header">
            <div class="bulk-header-icon" style="background: rgba(55, 53, 47, 0.05); color: #37352F;">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="2"/></svg>
            </div>
            <div class="bulk-header-text">
                <div class="bulk-title">Créer un objectif : "${objectiveName}"</div>
                <div class="bulk-subtitle">Étape 2 sur 4 — Sélectionnez la catégorie</div>
            </div>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 14px;">
            ${categories.map(cat => `
                <button class="bulk-category-badge" data-category="${cat.value}" style="width: 100%; border: none; background: transparent; padding: 8px 12px; border-radius: 6px; display: flex; align-items: center; gap: 10px; cursor: pointer; text-align: left; transition: background 0.1s; font-size: 12.5px; color: #37352F; font-weight: 500;">
                    <span style="display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 4px; background: ${cat.bg}; color: ${cat.color};">
                        ${cat.icon}
                    </span>
                    ${cat.name}
                </button>
            `).join('')}
        </div>
    `;
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(card);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    const badges = card.querySelectorAll('.bulk-category-badge');
    
    badges.forEach(badge => {
        badge.addEventListener('mouseenter', () => {
            badge.style.background = '#F1F0EF';
        });
        badge.addEventListener('mouseleave', () => {
            badge.style.background = 'transparent';
        });
        
        badge.addEventListener('click', () => {
            badges.forEach(b => b.disabled = true);
            badge.style.background = '#EAF6ED';
            
            const selectedVal = badge.dataset.category;
            const displayMsg = `Catégorie de l'objectif : ${selectedVal}`;
            const payload = `[OBJECTIVE_STEP_CATEGORY] ` + JSON.stringify({ title: objectiveName, category: selectedVal });
            
            // Wait slightly for a visual feedback before submitting
            setTimeout(() => {
                sendBulkChatMessage(displayMsg, payload);
            }, 150);
        });
    });
}

function appendObjectiveStructuring(objectiveName, category) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'ai');
    
    const avatar = document.createElement('div');
    avatar.classList.add('avatar');
    avatar.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;
    
    const card = document.createElement('div');
    card.className = 'bulk-card';
    card.style.borderLeft = '3px solid #7858c4'; 
    card.style.background = '#FFFFFF';
    card.style.maxWidth = '680px'; // Set a wider max-width
    card.style.width = '100%';
    card.style.boxSizing = 'border-box';
    
    card.innerHTML = `
        <div class="bulk-header">
            <div class="bulk-header-icon" style="background: rgba(120, 88, 196, 0.08); color: #7858c4;">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path><path d="M12 18c3.314 0 6-2.686 6-6s-2.686-6-6-6-6 2.686-6 6 2.686 6 6 6z"></path></svg>
            </div>
            <div class="bulk-header-text">
                <div class="bulk-title" style="font-size: 13.5px; font-weight: 600; color: #37352F;">Créer un objectif : Structuration</div>
                <div class="bulk-subtitle" style="font-size: 11px; color: #787774;">Étape 3 sur 4 — Définissez les critères et indicateurs</div>
            </div>
        </div>
        
        <div style="margin-top: 14px; display: flex; flex-direction: column; gap: 14px;">
            <div>
                <span style="font-size: 11.5px; color: #37352F; font-weight: 600; display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34"></path><path d="M12 2a7 7 0 0 0-7 7c0 2.52 1.33 4.73 3.33 6h7.34A7.03 7.03 0 0 0 17 9a7 7 0 0 0-7-7z"></path></svg>
                    Critère de réussite (Requis)
                </span>
                <input type="text" class="bulk-input obj-critere-input" placeholder="Ex: Valider le module avec une note > 14/20..." style="width: 100%; box-sizing: border-box; border: 1px solid #EDECE9; padding: 7.5px 12px; border-radius: 6px; font-size: 12.5px; outline: none; background: #FAF9F6; transition: border-color 0.15s;" />
            </div>
            
            <div>
                <span style="font-size: 11.5px; color: #37352F; font-weight: 600; display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>
                    Indicateurs de progression (Min. 1)
                </span>
                <div class="obj-indicators-list" style="display: flex; flex-direction: column; gap: 8px;">
                    <div class="obj-indicator-row" style="display: flex; align-items: center; gap: 8px;">
                        <div class="obj-detail-checkbox" style="cursor: default; flex-shrink: 0;">
                            <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="4"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                        <input type="text" class="bulk-input obj-indicator-input" placeholder="Ex: Réaliser toutes les fiches de cours..." style="flex: 1; border: 1px solid #EDECE9; padding: 7.5px 12px; border-radius: 6px; font-size: 12.5px; outline: none; background: #FAF9F6;" />
                        <select class="obj-indicator-weight-select">
                            <option value="1">Poids 1</option>
                            <option value="2" selected>Poids 2</option>
                            <option value="3">Poids 3</option>
                        </select>
                    </div>
                    <div class="obj-indicator-row" style="display: flex; align-items: center; gap: 8px;">
                        <div class="obj-detail-checkbox" style="cursor: default; flex-shrink: 0;">
                            <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="4"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                        <input type="text" class="bulk-input obj-indicator-input" placeholder="Ex: Pratiquer sur 3 examens blancs..." style="flex: 1; border: 1px solid #EDECE9; padding: 7.5px 12px; border-radius: 6px; font-size: 12.5px; outline: none; background: #FAF9F6;" />
                        <select class="obj-indicator-weight-select">
                            <option value="1">Poids 1</option>
                            <option value="2" selected>Poids 2</option>
                            <option value="3">Poids 3</option>
                        </select>
                    </div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
                    <button class="bulk-add-row-btn" id="obj-add-indicator-btn" style="font-size: 11.5px; color: #2383E2; font-weight: 600; background: transparent; border: none; cursor: pointer; display: flex; align-items: center; gap: 4px; padding: 5px 8px; border-radius: 4px; transition: background 0.15s; font-family: inherit;">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Ajouter un indicateur
                    </button>
                    <span style="font-size: 10px; color: #787774; font-style: italic;">Astuce : Tapez <strong>/</strong> dans le champ pour choisir le poids</span>
                </div>
            </div>
        </div>
        
        <div class="bulk-action-row" style="justify-content: flex-end; margin-top: 18px;">
            <button class="bulk-next-btn primary" id="obj-btn-next-step3" disabled style="background: #000000; border-color: #000000; color: white; padding: 7px 16px; border-radius: 6px; font-size: 12.5px; font-weight: 500; cursor: pointer; transition: all 0.2s; font-family: inherit;">
                Suivant : Définir la date limite →
            </button>
        </div>
    `;
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(card);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    const critereInput = card.querySelector('.obj-critere-input');
    const listContainer = card.querySelector('.obj-indicators-list');
    const addBtn = card.querySelector('#obj-add-indicator-btn');
    const nextBtn = card.querySelector('#obj-btn-next-step3');
    
    critereInput.focus();
    
    const wireSlashCommand = (inp, sel) => {
        inp.addEventListener('input', () => {
            if (inp.value.includes('/')) {
                showSlashMenu(inp, sel);
            }
        });
        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && currentSlashMenu) {
                currentSlashMenu.remove();
                currentSlashMenu = null;
            }
        });
    };

    const initSelects = () => {
        card.querySelectorAll('.obj-indicator-weight-select').forEach(sel => {
            updateWeightSelectColor(sel);
            sel.onchange = () => updateWeightSelectColor(sel);
        });
        
        card.querySelectorAll('.obj-indicator-row').forEach(row => {
            const inp = row.querySelector('.obj-indicator-input');
            const sel = row.querySelector('.obj-indicator-weight-select');
            wireSlashCommand(inp, sel);
        });
    };
    
    initSelects();
    
    const updateNextBtn = () => {
        const critVal = critereInput.value.trim();
        const indicatorInputs = Array.from(card.querySelectorAll('.obj-indicator-input'));
        const hasActiveIndicator = indicatorInputs.some(inp => inp.value.trim() !== "");
        nextBtn.disabled = !(critVal && hasActiveIndicator);
    };
    
    critereInput.addEventListener('input', updateNextBtn);
    listContainer.addEventListener('input', updateNextBtn);
    
    addBtn.addEventListener('click', () => {
        const row = document.createElement('div');
        row.className = 'obj-indicator-row';
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '8px';
        row.innerHTML = `
            <div class="obj-detail-checkbox" style="cursor: default; flex-shrink: 0;">
                <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="4"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <input type="text" class="bulk-input obj-indicator-input" placeholder="Saisir un indicateur..." style="flex: 1; border: 1px solid #EDECE9; padding: 7.5px 12px; border-radius: 6px; font-size: 12.5px; outline: none; background: #FAF9F6;" />
            <select class="obj-indicator-weight-select">
                <option value="1">Poids 1</option>
                <option value="2" selected>Poids 2</option>
                <option value="3">Poids 3</option>
            </select>
            <button class="obj-indicator-remove-btn" style="background: transparent; border: none; font-size: 14px; color: #a8a8a8; cursor: pointer; padding: 2px 6px; border-radius: 4px; transition: color 0.1s;">✕</button>
        `;
        listContainer.appendChild(row);
        
        const inp = row.querySelector('.obj-indicator-input');
        const sel = row.querySelector('.obj-indicator-weight-select');
        inp.focus();
        
        updateWeightSelectColor(sel);
        sel.onchange = () => updateWeightSelectColor(sel);
        wireSlashCommand(inp, sel);
        
        row.querySelector('.obj-indicator-remove-btn').addEventListener('mouseenter', (e) => { e.target.style.color = '#e03131'; });
        row.querySelector('.obj-indicator-remove-btn').addEventListener('mouseleave', (e) => { e.target.style.color = '#a8a8a8'; });
        
        row.querySelector('.obj-indicator-remove-btn').addEventListener('click', () => {
            row.remove();
            updateNextBtn();
        });
        
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
    
    nextBtn.addEventListener('click', () => {
        critereInput.disabled = true;
        card.querySelectorAll('.obj-indicator-input').forEach(inp => inp.disabled = true);
        card.querySelectorAll('.obj-indicator-weight-select').forEach(sel => sel.disabled = true);
        addBtn.style.display = 'none';
        card.querySelectorAll('.obj-indicator-remove-btn').forEach(btn => btn.style.display = 'none');
        nextBtn.style.display = 'none';
        
        const critVal = critereInput.value.trim();
        const indicatorRows = Array.from(card.querySelectorAll('.obj-indicator-row'));
        const indicators = indicatorRows.map(row => {
            const inp = row.querySelector('.obj-indicator-input');
            const sel = row.querySelector('.obj-indicator-weight-select');
            const text = inp.value.trim();
            if (!text) return null;
            const w = sel.value;
            return `${text} (Poids ${w})`;
        }).filter(Boolean);
        
        const displayMsg = `Critère : "${critVal}"\nIndicateurs : \n` + indicators.map(ind => `- ${ind}`).join('\n');
        const payload = `[OBJECTIVE_STEP_STRUCTURING] ` + JSON.stringify({
            title: objectiveName,
            category: category,
            critere: critVal,
            indicators: indicators
        });
        sendBulkChatMessage(displayMsg, payload);
    });
}



function appendObjectiveDatePicker(objectiveName, category, critere, indicators) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'ai');
    
    const avatar = document.createElement('div');
    avatar.classList.add('avatar');
    avatar.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;
    
    const card = document.createElement('div');
    card.className = 'bulk-card step-relations';
    card.style.borderLeft = '3px solid #0F7B5F'; // Green border
    
    card.innerHTML = `
        <div class="bulk-header">
            <div class="bulk-header-icon">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
            </div>
            <div class="bulk-header-text">
                <div class="bulk-title">Créer un objectif : "${objectiveName}"</div>
                <div class="bulk-subtitle">Étape 4 sur 4 — Définissez une date limite (Optionnel)</div>
            </div>
        </div>
        
        <div style="margin-top: 14px; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 12px; color: #787774; min-width: 90px;">📅 Date limite :</span>
                <input type="date" class="bulk-input obj-date-input" style="flex: 1; font-size: 12px; padding: 5px 8px; border-radius: 6px; border: 1px solid #EDECE9; outline: none;" />
            </div>
        </div>
        
        <div class="bulk-action-row" style="justify-content: flex-end; margin-top: 14px; gap: 8px;">
            <button class="bulk-next-btn" id="obj-btn-skip-date" style="border: 1px solid #EDECE9; background: transparent; color: #37352F; padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer;">
                Sauter cette étape
            </button>
            <button class="bulk-next-btn primary" id="obj-btn-submit" style="background: #000000; border-color: #000000; color: white;">
                ✓ Valider et créer l'objectif dans Notion
            </button>
        </div>
    `;
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(card);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    const dateInput = card.querySelector('.obj-date-input');
    const skipBtn = card.querySelector('#obj-btn-skip-date');
    const submitBtn = card.querySelector('#obj-btn-submit');
    
    const triggerSubmit = async (dateVal) => {
        skipBtn.disabled = true;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="bulk-spinner"></span> Création...';
        dateInput.disabled = true;
        
        try {
            const res = await fetch('/api/objectifs/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: objectiveName,
                    category: category,
                    due_date: dateVal,
                    critere: critere,
                    indicators: indicators
                })
            });
            const data = await res.json();
            
            if (data.success) {
                // Clear cache on frontend
                activeObjectivesCache = null;
                
                card.innerHTML = `
                    <div class="bulk-success-card">
                        <div class="bulk-success-icon" style="background: #eaf6ed; color: #2b7a42; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 8px;">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                        <div class="bulk-success-title">Succès !</div>
                        <div class="bulk-success-desc">
                            L'objectif <strong>"${objectiveName}"</strong> (Catégorie : ${category}${dateVal ? `, Limite : ${dateVal}` : ''}) a été créé avec succès dans Notion avec son critère de réussite et ses indicateurs.
                        </div>
                    </div>
                `;
            } else {
                alert("Erreur : " + data.error);
                skipBtn.disabled = false;
                submitBtn.disabled = false;
                submitBtn.innerHTML = `✓ Valider et créer l'objectif dans Notion`;
                dateInput.disabled = false;
            }
        } catch(err) {
            console.error("Error creating objective:", err);
            alert("Erreur de communication avec le serveur.");
            skipBtn.disabled = false;
            submitBtn.disabled = false;
            submitBtn.innerHTML = `✓ Valider et créer l'objectif dans Notion`;
            dateInput.disabled = false;
        }
    };
    
    skipBtn.addEventListener('click', () => {
        triggerSubmit(null);
    });
    
    submitBtn.addEventListener('click', () => {
        triggerSubmit(dateInput.value || null);
    });
}

/* ==========================================
   OBJECTIVES DASHBOARD BOARD
   ========================================== */
function initObjectivesDashboardButtons() {
    const addBtnCol1 = document.getElementById('obj-add-btn-col1');
    const addBtnCol2 = document.getElementById('obj-add-btn-col2');
    
    const startObjCreation = () => {
        const chatTab = document.getElementById('main-tab-chat');
        if (chatTab) chatTab.click();
        appendObjectiveNameInput();
    };
    
    if (addBtnCol1) addBtnCol1.onclick = startObjCreation;
    if (addBtnCol2) addBtnCol2.onclick = startObjCreation;
}

async function loadObjectivesDashboard(isSilent = false) {
    const nsEl = document.getElementById('obj-stat-not-started');
    const ipEl = document.getElementById('obj-stat-in-progress');
    const dEl = document.getElementById('obj-stat-done');
    
    const listNs = document.getElementById('obj-list-not-started');
    const listIp = document.getElementById('obj-list-in-progress');
    const listD = document.getElementById('obj-list-done');
    const listP = document.getElementById('obj-list-paused');
    
    const countNs = document.querySelector('#obj-col-not-started .obj-col-count');
    const countIp = document.querySelector('#obj-col-in-progress .obj-col-count');
    const countD = document.querySelector('#obj-col-done .obj-col-count');
    
    if (!isSilent) {
        listNs.innerHTML = '<div style="font-size: 11px; color: #a8a8a8; padding: 10px; text-align: center;">Chargement...</div>';
        listIp.innerHTML = '<div style="font-size: 11px; color: #a8a8a8; padding: 10px; text-align: center;">Chargement...</div>';
        listD.innerHTML = '<div style="font-size: 11px; color: #a8a8a8; padding: 10px; text-align: center;">Chargement...</div>';
        if (listP) listP.innerHTML = '<div style="font-size: 11px; color: #a8a8a8; padding: 10px; text-align: center;">Chargement...</div>';
    }
    
    try {
        const res = await fetch('/api/objectifs/dashboard');
        const list = await res.json();
        
        listNs.innerHTML = '';
        listIp.innerHTML = '';
        listD.innerHTML = '';
        if (listP) listP.innerHTML = '';
        
        if (!list || list.length === 0) {
            const emptyMsg = '<div style="font-size: 11px; color: #787774; padding: 12px; text-align: center; font-style: italic;">Aucun objectif</div>';
            listNs.innerHTML = emptyMsg;
            listIp.innerHTML = emptyMsg;
            listD.innerHTML = emptyMsg;
            if (listP) listP.innerHTML = emptyMsg;
            return;
        }
        
        let total = list.length;
        let notStartedCount = 0;
        let inProgressCount = 0;
        let doneCount = 0;
        let pausedCount = 0;
        
        list.forEach(o => {
            const cardEl = document.createElement('div');
            cardEl.className = 'obj-dashboard-card';
            cardEl.style.background = '#FFFFFF';
            cardEl.style.border = '1px solid #EDECE9';
            cardEl.style.borderRadius = '8px';
            cardEl.style.padding = '12px';
            cardEl.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.02), 0 4px 12px rgba(0, 0, 0, 0.03)';
            cardEl.style.transition = 'all 0.2s ease-in-out';
            cardEl.style.cursor = 'pointer';
            cardEl.style.marginTop = '6px';
            
            cardEl.addEventListener('mouseenter', () => {
                if (!cardEl.classList.contains('paused')) {
                    cardEl.style.borderColor = '#DFDBCE';
                }
                cardEl.style.transform = 'translateY(-2px)';
                cardEl.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.05), 0 8px 18px rgba(0, 0, 0, 0.04)';
            });
            cardEl.addEventListener('mouseleave', () => {
                if (!cardEl.classList.contains('paused')) {
                    cardEl.style.borderColor = '#EDECE9';
                } else {
                    cardEl.style.borderColor = '#74c0fc';
                }
                cardEl.style.transform = 'translateY(0)';
                cardEl.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.02), 0 4px 12px rgba(0, 0, 0, 0.03)';
            });
            
            cardEl.addEventListener('click', (e) => {
                if (e.target.closest('.obj-detail-panel') || e.target.closest('.obj-detail-checkbox') || e.target.closest('.sys-msg-confirm-btn') || e.target.closest('.obj-detail-weight-select')) {
                    return;
                }
                const panel = cardEl.querySelector('.obj-detail-panel');
                const isExpanded = cardEl.classList.contains('expanded');
                
                document.querySelectorAll('.obj-dashboard-card').forEach(c => {
                    if (c !== cardEl) {
                        c.classList.remove('expanded');
                        const p = c.querySelector('.obj-detail-panel');
                        if (p) {
                            p.classList.remove('expanded');
                            p.style.display = 'none';
                        }
                    }
                });
                
                if (isExpanded) {
                    cardEl.classList.remove('expanded');
                    if (panel) {
                        panel.classList.remove('expanded');
                        panel.style.display = 'none';
                    }
                } else {
                    cardEl.classList.add('expanded');
                    if (panel) {
                        panel.classList.add('expanded');
                        panel.style.display = 'block';
                        loadInlineObjectiveDetails(o.id, panel, cardEl);
                    }
                }
            });
            
            let progressNum = 0;
            if (o.progression) {
                const clean = o.progression.replace('%', '').trim();
                progressNum = parseFloat(clean) || 0;
            }
            if (o.atteint) progressNum = 100;
            
            let barColor = '#e03131';
            if (progressNum >= 70) barColor = '#2b8a3e';
            else if (progressNum >= 30) barColor = '#e8590c';
            
            let catBadge = '';
            if (o.category) {
                let badgeBg = 'rgba(55,53,47,0.08)';
                let badgeColor = '#37352F';
                
                if (o.category.includes('📚')) { badgeBg = 'rgba(35, 131, 226, 0.08)'; badgeColor = '#2383E2'; }
                else if (o.category.includes('🏃')) { badgeBg = 'rgba(232, 89, 12, 0.08)'; badgeColor = '#e8590c'; }
                else if (o.category.includes('🏥')) { badgeBg = 'rgba(224, 49, 49, 0.08)'; badgeColor = '#e03131'; }
                else if (o.category.includes('👥')) { badgeBg = 'rgba(120, 88, 196, 0.08)'; badgeColor = '#7858c4'; }
                else if (o.category.includes('🧑')) { badgeBg = 'rgba(9, 146, 104, 0.08)'; badgeColor = '#099268'; }
                else if (o.category.includes('💳')) { badgeBg = 'rgba(240, 140, 0, 0.08)'; badgeColor = '#f08c00'; }
                else if (o.category.includes('🏠')) { badgeBg = 'rgba(102, 102, 102, 0.08)'; badgeColor = '#666666'; }
                
                catBadge = `<span style="background: ${badgeBg}; color: ${badgeColor}; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 600; margin-top: 4px; display: inline-block;">${o.category}</span>`;
            }
            
            let durationHtml = '';
            if (o.status === 'In progress' || o.status === 'En cours' || o.status === '🟡 En cours') {
                const days = o.jours_en_cours !== null ? o.jours_en_cours : 0;
                durationHtml = `
                    <div style="font-size: 11px; color: #b28600; font-weight: 600; margin-top: 6px; display: flex; align-items: center; gap: 4px;">
                        <span>⏳</span> En cours depuis <strong>${days}</strong> jour${days > 1 ? 's' : ''}
                    </div>
                `;
            }
            
            let urgentBadge = '';
            let displayTitle = o.title;
            if (o.title.startsWith('[Urgent]')) {
                displayTitle = o.title.replace('[Urgent]', '').trim();
                urgentBadge = `<span style="background: #FFE2E2; color: #C92A2A; border: 1px solid #FFC9C9; font-size: 10px; padding: 1.5px 5px; border-radius: 4px; font-weight: 700; display: inline-block;">🚨 Urgent</span>`;
            }

            let unstructuredBadge = '';
            if (o.unstructured) {
                unstructuredBadge = `<span class="unstructured-badge" style="background: #FFF0F6; color: #D9480F; border: 1px solid #FFD8A8; font-size: 9.5px; padding: 1.5px 5px; border-radius: 4px; font-weight: 700; display: inline-block;">⚠️ Non structuré</span>`;
            }
            
            const isNotStarted = !(o.status === 'Done' || o.status === 'Terminé' || o.status === '🟢 Complété' || o.atteint) &&
                                 !(o.status === 'In progress' || o.status === 'En cours' || o.status === '🟡 En cours') &&
                                 !(o.status === 'Paused' || o.status === 'En pause');
                                 
            const progressBarHtml = isNotStarted ? '' : `
                <div style="margin-top: 10px;">
                    <div style="display: flex; justify-content: space-between; font-size: 10.5px; color: #787774; margin-bottom: 3px;">
                        <span>Progression</span>
                        <span style="font-weight: 600; color: #37352F;" class="card-progress-pct">${progressNum}%</span>
                    </div>
                    <div style="background: #F1F0EF; height: 5px; border-radius: 3px; overflow: hidden; width: 100%;">
                        <div class="card-progress-bar" style="background: ${barColor}; height: 100%; width: ${progressNum}%;"></div>
                    </div>
                </div>
            `;

            cardEl.setAttribute('draggable', 'true');
            cardEl.setAttribute('data-obj-id', o.id);
            cardEl.setAttribute('data-unstructured', o.unstructured ? 'true' : 'false');
            cardEl.setAttribute('data-obj-title', displayTitle);
            
            cardEl.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', o.id);
                
                // Show ONLY the trash zone for the column this card belongs to
                const parentListId = cardEl.parentElement ? cardEl.parentElement.id : '';
                let targetTrashId = '';
                if (parentListId === 'obj-list-not-started' || parentListId === 'obj-list-paused') {
                    targetTrashId = 'obj-trash-col1';
                } else if (parentListId === 'obj-list-in-progress') {
                    targetTrashId = 'obj-trash-col2';
                } else if (parentListId === 'obj-list-done') {
                    targetTrashId = 'obj-trash-col3';
                }
                
                if (targetTrashId) {
                    const activeTrash = document.getElementById(targetTrashId);
                    if (activeTrash) activeTrash.classList.add('active');
                }
                
                // Add dragging-active class to body
                document.body.classList.add('dragging-active');
                
                // Custom 100% opaque drag ghost clone
                const dragGhost = cardEl.cloneNode(true);
                dragGhost.style.position = 'absolute';
                dragGhost.style.top = '-1000px';
                dragGhost.style.left = '-1000px';
                dragGhost.style.width = cardEl.offsetWidth + 'px';
                dragGhost.style.opacity = '1';
                dragGhost.style.zIndex = '9999';
                dragGhost.style.transform = 'none';
                dragGhost.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.12)';
                document.body.appendChild(dragGhost);
                
                e.dataTransfer.setDragImage(dragGhost, e.offsetX || (cardEl.offsetWidth / 2), e.offsetY || 20);
                
                setTimeout(() => {
                    cardEl.classList.add('dragging');
                    dragGhost.remove();
                }, 0);
            });
            
            cardEl.addEventListener('dragend', () => {
                cardEl.classList.remove('dragging');
                document.body.classList.remove('dragging-active');
                
                // Hide all trash zones and restore styles
                document.querySelectorAll('.obj-trash-zone').forEach(tz => {
                    tz.classList.remove('active');
                    tz.classList.remove('dragover');
                });
            });

            cardEl.innerHTML = `
                <div style="font-size: 12.5px; font-weight: 600; color: #37352F; line-height: 1.4;">${displayTitle}</div>
                <div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-top: 4px;">
                    ${urgentBadge}
                    ${unstructuredBadge}
                    ${catBadge}
                    ${o.due_date ? `<span style="font-size: 10px; color: #787774; background: #f1f0ef; padding: 2px 6px; border-radius: 4px; font-weight: 500;">📅 Limite: ${o.due_date}</span>` : ''}
                </div>
                
                ${progressBarHtml}
                
                ${durationHtml}
                
                <div style="font-size: 9.5px; color: #a8a8a8; margin-top: 8px; text-align: right;">
                    Créé le : ${o.date_creation || '—'}
                </div>
                
                <!-- Expanded details panel -->
                <div class="obj-detail-panel" style="display: none;"></div>
            `;
            
            if (o.status === 'Done' || o.status === 'Terminé' || o.status === '🟢 Complété' || o.atteint) {
                listD.appendChild(cardEl);
                doneCount++;
            } else if (o.status === 'In progress' || o.status === 'En cours' || o.status === '🟡 En cours') {
                listIp.appendChild(cardEl);
                inProgressCount++;
            } else if (o.status === 'Paused' || o.status === 'En pause') {
                cardEl.classList.add('paused');
                cardEl.style.borderColor = '#74c0fc';
                if (listP) listP.appendChild(cardEl);
                pausedCount++;
            } else {
                listNs.appendChild(cardEl);
                notStartedCount++;
            }
        });

        // Wire Column Drag & Drop targets (Only once)
        [
            { el: listNs, status: 'Not started' },
            { el: listP, status: 'Paused' },
            { el: listIp, status: 'In progress' },
            { el: listD, status: 'Done' }
        ].forEach(col => {
            if (!col.el) return;
            if (col.el.dragListenersWired) return;
            col.el.dragListenersWired = true;
            
            col.el.addEventListener('dragover', (e) => {
                e.preventDefault();
                col.el.style.background = '#EDECE9';
                col.el.style.borderRadius = '8px';
            });
            col.el.addEventListener('dragleave', () => {
                col.el.style.background = '';
            });
            col.el.addEventListener('drop', async (e) => {
                e.preventDefault();
                col.el.style.background = '';
                
                const objId = e.dataTransfer.getData('text/plain');
                if (!objId) return;
                
                const draggingCard = document.querySelector(`.obj-dashboard-card.dragging`);
                if (!draggingCard) return;
                
                const pctSpan = draggingCard.querySelector('.card-progress-pct');
                const progressVal = pctSpan ? parseInt(pctSpan.textContent || '0') : 0;
                const parentListId = draggingCard.parentElement ? draggingCard.parentElement.id : '';
                
                // 1. Forbidden to drag 100% completed objective to any other category
                if (progressVal === 100 && col.status !== 'Done') {
                    showToast("Cet objectif est complété à 100%. Il ne peut pas être rétrogradé.", "error");
                    return;
                }
                
                // 2. Forbidden to drag a 0% progress objective (Non commencé) to other categories manually
                if (parentListId === 'obj-list-not-started' && progressVal === 0 && col.status !== 'Not started') {
                    showToast("Pour démarrer cet objectif, veuillez cocher au moins une tâche ou un indicateur.", "error");
                    return;
                }
                
                // 3. Redirect In progress objective to Paused status if dragged to Non commencé & En pause column
                if (parentListId === 'obj-list-in-progress' && col.status === 'Not started') {
                    col = { el: listP, status: 'Paused' };
                }
                
                // 4. Paused status transition rule: ONLY allow drops to Paused if it comes from 'In progress' list
                if (col.status === 'Paused') {
                    if (parentListId !== 'obj-list-in-progress') {
                        showToast("Un objectif ne peut être mis en pause que s'il est En cours.", "error");
                        return;
                    }
                }
                
                // 5. Enforce Rule: Forbidden to drag unstructured objectives to Terminé (Done)
                if (col.status === 'Done') {
                    const isUnstructured = draggingCard.getAttribute('data-unstructured') === 'true';
                    if (isUnstructured) {
                        const title = draggingCard.getAttribute('data-obj-title') || "cet objectif";
                        showToast(`Impossible de terminer "${title}" : il est Non structuré (des indicateurs n'ont aucune tâche).`, "error");
                        return;
                    }
                }
                
                // --- OPTIMISTIC DRAG-AND-DROP ---
                const originalParent = draggingCard.parentElement;
                const originalStatus = draggingCard.classList.contains('paused') ? 'Paused' : 
                                       (originalParent.id === 'obj-list-in-progress' ? 'In progress' : 
                                       (originalParent.id === 'obj-list-done' ? 'Done' : 'Not started'));
                
                // Move card in the DOM immediately
                col.el.appendChild(draggingCard);
                
                // Handle paused classes visually
                if (col.status === 'Paused') {
                    draggingCard.classList.add('paused');
                    draggingCard.style.borderColor = '#74c0fc';
                } else {
                    draggingCard.classList.remove('paused');
                    draggingCard.style.borderColor = '#EDECE9';
                }
                
                recalculateBoardCountersOptimistically();
                
                try {
                    const response = await fetch('/api/objectifs/update_status', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            objective_id: objId,
                            status: col.status
                        })
                    });
                    const resData = await response.json();
                    if (resData.success) {
                        await loadObjectivesDashboard(true);
                    } else {
                        // Revert on failure
                        originalParent.appendChild(draggingCard);
                        if (originalStatus === 'Paused') {
                            draggingCard.classList.add('paused');
                            draggingCard.style.borderColor = '#74c0fc';
                        } else {
                            draggingCard.classList.remove('paused');
                            draggingCard.style.borderColor = '#EDECE9';
                        }
                        recalculateBoardCountersOptimistically();
                        alert("Erreur de déplacement : " + resData.error);
                    }
                } catch (err) {
                    // Revert on failure
                    originalParent.appendChild(draggingCard);
                    if (originalStatus === 'Paused') {
                        draggingCard.classList.add('paused');
                        draggingCard.style.borderColor = '#74c0fc';
                    } else {
                        draggingCard.classList.remove('paused');
                        draggingCard.style.borderColor = '#EDECE9';
                    }
                    recalculateBoardCountersOptimistically();
                    console.error("Error drop:", err);
                }
            });
        });
        
        // Wire Trash Zones
        document.querySelectorAll('.obj-trash-zone').forEach(tz => {
            if (tz.dragListenersWired) return;
            tz.dragListenersWired = true;
            
            tz.addEventListener('dragover', (e) => {
                e.preventDefault();
                tz.classList.add('dragover');
            });
            
            tz.addEventListener('dragleave', () => {
                tz.classList.remove('dragover');
            });
            
            tz.addEventListener('drop', async (e) => {
                e.preventDefault();
                tz.classList.remove('dragover');
                
                const draggingCard = document.querySelector(`.obj-dashboard-card.dragging`) || document.querySelector(`.obj-dashboard-card[data-obj-title="${document.querySelector('.obj-dashboard-card.dragging')?.getAttribute('data-obj-title')}"]`);
                if (!draggingCard) return;
                
                const objId = draggingCard.getAttribute('data-obj-id') || e.dataTransfer.getData('text/plain');
                if (!objId) return;
                
                const originalParent = draggingCard.parentElement;
                const originalNextSibling = draggingCard.nextSibling;
                
                const confirmTitle = draggingCard.getAttribute('data-obj-title') || "cet objectif";
                
                showSystemHeaderMessageWithConfirmCancel(
                    `Supprimer "${confirmTitle}" ?`,
                    async () => {
                        // --- OPTIMISTIC UI DELETE ---
                        draggingCard.style.display = 'none';
                        draggingCard.remove();
                        recalculateBoardCountersOptimistically();
                        
                        try {
                            const deleteRes = await fetch('/api/objectifs/delete', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ objective_id: objId })
                            });
                            const deleteData = await deleteRes.json();
                            
                            if (deleteData.success) {
                                showToast("Objectif supprimé avec succès.", "success");
                                await loadObjectivesDashboard(true);
                            } else {
                                // Revert
                                if (originalNextSibling) {
                                    originalParent.insertBefore(draggingCard, originalNextSibling);
                                } else {
                                    originalParent.appendChild(draggingCard);
                                }
                                draggingCard.style.display = '';
                                recalculateBoardCountersOptimistically();
                                showToast("Erreur lors de la suppression : " + deleteData.error, "error");
                            }
                        } catch (err) {
                            // Revert
                            if (originalNextSibling) {
                                originalParent.insertBefore(draggingCard, originalNextSibling);
                            } else {
                                originalParent.appendChild(draggingCard);
                            }
                            draggingCard.style.display = '';
                            recalculateBoardCountersOptimistically();
                            console.error("Error deleting objective:", err);
                            showToast("Erreur réseau.", "error");
                        }
                    },
                    () => {
                        // On cancel, show a tiny toast and do nothing else (card is still in the column)
                        showToast("Suppression annulée.", "info");
                    }
                );
            });
        });
        
        if (nsEl) nsEl.textContent = notStartedCount + pausedCount;
        if (ipEl) ipEl.textContent = inProgressCount;
        if (dEl) dEl.textContent = doneCount;
        
        if (countNs) countNs.textContent = `(${notStartedCount + pausedCount})`;
        if (countIp) countIp.textContent = `(${inProgressCount})`;
        if (countD) countD.textContent = `(${doneCount})`;
        
        if (notStartedCount === 0) listNs.innerHTML = '<div style="font-size: 11px; color: #787774; padding: 12px; text-align: center; font-style: italic;">Aucun objectif non commencé</div>';
        if (inProgressCount === 0) listIp.innerHTML = '<div style="font-size: 11px; color: #787774; padding: 12px; text-align: center; font-style: italic;">Aucun objectif en cours</div>';
        if (doneCount === 0) listD.innerHTML = '<div style="font-size: 11px; color: #787774; padding: 12px; text-align: center; font-style: italic;">Aucun objectif terminé</div>';
        
    } catch(err) {
        console.error("Error loading objectives board:", err);
        listNs.innerHTML = '<div style="font-size: 11px; color: #e03131; padding: 10px; text-align: center;">Erreur de chargement.</div>';
        listIp.innerHTML = '<div style="font-size: 11px; color: #e03131; padding: 10px; text-align: center;">Erreur de chargement.</div>';
        listD.innerHTML = '<div style="font-size: 11px; color: #e03131; padding: 10px; text-align: center;">Erreur de chargement.</div>';
    }
}


function cycleIndicatorWeight(btnEl, blockId, objId) {
    const currentW = parseInt(btnEl.getAttribute('data-weight') || '2');
    let newW = currentW + 1;
    if (newW > 3) newW = 1;
    
    // Optimistic UI update
    btnEl.setAttribute('data-weight', newW);
    btnEl.className = `habit-weight-btn obj-detail-weight-btn w${newW}`;
    btnEl.textContent = `Poids ${newW}`;
    
    // Recalculate panel progress bar optimistically
    const panel = btnEl.closest('.obj-detail-panel');
    const cardEl = document.querySelector(`.objective-card[data-id="${objId}"]`);
    if (panel) {
        let weightedProgress = 0.0;
        let totalWeights = 0.0;
        panel.querySelectorAll('.obj-detail-ind-row').forEach(r => {
            const wBtn = r.querySelector('.obj-detail-weight-btn');
            const indWeight = wBtn ? parseInt(wBtn.getAttribute('data-weight') || '2') : 2;
            
            const taskItems = r.querySelectorAll('.obj-detail-task-item');
            let indProgress = 0.0;
            if (taskItems.length > 0) {
                let completed = 0, total = 0;
                taskItems.forEach(tItem => {
                    const chk = tItem.querySelector('.obj-detail-checkbox');
                    const badgeH = tItem.querySelector('.priority-badge-high');
                    const badgeL = tItem.querySelector('.priority-badge-low');
                    let coef = badgeH ? 3 : (badgeL ? 1 : 2);
                    total += coef;
                    if (chk && chk.classList.contains('checked')) completed += coef;
                });
                indProgress = total > 0 ? (completed / total * 100.0) : 0.0;
            } else {
                const indChk = r.querySelector('.obj-detail-ind-header .obj-detail-checkbox');
                indProgress = (indChk && indChk.classList.contains('checked')) ? 100.0 : 0.0;
            }
            weightedProgress += indProgress * indWeight;
            totalWeights += indWeight;
        });
        const calculatedProgress = totalWeights > 0 ? Math.round(weightedProgress / totalWeights) : 0;
        if (cardEl) {
            const cardPct = cardEl.querySelector('.card-progress-pct');
            const cardBar = cardEl.querySelector('.card-progress-bar');
            if (cardPct && cardBar) {
                cardPct.textContent = `${calculatedProgress}%`;
                cardBar.style.width = `${calculatedProgress}%`;
            }
        }
    }
    
    // Background API call
    fetch('/api/objectifs/update_indicator_weight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ block_id: blockId, weight: newW })
    }).catch(err => console.error("Error updating indicator weight:", err));
}


async function loadInlineObjectiveDetails(objId, panel, cardEl) {
    try {
        if (!panel.innerHTML || panel.innerHTML.includes('Erreur') || panel.innerHTML.includes('Chargement')) {
            panel.innerHTML = '<div style="font-size: 11px; color: #787774; padding: 10px; text-align: center;">Chargement OKR...</div>';
        }
        
        const res = await fetch(`/api/objectifs/details?id=${objId}&nocache=true`);
        const data = await res.json();
        
        // Update main card progress inline
        const cardPct = cardEl.querySelector('.card-progress-pct');
        const cardBar = cardEl.querySelector('.card-progress-bar');
        if (cardPct && cardBar) {
            cardPct.textContent = `${data.progress}%`;
            cardBar.style.width = `${data.progress}%`;
            
            let barColor = '#e03131';
            if (data.progress >= 70) barColor = '#2b8a3e';
            else if (data.progress >= 30) barColor = '#e8590c';
            cardBar.style.background = barColor;
        }
        
        let indicatorsHtml = '';
        if (data.indicators && data.indicators.length > 0) {
            data.indicators.forEach(ind => {
                const badgeBg = ind.progress >= 100 ? '#e2f9e9' : (ind.progress > 0 ? '#fff3bf' : '#f1f0ef');
                const badgeColor = ind.progress >= 100 ? '#1e7e34' : (ind.progress > 0 ? '#b28600' : '#787774');
                
                let tasksHtml = '';
                if (ind.tasks && ind.tasks.length > 0) {
                    // Sort tasks by priority coefficient descending (Haute = 3, Moyenne = 2, Basse = 1)
                    const sortedTasks = [...ind.tasks].sort((a, b) => b.coef - a.coef);
                    
                    sortedTasks.forEach(task => {
                        let priorityBadge = '';
                        if (task.coef === 3) {
                            priorityBadge = '<span class="priority-badge-high">Haute</span>';
                        } else if (task.coef === 1) {
                            priorityBadge = '<span class="priority-badge-low">Basse</span>';
                        } else {
                            priorityBadge = '<span class="priority-badge-medium">Moyenne</span>';
                        }
                        
                        tasksHtml += `
                            <div class="obj-detail-task-item">
                                <div class="obj-detail-checkbox ${task.checked ? 'checked' : ''}" data-block-id="${task.id}">
                                    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="4"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                </div>
                                <div style="font-size: 11.5px; line-height: 1.4; display: flex; flex-direction: column; gap: 2px; align-items: flex-start;">
                                    <span class="obj-detail-text ${task.checked ? 'completed' : ''}" style="text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 130px; display: inline-block; cursor: pointer; vertical-align: bottom;" title="Cliquez pour afficher en entier" onclick="event.stopPropagation(); this.style.whiteSpace = this.style.whiteSpace === 'normal' ? 'nowrap' : 'normal'; this.style.maxWidth = this.style.maxWidth === 'none' ? '130px' : 'none';">${task.text}</span>
                                    ${priorityBadge}
                                </div>
                            </div>
                        `;
                    });
                } else {
                    tasksHtml = '<span style="font-size: 11px; color: #787774; font-style: italic; padding-left: 6px;">Aucune tâche reliée</span>';
                }
                
                indicatorsHtml += `
                     <div class="obj-detail-ind-row">
                         <div class="obj-detail-ind-header">
                             <div style="display: flex; gap: 8px; align-items: flex-start;">
                                 <div class="obj-detail-checkbox ${ind.checked ? 'checked' : ''}" data-block-id="${ind.id}">
                                     <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="4"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                 </div>
                                 <span class="obj-detail-text ${ind.checked ? 'completed' : ''}" style="font-size: 12.5px; font-weight: 500; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 130px; display: inline-block; cursor: pointer; vertical-align: bottom;" title="Cliquez pour afficher en entier" onclick="event.stopPropagation(); this.style.whiteSpace = this.style.whiteSpace === 'normal' ? 'nowrap' : 'normal'; this.style.maxWidth = this.style.maxWidth === 'none' ? '130px' : 'none';">${ind.text}</span>
                             </div>
                            <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                                <button class="habit-weight-btn obj-detail-weight-btn w${ind.weight || 2}" data-block-id="${ind.id}" data-weight="${ind.weight || 2}" title="Cliquer pour changer le poids" onclick="event.stopPropagation(); cycleIndicatorWeight(this, '${ind.id}', '${objId}')">Poids ${ind.weight || 2}</button>
                                <span style="font-size: 10px; font-weight: 700; background: ${badgeBg}; color: ${badgeColor}; padding: 2px 6px; border-radius: 4px;">
                                    ${ind.progress}%
                                </span>
                            </div>
                        </div>
                        <div class="obj-detail-tasks-list">
                            ${tasksHtml}
                        </div>
                    </div>
                `;
            });
        } else {
            indicatorsHtml = '<div style="font-size: 11px; color: #787774; text-align: center; font-style: italic; padding: 10px;">Aucun indicateur de réussite défini.</div>';
        }
        
        panel.innerHTML = `
            <div class="obj-detail-critere-callout">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#EB5757" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 1px;"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                <div>
                    <div style="font-size: 9.5px; font-weight: 700; color: #EB5757; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">Critère de réussite global</div>
                    <div style="font-size: 11.5px; font-style: italic; color: #37352F;">${data.critere || "Non spécifié"}</div>
                </div>
            </div>
            
            <div style="font-size: 10px; font-weight: 700; color: #787774; text-transform: uppercase; letter-spacing: 0.5px; margin: 12px 0 8px 0;">Indicateurs & Jalons</div>
            <div class="obj-indicators-list" style="display: flex; flex-direction: column; gap: 8px;">
                ${indicatorsHtml}
            </div>
        `;
        
        // Wire checklist click triggers
        panel.querySelectorAll('.obj-detail-checkbox').forEach(chk => {
            chk.onclick = async (e) => {
                e.stopPropagation(); // prevent collapsing the card
                
                const blockId = chk.getAttribute('data-block-id');
                const isChecked = chk.classList.contains('checked');
                
                // Check if this card is currently paused
                const isPaused = cardEl && (cardEl.classList.contains('paused') || cardEl.closest('#obj-list-paused'));
                
                if (isPaused) {
                    showSystemHeaderMessageWithAction(
                        "Objectif en pause. Activer pour cocher ?",
                        "Confirmer",
                        async () => {
                            try {
                                const statusRes = await fetch('/api/objectifs/update_status', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        objective_id: objId,
                                        status: 'In progress'
                                    })
                                });
                                const statusData = await statusRes.json();
                                if (statusData.success) {
                                    cardEl.classList.remove('paused');
                                    cardEl.style.borderColor = '#EDECE9';
                                    const listIp = document.getElementById('obj-list-in-progress');
                                    if (listIp) listIp.appendChild(cardEl);
                                    
                                    recalculateBoardCountersOptimistically();
                                    chk.click();
                                } else {
                                    showToast("Erreur d'activation de l'objectif.", "error");
                                }
                            } catch (err) {
                                console.error(err);
                                showToast("Erreur de communication.", "error");
                            }
                        }
                    );
                    return;
                }
                
                const row = chk.closest('.obj-detail-ind-row');
                const isIndicator = chk.closest('.obj-detail-ind-header') !== null;
                
                // Enforce Rule: Indicator with no tasks cannot be checked
                if (isIndicator && !isChecked) {
                    const taskItems = row.querySelectorAll('.obj-detail-task-item');
                    if (taskItems.length === 0) {
                        chk.style.borderColor = '#C92A2A';
                        chk.style.backgroundColor = '#FFE2E2';
                        setTimeout(() => {
                            chk.style.borderColor = '';
                            chk.style.backgroundColor = '';
                        }, 1500);
                        showToast("Impossible de cocher cet indicateur : il ne possède aucune tâche.", "error");
                        return;
                    }
                }
                
                // --- OPTIMISTIC UI TRANSITIONS ---
                const prevStates = [];
                panel.querySelectorAll('.obj-detail-checkbox').forEach(c => {
                    prevStates.push({ el: c, checked: c.classList.contains('checked') });
                });
                const originalParent = cardEl.parentElement;
                
                // Visual toggles instantly
                if (isIndicator) {
                    const newChecked = !isChecked;
                    if (newChecked) {
                        chk.classList.add('checked');
                        chk.nextElementSibling?.classList.add('completed');
                    } else {
                        chk.classList.remove('checked');
                        chk.nextElementSibling?.classList.remove('completed');
                    }
                    
                    const taskChks = row.querySelectorAll('.obj-detail-task-item .obj-detail-checkbox');
                    taskChks.forEach(tc => {
                        if (newChecked) {
                            tc.classList.add('checked');
                        } else {
                            tc.classList.remove('checked');
                        }
                        const txt = tc.nextElementSibling?.querySelector('.obj-detail-text');
                        if (txt) {
                            if (newChecked) txt.classList.add('completed');
                            else txt.classList.remove('completed');
                        }
                    });
                } else {
                    const newChecked = !isChecked;
                    if (newChecked) {
                        chk.classList.add('checked');
                        chk.nextElementSibling?.querySelector('.obj-detail-text')?.classList.add('completed');
                    } else {
                        chk.classList.remove('checked');
                        chk.nextElementSibling?.querySelector('.obj-detail-text')?.classList.remove('completed');
                    }
                    
                    const indChk = row.querySelector('.obj-detail-ind-header .obj-detail-checkbox');
                    if (indChk) {
                        const allTasks = row.querySelectorAll('.obj-detail-task-item .obj-detail-checkbox');
                        let allChecked = true;
                        allTasks.forEach(t => {
                            if (!t.classList.contains('checked')) allChecked = false;
                        });
                        if (allChecked) {
                            indChk.classList.add('checked');
                            indChk.nextElementSibling?.classList.add('completed');
                        } else {
                            indChk.classList.remove('checked');
                            indChk.nextElementSibling?.classList.remove('completed');
                        }
                    }
                }
                
                // Recalculate progress instantly in local UI matching backend rules exactly!
                let weightedIndicatorsProgressSum = 0.0;
                let totalIndicatorWeightsSum = 0.0;
                
                panel.querySelectorAll('.obj-detail-ind-row').forEach(r => {
                    const selectEl = r.querySelector('.obj-detail-weight-select');
                    const indWeight = selectEl ? parseInt(selectEl.value) : 1;
                    
                    const taskItems = r.querySelectorAll('.obj-detail-task-item');
                    
                    let indProgress = 0.0;
                    if (taskItems.length > 0) {
                        let sumCompletedCoefs = 0;
                        let sumTotalCoefs = 0;
                        
                        taskItems.forEach(tItem => {
                            const chkBox = tItem.querySelector('.obj-detail-checkbox');
                            const badgeHigh = tItem.querySelector('.priority-badge-high');
                            const badgeLow = tItem.querySelector('.priority-badge-low');
                            
                            let taskCoef = 2; // default Moyenne
                            if (badgeHigh) taskCoef = 3;
                            else if (badgeLow) taskCoef = 1;
                            
                            sumTotalCoefs += taskCoef;
                            if (chkBox && chkBox.classList.contains('checked')) {
                                sumCompletedCoefs += taskCoef;
                            }
                        });
                        
                        indProgress = sumTotalCoefs > 0 ? (sumCompletedCoefs / sumTotalCoefs * 100.0) : 0.0;
                    } else {
                        // If no tasks, indicator progress is 100% if the indicator itself is checked, else 0%
                        const indChk = r.querySelector('.obj-detail-ind-header .obj-detail-checkbox');
                        const isIndChecked = indChk && indChk.classList.contains('checked');
                        indProgress = isIndChecked ? 100.0 : 0.0;
                    }
                    
                    weightedIndicatorsProgressSum += indProgress * indWeight;
                    totalIndicatorWeightsSum += indWeight;
                });
                
                const calculatedProgress = totalIndicatorWeightsSum > 0 ? Math.round(weightedIndicatorsProgressSum / totalIndicatorWeightsSum) : 0;
                
                // Calculate individual indicators percentage badges instantly in local UI
                panel.querySelectorAll('.obj-detail-ind-row').forEach(r => {
                    const tasksInRow = r.querySelectorAll('.obj-detail-task-item .obj-detail-checkbox');
                    let checkedInRow = 0;
                    tasksInRow.forEach(t => {
                        if (t.classList.contains('checked')) checkedInRow++;
                    });
                    const indProgress = tasksInRow.length > 0 ? Math.round((checkedInRow / tasksInRow.length) * 100) : 0;
                    const pctBadge = r.querySelector('.obj-detail-ind-header span[style*="font-weight: 700"]');
                    if (pctBadge) {
                        pctBadge.textContent = `${indProgress}%`;
                        const badgeBg = indProgress >= 100 ? '#e2f9e9' : (indProgress > 0 ? '#fff3bf' : '#f1f0ef');
                        const badgeColor = indProgress >= 100 ? '#1e7e34' : (indProgress > 0 ? '#b28600' : '#787774');
                        pctBadge.style.background = badgeBg;
                        pctBadge.style.color = badgeColor;
                    }
                });

                const cardPct = cardEl.querySelector('.card-progress-pct');
                const cardBar = cardEl.querySelector('.card-progress-bar');
                if (cardPct && cardBar) {
                    cardPct.textContent = `${calculatedProgress}%`;
                    cardBar.style.width = `${calculatedProgress}%`;
                    let barColor = '#e03131';
                    if (calculatedProgress >= 70) barColor = '#2b8a3e';
                    else if (calculatedProgress >= 30) barColor = '#e8590c';
                    cardBar.style.background = barColor;
                }
                
                // Status mapping transitions
                let anyChecked = false;
                panel.querySelectorAll('.obj-detail-checkbox').forEach(c => {
                    if (c.classList.contains('checked')) anyChecked = true;
                });
                
                let allIndicatorsChecked = true;
                const allInds = panel.querySelectorAll('.obj-detail-ind-header .obj-detail-checkbox');
                if (allInds.length > 0) {
                    allInds.forEach(c => {
                        if (!c.classList.contains('checked')) allIndicatorsChecked = false;
                    });
                } else {
                    allIndicatorsChecked = false;
                }
                
                let targetList = document.getElementById('obj-list-not-started');
                if (allIndicatorsChecked) {
                    targetList = document.getElementById('obj-list-done');
                } else if (anyChecked) {
                    targetList = document.getElementById('obj-list-in-progress');
                }
                
                if (targetList && cardEl.parentElement !== targetList) {
                    targetList.appendChild(cardEl);
                }
                
                recalculateBoardCountersOptimistically();
                
                try {
                    const toggleRes = await fetch('/api/objectifs/toggle_block', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            block_id: blockId,
                            checked: !isChecked
                        })
                    });
                    const toggleData = await toggleRes.json();
                    
                    if (toggleData.success) {
                        // Refresh details silently in background
                        await loadInlineObjectiveDetails(objId, panel, cardEl);
                        await loadObjectivesDashboard(true);
                    } else {
                        // Revert
                        prevStates.forEach(s => {
                            if (s.checked) s.el.classList.add('checked');
                            else s.el.classList.remove('checked');
                        });
                        panel.querySelectorAll('.obj-detail-checkbox').forEach(c => {
                            const txt = c.nextElementSibling?.querySelector('.obj-detail-text') || c.nextElementSibling;
                            if (txt && txt.classList.contains('obj-detail-text')) {
                                if (c.classList.contains('checked')) txt.classList.add('completed');
                                else txt.classList.remove('completed');
                            }
                        });
                        if (originalParent) originalParent.appendChild(cardEl);
                        recalculateBoardCountersOptimistically();
                        showToast(toggleData.error || "Erreur de modification.", "error");
                    }
                } catch (err) {
                    // Revert
                    prevStates.forEach(s => {
                        if (s.checked) s.el.classList.add('checked');
                        else s.el.classList.remove('checked');
                    });
                    panel.querySelectorAll('.obj-detail-checkbox').forEach(c => {
                        const txt = c.nextElementSibling?.querySelector('.obj-detail-text') || c.nextElementSibling;
                        if (txt && txt.classList.contains('obj-detail-text')) {
                            if (c.classList.contains('checked')) txt.classList.add('completed');
                            else txt.classList.remove('completed');
                        }
                    });
                    if (originalParent) originalParent.appendChild(cardEl);
                    recalculateBoardCountersOptimistically();
                    console.error("Error toggling block:", err);
                    showToast("Erreur de communication.", "error");
                }
            };
        });
        
        // Wire weight select triggers
        panel.querySelectorAll('.obj-detail-weight-select').forEach(sel => {
            updateWeightSelectColor(sel); // Initialize color styling
            
            sel.onchange = async (e) => {
                e.stopPropagation();
                updateWeightSelectColor(sel); // Update color styling
                const blockId = sel.getAttribute('data-block-id');
                const weightVal = parseInt(sel.value);
                
                // --- OPTIMISTIC WEIGHT TRANSITION ---
                let weightedIndicatorsProgressSum = 0.0;
                let totalIndicatorWeightsSum = 0.0;
                
                panel.querySelectorAll('.obj-detail-ind-row').forEach(r => {
                    const selectEl = r.querySelector('.obj-detail-weight-select');
                    const indWeight = selectEl === sel ? weightVal : parseInt(selectEl?.value || 1);
                    
                    const taskItems = r.querySelectorAll('.obj-detail-task-item');
                    
                    let indProgress = 0.0;
                    if (taskItems.length > 0) {
                        let sumCompletedCoefs = 0;
                        let sumTotalCoefs = 0;
                        
                        taskItems.forEach(tItem => {
                            const chkBox = tItem.querySelector('.obj-detail-checkbox');
                            const badgeHigh = tItem.querySelector('.priority-badge-high');
                            const badgeLow = tItem.querySelector('.priority-badge-low');
                            
                            let taskCoef = 2;
                            if (badgeHigh) taskCoef = 3;
                            else if (badgeLow) taskCoef = 1;
                            
                            sumTotalCoefs += taskCoef;
                            if (chkBox && chkBox.classList.contains('checked')) {
                                sumCompletedCoefs += taskCoef;
                            }
                        });
                        
                        indProgress = sumTotalCoefs > 0 ? (sumCompletedCoefs / sumTotalCoefs * 100.0) : 0.0;
                    } else {
                        const indChk = r.querySelector('.obj-detail-ind-header .obj-detail-checkbox');
                        const isIndChecked = indChk && indChk.classList.contains('checked');
                        indProgress = isIndChecked ? 100.0 : 0.0;
                    }
                    
                    weightedIndicatorsProgressSum += indProgress * indWeight;
                    totalIndicatorWeightsSum += indWeight;
                });
                
                const calculatedProgress = totalIndicatorWeightsSum > 0 ? Math.round(weightedIndicatorsProgressSum / totalIndicatorWeightsSum) : 0;
                
                const cardPct = cardEl.querySelector('.card-progress-pct');
                const cardBar = cardEl.querySelector('.card-progress-bar');
                if (cardPct && cardBar) {
                    cardPct.textContent = `${calculatedProgress}%`;
                    cardBar.style.width = `${calculatedProgress}%`;
                    let barColor = '#e03131';
                    if (calculatedProgress >= 70) barColor = '#2b8a3e';
                    else if (calculatedProgress >= 30) barColor = '#e8590c';
                    cardBar.style.background = barColor;
                }
                
                try {
                    const weightRes = await fetch('/api/objectifs/update_indicator_weight', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            block_id: blockId,
                            weight: weightVal
                        })
                    });
                    const weightData = await weightRes.json();
                    
                    if (weightData.success) {
                        await loadInlineObjectiveDetails(objId, panel, cardEl);
                        await loadObjectivesDashboard(true);
                    } else {
                        alert("Erreur de modification du poids : " + weightData.error);
                    }
                } catch (err) {
                    console.error("Error setting indicator weight:", err);
                    alert("Erreur de communication.");
                }
            };
            
            // Prevent collapsing card on select dropdown click
            sel.onclick = (e) => e.stopPropagation();
        });
        
    } catch (err) {
        console.error("Error loading inline details:", err);
        panel.innerHTML = '<div style="font-size: 11px; color: #e03131; padding: 10px; text-align: center;">Erreur de chargement.</div>';
    }
}

function recalculateBoardCountersOptimistically() {
    const listNs = document.getElementById('obj-list-not-started');
    const listP = document.getElementById('obj-list-paused');
    const listIp = document.getElementById('obj-list-in-progress');
    const listD = document.getElementById('obj-list-done');
    
    const countNs = document.querySelector('#obj-col-not-started .obj-col-count');
    const countIp = document.querySelector('#obj-col-in-progress .obj-col-count');
    const countD = document.querySelector('#obj-col-done .obj-col-count');
    
    const nsEl = document.getElementById('obj-stat-not-started');
    const ipEl = document.getElementById('obj-stat-in-progress');
    const dEl = document.getElementById('obj-stat-done');
    
    const notStartedCount = listNs ? listNs.querySelectorAll('.obj-dashboard-card').length : 0;
    const pausedCount = listP ? listP.querySelectorAll('.obj-dashboard-card').length : 0;
    const inProgressCount = listIp ? listIp.querySelectorAll('.obj-dashboard-card').length : 0;
    const doneCount = listD ? listD.querySelectorAll('.obj-dashboard-card').length : 0;
    
    if (nsEl) nsEl.textContent = notStartedCount + pausedCount;
    if (ipEl) ipEl.textContent = inProgressCount;
    if (dEl) dEl.textContent = doneCount;
    
    if (countNs) countNs.textContent = `(${notStartedCount + pausedCount})`;
    if (countIp) countIp.textContent = `(${inProgressCount})`;
    if (countD) countD.textContent = `(${doneCount})`;
}

async function refreshBoardCounters() {
    try {
        const res = await fetch('/api/objectifs/dashboard');
        const list = await res.json();
        if (!list) return;
        
        let notStartedCount = 0;
        let inProgressCount = 0;
        let doneCount = 0;
        
        list.forEach(o => {
            if (o.status === 'Done' || o.status === 'Terminé' || o.status === '🟢 Complété' || o.atteint) {
                doneCount++;
            } else if (o.status === 'In progress' || o.status === 'En cours' || o.status === '🟡 En cours') {
                inProgressCount++;
            } else {
                notStartedCount++;
            }
        });
        
        const nsEl = document.getElementById('obj-stat-not-started');
        const ipEl = document.getElementById('obj-stat-in-progress');
        const dEl = document.getElementById('obj-stat-done');
        
        const countNs = document.querySelector('#obj-col-not-started .obj-col-count');
        const countIp = document.querySelector('#obj-col-in-progress .obj-col-count');
        const countD = document.querySelector('#obj-col-done .obj-col-count');
        
        if (nsEl) nsEl.textContent = notStartedCount;
        if (ipEl) ipEl.textContent = inProgressCount;
        if (dEl) dEl.textContent = doneCount;
        
        if (countNs) countNs.textContent = `(${notStartedCount})`;
        if (countIp) countIp.textContent = `(${inProgressCount})`;
        if (countD) countD.textContent = `(${doneCount})`;
    } catch (err) {
        console.error("Error refreshing board counters:", err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initObjectivesDashboardButtons();
});

// Dynamic Weight Colors Helper
function updateWeightSelectColor(selectEl) {
    if (!selectEl) return;
    const val = selectEl.value;
    if (val === "3") { // Red (highest)
        selectEl.style.background = '#FFE2E2';
        selectEl.style.color = '#C92A2A';
        selectEl.style.borderColor = '#FFC9C9';
    } else if (val === "2") { // Yellow (medium)
        selectEl.style.background = '#FFF3BF';
        selectEl.style.color = '#B28600';
        selectEl.style.borderColor = '#FFE3A8';
    } else { // val === "1" Green (lowest)
        selectEl.style.background = '#E2F9E9';
        selectEl.style.color = '#1E7E34';
        selectEl.style.borderColor = '#C2F5D3';
    }
}

let currentSlashMenu = null;

function showSlashMenu(inputEl, selectEl) {
    if (currentSlashMenu) {
        currentSlashMenu.remove();
    }
    
    const menu = document.createElement('div');
    menu.className = 'slash-menu';
    
    const rect = inputEl.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
    menu.style.left = `${rect.left + window.scrollX}px`;
    
    menu.innerHTML = `
        <div class="slash-option" data-weight="1">
            <span>Poids faible</span>
            <span class="slash-option-tag p1">Poids 1</span>
        </div>
        <div class="slash-option" data-weight="2">
            <span>Poids moyen</span>
            <span class="slash-option-tag p2">Poids 2</span>
        </div>
        <div class="slash-option" data-weight="3">
            <span>Poids fort</span>
            <span class="slash-option-tag p3">Poids 3</span>
        </div>
    `;
    
    document.body.appendChild(menu);
    currentSlashMenu = menu;
    
    const options = menu.querySelectorAll('.slash-option');
    options.forEach(opt => {
        opt.onclick = (e) => {
            e.stopPropagation();
            const w = opt.getAttribute('data-weight');
            selectEl.value = w;
            updateWeightSelectColor(selectEl);
            
            // Strip any slashes from value and trim
            inputEl.value = inputEl.value.replace(/\//g, '').trim();
            inputEl.focus();
            
            menu.remove();
            currentSlashMenu = null;
        };
    });
    
    const clickOutsideHandler = (e) => {
        if (!menu.contains(e.target) && e.target !== inputEl) {
            menu.remove();
            currentSlashMenu = null;
            document.removeEventListener('click', clickOutsideHandler);
        }
    };
    document.addEventListener('click', clickOutsideHandler);
}


// Device detector and layout adaptor
function detectDeviceAndAdapt() {
    const ua = navigator.userAgent.toLowerCase();
    const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua) || window.innerWidth <= 768;
    
    // Samsung S22 Ultra: checks model codes like "sm-s908" or general "samsung" + screen size parameters
    const isS22Ultra = ua.includes('sm-s908') || 
                      (ua.includes('samsung') && window.devicePixelRatio >= 3 && window.screen.height > 850) ||
                      (ua.includes('android') && window.screen.height >= 900 && window.screen.width >= 400 && window.devicePixelRatio >= 3);
                      
    const body = document.body;
    
}

let systemMsgTimeout = null;
let systemMsgInterval = null;

function showSystemHeaderMessage(text, isError = false) {
    const el = document.getElementById('system-header-msg');
    if (!el) return;

    if (systemMsgInterval) clearInterval(systemMsgInterval);
    if (systemMsgTimeout) clearTimeout(systemMsgTimeout);

    el.style.transition = 'none';
    el.style.opacity = '1';
    el.innerHTML = '';
    el.className = 'system-header-msg' + (isError ? ' error' : '');

    if (!text) {
        el.removeAttribute('data-tooltip');
        el.onclick = null;
        return;
    }

    // Bind click to open full log modal directly
    el.onclick = (e) => {
        showFullLogModal(text, isError);
    };

    // Set full text as tooltip so hovering reveals the entire untruncated message!
    el.setAttribute('data-tooltip', text);

    let displayStr = text;
    if (displayStr.length > 70) {
        displayStr = displayStr.substring(0, 67) + '...';
    }

    let currentLen = 0;
    const chars = displayStr.split('');

    systemMsgInterval = setInterval(() => {
        if (currentLen < chars.length) {
            el.innerHTML = displayStr.substring(0, currentLen) + '<span></span>';
            currentLen++;
        } else {
            el.innerHTML = displayStr;
            clearInterval(systemMsgInterval);

            systemMsgTimeout = setTimeout(() => {
                el.style.transition = 'opacity 1s ease';
                el.style.opacity = '0';
                systemMsgTimeout = setTimeout(() => {
                    el.innerHTML = '';
                    el.removeAttribute('data-tooltip');
                    el.style.opacity = '1';
                }, 1000);
            }, 6000);
        }
    }, 25);
}

function showSystemHeaderMessageWithAction(text, actionText, actionCallback, isError = false) {
    const el = document.getElementById('system-header-msg');
    if (!el) return;

    if (systemMsgInterval) clearInterval(systemMsgInterval);
    if (systemMsgTimeout) clearTimeout(systemMsgTimeout);

    el.style.transition = 'none';
    el.style.opacity = '1';
    el.innerHTML = '';
    el.className = 'system-header-msg' + (isError ? ' error' : '');
    el.setAttribute('data-tooltip', text);
    el.onclick = (e) => {
        showFullLogModal(text, isError);
    };

    let currentLen = 0;
    const chars = text.split('');

    systemMsgInterval = setInterval(() => {
        if (currentLen < chars.length) {
            el.innerHTML = text.substring(0, currentLen) + '<span></span>';
            currentLen++;
        } else {
            el.innerHTML = text + ' ';
            
            const btn = document.createElement('button');
            btn.className = 'sys-msg-confirm-btn';
            btn.textContent = actionText;
            btn.style.marginLeft = '8px';
            btn.style.padding = '2px 8px';
            btn.style.background = isError ? '#e11d48' : '#2383E2';
            btn.style.color = '#fff';
            btn.style.border = 'none';
            btn.style.borderRadius = '4px';
            btn.style.fontSize = '10px';
            btn.style.fontWeight = '600';
            btn.style.cursor = 'pointer';
            btn.style.fontFamily = 'inherit';
            btn.style.transition = 'opacity 0.2s';
            
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                actionCallback();
                el.innerHTML = '';
                el.removeAttribute('data-tooltip');
            });
            
            el.appendChild(btn);
            clearInterval(systemMsgInterval);
        }
    }, 25);
}

function showToast(message, type = 'info') {
    const isError = (type === 'error');
    showSystemHeaderMessage(message, isError);
}

// Device detector and layout adaptor
function detectDeviceAndAdapt() {
    const ua = navigator.userAgent.toLowerCase();
    const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua) || window.innerWidth <= 768;
    
    // Samsung S22 Ultra: checks model codes like "sm-s908" or general "samsung" + screen size parameters
    const isS22Ultra = ua.includes('sm-s908') || 
                      (ua.includes('samsung') && window.devicePixelRatio >= 3 && window.screen.height > 850) ||
                      (ua.includes('android') && window.screen.height >= 900 && window.screen.width >= 400 && window.devicePixelRatio >= 3);
                      
    const body = document.body;
    
    if (isS22Ultra) {
        body.classList.add('device-s22-ultra', 'device-mobile');
        showToast("Samsung Galaxy S22 Ultra détecté ! Fluidité 120Hz et alignement d'écran incurvé activés.", "s22");
        
        const headerLeft = document.querySelector('.header-left');
        if (headerLeft && !document.getElementById('device-badge')) {
            const badge = document.createElement('span');
            badge.id = 'device-badge';
            badge.style.background = 'rgba(168, 85, 247, 0.1)';
            badge.style.color = '#6b21a8';
            badge.style.border = '1px solid rgba(168, 85, 247, 0.2)';
            badge.style.fontSize = '9px';
            badge.style.fontWeight = '700';
            badge.style.padding = '2px 8px';
            badge.style.borderRadius = '12px';
            badge.style.marginLeft = '8px';
            badge.innerHTML = '✨ Galaxy S22 Ultra';
            headerLeft.appendChild(badge);
        }
    } else if (isMobile) {
        body.classList.add('device-mobile');
        showToast("Appareil mobile détecté. Interface tactile fluide activée.", "mobile");
        
        const headerLeft = document.querySelector('.header-left');
        if (headerLeft && !document.getElementById('device-badge')) {
            const badge = document.createElement('span');
            badge.id = 'device-badge';
            badge.style.background = 'rgba(34, 197, 94, 0.1)';
            badge.style.color = '#166534';
            badge.style.border = '1px solid rgba(34, 197, 94, 0.2)';
            badge.style.fontSize = '9px';
            badge.style.fontWeight = '700';
            badge.style.padding = '2px 8px';
            badge.style.borderRadius = '12px';
            badge.style.marginLeft = '8px';
            badge.innerHTML = '📱 Mobile';
            headerLeft.appendChild(badge);
        }
    } else {
        body.classList.add('device-desktop');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    detectDeviceAndAdapt();
    
    // Wire click listener on system header msg to open full log modal popup
    const systemHeaderMsgEl = document.getElementById('system-header-msg');
    if (systemHeaderMsgEl) {
        systemHeaderMsgEl.addEventListener('click', () => {
            const tooltipText = systemHeaderMsgEl.getAttribute('data-tooltip');
            if (tooltipText) {
                showFullLogModal(tooltipText, systemHeaderMsgEl.classList.contains('error'));
            }
        });
    }

    // Initialize premium voice mode
    initVoiceMode();

    // Check for uncompleted tasks from previous days and prompt mandatory rescheduling modal
    checkAndPromptPendingRescheduleTasks();
});

function checkAndPromptPendingRescheduleTasks() {
    const chatInput = document.getElementById('chat-input');
    const btnSend = document.getElementById('btn-send');
    const btnMic = document.getElementById('btn-mic');
    const rescheduleModal = document.getElementById('modal-reschedule-tasks');
    const rescheduleListContainer = document.getElementById('reschedule-tasks-list-container');
    const btnSubmit = document.getElementById('btn-submit-reschedule');

    if (!rescheduleModal || !rescheduleListContainer || !btnSubmit) return;

    fetch('/api/tasks/pending_reschedule?location=' + encodeURIComponent(currentLocation))
        .then(res => res.json())
        .then(data => {
            const pendingTasks = data.pending_tasks || [];
            const todayStr = data.today || new Date().toISOString().split('T')[0];

            if (pendingTasks.length === 0) {
                rescheduleModal.style.display = 'none';
                return;
            }

            // Block chat input until rescheduling is completed
            if (chatInput) {
                chatInput.disabled = true;
                chatInput.placeholder = "🔒 Replanification des tâches requise pour débloquer l'Assistant...";
            }
            if (btnSend) btnSend.disabled = true;
            if (btnMic) btnMic.disabled = true;

            // Render task cards in modal
            rescheduleListContainer.innerHTML = '';
            const taskSelections = {};

            pendingTasks.forEach(task => {
                taskSelections[task.id] = todayStr; // Default to Today

                const card = document.createElement('div');
                card.className = 'reschedule-task-card';

                card.innerHTML = `
                    <div class="reschedule-task-info">
                        <div>
                            <div class="reschedule-task-name">${escapeHtml(task.objectif)}</div>
                            <div class="reschedule-task-meta">
                                <span>Catégorie : <strong>${escapeHtml(task.categorie)}</strong></span>
                                <span>•</span>
                                <span>Date d'origine : <strong>${task.date || 'Non spécifiée'}</strong></span>
                            </div>
                        </div>
                    </div>
                    <div class="reschedule-date-selector" data-task-id="${task.id}">
                        <button type="button" class="reschedule-opt-btn active" data-val="today">Aujourd'hui</button>
                        <button type="button" class="reschedule-opt-btn" data-val="tomorrow">Demain</button>
                        <button type="button" class="reschedule-opt-btn" data-val="unknown">Date Inconnue (En attente)</button>
                    </div>
                `;

                rescheduleListContainer.appendChild(card);

                const dateSelector = card.querySelector('.reschedule-date-selector');
                const optBtns = dateSelector.querySelectorAll('.reschedule-opt-btn');

                optBtns.forEach(btn => {
                    btn.addEventListener('click', () => {
                        optBtns.forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        const val = btn.getAttribute('data-val');

                        if (val === 'today') {
                            taskSelections[task.id] = todayStr;
                        } else if (val === 'tomorrow') {
                            const d = new Date(todayStr);
                            d.setDate(d.getDate() + 1);
                            taskSelections[task.id] = d.toISOString().split('T')[0];
                        } else if (val === 'unknown') {
                            taskSelections[task.id] = null;
                        }
                    });
                });
            });

            rescheduleModal.style.display = 'flex';

            // Submit handler
            btnSubmit.onclick = () => {
                btnSubmit.disabled = true;
                btnSubmit.innerHTML = 'Enregistrement en cours...';

                const updates = Object.keys(taskSelections).map(id => ({
                    id: id,
                    date: taskSelections[id]
                }));

                fetch('/api/tasks/batch_reschedule', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ updates: updates })
                })
                .then(r => r.json())
                .then(resData => {
                    if (resData.success) {
                        showToast(`Replanification réussie (${resData.updated_count} tâches).`, 'success');
                        rescheduleModal.style.display = 'none';

                        // Unblock chat
                        if (chatInput) {
                            chatInput.disabled = false;
                            chatInput.placeholder = "Discuter avec l'assistant ou lui demander des actions...";
                        }
                        if (btnSend) btnSend.disabled = false;
                        if (btnMic) btnMic.disabled = false;

                        // Refresh daily tasks view
                        if (typeof loadDailyTasks === 'function') loadDailyTasks();
                    } else {
                        showToast('Erreur lors de la replanification.', 'error');
                        btnSubmit.disabled = false;
                        btnSubmit.innerHTML = 'Valider la replanification et Débloquer l\'Assistant';
                    }
                })
                .catch(err => {
                    console.error('Batch reschedule error:', err);
                    showToast('Erreur serveur lors de la replanification.', 'error');
                    btnSubmit.disabled = false;
                    btnSubmit.innerHTML = 'Valider la replanification et Débloquer l\'Assistant';
                });
            };
        })
        .catch(err => {
            console.warn('Could not check pending reschedule tasks:', err);
        });
}

function showSystemHeaderMessageWithConfirmCancel(text, confirmCallback, cancelCallback, isError = false) {
    const el = document.getElementById('system-header-msg');
    if (!el) return;

    if (systemMsgInterval) clearInterval(systemMsgInterval);
    if (systemMsgTimeout) clearTimeout(systemMsgTimeout);

    el.style.transition = 'none';
    el.style.opacity = '1';
    el.innerHTML = '';
    el.className = 'system-header-msg' + (isError ? ' error' : '');
    el.setAttribute('data-tooltip', text);
    el.onclick = (e) => {
        showFullLogModal(text, isError);
    };

    let currentLen = 0;
    const chars = text.split('');

    systemMsgInterval = setInterval(() => {
        if (currentLen < chars.length) {
            el.innerHTML = text.substring(0, currentLen) + '<span></span>';
            currentLen++;
        } else {
            el.innerHTML = text + ' ';
            
            // Confirm button
            const confirmBtn = document.createElement('button');
            confirmBtn.className = 'sys-msg-confirm-btn';
            confirmBtn.textContent = 'Confirmer';
            confirmBtn.style.marginLeft = '8px';
            confirmBtn.style.padding = '2px 8px';
            confirmBtn.style.background = '#fa5252';
            confirmBtn.style.color = '#fff';
            confirmBtn.style.border = 'none';
            confirmBtn.style.borderRadius = '4px';
            confirmBtn.style.fontSize = '10px';
            confirmBtn.style.fontWeight = '600';
            confirmBtn.style.cursor = 'pointer';
            confirmBtn.style.fontFamily = 'inherit';
            confirmBtn.style.transition = 'opacity 0.2s';
            
            confirmBtn.onclick = (e) => {
                e.stopPropagation();
                confirmCallback();
                el.innerHTML = '';
                el.removeAttribute('data-tooltip');
            };
            
            // Cancel button
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'sys-msg-cancel-btn';
            cancelBtn.textContent = 'Annuler';
            cancelBtn.style.marginLeft = '6px';
            cancelBtn.style.padding = '2px 8px';
            cancelBtn.style.background = 'rgba(55,53,47,0.08)';
            cancelBtn.style.color = '#37352F';
            cancelBtn.style.border = 'none';
            cancelBtn.style.borderRadius = '4px';
            cancelBtn.style.fontSize = '10px';
            cancelBtn.style.fontWeight = '600';
            cancelBtn.style.cursor = 'pointer';
            cancelBtn.style.fontFamily = 'inherit';
            cancelBtn.style.transition = 'opacity 0.2s';
            
            cancelBtn.onclick = (e) => {
                e.stopPropagation();
                if (cancelCallback) cancelCallback();
                el.innerHTML = '';
                el.removeAttribute('data-tooltip');
            };
            
            el.appendChild(confirmBtn);
            el.appendChild(cancelBtn);
            clearInterval(systemMsgInterval);
        }
    }, 25);
}

function showFullLogModal(text, isError = false) {
    let overlay = document.getElementById('log-viewer-modal');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'log-viewer-modal';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.background = 'rgba(0, 0, 0, 0.4)';
        overlay.style.backdropFilter = 'blur(2px)';
        overlay.style.zIndex = '99999';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.padding = '20px';
        overlay.style.boxSizing = 'border-box';
        
        overlay.onclick = () => {
            overlay.style.display = 'none';
        };
        
        const card = document.createElement('div');
        card.className = 'log-viewer-card';
        card.style.background = '#FFFFFF';
        card.style.border = '1px solid #EDECE9';
        card.style.borderRadius = '8px';
        card.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.15)';
        card.style.width = '100%';
        card.style.maxWidth = '400px';
        card.style.padding = '16px';
        card.style.fontFamily = "'SFMono-Regular', Consolas, monospace";
        card.style.fontSize = '12px';
        card.style.color = '#37352F';
        card.style.lineHeight = '1.6';
        card.style.wordBreak = 'break-word';
        card.style.position = 'relative';
        
        card.onclick = (e) => e.stopPropagation();
        
        overlay.appendChild(card);
        document.body.appendChild(overlay);
    }
    
    const card = overlay.querySelector('.log-viewer-card');
    card.style.borderLeft = isError ? '4px solid #fa5252' : '4px solid #2383E2';
    
    card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #EDECE9; padding-bottom: 8px; margin-bottom: 12px;">
            <span style="font-weight: 700; color: ${isError ? '#fa5252' : '#2383E2'}; display: flex; align-items: center; gap: 6px;">
                ${isError ? '⚠️ LOG D\'ERREUR' : '💻 LOG SYSTÈME'}
            </span>
            <button style="background: none; border: none; font-size: 14px; cursor: pointer; color: #787774; padding: 2px; line-height: 1;" onclick="document.getElementById('log-viewer-modal').style.display='none';">&times;</button>
        </div>
        <div style="background: #f7f6f3; padding: 12px; border-radius: 6px; border: 1px solid #EDECE9; font-size: 11.5px; white-space: pre-wrap; font-family: monospace;">${text}</div>
        <div style="margin-top: 14px; text-align: right;">
            <button style="background: #37352F; color: #fff; border: none; padding: 4px 12px; border-radius: 4px; font-size: 11px; cursor: pointer; font-family: inherit; font-weight: 600;" onclick="document.getElementById('log-viewer-modal').style.display='none';">Fermer</button>
        </div>
    `;
    
    overlay.style.display = 'flex';
}

// Voice Recognition State variables
let voiceRecognition = null;
let voiceTranscript = '';
let latestCombinedTranscript = '';
let isVoiceModeActive = false;

// Web Audio API variables for real-time wave visualization
let audioContext = null;
let analyser = null;
let microphone = null;
let audioStream = null;
let animationFrameId = null;

let isVoicePaused = false;
let accumulatedFinalText = '';
let lastProcessedIndex = 0;
let currentScales = Array(11).fill(0.2);

function formatSpeechPunctuation(text) {
    if (!text) return '';
    let formatted = text;
    // Ensure space after punctuation marks (. , ! ? : ;) if missing
    formatted = formatted.replace(/([.,!?:;])(?=[^\s\d.,!?:;])/g, '$1 ');
    formatted = formatted.replace(/([.,!?:;])([A-Za-zÀ-ÿ])/g, '$1 $2');
    // Normalize spaces
    formatted = formatted.replace(/\s+/g, ' ');
    // Capitalize letter following sentence punctuation (. ! ?)
    formatted = formatted.replace(/([.!?]\s+)([a-zà-ÿ])/g, (match, p1, p2) => p1 + p2.toUpperCase());
    return formatted.trim();
}

function initVoiceMode() {
    const btnMic = document.getElementById('btn-mic');
    const voiceOverlay = document.getElementById('voice-overlay');
    const transcriptionScreen = document.getElementById('voice-transcription-screen');
    const transcriptionBody = document.getElementById('transcription-text-body');
    const chatForm = document.getElementById('chat-form');
    const voiceCancel = document.getElementById('voice-cancel');
    const voiceDone = document.getElementById('voice-done');
    const chatInput = document.getElementById('chat-input');
    const voiceStatusText = voiceOverlay ? voiceOverlay.querySelector('.voice-status-text') : null;
    const voiceDot = voiceOverlay ? voiceOverlay.querySelector('.voice-dot') : null;

    if (!btnMic || !voiceOverlay || !transcriptionScreen) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        btnMic.style.display = 'none';
        console.warn("Web Speech API is not supported in this browser.");
        return;
    }

    const setupRecognition = () => {
        voiceRecognition = new SpeechRecognition();
        voiceRecognition.continuous = true;
        voiceRecognition.interimResults = true;
        voiceRecognition.lang = 'fr-FR';

        voiceRecognition.onresult = (event) => {
            let newFinals = '';
            let sessionInterim = '';

            for (let i = 0; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    if (i >= lastProcessedIndex) {
                        newFinals += event.results[i][0].transcript + ' ';
                        lastProcessedIndex = i + 1;
                    }
                } else {
                    sessionInterim += event.results[i][0].transcript;
                }
            }

            // Append newly finalized chunks into accumulatedFinalText so text is NEVER lost or erased
            if (newFinals.trim()) {
                accumulatedFinalText = (accumulatedFinalText + ' ' + newFinals).trim();
            }

            const rawCombined = (accumulatedFinalText + ' ' + sessionInterim).trim();
            
            // Expanded trigger regexes for 'matter'/'mattre' & 'ika'
            const pauseRegex = /(matter|mattre|maté|matte|matta|mattend|mater|mather|maître|mètre|mettre|mettez|m'attends|m'attendre|m'arrêter|pause|attends)/i;
            const resumeRegex = /(ika|ica|iká|icà|éka|eika|ikaa|ikou|icou|yika|hica|i\s*ka|il\s*ka|go|reprends|allez)/i;

            if (!isVoicePaused) {
                if (pauseRegex.test(rawCombined)) {
                    // Trigger Pause!
                    isVoicePaused = true;
                    const cleaned = rawCombined.replace(pauseRegex, '');
                    accumulatedFinalText = formatSpeechPunctuation(cleaned);
                    latestCombinedTranscript = accumulatedFinalText;
                    
                    updatePauseUI(true);
                    updateTranscriptionDisplay(accumulatedFinalText);

                    try {
                        voiceRecognition.stop();
                    } catch (e) {}
                    return;
                }

                latestCombinedTranscript = formatSpeechPunctuation(rawCombined);
                updateTranscriptionDisplay(latestCombinedTranscript);
            } else {
                // Paused mode: check for "ika" / "reprends" trigger
                const checkSpeech = (newFinals + ' ' + sessionInterim).trim();
                if (resumeRegex.test(checkSpeech) || resumeRegex.test(rawCombined)) {
                    // Trigger Resume!
                    isVoicePaused = false;
                    updatePauseUI(false);
                    
                    try {
                        voiceRecognition.stop();
                    } catch (e) {}
                }
            }
        };

        voiceRecognition.onerror = (event) => {
            console.error("Speech recognition error:", event.error);
            if (event.error === 'not-allowed') {
                showToast("Accès microphone refusé.", "error");
                stopVoiceMode(false);
            }
        };

        voiceRecognition.onend = () => {
            if (isVoiceModeActive) {
                lastProcessedIndex = 0; // Reset index for new recognition session
                try {
                    voiceRecognition.start();
                } catch (e) {}
            }
        };
    };

    const updatePauseUI = (paused) => {
        if (paused) {
            voiceOverlay.classList.add('paused');
            transcriptionScreen.classList.add('paused-mode');
            if (voiceStatusText) voiceStatusText.textContent = "Pause (dites 'IKA' pour reprendre)";
            if (voiceDot) voiceDot.classList.add('paused');
        } else {
            voiceOverlay.classList.remove('paused');
            transcriptionScreen.classList.remove('paused-mode');
            if (voiceStatusText) voiceStatusText.textContent = "À l'écoute...";
            if (voiceDot) voiceDot.classList.remove('paused');
        }
    };

    const updateTranscriptionDisplay = (text) => {
        if (!transcriptionBody) return;
        if (text && text.trim()) {
            transcriptionBody.textContent = text;
        } else {
            transcriptionBody.innerHTML = `<span class="transcription-placeholder">Parlez maintenant... Votre texte s'affichera ici en temps réel.</span>`;
        }
        transcriptionBody.scrollTop = transcriptionBody.scrollHeight;
    };

    const startVoiceMode = () => {
        isVoiceModeActive = true;
        isVoicePaused = false;
        accumulatedFinalText = '';
        latestCombinedTranscript = '';
        currentScales = Array(11).fill(0.2);

        setupRecognition();
        updatePauseUI(false);
        updateTranscriptionDisplay('');

        chatForm.style.display = 'none';
        transcriptionScreen.style.display = 'flex';
        voiceOverlay.style.display = 'flex';
        btnMic.classList.add('active');

        const bars = document.querySelectorAll('.voice-waves .wave-bar');
        bars.forEach(bar => {
            bar.style.transform = 'scaleY(0.2)';
        });

        try {
            voiceRecognition.start();
        } catch (e) {
            console.error("Speech recognition start failed:", e);
        }

        // Real-time Audio Visualizer with full 11-bar voice frequency mapping & noise isolation
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            const audioConstraints = {
                audio: {
                    echoCancellation: { ideal: true },
                    noiseSuppression: { ideal: true },
                    autoGainControl: { ideal: true },
                    channelCount: 1
                }
            };
            navigator.mediaDevices.getUserMedia(audioConstraints).then((stream) => {
                audioStream = stream;
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                audioContext = new AudioContextClass();
                analyser = audioContext.createAnalyser();
                analyser.fftSize = 64;

                microphone = audioContext.createMediaStreamSource(stream);
                microphone.connect(analyser);

                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                // Vocal frequency mapping for 11 bars (centered around human speech 300Hz-3400Hz)
                const voiceBinMap = [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1];

                const updateWaves = () => {
                    if (!isVoiceModeActive) return;

                    if (!isVoicePaused) {
                        analyser.getByteFrequencyData(dataArray);

                        // Calculate average vocal intensity across speech bins
                        let speechEnergy = 0;
                        for (let b = 1; b <= 8; b++) {
                            speechEnergy += (dataArray[b] || 0);
                        }
                        speechEnergy = speechEnergy / 8;

                        bars.forEach((bar, index) => {
                            bar.style.animation = 'none';
                            const binIdx = voiceBinMap[index % voiceBinMap.length];
                            const binVal = dataArray[binIdx] || 0;

                            // Combined individual bin + overall speech energy
                            const combinedVal = (binVal * 0.65) + (speechEnergy * 0.35);
                            const targetScale = 0.25 + (combinedVal / 255) * 3.5;

                            currentScales[index] = currentScales[index] || 0.2;
                            currentScales[index] += (targetScale - currentScales[index]) * 0.35;

                            bar.style.transform = `scaleY(${currentScales[index].toFixed(3)})`;
                        });
                    } else {
                        bars.forEach((bar, index) => {
                            currentScales[index] = 0.2;
                            bar.style.transform = 'scaleY(0.2)';
                        });
                    }

                    animationFrameId = requestAnimationFrame(updateWaves);
                };
            });
        }
    };

    btnMic.addEventListener('click', (e) => {
        e.preventDefault();
        startVoiceMode();
    });

    voiceCancel.addEventListener('click', (e) => {
        e.preventDefault();
        stopVoiceMode(false);
    });

    voiceDone.addEventListener('click', (e) => {
        e.preventDefault();
        stopVoiceMode(true);
    });
}


// ── Suivi des Habitudes (Le Verre d'Eau) ──
let currentHabitsData = null;

async function loadHabitsData() {
    try {
        const res = await fetch(`/api/habits/water_glass?date=${currentDate}`);
        const data = await res.json();
        if (!data.success) return;
        renderHabitsGlass(data);
        loadWeeklyHabitsData();
    } catch (err) {
        console.error('Failed to load habits data:', err);
    }
}

function formatDisplayDate(dateStr) {
    if (!dateStr) return 'Aucune';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        return `${day}/${month}/${year} à ${hours}:${mins}`;
    } catch (e) {
        return dateStr;
    }
}

function formatCreationDate(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    } catch (e) {
        return dateStr;
    }
}


function triggerWaterOverflowAnimation(spilledVolume, expelledDetails = []) {
    if (spilledVolume <= 0) return;

    const miniTrophy = document.getElementById('mini-glass-trophy');
    const miniWaterTrouble = document.getElementById('mini-water-trouble-level');
    const arcSvg = document.getElementById('overflow-arc-svg');

    // Show mini glass trophy
    if (miniTrophy) {
        miniTrophy.classList.remove('hiding');
        miniTrophy.style.display = 'flex';
    }

    // Activate curved SVG arc animation (forward flow: main glass -> mini glass)
    if (arcSvg) {
        arcSvg.classList.remove('reverse');
        arcSvg.classList.add('active');
        setTimeout(() => {
            arcSvg.classList.remove('active');
        }, 2200);
    }

    // Fill mini glass with trouble water after pour reaches it
    if (miniWaterTrouble) {
        setTimeout(() => {
            const totalCap = currentHabitsData ? Math.max(5.0, (currentHabitsData.good_habits.total || []).reduce((acc, n) => acc + floatVal((currentHabitsData.good_habits.weights || {})[n], 2), 0)) : 5.0;
            const pct = Math.min((spilledVolume / totalCap) * 100 * 2.5, 100);
            miniWaterTrouble.style.height = `${Math.max(pct, 30)}%`;
        }, 400);
    }

    // Dynamic precise message formatting for header logs
    let detailText = '';
    if (expelledDetails && expelledDetails.length > 0) {
        if (expelledDetails.length === 1) {
            detailText = ` pour "${expelledDetails[0].name}"`;
        } else {
            const breakdown = expelledDetails.map(d => `${d.volume.toFixed(1)} place(s) pour "${d.name}"`).join(', ');
            detailText = ` (${breakdown})`;
        }
    }

    // Notification dans la zone de header / logs de l'application
    if (typeof showSystemHeaderMessage === 'function') {
        showSystemHeaderMessage(`💧 <strong>${spilledVolume.toFixed(1)} place(s) d'eau trouble expulsée(s) du verre${detailText} !</strong>`, false);
        setTimeout(() => {
            showSystemHeaderMessage('', false);
        }, 5000);
    }
}

function triggerReverseFlowAnimation(returnedVolume) {
    const miniTrophy = document.getElementById('mini-glass-trophy');
    const miniWaterTrouble = document.getElementById('mini-water-trouble-level');
    const arcSvg = document.getElementById('overflow-arc-svg');

    // Activate reverse SVG arc animation (mini glass -> main glass)
    if (arcSvg) {
        arcSvg.classList.remove('active');
        arcSvg.classList.add('active', 'reverse');
        setTimeout(() => {
            arcSvg.classList.remove('active', 'reverse');
        }, 1800);
    }

    // Decrease mini glass water level
    if (miniWaterTrouble) {
        setTimeout(() => {
            const currentSpilled = currentHabitsData ? (currentHabitsData.mini_glass_spilled || 0) : 0;
            const newSpilled = Math.max(0, currentSpilled - returnedVolume);
            if (currentHabitsData) currentHabitsData.mini_glass_spilled = newSpilled;
            
            if (newSpilled <= 0) {
                miniWaterTrouble.style.height = '0%';
                // Hide mini glass after water drains
                setTimeout(() => {
                    if (miniTrophy) {
                        miniTrophy.classList.add('hiding');
                        setTimeout(() => {
                            miniTrophy.style.display = 'none';
                            miniTrophy.classList.remove('hiding');
                        }, 500);
                    }
                }, 800);
            } else {
                const totalCap = currentHabitsData ? Math.max(5.0, (currentHabitsData.good_habits.total || []).reduce((acc, n) => acc + floatVal((currentHabitsData.good_habits.weights || {})[n], 2), 0)) : 5.0;
                const pct = Math.min((newSpilled / totalCap) * 100 * 2.5, 100);
                miniWaterTrouble.style.height = `${Math.max(pct, 30)}%`;
            }
        }, 300);
    }
}

function handleGoodHabitClick(el) {
    const rawName = decodeURIComponent(el.getAttribute('data-habit-name'));
    const isChecked = el.getAttribute('data-checked') === 'true';
    toggleGoodHabit(rawName, !isChecked);
}

function handleHabitWeightClick(el, evt) {
    if (evt) evt.stopPropagation();
    const rawName = decodeURIComponent(el.getAttribute('data-habit-name'));
    const currentWeight = parseInt(el.getAttribute('data-weight')) || 2;
    cycleHabitWeight(rawName, currentWeight);
}

function renderHabitsGlass(data) {
    if (data) currentHabitsData = data;
    else if (!currentHabitsData) return;
    
    const d = currentHabitsData;
    const cleanLevel = document.getElementById('water-clean-level');
    const troubleLevel = document.getElementById('water-trouble-level');
    const statusText = document.getElementById('glass-status-text');
    const goodList = document.getElementById('good-habits-list');
    const badList = document.getElementById('bad-habits-list');
    if (!cleanLevel || !troubleLevel || !statusText || !goodList || !badList) return;

    const good = d.good_habits || {};
    const bad = d.bad_habits || {};

    const checkedGood = good.checked || [];
    const totalGood = good.total || [];
    const streaks = good.streaks || {};
    const autoHabits = good.auto_habits || [];
    const weights = good.weights || {};

    const allBad = bad.all_habits || [];

    // Adaptive capacity: sum of weights (1, 2, 3) of all good habits (min 5.0)
    let totalCapacity = 0;
    totalGood.forEach(name => {
        const w = floatVal(weights[name], 2);
        totalCapacity += w;
    });
    totalCapacity = Math.max(5.0, totalCapacity);

    // Calculate volume contribution for clean water
    let cleanVolume = 0;
    checkedGood.forEach(name => {
        if (!autoHabits.includes(name)) {
            const w = floatVal(weights[name], 2);
            cleanVolume += w;
        }
    });

    // Calculate volume contribution for trouble water: sum of (poids * influence / 100) ONLY for bad habits relapsed today
    let troubleVolume = 0;
    allBad.forEach(bh => {
        const datesRechutes = bh.dates_rechutes || [];
        const relapsedToday = (bh.relapsed_today === true);
        bh.relapsed_today = relapsedToday;

        if (relapsedToday) {
            const p = floatVal(bh.poids, 2);
            const inf = floatVal(bh.influence, 100);
            troubleVolume += p * (inf / 100.0);
        }
    });

    const rawPlaces = cleanVolume + troubleVolume;
    const overflowSpilled = (rawPlaces > totalCapacity && troubleVolume > 0) ? Math.min(troubleVolume, rawPlaces - totalCapacity) : 0;
    const troubleInGlass = Math.max(0, troubleVolume - overflowSpilled);

    // Places occupied IN the main glass: clean water + remaining trouble water in glass (capped at totalCapacity)
    const places = cleanVolume + troubleInGlass;

    const cleanPct = Math.min((cleanVolume / totalCapacity) * 100, 100);
    const troublePct = Math.min((troubleInGlass / totalCapacity) * 100, 100);

    cleanLevel.style.height = `${cleanPct}%`;
    troubleLevel.style.height = `${troublePct}%`;
    troubleLevel.style.bottom = `${cleanPct}%`;

    let outsideBadgesHtml = '';

    // Subdivide clean water into habit segments with dotted lines on hover
    let cleanSegmentsHtml = '<div class="water-segments-overlay">';
    if (cleanVolume > 0) {
        let accumulatedCleanPct = 0;
        let cleanIdx = 0;
        checkedGood.forEach(name => {
            if (!autoHabits.includes(name)) {
                const badgeId = `badge-clean-${cleanIdx}`;
                cleanIdx++;

                const w = floatVal(weights[name], 2);
                const segPctInClean = (w / cleanVolume) * 100;
                const segHeightInGlass = (w / cleanVolume) * cleanPct;
                const centerBottom = accumulatedCleanPct + (segHeightInGlass / 2);
                accumulatedCleanPct += segHeightInGlass;

                cleanSegmentsHtml += `
                    <div class="water-segment" data-badge-target="${badgeId}" style="height: ${segPctInClean}%;">
                        <span class="water-segment-dotted"></span>
                        <div class="water-segment-tooltip">
                            <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="#38bdf8" stroke-width="2.2" style="flex-shrink:0;"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
                            <span class="segment-name-only">${name}</span>
                        </div>
                    </div>
                `;

                outsideBadgesHtml += `
                    <div class="water-segment-badge-outside clean" id="${badgeId}" style="bottom: ${centerBottom.toFixed(2)}%;">
                        ✨ ${w} pt${w > 1 ? 's' : ''}
                    </div>
                `;
            }
        });
    }
    cleanSegmentsHtml += '</div>';
    cleanLevel.innerHTML = cleanSegmentsHtml;

    // Subdivide trouble water into bad habit segments with dotted lines on hover (Top-Down Overflow Physics)
    let troubleSegmentsHtml = '<div class="water-segments-overlay">';
    if (troubleVolume > 0 && troubleInGlass > 0) {
        const activeBad = allBad.filter(bh => bh.relapsed_today === true);
        
        // Calculer les places d'eau trouble restant réellement dans le verre (l'expulsion se fait de HAUT en BAS)
        let overflowRemaining = Math.max(0, troubleVolume - troubleInGlass);
        const inGlassVolumes = new Array(activeBad.length).fill(0);

        for (let i = activeBad.length - 1; i >= 0; i--) {
            const bh = activeBad[i];
            const p = floatVal(bh.poids, 2);
            const inf = floatVal(bh.influence, 100);
            const vol = p * (inf / 100.0);
            
            const expelled = Math.min(vol, overflowRemaining);
            overflowRemaining = Math.max(0, overflowRemaining - expelled);
            const inGlass = Math.max(0, Math.round((vol - expelled) * 10) / 10);
            inGlassVolumes[i] = inGlass;
        }

        let accumulatedTroublePct = cleanPct;
        activeBad.forEach((bh, i) => {
            const inGlass = inGlassVolumes[i] || 0;
            if (inGlass > 0) {
                const badgeId = `badge-trouble-${i}`;
                const segPctInTrouble = (inGlass / troubleInGlass) * 100;
                const segHeightInGlass = (inGlass / troubleInGlass) * troublePct;
                const centerBottom = accumulatedTroublePct + (segHeightInGlass / 2);
                accumulatedTroublePct += segHeightInGlass;

                const nom = bh.nom || bh.name || 'Mauvaise habitude';

                troubleSegmentsHtml += `
                    <div class="water-segment dirty" data-badge-target="${badgeId}" style="height: ${segPctInTrouble}%;">
                        <span class="water-segment-dotted"></span>
                        <div class="water-segment-tooltip">
                            <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="#d97706" stroke-width="2.2" style="flex-shrink:0;"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
                            <span class="segment-name-only">${nom}</span>
                        </div>
                    </div>
                `;

                outsideBadgesHtml += `
                    <div class="water-segment-badge-outside trouble" id="${badgeId}" style="bottom: ${centerBottom.toFixed(2)}%;">
                        💧 ${inGlass.toFixed(1)} place${inGlass > 1 ? 's' : ''}
                    </div>
                `;
            }
        });
    }
    troubleSegmentsHtml += '</div>';
    troubleLevel.innerHTML = troubleSegmentsHtml;

    const outsideBadgesContainer = document.getElementById('outside-badges-container');
    if (outsideBadgesContainer) {
        outsideBadgesContainer.innerHTML = outsideBadgesHtml;
    }

    // Bind individual hover events to only show the hovered segment's outside badge
    document.querySelectorAll('.water-segment').forEach(seg => {
        seg.addEventListener('mouseenter', () => {
            const targetId = seg.getAttribute('data-badge-target');
            if (targetId) {
                const badge = document.getElementById(targetId);
                if (badge) badge.classList.add('visible');
            }
        });
        seg.addEventListener('mouseleave', () => {
            const targetId = seg.getAttribute('data-badge-target');
            if (targetId) {
                const badge = document.getElementById(targetId);
                if (badge) badge.classList.remove('visible');
            }
        });
    });

    const waterSurface = document.getElementById('water-surface');
    if (waterSurface) {
        const totalPct = cleanPct + troublePct;
        if (totalPct > 0) {
            waterSurface.style.display = 'block';
            waterSurface.style.bottom = `${Math.min(totalPct, 100)}%`;
        } else {
            waterSurface.style.display = 'none';
        }
    }

    // Render Mini-Glass Trophy if overflow occurs (trouble water pushed out)
    const miniTrophy = document.getElementById('mini-glass-trophy');
    const miniWaterTrouble = document.getElementById('mini-water-trouble-level');

    if (miniTrophy && miniWaterTrouble) {
        if (overflowSpilled > 0) {
            // Un débordement d'eau trouble est présent — afficher le petit verre et son niveau
            if (currentHabitsData) currentHabitsData.mini_glass_spilled = overflowSpilled;
            miniTrophy.classList.remove('hiding');
            miniTrophy.style.display = 'flex';
            const miniPct = Math.min((overflowSpilled / Math.max(5.0, totalCapacity)) * 100 * 2.5, 100);
            miniWaterTrouble.style.height = `${Math.max(miniPct, 30)}%`;
        } else {
            // Aucun débordement ou rechute annulée — vider l'eau du petit verre et le masquer
            if (currentHabitsData) currentHabitsData.mini_glass_spilled = 0;
            miniWaterTrouble.style.height = '0%';
            if (miniTrophy.style.display !== 'none' && !miniTrophy.classList.contains('hiding')) {
                miniTrophy.classList.add('hiding');
                setTimeout(() => {
                    miniTrophy.style.display = 'none';
                    miniTrophy.classList.remove('hiding');
                }, 400);
            }
        }
    }

    if (places >= totalCapacity) {
        statusText.innerHTML = `<span style="color: #e8590c; display: inline-flex; align-items: center; gap: 4px;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#e8590c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Verre PLEIN</span><br><span style="font-size: 12px; color: #868e96;">${places.toFixed(1)}/${totalCapacity.toFixed(1)} place(s) — vider l'eau trouble</span>`;
    } else {
        const remaining = (totalCapacity - places).toFixed(1).replace('.0', '');
        statusText.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 4px;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#0288d1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l-2 18H8L6 3z"/><line x1="6" y1="8" x2="18" y2="8"/></svg> <strong>${places.toFixed(1)}/${totalCapacity.toFixed(1)}</strong></span><br><span style="font-size: 12px; color: #868e96;">${remaining} place(s) libre(s)</span>`;
    }

    // Split good habits into Morning (🌅) and Evening (🌙)
    const morningHabits = totalGood.filter(name => !name.includes('🌙'));
    const eveningHabits = totalGood.filter(name => name.includes('🌙'));

    const renderHabitRow = (name) => {
        const isChecked = checkedGood.includes(name);
        const streak = streaks[name] || 0;
        const isAuto = streak > 30;
        const w = weights[name] || 2;
        const checkClass = isChecked ? 'checked-good' : '';
        const checkMark = isChecked ? '✓' : '';
        const encodedName = encodeURIComponent(name);
        const wLabel = `P${w} (${w})`;

        const rowCheckedClass = isChecked ? ' is-checked' : '';
        return `
            <div class="habit-row${rowCheckedClass}">
                <div class="habit-row-left" data-habit-name="${encodedName}" data-checked="${isChecked}" onclick="handleGoodHabitClick(this)">
                    <div class="habit-checkbox ${checkClass}">${checkMark}</div>
                    <span class="habit-name">${name}</span>
                </div>
                <div class="habit-row-right">
                    <button class="habit-weight-btn w${w}" title="Changer le poids (Poids 1 = 1 place, Poids 2 = 2 places, Poids 3 = 3 places)" data-habit-name="${encodedName}" data-weight="${w}" onclick="handleHabitWeightClick(this, event)">${wLabel}</button>
                    ${isAuto ? '<span class="habit-auto-badge">AUTO</span>' : ''}
                    <span class="habit-streak${isAuto ? ' streak-auto' : (streak >= 7 ? ' streak-high' : '')}"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 17c1.38 0 2.5-1.12 2.5-2.5 0-.61-.23-1.17-.61-1.6L11 11l-1.89 1.9c-.38.43-.61.99-.61 1.6z"/><path d="M12 2C6.5 2 2 6.5 2 12c0 3.04 1.36 5.76 3.5 7.6L12 22l6.5-2.4c2.14-1.84 3.5-4.56 3.5-7.6 0-5.5-4.5-10-10-10z"/></svg>${streak}j</span>
                </div>
            </div>
        `;
    };

    if (totalGood.length === 0) {
        goodList.innerHTML = `<p style="font-size: 11.5px; color: #868e96; font-style: italic; padding: 8px 0;">Aucune bonne habitude dans Notion.</p>`;
    } else {
        let html = '';
        if (morningHabits.length > 0) {
            html += `<div class="habit-section-header morning"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>Matin</div>`;
            html += morningHabits.map(renderHabitRow).join('');
        }
        if (eveningHabits.length > 0) {
            html += `<div class="habit-section-header evening"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>Soir</div>`;
            html += eveningHabits.map(renderHabitRow).join('');
        }
        goodList.innerHTML = html;
    }

    // ── Mauvaises Habitudes — Rendu Pagination (2 cartes par page, zéro scroll, zéro déformation) ──
    const badHabitsPerPage = 2;
    const totalBadPages = Math.ceil(allBad.length / badHabitsPerPage) || 1;

    if (badHabitsCurrentPage > totalBadPages) badHabitsCurrentPage = totalBadPages;
    if (badHabitsCurrentPage < 1) badHabitsCurrentPage = 1;

    const badStartIndex = (badHabitsCurrentPage - 1) * badHabitsPerPage;
    const visibleBad = allBad.slice(badStartIndex, badStartIndex + badHabitsPerPage);

    if (allBad.length === 0) {
        badList.innerHTML = `<p style="font-size: 11.5px; color: #868e96; font-style: italic; padding: 12px 0; text-align: center;">Aucune mauvaise habitude configurée.</p>`;
    } else {
        badList.innerHTML = visibleBad.map(bh => {
            const id = bh.id;
            const nom = bh.nom || bh.name || 'Mauvaise habitude';
            const desc = bh.description || '';
            const poids = bh.poids || 2;
            const influence = floatVal(bh.influence, 100);
            const etat = bh.etat || 'Active';
            const numRechutes = bh.nombre_rechutes || 0;
            const lastRechute = formatDisplayDate(bh.date_derniere_rechute);
            const createdDate = formatCreationDate(bh.date_creation);
            const isRelapsedToday = bh.relapsed_today === true;

            let stateClass = 'state-active';
            if (etat === 'Affaiblie') stateClass = 'state-affaiblie';
            else if (etat === 'Très faible') stateClass = 'state-tres-faible';
            else if (etat === 'Dormante') stateClass = 'state-dormante';

            const wLabel = `P${poids} (${poids})`;

            return `
                <div class="bad-habit-card ${isRelapsedToday ? 'relapsed-active' : ''}" data-id="${id}" data-state="${etat}">
                    <div class="bad-habit-card-header">
                        <div>
                            <div class="bad-habit-card-title">${nom}</div>
                            ${desc ? `<div class="bad-habit-card-desc">${desc}</div>` : ''}
                        </div>
                        <div class="bad-habit-actions-right">
                            <button class="habit-weight-btn w${poids}" title="Changer le poids max dans le verre (1, 2 ou 3)" onclick="event.stopPropagation(); cycleBadHabitWeight('${id}', ${poids})">${wLabel}</button>
                            <span class="bad-habit-state-badge ${stateClass}">${etat}</span>
                            <button class="bad-habit-delete-btn" title="Supprimer cette mauvaise habitude" onclick="event.stopPropagation(); deleteBadHabit('${id}')">
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        </div>
                    </div>

                    <div class="bad-habit-influence-block">
                        <div class="bad-habit-influence-header">
                            <span>Influence actuelle</span>
                            <span>${Math.round(influence)}%</span>
                        </div>
                        <div class="bad-habit-progress-bg">
                            <div class="bad-habit-progress-fill" style="width: ${Math.min(Math.max(influence, 0), 100)}%;"></div>
                        </div>
                    </div>

                    <div class="bad-habit-meta-row">
                        <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                            <span class="bad-habit-meta-item" style="display: flex; align-items: center; gap: 3px;"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg><strong>Rechutes :</strong> ${numRechutes}</span>
                            <span class="bad-habit-meta-item" style="display: flex; align-items: center; gap: 3px;"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 16 14"/></svg><strong>Dernière :</strong> ${lastRechute}</span>
                            ${createdDate ? `<span class="bad-habit-meta-item" style="display: flex; align-items: center; gap: 3px;"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><strong>Créée :</strong> ${createdDate}</span>` : ''}
                        </div>
                        <button class="btn-declare-relapse ${isRelapsedToday ? 'active-relapsed' : ''}" title="${isRelapsedToday ? 'Cliquer pour annuler la rechute du jour' : 'Déclarer une rechute aujourd\'hui'}" onclick="event.stopPropagation(); declareBadHabitRelapse('${id}')">
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                            ${isRelapsedToday ? '✓ Rechuté aujourd\'hui <span class="relapse-cancel-hint">(annuler)</span>' : 'Déclarer une rechute'}
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Gestion de l'affichage des contrôles de pagination Notion-style
    const paginationContainer = document.getElementById('bad-habits-pagination');
    const pageInfo = document.getElementById('bad-habits-page-info');
    const btnPrev = document.getElementById('btn-bad-prev');
    const btnNext = document.getElementById('btn-bad-next');

    if (paginationContainer) {
        if (allBad.length > badHabitsPerPage) {
            paginationContainer.style.display = 'flex';
            if (pageInfo) pageInfo.textContent = `${badHabitsCurrentPage} / ${totalBadPages}`;
            if (btnPrev) btnPrev.disabled = (badHabitsCurrentPage <= 1);
            if (btnNext) btnNext.disabled = (badHabitsCurrentPage >= totalBadPages);
        } else {
            paginationContainer.style.display = 'none';
        }
    }
}

function floatVal(val, defaultVal = 0.0) {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? defaultVal : parsed;
}

function cycleHabitWeight(name, currentWeight) {
    let newWeight = currentWeight + 1;
    if (newWeight > 3) newWeight = 1;
    
    // OPTIMISTIC INSTANT UPDATE IN DOM
    if (currentHabitsData && currentHabitsData.good_habits) {
        if (!currentHabitsData.good_habits.weights) currentHabitsData.good_habits.weights = {};
        currentHabitsData.good_habits.weights[name] = newWeight;
        renderHabitsGlass();
    }
    
    changeHabitWeight(name, newWeight);
}

function cycleBadHabitWeight(id, currentWeight) {
    let newWeight = currentWeight + 1;
    if (newWeight > 3) newWeight = 1;

    // OPTIMISTIC INSTANT UPDATE IN DOM
    if (currentHabitsData && currentHabitsData.bad_habits && currentHabitsData.bad_habits.all_habits) {
        const target = currentHabitsData.bad_habits.all_habits.find(h => h.id === id);
        if (target) {
            target.poids = newWeight;
            renderHabitsGlass();
        }
    }

    updateBadHabitWeight(id, newWeight);
}

async function updateBadHabitWeight(id, weight) {
    try {
        await fetch(`/api/bad_habits/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ poids: weight })
        });
    } catch(err) {
        console.error('Failed to update bad habit weight:', err);
    }
}

async function declareBadHabitRelapse(id) {
    let habitName = "Mauvaise habitude";
    let isNowRelapsed = false;

    // OPTIMISTIC INSTANT TOGGLE IN DOM
    if (currentHabitsData && currentHabitsData.bad_habits && currentHabitsData.bad_habits.all_habits) {
        const target = currentHabitsData.bad_habits.all_habits.find(h => h.id === id);
        if (target) {
            habitName = target.nom || target.name || habitName;
            const isRelapsed = target.relapsed_today === true;
            target.relapsed_today = !isRelapsed;
            isNowRelapsed = !isRelapsed;
            if (!isRelapsed) {
                target.nombre_rechutes = (target.nombre_rechutes || 0) + 1;
                target.date_derniere_rechute = new Date().toISOString();
                if (!target.dates_rechutes) target.dates_rechutes = [];
                target.dates_rechutes.push(currentDate);
            } else {
                target.nombre_rechutes = Math.max(0, (target.nombre_rechutes || 1) - 1);
                if (target.dates_rechutes) {
                    target.dates_rechutes = target.dates_rechutes.filter(d => d !== currentDate);
                }
            }
            renderHabitsGlass();
        }
    }

    // Trigger Notification Log in Header
    if (typeof showSystemHeaderMessage === 'function') {
        if (isNowRelapsed) {
            showSystemHeaderMessage(`⚠️ Rechute enregistrée aujourd'hui pour "${habitName}"`, false);
        } else {
            showSystemHeaderMessage(`✅ Rechute annulée aujourd'hui pour "${habitName}"`, false);
        }
    }

    try {
        const res = await fetch(`/api/bad_habits/${id}/relapse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: currentDate })
        });
        const val = await res.json();
        if (val.success) loadHabitsData();
    } catch(err) {
        console.error('Failed to declare relapse:', err);
    }
}

async function changeHabitWeight(name, weight) {
    try {
        await fetch('/api/good_habits/weight', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, weight: weight })
        });
    } catch(err) {
        console.error('Failed to change habit weight:', err);
    }
}

async function toggleGoodHabit(name, newValue) {
    if (currentHabitsData && currentHabitsData.good_habits) {
        const weights = currentHabitsData.good_habits.weights || {};
        const allBad = (currentHabitsData.bad_habits || {}).all_habits || [];
        
        // 1. Calcul du volume d'eau propre actuellement cochée (avant l'action)
        const checkedList = currentHabitsData.good_habits.checked || [];
        let cleanVol = 0;
        checkedList.forEach(n => { cleanVol += floatVal(weights[n], 2); });
        
        const habitWeight = floatVal(weights[name], 2);
        const totalCap = Math.max(5.0, (currentHabitsData.good_habits.total || []).reduce((acc, n) => acc + floatVal(weights[n], 2), 0));
        
        // 2. Mauvaises habitudes ayant rechuté aujourd'hui uniquement
        const relapsedBad = allBad.filter(bh => bh.relapsed_today === true);
        let totalTroubleVol = 0;
        relapsedBad.forEach(bh => {
            totalTroubleVol += floatVal(bh.poids, 2) * (floatVal(bh.influence, 100) / 100.0);
        });

        // Volume d'eau trouble restant dans le verre AVANT le clic
        const troubleInGlassBefore = Math.max(0, Math.min(totalTroubleVol, totalCap - cleanVol));

        if (newValue) {
            // COCHER une bonne habitude
            const newCleanVol = cleanVol + habitWeight;
            const troubleInGlassAfter = Math.max(0, Math.min(totalTroubleVol, totalCap - newCleanVol));
            
            // Volume d'eau trouble RÉELLEMENT expulsé du verre par ce clic
            const actualSpilled = Math.max(0, Math.round((troubleInGlassBefore - troubleInGlassAfter) * 10) / 10);

            if (actualSpilled > 0 && relapsedBad.length > 0) {
                // Expulsion du haut du verre vers le bas (Top-Down Overflow Physics)
                const expelledDetails = [];
                let remainingToSpill = actualSpilled;

                // Parcourir de la habitude située tout en haut (fin de tableau) vers celle du bas (début)
                for (let i = relapsedBad.length - 1; i >= 0; i--) {
                    if (remainingToSpill <= 0) break;
                    const bh = relapsedBad[i];
                    const bhVol = floatVal(bh.poids, 2) * (floatVal(bh.influence, 100) / 100.0);
                    
                    const bhExpelled = Math.min(bhVol, remainingToSpill);
                    const roundedExpelled = Math.round(bhExpelled * 10) / 10;
                    
                    if (roundedExpelled > 0) {
                        expelledDetails.unshift({
                            name: bh.nom || bh.name || "Mauvaise habitude",
                            volume: roundedExpelled
                        });
                        remainingToSpill = Math.max(0, Math.round((remainingToSpill - roundedExpelled) * 10) / 10);
                    }
                }

                triggerWaterOverflowAnimation(actualSpilled, expelledDetails);
            }
        } else {
            // DÉCOCHER une bonne habitude
            const currentSpilled = currentHabitsData.mini_glass_spilled || 0;
            if (currentSpilled > 0) {
                const newCleanVol = cleanVol - habitWeight;
                const troubleInGlassAfter = Math.max(0, Math.min(totalTroubleVol, totalCap - newCleanVol));
                const returnAmount = Math.min(currentSpilled, Math.round((troubleInGlassAfter - troubleInGlassBefore) * 10) / 10);
                if (returnAmount > 0) {
                    triggerReverseFlowAnimation(returnAmount);
                }
            }
        }
    }
    // OPTIMISTIC INSTANT UPDATE IN DOM & GLASS STATE (0ms UI latency)
    if (currentHabitsData && currentHabitsData.good_habits) {
        let checked = currentHabitsData.good_habits.checked || [];
        if (newValue) {
            if (!checked.includes(name)) checked.push(name);
        } else {
            checked = checked.filter(n => n !== name);
        }
        currentHabitsData.good_habits.checked = checked;
        renderHabitsGlass();
    }

    try {
        const res = await fetch('/api/good_habits/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, date: currentDate, checked: newValue })
        });
        const val = await res.json();
        if (!val.success) {
            loadHabitsData();
        }
    } catch(err) {
        console.error('Failed to toggle good habit:', err);
        loadHabitsData();
    }
}

async function deleteBadHabit(id) {
    if (!confirm('Supprimer cette mauvaise habitude ?')) return;

    // OPTIMISTIC INSTANT REMOVAL FROM DOM
    if (currentHabitsData && currentHabitsData.bad_habits && currentHabitsData.bad_habits.all_habits) {
        currentHabitsData.bad_habits.all_habits = currentHabitsData.bad_habits.all_habits.filter(h => h.id !== id);
        renderHabitsGlass();
    }

    try {
        const res = await fetch(`/api/bad_habits/${id}`, { method: 'DELETE' });
        const val = await res.json();
        if (val.success) loadHabitsData();
    } catch(err) {
        console.error('Failed to delete bad habit:', err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const btnAddBadHabit = document.getElementById('btn-add-bad-habit');
    const inputBadHabit = document.getElementById('bad-habit-title');
    const inputBadHabitPoids = document.getElementById('bad-habit-poids');
    const inputBadHabitDesc = document.getElementById('bad-habit-desc');

    if (btnAddBadHabit && inputBadHabit) {
        btnAddBadHabit.addEventListener('click', async () => {
            const nom = inputBadHabit.value.trim();
            const description = inputBadHabitDesc ? inputBadHabitDesc.value.trim() : '';
            const poids = inputBadHabitPoids ? parseInt(inputBadHabitPoids.value) : 2;

            if (!nom) return;

            try {
                const res = await fetch('/api/bad_habits', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nom: nom, description: description, poids: poids })
                });
                const val = await res.json();
                if (val.success) {
                    inputBadHabit.value = '';
                    if (inputBadHabitDesc) inputBadHabitDesc.value = '';
                    loadHabitsData();
                }
            } catch(err) {
                console.error('Failed to add bad habit:', err);
            }
        });

        inputBadHabit.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); btnAddBadHabit.click(); }
        });
    }
    loadHabitsData();
    initWeeklyNavigation();
});

let currentWeeklyStartDate = null;

async function loadWeeklyHabitsData(startDate = null) {
    const grid = document.getElementById('weekly-days-grid');
    const rangeLabel = document.getElementById('weekly-date-range-label');
    if (!grid) return;

    let url = '/api/habits/weekly_glass';
    if (startDate) url += `?start_date=${startDate}`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        if (!data.success) return;

        currentWeeklyStartDate = data.start_date;
        if (rangeLabel) rangeLabel.textContent = data.range_label;

        let gridHtml = '';
        data.days.forEach(day => {
            const hasData = (day.has_data !== false);
            const cleanPct = Math.min(100, Math.round((day.clean_volume / day.total_capacity) * 100));
            const troubleInGlass = day.trouble_in_glass || 0;
            const troublePct = Math.min(100 - cleanPct, Math.round((troubleInGlass / day.total_capacity) * 100));
            const spilled = day.mini_glass_spilled || 0;

            const isTodayClass = day.is_today ? 'is-today' : '';

            if (!hasData) {
                gridHtml += `
                    <div class="weekly-day-card ${isTodayClass}">
                        <div class="weekly-day-header">
                            <span class="weekly-day-name">${day.day_name}</span>
                            <span class="weekly-day-date">${day.display_date}</span>
                        </div>

                        <div class="weekly-glass-stage">
                            <div class="mini-glass-container" title="${day.day_name} : Aucune donnée disponible">
                                <div class="mini-glass-cylinder no-data-glass">
                                    <div class="mini-glass-no-data-text">No data</div>
                                </div>
                            </div>
                        </div>

                        <div class="weekly-day-footer">
                            <span class="weekly-score-pill no-data">No data</span>
                            <button class="btn-send-to-machine" onclick="sendGlassToMachine('${day.display_date}', '${day.day_name}', 0, 0, false)" title="Envoyer ce verre dans l'entrée de la machine">Send it ➔</button>
                        </div>
                    </div>
                `;
            } else {
                gridHtml += `
                    <div class="weekly-day-card ${isTodayClass}">
                        <div class="weekly-day-header">
                            <span class="weekly-day-name">${day.day_name}</span>
                            <span class="weekly-day-date">${day.display_date}</span>
                        </div>

                        <div class="weekly-glass-stage">
                            <!-- Mini Verre Principal -->
                            <div class="mini-glass-container" title="${day.day_name} : ${day.clean_volume} pt(s) propre(s), ${troubleInGlass.toFixed(1)} place(s) trouble(s)">
                                <div class="mini-glass-cylinder">
                                    <div class="mini-glass-water-clean" style="height: ${cleanPct}%;"></div>
                                    <div class="mini-glass-water-trouble" style="height: ${troublePct}%; bottom: ${cleanPct}%;"></div>
                                </div>
                            </div>

                            <!-- Mini Verre d'Expulsion (si eau expulsée) -->
                            ${spilled > 0 ? `
                                <div class="mini-overflow-glass-container" title="Expulsion : ${spilled.toFixed(1)} place(s)">
                                    <div class="mini-overflow-cylinder">
                                        <div class="mini-overflow-water" style="height: ${Math.min(100, Math.round((spilled / 3.0) * 100))}%;"></div>
                                    </div>
                                </div>
                            ` : ''}
                        </div>

                        <div class="weekly-day-footer">
                            ${day.clean_volume > 0 ? `<span class="weekly-score-pill clean">+${day.clean_volume}</span>` : ''}
                            ${troubleInGlass > 0 ? `<span class="weekly-score-pill trouble">-${troubleInGlass.toFixed(1)}</span>` : ''}
                            ${day.clean_volume === 0 && troubleInGlass === 0 ? `<span class="weekly-score-pill empty">—</span>` : ''}
                            <button class="btn-send-to-machine" onclick="sendGlassToMachine('${day.display_date}', '${day.day_name}', ${day.clean_volume}, ${troubleInGlass || 0}, true)" title="Envoyer ce verre dans l'entrée de la machine">Send it ➔</button>
                        </div>
                    </div>
                `;
            }
        });

        grid.innerHTML = gridHtml;

    } catch(err) {
        console.error("Erreur lors du chargement de la progression hebdomadaire:", err);
    }
}

function initWeeklyNavigation() {
    const btnPrev = document.getElementById('btn-prev-week');
    const btnNext = document.getElementById('btn-next-week');

    if (btnPrev) {
        btnPrev.addEventListener('click', () => {
            if (!currentWeeklyStartDate) return;
            const dt = new Date(currentWeeklyStartDate);
            dt.setDate(dt.getDate() - 7);
            const prevStr = dt.toISOString().split('T')[0];
            loadWeeklyHabitsData(prevStr);
        });
    }

    if (btnNext) {
        btnNext.addEventListener('click', () => {
            if (!currentWeeklyStartDate) return;
            const dt = new Date(currentWeeklyStartDate);
            dt.setDate(dt.getDate() + 7);
            const nextStr = dt.toISOString().split('T')[0];
            loadWeeklyHabitsData(nextStr);
        });
    }
}

// ── Navigation entre Bonnes et Mauvaises Habitudes ──
let currentHabitsTab = 'good';

function switchHabitsTab(tab) {
    currentHabitsTab = tab;
    const goodContainer = document.getElementById('good-habits-container');
    const badContainer = document.getElementById('bad-habits-container');
    const tabGood = document.getElementById('tab-good-habits');
    const tabBad = document.getElementById('tab-bad-habits');

    if (tab === 'good') {
        if (goodContainer) goodContainer.style.display = 'block';
        if (badContainer) badContainer.style.display = 'none';
        if (tabGood) tabGood.classList.add('active');
        if (tabBad) tabBad.classList.remove('active');
    } else {
        if (goodContainer) goodContainer.style.display = 'none';
        if (badContainer) badContainer.style.display = 'block';
        if (tabGood) tabGood.classList.remove('active');
        if (tabBad) tabBad.classList.add('active');
    }
}

function toggleHabitsTab() {
    if (currentHabitsTab === 'good') {
        switchHabitsTab('bad');
    } else {
        switchHabitsTab('good');
    }
}

// ── Pagination pour les Mauvaises Habitudes ──
let badHabitsCurrentPage = 1;

function changeBadHabitsPage(delta) {
    badHabitsCurrentPage += delta;
    if (currentHabitsData) {
        renderHabitsGlass(currentHabitsData);
    }
}

// ═══════════════════════════════════════════════════
// MACHINE D'IRRIGATION & CONSTRUCTION LOGIC
// ═══════════════════════════════════════════════════
let machinePowerActive = false; // Default OFF!

function toggleMachinePower() {
    machinePowerActive = !machinePowerActive;
    const btnPower = document.getElementById('btn-machine-power');
    const statusPill = document.querySelector('.construction-status-pill');
    const imgMachine = document.getElementById('user-machine-img');
    const analysisDisplay = document.getElementById('machine-analysis-display');
    
    if (btnPower) {
        btnPower.classList.toggle('active', machinePowerActive);
    }
    if (imgMachine) {
        imgMachine.classList.toggle('powered-off', !machinePowerActive);
    }
    if (analysisDisplay) {
        analysisDisplay.classList.toggle('powered-off', !machinePowerActive);
    }
    if (statusPill) {
        if (machinePowerActive) {
            statusPill.innerHTML = '<span class="pulse-led green"></span><span>Machine Active & Prête</span>';
        } else {
            statusPill.innerHTML = '<span class="pulse-led" style="background:#94a3b8; box-shadow:none;"></span><span style="color:#64748b;">Machine Hors Tension</span>';
        }
    }

    // Refresh digital screen display upon power toggle
    try {
        const saved = localStorage.getItem('irrigation_sent_glass_data');
        const data = saved ? JSON.parse(saved) : null;
        updateMachineAnalysisDisplay(data, machinePowerActive);
    } catch(e) {}

    // When turning ON with a glass present, start the irrigation process
    if (machinePowerActive) {
        try {
            const saved = localStorage.getItem('irrigation_sent_glass_data');
            if (saved) {
                const glassData = JSON.parse(saved);
                if (glassData && glassData.hasData !== false) {
                    setTimeout(() => startIrrigationProcess(glassData), 600);
                }
            }
        } catch(e) {}
    }
}

/* ==========================================================================
   HOTSPOT, ALCOVE GLASS & ANALYSIS SCREEN CALIBRATION
   ========================================================================== */

let isHotspotCalibrating = false;
let isDraggingHotspot = false;
let isDraggingAlcove = false;
let isDraggingAnalysis = false;
let isDraggingOutput = false;

let hotspotConfig = {
    x: 15.2, // %
    y: 85.2, // %
    size: 5.6 // %
};

let alcoveConfig = {
    x: 20.6, // %
    y: 24.0, // %
    w: 17.5, // %
    h: 38.5  // %
};

let analysisConfig = {
    x: 41.8, // %
    y: 11.8, // %
    w: 30.2, // %
    h: 25.5  // %
};

let outputConfig = {
    x: 78.4, // %
    y: 6.6,  // %
    w: 14.6, // %
    h: 22.2  // %
};

let hydroLogoConfig = {
    x: 23.5, // %
    y: 7.2,  // %
    w: 14.5, // %
    h: 6.8   // %
};

let dropLogoConfig = {
    x: 75.8, // %
    y: 40.2, // %
    w: 11.5, // %
    h: 14.5  // %
};

let stickerSprayConfig = {
    x: 5.2,  // %
    y: 35.0, // %
    w: 10.0  // %
};

let stickerGraffitiConfig = {
    x: 42.0, // %
    y: 72.0, // %
    w: 18.0  // %
};

let stickerSmileyConfig = {
    x: 86.0, // %
    y: 65.0, // %
    w: 9.5   // %
};

let isDraggingHydro = false;
let isDraggingDrop = false;
let isDraggingSpray = false;
let isDraggingGraffiti = false;
let isDraggingSmiley = false;
let userCustomAssets = [];
let activeDraggingCustomAssetId = null;

let defaultStickersVisibility = {
    hydro: true,
    drop: true,
    spray: true,
    graffiti: true,
    smiley: true
};

let isIrrigationRunning = false;

function loadSavedHotspotConfig() {
    try {
        const saved = localStorage.getItem('irrigation_power_hotspot_cfg');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.x !== undefined) hotspotConfig.x = parseFloat(parsed.x);
            if (parsed.y !== undefined) hotspotConfig.y = parseFloat(parsed.y);
            if (parsed.size !== undefined) hotspotConfig.size = parseFloat(parsed.size);
        }
    } catch(e) {}
    applyHotspotConfig();
}

function applyHotspotConfig() {
    const btn = document.getElementById('btn-machine-power');
    if (!btn) return;
    btn.style.left = `${hotspotConfig.x}%`;
    btn.style.top = `${hotspotConfig.y}%`;
    btn.style.width = `${hotspotConfig.size}%`;
    // Height is NOT set here — CSS aspect-ratio: 1/1 enforces a perfect square

    const rx = document.getElementById('calib-range-x');
    const ry = document.getElementById('calib-range-y');
    const rs = document.getElementById('calib-range-size');
    const vx = document.getElementById('calib-val-x');
    const vy = document.getElementById('calib-val-y');
    const vs = document.getElementById('calib-val-size');

    if (rx) rx.value = hotspotConfig.x;
    if (ry) ry.value = hotspotConfig.y;
    if (rs) rs.value = hotspotConfig.size;
    if (vx) vx.textContent = `${hotspotConfig.x.toFixed(1)}%`;
    if (vy) vy.textContent = `${hotspotConfig.y.toFixed(1)}%`;
    if (vs) vs.textContent = `${hotspotConfig.size.toFixed(1)}%`;
}

function loadSavedAlcoveConfig() {
    try {
        const saved = localStorage.getItem('irrigation_alcove_slot_cfg');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.x !== undefined) alcoveConfig.x = parseFloat(parsed.x);
            if (parsed.y !== undefined) alcoveConfig.y = parseFloat(parsed.y);
            if (parsed.w !== undefined) alcoveConfig.w = parseFloat(parsed.w);
            if (parsed.h !== undefined) alcoveConfig.h = parseFloat(parsed.h);
        }
    } catch(e) {}
    applyAlcoveConfig();
}

function applyAlcoveConfig() {
    const alcove = document.getElementById('machine-alcove-entrance');
    if (!alcove) return;
    alcove.style.left = `${alcoveConfig.x}%`;
    alcove.style.top = `${alcoveConfig.y}%`;
    alcove.style.width = `${alcoveConfig.w}%`;
    alcove.style.height = `${alcoveConfig.h}%`;

    const rx = document.getElementById('calib-alcove-range-x');
    const ry = document.getElementById('calib-alcove-range-y');
    const rw = document.getElementById('calib-alcove-range-w');
    const rh = document.getElementById('calib-alcove-range-h');
    const vx = document.getElementById('calib-alcove-val-x');
    const vy = document.getElementById('calib-alcove-val-y');
    const vw = document.getElementById('calib-alcove-val-w');
    const vh = document.getElementById('calib-alcove-val-h');

    if (rx) rx.value = alcoveConfig.x;
    if (ry) ry.value = alcoveConfig.y;
    if (rw) rw.value = alcoveConfig.w;
    if (rh) rh.value = alcoveConfig.h;
    if (vx) vx.textContent = `${alcoveConfig.x.toFixed(1)}%`;
    if (vy) vy.textContent = `${alcoveConfig.y.toFixed(1)}%`;
    if (vw) vw.textContent = `${alcoveConfig.w.toFixed(1)}%`;
    if (vh) vh.textContent = `${alcoveConfig.h.toFixed(1)}%`;
}

let magnetRingConfig = {
    y: -22,
    w: 42,
    h: 22
};

function loadSavedMagnetConfig() {
    try {
        const saved = localStorage.getItem('irrigation_magnet_ring_cfg');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.y !== undefined) magnetRingConfig.y = parseFloat(parsed.y);
            if (parsed.w !== undefined) magnetRingConfig.w = parseFloat(parsed.w);
            if (parsed.h !== undefined) magnetRingConfig.h = parseFloat(parsed.h);
        }
    } catch(e) {}
    applyMagnetConfig();
}

function applyMagnetConfig() {
    const ring = document.getElementById('magnetic-attractor-ring');
    if (ring) {
        ring.style.top = `${magnetRingConfig.y}px`;
        ring.style.width = `${magnetRingConfig.w}px`;
        ring.style.height = `${magnetRingConfig.h}px`;
    }

    const ry = document.getElementById('calib-magnet-range-y');
    const rw = document.getElementById('calib-magnet-range-w');
    const rh = document.getElementById('calib-magnet-range-h');
    const vy = document.getElementById('calib-magnet-val-y');
    const vw = document.getElementById('calib-magnet-val-w');
    const vh = document.getElementById('calib-magnet-val-h');

    if (ry) ry.value = magnetRingConfig.y;
    if (rw) rw.value = magnetRingConfig.w;
    if (rh) rh.value = magnetRingConfig.h;
    if (vy) vy.textContent = `${magnetRingConfig.y.toFixed(0)}px`;
    if (vw) vw.textContent = `${magnetRingConfig.w.toFixed(0)}px`;
    if (vh) vh.textContent = `${magnetRingConfig.h.toFixed(0)}px`;
}

function updateMagnetFromSliders() {
    const ry = document.getElementById('calib-magnet-range-y');
    const rw = document.getElementById('calib-magnet-range-w');
    const rh = document.getElementById('calib-magnet-range-h');

    if (ry) magnetRingConfig.y = parseFloat(ry.value);
    if (rw) magnetRingConfig.w = parseFloat(rw.value);
    if (rh) magnetRingConfig.h = parseFloat(rh.value);

    applyMagnetConfig();
    localStorage.setItem('irrigation_magnet_ring_cfg', JSON.stringify(magnetRingConfig));
}

function loadSavedAnalysisConfig() {
    try {
        const saved = localStorage.getItem('irrigation_analysis_screen_cfg');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.x !== undefined) analysisConfig.x = parseFloat(parsed.x);
            if (parsed.y !== undefined) analysisConfig.y = parseFloat(parsed.y);
            if (parsed.w !== undefined) analysisConfig.w = parseFloat(parsed.w);
            if (parsed.h !== undefined) analysisConfig.h = parseFloat(parsed.h);
        }
    } catch(e) {}
    applyAnalysisConfig();
}

function applyAnalysisConfig() {
    const display = document.getElementById('machine-analysis-display');
    if (!display) return;
    display.style.left = `${analysisConfig.x}%`;
    display.style.top = `${analysisConfig.y}%`;
    display.style.width = `${analysisConfig.w}%`;
    display.style.height = `${analysisConfig.h}%`;

    const rx = document.getElementById('calib-analysis-range-x');
    const ry = document.getElementById('calib-analysis-range-y');
    const rw = document.getElementById('calib-analysis-range-w');
    const rh = document.getElementById('calib-analysis-range-h');
    const vx = document.getElementById('calib-analysis-val-x');
    const vy = document.getElementById('calib-analysis-val-y');
    const vw = document.getElementById('calib-analysis-val-w');
    const vh = document.getElementById('calib-analysis-val-h');

    if (rx) rx.value = analysisConfig.x;
    if (ry) ry.value = analysisConfig.y;
    if (rw) rw.value = analysisConfig.w;
    if (rh) rh.value = analysisConfig.h;
    if (vx) vx.textContent = `${analysisConfig.x.toFixed(1)}%`;
    if (vy) vy.textContent = `${analysisConfig.y.toFixed(1)}%`;
    if (vw) vw.textContent = `${analysisConfig.w.toFixed(1)}%`;
    if (vh) vh.textContent = `${analysisConfig.h.toFixed(1)}%`;
}

function updateHotspotFromSliders() {
    const rx = document.getElementById('calib-range-x');
    const ry = document.getElementById('calib-range-y');
    const rs = document.getElementById('calib-range-size');

    if (rx) hotspotConfig.x = parseFloat(rx.value);
    if (ry) hotspotConfig.y = parseFloat(ry.value);
    if (rs) hotspotConfig.size = parseFloat(rs.value);

    applyHotspotConfig();
}

function updateAlcoveFromSliders() {
    const rx = document.getElementById('calib-alcove-range-x');
    const ry = document.getElementById('calib-alcove-range-y');
    const rw = document.getElementById('calib-alcove-range-w');
    const rh = document.getElementById('calib-alcove-range-h');

    if (rx) alcoveConfig.x = parseFloat(rx.value);
    if (ry) alcoveConfig.y = parseFloat(ry.value);
    if (rw) alcoveConfig.w = parseFloat(rw.value);
    if (rh) rh.value = alcoveConfig.h;

    applyAlcoveConfig();
}

function updateAnalysisFromSliders() {
    const rx = document.getElementById('calib-analysis-range-x');
    const ry = document.getElementById('calib-analysis-range-y');
    const rw = document.getElementById('calib-analysis-range-w');
    const rh = document.getElementById('calib-analysis-range-h');

    if (rx) analysisConfig.x = parseFloat(rx.value);
    if (ry) analysisConfig.y = parseFloat(ry.value);
    if (rw) analysisConfig.w = parseFloat(rw.value);
    if (rh) analysisConfig.h = parseFloat(rh.value);

    applyAnalysisConfig();
}

function updateOutputFromSliders() {
    const rx = document.getElementById('calib-output-range-x');
    const ry = document.getElementById('calib-output-range-y');
    const rw = document.getElementById('calib-output-range-w');
    const rh = document.getElementById('calib-output-range-h');

    if (rx) outputConfig.x = parseFloat(rx.value);
    if (ry) outputConfig.y = parseFloat(ry.value);
    if (rw) outputConfig.w = parseFloat(rw.value);
    if (rh) outputConfig.h = parseFloat(rh.value);

    applyOutputConfig();
}

function loadSavedOutputConfig() {
    try {
        const saved = localStorage.getItem('irrigation_output_container_cfg');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.x !== undefined && parsed.x < 82) outputConfig.x = parseFloat(parsed.x);
            if (parsed.y !== undefined) outputConfig.y = parseFloat(parsed.y);
            if (parsed.w !== undefined) outputConfig.w = parseFloat(parsed.w);
            if (parsed.h !== undefined) outputConfig.h = parseFloat(parsed.h);
        }
    } catch(e) {}
    applyOutputConfig();
}

function applyOutputConfig() {
    const container = document.getElementById('machine-output-container');
    if (!container) return;
    container.style.left = `${outputConfig.x}%`;
    container.style.top = `${outputConfig.y}%`;
    container.style.width = `${outputConfig.w}%`;
    container.style.height = `${outputConfig.h}%`;

    const rx = document.getElementById('calib-output-range-x');
    const ry = document.getElementById('calib-output-range-y');
    const rw = document.getElementById('calib-output-range-w');
    const rh = document.getElementById('calib-output-range-h');
    const vx = document.getElementById('calib-output-val-x');
    const vy = document.getElementById('calib-output-val-y');
    const vw = document.getElementById('calib-output-val-w');
    const vh = document.getElementById('calib-output-val-h');

    if (rx) rx.value = outputConfig.x;
    if (ry) ry.value = outputConfig.y;
    if (rw) rw.value = outputConfig.w;
    if (rh) rh.value = outputConfig.h;
    if (vx) vx.textContent = `${outputConfig.x.toFixed(1)}%`;
    if (vy) vy.textContent = `${outputConfig.y.toFixed(1)}%`;
    if (vw) vw.textContent = `${outputConfig.w.toFixed(1)}%`;
    if (vh) vh.textContent = `${outputConfig.h.toFixed(1)}%`;
}

function updateHydroFromSliders() {
    const rx = document.getElementById('calib-hydro-range-x');
    const ry = document.getElementById('calib-hydro-range-y');
    const rw = document.getElementById('calib-hydro-range-w');

    if (rx) hydroLogoConfig.x = parseFloat(rx.value);
    if (ry) hydroLogoConfig.y = parseFloat(ry.value);
    if (rw) hydroLogoConfig.w = parseFloat(rw.value);

    applyHydroLogoConfig();
}

function loadSavedHydroLogoConfig() {
    try {
        const saved = localStorage.getItem('irrigation_hydro_logo_cfg');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.x !== undefined) hydroLogoConfig.x = parseFloat(parsed.x);
            if (parsed.y !== undefined) hydroLogoConfig.y = parseFloat(parsed.y);
            if (parsed.w !== undefined) hydroLogoConfig.w = parseFloat(parsed.w);
        }
    } catch(e) {}
    applyHydroLogoConfig();
}

function applyHydroLogoConfig() {
    const el = document.getElementById('machine-logo-hydro');
    if (!el) return;
    el.style.left = `${hydroLogoConfig.x}%`;
    el.style.top = `${hydroLogoConfig.y}%`;
    el.style.width = `${hydroLogoConfig.w}%`;
    el.style.height = `auto`;

    const rx = document.getElementById('calib-hydro-range-x');
    const ry = document.getElementById('calib-hydro-range-y');
    const rw = document.getElementById('calib-hydro-range-w');
    const vx = document.getElementById('calib-hydro-val-x');
    const vy = document.getElementById('calib-hydro-val-y');
    const vw = document.getElementById('calib-hydro-val-w');

    if (rx) rx.value = hydroLogoConfig.x;
    if (ry) ry.value = hydroLogoConfig.y;
    if (rw) rw.value = hydroLogoConfig.w;
    if (vx) vx.textContent = `${hydroLogoConfig.x.toFixed(1)}%`;
    if (vy) vy.textContent = `${hydroLogoConfig.y.toFixed(1)}%`;
    if (vw) vw.textContent = `${hydroLogoConfig.w.toFixed(1)}%`;
}

function updateDropFromSliders() {
    const rx = document.getElementById('calib-drop-range-x');
    const ry = document.getElementById('calib-drop-range-y');
    const rw = document.getElementById('calib-drop-range-w');
    const rh = document.getElementById('calib-drop-range-h');

    if (rx) dropLogoConfig.x = parseFloat(rx.value);
    if (ry) dropLogoConfig.y = parseFloat(ry.value);
    if (rw) dropLogoConfig.w = parseFloat(rw.value);
    if (rh) dropLogoConfig.h = parseFloat(rh.value);

    applyDropLogoConfig();
}

function loadSavedDropLogoConfig() {
    try {
        const saved = localStorage.getItem('irrigation_drop_logo_cfg');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.x !== undefined) dropLogoConfig.x = parseFloat(parsed.x);
            if (parsed.y !== undefined) dropLogoConfig.y = parseFloat(parsed.y);
            if (parsed.w !== undefined) dropLogoConfig.w = parseFloat(parsed.w);
            if (parsed.h !== undefined) dropLogoConfig.h = parseFloat(parsed.h);
        }
    } catch(e) {}
    applyDropLogoConfig();
}

function applyDropLogoConfig() {
    const el = document.getElementById('machine-logo-drop');
    if (!el) return;
    el.style.left = `${dropLogoConfig.x}%`;
    el.style.top = `${dropLogoConfig.y}%`;
    el.style.width = `${dropLogoConfig.w}%`;
    el.style.height = `${dropLogoConfig.h}%`;

    const rx = document.getElementById('calib-drop-range-x');
    const ry = document.getElementById('calib-drop-range-y');
    const rw = document.getElementById('calib-drop-range-w');
    const rh = document.getElementById('calib-drop-range-h');
    const vx = document.getElementById('calib-drop-val-x');
    const vy = document.getElementById('calib-drop-val-y');
    const vw = document.getElementById('calib-drop-val-w');
    const vh = document.getElementById('calib-drop-val-h');

    if (rx) rx.value = dropLogoConfig.x;
    if (ry) ry.value = dropLogoConfig.y;
    if (rw) rw.value = dropLogoConfig.w;
    if (rh) rh.value = dropLogoConfig.h;
    if (vx) vx.textContent = `${dropLogoConfig.x.toFixed(1)}%`;
    if (vy) vy.textContent = `${dropLogoConfig.y.toFixed(1)}%`;
    if (vw) vw.textContent = `${dropLogoConfig.w.toFixed(1)}%`;
    if (vh) vh.textContent = `${dropLogoConfig.h.toFixed(1)}%`;
}

function updateSprayFromSliders() {
    const rx = document.getElementById('calib-spray-range-x');
    const ry = document.getElementById('calib-spray-range-y');
    const rw = document.getElementById('calib-spray-range-w');

    if (rx) stickerSprayConfig.x = parseFloat(rx.value);
    if (ry) stickerSprayConfig.y = parseFloat(ry.value);
    if (rw) stickerSprayConfig.w = parseFloat(rw.value);

    applySprayConfig();
}

function loadSavedSprayConfig() {
    try {
        const saved = localStorage.getItem('irrigation_sticker_spray_cfg');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.x !== undefined) stickerSprayConfig.x = parseFloat(parsed.x);
            if (parsed.y !== undefined) stickerSprayConfig.y = parseFloat(parsed.y);
            if (parsed.w !== undefined) stickerSprayConfig.w = parseFloat(parsed.w);
        }
    } catch(e) {}
    applySprayConfig();
}

function applySprayConfig() {
    const el = document.getElementById('machine-sticker-spraycan');
    if (!el) return;
    el.style.left = `${stickerSprayConfig.x}%`;
    el.style.top = `${stickerSprayConfig.y}%`;
    el.style.width = `${stickerSprayConfig.w}%`;
    el.style.height = `auto`;

    const rx = document.getElementById('calib-spray-range-x');
    const ry = document.getElementById('calib-spray-range-y');
    const rw = document.getElementById('calib-spray-range-w');
    const vx = document.getElementById('calib-spray-val-x');
    const vy = document.getElementById('calib-spray-val-y');
    const vw = document.getElementById('calib-spray-val-w');

    if (rx) rx.value = stickerSprayConfig.x;
    if (ry) ry.value = stickerSprayConfig.y;
    if (rw) rw.value = stickerSprayConfig.w;
    if (vx) vx.textContent = `${stickerSprayConfig.x.toFixed(1)}%`;
    if (vy) vy.textContent = `${stickerSprayConfig.y.toFixed(1)}%`;
    if (vw) vw.textContent = `${stickerSprayConfig.w.toFixed(1)}%`;
}

function updateGraffitiFromSliders() {
    const rx = document.getElementById('calib-graffiti-range-x');
    const ry = document.getElementById('calib-graffiti-range-y');
    const rw = document.getElementById('calib-graffiti-range-w');

    if (rx) stickerGraffitiConfig.x = parseFloat(rx.value);
    if (ry) stickerGraffitiConfig.y = parseFloat(ry.value);
    if (rw) stickerGraffitiConfig.w = parseFloat(rw.value);

    applyGraffitiConfig();
}

function loadSavedGraffitiConfig() {
    try {
        const saved = localStorage.getItem('irrigation_sticker_graffiti_cfg');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.x !== undefined) stickerGraffitiConfig.x = parseFloat(parsed.x);
            if (parsed.y !== undefined) stickerGraffitiConfig.y = parseFloat(parsed.y);
            if (parsed.w !== undefined) stickerGraffitiConfig.w = parseFloat(parsed.w);
        }
    } catch(e) {}
    applyGraffitiConfig();
}

function applyGraffitiConfig() {
    const el = document.getElementById('machine-sticker-graffiti');
    if (!el) return;
    el.style.left = `${stickerGraffitiConfig.x}%`;
    el.style.top = `${stickerGraffitiConfig.y}%`;
    el.style.width = `${stickerGraffitiConfig.w}%`;
    el.style.height = `auto`;

    const rx = document.getElementById('calib-graffiti-range-x');
    const ry = document.getElementById('calib-graffiti-range-y');
    const rw = document.getElementById('calib-graffiti-range-w');
    const vx = document.getElementById('calib-graffiti-val-x');
    const vy = document.getElementById('calib-graffiti-val-y');
    const vw = document.getElementById('calib-graffiti-val-w');

    if (rx) rx.value = stickerGraffitiConfig.x;
    if (ry) ry.value = stickerGraffitiConfig.y;
    if (rw) rw.value = stickerGraffitiConfig.w;
    if (vx) vx.textContent = `${stickerGraffitiConfig.x.toFixed(1)}%`;
    if (vy) vy.textContent = `${stickerGraffitiConfig.y.toFixed(1)}%`;
    if (vw) vw.textContent = `${stickerGraffitiConfig.w.toFixed(1)}%`;
}

function updateSmileyFromSliders() {
    const rx = document.getElementById('calib-smiley-range-x');
    const ry = document.getElementById('calib-smiley-range-y');
    const rw = document.getElementById('calib-smiley-range-w');

    if (rx) stickerSmileyConfig.x = parseFloat(rx.value);
    if (ry) stickerSmileyConfig.y = parseFloat(ry.value);
    if (rw) stickerSmileyConfig.w = parseFloat(rw.value);

    applySmileyConfig();
}

function loadSavedSmileyConfig() {
    try {
        const saved = localStorage.getItem('irrigation_sticker_smiley_cfg');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.x !== undefined) stickerSmileyConfig.x = parseFloat(parsed.x);
            if (parsed.y !== undefined) stickerSmileyConfig.y = parseFloat(parsed.y);
            if (parsed.w !== undefined) stickerSmileyConfig.w = parseFloat(parsed.w);
        }
    } catch(e) {}
    applySmileyConfig();
}

function applySmileyConfig() {
    const el = document.getElementById('machine-sticker-smiley');
    if (!el) return;
    el.style.left = `${stickerSmileyConfig.x}%`;
    el.style.top = `${stickerSmileyConfig.y}%`;
    el.style.width = `${stickerSmileyConfig.w}%`;
    el.style.height = `auto`;

    const rx = document.getElementById('calib-smiley-range-x');
    const ry = document.getElementById('calib-smiley-range-y');
    const rw = document.getElementById('calib-smiley-range-w');
    const vx = document.getElementById('calib-smiley-val-x');
    const vy = document.getElementById('calib-smiley-val-y');
    const vw = document.getElementById('calib-smiley-val-w');

    if (rx) rx.value = stickerSmileyConfig.x;
    if (ry) ry.value = stickerSmileyConfig.y;
    if (rw) rw.value = stickerSmileyConfig.w;
    if (vx) vx.textContent = `${stickerSmileyConfig.x.toFixed(1)}%`;
    if (vy) vy.textContent = `${stickerSmileyConfig.y.toFixed(1)}%`;
    if (vw) vw.textContent = `${stickerSmileyConfig.w.toFixed(1)}%`;
}

function loadSavedDefaultStickersVisibility() {
    try {
        const saved = localStorage.getItem('irrigation_default_stickers_visibility');
        if (saved) {
            defaultStickersVisibility = Object.assign(defaultStickersVisibility, JSON.parse(saved));
        }
    } catch(e) {}
    applyDefaultStickersVisibility();
}

function saveDefaultStickersVisibility() {
    try {
        localStorage.setItem('irrigation_default_stickers_visibility', JSON.stringify(defaultStickersVisibility));
    } catch(e) {}
}

function toggleDefaultStickerVisibility(key) {
    if (defaultStickersVisibility[key] !== undefined) {
        defaultStickersVisibility[key] = !defaultStickersVisibility[key];
        saveDefaultStickersVisibility();
        applyDefaultStickersVisibility();
        const names = { hydro: 'Logo Hydro', drop: 'Icone Goutte', spray: 'Sticker Spray Can', graffiti: 'Sticker Graffiti', smiley: 'Sticker Smiley' };
        const status = defaultStickersVisibility[key] ? "restauré" : "supprimé/masqué";
        showToast(`${names[key] || key} ${status} !`, 'info');
    }
}

function restoreAllDefaultStickers() {
    defaultStickersVisibility = { hydro: true, drop: true, spray: true, graffiti: true, smiley: true };
    saveDefaultStickersVisibility();
    applyDefaultStickersVisibility();
    showToast("Tous les stickers par défaut ont été restaurés !", 'success');
}

function applyDefaultStickersVisibility() {
    const elHydro = document.getElementById('machine-logo-hydro');
    const elDrop = document.getElementById('machine-logo-drop');
    const elSpray = document.getElementById('machine-sticker-spraycan');
    const elGraffiti = document.getElementById('machine-sticker-graffiti');
    const elSmiley = document.getElementById('machine-sticker-smiley');

    if (elHydro) elHydro.style.display = defaultStickersVisibility.hydro ? 'flex' : 'none';
    if (elDrop) elDrop.style.display = defaultStickersVisibility.drop ? 'flex' : 'none';
    if (elSpray) elSpray.style.display = defaultStickersVisibility.spray ? 'flex' : 'none';
    if (elGraffiti) elGraffiti.style.display = defaultStickersVisibility.graffiti ? 'flex' : 'none';
    if (elSmiley) elSmiley.style.display = defaultStickersVisibility.smiley ? 'flex' : 'none';

    // Update delete/restore button texts in calibration panel
    const btnHydro = document.getElementById('btn-toggle-del-hydro');
    const btnDrop = document.getElementById('btn-toggle-del-drop');
    const btnSpray = document.getElementById('btn-toggle-del-spray');
    const btnGraffiti = document.getElementById('btn-toggle-del-graffiti');
    const btnSmiley = document.getElementById('btn-toggle-del-smiley');

    if (btnHydro) btnHydro.innerHTML = defaultStickersVisibility.hydro ? '🗑️ Supprimer Logo Hydro' : '👁️ Restaurer Logo Hydro';
    if (btnDrop) btnDrop.innerHTML = defaultStickersVisibility.drop ? '🗑️ Supprimer Icone Goutte' : '👁️ Restaurer Icone Goutte';
    if (btnSpray) btnSpray.innerHTML = defaultStickersVisibility.spray ? '🗑️ Supprimer Sticker Spray' : '👁️ Restaurer Sticker Spray';
    if (btnGraffiti) btnGraffiti.innerHTML = defaultStickersVisibility.graffiti ? '🗑️ Supprimer Sticker Graffiti' : '👁️ Restaurer Sticker Graffiti';
    if (btnSmiley) btnSmiley.innerHTML = defaultStickersVisibility.smiley ? '🗑️ Supprimer Sticker Smiley' : '👁️ Restaurer Sticker Smiley';
}

function loadSavedUserCustomAssets() {
    try {
        const saved = localStorage.getItem('irrigation_user_custom_assets');
        if (saved) {
            userCustomAssets = JSON.parse(saved) || [];
        }
    } catch(e) {
        userCustomAssets = [];
    }
    renderUserCustomAssets();
}

function saveUserCustomAssets() {
    try {
        localStorage.setItem('irrigation_user_custom_assets', JSON.stringify(userCustomAssets));
    } catch(e) {}
}

function handleUserCustomAssetUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast("Veuillez sélectionner un fichier image valide !", 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(evt) {
        const assetId = `custom_asset_${Date.now()}`;
        const newAsset = {
            id: assetId,
            name: file.name.replace(/\.[^/.]+$/, ""),
            src: evt.target.result,
            x: 42.0,
            y: 40.0,
            w: 14.0
        };

        userCustomAssets.push(newAsset);
        saveUserCustomAssets();
        renderUserCustomAssets();
        showToast(`Asset "${newAsset.name}" importé avec succès !`, 'success');
        
        if (!isHotspotCalibrating) {
            toggleHotspotCalibration();
        }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

function deleteUserCustomAsset(assetId) {
    userCustomAssets = userCustomAssets.filter(a => a.id !== assetId);
    saveUserCustomAssets();
    renderUserCustomAssets();
    showToast("Asset supprimé de la machine !", 'info');
}

function updateUserCustomAssetFromSliders(assetId) {
    const asset = userCustomAssets.find(a => a.id === assetId);
    if (!asset) return;

    const rx = document.getElementById(`calib-${assetId}-range-x`);
    const ry = document.getElementById(`calib-${assetId}-range-y`);
    const rw = document.getElementById(`calib-${assetId}-range-w`);

    if (rx) asset.x = parseFloat(rx.value);
    if (ry) asset.y = parseFloat(ry.value);
    if (rw) asset.w = parseFloat(rw.value);

    applySingleCustomAsset(asset);
    saveUserCustomAssets();
}

function applySingleCustomAsset(asset) {
    const el = document.getElementById(asset.id);
    if (!el) return;

    el.style.left = `${asset.x}%`;
    el.style.top = `${asset.y}%`;
    el.style.width = `${asset.w}%`;
    el.style.height = `auto`;

    const rx = document.getElementById(`calib-${asset.id}-range-x`);
    const ry = document.getElementById(`calib-${asset.id}-range-y`);
    const rw = document.getElementById(`calib-${asset.id}-range-w`);
    const vx = document.getElementById(`calib-${asset.id}-val-x`);
    const vy = document.getElementById(`calib-${asset.id}-val-y`);
    const vw = document.getElementById(`calib-${asset.id}-val-w`);

    if (rx) rx.value = asset.x;
    if (ry) ry.value = asset.y;
    if (rw) rw.value = asset.w;
    if (vx) vx.textContent = `${asset.x.toFixed(1)}%`;
    if (vy) vy.textContent = `${asset.y.toFixed(1)}%`;
    if (vw) vw.textContent = `${asset.w.toFixed(1)}%`;
}

function renderUserCustomAssets() {
    const layer = document.getElementById('user-custom-assets-layer');
    const calibList = document.getElementById('custom-assets-calibration-list');

    if (layer) {
        layer.innerHTML = userCustomAssets.map(asset => `
            <div class="machine-sticker-element ${isHotspotCalibrating ? 'is-calibrating' : ''}" id="${asset.id}" style="left: ${asset.x}%; top: ${asset.y}%; width: ${asset.w}%; height: auto;" title="${asset.name}">
                <div class="sticker-drag-label">${asset.name}</div>
                <img src="${asset.src}" alt="${asset.name}" class="machine-sticker-img">
            </div>
        `).join('');

        const wrapper = document.getElementById('user-machine-wrapper');
        userCustomAssets.forEach(asset => {
            const el = document.getElementById(asset.id);
            if (el && wrapper) {
                el.addEventListener('mousedown', (e) => {
                    if (!isHotspotCalibrating) return;
                    activeDraggingCustomAssetId = asset.id;
                    isDraggingHotspot = false;
                    isDraggingAlcove = false;
                    isDraggingAnalysis = false;
                    isDraggingOutput = false;
                    isDraggingHydro = false;
                    isDraggingDrop = false;
                    isDraggingSpray = false;
                    isDraggingGraffiti = false;
                    isDraggingSmiley = false;

                    const rect = el.getBoundingClientRect();
                    const wrapRect = wrapper.getBoundingClientRect();
                    dragOffsetX = ((e.clientX - rect.left) / wrapRect.width) * 100;
                    dragOffsetY = ((e.clientY - rect.top) / wrapRect.height) * 100;
                    e.preventDefault();
                    e.stopPropagation();
                });
            }
        });
    }

    if (calibList) {
        calibList.innerHTML = userCustomAssets.map(asset => `
            <div class="calib-group">
                <div class="calib-group-title">🖼️ ${asset.name}</div>
                <div class="calib-slider-row">
                    <label>X: <span id="calib-${asset.id}-val-x">${asset.x.toFixed(1)}%</span></label>
                    <input type="range" id="calib-${asset.id}-range-x" min="0" max="95" step="0.1" value="${asset.x}" oninput="updateUserCustomAssetFromSliders('${asset.id}')">
                </div>
                <div class="calib-slider-row">
                    <label>Y: <span id="calib-${asset.id}-val-y">${asset.y.toFixed(1)}%</span></label>
                    <input type="range" id="calib-${asset.id}-range-y" min="0" max="90" step="0.1" value="${asset.y}" oninput="updateUserCustomAssetFromSliders('${asset.id}')">
                </div>
                <div class="calib-slider-row">
                    <label>Taille (%): <span id="calib-${asset.id}-val-w">${asset.w.toFixed(1)}%</span></label>
                    <input type="range" id="calib-${asset.id}-range-w" min="2" max="60" step="0.1" value="${asset.w}" oninput="updateUserCustomAssetFromSliders('${asset.id}')">
                </div>
                <button class="btn-delete-custom-asset" onclick="deleteUserCustomAsset('${asset.id}')">
                    🗑️ Supprimer cet asset
                </button>
            </div>
        `).join('');
    }
}

function toggleHotspotCalibration() {
    isHotspotCalibrating = !isHotspotCalibrating;
    const bar = document.getElementById('hotspot-calibration-bar');
    const btnCalib = document.getElementById('btn-calibrate-hotspot');
    const hotspot = document.getElementById('btn-machine-power');
    const alcove = document.getElementById('machine-alcove-entrance');
    const display = document.getElementById('machine-analysis-display');
    const outputCont = document.getElementById('machine-output-container');
    const logoHydro = document.getElementById('machine-logo-hydro');
    const logoDrop = document.getElementById('machine-logo-drop');
    const stSpray = document.getElementById('machine-sticker-spraycan');
    const stGraffiti = document.getElementById('machine-sticker-graffiti');
    const stSmiley = document.getElementById('machine-sticker-smiley');

    if (bar) bar.style.display = isHotspotCalibrating ? 'flex' : 'none';
    if (btnCalib) btnCalib.classList.toggle('active', isHotspotCalibrating);
    if (hotspot) hotspot.classList.toggle('is-calibrating', isHotspotCalibrating);
    if (alcove) alcove.classList.toggle('is-calibrating', isHotspotCalibrating);
    if (display) display.classList.toggle('is-calibrating', isHotspotCalibrating);
    if (outputCont) outputCont.classList.toggle('is-calibrating', isHotspotCalibrating);
    if (logoHydro) logoHydro.classList.toggle('is-calibrating', isHotspotCalibrating);
    if (logoDrop) logoDrop.classList.toggle('is-calibrating', isHotspotCalibrating);
    if (stSpray) stSpray.classList.toggle('is-calibrating', isHotspotCalibrating);
    if (stGraffiti) stGraffiti.classList.toggle('is-calibrating', isHotspotCalibrating);
    if (stSmiley) stSmiley.classList.toggle('is-calibrating', isHotspotCalibrating);

    renderUserCustomAssets();
}

function saveHotspotCalibration() {
    try {
        localStorage.setItem('irrigation_power_hotspot_cfg', JSON.stringify(hotspotConfig));
        localStorage.setItem('irrigation_alcove_slot_cfg', JSON.stringify(alcoveConfig));
        localStorage.setItem('irrigation_analysis_screen_cfg', JSON.stringify(analysisConfig));
        localStorage.setItem('irrigation_output_container_cfg', JSON.stringify(outputConfig));
        localStorage.setItem('irrigation_hydro_logo_cfg', JSON.stringify(hydroLogoConfig));
        localStorage.setItem('irrigation_drop_logo_cfg', JSON.stringify(dropLogoConfig));
        localStorage.setItem('irrigation_sticker_spray_cfg', JSON.stringify(stickerSprayConfig));
        localStorage.setItem('irrigation_sticker_graffiti_cfg', JSON.stringify(stickerGraffitiConfig));
        localStorage.setItem('irrigation_sticker_smiley_cfg', JSON.stringify(stickerSmileyConfig));
    } catch(e) {}
    toggleHotspotCalibration();
    showToast("Positions et tailles de tous les éléments et stickers fixées avec succès !", 'success');
}

function handlePowerButtonClick(e) {
    if (isHotspotCalibrating) {
        e.preventDefault();
        e.stopPropagation();
        return;
    }
    toggleMachinePower();
}

/* ==========================================================================
   ALCOVE ENTRANCE GLASS & DIGITAL ANALYSIS DISPLAY LOGIC
   ========================================================================== */

function sendGlassToMachine(displayDate, dayName, cleanVol, troubleVol, hasData) {
    const glassData = {
        displayDate: displayDate,
        dayName: dayName,
        cleanVol: parseFloat(cleanVol) || 0,
        troubleVol: parseFloat(troubleVol) || 0,
        hasData: (hasData !== false),
        timestamp: Date.now()
    };

    try {
        localStorage.setItem('irrigation_sent_glass_data', JSON.stringify(glassData));
    } catch(e) {}

    renderAlcoveGlass(glassData);
    showToast(`Verre du ${dayName} (${displayDate}) envoyé dans l'entrée de la station !`, 'success');
}

function loadSavedAlcoveGlass() {
    try {
        const saved = localStorage.getItem('irrigation_sent_glass_data');
        if (saved) {
            const data = JSON.parse(saved);
            renderAlcoveGlass(data);
        } else {
            updateMachineAnalysisDisplay(null, false);
        }
    } catch(e) {
        updateMachineAnalysisDisplay(null, false);
    }
}

function renderAlcoveGlass(glassData) {
    const wrapper = document.getElementById('alcove-glass-wrapper');
    if (!wrapper) return;

    if (!glassData) {
        wrapper.innerHTML = `
            <div class="empty-alcove-placeholder">
                <span class="alcove-placeholder-icon">🥛</span>
                <span class="alcove-placeholder-text">Aucun verre inséré</span>
            </div>
        `;
        updateMachineAnalysisDisplay(null, false);
        return;
    }

    const hasData = (glassData.hasData !== false);
    const cleanVol = glassData.cleanVol || 0;
    const troubleVol = glassData.troubleVol || 0;
    const totalVol = cleanVol + troubleVol;

    if (!hasData) {
        wrapper.innerHTML = `
            <div class="alcove-glass-card no-data" title="${glassData.dayName} (${glassData.displayDate}) : Aucune donnée">
                <div class="alcove-glass-rim"></div>
                <div class="alcove-no-data-text">No Data</div>
            </div>
        `;
    } else {
        // Proportional liquid filling based on absolute volume relative to full glass capacity (24 points)
        const maxCapacity = 24.0;
        const maxFillPct = 82;
        let cleanPct = 0;
        let troublePct = 0;

        if (totalVol > 0) {
            cleanPct = Math.min(maxFillPct, Math.round((cleanVol / maxCapacity) * maxFillPct));
            troublePct = Math.min(maxFillPct - cleanPct, Math.round((troubleVol / maxCapacity) * maxFillPct));
        }

        wrapper.innerHTML = `
            <div class="magnetic-attractor-ring" id="magnetic-attractor-ring"></div>
            <canvas class="alcove-particle-canvas" id="alcove-particle-canvas"></canvas>
            <div class="alcove-glass-card" id="alcove-glass-card" title="${glassData.dayName} : ${cleanVol} pt(s) propre(s), ${troubleVol.toFixed(1)} place(s) trouble(s)">
                <div class="alcove-glass-rim"></div>
                <div class="alcove-water-trouble" id="alcove-water-trouble" style="height: ${troublePct}%;"></div>
                <div class="alcove-water-clean" id="alcove-water-clean" style="height: ${cleanPct}%;"></div>
            </div>
        `;
    }

    updateMachineAnalysisDisplay(glassData, true);
}

let analysisScanTimer = null;

function updateMachineAnalysisDisplay(glassData, animate = false) {
    const display = document.getElementById('machine-analysis-display');
    const statusText = document.getElementById('analysis-status-text');
    const headerEl = document.getElementById('analysis-readout-header');
    const elTotal = document.getElementById('display-vol-total');
    const elClean = document.getElementById('display-vol-clean');
    const elTrouble = document.getElementById('display-vol-trouble');

    if (!display || !elTotal || !elClean || !elTrouble) return;

    if (analysisScanTimer) {
        clearTimeout(analysisScanTimer);
        analysisScanTimer = null;
    }

    if (!machinePowerActive) {
        display.classList.remove('is-scanning');
        if (headerEl) headerEl.textContent = "HORS TENSION";
        if (statusText) statusText.textContent = "HORS TENSION";
        elTotal.textContent = "– –";
        elClean.textContent = "– –";
        elTrouble.textContent = "– –";
        elTotal.className = "readout-value";
        elClean.className = "readout-value readout-clean";
        elTrouble.className = "readout-value readout-trouble";
        return;
    }

    if (!glassData) {
        display.classList.remove('is-scanning');
        if (headerEl) headerEl.textContent = "EN ATTENTE";
        if (statusText) statusText.textContent = "EN ATTENTE";
        elTotal.textContent = "0.0 L";
        elClean.textContent = "0.0 L";
        elTrouble.textContent = "0.0 L";
        elTotal.className = "readout-value";
        elClean.className = "readout-value readout-clean";
        elTrouble.className = "readout-value readout-trouble";
        return;
    }

    const hasData = (glassData.hasData !== false);
    const cleanVol = glassData.cleanVol || 0;
    const troubleVol = glassData.troubleVol || 0;
    const totalVol = cleanVol + troubleVol;

    if (!hasData) {
        display.classList.remove('is-scanning');
        if (headerEl) headerEl.textContent = "NO DATA";
        if (statusText) statusText.textContent = "NO DATA";
        elTotal.textContent = "0.0 L";
        elClean.textContent = "0.0 L";
        elTrouble.textContent = "0.0 L";
        elTotal.className = "readout-value";
        elClean.className = "readout-value";
        elTrouble.className = "readout-value";
        return;
    }

    if (animate) {
        display.classList.add('is-scanning');
        if (statusText) statusText.textContent = "ANALYSE...";

        elTotal.textContent = "";
        elClean.textContent = "";
        elTrouble.textContent = "";

        analysisScanTimer = setTimeout(() => {
            display.classList.remove('is-scanning');
            if (headerEl) headerEl.textContent = "TERMINÉE ✓";
            if (statusText) statusText.textContent = "TERMINÉE ✓";

            elTotal.textContent = `${totalVol.toFixed(1)} L`;
            elClean.textContent = `${cleanVol.toFixed(1)} L`;
            elTrouble.textContent = `${troubleVol.toFixed(1)} L`;
            elTotal.className = "readout-value";
            elClean.className = "readout-value readout-clean";
            elTrouble.className = "readout-value readout-trouble";
        }, 2200);
    } else {
        display.classList.remove('is-scanning');
        if (headerEl) headerEl.textContent = "TERMINÉE ✓";
        if (statusText) statusText.textContent = "TERMINÉE ✓";

        elTotal.textContent = `${totalVol.toFixed(1)} L`;
        elClean.textContent = `${cleanVol.toFixed(1)} L`;
        elTrouble.textContent = `${troubleVol.toFixed(1)} L`;
        elTotal.className = "readout-value";
        elClean.className = "readout-value readout-clean";
        elTrouble.className = "readout-value readout-trouble";
    }
}

// Call initializations on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    loadSavedAlcoveGlass();
    loadSavedHotspotConfig();
    loadSavedAlcoveConfig();
    loadSavedMagnetConfig();
    loadSavedAnalysisConfig();
    loadSavedOutputConfig();
    loadSavedHydroLogoConfig();
    loadSavedDropLogoConfig();
    loadSavedSprayConfig();
    loadSavedGraffitiConfig();
    loadSavedSmileyConfig();
    loadSavedDefaultStickersVisibility();
    loadSavedUserCustomAssets();

    const wrapper = document.getElementById('user-machine-wrapper');
    const hotspot = document.getElementById('btn-machine-power');
    const alcove = document.getElementById('machine-alcove-entrance');
    const display = document.getElementById('machine-analysis-display');
    const outputCont = document.getElementById('machine-output-container');
    const logoHydro = document.getElementById('machine-logo-hydro');
    const logoDrop = document.getElementById('machine-logo-drop');
    const stSpray = document.getElementById('machine-sticker-spraycan');
    const stGraffiti = document.getElementById('machine-sticker-graffiti');
    const stSmiley = document.getElementById('machine-sticker-smiley');

    let dragOffsetX = 0;
    let dragOffsetY = 0;

    if (wrapper) {
        if (hotspot) {
            hotspot.addEventListener('mousedown', (e) => {
                if (!isHotspotCalibrating) return;
                isDraggingHotspot = true;
                isDraggingAlcove = false;
                isDraggingAnalysis = false;
                isDraggingOutput = false;
                isDraggingHydro = false;
                isDraggingDrop = false;
                const rect = hotspot.getBoundingClientRect();
                const wrapRect = wrapper.getBoundingClientRect();
                dragOffsetX = ((e.clientX - rect.left) / wrapRect.width) * 100;
                dragOffsetY = ((e.clientY - rect.top) / wrapRect.height) * 100;
                e.preventDefault();
                e.stopPropagation();
            });
        }

        if (alcove) {
            alcove.addEventListener('mousedown', (e) => {
                if (!isHotspotCalibrating) return;
                isDraggingAlcove = true;
                isDraggingHotspot = false;
                isDraggingAnalysis = false;
                isDraggingOutput = false;
                isDraggingHydro = false;
                isDraggingDrop = false;
                const rect = alcove.getBoundingClientRect();
                const wrapRect = wrapper.getBoundingClientRect();
                dragOffsetX = ((e.clientX - rect.left) / wrapRect.width) * 100;
                dragOffsetY = ((e.clientY - rect.top) / wrapRect.height) * 100;
                e.preventDefault();
                e.stopPropagation();
            });
        }

        if (display) {
            display.addEventListener('mousedown', (e) => {
                if (!isHotspotCalibrating) return;
                isDraggingAnalysis = true;
                isDraggingHotspot = false;
                isDraggingAlcove = false;
                isDraggingOutput = false;
                isDraggingHydro = false;
                isDraggingDrop = false;
                const rect = display.getBoundingClientRect();
                const wrapRect = wrapper.getBoundingClientRect();
                dragOffsetX = ((e.clientX - rect.left) / wrapRect.width) * 100;
                dragOffsetY = ((e.clientY - rect.top) / wrapRect.height) * 100;
                e.preventDefault();
                e.stopPropagation();
            });
        }

        if (outputCont) {
            outputCont.addEventListener('mousedown', (e) => {
                if (!isHotspotCalibrating) return;
                isDraggingOutput = true;
                isDraggingHotspot = false;
                isDraggingAlcove = false;
                isDraggingAnalysis = false;
                isDraggingHydro = false;
                isDraggingDrop = false;
                const rect = outputCont.getBoundingClientRect();
                const wrapRect = wrapper.getBoundingClientRect();
                dragOffsetX = ((e.clientX - rect.left) / wrapRect.width) * 100;
                dragOffsetY = ((e.clientY - rect.top) / wrapRect.height) * 100;
                e.preventDefault();
                e.stopPropagation();
            });
        }

        if (logoHydro) {
            logoHydro.addEventListener('mousedown', (e) => {
                if (!isHotspotCalibrating) return;
                isDraggingHydro = true;
                isDraggingHotspot = false;
                isDraggingAlcove = false;
                isDraggingAnalysis = false;
                isDraggingOutput = false;
                isDraggingDrop = false;
                const rect = logoHydro.getBoundingClientRect();
                const wrapRect = wrapper.getBoundingClientRect();
                dragOffsetX = ((e.clientX - rect.left) / wrapRect.width) * 100;
                dragOffsetY = ((e.clientY - rect.top) / wrapRect.height) * 100;
                e.preventDefault();
                e.stopPropagation();
            });
        }

        if (logoDrop) {
            logoDrop.addEventListener('mousedown', (e) => {
                if (!isHotspotCalibrating) return;
                isDraggingDrop = true;
                isDraggingHotspot = false;
                isDraggingAlcove = false;
                isDraggingAnalysis = false;
                isDraggingOutput = false;
                isDraggingHydro = false;
                isDraggingSpray = false;
                isDraggingGraffiti = false;
                isDraggingSmiley = false;
                const rect = logoDrop.getBoundingClientRect();
                const wrapRect = wrapper.getBoundingClientRect();
                dragOffsetX = ((e.clientX - rect.left) / wrapRect.width) * 100;
                dragOffsetY = ((e.clientY - rect.top) / wrapRect.height) * 100;
                e.preventDefault();
                e.stopPropagation();
            });
        }

        if (stSpray) {
            stSpray.addEventListener('mousedown', (e) => {
                if (!isHotspotCalibrating) return;
                isDraggingSpray = true;
                isDraggingHotspot = false;
                isDraggingAlcove = false;
                isDraggingAnalysis = false;
                isDraggingOutput = false;
                isDraggingHydro = false;
                isDraggingDrop = false;
                isDraggingGraffiti = false;
                isDraggingSmiley = false;
                const rect = stSpray.getBoundingClientRect();
                const wrapRect = wrapper.getBoundingClientRect();
                dragOffsetX = ((e.clientX - rect.left) / wrapRect.width) * 100;
                dragOffsetY = ((e.clientY - rect.top) / wrapRect.height) * 100;
                e.preventDefault();
                e.stopPropagation();
            });
        }

        if (stGraffiti) {
            stGraffiti.addEventListener('mousedown', (e) => {
                if (!isHotspotCalibrating) return;
                isDraggingGraffiti = true;
                isDraggingHotspot = false;
                isDraggingAlcove = false;
                isDraggingAnalysis = false;
                isDraggingOutput = false;
                isDraggingHydro = false;
                isDraggingDrop = false;
                isDraggingSpray = false;
                isDraggingSmiley = false;
                const rect = stGraffiti.getBoundingClientRect();
                const wrapRect = wrapper.getBoundingClientRect();
                dragOffsetX = ((e.clientX - rect.left) / wrapRect.width) * 100;
                dragOffsetY = ((e.clientY - rect.top) / wrapRect.height) * 100;
                e.preventDefault();
                e.stopPropagation();
            });
        }

        if (stSmiley) {
            stSmiley.addEventListener('mousedown', (e) => {
                if (!isHotspotCalibrating) return;
                isDraggingSmiley = true;
                isDraggingHotspot = false;
                isDraggingAlcove = false;
                isDraggingAnalysis = false;
                isDraggingOutput = false;
                isDraggingHydro = false;
                isDraggingDrop = false;
                isDraggingSpray = false;
                isDraggingGraffiti = false;
                const rect = stSmiley.getBoundingClientRect();
                const wrapRect = wrapper.getBoundingClientRect();
                dragOffsetX = ((e.clientX - rect.left) / wrapRect.width) * 100;
                dragOffsetY = ((e.clientY - rect.top) / wrapRect.height) * 100;
                e.preventDefault();
                e.stopPropagation();
            });
        }

        document.addEventListener('mousemove', (e) => {
            if (!isHotspotCalibrating) return;
            if (!isDraggingHotspot && !isDraggingAlcove && !isDraggingAnalysis && !isDraggingOutput && !isDraggingHydro && !isDraggingDrop && !isDraggingSpray && !isDraggingGraffiti && !isDraggingSmiley && !activeDraggingCustomAssetId) return;

            const rect = wrapper.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;

            let relX = ((e.clientX - rect.left) / rect.width) * 100 - dragOffsetX;
            let relY = ((e.clientY - rect.top) / rect.height) * 100 - dragOffsetY;

            relX = Math.max(0, Math.min(95, relX));
            relY = Math.max(0, Math.min(95, relY));

            if (isDraggingHotspot) {
                hotspotConfig.x = parseFloat(relX.toFixed(1));
                hotspotConfig.y = parseFloat(relY.toFixed(1));
                applyHotspotConfig();
            } else if (isDraggingAlcove) {
                alcoveConfig.x = parseFloat(relX.toFixed(1));
                alcoveConfig.y = parseFloat(relY.toFixed(1));
                applyAlcoveConfig();
            } else if (isDraggingAnalysis) {
                analysisConfig.x = parseFloat(relX.toFixed(1));
                analysisConfig.y = parseFloat(relY.toFixed(1));
                applyAnalysisConfig();
            } else if (isDraggingOutput) {
                outputConfig.x = parseFloat(relX.toFixed(1));
                outputConfig.y = parseFloat(relY.toFixed(1));
                applyOutputConfig();
            } else if (isDraggingHydro) {
                hydroLogoConfig.x = parseFloat(relX.toFixed(1));
                hydroLogoConfig.y = parseFloat(relY.toFixed(1));
                applyHydroLogoConfig();
            } else if (isDraggingDrop) {
                dropLogoConfig.x = parseFloat(relX.toFixed(1));
                dropLogoConfig.y = parseFloat(relY.toFixed(1));
                applyDropLogoConfig();
            } else if (isDraggingSpray) {
                stickerSprayConfig.x = parseFloat(relX.toFixed(1));
                stickerSprayConfig.y = parseFloat(relY.toFixed(1));
                applySprayConfig();
            } else if (isDraggingGraffiti) {
                stickerGraffitiConfig.x = parseFloat(relX.toFixed(1));
                stickerGraffitiConfig.y = parseFloat(relY.toFixed(1));
                applyGraffitiConfig();
            } else if (isDraggingSmiley) {
                stickerSmileyConfig.x = parseFloat(relX.toFixed(1));
                stickerSmileyConfig.y = parseFloat(relY.toFixed(1));
                applySmileyConfig();
            } else if (activeDraggingCustomAssetId) {
                const asset = userCustomAssets.find(a => a.id === activeDraggingCustomAssetId);
                if (asset) {
                    asset.x = parseFloat(relX.toFixed(1));
                    asset.y = parseFloat(relY.toFixed(1));
                    applySingleCustomAsset(asset);
                }
            }
        });

        document.addEventListener('mouseup', () => {
            if (activeDraggingCustomAssetId) {
                saveUserCustomAssets();
                activeDraggingCustomAssetId = null;
            }
            isDraggingHotspot = false;
            isDraggingAlcove = false;
            isDraggingAnalysis = false;
            isDraggingOutput = false;
            isDraggingHydro = false;
            isDraggingDrop = false;
            isDraggingSpray = false;
            isDraggingGraffiti = false;
            isDraggingSmiley = false;
        });
    }
});

let alcoveCanvasAnimId = null;

function runMagneticSuctionAnimation(glassData, onComplete) {
    const wrapper = document.getElementById('alcove-glass-wrapper');
    const canvas = document.getElementById('alcove-particle-canvas');
    const magnetRing = document.getElementById('magnetic-attractor-ring');
    const alcoveTrouble = document.getElementById('alcove-water-trouble');
    const alcoveClean = document.getElementById('alcove-water-clean');
    const alcoveCard = document.getElementById('alcove-glass-card');

    if (!wrapper || !canvas || !alcoveCard) {
        if (onComplete) onComplete();
        return;
    }

    // Apply saved magnet ring configuration
    applyMagnetConfig();

    const ctx = canvas.getContext('2d');
    
    // Fit canvas resolution to wrapper container
    const wrapperRect = wrapper.getBoundingClientRect();
    const canvasTopOffset = Math.abs(Math.min(0, magnetRingConfig.y)) + 15;
    canvas.width = Math.round(wrapperRect.width) || 120;
    canvas.height = Math.round(wrapperRect.height + canvasTopOffset) || 205;

    // Attractor Magnet Center (Circle/Ellipse above glass)
    const magnetX = canvas.width / 2;
    const magnetY = Math.max(10, canvasTopOffset + magnetRingConfig.y + (magnetRingConfig.h / 2));

    // Glass Card relative bounds on Canvas (EXACT 1-to-1 pixel alignment)
    const cardRect = alcoveCard.getBoundingClientRect();
    const cardLeft = cardRect.left - wrapperRect.left;
    const cardWidth = cardRect.width;
    const cardTop = (cardRect.top - wrapperRect.top) + canvasTopOffset;
    const cardHeight = cardRect.height;
    const cardBottom = cardTop + cardHeight;

    const maxCapacity = 24.0;
    const maxFillPct = 82;

    const cleanVol = glassData.cleanVol || 0;
    const troubleVol = glassData.troubleVol || 0;

    let remainingTroubleVol = troubleVol;
    let remainingCleanVol = cleanVol;

    let activePhase = (troubleVol > 0) ? 'trouble' : ((cleanVol > 0) ? 'clean' : 'done');
    
    if (activePhase === 'done') {
        if (onComplete) onComplete();
        return;
    }

    if (magnetRing) {
        magnetRing.className = `magnetic-attractor-ring active-${activePhase}`;
    }

    // Number of particles (16 particles per Liter -> Fast responsive UX ~3.2s total!)
    const particlesPerLiter = 16;
    let troubleParticlesToEmit = Math.round(remainingTroubleVol * particlesPerLiter);
    let cleanParticlesToEmit = Math.round(remainingCleanVol * particlesPerLiter);

    // Volume deducted per single particle (Mass Conservation)
    const troubleVolPerParticle = (troubleParticlesToEmit > 0) ? (remainingTroubleVol / troubleParticlesToEmit) : 0;
    const cleanVolPerParticle = (cleanParticlesToEmit > 0) ? (remainingCleanVol / cleanParticlesToEmit) : 0;

    let particles = [];
    let wavePulseRadius = 0;
    let frameCounter = 0;

    if (alcoveCanvasAnimId) {
        cancelAnimationFrame(alcoveCanvasAnimId);
        alcoveCanvasAnimId = null;
    }

    function animate(now) {
        frameCounter++;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 1. 3D Elliptical Attraction Waves around top attractor node
        wavePulseRadius = (wavePulseRadius + 0.5) % 18;
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(
            magnetX, magnetY,
            Math.max(4, (magnetRingConfig.w / 2) + 8 - wavePulseRadius),
            Math.max(2, (magnetRingConfig.h / 2) + 4 - (wavePulseRadius * 0.5)),
            0, 0, Math.PI * 2
        );
        ctx.strokeStyle = (activePhase === 'trouble') ? 'rgba(245, 158, 11, 0.5)' : 'rgba(56, 189, 248, 0.5)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.restore();

        // 2. Liquid Surface Height Calculation (Strict Mass Conservation)
        const currentTroublePct = Math.max(0, (remainingTroubleVol / maxCapacity) * maxFillPct);
        const currentCleanPct = Math.max(0, (remainingCleanVol / maxCapacity) * maxFillPct);

        if (alcoveTrouble) alcoveTrouble.style.height = `${currentTroublePct}%`;
        if (alcoveClean) alcoveClean.style.height = `${currentCleanPct}%`;

        const totalPct = currentCleanPct + currentTroublePct;
        const surfaceY = cardBottom - (totalPct / 100) * cardHeight;

        // 3. Particle Emission UNDERWATER
        if (activePhase === 'trouble') {
            if (troubleParticlesToEmit > 0) {
                // Emit 2 particles per frame for fast responsive UX
                const spawnBatch = Math.min(troubleParticlesToEmit, 2);
                for (let b = 0; b < spawnBatch; b++) {
                    troubleParticlesToEmit--;

                    const px = cardLeft + 5 + Math.random() * (cardWidth - 10);
                    // Spawn UNDERWATER below surfaceY inside liquid column
                    const liquidDepth = Math.max(8, cardBottom - surfaceY);
                    const py = surfaceY + (Math.random() * liquidDepth * 0.85);

                    particles.push({
                        x: px,
                        y: py,
                        vx: (Math.random() - 0.5) * 0.1,
                        vy: - (Math.random() * 0.8 + 1.2), // Upward buoyancy & suction
                        radius: Math.random() * 0.6 + 1.4,
                        glowColor: 'rgba(245, 158, 11, 0.9)',
                        type: 'trouble',
                        emerged: false
                    });
                }
            }

            if (troubleParticlesToEmit === 0 && remainingTroubleVol <= 0.001) {
                remainingTroubleVol = 0;
                if (alcoveTrouble) alcoveTrouble.style.height = '0%';
                
                if (cleanVol > 0) {
                    activePhase = 'clean';
                    if (magnetRing) magnetRing.className = 'magnetic-attractor-ring active-clean';
                } else {
                    activePhase = 'finishing';
                }
            }
        } else if (activePhase === 'clean') {
            if (cleanParticlesToEmit > 0) {
                const spawnBatch = Math.min(cleanParticlesToEmit, 2);
                for (let b = 0; b < spawnBatch; b++) {
                    cleanParticlesToEmit--;

                    const px = cardLeft + 5 + Math.random() * (cardWidth - 10);
                    const liquidDepth = Math.max(8, cardBottom - surfaceY);
                    const py = surfaceY + (Math.random() * liquidDepth * 0.85);

                    particles.push({
                        x: px,
                        y: py,
                        vx: (Math.random() - 0.5) * 0.1,
                        vy: - (Math.random() * 0.9 + 1.4),
                        radius: Math.random() * 0.6 + 1.4,
                        glowColor: 'rgba(56, 189, 248, 0.9)',
                        type: 'clean',
                        emerged: false
                    });
                }
            }

            if (cleanParticlesToEmit === 0 && remainingCleanVol <= 0.001) {
                remainingCleanVol = 0;
                if (alcoveClean) alcoveClean.style.height = '0%';
                activePhase = 'finishing';
            }
        }

        // 4. Update & Render Particles (Underwater Air Bubble vs In-Air Droplet)
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];

            // Motion physics
            const dx = magnetX - p.x;
            const dy = magnetY - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 8 || p.y <= magnetY + 2) {
                // Absorbed into magnet node
                particles.splice(i, 1);
                continue;
            }

            const forceX = (dx / dist) * 0.09;
            const forceY = - 0.22; // Upward pull

            p.vx = p.vx * 0.94 + forceX;
            p.vy = p.vy * 0.94 + forceY;

            p.x += p.vx;
            p.y += p.vy;

            // Check Surface Crossing (Underwater -> In Air)
            if (!p.emerged && p.y <= surfaceY) {
                p.emerged = true;
                // Deduct volume at exact moment droplet breaks out of surface!
                if (p.type === 'trouble') {
                    remainingTroubleVol = Math.max(0, remainingTroubleVol - troubleVolPerParticle);
                } else {
                    remainingCleanVol = Math.max(0, remainingCleanVol - cleanVolPerParticle);
                }
            }

            // RENDER PARTICLE ACCORDING TO STATE
            ctx.save();

            if (!p.emerged) {
                // =========================================================
                // STATE 1: BULLE D'AIR SOUS L'EAU (Underwater Air Bubble - Image 1 Left)
                // Translucent sphere with silvery glass outline & highlight arc
                // =========================================================
                ctx.shadowColor = 'rgba(255, 255, 255, 0.4)';
                ctx.shadowBlur = 3;

                // Translucent bubble body
                ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fill();

                // Silvery glowing glass rim outline
                ctx.strokeStyle = (p.type === 'trouble') ? 'rgba(254, 243, 199, 0.85)' : 'rgba(224, 242, 254, 0.85)';
                ctx.lineWidth = 0.8;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.stroke();

                // Inner Specular Crescent Reflection Arc
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
                ctx.lineWidth = 0.6;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius * 0.65, Math.PI * 1.1, Math.PI * 1.7);
                ctx.stroke();
            } else {
                // =========================================================
                // STATE 2: GOUTTE D'EAU EN DEHORS DE L'EAU (In-Air Droplet - Image 1 Right)
                // Rich 3D glossy liquid bead with radial gradient & highlight
                // =========================================================
                ctx.shadowColor = p.glowColor;
                ctx.shadowBlur = 5;

                const grad = ctx.createRadialGradient(
                    p.x - p.radius * 0.3, p.y - p.radius * 0.3, p.radius * 0.1,
                    p.x, p.y, p.radius
                );

                if (p.type === 'trouble') {
                    grad.addColorStop(0, '#fef3c7');
                    grad.addColorStop(0.4, '#f59e0b');
                    grad.addColorStop(1, '#92400e');
                } else {
                    grad.addColorStop(0, '#ffffff');
                    grad.addColorStop(0.3, '#7dd3fc');
                    grad.addColorStop(1, '#0288d1');
                }

                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fill();

                // Specular Highlight Spot
                ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                ctx.beginPath();
                ctx.arc(p.x - p.radius * 0.25, p.y - p.radius * 0.25, p.radius * 0.3, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        }

        // 5. Sequence Completion
        if (activePhase === 'finishing' && particles.length === 0) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (magnetRing) magnetRing.className = 'magnetic-attractor-ring';
            if (onComplete) onComplete();
            return;
        }

        alcoveCanvasAnimId = requestAnimationFrame(animate);
    }

    alcoveCanvasAnimId = requestAnimationFrame(animate);
}

function startIrrigationProcess(glassData) {
    if (isIrrigationRunning || !glassData || glassData.hasData === false) return;
    isIrrigationRunning = true;

    const outTrouble = document.getElementById('output-water-trouble');
    const outClean = document.getElementById('output-water-clean');
    const headerEl = document.getElementById('analysis-readout-header');

    const cleanVol = glassData.cleanVol || 0;
    const troubleVol = glassData.troubleVol || 0;
    const totalVol = cleanVol + troubleVol;
    const maxCapacity = 24.0;
    const maxFillPct = 82;

    let cleanPct = 0;
    let troublePct = 0;

    if (totalVol > 0) {
        cleanPct = Math.min(maxFillPct, Math.round((cleanVol / maxCapacity) * maxFillPct));
        troublePct = Math.min(maxFillPct - cleanPct, Math.round((troubleVol / maxCapacity) * maxFillPct));
    }

    // Reset output container water levels
    if (outTrouble) outTrouble.style.height = '0%';
    if (outClean) outClean.style.height = '0%';

    if (headerEl) headerEl.textContent = "ATTRACTION MAGNÉTIQUE...";

    // Run Magnetic Suction Particle Canvas animation!
    runMagneticSuctionAnimation(glassData, () => {
        if (headerEl) headerEl.textContent = "TRANSFERT EN COURS...";

        // PHASE D: Fill Output Container — Trouble water arrives first
        setTimeout(() => {
            if (headerEl) headerEl.textContent = "REMPLISSAGE SORTIE...";
            if (outTrouble && troublePct > 0) {
                outTrouble.classList.add('filling');
                outTrouble.style.height = `${troublePct}%`;
            }
        }, 800);

        // PHASE E: Fill Output Container — Clean water pours on top
        setTimeout(() => {
            if (outClean && cleanPct > 0) {
                outClean.classList.add('filling');
                outClean.style.height = `${cleanPct}%`;
            }
        }, 2000);

        // PHASE F: Complete Irrigation Sequence
        setTimeout(() => {
            isIrrigationRunning = false;
            if (headerEl) headerEl.textContent = "IRRIGATION FINIE ✓";
            showToast(`Irrigation terminée ! Verre du ${glassData.dayName} d'irrigation traité.`, 'success');
        }, 3200);
    });
}

function triggerMachineProcessAnimation() {
    if (!machinePowerActive) {
        alert("Veuillez d'abord sous-tensionner la machine d'irrigation !");
        return;
    }

    const steps = ['step-analyse', 'step-repartition', 'step-traitement', 'step-terminee'];
    let idx = 0;

    const interval = setInterval(() => {
        steps.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('active');
        });

        if (idx < steps.length) {
            const curEl = document.getElementById(steps[idx]);
            if (curEl) curEl.classList.add('active');
            idx++;
        } else {
            clearInterval(interval);
            const analyseEl = document.getElementById('step-analyse');
            if (analyseEl) analyseEl.classList.add('active');
        }
    }, 600);
}

// ═══════════════════════════════════════════════════
// SUIVIE — Nouvelle page de contrôle parental
// ═══════════════════════════════════════════════════

(function initSuivie() {
    const form = document.getElementById('suivie-main-form');
    if (!form) return;

    // 1. HORLOGES LIVE & DATE MAROC
    function updateClocks() {
        const now = new Date();
        // Nanjing = UTC+8, Agadir = UTC+1
        const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
        
        const chinaDate = new Date(utcMs + (8 * 3600000));
        const moroccoDate = new Date(utcMs + (1 * 3600000));

        const cHours = String(chinaDate.getHours()).padStart(2, '0');
        const cMins = String(chinaDate.getMinutes()).padStart(2, '0');
        const mHours = String(moroccoDate.getHours()).padStart(2, '0');
        const mMins = String(moroccoDate.getMinutes()).padStart(2, '0');

        const elChina = document.getElementById('su-time-nanjing');
        const elAgadir = document.getElementById('su-time-agadir');
        if (elChina) elChina.textContent = `${cHours}:${cMins}`;
        if (elAgadir) elAgadir.textContent = `${mHours}:${mMins}`;

        // Date en français selon l'heure du Maroc (ex: Lundi 28 Septembre 2026)
        const elDate = document.getElementById('su-date-fr');
        if (elDate) {
            const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
            let dateStr = moroccoDate.toLocaleDateString('fr-FR', options);
            // Capitaliser la première lettre
            dateStr = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
            elDate.textContent = dateStr;
        }
    }
    updateClocks();
    setInterval(updateClocks, 10000);

    // 2. CALCUL AUTOMATIQUE DURÉE DU SOMMEIL
    const inputCoucher = document.getElementById('su-sleep-coucher');
    const inputReveil = document.getElementById('su-sleep-reveil');
    const elDuree = document.getElementById('su-sleep-duree');

    function calcSleepDuration() {
        if (!inputCoucher || !inputReveil || !elDuree) return;
        const [hC, mC] = inputCoucher.value.split(':').map(Number);
        const [hR, mR] = inputReveil.value.split(':').map(Number);

        if (isNaN(hC) || isNaN(hR)) return;

        let coucherMinutes = hC * 60 + mC;
        let reveilMinutes = hR * 60 + mR;

        // Si l'heure de réveil est plus petite, cela veut dire qu'on a dépassé minuit
        if (reveilMinutes <= coucherMinutes) {
            reveilMinutes += 24 * 60;
        }

        const diffMinutes = reveilMinutes - coucherMinutes;
        const hours = Math.floor(diffMinutes / 60);
        const mins = diffMinutes % 60;

        elDuree.textContent = `${hours}h ${String(mins).padStart(2, '0')}m`;
    }
    if (inputCoucher) inputCoucher.addEventListener('change', calcSleepDuration);
    if (inputReveil) inputReveil.addEventListener('change', calcSleepDuration);
    calcSleepDuration();

    // 3. REPAS DYNAMIQUES
    const repasContainer = document.getElementById('su-repas-container');
    const btnAddRepas = document.getElementById('btn-add-repas');
    const REPAS_TYPES = ['Petit-déjeuner', 'Déjeuner', 'Dîner', 'Collation', 'Autre'];

    function createRepasRow(typeVal = 'Petit-déjeuner', descVal = '') {
        const row = document.createElement('div');
        row.className = 'su-repas-row';
        row.style.cssText = 'display: flex; gap: 10px; align-items: flex-start; background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0;';

        const select = document.createElement('select');
        select.className = 'su-repas-type';
        select.style.cssText = 'padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem; background: #fff; width: 140px;';
        REPAS_TYPES.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            if (t === typeVal) opt.selected = true;
            select.appendChild(opt);
        });

        const inputDesc = document.createElement('input');
        inputDesc.type = 'text';
        inputDesc.className = 'su-repas-desc';
        inputDesc.placeholder = 'Qu\'as-tu mangé ? (ex: Riz, poulet, jus...)';
        inputDesc.value = descVal;
        inputDesc.style.cssText = 'flex: 1; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem;';

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.className = 'su-repas-photo';
        fileInput.accept = 'image/*';
        fileInput.style.cssText = 'width: 160px; font-size: 0.75rem;';

        const btnRemove = document.createElement('button');
        btnRemove.type = 'button';
        btnRemove.innerHTML = '🗑️';
        btnRemove.style.cssText = 'background: transparent; border: none; cursor: pointer; font-size: 1rem; padding: 6px;';
        btnRemove.title = 'Supprimer ce repas';
        btnRemove.addEventListener('click', () => row.remove());

        row.appendChild(select);
        row.appendChild(inputDesc);
        row.appendChild(fileInput);
        row.appendChild(btnRemove);

        return row;
    }

    if (btnAddRepas && repasContainer) {
        btnAddRepas.addEventListener('click', () => {
            repasContainer.appendChild(createRepasRow('Autre', ''));
        });
    }

    // Default 3 repas on fresh start
    function initDefaultRepas() {
        if (!repasContainer) return;
        repasContainer.innerHTML = '';
        repasContainer.appendChild(createRepasRow('Petit-déjeuner', ''));
        repasContainer.appendChild(createRepasRow('Déjeuner', ''));
        repasContainer.appendChild(createRepasRow('Dîner', ''));
    }

    // 4. ACTIVITÉS SPORTIVES DYNAMIQUES & SUGGESTIONS
    const sportsContainer = document.getElementById('su-sports-container');
    const btnAddSport = document.getElementById('btn-add-sport');

    function createSportRow(nomVal = 'Course à pied', kmVal = '', descVal = '') {
        const row = document.createElement('div');
        row.className = 'su-sport-row';
        row.style.cssText = 'display: flex; gap: 10px; align-items: flex-start; background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; flex-wrap: wrap;';

        const inputNom = document.createElement('input');
        inputNom.type = 'text';
        inputNom.className = 'su-sport-nom';
        inputNom.setAttribute('list', 'sport-suggestions-list');
        inputNom.placeholder = 'Activité (ex: Course à pied, Musculation...)';
        inputNom.value = nomVal;
        inputNom.style.cssText = 'flex: 1; min-width: 160px; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem;';

        const inputKm = document.createElement('input');
        inputKm.type = 'number';
        inputKm.step = '0.1';
        inputKm.min = '0';
        inputKm.className = 'su-sport-km';
        inputKm.placeholder = 'Distance (km)';
        inputKm.value = kmVal;
        inputKm.style.cssText = 'width: 110px; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem;';

        const inputDesc = document.createElement('input');
        inputDesc.type = 'text';
        inputDesc.className = 'su-sport-desc';
        inputDesc.placeholder = 'Précisions (ex: 45 min, bonne cadence...)';
        inputDesc.value = descVal;
        inputDesc.style.cssText = 'flex: 1; min-width: 160px; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem;';

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.className = 'su-sport-photo';
        fileInput.accept = 'image/*';
        fileInput.style.cssText = 'width: 160px; font-size: 0.75rem;';

        const btnRemove = document.createElement('button');
        btnRemove.type = 'button';
        btnRemove.innerHTML = '🗑️';
        btnRemove.style.cssText = 'background: transparent; border: none; cursor: pointer; font-size: 1rem; padding: 6px;';
        btnRemove.title = 'Supprimer cette activité';
        btnRemove.addEventListener('click', () => row.remove());

        row.appendChild(inputNom);
        row.appendChild(inputKm);
        row.appendChild(inputDesc);
        row.appendChild(fileInput);
        row.appendChild(btnRemove);

        return row;
    }

    if (btnAddSport && sportsContainer) {
        btnAddSport.addEventListener('click', () => {
            sportsContainer.appendChild(createSportRow('', '', ''));
        });
    }

    function initDefaultSports() {
        if (!sportsContainer) return;
        sportsContainer.innerHTML = '';
        sportsContainer.appendChild(createSportRow('Course à pied', '', ''));
    }

    // 5. BUDGET STATUS CALCULATOR
    const inputPrevu = document.getElementById('su-budget-prevu');
    const inputDepense = document.getElementById('su-budget-depense');
    const elBudgetStatut = document.getElementById('su-budget-statut');

    function calcBudgetStatus() {
        if (!inputPrevu || !inputDepense || !elBudgetStatut) return;
        const prevu = parseFloat(inputPrevu.value);
        const depense = parseFloat(inputDepense.value);

        if (isNaN(prevu) || isNaN(depense)) {
            elBudgetStatut.textContent = 'Remplissez les montants ci-dessus pour calculer le résultat.';
            elBudgetStatut.style.background = '#f8fafc';
            elBudgetStatut.style.color = '#475569';
            return;
        }

        const diff = prevu - depense;
        if (diff > 0) {
            elBudgetStatut.textContent = `💚 Économisé : ${diff.toFixed(2)} ¥ par rapport au budget prévu !`;
            elBudgetStatut.style.background = '#f0fdf4';
            elBudgetStatut.style.color = '#166534';
        } else if (diff === 0) {
            elBudgetStatut.textContent = '✅ Budget respecté pile poils !';
            elBudgetStatut.style.background = '#eff6ff';
            elBudgetStatut.style.color = '#1e40af';
        } else {
            elBudgetStatut.textContent = `⚠️ Dépassé de ${Math.abs(diff).toFixed(2)} ¥ !`;
            elBudgetStatut.style.background = '#fef2f2';
            elBudgetStatut.style.color = '#991b1b';
        }
    }
    if (inputPrevu) inputPrevu.addEventListener('input', calcBudgetStatus);
    if (inputDepense) inputDepense.addEventListener('input', calcBudgetStatus);

    // 6. ÉTUDES & NOTES DYNAMIQUES (Calcul automatique Note sur 100 -> sur 20)
    const notesContainer = document.getElementById('su-notes-container');
    const btnAddNote = document.getElementById('btn-add-note');
    const EXAM_TYPES = ['TP', 'TD', 'Projet', 'Examen partiel', 'Examen final', 'Quiz', 'Devoir maison', 'Autre'];

    function createNoteRow(matiere = '', typeExam = 'TP', noteVal100 = '') {
        const row = document.createElement('div');
        row.className = 'su-note-row';
        row.style.cssText = 'display: flex; gap: 10px; align-items: center; background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0; flex-wrap: wrap;';

        const inputMat = document.createElement('input');
        inputMat.type = 'text';
        inputMat.className = 'su-note-mat';
        inputMat.placeholder = 'Matière (ex: Chimie, Math...)';
        inputMat.value = matiere;
        inputMat.style.cssText = 'flex: 1; min-width: 140px; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem;';

        const selectType = document.createElement('select');
        selectType.className = 'su-note-type';
        selectType.style.cssText = 'padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem; background: #fff; width: 130px;';
        EXAM_TYPES.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            if (t === typeExam) opt.selected = true;
            selectType.appendChild(opt);
        });

        const inputNote100 = document.createElement('input');
        inputNote100.type = 'number';
        inputNote100.className = 'su-note-val100';
        inputNote100.placeholder = 'Note /100';
        inputNote100.value = noteVal100;
        inputNote100.min = '0';
        inputNote100.max = '100';
        inputNote100.step = '0.5';
        inputNote100.style.cssText = 'width: 95px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem;';

        const spanCalc = document.createElement('div');
        spanCalc.className = 'su-note-calc';
        spanCalc.style.cssText = 'font-size: 0.85rem; font-weight: 700; color: #2563eb; min-width: 80px;';
        
        function updateCalcSur20() {
            const val = parseFloat(inputNote100.value);
            if (!isNaN(val)) {
                const sur20 = (val / 5).toFixed(1);
                spanCalc.textContent = `➜ ${sur20} / 20`;
            } else {
                spanCalc.textContent = `➜ -- / 20`;
            }
        }
        inputNote100.addEventListener('input', updateCalcSur20);
        updateCalcSur20();

        const btnRemove = document.createElement('button');
        btnRemove.type = 'button';
        btnRemove.innerHTML = '🗑️';
        btnRemove.style.cssText = 'background: transparent; border: none; cursor: pointer; font-size: 1rem; padding: 6px;';
        btnRemove.title = 'Supprimer cette note';
        btnRemove.addEventListener('click', () => row.remove());

        row.appendChild(inputMat);
        row.appendChild(selectType);
        row.appendChild(inputNote100);
        row.appendChild(spanCalc);
        row.appendChild(btnRemove);

        return row;
    }

    if (btnAddNote && notesContainer) {
        btnAddNote.addEventListener('click', () => {
            notesContainer.appendChild(createNoteRow('', 'TP', ''));
        });
    }

    // 7. PRE-FILL FROM LOCALSTORAGE OR DEFAULTS
    const phoneInputEl = document.getElementById('su-whatsapp-phone');
    const savedPhone = localStorage.getItem('suivieWhatsAppPhone');
    if (phoneInputEl && savedPhone) {
        phoneInputEl.value = savedPhone;
    }

    const saved = localStorage.getItem('suivieNewPayload');
    if (saved) {
        try {
            const p = JSON.parse(saved);
            if (p.sommeil) {
                if (inputCoucher && p.sommeil.coucher) inputCoucher.value = p.sommeil.coucher;
                if (inputReveil && p.sommeil.reveil) inputReveil.value = p.sommeil.reveil;
                calcSleepDuration();
            }
            if (p.repas && Array.isArray(p.repas) && p.repas.length > 0) {
                repasContainer.innerHTML = '';
                p.repas.forEach(r => repasContainer.appendChild(createRepasRow(r.nom, r.desc)));
            } else {
                initDefaultRepas();
            }
            if (p.sports && Array.isArray(p.sports) && p.sports.length > 0) {
                sportsContainer.innerHTML = '';
                p.sports.forEach(s => sportsContainer.appendChild(createSportRow(s.nom, s.km, s.desc)));
            } else {
                initDefaultSports();
            }
            if (p.budget) {
                if (inputPrevu && p.budget.prevu !== undefined) inputPrevu.value = p.budget.prevu;
                if (inputDepense && p.budget.depense !== undefined) inputDepense.value = p.budget.depense;
                calcBudgetStatus();
            }
            if (p.notes && Array.isArray(p.notes)) {
                notesContainer.innerHTML = '';
                p.notes.forEach(n => notesContainer.appendChild(createNoteRow(n.matiere, n.type, n.note)));
            }
            if (p._ts) {
                const lastUpEl = document.getElementById('su-last-update');
                const lastUpTime = document.getElementById('su-last-update-time');
                if (lastUpEl && lastUpTime) {
                    lastUpTime.textContent = new Date(p._ts).toLocaleString('fr-FR');
                    lastUpEl.style.display = 'block';
                }
            }
        } catch (e) {
            initDefaultRepas();
            initDefaultSports();
        }
    } else {
        initDefaultRepas();
        initDefaultSports();
    }

    // 8. SUBMIT HANDLER
    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        const dateFrEl = document.getElementById('su-date-fr');
        const dateFr = dateFrEl ? dateFrEl.textContent : '';

        // Sommeil
        const sommeil = {
            coucher: inputCoucher ? inputCoucher.value : '',
            reveil: inputReveil ? inputReveil.value : '',
            duree: elDuree ? elDuree.textContent : ''
        };

        // Repas
        const repas = [];
        const repasRows = document.querySelectorAll('.su-repas-row');
        repasRows.forEach(row => {
            const type = row.querySelector('.su-repas-type').value;
            const desc = row.querySelector('.su-repas-desc').value;
            repas.push({ nom: type, desc });
        });

        // Sports (Multiple activities)
        const sports = [];
        const sportRows = document.querySelectorAll('.su-sport-row');
        sportRows.forEach(row => {
            const nom = row.querySelector('.su-sport-nom').value;
            const km = row.querySelector('.su-sport-km').value;
            const desc = row.querySelector('.su-sport-desc').value;
            if (nom.trim() || desc.trim() || km.trim()) {
                sports.push({ nom, km, desc });
            }
        });

        // Budget
        const budget = {
            prevu: parseFloat(inputPrevu?.value || 0),
            depense: parseFloat(inputDepense?.value || 0)
        };

        // Notes / Examens
        const notes = [];
        const noteRows = document.querySelectorAll('.su-note-row');
        noteRows.forEach(row => {
            const matiere = row.querySelector('.su-note-mat').value;
            const type = row.querySelector('.su-note-type').value;
            const note = row.querySelector('.su-note-val100').value;
            if (matiere.trim() || note.trim()) {
                notes.push({ matiere, type, note });
            }
        });

        const payload = {
            date_fr: dateFr,
            sommeil,
            repas,
            sports,
            budget,
            notes
        };

        // FormData pour envoyer les images si présentes
        const formData = new FormData();
        formData.append('data', JSON.stringify(payload));

        // Images repas
        repasRows.forEach((row, idx) => {
            const fileIn = row.querySelector('.su-repas-photo');
            if (fileIn && fileIn.files.length > 0) {
                formData.append(`photo_repas_${idx}`, fileIn.files[0]);
            }
        });

        // Images sports
        sportRows.forEach((row, idx) => {
            const fileIn = row.querySelector('.su-sport-photo');
            if (fileIn && fileIn.files.length > 0) {
                formData.append(`photo_sport_${idx}`, fileIn.files[0]);
            }
        });

        const btn = document.getElementById('su-submit-btn');
        const resultEl = document.getElementById('su-result');

        btn.disabled = true;
        btn.style.opacity = '0.7';
        resultEl.style.color = '#64748b';
        resultEl.textContent = '⏳ Envoi du rapport vers Notion...';

        try {
            const res = await fetch('/api/suivie/submit', {
                method: 'POST',
                body: formData
            });
            const resData = await res.json();

            if (resData.ok) {
                resultEl.style.color = '#16a34a';
                resultEl.textContent = '✅ Rapport envoyé à tes parents avec succès sur Notion !';

                // Sauvegarder dans localStorage
                const toStore = { ...payload, _ts: new Date().toISOString() };
                localStorage.setItem('suivieNewPayload', JSON.stringify(toStore));

                const lastUpEl = document.getElementById('su-last-update');
                const lastUpTime = document.getElementById('su-last-update-time');
                if (lastUpEl && lastUpTime) {
                    lastUpTime.textContent = new Date().toLocaleString('fr-FR');
                    lastUpEl.style.display = 'block';
                }

                // Notification WhatsApp
                const phoneInput = document.getElementById('su-whatsapp-phone');
                const enableWA = document.getElementById('su-whatsapp-enable')?.checked;
                const phoneVal = phoneInput ? phoneInput.value.trim() : '';

                if (phoneVal) {
                    localStorage.setItem('suivieWhatsAppPhone', phoneVal);
                }

                const waTemplateInput = document.getElementById('su-whatsapp-msg-template');
                if (waTemplateInput) {
                    localStorage.setItem('suivieWaMsgTemplate', waTemplateInput.value);
                }

                if (enableWA && phoneVal) {
                    const cleanPhone = phoneVal.replace(/[^0-9]/g, '');
                    const customMsg = waTemplateInput ? waTemplateInput.value : '';
                    const defaultMsg = `Bonjour Papa/Maman ! 📢\n\nJe viens de mettre à jour mon rapport quotidien pour la journée du *${dateFr}*.\n\nTu peux consulter l'intégralité de mes nouvelles, mon sommeil, mes repas et mon budget ici :\nhttps://www.notion.so/2337b78bada180e08944c25e95553f5f\n\nBonne journée ! ❤️`;
                    const finalMsg = customMsg.trim() || defaultMsg;
                    const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(finalMsg)}`;
                    setTimeout(() => {
                        window.open(waUrl, '_blank');
                    }, 600);
                }
            } else {
                resultEl.style.color = '#dc2626';
                resultEl.textContent = '❌ Erreur lors de l\'envoi vers Notion.';
            }
        } catch (err) {
            resultEl.style.color = '#dc2626';
            resultEl.textContent = '❌ Impossible de contacter le serveur.';
            console.error('[Suivie] Erreur fetch:', err);
        } finally {
            btn.disabled = false;
            btn.style.opacity = '1';
            setTimeout(() => { resultEl.textContent = ''; }, 6000);
        }
    });

    // 9. INITIALISATION DU TEMPLATE WHATSAPP DU RAPPORT QUOTIDIEN
    const waTemplateInput = document.getElementById('su-whatsapp-msg-template');
    if (waTemplateInput) {
        const savedWaTpl = localStorage.getItem('suivieWaMsgTemplate');
        if (savedWaTpl) {
            waTemplateInput.value = savedWaTpl;
        } else {
            const dateFrEl = document.getElementById('su-date-fr');
            const dFr = dateFrEl ? dateFrEl.textContent : 'Aujourd\'hui';
            waTemplateInput.value = `Bonjour Papa/Maman ! 📢\n\nJe viens de mettre à jour mon rapport quotidien pour la journée du *${dFr}*.\n\nTu peux consulter l'intégralité de mes nouvelles, mon sommeil, mes repas et mon budget ici :\nhttps://www.notion.so/2337b78bada180e08944c25e95553f5f\n\nBonne journée ! ❤️`;
        }
    }

    // 10. MODALE ET GESTION DES SOUVENIRS / VOYAGES
    const modalSouvenir = document.getElementById('modal-souvenir');
    const btnOpenSouvenir = document.getElementById('btn-open-souvenir-modal');
    const btnCloseSouvenir = document.getElementById('btn-close-souvenir-modal');
    const btnCancelSouvenir = document.getElementById('btn-cancel-souvenir');
    const formSouvenir = document.getElementById('form-souvenir-modal');

    const inputSouvenirTitre = document.getElementById('souvenir-titre');
    const inputSouvenirDate = document.getElementById('souvenir-date');
    const inputSouvenirHistoire = document.getElementById('souvenir-histoire');
    const inputSouvenirPhotos = document.getElementById('souvenir-photos');
    const inputSouvenirWaMsg = document.getElementById('souvenir-wa-msg');
    const resultSouvenirEl = document.getElementById('souvenir-result');

    function updateSouvenirWaTemplate() {
        if (!inputSouvenirWaMsg) return;
        const titre = inputSouvenirTitre ? inputSouvenirTitre.value.trim() : 'Souvenir';
        const defaultTpl = `Bonjour Papa/Maman ! ✈️✨\n\nJe viens de partager un nouveau souvenir / voyage (*${titre || 'Moment spécial'}*) dans notre section Voyages & Moments !\n\nViens découvrir les photos et mon récit ici :\nhttps://www.notion.so/2337b78bada180e08944c25e95553f5f\n\nGrosses bises ! ❤️`;
        const savedTpl = localStorage.getItem('souvenirWaMsgTemplate');
        if (savedTpl && !inputSouvenirTitre.value) {
            inputSouvenirWaMsg.value = savedTpl;
        } else {
            inputSouvenirWaMsg.value = defaultTpl;
        }
    }

    if (inputSouvenirTitre) {
        inputSouvenirTitre.addEventListener('input', updateSouvenirWaTemplate);
    }

    function openSouvenirModal() {
        const modal = document.getElementById('modal-souvenir') || modalSouvenir;
        if (!modal) return;
        modal.style.setProperty('display', 'flex', 'important');
        // Préremplir la date avec aujourd'hui par défaut
        const inputDate = document.getElementById('souvenir-date') || inputSouvenirDate;
        if (inputDate && !inputDate.value) {
            const dateFrEl = document.getElementById('su-date-fr');
            if (dateFrEl) inputDate.value = dateFrEl.textContent;
        }
        updateSouvenirWaTemplate();
    }

    function closeSouvenirModal() {
        const modal = document.getElementById('modal-souvenir') || modalSouvenir;
        if (!modal) return;
        modal.style.setProperty('display', 'none', 'important');
        const resEl = document.getElementById('souvenir-result') || resultSouvenirEl;
        if (resEl) resEl.textContent = '';
    }

    window.openSouvenirModal = openSouvenirModal;
    window.closeSouvenirModal = closeSouvenirModal;

    if (btnOpenSouvenir) btnOpenSouvenir.addEventListener('click', openSouvenirModal);
    if (btnCloseSouvenir) btnCloseSouvenir.addEventListener('click', closeSouvenirModal);
    if (btnCancelSouvenir) btnCancelSouvenir.addEventListener('click', closeSouvenirModal);

    // Écouteur global par délégation pour garantir l'ouverture même si le DOM change
    document.addEventListener('click', function(e) {
        const btnOpen = e.target.closest('#btn-open-souvenir-modal');
        if (btnOpen) {
            e.preventDefault();
            openSouvenirModal();
        }
        const btnClose = e.target.closest('#btn-close-souvenir-modal, #btn-cancel-souvenir');
        if (btnClose) {
            e.preventDefault();
            closeSouvenirModal();
        }
    });

    if (formSouvenir) {
        formSouvenir.addEventListener('submit', async function (e) {
            e.preventDefault();

            const titre = inputSouvenirTitre.value.trim();
            const dateVal = inputSouvenirDate.value.trim();
            const histoire = inputSouvenirHistoire.value.trim();

            if (!titre) return;

            const btnSubmit = document.getElementById('btn-submit-souvenir');
            btnSubmit.disabled = true;
            btnSubmit.style.opacity = '0.7';
            resultSouvenirEl.style.color = '#2563eb';
            resultSouvenirEl.textContent = '⏳ Publication du souvenir vers Notion...';

            const payload = { titre, date: dateVal, histoire };
            const formData = new FormData();
            formData.append('data', JSON.stringify(payload));

            // Ajouter les photos sélectionnées
            if (inputSouvenirPhotos && inputSouvenirPhotos.files.length > 0) {
                for (let i = 0; i < inputSouvenirPhotos.files.length; i++) {
                    formData.append(`photo_${i}`, inputSouvenirPhotos.files[i]);
                }
            }

            try {
                const res = await fetch('/api/suivie/souvenir', {
                    method: 'POST',
                    body: formData
                });
                const resData = await res.json();

                if (resData.ok) {
                    resultSouvenirEl.style.color = '#16a34a';
                    resultSouvenirEl.textContent = '✅ Souvenir ajouté avec succès sur Notion !';

                    // Sauvegarder le message WhatsApp s'il est modifié
                    if (inputSouvenirWaMsg) {
                        localStorage.setItem('souvenirWaMsgTemplate', inputSouvenirWaMsg.value);
                    }

                    // Notification WhatsApp
                    const phoneInput = document.getElementById('su-whatsapp-phone');
                    const enableWA = document.getElementById('su-whatsapp-enable')?.checked;
                    const phoneVal = phoneInput ? phoneInput.value.trim() : '';

                    if (enableWA && phoneVal) {
                        const cleanPhone = phoneVal.replace(/[^0-9]/g, '');
                        const waMsg = inputSouvenirWaMsg.value.trim();
                        const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(waMsg)}`;
                        setTimeout(() => {
                            window.open(waUrl, '_blank');
                        }, 600);
                    }

                    setTimeout(() => {
                        closeSouvenirModal();
                        formSouvenir.reset();
                    }, 1800);
                } else {
                    resultSouvenirEl.style.color = '#dc2626';
                    resultSouvenirEl.textContent = '❌ Erreur lors de l\'ajout du souvenir sur Notion.';
                }
            } catch (err) {
                resultSouvenirEl.style.color = '#dc2626';
                resultSouvenirEl.textContent = '❌ Impossible de contacter le serveur.';
                console.error('[Souvenir] Erreur fetch:', err);
            } finally {
                btnSubmit.disabled = false;
                btnSubmit.style.opacity = '1';
            }
        });
    }

    // 11. INLINE VOYAGES & SOUVENIRS CARD HANDLERS
    const btnTypeMoment = document.getElementById('btn-type-moment');
    const btnTypeVoyage = document.getElementById('btn-type-voyage');
    const formMoment = document.getElementById('form-inline-moment');
    const formVoyage = document.getElementById('form-inline-voyage');

    if (btnTypeMoment && btnTypeVoyage && formMoment && formVoyage) {
        btnTypeMoment.addEventListener('click', () => {
            btnTypeMoment.style.background = '#2563eb';
            btnTypeMoment.style.color = '#fff';
            btnTypeVoyage.style.background = 'transparent';
            btnTypeVoyage.style.color = '#64748b';
            formMoment.style.display = 'flex';
            formVoyage.style.display = 'none';
        });

        btnTypeVoyage.addEventListener('click', () => {
            btnTypeVoyage.style.background = '#059669';
            btnTypeVoyage.style.color = '#fff';
            btnTypeMoment.style.background = 'transparent';
            btnTypeMoment.style.color = '#64748b';
            formVoyage.style.display = 'flex';
            formMoment.style.display = 'none';
        });
    }

    // Préremplir la date du moment par défaut
    const momentDateInput = document.getElementById('moment-date');
    if (momentDateInput) {
        const dateFrEl = document.getElementById('su-date-fr');
        if (dateFrEl) momentDateInput.value = dateFrEl.textContent;
    }

    // Template WhatsApp Moment
    const momentWaMsgInput = document.getElementById('moment-wa-msg');
    const momentTitreInput = document.getElementById('moment-titre');
    function updateMomentWaMsg() {
        if (!momentWaMsgInput) return;
        const titre = momentTitreInput ? momentTitreInput.value.trim() : 'Moment spécial';
        momentWaMsgInput.value = `Bonjour Papa/Maman ! 📸✨\n\nJe viens de partager un nouveau souvenir (*${titre || 'Moment spécial'}*) sur notre page Notion !\n\nViens le découvrir ici :\nhttps://www.notion.so/2337b78bada180e08944c25e95553f5f\n\nGrosses bises ! ❤️`;
    }
    if (momentTitreInput) momentTitreInput.addEventListener('input', updateMomentWaMsg);
    updateMomentWaMsg();

    // Soumission Formulaire Moment Inline
    if (formMoment) {
        formMoment.addEventListener('submit', async function(e) {
            e.preventDefault();
            const titre = momentTitreInput.value.trim();
            const dateVal = momentDateInput ? momentDateInput.value.trim() : '';
            const histoire = document.getElementById('moment-desc').value;
            const resEl = document.getElementById('moment-result');
            const btnSub = document.getElementById('btn-submit-moment');

            if (!titre) return;

            btnSub.disabled = true;
            btnSub.style.opacity = '0.7';
            resEl.style.color = '#2563eb';
            resEl.textContent = '⏳ Publication du moment vers Notion...';

            const payload = { titre, date: dateVal, histoire };
            const formData = new FormData();
            formData.append('data', JSON.stringify(payload));

            const fileIn = document.getElementById('moment-photos');
            if (fileIn && fileIn.files.length > 0) {
                for (let i = 0; i < fileIn.files.length; i++) {
                    formData.append(`photo_${i}`, fileIn.files[i]);
                }
            }

            try {
                const res = await fetch('/api/suivie/souvenir', { method: 'POST', body: formData });
                const resData = await res.json();
                if (resData.ok) {
                    resEl.style.color = '#16a34a';
                    resEl.textContent = '✅ Moment publié avec succès sur Notion !';

                    const phoneVal = document.getElementById('su-whatsapp-phone')?.value.trim();
                    const enableWA = document.getElementById('su-whatsapp-enable')?.checked;
                    if (enableWA && phoneVal) {
                        const cleanPhone = phoneVal.replace(/[^0-9]/g, '');
                        const waMsg = momentWaMsgInput ? momentWaMsgInput.value.trim() : '';
                        const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(waMsg)}`;
                        setTimeout(() => window.open(waUrl, '_blank'), 600);
                    }
                    setTimeout(() => { formMoment.reset(); updateMomentWaMsg(); resEl.textContent = ''; }, 2500);
                } else {
                    resEl.style.color = '#dc2626';
                    resEl.textContent = '❌ Erreur lors de la publication.';
                }
            } catch (err) {
                resEl.style.color = '#dc2626';
                resEl.textContent = '❌ Reconnexion au serveur...';
            } finally {
                btnSub.disabled = false;
                btnSub.style.opacity = '1';
            }
        });
    }

    // --- STATE MACHINE & PERSISTANCE DU VOYAGE EN DIRECT ---
    const VOYAGE_STORAGE_KEY = 'voyage_direct_active_state';

    function getActiveVoyageState() {
        try {
            const raw = localStorage.getItem(VOYAGE_STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function setActiveVoyageState(stateObj) {
        if (!stateObj) {
            localStorage.removeItem(VOYAGE_STORAGE_KEY);
        } else {
            localStorage.setItem(VOYAGE_STORAGE_KEY, JSON.stringify(stateObj));
        }
        updateVoyageUIFromState();
    }

    function updateVoyageUIFromState() {
        const activeState = getActiveVoyageState();
        const bannerEl = document.getElementById('voyage-active-banner');
        const activeTitleEl = document.getElementById('voyage-active-title');
        const activeDatesEl = document.getElementById('voyage-active-dates');
        const fieldsGroup = document.getElementById('voyage-fields-group');
        const publishedSection = document.getElementById('voyage-published-section');
        const publishedListEl = document.getElementById('voyage-published-etapes-list');
        const recapNotice = document.getElementById('voyage-recap-blocked-notice');
        const radioDirect = document.getElementById('radio-mode-direct');
        const radioRecap = document.getElementById('radio-mode-recap');
        const btnSubmitVoyage = document.getElementById('btn-submit-voyage');
        const etapesTitle = document.getElementById('voyage-etapes-title');

        const voyageTitreInput = document.getElementById('voyage-titre');
        const voyageDatesInput = document.getElementById('voyage-dates');

        if (activeState && activeState.active) {
            // Un voyage en direct est actuellement en cours !
            if (bannerEl) {
                bannerEl.style.display = 'flex';
                if (activeTitleEl) activeTitleEl.textContent = activeState.titre || 'Voyage en cours';
                if (activeDatesEl) activeDatesEl.textContent = `Débuté le ${activeState.created_at || 'récemment'} · ${activeState.dates || ''}`;
            }

            // Lock titre & dates
            if (voyageTitreInput) { voyageTitreInput.value = activeState.titre; voyageTitreInput.disabled = true; }
            if (voyageDatesInput) { voyageDatesInput.value = activeState.dates; voyageDatesInput.disabled = true; }

            // Empêcher la publication d'un carnet récapitulatif
            if (radioRecap) radioRecap.disabled = true;
            if (radioDirect) radioDirect.checked = true;

            // Afficher l'historique des étapes déjà publiées
            if (publishedSection && publishedListEl) {
                publishedSection.style.display = 'block';
                publishedListEl.innerHTML = '';
                const etapes = activeState.etapes || [];
                if (etapes.length === 0) {
                    publishedListEl.innerHTML = '<div style="font-size: 0.82rem; color: #64748b; italic">Aucune étape publiée pour le moment.</div>';
                } else {
                    etapes.forEach((et, idx) => {
                        const card = document.createElement('div');
                        card.style.cssText = 'background: #ffffff; border: 1px solid #e0f2fe; border-radius: 8px; padding: 10px 12px; font-size: 0.85rem;';
                        card.innerHTML = `
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <strong style="color: #0369a1;">📌 ${et.nom}</strong>
                                <span style="background: #dcfce7; color: #15803d; font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 10px;">✅ Publié le ${et.published_at}</span>
                            </div>
                            ${et.desc ? `<div style="color: #334155; margin-top: 4px; font-style: italic; white-space: pre-wrap;">"${et.desc}"</div>` : ''}
                            ${et.photos_count ? `<div style="color: #0284c7; font-size: 0.78rem; margin-top: 4px; font-weight: 600;">📷 ${et.photos_count} photo(s) sur Notion</div>` : ''}
                        `;
                        publishedListEl.appendChild(card);
                    });
                }
            }

            if (etapesTitle) etapesTitle.textContent = '➕ Ajouter une nouvelle Étape au voyage en cours';
            if (btnSubmitVoyage) btnSubmitVoyage.innerHTML = '🚀 Publier cette Étape sur Notion';

        } else {
            // Aucun voyage en cours
            if (bannerEl) bannerEl.style.display = 'none';
            if (publishedSection) publishedSection.style.display = 'none';
            if (recapNotice) recapNotice.style.display = 'none';

            if (voyageTitreInput) voyageTitreInput.disabled = false;
            if (voyageDatesInput) voyageDatesInput.disabled = false;
            if (radioRecap) radioRecap.disabled = false;

            if (etapesTitle) etapesTitle.textContent = '📌 Étapes du Voyage';
            if (btnSubmitVoyage) btnSubmitVoyage.innerHTML = '📤 Lancer / Publier le Voyage sur Notion';
        }
    }

    // Gestion clic "Clôturer le voyage active"
    const btnCloseActiveVoyage = document.getElementById('btn-close-voyage-active');
    if (btnCloseActiveVoyage) {
        btnCloseActiveVoyage.addEventListener('click', async function() {
            const activeState = getActiveVoyageState();
            if (!activeState) return;

            if (!confirm(`Es-tu sûr de vouloir clôturer et terminer le voyage "${activeState.titre}" ?\n\nLe statut du voyage repassera en ✅ VOYAGE TERMINÉ sur Notion.`)) {
                return;
            }

            btnCloseActiveVoyage.disabled = true;
            btnCloseActiveVoyage.textContent = '⏳ Clôture en cours...';

            const payload = {
                titre: activeState.titre,
                dates: activeState.dates,
                mode: 'close',
                etapes: [{ nom: '🏁 Clôture du Voyage', desc: `Ce voyage est officiellement clôturé. Merci d'avoir suivi nos aventures !` }]
            };

            try {
                const formData = new FormData();
                formData.append('data', JSON.stringify(payload));
                await fetch('/api/suivie/voyage', { method: 'POST', body: formData });
            } catch (err) {
                console.error('[Voyage Close] Erreur:', err);
            }

            setActiveVoyageState(null);
            alert(`✅ Le voyage "${activeState.titre}" a été clôturé avec succès !`);
            location.reload();
        });
    }

    // Avertissement si clic sur Récapitulatif quand un voyage est actif
    const radioRecap = document.getElementById('radio-mode-recap');
    if (radioRecap) {
        radioRecap.addEventListener('change', function() {
            const activeState = getActiveVoyageState();
            const notice = document.getElementById('voyage-recap-blocked-notice');
            if (activeState && activeState.active) {
                if (notice) notice.style.display = 'block';
                document.getElementById('radio-mode-direct').checked = true;
            } else {
                if (notice) notice.style.display = 'none';
            }
        });
    }

    // --- ÉTAPES DYNAMIQUES DU VOYAGE ---
    const voyageEtapesContainer = document.getElementById('voyage-etapes-container');
    const btnAddVoyageEtape = document.getElementById('btn-add-voyage-etape');

    function createVoyageEtapeRow(nomVal = '', descVal = '') {
        const idx = voyageEtapesContainer ? voyageEtapesContainer.children.length + 1 : 1;
        const row = document.createElement('div');
        row.className = 'voyage-etape-row';
        row.style.cssText = 'background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 10px;';

        const topDiv = document.createElement('div');
        topDiv.style.cssText = 'display: flex; gap: 10px; align-items: center;';

        const inputNom = document.createElement('input');
        inputNom.type = 'text';
        inputNom.className = 'etape-nom';
        inputNom.placeholder = `Nom de l'étape / du jour (ex: Jour ${idx} — Arrivée & Cité Interdite)`;
        inputNom.value = nomVal;
        inputNom.style.cssText = 'flex: 1; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.88rem; font-weight: 600;';

        const btnRemove = document.createElement('button');
        btnRemove.type = 'button';
        btnRemove.innerHTML = '🗑️';
        btnRemove.style.cssText = 'background: transparent; border: none; cursor: pointer; font-size: 1rem; padding: 4px;';
        btnRemove.title = 'Supprimer cette étape';
        btnRemove.addEventListener('click', () => row.remove());

        topDiv.appendChild(inputNom);
        topDiv.appendChild(btnRemove);

        const textareaDesc = document.createElement('textarea');
        textareaDesc.className = 'etape-desc';
        textareaDesc.rows = 3;
        textareaDesc.placeholder = 'Récit et détails de cette étape... (Tu peux faire plusieurs paragraphes et retours à la ligne !)';
        textareaDesc.value = descVal;
        textareaDesc.style.cssText = 'width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem; font-family: inherit; resize: vertical; line-height: 1.4;';

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.className = 'etape-photos';
        fileInput.accept = 'image/*';
        fileInput.multiple = true;
        fileInput.style.cssText = 'font-size: 0.8rem;';

        row.appendChild(topDiv);
        row.appendChild(textareaDesc);
        row.appendChild(fileInput);

        return row;
    }

    if (btnAddVoyageEtape && voyageEtapesContainer) {
        btnAddVoyageEtape.addEventListener('click', () => {
            voyageEtapesContainer.appendChild(createVoyageEtapeRow('', ''));
        });
    }

    if (voyageEtapesContainer && voyageEtapesContainer.children.length === 0) {
        voyageEtapesContainer.appendChild(createVoyageEtapeRow('Jour 1 — Arrivée & Découverte', ''));
    }

    // Template WhatsApp Voyage
    const voyageWaMsgInput = document.getElementById('voyage-wa-msg');
    const voyageTitreInput = document.getElementById('voyage-titre');
    function updateVoyageWaMsg() {
        if (!voyageWaMsgInput) return;
        const titre = voyageTitreInput ? voyageTitreInput.value.trim() : 'Voyage';
        voyageWaMsgInput.value = `Bonjour Papa/Maman ! ✈️🌟\n\nJe viens de publier la mise à jour de notre voyage (*${titre || 'Voyage'}*) sur notre page Notion !\n\nViens suivre les étapes et les photos ici :\nhttps://www.notion.so/2337b78bada180e08944c25e95553f5f\n\nGrosses bises ! ❤️`;
    }
    if (voyageTitreInput) voyageTitreInput.addEventListener('input', updateVoyageWaMsg);
    updateVoyageWaMsg();

    // Soumission Formulaire Voyage Inline
    if (formVoyage) {
        formVoyage.addEventListener('submit', async function(e) {
            e.preventDefault();
            const titre = voyageTitreInput.value.trim();
            const datesVal = document.getElementById('voyage-dates').value.trim();
            const modeVal = document.querySelector('input[name="voyage_mode"]:checked')?.value || 'direct';
            const resEl = document.getElementById('voyage-result');
            const btnSub = document.getElementById('btn-submit-voyage');

            if (!titre) return;

            const etapes = [];
            const etapeRows = document.querySelectorAll('.voyage-etape-row');
            etapeRows.forEach(row => {
                const nom = row.querySelector('.etape-nom').value;
                const desc = row.querySelector('.etape-desc').value;
                if (nom.trim() || desc.trim()) {
                    etapes.push({ nom, desc });
                }
            });

            btnSub.disabled = true;
            btnSub.style.opacity = '0.7';
            resEl.style.color = '#059669';
            resEl.textContent = '⏳ Publication du voyage vers Notion...';

            const payload = { titre, dates: datesVal, mode: modeVal, etapes };
            const formData = new FormData();
            formData.append('data', JSON.stringify(payload));

            let totalPhotos = 0;
            etapeRows.forEach((row, idx) => {
                const fileIn = row.querySelector('.etape-photos');
                if (fileIn && fileIn.files.length > 0) {
                    totalPhotos += fileIn.files.length;
                    for (let f = 0; f < fileIn.files.length; f++) {
                        formData.append(`photo_etape_${idx}_${f}`, fileIn.files[f]);
                    }
                }
            });

            try {
                const res = await fetch('/api/suivie/voyage', { method: 'POST', body: formData });
                const resData = await res.json();
                if (resData.ok) {
                    resEl.style.color = '#16a34a';
                    resEl.textContent = '✅ Étape / Voyage publié avec succès sur Notion !';

                    // Si c'est un voyage en direct, enregistrer/mettre à jour l'état persistant !
                    if (modeVal === 'direct') {
                        let currentState = getActiveVoyageState() || {
                            active: true,
                            titre: titre,
                            dates: datesVal,
                            created_at: new Date().toLocaleDateString('fr-FR'),
                            etapes: []
                        };

                        // Ajouter les nouvelles étapes à l'historique enregistré !
                        const nowStr = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                        etapes.forEach(et => {
                            currentState.etapes.push({
                                nom: et.nom,
                                desc: et.desc,
                                photos_count: totalPhotos,
                                published_at: nowStr,
                                published: true
                            });
                        });

                        setActiveVoyageState(currentState);
                    }

                    const phoneVal = document.getElementById('su-whatsapp-phone')?.value.trim();
                    const enableWA = document.getElementById('su-whatsapp-enable')?.checked;
                    if (enableWA && phoneVal) {
                        const cleanPhone = phoneVal.replace(/[^0-9]/g, '');
                        const waMsg = voyageWaMsgInput ? voyageWaMsgInput.value.trim() : '';
                        const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(waMsg)}`;
                        setTimeout(() => window.open(waUrl, '_blank'), 600);
                    }

                    setTimeout(() => {
                        // Vider les rangées d'étapes saisies et réinitialiser
                        if (voyageEtapesContainer) voyageEtapesContainer.innerHTML = '';
                        if (voyageEtapesContainer) voyageEtapesContainer.appendChild(createVoyageEtapeRow('', ''));
                        updateVoyageWaMsg();
                        resEl.textContent = '';
                        updateVoyageUIFromState();
                    }, 2200);

                } else {
                    resEl.style.color = '#dc2626';
                    resEl.textContent = '❌ Erreur lors de la publication.';
                }
            } catch (err) {
                resEl.style.color = '#dc2626';
                resEl.textContent = '❌ Reconnexion au serveur...';
            } finally {
                btnSub.disabled = false;
                btnSub.style.opacity = '1';
            }
        });
    }

    // Initialisation au chargement de la page
    updateVoyageUIFromState();

})();


