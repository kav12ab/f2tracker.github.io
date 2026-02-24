/* app.js */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, collection, updateDoc, query, where, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- 1. CONFIGURATION & STATE ---
const appId = 'final-2-tracker';
const firebaseConfig = {
    apiKey: "AIzaSyCngsxpFhGfDECSFEleMue7VXn5I80ZK3Q",
    authDomain: "final-2-tracker.firebaseapp.com",
    projectId: "final-2-tracker",
    storageBucket: "final-2-tracker.firebasestorage.app",
    messagingSenderId: "302346338582",
    appId: "1:302346338582:web:e858525c35c27b0ee5d037",
    measurementId: "G-B9M4FZSMY9"
};
const initialAuthToken = null;
const COLLECTION_PATH = `artifacts/${appId}/public/data/car_tracker_vins`;
const CONFIG_DOC_PATH = `artifacts/${appId}/public/data/app_config/main`; 

// Default Config 
const DEFAULT_AREAS = ["GT M600", "SUV M600", "CP6B", "Rattle", "Test", "Road Test", "CP7", "Monsoon", "Paint", "ECVF", "V900"];
const DEFAULT_NWA = ["Car Park", "Repair Bay", "Offsite"];
const DEFAULT_MODELS = ["Continental GT", "Flying Spur", "Bentayga", "Bacalar"];
const DEFAULT_ROUTING = {
    "GT M600": ["CP6B", "Rattle"], "SUV M600": ["Rattle"], "CP6B": ["Rattle"], "Rattle": ["Test"],
    "Test": ["Road Test"], "Road Test": ["CP7", "Monsoon"], "CP7": ["V900"], "Monsoon": ["Paint"],
    "Paint": ["ECVF"], "ECVF": ["V900"], "V900": []
};
let ukBankHolidays = [];

// State
let db;
let auth;
let userId = null;
let allCars = [];
let carsByArea = {};
let carsByTemp = {}; // Map of NWA -> [cars] AND VisitorZone -> [cars] (if visitorHost logic used)
let carsByPostWip = {}; // Map for Post WIP zones
let stats = { today: {}, week: {}, historyDaily: {}, historyWeekly: {} };
let currentUserRole = null; 
let managerViewMode = 'day';
let selectedModelsFilter = null;
let appConfig = { 
    areas: [...DEFAULT_AREAS], 
    routing: {...DEFAULT_ROUTING}, 
    nonWorkingAreas: [...DEFAULT_NWA], 
    statuses: {}, 
    tempRoutes: {}, 
    models: [...DEFAULT_MODELS], 
    allowedAddZones: [],
    postWipEnabledZones: [],
    postWipZones: [],
    maxWip: {},
    passwords: { "Admin": "f2trackeradmin" },
    shutdownPeriods: [] // NEW: Aging car exclusion periods
};

// --- 2. DOM ELEMENTS ---
const navAging = document.getElementById('nav-aging');
const viewAging = document.getElementById('view-aging');
const loginScreen = document.getElementById('login-screen');
const loginRoleSelect = document.getElementById('login-role-select');
const loginStatus = document.getElementById('login-status');
const mainApp = document.getElementById('main-app');
const userRoleDisplay = document.getElementById('user-role-display');
const navDashboard = document.getElementById('nav-dashboard');
const navTrack = document.getElementById('nav-track');
const navSettings = document.getElementById('nav-settings');

const areaSelect = document.getElementById('area-select');
const vinInput = document.getElementById('vin-input');
const scanButton = document.getElementById('scan-button');
const messageBox = document.getElementById('message-box');
const wipContainer = document.getElementById('wip-container');
const wipTitle = document.getElementById('wip-title');
const nonWorkingContainer = document.getElementById('non-working-container');
const nonWorkingGrid = document.getElementById('non-working-grid');
const addCarSection = document.getElementById('add-car-section');
const postWipDashboard = document.getElementById('post-wip-dashboard');
const postWipCounts = document.getElementById('post-wip-counts');
const postWipTableBody = document.getElementById('post-wip-table-body');
const navAnalytics = document.getElementById('nav-analytics');
const analyticsDailyTpDate = document.getElementById('analytics-daily-tp-date');
const analyticsHistStart = document.getElementById('analytics-hist-start');
const analyticsHistEnd = document.getElementById('analytics-hist-end');
const analyticsWipDate = document.getElementById('analytics-wip-date');
const analyticsPostWipDate = document.getElementById('analytics-post-wip-date');
const analyticsReworkStart = document.getElementById('analytics-rework-start');
const analyticsReworkEnd = document.getElementById('analytics-rework-end');
const analyticsTrendStart = document.getElementById('analytics-trend-start');
const analyticsTrendEnd = document.getElementById('analytics-trend-end');

// Metrics
const metricsTitle = document.getElementById('metrics-title');
const managerToggleContainer = document.getElementById('manager-toggle-container');
const zoneThroughputDisplay = document.getElementById('zone-throughput-display');
const managerThroughputDisplay = document.getElementById('manager-throughput-display');
const zoneMetricToday = document.getElementById('zone-metric-today');
const zoneMetricWeek = document.getElementById('zone-metric-week');
const throughputMetricsGrid = document.getElementById('throughput-metrics-grid');
const postWipMetricsGrid = document.getElementById('post-wip-metrics-grid');
const historyTableTitle = document.getElementById('history-table-title');
const historyTableHeader = document.getElementById('history-table-header');
const historyTableBody = document.getElementById('history-table-body');
const btnViewDay = document.getElementById('btn-view-day');
const btnViewWeek = document.getElementById('btn-view-week');
const wipSummaryGrid = document.getElementById('wip-summary-grid');
const postWipSummaryGrid = document.getElementById('post-wip-summary-grid');
const postWipBoardContainer = document.getElementById('post-wip-board-container');
const postWipPots = document.getElementById('post-wip-pots');


// Settings Elements
const newAreaNameInput = document.getElementById('new-area-name');
const newNWANameInput = document.getElementById('new-nwa-name');
const newPostWipNameInput = document.getElementById('new-postwip-name');
const newModelNameInput = document.getElementById('new-model-name');
const routingEditorContainer = document.getElementById('routing-editor-container');
const nwaEditorContainer = document.getElementById('nwa-editor-container');
const postWipEditorContainer = document.getElementById('postwip-editor-container');
const modelEditorContainer = document.getElementById('model-editor-container');

// Modals
const confirmModal = document.getElementById('confirm-modal');
const confirmVin = document.getElementById('confirm-vin');
const confirmTarget = document.getElementById('confirm-target-select'); 
const confirmVa = document.getElementById('confirm-va');
const confirmNva = document.getElementById('confirm-nva');
const confirmComment = document.getElementById('confirm-comment');
const btnConfirmMove = document.getElementById('btn-confirm-move');
const moveModalTitle = document.getElementById('move-modal-title');

const areaDetailsModal = document.getElementById('area-details-modal');
const areaModalTitle = document.getElementById('area-modal-title');
const areaModalContent = document.getElementById('area-modal-content');
const zoneListModal = document.getElementById('zone-list-modal');
const zoneListTitle = document.getElementById('zone-list-title');
const zoneListContent = document.getElementById('zone-list-content');
const zoneListSearch = document.getElementById('zone-list-search');
const historyModal = document.getElementById('history-modal');
const modalVinTitle = document.getElementById('modal-vin-title');
const modalCarModel = document.getElementById('modal-car-model');
const modalCarKenn = document.getElementById('modal-car-kenn');
const modalCarYear = document.getElementById('modal-car-year');
const modalCarSeq = document.getElementById('modal-car-seq');
const modalExternalLinks = document.getElementById('modal-external-links');
const historyContent = document.getElementById('history-content');
const trackVinInput = document.getElementById('track-vin-input');
const trackResult = document.getElementById('track-result');
const addCarModal = document.getElementById('add-car-modal');
const addCarModelSelect = document.getElementById('add-car-model');
const addCarAreaSelect = document.getElementById('add-car-area');
const addCarAreaContainer = document.getElementById('add-car-area-container');
const postWipListModal = document.getElementById('post-wip-list-modal');
const postWipListTitle = document.getElementById('post-wip-list-title');
const postWipListContent = document.getElementById('post-wip-list-content');
const postWipListSearch = document.getElementById('post-wip-list-search');


// --- 3. CONFIGURATION LOGIC ---

const loadConfiguration = async () => {
    try {
        const configRef = doc(db, CONFIG_DOC_PATH);
        const docSnap = await getDoc(configRef);
        if (docSnap.exists()) {
            const saved = docSnap.data();
            appConfig = { 
                ...appConfig, 
                ...saved,
                models: saved.models || [...DEFAULT_MODELS],
                allowedAddZones: saved.allowedAddZones || [],
                postWipEnabledZones: saved.postWipEnabledZones || [],
                postWipZones: saved.postWipZones || [],
                maxWip: saved.maxWip || {},
                passwords: saved.passwords || { "Admin": "f2trackeradmin" },
		shutdownPeriods: saved.shutdownPeriods || []
            };
        } else {
            await setDoc(configRef, appConfig);
        }
        populateLoginSelect();
        if(currentUserRole && !document.getElementById('view-settings').classList.contains('hidden')) {
            renderSettings();
        }
        if(currentUserRole) {
            // Re-render views if role is active
            if (currentUserRole === 'PostWIPManager') {
                renderPostWipDashboard();
            } else {
                renderWIPBoard();
            }
            renderThroughputMetrics();
            renderNonWorkingAreas();
            checkAddPermission();
        }
    } catch (e) {
        console.error("Config Load Error", e);
        populateLoginSelect();
    }
};

window.saveConfiguration = async () => {
    try {
        const configRef = doc(db, CONFIG_DOC_PATH);
        await updateDoc(configRef, appConfig);
        alert("Settings saved successfully!");
        loadConfiguration(); 
    } catch (e) {
        alert("Error saving settings: " + e.message);
        console.error(e);
    }
};

// --- 4. SETTINGS UI LOGIC ---

window.addShutdownPeriod = () => {
    const name = document.getElementById('shutdown-name').value.trim();
    const start = document.getElementById('shutdown-start').value;
    const end = document.getElementById('shutdown-end').value;
    if(!name || !start || !end) return alert("Fill all fields");
    if(start > end) return alert("Start date must be before end date");
    
    if(!appConfig.shutdownPeriods) appConfig.shutdownPeriods = [];
    appConfig.shutdownPeriods.push({ name, start, end });
    renderSettings();
    document.getElementById('shutdown-name').value = '';
    document.getElementById('shutdown-start').value = '';
    document.getElementById('shutdown-end').value = '';
};

window.removeShutdownPeriod = (idx) => {
    appConfig.shutdownPeriods.splice(idx, 1);
    renderSettings();
};

window.addNewArea = async () => {
    const name = newAreaNameInput.value.trim();
    if (!name) return alert("Please enter a name");
    if (appConfig.areas.includes(name)) return alert("Area already exists");
    appConfig.areas.push(name);
    appConfig.routing[name] = []; 
    renderSettings();
    newAreaNameInput.value = "";
};

window.addNewNWA = async () => {
    const name = newNWANameInput.value.trim();
    if (!name) return alert("Please enter a name");
    if (appConfig.nonWorkingAreas.includes(name)) return alert("Area already exists");
    appConfig.nonWorkingAreas.push(name);
    renderSettings();
    newNWANameInput.value = "";
};

window.addNewPostWipZone = async () => {
    const name = newPostWipNameInput.value.trim();
    if (!name) return alert("Please enter a name");
    if ((appConfig.postWipZones || []).includes(name)) return alert("Zone already exists");
    if (!appConfig.postWipZones) appConfig.postWipZones = [];
    appConfig.postWipZones.push(name);
    renderSettings();
    newPostWipNameInput.value = "";
};

window.addNewModel = async () => {
     const name = newModelNameInput.value.trim();
     if (!name) return alert("Please enter a model name");
     if (appConfig.models.includes(name)) return alert("Model already exists");
     appConfig.models.push(name);
     renderSettings();
     newModelNameInput.value = "";
};

window.removeArea = async (areaName) => {
    if (!confirm(`Delete ${areaName}?`)) return;
    appConfig.areas = appConfig.areas.filter(a => a !== areaName);
    delete appConfig.routing[areaName];
    delete appConfig.statuses[areaName];
    if(appConfig.allowedAddZones) appConfig.allowedAddZones = appConfig.allowedAddZones.filter(a => a !== areaName);
    if(appConfig.postWipEnabledZones) appConfig.postWipEnabledZones = appConfig.postWipEnabledZones.filter(a => a !== areaName);
    renderSettings();
};

window.removeNWA = async (areaName) => {
    if (!confirm(`Delete ${areaName}?`)) return;
    appConfig.nonWorkingAreas = appConfig.nonWorkingAreas.filter(a => a !== areaName);
    renderSettings();
};

window.removePostWipZone = async (areaName) => {
    if (!confirm(`Delete ${areaName}?`)) return;
    appConfig.postWipZones = appConfig.postWipZones.filter(a => a !== areaName);
    renderSettings();
};

window.removeModel = async (modelName) => {
     if (!confirm(`Delete ${modelName}?`)) return;
     appConfig.models = appConfig.models.filter(m => m !== modelName);
     renderSettings();
};

window.moveArea = async (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= appConfig.areas.length) return; 
    const temp = appConfig.areas[index];
    appConfig.areas[index] = appConfig.areas[newIndex];
    appConfig.areas[newIndex] = temp;
    renderSettings();
};

window.updateRouting = async (sourceArea, destSelect) => {
    const dest = destSelect.value;
    if(!dest) return;
    if(!appConfig.routing[sourceArea]) appConfig.routing[sourceArea] = [];
    if(!appConfig.routing[sourceArea].includes(dest)) {
        appConfig.routing[sourceArea].push(dest);
        renderSettings();
    }
};

window.updateTempRoute = async (sourceArea, destSelect) => {
    const dest = destSelect.value;
    if(!dest) return;
    if(!appConfig.tempRoutes) appConfig.tempRoutes = {};
    if(!appConfig.tempRoutes[sourceArea]) appConfig.tempRoutes[sourceArea] = [];
    if(!appConfig.tempRoutes[sourceArea].includes(dest)) {
        appConfig.tempRoutes[sourceArea].push(dest);
        renderSettings();
    }
};

window.removeRoute = async (sourceArea, dest) => {
    if(!appConfig.routing[sourceArea]) return;
    appConfig.routing[sourceArea] = appConfig.routing[sourceArea].filter(d => d !== dest);
    renderSettings();
};

window.removeTempRoute = async (sourceArea, dest) => {
    if(!appConfig.tempRoutes || !appConfig.tempRoutes[sourceArea]) return;
    appConfig.tempRoutes[sourceArea] = appConfig.tempRoutes[sourceArea].filter(d => d !== dest);
    renderSettings();
};

window.toggleAddPermission = (area) => {
     if (!appConfig.allowedAddZones) appConfig.allowedAddZones = [];
     if (appConfig.allowedAddZones.includes(area)) {
         appConfig.allowedAddZones = appConfig.allowedAddZones.filter(a => a !== area);
     } else {
         appConfig.allowedAddZones.push(area);
     }
     renderSettings();
};

window.togglePostWipEnable = (area) => {
     if (!appConfig.postWipEnabledZones) appConfig.postWipEnabledZones = [];
     if (appConfig.postWipEnabledZones.includes(area)) {
         appConfig.postWipEnabledZones = appConfig.postWipEnabledZones.filter(a => a !== area);
     } else {
         appConfig.postWipEnabledZones.push(area);
     }
     renderSettings();
};

// Status Configuration
window.addStatus = (area) => {
    const input = document.getElementById(`new-status-${area}`);
    const val = input.value.trim();
    if(!val) return;
    if(!appConfig.statuses) appConfig.statuses = {};
    if(!appConfig.statuses[area]) appConfig.statuses[area] = [];
    if(!appConfig.statuses[area].includes(val)) {
        appConfig.statuses[area].push(val);
        renderSettings();
    }
};

window.removeStatus = (area, status) => {
    if(appConfig.statuses && appConfig.statuses[area]) {
        appConfig.statuses[area] = appConfig.statuses[area].filter(s => s !== status);
        renderSettings();
    }
};

window.updateMaxWip = (area, value) => {
    if (!appConfig.maxWip) appConfig.maxWip = {};
    appConfig.maxWip[area] = parseInt(value) || 0;
};

window.updatePassword = (role, value) => {
    if (!appConfig.passwords) appConfig.passwords = {};
    if (value.trim() === '') {
        delete appConfig.passwords[role]; // Remove password if blank
    } else {
        appConfig.passwords[role] = value.trim();
    }
};

