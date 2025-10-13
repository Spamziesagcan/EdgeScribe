// main_page.js - Complete Frontend Logic (API, Theme, & Recent History)

// =================================================================
// 1. CONFIGURATION & STATE
// =================================================================
const SUPPORTED_LANGUAGES = [
    { code: 'en', name: 'English' }, { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' }, { code: 'de', name: 'German' },
    { code: 'hi', name: 'Hindi' }, { code: 'gu', name: 'Gujarati' },
    { code: 'mr', name: 'Marathi' }, { code: 'it', name: 'Italian' },
    { code: 'ja', name: 'Japanese' }, { code: 'ko', name: 'Korean' },
    { code: 'pt', name: 'Portuguese' }, { code: 'ru', name: 'Russian' },
    { code: 'zh', name: 'Chinese' }, { code: 'ar', name: 'Arabic' },
];

// State to hold history during the session
let summariesHistory = [];

// =================================================================
// 2. DOM ELEMENT REFERENCES
// =================================================================
// Form & Inputs
const summarizationForm = document.getElementById('summarizationForm');
const inputText = document.getElementById('inputText');
const charCounter = document.getElementById('charCounter');
const sourceSelect = document.getElementById('sourceLanguageSelect');
const targetSelect = document.getElementById('languageSelect');
const summarizeButton = document.getElementById('btnSummarize');
const clearButton = document.getElementById('btnClear');

// Results Area
const cardLoading = document.getElementById('cardLoading');
const cardError = document.getElementById('cardError');
const cardOriginal = document.getElementById('cardOriginal');
const cardTranslated = document.getElementById('cardTranslated');
const errorMessage = document.getElementById('errorMessage');
const textOriginal = document.getElementById('textOriginal');
const textTranslated = document.getElementById('textTranslated');
const titleTranslated = document.getElementById('titleTranslated');

// History Table
const tableBody = document.querySelector('#tableSummaries tbody');
const paginationInfo = document.getElementById('paginationInfo');

// Theme Elements
const themeToggleBtn = document.getElementById('themeToggleBtn');
const body = document.body;

// =================================================================
// 3. CORE FUNCTIONS (Theme & Setup)
// =================================================================

function applyTheme(theme) {
    if (theme === 'dark') {
        body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
    } else {
        body.classList.remove('dark-mode');
        localStorage.setItem('theme', 'light');
    }
    // Update button text/icon if needed based on your specific HTML
    const iconSpan = themeToggleBtn.querySelector('span');
    if (iconSpan) iconSpan.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
    const currentTheme = localStorage.getItem('theme') || 'light';
    applyTheme(currentTheme === 'light' ? 'dark' : 'light');
}

function populateLanguageDropdowns() {
    if (!sourceSelect || !targetSelect) return;
    SUPPORTED_LANGUAGES.forEach(lang => {
        const option = document.createElement('option');
        option.value = lang.code;
        option.textContent = lang.name;
        sourceSelect.appendChild(option.cloneNode(true));
        targetSelect.appendChild(option);
    });
    sourceSelect.value = 'en';
    targetSelect.value = 'hi';
}

function getLanguageName(code) {
    const lang = SUPPORTED_LANGUAGES.find(l => l.code === code);
    return lang ? lang.name : code.toUpperCase();
}

// =================================================================
// 4. HISTORY TABLE FUNCTIONS (NEW)
// =================================================================

function updateHistoryTable() {
    // Clear current table body
    tableBody.innerHTML = '';

    if (summariesHistory.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">No summaries generated yet in this session.</td></tr>';
        paginationInfo.textContent = 'Showing 0 of 0';
        return;
    }

    // Render rows (newest first)
    summariesHistory.forEach((item, index) => {
        const row = document.createElement('tr');
        const langName = getLanguageName(item.targetLang);
        
        // Format time (e.g., 10:30 AM)
        const timeString = item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        row.innerHTML = `
            <td><span class="fw-medium">${timeString}</span></td>
            <td class="text-end">${item.charCount}</td>
            <td><span class="badge bg-secondary">${langName}</span></td>
            <td class="text-end text-muted">--</td>
            <td><span class="badge bg-success">Success</span></td>
            <td>
                <button class="btn btn-sm btn-outline-primary view-history-btn" data-index="${index}" title="View this summary">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });

    paginationInfo.textContent = `Showing 1–${summariesHistory.length} of ${summariesHistory.length}`;

    // Add click listeners to new "View" buttons
    document.querySelectorAll('.view-history-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = e.currentTarget.getAttribute('data-index');
            loadHistoryItem(summariesHistory[index]);
            // Smooth scroll back up to results
            document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
        });
    });
}

function addToHistory(inputText, apiData) {
    const historyItem = {
        id: Date.now(),
        timestamp: new Date(),
        charCount: inputText.length,
        sourceLang: apiData.source_language || 'en', // Assuming API returns this, else default
        targetLang: apiData.target_language,
        summary: apiData.summary,
        translated: apiData.translated
    };
    
    // Add to beginning of array
    summariesHistory.unshift(historyItem);
    
    // Keep only last 10 items to prevent memory issues
    if (summariesHistory.length > 10) {
        summariesHistory.pop();
    }

    updateHistoryTable();
}

// Function to re-display a history item in the main result area
function loadHistoryItem(item) {
    displayResults({
        summary: item.summary,
        translated: item.translated,
        target_language: item.targetLang
    });
}

// =================================================================
// 5. API & FORM HANDLING
// =================================================================

async function handleSummarize(event) {
    event.preventDefault();
    const text = inputText.value;
    const sourceLang = sourceSelect.value;
    const targetLang = targetSelect.value;

    if (text.trim().length === 0) {
        Swal.fire({ icon: 'warning', title: 'Input Required', text: 'Please enter some text.' });
        return;
    }

    // UI Loading State
    summarizeButton.disabled = true;
    summarizeButton.querySelector('.btn-label').classList.add('d-none');
    summarizeButton.querySelector('.btn-loading').classList.remove('d-none');
    cardLoading.style.display = 'block';
    hideResults();

    try {
        const response = await fetch('/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, sourceLang, targetLang }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Server Error');
        }

        const data = await response.json();
        
        // 1. Show results
        displayResults(data);
        
        // 2. Add to Recent Summaries Table (NEW!)
        addToHistory(text, data);

        // 3. Show success toast
        const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
        Toast.fire({ icon: 'success', title: 'Summary generated!' });

    } catch (error) {
        console.error('Error:', error);
        displayError(error.message);
    } finally {
        // Reset UI State
        summarizeButton.disabled = false;
        summarizeButton.querySelector('.btn-label').classList.remove('d-none');
        summarizeButton.querySelector('.btn-loading').classList.add('d-none');
        cardLoading.style.display = 'none';
    }
}

function displayResults(data) {
    hideResults(); // Clear previous errors
    textOriginal.textContent = data.summary;
    cardOriginal.style.display = 'block';

    if (data.translated && data.target_language !== 'en') {
        titleTranslated.textContent = `Translated Summary (${getLanguageName(data.target_language)})`;
        textTranslated.textContent = data.translated;
        cardTranslated.style.display = 'block';
    }
}

function hideResults() {
    cardError.style.display = 'none';
    cardOriginal.style.display = 'none';
    cardTranslated.style.display = 'none';
}

function displayError(message) {
    hideResults();
    errorMessage.textContent = message;
    cardError.style.display = 'block';
}

function updateCharCounter() {
    charCounter.textContent = `${inputText.value.length} / 5000`;
}

function clearAll() {
    inputText.value = '';
    updateCharCounter();
    hideResults();
    sourceSelect.value = 'en';
    targetSelect.value = 'hi';
}

// =================================================================
// 6. INITIALIZATION
// =================================================================

function initialize() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    applyTheme(savedTheme);
    populateLanguageDropdowns();
    updateCharCounter();
    
    // Initialize empty table
    updateHistoryTable();

    // Event Listeners
    summarizationForm.addEventListener('submit', handleSummarize);
    inputText.addEventListener('input', updateCharCounter);
    clearButton.addEventListener('click', clearAll);
    if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);
}

// Run on load
initialize();