window.renderSettings = () => {
    routingEditorContainer.innerHTML = '';
    appConfig.areas.forEach((area, index) => {
        const routes = appConfig.routing[area] || [];
        const tempRoutes = (appConfig.tempRoutes && appConfig.tempRoutes[area]) || [];
        const statuses = (appConfig.statuses && appConfig.statuses[area]) || [];
        const canAdd = (appConfig.allowedAddZones || []).includes(area);
        const postWipEnabled = (appConfig.postWipEnabledZones || []).includes(area);
        
        // Tags
        const routeTags = routes.map(dest => `<span class="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 mr-2">${dest}<button onclick="removeRoute('${area}', '${dest}')" class="ml-1 text-blue-600 font-bold">×</button></span>`).join('');
        const tempTags = tempRoutes.map(dest => `<span class="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800 mr-2">${dest}<button onclick="removeTempRoute('${area}', '${dest}')" class="ml-1 text-yellow-600 font-bold">×</button></span>`).join('');
        const statusTags = statuses.map(s => `<span class="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800 mr-2">${s}<button onclick="removeStatus('${area}', '${s}')" class="ml-1 text-green-600 font-bold">×</button></span>`).join('');

        // Options
        const routeOptions = `<option value="">+ Push To...</option>` + appConfig.areas.filter(a => a !== area && !routes.includes(a)).map(a => `<option value="${a}">${a}</option>`).join('');
        const allLocs = [...appConfig.areas, ...appConfig.nonWorkingAreas];
        const tempOptions = `<option value="">+ Temp Loc...</option>` + allLocs.filter(a => a !== area && !tempRoutes.includes(a)).map(a => `<option value="${a}">${a}</option>`).join('');

        const card = document.createElement('div');
        card.className = "bg-gray-50 p-4 rounded-lg border border-gray-200 flex flex-col gap-4 transition-all hover:bg-white hover:shadow-md";
        
        const upDisabled = index === 0 ? 'opacity-25 cursor-not-allowed' : 'hover:bg-gray-200 cursor-pointer text-indigo-600';
        const downDisabled = index === appConfig.areas.length - 1 ? 'opacity-25 cursor-not-allowed' : 'hover:bg-gray-200 cursor-pointer text-indigo-600';

        card.innerHTML = `
            <div class="flex justify-between items-center border-b pb-2">
                <div class="flex items-center gap-2">
                    <div class="flex flex-col gap-0">
                        <button onclick="moveArea(${index}, -1)" class="${upDisabled} text-xs">▲</button>
                        <button onclick="moveArea(${index}, 1)" class="${downDisabled} text-xs">▼</button>
                    </div>
                    <h4 class="font-bold text-lg text-gray-800">${area}</h4>
                    <div class="flex flex-col ml-4 gap-1">
                        <label class="inline-flex items-center cursor-pointer">
                            <input type="checkbox" onchange="toggleAddPermission('${area}')" class="form-checkbox h-4 w-4 text-indigo-600" ${canAdd ? 'checked' : ''}>
                            <span class="ml-2 text-xs text-gray-600 font-medium">Can Add Cars</span>
                        </label>
                        <label class="inline-flex items-center cursor-pointer">
                            <input type="checkbox" onchange="togglePostWipEnable('${area}')" class="form-checkbox h-4 w-4 text-purple-600" ${postWipEnabled ? 'checked' : ''}>
                            <span class="ml-2 text-xs text-purple-600 font-medium font-bold">Enable Post-WIP</span>
                        </label>
                    </div>
                </div>
                <button onclick="removeArea('${area}')" class="text-red-400 hover:text-red-600 text-xs underline">Delete Area</button>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
    		<div>
        		<label class="text-xs font-bold text-gray-500 block mb-1">Max WIP Limit</label>
        		<input type="number" min="0" value="${appConfig.maxWip && appConfig.maxWip[area] ? appConfig.maxWip[area] : 0}" onchange="updateMaxWip('${area}', this.value)" class="w-full text-xs border p-1 rounded focus:border-indigo-500">
   		</div>
    		<div>
        	    <label class="text-xs font-bold text-gray-500 block mb-1">Push Routing</label>
                    <div class="flex flex-wrap gap-1 mb-1 min-h-[20px]">${routeTags}</div>
                    <select onchange="updateRouting('${area}', this)" class="w-full text-xs border p-1 rounded">${routeOptions}</select>
                </div>
                
                <div>
                    <label class="text-xs font-bold text-gray-500 block mb-1">Temp Locations</label>
                    <div class="flex flex-wrap gap-1 mb-1 min-h-[20px]">${tempTags}</div>
                    <select onchange="updateTempRoute('${area}', this)" class="w-full text-xs border p-1 rounded">${tempOptions}</select>
                </div>

                <div>
                    <label class="text-xs font-bold text-gray-500 block mb-1">Strict Statuses</label>
                    <div class="flex flex-wrap gap-1 mb-1 min-h-[20px]">${statusTags}</div>
                    <div class="flex">
                        <input type="text" id="new-status-${area}" class="w-full text-xs border p-1 rounded-l" placeholder="Add status...">
                        <button onclick="addStatus('${area}')" class="bg-green-500 text-white px-2 rounded-r text-xs">+</button>
                    </div>
                </div>
            </div>
        `;
        routingEditorContainer.appendChild(card);
    });
    
    nwaEditorContainer.innerHTML = appConfig.nonWorkingAreas.map(n => `
        <div class="flex justify-between p-2 bg-gray-50 border rounded items-center">
            <span class="font-bold text-gray-700">${n}</span>
            <button onclick="removeNWA('${n}')" class="text-red-500 text-xs hover:text-red-700">Delete</button>
        </div>
    `).join('');

     postWipEditorContainer.innerHTML = (appConfig.postWipZones || []).map(p => `
        <div class="flex flex-col sm:flex-row justify-between p-3 bg-emerald-50 border border-emerald-200 rounded sm:items-center mb-3 gap-2">
            <span class="font-bold text-emerald-800 text-sm truncate">${p}</span>
            <div class="flex items-center justify-between sm:justify-end gap-3">
                <div class="flex items-center bg-white border border-emerald-200 rounded px-2 py-1 shadow-sm">
                    <label class="text-[10px] font-bold text-gray-500 uppercase tracking-wide mr-2 whitespace-nowrap">Max WIP</label>
                    <input type="number" min="0" value="${appConfig.maxWip && appConfig.maxWip[p] ? appConfig.maxWip[p] : 0}" onchange="updateMaxWip('${p}', this.value)" class="w-12 text-sm text-center border-none focus:ring-0 outline-none p-0 font-mono text-gray-700 bg-transparent">
                </div>
                <button onclick="removePostWipZone('${p}')" class="text-red-400 font-bold text-xs hover:text-red-600 transition uppercase">Delete</button>
            </div>
        </div>
    `).join('');

    modelEditorContainer.innerHTML = (appConfig.models || []).map(m => `
        <div class="flex justify-between p-2 bg-gray-50 border rounded items-center">
            <span class="font-bold text-gray-700">${m}</span>
            <button onclick="removeModel('${m}')" class="text-red-500 text-xs hover:text-red-700">Delete</button>
        </div>
    `).join('');

const allRoles = ['Admin', 'Manager', 'PostWIPManager', ...appConfig.areas];
    const pwdContainer = document.getElementById('passwords-editor-container');
    if(pwdContainer) {
        pwdContainer.innerHTML = allRoles.map(r => `
            <div class="flex justify-between p-3 bg-gray-50 border border-gray-200 rounded items-center shadow-sm">
                <span class="font-bold text-gray-700 text-sm truncate mr-2" title="${r}">${r}</span>
                <input type="text" placeholder="No password" value="${appConfig.passwords && appConfig.passwords[r] ? appConfig.passwords[r] : ''}" onchange="updatePassword('${r}', this.value)" class="w-32 text-xs border p-1.5 rounded focus:border-indigo-500 font-mono text-center">
            </div>
        `).join('');
    }

const shutdownContainer = document.getElementById('shutdown-editor-container');
    if(shutdownContainer) {
        shutdownContainer.innerHTML = (appConfig.shutdownPeriods || []).map((p, idx) => `
            <div class="flex justify-between p-3 bg-white border border-gray-200 rounded items-center shadow-sm">
                <div>
                    <span class="font-bold text-gray-700 text-sm truncate mr-2">${p.name}</span>
                    <span class="text-xs font-mono text-gray-500 bg-gray-100 px-1 rounded">${p.start} to ${p.end}</span>
                </div>
                <button onclick="removeShutdownPeriod(${idx})" class="text-red-400 hover:text-red-600 font-bold text-xs uppercase">Delete</button>
            </div>
        `).join('');
    }

    // --- NEW: POPULATE AUTO-FETCHED BANK HOLIDAYS ---
    const holidaysContainer = document.getElementById('bank-holidays-container');
    if(holidaysContainer) {
        if (ukBankHolidays && ukBankHolidays.length > 0) {
            holidaysContainer.innerHTML = ukBankHolidays.map(date => `
                <div class="bg-gray-50 border border-gray-200 rounded p-2 text-center shadow-sm">
                    <span class="text-sm font-mono font-bold text-indigo-700">${date}</span>
                </div>
            `).join('');
        } else {
            holidaysContainer.innerHTML = '<p class="text-sm text-gray-400 italic col-span-full">No bank holidays loaded yet.</p>';
        }
    }
};

// --- 5. APP LOGIC (Updated to use appConfig) ---

const fetchUKBankHolidays = async () => {
    try {
        const response = await fetch('https://www.gov.uk/bank-holidays.json');
        if (response.ok) {
            const data = await response.json();
            // Pull dates specifically for England and Wales (Crewe)
            ukBankHolidays = data['england-and-wales'].events.map(event => event.date);
        }
    } catch (error) {
        console.warn("Failed to fetch UK Bank Holidays from gov.uk. Aging calculation will only exclude weekends/shutdowns.");
    }
};

window.getAgingDetails = (car) => {
    if(!car.history || car.history.length === 0) return { status: 'normal', days: 0 };
    
    // Sort history to find true creation date
    const sortedHistory = [...car.history].sort((a,b) => (a.timestamp.toDate ? a.timestamp.toDate() : new Date(a.timestamp)) - (b.timestamp.toDate ? b.timestamp.toDate() : new Date(b.timestamp)));
    const createdDate = sortedHistory[0].timestamp.toDate ? sortedHistory[0].timestamp.toDate() : new Date(sortedHistory[0].timestamp);
    
    // If finished, stop aging at completion date. Otherwise use today.
    let endDate = new Date();
    if(car.status === 'Finished') {
        endDate = car.lastUpdated.toDate ? car.lastUpdated.toDate() : new Date(car.lastUpdated);
    }
    
    let current = new Date(createdDate);
    current.setHours(0,0,0,0);
    const end = new Date(endDate);
    end.setHours(0,0,0,0);
    
    let workingDays = 0;
    let safetyCounter = 0; // Prevent bad date infinite loops
    
    while(current < end && safetyCounter < 5000) {
        safetyCounter++;
        const day = current.getDay();
        const dateStr = current.toISOString().split('T')[0];
        
        let isShutdown = false;
        if(appConfig.shutdownPeriods) {
            isShutdown = appConfig.shutdownPeriods.some(p => dateStr >= p.start && dateStr <= p.end);
        }
        
        if(day !== 0 && day !== 6 && !ukBankHolidays.includes(dateStr) && !isShutdown) {
            workingDays++;
        }
        current.setDate(current.getDate() + 1);
    }
    
    let status = 'normal';
    if(workingDays >= 11 && workingDays <= 15) status = 'amber';
    if(workingDays >= 16) status = 'red';
    
    return { status, days: workingDays };
};

window.getAgingStyles = (agingStatus) => {
    if(agingStatus === 'red') return { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-300', badgeText: 'Aging Car: Red Status', headerBg: 'bg-rose-600', tableRow: 'bg-rose-50' };
    if(agingStatus === 'amber') return { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-400', badgeText: 'Aging Car: Amber Status', headerBg: 'bg-amber-500', tableRow: 'bg-amber-50/50' };
    return { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-100', badgeText: '', headerBg: 'bg-indigo-600', tableRow: 'hover:bg-gray-50' };
};

const getDates = () => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const d = new Date(now);
    const day = d.getDay();
    const diff = d.getDate() - day; 
    const weekStart = new Date(d.setDate(diff));
    weekStart.setHours(0,0,0,0);
    const oneJan = new Date(now.getFullYear(), 0, 1);
    const numberOfDays = Math.floor((now - oneJan) / (24 * 60 * 60 * 1000));
    const weekNum = Math.ceil((now.getDay() + 1 + numberOfDays) / 7);
    const weekStr = `${now.getFullYear()}-W${weekNum}`;
    return { today: todayStr, weekStart, weekStr };
};
const formatDateReadable = (isoDate) => {
    const d = new Date(isoDate);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });
};
const formatTimestamp = (ts) => ts ? new Date(ts.toDate ? ts.toDate() : ts).toLocaleString('en-US', {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : 'N/A';
const formatTimestampFull = (ts) => ts ? new Date(ts.toDate ? ts.toDate() : ts).toLocaleString('en-US', {weekday:'short',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : 'N/A';

const processSnapshotData = (snapshotDocs) => {
    // Restore functionality by filtering ALL documents here
    allCars = snapshotDocs.map(doc => doc.data());
    carsByArea = {}; carsByTemp = {}; carsByPostWip = {};
    stats = { today: {}, week: {}, historyDaily: {}, historyWeekly: {} };
    const { today, weekStart } = getDates();

    allCars.forEach(car => {
        // Logic 1: Official Location
        if (car.status === 'WIP') {
            if (!carsByArea[car.currentArea]) carsByArea[car.currentArea] = [];
            carsByArea[car.currentArea].push(car);
        }
        
        // Logic 2: Post-WIP
        if (car.status === 'Post-WIP') {
            const zone = car.currentArea; // In Post-WIP, currentArea is the Post WIP Zone name
            if(!carsByPostWip[zone]) carsByPostWip[zone] = [];
            carsByPostWip[zone].push(car);
        }
        
        // Logic 3: Temp Location
        if (car.tempLocation) {
             if(!carsByTemp[car.tempLocation]) carsByTemp[car.tempLocation] = [];
             carsByTemp[car.tempLocation].push(car);
        }
        
        if(car.visitorHost && car.tempLocation !== car.visitorHost) {
             if(!carsByTemp[car.visitorHost]) carsByTemp[car.visitorHost] = [];
             if(!carsByTemp[car.visitorHost].find(c => c.vin === car.vin)) {
                carsByTemp[car.visitorHost].push(car);
             }
        }

        // Logic 4: History Stats
        if (car.history) {
            car.history.forEach(h => {
                if (h.status === 'Finished') {
                    const date = h.timestamp.toDate ? h.timestamp.toDate() : new Date(h.timestamp);
                    const dateStr = date.toISOString().split('T')[0];
                    const d = new Date(date);
                    const dayNum = d.getDay();
                    const diff = d.getDate() - dayNum;
                    const ws = new Date(d.setDate(diff));
                    const weekKey = `${ws.getFullYear()}-W${Math.ceil((((ws - new Date(ws.getFullYear(),0,1))/86400000)+1)/7)}`;
                    const area = h.area;

                    if (!stats.historyDaily[dateStr]) stats.historyDaily[dateStr] = {};
                    stats.historyDaily[dateStr][area] = (stats.historyDaily[dateStr][area] || 0) + 1;
                    if (!stats.historyWeekly[weekKey]) stats.historyWeekly[weekKey] = {};
                    stats.historyWeekly[weekKey][area] = (stats.historyWeekly[weekKey][area] || 0) + 1;
                    if (dateStr === today) stats.today[area] = (stats.today[area] || 0) + 1;
                    if (date >= weekStart) stats.week[area] = (stats.week[area] || 0) + 1;
                }
            });
        }
    });
    if (currentUserRole) {
        if (currentUserRole === 'PostWIPManager') {
            renderPostWipDashboard();
        } else {
            renderWIPBoard();
        }
        renderThroughputMetrics();
        renderNonWorkingAreas();
        checkAddPermission();
    }
};

const populateLoginSelect = () => {
    loginRoleSelect.innerHTML = `
        <option value="Admin" class="font-bold text-indigo-700">System Admin (Configuration)</option>
        <option value="Manager" class="font-bold">Facility Manager (View Only)</option>
        <option value="PostWIPManager" class="font-bold text-emerald-700">Post-WIP Manager</option>
        <option disabled>──────────</option>
    `;
    if(appConfig.areas) {
        appConfig.areas.forEach(area => {
            const opt = document.createElement('option');
            opt.value = area;
            opt.textContent = area;
            loginRoleSelect.appendChild(opt);
        });
    }
};

window.handleLogin = () => {
    const role = loginRoleSelect.value;
    const pwdInput = document.getElementById('login-password');
    const enteredPwd = pwdInput.value;
    
    // Check if the selected role has a password set
    const requiredPwd = (appConfig.passwords && appConfig.passwords[role]) ? appConfig.passwords[role] : null;
    
    if (requiredPwd && enteredPwd !== requiredPwd) {
        alert(`Incorrect password for ${role}.`);
        return; // Stop login
    }
    
    pwdInput.value = ''; // Clear password field for security
    
    currentUserRole = role;
    loginScreen.classList.add('hidden');
    mainApp.classList.remove('hidden');
    
    if (currentUserRole === 'Admin') {
        userRoleDisplay.textContent = 'System Admin';
        userRoleDisplay.className = "px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold uppercase tracking-wide";
        navSettings.classList.remove('hidden');
        switchView('settings'); 
    } else if (currentUserRole === 'Manager') {
        userRoleDisplay.textContent = 'Facility Manager';
        userRoleDisplay.className = "px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold uppercase tracking-wide";
        navSettings.classList.add('hidden');
        switchView('dashboard');
    } else if (currentUserRole === 'PostWIPManager') {
        userRoleDisplay.textContent = 'Post-WIP Manager';
        userRoleDisplay.className = "px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold uppercase tracking-wide";
        navSettings.classList.add('hidden');
        switchView('dashboard'); // Reuse dashboard container but render different content
    } else {
        userRoleDisplay.textContent = `${currentUserRole} Zone`;
        userRoleDisplay.className = "px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold uppercase tracking-wide";
        navSettings.classList.add('hidden');
        switchView('dashboard');
    }
    
    checkAddPermission();
    // Initial render based on role
    if (currentUserRole === 'PostWIPManager') {
        renderPostWipDashboard();
    } else {
        renderWIPBoard();
    }
    renderThroughputMetrics();
    renderNonWorkingAreas();
};

window.handleLogout = () => {
    currentUserRole = null;
    mainApp.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    loginRoleSelect.value = 'Manager'; 
};

const checkAddPermission = () => {
    const hasPermission = currentUserRole === 'Admin' || currentUserRole === 'Manager' || (appConfig.allowedAddZones && appConfig.allowedAddZones.includes(currentUserRole));
    
    if (hasPermission) {
        addCarSection.classList.remove('hidden');
    } else {
        addCarSection.classList.add('hidden');
    }
};

window.setManagerView = (mode) => {
    managerViewMode = mode;
    if(mode === 'day') {
        btnViewDay.className = "px-3 py-1 rounded-md text-sm font-medium transition shadow-sm bg-white text-indigo-600";
        btnViewDay.classList.remove('text-gray-500');
        btnViewWeek.className = "px-3 py-1 rounded-md text-sm font-medium text-gray-500 hover:text-gray-700 transition";
    } else {
        btnViewWeek.className = "px-3 py-1 rounded-md text-sm font-medium transition shadow-sm bg-white text-indigo-600";
        btnViewWeek.classList.remove('text-gray-500');
        btnViewDay.className = "px-3 py-1 rounded-md text-sm font-medium text-gray-500 hover:text-gray-700 transition";
    }
    renderThroughputMetrics();
};

// NEW: Toggle filter state and force re-render
window.toggleThroughputModelFilter = (model) => {
    if (selectedModelsFilter.includes(model)) {
        selectedModelsFilter = selectedModelsFilter.filter(m => m !== model);
    } else {
        selectedModelsFilter.push(model);
    }
    // Prevent deselecting everything (force at least one model to be viewed)
    if (selectedModelsFilter.length === 0) selectedModelsFilter = [model];
    
    renderThroughputMetrics();
};

const renderThroughputMetrics = () => {
    if (currentUserRole === 'Manager' || currentUserRole === 'Admin') {
        managerToggleContainer.classList.remove('hidden');
        managerToggleContainer.classList.add('flex');
        zoneThroughputDisplay.classList.remove('grid');
        zoneThroughputDisplay.classList.add('hidden');
        managerThroughputDisplay.classList.remove('hidden');
        metricsTitle.textContent = "Facility Throughput";

        // --- 1. RENDER MODEL FILTERS ---
        const allModels = [...(appConfig.models || []), 'Unknown'];
        if (!selectedModelsFilter) selectedModelsFilter = [...allModels]; // Default select all

        const filterContainer = document.getElementById('throughput-model-filters');
        if (filterContainer) {
            filterContainer.innerHTML = allModels.map(m => `
                <label class="inline-flex items-center cursor-pointer bg-white px-3 py-1.5 rounded border ${selectedModelsFilter.includes(m) ? 'border-indigo-500 ring-1 ring-indigo-500 bg-indigo-50/30' : 'border-gray-200 hover:bg-gray-50'} transition">
                    <input type="checkbox" class="hidden" onchange="toggleThroughputModelFilter('${m}')" ${selectedModelsFilter.includes(m) ? 'checked' : ''}>
                    <div class="w-4 h-4 rounded border ${selectedModelsFilter.includes(m) ? 'bg-indigo-600 border-indigo-600 flex justify-center items-center' : 'bg-white border-gray-300'} mr-2">
                        ${selectedModelsFilter.includes(m) ? '<svg class="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>' : ''}
                    </div>
                    <span class="text-sm font-bold text-gray-700 truncate max-w-[120px]">${m}</span>
                </label>
            `).join('');
        }

        // --- 2. DYNAMICALLY RECALCULATE METRICS WITH FILTER ---
        const { today, weekStart } = getDates();
        let filteredToday = {};
        let filteredWeek = {};
        let filteredHistDaily = {};
        let filteredHistWeekly = {};
        let completedTotal = 0;
        let completedByModel = {};

        allCars.forEach(car => {
            const carModel = car.model || 'Unknown';
            if (!selectedModelsFilter.includes(carModel)) return; // Skip if model is unselected

            // Throughput History Tracking
            if (car.history) {
                car.history.forEach(h => {
                    if (h.status === 'Finished') {
                        const date = h.timestamp.toDate ? h.timestamp.toDate() : new Date(h.timestamp);
                        const dateStr = date.toISOString().split('T')[0];
                        const d = new Date(date);
                        const dayNum = d.getDay();
                        const diff = d.getDate() - dayNum;
                        const ws = new Date(d.setDate(diff));
                        const weekKey = `${ws.getFullYear()}-W${Math.ceil((((ws - new Date(ws.getFullYear(),0,1))/86400000)+1)/7)}`;
                        const area = h.area;

                        if (!filteredHistDaily[dateStr]) filteredHistDaily[dateStr] = {};
                        filteredHistDaily[dateStr][area] = (filteredHistDaily[dateStr][area] || 0) + 1;
                        
                        if (!filteredHistWeekly[weekKey]) filteredHistWeekly[weekKey] = {};
                        filteredHistWeekly[weekKey][area] = (filteredHistWeekly[weekKey][area] || 0) + 1;
                        
                        if (dateStr === today) filteredToday[area] = (filteredToday[area] || 0) + 1;
                        if (date >= weekStart) filteredWeek[area] = (filteredWeek[area] || 0) + 1;
                    }
                });
            }

            // System Completed (Fully Finished off the dashboard) Tracking
            if (car.status === 'Finished') {
                const finishDate = car.lastUpdated.toDate ? car.lastUpdated.toDate() : new Date(car.lastUpdated);
                const finishDateStr = finishDate.toISOString().split('T')[0];
                
                let isCompletedInPeriod = false;
                if (managerViewMode === 'day' && finishDateStr === today) isCompletedInPeriod = true;
                if (managerViewMode === 'week' && finishDate >= weekStart) isCompletedInPeriod = true;

                if (isCompletedInPeriod) {
                    completedTotal++;
                    completedByModel[carModel] = (completedByModel[carModel] || 0) + 1;
                }
            }
        });

        // --- 3. RENDER LIVE TODAY THROUGHPUT ---
        throughputMetricsGrid.innerHTML = '';
        const currentDataPool = managerViewMode === 'day' ? filteredToday : filteredWeek;
        appConfig.areas.forEach(area => {
            const count = currentDataPool[area] || 0;
            const card = document.createElement('div');
            card.className = 'bg-gray-50 p-3 rounded-lg border border-gray-200 text-center';
            card.innerHTML = `<p class="text-[10px] font-bold text-gray-400 uppercase truncate" title="${area}">${area}</p><p class="text-2xl font-bold text-indigo-600">${count}</p>`;
            throughputMetricsGrid.appendChild(card);
        });

        // --- 4. RENDER COMPLETED VEHICLES SECTION ---
        const completedTitlePeriod = document.getElementById('completed-title-period');
        if (completedTitlePeriod) {
            completedTitlePeriod.textContent = managerViewMode === 'day' ? 'Completed Vehicles (Today)' : 'Completed Vehicles (This Week)';
        }

        const completedMetricsGrid = document.getElementById('completed-metrics-grid');
        if (completedMetricsGrid) {
            completedMetricsGrid.innerHTML = '';
            
            // Total Box
            const totalCard = document.createElement('div');
            totalCard.className = 'bg-green-50 p-3 rounded-lg border border-green-200 text-center shadow-sm';
            totalCard.innerHTML = `<p class="text-[10px] font-bold text-green-600 uppercase truncate">Total Finished</p><p class="text-2xl font-bold text-green-700">${completedTotal}</p>`;
            completedMetricsGrid.appendChild(totalCard);

            // Print Individual Models (Only for actively selected models in the filter)
            selectedModelsFilter.forEach(m => {
                const count = completedByModel[m] || 0;
                const card = document.createElement('div');
                card.className = 'bg-gray-50 p-3 rounded-lg border border-gray-200 text-center shadow-sm';
                card.innerHTML = `<p class="text-[10px] font-bold text-gray-500 uppercase truncate" title="${m}">${m}</p><p class="text-2xl font-bold text-gray-700">${count}</p>`;
                completedMetricsGrid.appendChild(card);
            });
        }

        // --- 5. RENDER HISTORY TABLE ---
        historyTableTitle.textContent = managerViewMode === 'day' ? 'Daily History (Last 14 Days)' : 'Weekly History';
        historyTableHeader.innerHTML = '<th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">Period</th>';
        appConfig.areas.forEach(area => {
            const th = document.createElement('th');
            th.className = "px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider";
            th.textContent = area.replace(" ", "\u00A0"); 
            historyTableHeader.appendChild(th);
        });

        historyTableBody.innerHTML = '';
        const historyPool = managerViewMode === 'day' ? filteredHistDaily : filteredHistWeekly;
        const sortedKeys = Object.keys(historyPool).sort().reverse();
        const limit = managerViewMode === 'day' ? 14 : 8;
        
        sortedKeys.slice(0, limit).forEach(key => {
            const rowData = historyPool[key];
            const tr = document.createElement('tr');
            const tdLabel = document.createElement('td');
            tdLabel.className = "px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-white border-r text-center";
            tdLabel.textContent = managerViewMode === 'day' ? formatDateReadable(key) : `Week ${key.split('W')[1]}`;
            tr.appendChild(tdLabel);
            appConfig.areas.forEach(area => {
                const td = document.createElement('td');
                td.className = "px-2 py-2 whitespace-nowrap text-sm text-gray-500 text-center";
                const val = rowData[area] || 0;
                td.textContent = val;
                if(val > 0) td.classList.add('text-indigo-600', 'font-semibold', 'bg-indigo-50');
                tr.appendChild(td);
            });
            historyTableBody.appendChild(tr);
        });

        // NEW: Populate "Live Inventory Counts" for Manager

        // NEW: Populate "Live Inventory Counts" for Manager
        wipSummaryGrid.innerHTML = '';
        appConfig.areas.forEach(area => {
             const count = (carsByArea[area] || []).length;
             const card = document.createElement('div');
             card.className = 'bg-blue-50 p-3 rounded-lg border border-blue-200 text-center';
             card.innerHTML = `<p class="text-[10px] font-bold text-blue-400 uppercase truncate" title="${area}">${area}</p><p class="text-2xl font-bold text-blue-700">${count}</p>`;
             wipSummaryGrid.appendChild(card);
        });

	// NEW: Render Post-WIP Metrics in Manager View
        postWipSummaryGrid.innerHTML = '';
        if (appConfig.postWipZones && appConfig.postWipZones.length > 0) {
             appConfig.postWipZones.forEach(zone => {
                 const count = (carsByPostWip[zone] || []).length;
                 const card = document.createElement('div');
                 // Changed to Emerald
                 card.className = 'bg-emerald-50 p-3 rounded-lg border border-emerald-200 text-center';
                 card.innerHTML = `<p class="text-[10px] font-bold text-emerald-600 uppercase truncate" title="${zone}">${zone}</p><p class="text-2xl font-bold text-emerald-700">${count}</p>`;
                 postWipSummaryGrid.appendChild(card);
             });
             
             // Also render Post-WIP POTS (Detailed Cards) inside specific inner div
             const potsContainer = document.getElementById('post-wip-pots');
             potsContainer.innerHTML = '';
             
             appConfig.postWipZones.forEach(zone => {
                 const cars = carsByPostWip[zone] || [];
                 const card = document.createElement('div');
                 // Changed to Emerald
                 card.className = `bg-white rounded-xl shadow-lg p-4 border-t-8 border-emerald-500 flex flex-col h-full cursor-pointer hover:shadow-xl transition transform hover:-translate-y-1 relative group`;
                 card.onclick = () => openPostWipZoneList(zone);

                 card.innerHTML = `
                    <div class="flex justify-between items-baseline mb-3">
                        <h3 class="text-lg font-bold text-gray-800">${zone}</h3>
                        <span class="text-sm font-semibold px-2 py-0.5 bg-gray-100 rounded text-gray-600">${cars.length}</span>
                    </div>
		    <div class="flex flex-wrap gap-2 content-start min-h-[80px]">
                        ${cars.length === 0 ? '<p class="text-gray-400 text-sm italic w-full text-center mt-4">Empty</p>' : cars.map(c => {
                            const aging = getAgingDetails(c);
                            const styles = getAgingStyles(aging.status);
                            let chipClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                            // Override emerald with aging styles if applicable
                            if(aging.status !== 'normal') chipClass = `${styles.bg} ${styles.text} ${styles.border} shadow-sm`;
                            return `<span class="inline-block px-2 py-1 text-xs font-mono font-bold ${chipClass} rounded border">${c.vin}${c.model ? ' <span class="text-[9px] text-gray-500 font-sans">'+c.model+'</span>' : ''}</span>`;
                        }).join('')}
                    </div>
                    <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-5 transition rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none"><span class="bg-white px-3 py-1 rounded-full shadow text-xs font-bold text-gray-700">View Details</span></div>
                 `;
                 potsContainer.appendChild(card);
             });

        } else {
             postWipSummaryGrid.innerHTML = '<p class="text-gray-400 text-xs italic col-span-full">No Post-WIP Zones Configured</p>';
             document.getElementById('post-wip-pots').innerHTML = '';
        }
        
        // Hide specific PostWIP Manager dashboard table
        postWipDashboard.classList.add('hidden');

        // Ensure sections are visible
        document.getElementById('metrics-container').classList.remove('hidden');
        document.getElementById('manager-inventory-counts').classList.remove('hidden'); 
        document.getElementById('post-wip-board-container').classList.remove('hidden'); 

    } else if (currentUserRole === 'PostWIPManager') {
         // Hide standard metrics container completely for Post WIP Manager
         document.getElementById('metrics-container').classList.add('hidden');
         document.getElementById('manager-inventory-counts').classList.add('hidden');
         document.getElementById('post-wip-board-container').classList.add('hidden');
         
    } else {
        // Zone User Logic
        managerToggleContainer.classList.remove('flex');
        managerToggleContainer.classList.add('hidden');
        managerThroughputDisplay.classList.add('hidden');
        zoneThroughputDisplay.classList.remove('hidden');
        zoneThroughputDisplay.classList.add('grid');
        metricsTitle.textContent = `${currentUserRole} Performance`;
        zoneMetricToday.textContent = stats.today[currentUserRole] || 0;
        zoneMetricWeek.textContent = stats.week[currentUserRole] || 0;
        // Ensure metrics container is visible for Zone User
        document.getElementById('metrics-container').classList.remove('hidden');
        document.getElementById('manager-inventory-counts').classList.add('hidden');
        document.getElementById('post-wip-board-container').classList.add('hidden');
        document.getElementById('post-wip-dashboard').classList.add('hidden'); // FIX: Actively hide this view
    }
};

// NEW: Render Post WIP Dashboard Logic (Tabular Layout)
window.renderPostWipDashboard = () => {
     // Hide standard WIP container
     wipContainer.classList.add('hidden');
     wipTitle.classList.add('hidden');
     nonWorkingContainer.classList.add('hidden');
     
     // Show Post WIP specific container
     postWipDashboard.classList.remove('hidden');
     postWipCounts.innerHTML = '';

     (appConfig.postWipZones || []).forEach(zone => {
         const cars = carsByPostWip[zone] || [];
         const tableContainer = document.createElement('div');
         
         // Using the Emerald Green theme for Post-WIP
         tableContainer.className = `bg-white rounded-xl shadow-lg border-t-8 border-emerald-500 overflow-hidden mb-8`;

         let tableHtml = `
            <div class="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h3 class="text-xl font-bold text-gray-800">${zone}</h3>
                <span class="px-3 py-1 bg-white border border-gray-200 rounded-full text-sm font-semibold text-gray-600">${cars.length} Vehicles</span>
            </div>
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200"><thead class="bg-gray-50"><tr>
                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-2/12">VIN</th>
                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-2/12">Model</th>
                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-2/12">Time in Zone</th>
                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-4/12">Notes</th>
                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-2/12">Actions</th>
                </tr></thead><tbody class="bg-white divide-y divide-gray-200">`;

         if (cars.length === 0) {
             tableHtml += `<tr><td colspan="5" class="px-6 py-8 text-center text-gray-400 italic">No vehicles currently in ${zone}</td></tr>`;
         } else {
             cars.forEach(car => {
                 // Calculate duration
                 let durationStr = '--';
                 if (car.lastUpdated) {
                     const lastUpdDate = car.lastUpdated.toDate ? car.lastUpdated.toDate() : new Date(car.lastUpdated);
                     const diffMs = new Date() - lastUpdDate;
                     const diffHrs = Math.floor(diffMs / 3600000);
                     const diffMins = Math.round((diffMs % 3600000) / 60000);
                     durationStr = `${diffHrs}h ${diffMins}m`;
                 }

                 const draft = car.tempData || {};

                 // --- NEW: CALCULATE AGING FOR POST-WIP TABLE ---
                 const aging = getAgingDetails(car);
                 const styles = getAgingStyles(aging.status);
                 let rowClass = aging.status !== 'normal' ? styles.tableRow : "hover:bg-gray-50";
                 let agingIndicator = aging.status !== 'normal' ? `<span class="block text-[9px] font-bold ${styles.text} bg-white border ${styles.border} px-1.5 py-0.5 rounded uppercase mt-1.5 tracking-wide shadow-sm w-max mx-auto">${styles.badgeText} (${aging.days}d)		 </span>` : '';
                 // -----------------------------------------------

                 tableHtml += `
                    <tr class="${rowClass} transition">
                        <td class="px-4 py-3 whitespace-nowrap text-center text-xs font-bold font-mono text-indigo-900">
                            <button onclick="viewCarHistory('${car.vin}')" class="hover:underline decoration-dotted hover:text-indigo-600 transition">${car.vin}</button>
                            ${agingIndicator}
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap text-center text-xs text-gray-500">${car.model || '-'}</td>
                        <td class="px-4 py-3 whitespace-nowrap text-center text-xs text-gray-500">${durationStr}</td>
                        <td class="px-4 py-3">
                            <textarea 
                                oninput="this.style.height = ''; this.style.height = this.scrollHeight + 'px'"
                                onfocus="this.style.height = ''; this.style.height = this.scrollHeight + 'px'"
                                onchange="saveDraftData('${car.vin}', 'comment', this.value)" 
                                class="w-full text-xs border border-gray-300 rounded p-1.5 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none overflow-hidden resize-none min-h-[2.5rem]" 
                                placeholder="..."
                            >${draft.comment || ''}</textarea>
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap text-center">
                            <div class="flex flex-col xl:flex-row justify-center gap-2">
                                <button onclick="initiateMove('${car.vin}', 'post-wip-transfer')" class="text-xs bg-indigo-100 text-indigo-800 px-3 py-1.5 rounded font-bold hover:bg-indigo-200 shadow-sm transition">Transfer</button>
                                <button onclick="initiateMove('${car.vin}', 'post-wip-complete')" class="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded font-bold hover:bg-emerald-700 shadow-sm transition">Complete</button>
                            </div>
                        </td>
                    </tr>
                 `;
             });
         }
         tableHtml += `</tbody></table></div>`;
         tableContainer.innerHTML = tableHtml;
         postWipCounts.appendChild(tableContainer);
     });
};

window.openPostWipZoneList = (zone) => {
     const cars = carsByPostWip[zone] || [];
     document.getElementById('post-wip-list-title').textContent = zone;
     const content = document.getElementById('post-wip-list-content');
     content.innerHTML = '';
     
     if(cars.length === 0) {
         content.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-400 italic">No cars in this zone.</td></tr>';
     } else {
         cars.forEach(car => {
             // Calculate duration
             let durationStr = '--';
             if (car.lastUpdated) {
                 const diffMs = new Date() - car.lastUpdated.toDate();
                 const diffHrs = Math.floor(diffMs / 3600000);
                 const diffMins = Math.round((diffMs % 3600000) / 60000);
                 durationStr = `${diffHrs}h ${diffMins}m`;
             }

             const draft = car.tempData || {};
             content.innerHTML += `
                <tr class="hover:bg-gray-50">
                    <td class="px-6 py-4 whitespace-nowrap"><button onclick="viewCarHistory('${car.vin}')" class="font-bold text-indigo-700 hover:underline">${car.vin}</button></td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${car.model || '-'}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${durationStr}</td>
                    <td class="px-4 py-3 w-3/12">
                        <textarea 
                            oninput="this.style.height = ''; this.style.height = this.scrollHeight + 'px'"
                            onfocus="this.style.height = ''; this.style.height = this.scrollHeight + 'px'"
                            onchange="saveDraftData('${car.vin}', 'comment', this.value)" 
                            class="w-full text-xs border border-gray-300 rounded p-1 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none overflow-hidden resize-none min-h-[2.5rem]" 
                            placeholder="..."
                        >${draft.comment || ''}</textarea>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-center">
                        <button onclick="initiateMove('${car.vin}', 'post-wip-transfer')" class="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded hover:bg-indigo-200 mr-2">Transfer</button>
                        <button onclick="initiateMove('${car.vin}', 'post-wip-complete')" class="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200">Complete</button>
                    </td>
                </tr>
             `;
         });
     }
     document.getElementById('post-wip-list-modal').classList.remove('hidden');
     document.getElementById('post-wip-list-modal').classList.add('flex');
};

window.closePostWipListModal = () => {
     document.getElementById('post-wip-list-modal').classList.add('hidden');
     document.getElementById('post-wip-list-modal').classList.remove('flex');
};

window.filterPostWipList = () => {
    const filter = document.getElementById('post-wip-list-search').value.toUpperCase();
    const trs = document.getElementById('post-wip-list-content').getElementsByTagName('tr');
    for (let i = 0; i < trs.length; i++) {
        const td = trs[i].getElementsByTagName('td')[0];
        if (td) {
            trs[i].style.display = (td.textContent || td.innerText).toUpperCase().indexOf(filter) > -1 ? "" : "none";
        }
    }
};


window.showZoneThroughputList = (period) => {
    const { today, weekStart } = getDates();
    const listData = [];
    allCars.forEach(car => {
        if (car.history) {
            car.history.forEach(h => {
                if (h.area === currentUserRole && h.status === 'Finished') {
                    const date = h.timestamp.toDate ? h.timestamp.toDate() : new Date(h.timestamp);
                    const dateStr = date.toISOString().split('T')[0];
                    let match = false;
                    if (period === 'today' && dateStr === today) match = true;
                    if (period === 'week' && date >= weekStart) match = true;
                    if (match) {
                        listData.push({ vin: car.vin, finishedAt: date, currentArea: car.currentArea, currentStatus: car.status, tempLocation: car.tempLocation });
                    }
                }
            });
        }
    });
    listData.sort((a, b) => b.finishedAt - a.finishedAt);
    zoneListTitle.textContent = period === 'today' ? "Completed Today" : "Completed This Week";
    zoneListSearch.value = "";
    
    if (listData.length === 0) {
        zoneListContent.innerHTML = '<tr><td colspan="3" class="px-6 py-4 text-center text-gray-500 italic">No completed vehicles found for this period.</td></tr>';
    } else {
        zoneListContent.innerHTML = listData.map(item => {
            let locDisplay = `${item.currentArea} (${item.currentStatus})`;
            if(item.tempLocation) {
                locDisplay += `<br><span class="text-orange-600 text-[10px] font-bold">📍 At ${item.tempLocation}</span>`;
            }
            return `
            <tr class="hover:bg-gray-50 transition cursor-pointer" onclick="viewCarHistory('${item.vin}')">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-indigo-900 font-mono text-center hover:underline">${item.vin}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">${item.finishedAt.toLocaleString()}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 text-center">${locDisplay}</td>
            </tr>`;
        }).join('');
    }
    zoneListModal.classList.remove('hidden'); zoneListModal.classList.add('flex');
};
window.closeZoneListModal = () => { zoneListModal.classList.add('hidden'); zoneListModal.classList.remove('flex'); };
window.filterZoneList = () => {
    const filter = document.getElementById('zone-list-search').value.toUpperCase();
    const trs = document.getElementById('zone-list-content').getElementsByTagName('tr');
    for (let i = 0; i < trs.length; i++) {
        const td = trs[i].getElementsByTagName('td')[0];
        if (td) {
            trs[i].style.display = (td.textContent || td.innerText).toUpperCase().indexOf(filter) > -1 ? "" : "none";
        }
    }
};

window.renderNonWorkingAreas = () => {
     nonWorkingGrid.innerHTML = '';
     appConfig.nonWorkingAreas.forEach(nwa => {
         const cars = carsByTemp[nwa] || [];
         const div = document.createElement('div');
         
         // Style similar to WIP pots but distinct gray border
         div.className = "bg-white rounded-xl shadow-lg p-4 border-t-8 border-gray-400 flex flex-col h-full cursor-pointer hover:shadow-xl transition transform hover:-translate-y-1 relative group";
         div.onclick = () => openNWAModal(nwa);

         let chipsHtml = cars.length === 0 ? '<p class="text-gray-400 text-sm italic w-full text-center mt-4">Empty</p>' : cars.map(c => {
             const aging = getAgingDetails(c);
             const styles = getAgingStyles(aging.status);
             let chipClass = 'bg-gray-50 text-gray-700 border-gray-200';
             if(aging.status !== 'normal') chipClass = `${styles.bg} ${styles.text} ${styles.border} shadow-sm`;
             return `<span class="inline-block px-2 py-1 text-xs font-mono font-bold ${chipClass} rounded border">${c.vin}${c.model ? ' <span class="text-[9px] text-gray-500 font-sans">'+c.model+'</span>' : ''}</span>`;
         }).join('');

         div.innerHTML = `
            <div class="flex justify-between items-baseline mb-3">
                <h3 class="text-lg font-bold text-gray-800">${nwa}</h3>
                <span class="text-sm font-semibold px-2 py-0.5 bg-gray-100 rounded text-gray-600">${cars.length}</span>
            </div>
            <div class="flex flex-wrap gap-2 content-start min-h-[80px]">
                ${chipsHtml}
            </div>
            <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-5 transition rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none">
                <span class="bg-white px-3 py-1 rounded-full shadow text-xs font-bold text-gray-700">View Details</span>
            </div>
         `;
         nonWorkingGrid.appendChild(div);
     });
};

// NEW: NWA Modal Logic
window.openNWAModal = (nwa) => {
     const cars = carsByTemp[nwa] || [];
     document.getElementById('nwa-list-title').textContent = `${nwa} Vehicles`;
     const content = document.getElementById('nwa-list-content');
     content.innerHTML = '';

     if(cars.length === 0) {
         content.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-400 italic">No vehicles in this location.</td></tr>';
     } else {
         cars.forEach(c => {
             // Calculate duration
             let durationStr = '--';
             if (c.lastUpdated) {
                 const diffMs = new Date() - (c.lastUpdated.toDate ? c.lastUpdated.toDate() : new Date(c.lastUpdated));
                 const diffHrs = Math.floor(diffMs / 3600000);
                 const diffMins = Math.round((diffMs % 3600000) / 60000);
                 durationStr = `${diffHrs}h ${diffMins}m`;
             }

             const originText = c.visitorHost ? `${c.visitorHost} (via ${c.currentArea})` : `From ${c.currentArea}`;
             const draft = c.tempData || {};

             // Calculate Aging
             const aging = getAgingDetails(c);
             const styles = getAgingStyles(aging.status);
             let rowClass = aging.status !== 'normal' ? styles.tableRow : "hover:bg-gray-50";
             let agingIndicator = aging.status !== 'normal' ? `<span class="block text-[9px] font-bold ${styles.text} bg-white border ${styles.border} px-1.5 py-0.5 rounded uppercase mt-1.5 tracking-wide shadow-sm w-max mx-auto">${styles.badgeText} (${aging.days}d)</span>` : '';

             content.innerHTML += `
                <tr class="${rowClass} transition">
                    <td class="px-4 py-3 whitespace-nowrap text-center text-xs font-bold font-mono text-indigo-900">
                        <button onclick="viewCarHistory('${c.vin}')" class="hover:underline decoration-dotted hover:text-indigo-600 transition">${c.vin}</button>
                        ${agingIndicator}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-center text-xs text-gray-500">${c.model || '-'}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-center text-xs text-gray-700 italic">${originText}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-center text-xs font-semibold text-gray-600">${durationStr}</td>
                    <td class="px-4 py-3">
                        <textarea 
                            oninput="this.style.height = ''; this.style.height = this.scrollHeight + 'px'"
                            onfocus="this.style.height = ''; this.style.height = this.scrollHeight + 'px'"
                            onchange="saveDraftData('${c.vin}', 'comment', this.value)" 
                            class="w-full text-xs border border-gray-300 rounded p-1.5 bg-white/50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none overflow-hidden resize-none min-h-[2.5rem]" 
                            placeholder="..."
                        >${draft.comment || ''}</textarea>
                    </td>
                </tr>
             `;
         });
     }
     document.getElementById('nwa-list-modal').classList.remove('hidden');
     document.getElementById('nwa-list-modal').classList.add('flex');
};

window.closeNWAModal = () => {
     document.getElementById('nwa-list-modal').classList.add('hidden');
     document.getElementById('nwa-list-modal').classList.remove('flex');
};

window.filterNWAList = () => {
    const filter = document.getElementById('nwa-list-search').value.toUpperCase();
    const trs = document.getElementById('nwa-list-content').getElementsByTagName('tr');
    for (let i = 0; i < trs.length; i++) {
        const td = trs[i].getElementsByTagName('td')[0];
        if (td) {
            trs[i].style.display = (td.textContent || td.innerText).toUpperCase().indexOf(filter) > -1 ? "" : "none";
        }
    }
};

const renderWIPBoard = () => {
    wipContainer.innerHTML = ''; 
    
    if (currentUserRole === 'Manager' || currentUserRole === 'Admin') {
        wipContainer.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6";
        appConfig.areas.forEach(area => {
            const cars = carsByArea[area] || [];
            // Use consistent British Racing Green theme for all WIP pots
            let borderColor = 'border-indigo-400';

            const areaCard = document.createElement('div');
            areaCard.className = `bg-white rounded-xl shadow-lg p-4 border-t-8 ${borderColor} flex flex-col h-full cursor-pointer hover:shadow-xl transition transform hover:-translate-y-1 relative group`;
            areaCard.onclick = () => openAreaDetails(area); 

            areaCard.innerHTML = `
                <div class="flex justify-between items-baseline mb-3">
                    <h3 class="text-lg font-bold text-gray-800">${area}</h3>
                    <span class="text-sm font-semibold px-2 py-0.5 bg-gray-100 rounded text-gray-600">${cars.length}</span>
                </div>
		<div class="flex flex-wrap gap-2 content-start min-h-[80px]">
                    ${cars.length === 0 ? '<p class="text-gray-400 text-sm italic w-full text-center mt-4">Empty</p>' : cars.map(c => {
                        const aging = getAgingDetails(c);
                        const styles = getAgingStyles(aging.status);
                        let chipClass = c.tempLocation ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-indigo-50 text-indigo-700 border-indigo-100';
                        if(aging.status !== 'normal') chipClass = `${styles.bg} ${styles.text} ${styles.border} shadow-sm`;
                        return `<span class="inline-block px-2 py-1 text-xs font-mono font-bold ${chipClass} rounded border">${c.vin}${c.model ? ' <span class="text-[9px] text-gray-500 font-sans">'+c.model+'</span>' : ''}${c.tempLocation?'*':''}</span>`;
                    }).join('')}
                </div>
                <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-5 transition rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none"><span class="bg-white px-3 py-1 rounded-full shadow text-xs font-bold text-gray-700">View Details</span></div>
            `;
            wipContainer.appendChild(areaCard);
        });
        nonWorkingContainer.classList.remove('hidden');
    } else {
        wipContainer.className = "space-y-8";
        const area = currentUserRole;
        const myCars = carsByArea[area] || [];
        const visitors = carsByTemp[area] || [];
        
        const combined = [...myCars];
        visitors.forEach(v => {
            if(!combined.find(c => c.vin === v.vin)) combined.push(v);
        });
        
        // Use consistent British Racing Green theme
        let borderColor = 'border-indigo-400';

        const tableContainer = document.createElement('div');
        tableContainer.className = `bg-white rounded-xl shadow-lg border-t-8 ${borderColor} overflow-hidden`;

        
        // Determine if Post WIP enabled for this area
        const isPostWipEnabled = (appConfig.postWipEnabledZones || []).includes(area);
        const postWipHeader = isPostWipEnabled ? `<th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-1/12">Post WIP</th>` : '';

        let tableHtml = `
            <div class="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h3 class="text-xl font-bold text-gray-800">${area}</h3>
                <span class="px-3 py-1 bg-white border border-gray-200 rounded-full text-sm font-semibold text-gray-600">${combined.length} Vehicles</span>
            </div>
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200"><thead class="bg-gray-50"><tr>
                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-1/12">VIN</th>
                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-1/12">In</th>
                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-2/12">Status</th>
                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-2/12">Tags</th>
                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-2/12">Notes</th>
                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-1/12">VA (mins)</th>
                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-1/12">NVA (mins)</th>
                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-1/12">Temp Move</th>
                    ${postWipHeader}
                    <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-1/12">Complete</th>
                </tr></thead><tbody class="bg-white divide-y divide-gray-200">`;

        if (combined.length === 0) {
            tableHtml += `<tr><td colspan="10" class="px-6 py-8 text-center text-gray-400 italic">No vehicles currently in ${area}</td></tr>`;
        } else {
            combined.forEach(car => {
                const isOwner = car.currentArea === area;
                const isVisitorHost = car.tempLocation === area;
                const isVisitorSender = car.visitorHost === area;
                
                const isAbsent = isOwner && car.tempLocation && car.tempLocation !== area;
                const isNonWorking = appConfig.nonWorkingAreas.includes(car.tempLocation);
                const isManagedByVisitor = isAbsent && car.visitorHost && car.visitorHost !== area;
                
                const draft = car.tempData || {};
                const tags = draft.statuses || []; 
                
                const definedStatuses = appConfig.statuses && appConfig.statuses[area];
                let statusInput = "";
                if (definedStatuses && definedStatuses.length > 0) {
                     const statusOpts = definedStatuses.map(s => `<option value="${s}" ${draft.status === s ? 'selected' : ''}>${s}</option>`).join('');
                     statusInput = `<select onchange="saveDraftData('${car.vin}', 'status', this.value)" class="w-full text-xs border-gray-300 rounded p-1 bg-gray-50"><option value="">-- Status --</option>${statusOpts}</select>`;
                } else {
                     statusInput = `<span class="text-xs text-gray-400 italic">No options</span>`;
                }

		let tagsHtml = `<div id="tag-container-${car.vin}" class="flex flex-wrap gap-1 mb-1 justify-center">`;
                tags.forEach(tag => { tagsHtml += `<span class="tag-badge">${tag}<button onclick="removeStatusTag('${car.vin}', '${tag}')">×</button></span>`; });
                tagsHtml += `</div>`;
                tagsHtml += `<div class="flex gap-1 justify-center"><input type="text" id="new-tag-${car.vin}" class="w-20 text-xs border rounded p-1" placeholder="Tag..."><button onclick="addStatusTag('${car.vin}', document.getElementById('new-tag-${car.vin}').value); document.getElementById('new-tag-${car.vin}').value='';" class="bg-green-500 text-white px-1 rounded text-xs font-bold">+</button></div>`;
                
                // --- NEW: CALCULATE AGING STYLES FOR THE TABLE ROW ---
                const aging = getAgingDetails(car);
                const styles = getAgingStyles(aging.status);
                let agingIndicator = '';
                if(aging.status !== 'normal') {
                    agingIndicator = `<span class="block text-[9px] font-bold ${styles.text} bg-white border ${styles.border} px-1.5 py-0.5 rounded uppercase mt-1.5 tracking-wide shadow-sm w-max mx-auto">${styles.badgeText} (${aging.days}d)</span>`;
                }

                let rowClass = "hover:bg-gray-50";
                if(!isVisitorHost && !isVisitorSender && !isAbsent && aging.status !== 'normal') {
                    rowClass = `${styles.tableRow} transition`;
                }
                // -----------------------------------------------------

                let tempActionCell = "";
                let permActionCell = "";
                let postWipCell = "";

                if(isVisitorHost || isVisitorSender) {
                     rowClass = "bg-orange-100 border-l-4 border-orange-400";
                     if(isVisitorSender && !isVisitorHost) {
                        // I sent it to NWA (Away) - Show Retrieve Button
                        tempActionCell = `<span class="block text-xs font-bold mb-1 text-center">At ${car.tempLocation}</span><button onclick="retrieveCar('${car.vin}')" class="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 font-bold text-xs mx-auto block">Retrieve</button>`;
                        permActionCell = `<span class="text-xs italic text-gray-500 font-bold">Visitor (Away)</span>`;
                     } else {
                        // Physically here
                         tempActionCell = `
                            <div class="flex flex-col gap-1">
                                <button onclick="returnCar('${car.vin}')" class="bg-blue-600 text-white px-2 py-1 rounded shadow hover:bg-blue-700 font-bold text-xs w-full">Send back to ${car.currentArea}</button>
                                <button onclick="initiateMove('${car.vin}', 'temp')" class="bg-yellow-600 text-white px-2 py-1 rounded shadow hover:bg-yellow-700 font-bold text-xs w-full">Move to NWA</button>
                            </div>`;
                       permActionCell = `<span class="text-xs italic text-gray-500 font-bold">Visitor from ${car.currentArea}</span>`;
                     }
                     if(isPostWipEnabled) postWipCell = `<td></td>`; // Visitors probably shouldn't be sent to Post WIP? Or maybe they should. Left empty for now.
                } else if (isAbsent) {
                    rowClass = "bg-yellow-100 border-l-4 border-yellow-400";
                    if (isNonWorking) {
                        if (isManagedByVisitor) {
                             // Owner View: Managed by Visitor
                             tempActionCell = `<span class="block text-xs font-bold text-red-600 text-center">At ${car.tempLocation}</span><span class="block text-[9px] text-gray-500 text-center">(Via ${car.visitorHost})</span>`;
                             permActionCell = `<span class="text-xs italic text-gray-400 block text-center">--</span>`;
                        } else {
                             // Owner View: Managed by Owner
                             tempActionCell = `<span class="block text-xs font-bold mb-1 text-center">At ${car.tempLocation}</span><button onclick="retrieveCar('${car.vin}')" class="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 font-bold text-xs mx-auto block">Retrieve</button>`;
                             permActionCell = `<span class="text-xs italic text-gray-400 block text-center">--</span>`;
                        }
                    } else {
                        // In Working Area: Highlighted orange, unretrievable
                        rowClass = "bg-orange-50 border-l-4 border-orange-400 text-gray-600";
                        tempActionCell = `<span class="block text-xs font-bold text-indigo-600 text-center">Located at ${car.tempLocation}</span><span class="block text-[10px] text-gray-500 text-center">(Must be returned by them)</span>`;
                        permActionCell = `<span class="text-xs italic text-gray-400 block text-center">--</span>`;
                    }
                     if(isPostWipEnabled) postWipCell = `<td></td>`;
                } else {
                    // Disable Temp Button if no temp locations are configured
                    const tempDestinations = (appConfig.tempRoutes && appConfig.tempRoutes[area]) || [];
                    if (tempDestinations.length > 0) {
                        tempActionCell = `<button onclick="initiateMove('${car.vin}', 'temp')" class="bg-yellow-500 text-white px-3 py-1 rounded text-xs font-bold hover:bg-yellow-600 shadow-sm transition w-full">Temp Move</button>`;
                    } else {
                        tempActionCell = `<button disabled class="bg-gray-300 text-white px-3 py-1 rounded text-xs font-bold cursor-not-allowed w-full">Temp Move</button>`;
                    }
                    
                    const destinations = appConfig.routing[area] || [];
                    if (destinations.length === 0) {
                        permActionCell = `<button onclick="initiateMove('${car.vin}', 'push')" class="bg-green-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-green-700 shadow-sm transition w-full">Complete</button>`;
                    } else {
                        permActionCell = `<button onclick="initiateMove('${car.vin}', 'push')" class="bg-indigo-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-indigo-700 shadow-sm transition w-full">Push</button>`;
                    }
                    
                    if (isPostWipEnabled) {
                        postWipCell = `<td class="px-4 py-3 text-center w-1/12"><button onclick="initiateMove('${car.vin}', 'post-wip')" class="bg-purple-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-purple-700 shadow-sm transition w-full">Send to Post-WIP</button></td>`;
                    }
                }
                
                const carModelDisplay = car.model ? `<br><span class="text-[9px] text-gray-500 font-sans">${car.model}</span>` : '';

                tableHtml += `
                    <tr class="${rowClass}">
                        <td class="px-4 py-3 whitespace-nowrap text-center text-xs font-bold font-mono ${isVisitorHost?'text-orange-800':'text-indigo-900'} w-1/12">
			<button onclick="viewCarHistory('${car.vin}')" class="hover:underline decoration-dotted hover:text-indigo-600 transition">${car.vin}</button>
                            ${agingIndicator}
                            ${carModelDisplay}
                            ${isVisitorHost?'<span class="text-[9px] block">(VISITOR)</span>':''}
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap text-center text-xs text-gray-500 w-1/12">${formatTimestamp(car.lastUpdated)}</td>
                        <td class="px-4 py-3 text-xs w-2/12">${isAbsent && !isNonWorking && !isVisitorSender ? `<span class="text-gray-400 italic text-center block">${draft.status || '-'} at ${car.tempLocation}</span>` : statusInput}</td>
                        <td class="px-4 py-3 text-xs w-2/12">${isAbsent && !isNonWorking && !isVisitorSender ? `<span class="text-gray-400 italic text-center block">--</span>` : tagsHtml}</td>
                        <td class="px-4 py-3 w-2/12">
                            <textarea 
                                oninput="this.style.height = ''; this.style.height = this.scrollHeight + 'px'" 
                                onfocus="this.style.height = ''; this.style.height = this.scrollHeight + 'px'"
                                onchange="saveDraftData('${car.vin}', 'comment', this.value)" 
                                class="w-full text-xs border-gray-300 rounded bg-transparent border-b focus:border-indigo-500 outline-none text-center overflow-hidden resize-none min-h-[1.5rem]" 
                                rows="1" 
                                placeholder="..."
                            >${draft.comment || ''}</textarea>
                        </td>
                        <td class="px-4 py-3 w-1/12"><input type="number" min="0" onchange="saveDraftData('${car.vin}', 'va', this.value)" value="${draft.va || ''}" class="w-16 text-xs border border-gray-400 rounded text-center bg-white mx-auto block shadow-sm font-mono"></td>
                        <td class="px-4 py-3 w-1/12"><input type="number" min="0" onchange="saveDraftData('${car.vin}', 'nva', this.value)" value="${draft.nva || ''}" class="w-16 text-xs border border-gray-400 rounded text-center bg-white mx-auto block shadow-sm font-mono"></td>
                        <td class="px-4 py-3 text-center w-1/12">${tempActionCell}</td>
                        ${postWipCell}
                        <td class="px-4 py-3 text-center w-1/12">${permActionCell}</td>
                    </tr>`;
            });
        }
        tableHtml += `</tbody></table></div>`;
        tableContainer.innerHTML = tableHtml;
        wipContainer.appendChild(tableContainer);
        nonWorkingContainer.classList.add('hidden');
    }
};

// --- MANAGER AREA MODAL ---
let currentOpenArea = null;
window.openAreaDetails = (area) => {
    currentOpenArea = area;
    areaModalTitle.textContent = `${area} Details`;
    const cars = [...(carsByArea[area]||[]), ...(carsByTemp[area]||[])];
    
    let html = `<table class="min-w-full divide-y divide-gray-200"><thead class="bg-gray-100"><tr>
        <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">VIN</th>
        <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Scanned In</th>
        <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
        <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Comments</th>
        <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">VA (mins)</th>
        <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">NVA (mins)</th>
    </tr></thead><tbody class="bg-white divide-y divide-gray-200">`;

    if (cars.length === 0) {
        html += `<tr><td colspan="6" class="px-6 py-8 text-center text-gray-400 italic">No vehicles in ${area}</td></tr>`;
    } else {
        cars.forEach(car => {
            const draft = car.tempData || {};
            let statusText = draft.status || '-';
            if(car.tempLocation) {
                statusText += `<br><span class="text-orange-600 text-[10px] font-bold">📍 At ${car.tempLocation}`;
                if(car.visitorHost && car.visitorHost !== area) {
                     // FIX: Correct wording for manager view
                     statusText += ` (via ${car.visitorHost})`;
                }
                statusText += `</span>`;
            }
            const carModelDisplay = car.model ? `<br><span class="text-[9px] text-gray-500 font-sans">${car.model}</span>` : '';

            html += `<tr onclick="viewCarHistory('${car.vin}')" class="cursor-pointer hover:bg-indigo-50 transition duration-150 group">
                <td class="px-6 py-4 whitespace-nowrap text-center"><div class="text-sm font-bold text-indigo-900 font-mono group-hover:text-indigo-700 underline decoration-dotted underline-offset-2">${car.vin}${carModelDisplay}</div></td>
                <td class="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">${formatTimestamp(car.lastUpdated)}</td>
                <td class="px-6 py-4 text-center text-sm text-gray-700 font-bold">${statusText}</td>
                <td class="px-6 py-4 text-center text-sm text-gray-700 italic">${draft.comment || '<span class="text-gray-300">--</span>'}</td>
                <td class="px-6 py-4 text-center text-sm text-gray-700 font-mono">${draft.va || 0}</td>
                <td class="px-6 py-4 text-center text-sm text-gray-700 font-mono">${draft.nva || 0}</td>
            </tr>`;
        });
    }
    html += `</tbody></table>`;
    areaModalContent.innerHTML = html;
    areaDetailsModal.classList.remove('hidden'); areaDetailsModal.classList.add('flex');
};
window.closeAreaModal = () => { areaDetailsModal.classList.add('hidden'); areaDetailsModal.classList.remove('flex'); currentOpenArea = null; };
window.viewCarHistory = (vin) => { const car = allCars.find(c => c.vin === vin); if(car) openModal(car.vin, car.history); };

// --- ACTIONS & DATA SAVING ---
window.saveDraftData = async (vin, field, value) => {
    if(!userId) return;
    try { const carRef = doc(db, COLLECTION_PATH, vin); await updateDoc(carRef, { [`tempData.${field}`]: value }); } catch(e) { console.error(e); }
};

// Status Tag Logic
window.addStatusTag = async (vin, tag) => {
    if (!tag || !userId) return;
    const car = allCars.find(c => c.vin === vin);
    const currentTags = car.tempData?.statuses || [];
    if (!currentTags.includes(tag)) {
        const newTags = [...currentTags, tag];
        try { await updateDoc(doc(db, COLLECTION_PATH, vin), { [`tempData.statuses`]: newTags }); } catch(e) { console.error(e); }
    }
};

window.removeStatusTag = async (vin, tag) => {
    if (!userId) return;
    const car = allCars.find(c => c.vin === vin);
    const currentTags = car.tempData?.statuses || [];
    const newTags = currentTags.filter(t => t !== tag);
    try { await updateDoc(doc(db, COLLECTION_PATH, vin), { [`tempData.statuses`]: newTags }); } catch(e) { console.error(e); }
};

// Temp Moves
window.sendToTemp = async (vin, target) => {
    if(!userId || !target) return;
    const car = allCars.find(c=>c.vin===vin);
    const draft = car.tempData || {};
    // determine "from" location: if I am a visitor moving it, it's from currentUserRole (visitor zone). If I am owner, it's from car.currentArea.
    const fromLocation = (currentUserRole === 'Manager' || currentUserRole === 'Admin') ? car.currentArea : currentUserRole;

    const metricsSnapshot = { 
        va: draft.va || 0, 
        nva: draft.nva || 0, 
        comment: draft.comment || '', 
        status: draft.status || '', 
        tags: draft.statuses || [] 
    };
    
    try {
        // If I am visitor moving to NWA, I become the visitorHost
        let visitorHost = car.visitorHost || null;
        if (car.tempLocation === currentUserRole) {
            visitorHost = currentUserRole;
        }

        await updateDoc(doc(db, COLLECTION_PATH, vin), {
            tempLocation: target,
            visitorHost: visitorHost, // Save who sent it to NWA if not owner
            lastUpdated: Timestamp.now(),
            history: [...(car.history||[]), { area: target, status: 'Temp Move', timestamp: Timestamp.now(), userId, from: fromLocation, metrics: metricsSnapshot }]
        });
    } catch(e) { alert(e.message); }
};

window.returnCar = async (vin) => {
    if(!userId) return;
    const car = allCars.find(c=>c.vin===vin);
    
    // NEW: Capture the inputted VA/NVA/Notes before returning
    const draft = car.tempData || {};
    const metricsSnapshot = { 
        va: draft.va || 0, 
        nva: draft.nva || 0, 
        comment: draft.comment || '', 
        status: draft.status || '', 
        tags: draft.statuses || [] 
    };

    try {
        await updateDoc(doc(db, COLLECTION_PATH, vin), {
            tempLocation: null, 
            visitorHost: null, // Clear host on full return
            tempData: {}, // NEW: Clear the textboxes so they don't bleed into the next stage
            lastUpdated: Timestamp.now(),
            history: [...(car.history||[]), { area: car.currentArea, status: 'Returned', timestamp: Timestamp.now(), userId, from: car.tempLocation, metrics: metricsSnapshot }]
        });
    } catch(e) { alert(e.message); }
};

// Daisy-chain retrieval logic
window.retrieveCar = async (vin) => {
     const car = allCars.find(c=>c.vin===vin);
     // If I am the visitorHost, bring it back to ME (tempLocation = me), keep visitorHost set
     if (car.visitorHost === currentUserRole) {
         // NEW: Capture the inputted VA/NVA/Notes before retrieving
         const draft = car.tempData || {};
         const metricsSnapshot = { 
             va: draft.va || 0, 
             nva: draft.nva || 0, 
             comment: draft.comment || '', 
             status: draft.status || '', 
             tags: draft.statuses || [] 
         };

         try {
            await updateDoc(doc(db, COLLECTION_PATH, vin), {
                tempLocation: currentUserRole,
                // visitorHost remains set until returned to owner
                tempData: {}, // NEW: Clear the textboxes
                lastUpdated: Timestamp.now(),
                history: [...(car.history||[]), { area: currentUserRole, status: 'Retrieved', timestamp: Timestamp.now(), userId, from: car.tempLocation, metrics: metricsSnapshot }]
            });
        } catch(e) { alert(e.message); }
     } else {
         // Standard retrieve by owner
         window.returnCar(vin); 
     }
}; 

const populateAreaSelect = () => {
    if (!addCarAreaSelect) return;
    addCarAreaSelect.innerHTML = '';
    if (currentUserRole === 'Manager' || currentUserRole === 'Admin') {
        appConfig.areas.forEach(area => {
            const opt = document.createElement('option'); opt.value = area; opt.textContent = area; addCarAreaSelect.appendChild(opt);
        });
        addCarAreaContainer.classList.remove('hidden');
    } else {
         // For Zone Users, area is fixed, but we populate for the logic to use
         const opt = document.createElement('option'); opt.value = currentUserRole; opt.textContent = currentUserRole; opt.selected = true; addCarAreaSelect.appendChild(opt);
         addCarAreaContainer.classList.add('hidden');
    }
};

// NEW: Open Add Car Modal
window.openAddCarModal = () => {
     // Populate Models
     addCarModelSelect.innerHTML = '<option value="" disabled selected>Select Model...</option>' + (appConfig.models || []).map(m => `<option value="${m}">${m}</option>`).join('');
     // Reset Fields
     document.getElementById('add-car-vin').value = '';
     document.getElementById('add-car-kenn').value = '';
     document.getElementById('add-car-seq').value = '';
     
     populateAreaSelect();
     addCarModal.classList.remove('hidden');
     addCarModal.classList.add('flex');
};

window.closeAddCarModal = () => {
     addCarModal.classList.add('hidden');
     addCarModal.classList.remove('flex');
};

// NEW: Save New Car
window.saveNewCar = async () => {
     const vin = document.getElementById('add-car-vin').value.trim().toUpperCase();
     const kenn = document.getElementById('add-car-kenn').value.trim();
     const seq = document.getElementById('add-car-seq').value.trim();
     const model = addCarModelSelect.value;
     const year = document.getElementById('add-car-year').value.trim();
     // Determine Area: If admin/manager use dropdown, else use current user role
     const area = (currentUserRole === 'Manager' || currentUserRole === 'Admin') ? addCarAreaSelect.value : currentUserRole;

     if (vin.length !== 17) return alert("VIN must be 17 characters");
     if (!model) return alert("Please select a model");
     if (!year || year.length !== 4) return alert("Please enter a valid 4-digit model year");
     if (!area) return alert("System Error: No start area defined");
     
     // Check if VIN exists
     const existing = allCars.find(c => c.vin === vin);
     if(existing) return alert(`VIN ${vin} already exists in ${existing.currentArea}`);
     
     try {
         const timestamp = Timestamp.now();
         await setDoc(doc(db, COLLECTION_PATH, vin), {
             vin,
             kenn,
             sequence: seq,
             model,
             modelYear: year,
             currentArea: area,
             status: 'WIP',
             lastUpdated: timestamp,
             history: [{ area, status: 'WIP', timestamp, userId, action: 'Created' }],
             tempData: {}
         });
         alert("Vehicle Registered Successfully!");
         closeAddCarModal();
     } catch(e) {
         console.error(e);
         alert("Error registering vehicle: " + e.message);
     }
};


const showMessage = (msg, type = 'success') => {
    const el = document.getElementById('message-box');
    if(el) {
        el.textContent = msg;
        el.className = 'mt-3 text-sm font-medium h-5 text-center mb-4 ' + (type === 'error' ? 'text-red-600' : 'text-green-600');
        setTimeout(() => { if(el) el.textContent = ''; }, 5000);
    }
};

let pendingMove = null;
window.initiateMove = (vin, type) => {
    const car = allCars.find(c => c.vin === vin);
    if (!car) return;
    
    const draft = car.tempData || {};
    pendingMove = { vin, type, va: draft.va || 0, nva: draft.nva || 0, comment: draft.comment || "No comment" };
    
    // Setup Modal
    confirmVin.textContent = vin;
    confirmVa.textContent = pendingMove.va + " min"; 
    confirmNva.textContent = pendingMove.nva + " min"; 
    confirmComment.textContent = pendingMove.comment;
    
    // New: Type stored in hidden field to distinguish logic later
    document.getElementById('move-type-hidden').value = type;

    const selectEl = document.getElementById('confirm-target-select');
    selectEl.innerHTML = '';
    
    if (type === 'push') {
        const destinations = appConfig.routing[currentUserRole] || [];
        if (destinations.length === 0) {
             moveModalTitle.textContent = "Complete Vehicle Process";
             selectEl.innerHTML = `<option value="Complete" selected>Complete</option>`;
             selectEl.disabled = true;
        } else {
             moveModalTitle.textContent = "Complete Stage & Push To";
             let options = `<option value="" disabled selected>Select Destination...</option>`;
             destinations.forEach(d => options += `<option value="${d}">${d}</option>`);
             selectEl.innerHTML = options;
             selectEl.disabled = false;
        }
    } else if (type === 'post-wip' || type === 'post-wip-transfer') {
        moveModalTitle.textContent = "Send to Post-WIP Zone";
        const postWipZones = appConfig.postWipZones || [];
        let options = `<option value="" disabled selected>Select Post-WIP Zone...</option>`;
        postWipZones.forEach(z => {
            // Don't show current zone if doing transfer
            if(z !== car.currentArea) options += `<option value="${z}">${z}</option>`;
        });
        selectEl.innerHTML = options;
        selectEl.disabled = false;
    } else if (type === 'post-wip-complete') {
         moveModalTitle.textContent = "Complete Vehicle";
         selectEl.innerHTML = `<option value="Complete" selected>Complete</option>`;
         selectEl.disabled = true;
    } else {
        // Temp
        moveModalTitle.textContent = "Move to Temporary Location";
        // If I am a visitor, I can move to NWA
        if(car.tempLocation === currentUserRole) { // I am the visitor host
            const allNWA = appConfig.nonWorkingAreas || [];
            let options = `<option value="" disabled selected>Select NWA...</option>`;
            allNWA.forEach(d => options += `<option value="${d}">${d}</option>`);
            selectEl.innerHTML = options;
            selectEl.disabled = false;
        } else {
            // Standard Temp Move logic
            const tempDestinations = (appConfig.tempRoutes && appConfig.tempRoutes[currentUserRole]) || [];
            const allLocs = [...appConfig.areas, ...appConfig.nonWorkingAreas];
            let options = `<option value="" disabled selected>Select Temp Location...</option>`;
            
            if (tempDestinations.length > 0) {
                 tempDestinations.forEach(d => options += `<option value="${d}">${d}</option>`);
            } else {
                 // Fallback: Show all except current
                 allLocs.filter(a => a !== currentUserRole).forEach(d => options += `<option value="${d}">${d}</option>`);
            }
            selectEl.innerHTML = options;
            selectEl.disabled = false;
        }
    }

    confirmModal.classList.remove('hidden'); 
    confirmModal.classList.add('flex');
};

window.closeConfirmModal = () => { confirmModal.classList.add('hidden'); confirmModal.classList.remove('flex'); pendingMove = null; };

btnConfirmMove.onclick = async () => {
    if(!pendingMove || !userId) return;
    const target = document.getElementById('confirm-target-select').value;
    // Allow target to be implied if it's "Complete" and disabled
    if (!target) { alert("Please select a destination"); return; }
    
    const { vin, type, va, nva, comment } = pendingMove; 
    
    const car = allCars.find(c => c.vin === vin);
    const currentArea = car.currentArea;
    const timestamp = Timestamp.now();
    
    // Include Tags and Status in metrics snapshot, check for nulls
    const draft = car.tempData || {};
    const metricsSnapshot = { va, nva, comment, status: draft.status || '', tags: draft.statuses || [] };

    try {
        if (type === 'push') {
            const finishEntry = { area: currentArea, status: 'Finished', timestamp, userId, metrics: metricsSnapshot };
            let updates = { lastUpdated: timestamp, tempData: {}, tempLocation: null, visitorHost: null }; // Clear host
            if (target === 'Complete') {
                updates.status = 'Finished';
                updates.history = [...(car.history || []), finishEntry];
            } else {
                const nextEntry = { area: target, status: 'WIP', timestamp, userId };
                updates.currentArea = target;
                updates.status = 'WIP';
                updates.history = [...(car.history || []), finishEntry, nextEntry];
            }
            await updateDoc(doc(db, COLLECTION_PATH, vin), updates);
            showMessage(`${vin} pushed to ${target}.`);
        } else if (type === 'post-wip' || type === 'post-wip-transfer') {
             // Moving to Post-WIP Zone
             await updateDoc(doc(db, COLLECTION_PATH, vin), {
                currentArea: target,
                status: 'Post-WIP',
                tempLocation: null,
                visitorHost: null,
                lastUpdated: timestamp,
                history: [...(car.history||[]), { area: target, status: 'Post-WIP', timestamp: Timestamp.now(), userId, from: currentArea, metrics: metricsSnapshot }]
             });
             showMessage(`${vin} moved to Post-WIP: ${target}`);
        } else if (type === 'post-wip-complete') {
             // Completing from Post-WIP
             await updateDoc(doc(db, COLLECTION_PATH, vin), {
                status: 'Finished',
                lastUpdated: timestamp,
                tempLocation: null,
                history: [...(car.history||[]), { area: currentArea, status: 'Finished', timestamp: Timestamp.now(), userId, metrics: metricsSnapshot }]
             });
             showMessage(`${vin} completed from Post-WIP.`);
        } else {
            // Temp Move (Standard OR Visitor-to-NWA)
            // Determine FROM location: if current user is temp host, from is temp host. else from owner.
            const fromLoc = (car.tempLocation === currentUserRole) ? currentUserRole : car.currentArea;
            // Determine if I become the host
            let newHost = car.visitorHost || null; // FIX: Ensure null if undefined
            if(car.tempLocation === currentUserRole) newHost = currentUserRole; // I am visitor sending to NWA

             await updateDoc(doc(db, COLLECTION_PATH, vin), {
                tempLocation: target,
                visitorHost: newHost,
                lastUpdated: timestamp,
                history: [...(car.history||[]), { area: target, status: 'Temp Move', timestamp: Timestamp.now(), userId, from: fromLoc, metrics: metricsSnapshot }]
            });
            showMessage(`${vin} moved to ${target}.`);
        }
        closeConfirmModal();
    } catch (e) { console.error(e); alert("Move failed: " + e.message); }
};

window.handleTrackSearch = () => {
     const vin = document.getElementById('track-vin-input').value.trim().toUpperCase();
     // Check local list first
     let car = allCars.find(c => c.vin === vin);
     const res = document.getElementById('track-result');
     
     const renderResult = (carData) => {
         let html = '';
         [...(carData.history||[])].reverse().forEach(h => {
             const isWip = h.status==='WIP';
             const isTemp = h.status === 'Temp Move';
             const isReturn = h.status === 'Returned';
             let colorClass = 'border-l-4 border-blue-200 bg-gray-50';
             let title = 'ARRIVED';
             
             if (h.status === 'Finished') { colorClass = 'border-l-4 border-green-400 bg-green-50'; title = 'COMPLETED'; }
             else if (isTemp) { colorClass = 'border-l-4 border-amber-400 bg-amber-50'; title = 'TEMP MOVE'; }
             else if (isReturn) { colorClass = 'border-l-4 border-indigo-400 bg-indigo-50'; title = 'RETURNED'; }
             else if (h.status === 'Post-WIP') { colorClass = 'border-l-4 border-purple-400 bg-purple-50'; title = 'POST-WIP'; }

             let extras = '';
             if(h.metrics) {
                 extras = `
                    <div class="mt-2 text-xs bg-white p-2 rounded border border-gray-200">
                        <div class="flex gap-3 mb-1">
                            <span class="font-semibold text-gray-600">VA: ${h.metrics.va}m</span> 
                            <span class="font-semibold text-gray-600">NVA: ${h.metrics.nva}m</span>
                            ${h.metrics.status ? `<span class="bg-gray-100 px-1 rounded">${h.metrics.status}</span>` : ''}
                        </div>
                        <div class="italic text-gray-500">"${h.metrics.comment}"</div>
                    </div>`;
             }

             html += `<div class="mb-4 pl-4 ${colorClass} p-3 rounded shadow-sm">
                <p class="font-bold text-gray-800">${h.area} <span class="text-xs font-normal bg-white border px-1 rounded ml-2">${title}</span></p>
                <p class="text-xs text-gray-500">${new Date(h.timestamp.toDate()).toLocaleString()}</p>
                ${extras}
             </div>`;
         });
         res.innerHTML = `<div class="mt-8 bg-white p-6 rounded-xl border border-gray-200 shadow-lg">
            <div class="flex justify-between items-start mb-4">
                <div>
                    <h2 class="text-3xl font-black text-indigo-900 font-mono">${carData.vin}</h2>
                    <p class="text-sm font-bold text-gray-500 uppercase tracking-wide">${carData.model || 'Unknown Model'} ${carData.modelYear || ''}</p>
                </div>
                <div class="text-right text-xs">
                    <p><span class="font-bold text-gray-600">KENN:</span> ${carData.kenn || '--'}</p>
                    <p><span class="font-bold text-gray-600">SEQ:</span> ${carData.sequence || '--'}</p>
                </div>
            </div>
            <p class="mt-2 text-lg">Currently: <strong>${carData.currentArea}</strong> (${carData.status})</p>
            <div class="mt-6 space-y-2">${html}</div>
         </div>`;
     };

     if (car) {
         renderResult(car);
     } else {
         // Fetch from DB if not found locally (finished cars)
         res.innerHTML = '<p class="text-center text-gray-500 mt-10">Searching database...</p>';
         getDoc(doc(db, COLLECTION_PATH, vin)).then(docSnap => {
             if (docSnap.exists()) {
                 renderResult(docSnap.data());
             } else {
                 res.innerHTML = '<p class="text-center text-red-500 mt-10">VIN Not Found</p>';
             }
         }).catch(err => {
             console.error(err);
             res.innerHTML = '<p class="text-center text-red-500 mt-10">Error searching database</p>';
         });
     }
};

window.openModal = (vin, history) => {
     const car = allCars.find(c => c.vin === vin);
     document.getElementById('modal-vin-title').textContent = vin;
     document.getElementById('modal-car-model').textContent = car.model || 'Unknown Model';
     document.getElementById('modal-car-kenn').textContent = car.kenn || '--';
     document.getElementById('modal-car-seq').textContent = car.sequence || '--';
     document.getElementById('modal-car-year').textContent = car.modelYear || '--';
     
     // --- NEW: AGING EVALUATION FOR HEADER COLOR ---
     const aging = getAgingDetails(car);
     const styles = getAgingStyles(aging.status);
     const header = document.getElementById('history-modal-header');
     if(header) header.className = `${styles.headerBg} p-6 text-white transition-colors duration-300`;
     
     const badgeContainer = document.getElementById('modal-aging-badge-container');
     if(badgeContainer) {
         if(aging.status !== 'normal') {
             badgeContainer.innerHTML = `<span class="inline-block mt-2 px-3 py-1 bg-white/20 rounded-full text-xs font-bold uppercase tracking-wider border border-white/30 backdrop-blur-sm shadow-sm">${styles.badgeText} (${aging.days} Working Days)</span>`;
         } else {
             badgeContainer.innerHTML = '';
         }
     }
     // ----------------------------------------------     
     // Dynamic External Links
     const date = car.history && car.history.length > 0 ? car.history[0].timestamp.toDate() : new Date();
     const scanYear = date.getFullYear(); // Changed from slice(-2) to full year
     const flagsUrl = `http://flags:8080/product-enquiry/${vin}`;
     const prodisUrl = `https://bymccrlscre4.bentley.emea.vwg/peek/#/vehicleTestData?vehicle=83${scanYear}${car.kenn}&qFilter=eq`;
     
     const externalLinks = document.getElementById('modal-external-links');
     if(externalLinks) {
         externalLinks.innerHTML = `
            <a href="${flagsUrl}" target="_blank" class="flex-1 bg-white/20 hover:bg-white/30 text-white text-center py-2 rounded-lg font-bold border border-white/20 transition">FLAGS</a>
            <a href="${prodisUrl}" target="_blank" class="flex-1 bg-white/20 hover:bg-white/30 text-white text-center py-2 rounded-lg font-bold border border-white/20 transition">PRODIS</a>
         `;
     }

     const historyContent = document.getElementById('history-content');
     historyContent.innerHTML = history.length ? '' : '<p class="text-gray-400 italic text-center">No history found.</p>';
     [...history].reverse().forEach((item, index) => {
        const isTemp = item.status === 'Temp Move';
        const isReturn = item.status === 'Returned';
        let colorClass = 'bg-blue-100 text-blue-700 border-blue-200';
        let iconColor = 'bg-blue-400';
        let icon = 'Scan In';
        
        if (item.status === 'Finished') {
            colorClass = 'bg-green-100 text-green-700 border-green-200';
            iconColor = 'bg-green-500';
            icon = 'Completed';
        } else if (isTemp) {
            colorClass = 'bg-amber-100 text-amber-800 border-amber-200';
            iconColor = 'bg-amber-500';
            icon = 'Temp Move';
        } else if (isReturn) {
            colorClass = 'bg-indigo-100 text-indigo-800 border-indigo-200';
            iconColor = 'bg-indigo-500';
            icon = 'Returned';
        } else if (item.status === 'Retrieved') {
            colorClass = 'bg-indigo-100 text-indigo-800 border-indigo-200';
            iconColor = 'bg-indigo-500';
            icon = 'Retrieved';
        } else if (item.status === 'Post-WIP') {
            colorClass = 'bg-purple-100 text-purple-800 border-purple-200';
            iconColor = 'bg-purple-500';
            icon = 'Post-WIP';
        }
        
        let metricsHtml = '';
        if (item.metrics) {
            metricsHtml = `
                <div class="mt-2 pt-2 border-t border-gray-200/50 text-xs"><div class="flex gap-3 mb-1"><span class="font-semibold">VA: ${item.metrics.va}m</span><span class="font-semibold">NVA: ${item.metrics.nva}m</span></div><div class="italic opacity-75">"${item.metrics.comment}"</div></div>`;
        }

        historyContent.innerHTML += `
            <div class="mb-4 last:mb-0 relative pl-4 border-l-2 border-gray-200">
                <div class="absolute -left-[9px] top-0 w-4 h-4 rounded-full ${iconColor} border-2 border-white"></div>
                <div class="bg-white p-3 rounded border ${colorClass} text-sm">
                    <div class="flex justify-between font-bold">
                        <span>${item.area}</span>
                        <span>${icon}</span>
                    </div>
                    <div class="flex justify-between mt-1 text-xs opacity-80">
                        <span>User: ${item.userId ? item.userId.substring(0,6) + '...' : 'Unknown'}</span>
                        <span>${formatTimestamp(item.timestamp)}</span>
                    </div>
                    ${metricsHtml}
                </div>
            </div>
        `;
     });
     document.getElementById('history-modal').classList.remove('hidden');
     document.getElementById('history-modal').classList.add('flex');
};

// GLOBAL HELPERS attached to window so onClick works
window.switchView = (v) => {
    const dash = document.getElementById('view-dashboard');
    const track = document.getElementById('view-track');
    const settings = document.getElementById('view-settings');
    const navDash = document.getElementById('nav-dashboard');
    const navTrack = document.getElementById('nav-track');
    const navSettings = document.getElementById('nav-settings');
    const analytics = document.getElementById('view-analytics');

    navDash.className = 'pb-3 text-gray-500 hover:text-indigo-600 transition-colors';
    navTrack.className = 'pb-3 text-gray-500 hover:text-indigo-600 transition-colors';
    navSettings.className = 'hidden pb-3 text-gray-500 hover:text-indigo-600 transition-colors flex items-center'; 
    navAnalytics.className = 'hidden pb-3 text-gray-500 hover:text-indigo-600 transition-colors flex items-center';
    
    // FIX: Reset Aging tab styling to default before checking visibility
    if(navAging) navAging.className = 'hidden pb-3 text-gray-500 hover:text-indigo-600 transition-colors flex items-center';

   if(['Admin', 'Manager', 'PostWIPManager'].includes(currentUserRole)) {
        if(navAging) navAging.classList.remove('hidden');
    } else {
        if(navAging) navAging.classList.add('hidden');
    }

    // Only Admin can see settings
    if(currentUserRole === 'Admin') {
        navSettings.classList.remove('hidden');
    }
    
    // Both Admin and Manager can see analytics
    if(currentUserRole === 'Admin' || currentUserRole === 'Manager') {
        if(navAnalytics) navAnalytics.classList.remove('hidden');
    }
    
    dash.classList.add('hidden');
    track.classList.add('hidden');
    settings.classList.add('hidden');
    analytics.classList.add('hidden');
    if(viewAging) viewAging.classList.add('hidden');

const addCarSection = document.getElementById('add-car-section');

    if(v==='dashboard'){ 
        dash.classList.remove('hidden'); 
        navDash.className = 'pb-3 text-indigo-600 font-bold border-b-2 border-indigo-600 transition-colors';
        const hasPermission = currentUserRole === 'Admin' || currentUserRole === 'Manager' || (appConfig.allowedAddZones && appConfig.allowedAddZones.includes(currentUserRole));
        if(hasPermission && addCarSection) addCarSection.classList.remove('hidden');
    } else if (v==='track') {
        if(addCarSection) addCarSection.classList.add('hidden');
        track.classList.remove('hidden');
        navTrack.className = 'pb-3 text-indigo-600 font-bold border-b-2 border-indigo-600 transition-colors';
    } else if (v==='settings') {
        if(addCarSection) addCarSection.classList.add('hidden');
        settings.classList.remove('hidden');
        navSettings.className = 'pb-3 text-indigo-600 font-bold border-b-2 border-indigo-600 transition-colors flex items-center';
        if(window.renderSettings) window.renderSettings();
    } else if (v==='analytics') {
        if(addCarSection) addCarSection.classList.add('hidden');
        analytics.classList.remove('hidden');
        navAnalytics.className = 'pb-3 text-indigo-600 font-bold border-b-2 border-indigo-600 transition-colors flex items-center';
        renderAnalyticsDashboard(); 
    } else if (v==='aging') {
        if(addCarSection) addCarSection.classList.add('hidden');
        if(viewAging) viewAging.classList.remove('hidden');
        if(navAging) navAging.className = 'pb-3 text-indigo-600 font-bold border-b-2 border-indigo-600 transition-colors flex items-center';
        renderAgingDashboard('both');
    }
};

window.closeHistoryModal = () => {
    document.getElementById('history-modal').classList.add('hidden');
    document.getElementById('history-modal').classList.remove('flex');
};

window.renderAgingDashboard = (filter = 'both') => {
    document.getElementById('filter-aging-both').className = `px-4 py-1.5 rounded-md text-sm font-bold transition shadow-sm ${filter === 'both' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`;
    document.getElementById('filter-aging-amber').className = `px-4 py-1.5 rounded-md text-sm font-bold transition shadow-sm ${filter === 'amber' ? 'bg-amber-500 text-white' : 'bg-white text-amber-600 hover:bg-amber-50'}`;
    document.getElementById('filter-aging-red').className = `px-4 py-1.5 rounded-md text-sm font-bold transition shadow-sm ${filter === 'red' ? 'bg-rose-600 text-white' : 'bg-white text-rose-600 hover:bg-rose-50'}`;

    const tbody = document.getElementById('aging-table-body');
    tbody.innerHTML = '';
    
    let agingCars = allCars.filter(c => c.status !== 'Finished').map(c => {
        return { car: c, aging: getAgingDetails(c) };
    }).filter(item => item.aging.status !== 'normal');
    
    if (filter !== 'both') agingCars = agingCars.filter(item => item.aging.status === filter);
    agingCars.sort((a, b) => b.aging.days - a.aging.days);
    
    if (agingCars.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-gray-400 italic">No aging vehicles found matching this filter.</td></tr>`;
        return;
    }

    agingCars.forEach(({car, aging}) => {
        const styles = getAgingStyles(aging.status);
        let locText = car.currentArea;
        if(car.tempLocation) locText += `<br><span class="text-orange-600 text-[10px] font-bold">📍 At ${car.tempLocation}</span>`;
        const draft = car.tempData || {};
        
        tbody.innerHTML += `
            <tr class="hover:bg-gray-50 transition cursor-pointer" onclick="viewCarHistory('${car.vin}')">
                <td class="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-indigo-900 font-mono hover:underline">${car.vin}</td>
                <td class="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">${car.model || '-'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-center">
                    <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${styles.bg} ${styles.text} border ${styles.border}">${styles.badgeText}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-gray-700">${aging.days} Days</td>
                <td class="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-700">${locText}</td>
                <td class="px-6 py-4 text-center text-sm text-gray-500 italic max-w-xs truncate">${draft.comment || '--'}</td>
            </tr>
        `;
    });
};


// --- ANALYTICS ENGINE ---
let chartInstances = {};

// --- PDF EXPORT LOGIC ---
window.exportToPDF = async () => {
    const btn = document.getElementById('export-pdf-btn');
    if(!btn) return;
    
    const originalText = btn.innerHTML;
    btn.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Generating...`;
    btn.disabled = true;

    try {
        const { jsPDF } = window.jspdf;
        // 'l' sets orientation to Landscape, 'a4' is the format
        const pdf = new jsPDF('l', 'mm', 'a4');
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        
        // Find checked boxes
        const checkboxes = document.querySelectorAll('.export-cb:checked');
        if (checkboxes.length === 0) {
            alert("Please select at least one chart to export.");
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
        }

        // Loop through selected chart containers
        for (let i = 0; i < checkboxes.length; i++) {
            const targetId = checkboxes[i].dataset.target;
            const element = document.getElementById(targetId);
            if (!element) continue;

            // Add a new page for every chart AFTER the first one
            if (i > 0) {
                pdf.addPage();
            }

            // --- FIX: Temporarily replace date inputs with standard divs to prevent html2canvas text clipping ---
            const dateInputs = element.querySelectorAll('input[type="date"]');
            const placeholders = [];
            dateInputs.forEach(input => {
                const div = document.createElement('div');
                div.textContent = input.value;
                div.className = input.className; // Copy existing Tailwind classes
                // Force flexbox centering to guarantee text isn't cut off vertically
                div.style.display = 'inline-flex';
                div.style.alignItems = 'center';
                div.style.boxSizing = 'border-box';
                // Match dimensions exactly
                div.style.width = input.offsetWidth + 'px';
                div.style.height = input.offsetHeight + 'px';
                
                input.parentNode.insertBefore(div, input);
                input.style.display = 'none'; // Hide the native input
                placeholders.push({ input, div });
            });

            // Capture HTML as image
            const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff' });
            const imgData = canvas.toDataURL('image/png');

            // Restore original native date inputs immediately after capture
            placeholders.forEach(({ input, div }) => {
                input.style.display = '';
                div.remove();
            });
            // --------------------------------------------------------------------------------------------------

            // Dimensions and scaling logic to prevent clipping
            const margin = 10; // 10mm margin on all sides
            const maxW = pageWidth - (margin * 2);
            const maxH = pageHeight - (margin * 2);

            const imgProps = pdf.getImageProperties(imgData);
            const ratio = imgProps.width / imgProps.height;

            let finalW = maxW;
            let finalH = finalW / ratio;

            // If scaling to max width makes it too tall for the page, scale to max height instead
            if (finalH > maxH) {
                finalH = maxH;
                finalW = finalH * ratio;
            }

            // Center the image perfectly on the page
            const xOffset = (pageWidth - finalW) / 2;
            const yOffset = (pageHeight - finalH) / 2;

            pdf.addImage(imgData, 'PNG', xOffset, yOffset, finalW, finalH);
        }

        // Trigger Download
        pdf.save(`Analytics_Report_${new Date().toISOString().split('T')[0]}.pdf`);
        
    } catch (error) {
        console.error("PDF Export Error:", error);
        alert("An error occurred while generating the PDF. Please try again.");
    } finally {
        // Reset Button
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

// NEW: Custom Plugin to draw numbers inside stacked bars and totals at the top
const stackedBarLabelPlugin = {
    id: 'stackedBarLabelPlugin',
    afterDatasetsDraw(chart) {
        const { ctx } = chart;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const numBars = chart.data.labels.length;
        for (let i = 0; i < numBars; i++) {
            let total = 0;
            let topY = null;
            let barX = null;

            chart.data.datasets.forEach((dataset, datasetIndex) => {
                if (dataset.type === 'line') return; // Skip the Max WIP line
                
                const meta = chart.getDatasetMeta(datasetIndex);
                if (meta.hidden) return;

                const val = dataset.data[i];
                if (val > 0) {
                    total += val;
                    const element = meta.data[i];
                    if (element) {
                        barX = element.x;
                        const centerY = (element.y + element.base) / 2; // Center of the specific segment
                        
                        // Keep track of the highest point of the bar stack
                        if (topY === null || element.y < topY) {
                            topY = element.y;
                        }

                        // Draw inside segment number
                        ctx.fillStyle = '#ffffff'; // White text
                        ctx.font = 'bold 11px sans-serif';
                        ctx.fillText(val, barX, centerY);
                    }
                }
            });

            // Draw total at the top of the bar
            if (total > 0 && barX !== null && topY !== null) {
                ctx.fillStyle = '#374151'; // Dark gray text
                ctx.font = 'bold 14px sans-serif';
                ctx.fillText(total, barX, topY - 12);
            }
        }
    }
};

// NEW: Handle Custom Dropdowns
window.toggleDropdown = (id, event) => {
    if(event) event.stopPropagation();
    document.getElementById(id).classList.toggle('hidden');
};

// Close dropdowns if clicking anywhere outside them
document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown-container')) {
        const d1 = document.getElementById('dropdown-hist-zones');
        const d2 = document.getElementById('dropdown-trend-zones');
        if(d1 && !d1.classList.contains('hidden')) d1.classList.add('hidden');
        if(d2 && !d2.classList.contains('hidden')) d2.classList.add('hidden');
    }
});

window.renderAnalyticsDashboard = () => {
    if(!allCars || allCars.length === 0) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const d = new Date(); d.setDate(d.getDate() - 14); // 14 days ago
    const twoWeeksAgoStr = d.toISOString().split('T')[0];
    
    // Set default dates if empty
    if(!analyticsDailyTpDate.value) analyticsDailyTpDate.value = todayStr;
    if(!analyticsWipDate.value) analyticsWipDate.value = todayStr;
    if(!analyticsPostWipDate.value) analyticsPostWipDate.value = todayStr;
    
    // Line graph defaults
    if(!analyticsHistEnd.value) analyticsHistEnd.value = todayStr;
    if(!analyticsHistStart.value) analyticsHistStart.value = twoWeeksAgoStr;
    if(!analyticsReworkEnd.value) analyticsReworkEnd.value = todayStr;
    if(!analyticsReworkStart.value) analyticsReworkStart.value = twoWeeksAgoStr;
    if(!analyticsTrendEnd.value) analyticsTrendEnd.value = todayStr;
    if(!analyticsTrendStart.value) analyticsTrendStart.value = twoWeeksAgoStr;
    
    // Populate zone selectors if empty (filter out "Add Car" zones for trend)
	// Populate dropdown checkboxes if empty
    const histDropdown = document.getElementById('dropdown-hist-zones');
    const trendDropdown = document.getElementById('dropdown-trend-zones');
    
    if(histDropdown && histDropdown.children.length === 0) {
        appConfig.areas.forEach(a => {
            histDropdown.innerHTML += `
                <label class="flex items-center px-4 py-2 hover:bg-gray-50 cursor-pointer text-sm text-gray-700">
                    <input type="checkbox" value="${a}" class="form-checkbox h-4 w-4 text-indigo-600 mr-2 hist-zone-cb" checked onchange="renderHistoricalThroughputChart()">
                    ${a}
                </label>
            `;
        });
        
        const filteredAreas = appConfig.areas.filter(a => !(appConfig.allowedAddZones || []).includes(a));
        filteredAreas.forEach(a => {
            trendDropdown.innerHTML += `
                <label class="flex items-center px-4 py-2 hover:bg-gray-50 cursor-pointer text-sm text-gray-700">
                    <input type="checkbox" value="${a}" class="form-checkbox h-4 w-4 text-indigo-600 mr-2 trend-zone-cb" checked onchange="renderReworkTrendLineChart()">
                    ${a}
                </label>
            `;
        });
    }

    renderDailyThroughputChart();
    renderHistoricalThroughputChart();
    renderWipStatusChart();
    renderPostWipStatusChart();
    renderAvgReworkChart();
    renderReworkTrendLineChart();
};

const getChartContext = (id) => {
    const ctx = document.getElementById(id).getContext('2d');
    if (chartInstances[id]) chartInstances[id].destroy();
    return ctx;
};

// 1. Daily Throughput per Zone (Bar)
window.renderDailyThroughputChart = () => {
    const targetDateStr = analyticsDailyTpDate.value;
    if(!targetDateStr) return;

    const counts = {};
    appConfig.areas.forEach(a => counts[a] = 0);

    allCars.forEach(car => {
        if(car.history) {
            car.history.forEach(h => {
                if(h.status === 'Finished') {
                    const dateStr = h.timestamp.toDate ? h.timestamp.toDate().toISOString().split('T')[0] : new Date(h.timestamp).toISOString().split('T')[0];
                    if(dateStr === targetDateStr && counts[h.area] !== undefined) {
                        counts[h.area]++;
                    }
                }
            });
        }
    });

    chartInstances['chart-daily-throughput'] = new Chart(getChartContext('chart-daily-throughput'), {
        type: 'bar',
        data: {
            labels: appConfig.areas,
            datasets: [{
                label: `Completed on ${targetDateStr}`,
                data: appConfig.areas.map(a => counts[a]),
                backgroundColor: '#004225',
                borderRadius: 4
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
};

// 2. Historical Throughput (Multi-Line)
window.renderHistoricalThroughputChart = () => {
    const startStr = analyticsHistStart.value;
    const endStr = analyticsHistEnd.value;
    if(!startStr || !endStr) return;

    const selectedZones = Array.from(document.querySelectorAll('.hist-zone-cb:checked')).map(cb => cb.value);
    
    const dates = [];
    let currDate = new Date(startStr);
    const endDate = new Date(endStr);
    while(currDate <= endDate) {
        dates.push(currDate.toISOString().split('T')[0]);
        currDate.setDate(currDate.getDate() + 1);
    }

    const datasetsMap = {};
    const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16'];
    
    selectedZones.forEach((zone, index) => {
        datasetsMap[zone] = {
            label: zone,
            data: dates.map(() => 0), 
            borderColor: colors[index % colors.length],
            backgroundColor: 'transparent',
            tension: 0.3
        };
    });

    allCars.forEach(car => {
        if(car.history) {
            car.history.forEach(h => {
                if(h.status === 'Finished' && selectedZones.includes(h.area)) {
                    const dateStr = h.timestamp.toDate ? h.timestamp.toDate().toISOString().split('T')[0] : new Date(h.timestamp).toISOString().split('T')[0];
                    const dateIndex = dates.indexOf(dateStr);
                    if(dateIndex !== -1) {
                        datasetsMap[h.area].data[dateIndex]++;
                    }
                }
            });
        }
    });

    chartInstances['chart-hist-throughput'] = new Chart(getChartContext('chart-hist-throughput'), {
        type: 'line',
        data: {
            labels: dates.map(d => d.slice(5)), // MM-DD
            datasets: Object.values(datasetsMap)
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
};

// 3. WIP Status (Stacked Bar actual, Line max)
window.renderWipStatusChart = () => {
    const targetDateStr = analyticsWipDate.value;
    if(!targetDateStr) return;
    
    const targetDate = new Date(targetDateStr);
    targetDate.setHours(23, 59, 59, 999);

    const models = appConfig.models || [];
    const counts = {};
    appConfig.areas.forEach(a => {
        counts[a] = { 'Unknown': 0 };
        models.forEach(m => counts[a][m] = 0);
    });

    allCars.forEach(car => {
        if(!car.history) return;
        const sortedHistory = [...car.history].sort((a,b) => (a.timestamp.toDate ? a.timestamp.toDate() : new Date(a.timestamp)) - (b.timestamp.toDate ? b.timestamp.toDate() : new Date(b.timestamp)));
        let lastStatus = null, lastArea = null;

        for(let entry of sortedHistory) {
            const eDate = entry.timestamp.toDate ? entry.timestamp.toDate() : new Date(entry.timestamp);
            if(eDate <= targetDate) {
                lastStatus = entry.status;
                lastArea = entry.area;
            } else { break; }
        }

        if(lastStatus === 'WIP' && counts[lastArea] !== undefined) {
            const carModel = (car.model && counts[lastArea][car.model] !== undefined) ? car.model : 'Unknown';
            counts[lastArea][carModel]++;
        }
    });

    const maxWips = appConfig.areas.map(a => (appConfig.maxWip && appConfig.maxWip[a]) ? appConfig.maxWip[a] : 0);
    const colors = ['#004225', '#6b7280', '#9ca3af', '#374151', '#d1d5db', '#1f2937'];

    const datasets = [
        {
            type: 'line',
            label: 'Max WIP',
            data: maxWips,
            borderColor: '#9ca3af',
            backgroundColor: '#9ca3af',
            borderDash: [5, 5],
            fill: false,
            tension: 0
        }
    ];

    models.forEach((m, idx) => {
        datasets.push({ type: 'bar', label: m, data: appConfig.areas.map(a => counts[a][m]), backgroundColor: colors[idx % colors.length] });
    });
    datasets.push({ type: 'bar', label: 'Unknown Model', data: appConfig.areas.map(a => counts[a]['Unknown']), backgroundColor: '#94a3b8' });

    chartInstances['chart-wip-status'] = new Chart(getChartContext('chart-wip-status'), {
        type: 'bar', // Explicitly declare base type
        data: { labels: appConfig.areas, datasets: datasets },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            layout: { padding: { top: 25 } }, // Extra space for the total label
            scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } 
        },
        plugins: [stackedBarLabelPlugin] // INJECT CUSTOM PLUGIN
    });
};

// 3.5. Post-WIP Status (Stacked Bar actual, Line max)
window.renderPostWipStatusChart = () => {
    const targetDateStr = analyticsPostWipDate.value;
    if(!targetDateStr) return;
    
    const targetDate = new Date(targetDateStr);
    targetDate.setHours(23, 59, 59, 999);

    const zones = appConfig.postWipZones || [];
    const models = appConfig.models || [];
    const counts = {};
    zones.forEach(z => {
        counts[z] = { 'Unknown': 0 };
        models.forEach(m => counts[z][m] = 0);
    });

    allCars.forEach(car => {
        if(!car.history) return;
        const sortedHistory = [...car.history].sort((a,b) => (a.timestamp.toDate ? a.timestamp.toDate() : new Date(a.timestamp)) - (b.timestamp.toDate ? b.timestamp.toDate() : new Date(b.timestamp)));
        let lastStatus = null, lastArea = null;

        for(let entry of sortedHistory) {
            const eDate = entry.timestamp.toDate ? entry.timestamp.toDate() : new Date(entry.timestamp);
            if(eDate <= targetDate) {
                lastStatus = entry.status;
                lastArea = entry.area;
            } else { break; }
        }

        if(lastStatus === 'Post-WIP' && counts[lastArea] !== undefined) {
            const carModel = (car.model && counts[lastArea][car.model] !== undefined) ? car.model : 'Unknown';
            counts[lastArea][carModel]++;
        }
    });

    const maxWips = zones.map(z => (appConfig.maxWip && appConfig.maxWip[z]) ? appConfig.maxWip[z] : 0);
    const colors = ['#004225', '#6b7280', '#9ca3af', '#374151', '#d1d5db', '#1f2937'];

    const datasets = [
        {
            type: 'line',
            label: 'Max WIP',
            data: maxWips,
            borderColor: '#9ca3af',
            backgroundColor: '#9ca3af',
            borderDash: [5, 5],
            fill: false,
            tension: 0
        }
    ];

    models.forEach((m, idx) => {
        datasets.push({ type: 'bar', label: m, data: zones.map(z => counts[z][m]), backgroundColor: colors[idx % colors.length] });
    });
    datasets.push({ type: 'bar', label: 'Unknown Model', data: zones.map(z => counts[z]['Unknown']), backgroundColor: '#94a3b8' });

    chartInstances['chart-post-wip-status'] = new Chart(getChartContext('chart-post-wip-status'), {
        type: 'bar', // Explicitly declare base type
        data: { labels: zones, datasets: datasets },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            layout: { padding: { top: 25 } }, // Extra space for the total label
            scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } 
        },
        plugins: [stackedBarLabelPlugin] // INJECT CUSTOM PLUGIN
    });
};


// 4. Average Rework Time (Stacked VA/NVA) - FILTERED
window.renderAvgReworkChart = () => {
    const startStr = analyticsReworkStart.value;
    const endStr = analyticsReworkEnd.value;
    if(!startStr || !endStr) return;

    const startDate = new Date(startStr);
    startDate.setHours(0,0,0,0);
    const endDate = new Date(endStr);
    endDate.setHours(23,59,59,999);

    // FILTER: Exclude any zones that have "Add Car" enabled
    const allowedAddZones = appConfig.allowedAddZones || [];
    const filteredAreas = appConfig.areas.filter(a => !allowedAddZones.includes(a));

    const vaTotal = {};
    const nvaTotal = {};
    const counts = {};
    filteredAreas.forEach(a => { vaTotal[a] = 0; nvaTotal[a] = 0; counts[a] = 0; });

    allCars.forEach(car => {
        if(car.history) {
            car.history.forEach(h => {
                if(!filteredAreas.includes(h.area)) return;

                const hDate = h.timestamp.toDate ? h.timestamp.toDate() : new Date(h.timestamp);
                
                if(hDate >= startDate && hDate <= endDate) {
                    if(h.metrics && (h.status === 'Finished' || h.status.includes('Temp') || h.status.includes('WIP'))) {
                        if((parseInt(h.metrics.va) > 0 || parseInt(h.metrics.nva) > 0) && counts[h.area] !== undefined) {
                            vaTotal[h.area] += parseInt(h.metrics.va || 0);
                            nvaTotal[h.area] += parseInt(h.metrics.nva || 0);
                            counts[h.area]++;
                        }
                    }
                }
            });
        }
    });

    const vaAvg = filteredAreas.map(a => counts[a] > 0 ? Math.round(vaTotal[a] / counts[a]) : 0);
    const nvaAvg = filteredAreas.map(a => counts[a] > 0 ? Math.round(nvaTotal[a] / counts[a]) : 0);

    chartInstances['chart-avg-rework'] = new Chart(getChartContext('chart-avg-rework'), {
        type: 'bar',
        data: {
            labels: filteredAreas, 
            datasets: [
                { label: 'Avg Value Added (mins)', data: vaAvg, backgroundColor: '#3b82f6', borderRadius: {bottomLeft: 4, bottomRight: 4} },
                { label: 'Avg Non-Value Added (mins)', data: nvaAvg, backgroundColor: '#f59e0b', borderRadius: {topLeft: 4, topRight: 4} }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }
    });
};

// 5. Rework Time Trends (Line Graph) - TOTAL TIME (VA + NVA)
window.renderReworkTrendLineChart = () => {
    const startStr = analyticsTrendStart.value;
    const endStr = analyticsTrendEnd.value;
    if(!startStr || !endStr) return;

    const selectedZones = Array.from(document.querySelectorAll('.trend-zone-cb:checked')).map(cb => cb.value);
    
    const dates = [];
    let currDate = new Date(startStr);
    const endDate = new Date(endStr);
    while(currDate <= endDate) {
        dates.push(currDate.toISOString().split('T')[0]);
        currDate.setDate(currDate.getDate() + 1);
    }

    const datasetsMap = {};
    const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16'];
    
    selectedZones.forEach((zone, index) => {
        datasetsMap[zone] = {
            label: zone,
            data: dates.map(() => 0), 
            _counts: dates.map(() => 0), 
            borderColor: colors[index % colors.length],
            backgroundColor: 'transparent',
            tension: 0.3
        };
    });

    allCars.forEach(car => {
        if(car.history) {
            car.history.forEach(h => {
                if(selectedZones.includes(h.area)) {
                    const hDate = h.timestamp.toDate ? h.timestamp.toDate() : new Date(h.timestamp);
                    const dateStr = hDate.toISOString().split('T')[0];
                    const dateIndex = dates.indexOf(dateStr);
                    
                    if(dateIndex !== -1 && h.metrics) {
                        const va = parseInt(h.metrics.va) || 0;
                        const nva = parseInt(h.metrics.nva) || 0;
                        const totalTime = va + nva; 
                        
                        if(totalTime > 0) {
                            datasetsMap[h.area].data[dateIndex] += totalTime;
                            datasetsMap[h.area]._counts[dateIndex]++;
                        }
                    }
                }
            });
        }
    });

    selectedZones.forEach(zone => {
        datasetsMap[zone].data = datasetsMap[zone].data.map((total, idx) => {
            const count = datasetsMap[zone]._counts[idx];
            return count > 0 ? Math.round(total / count) : 0;
        });
    });

    chartInstances['chart-rework-trend-line'] = new Chart(getChartContext('chart-rework-trend-line'), {
        type: 'line',
        data: {
            labels: dates.map(d => d.slice(5)), 
            datasets: Object.values(datasetsMap)
        },
        options: { 
            responsive: true, maintainAspectRatio: false, 
            scales: { y: { beginAtZero: true, title: { display: true, text: 'Avg Total Time (VA+NVA mins)' } } } 
        }
    });
};

// Init
const init = async () => {
    await fetchUKBankHolidays();
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    if (initialAuthToken) try { await signInWithCustomToken(auth, initialAuthToken); } catch { await signInAnonymously(auth); } else await signInAnonymously(auth);

    onAuthStateChanged(auth, u => {
        if(u) {
            userId = u.uid;
            document.getElementById('login-status').textContent = "Ready.";
            // Load config first
            loadConfiguration();
            
            // Old Scan removed or updated. The button to open modal is now the primary action.
            document.getElementById('track-vin-input').addEventListener('keypress', e => { if(e.key==='Enter') handleTrackSearch(); });

            onSnapshot(query(collection(db, COLLECTION_PATH)), (s) => {
                const docs = []; s.forEach(d => docs.push(d));
                processSnapshotData(docs);
            });
        }
    });
};
	

init();




