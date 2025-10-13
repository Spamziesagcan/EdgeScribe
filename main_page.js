// main_page.js - Complete Frontend Logic for EdgeScribe (with Theme Toggle)

// =================================================================
// 1. LANGUAGE CONFIGURATION
// =================================================================
const SUPPORTED_LANGUAGES = [
    { code: 'en', name: 'English' }, { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' }, { code: 'de', name: 'German' },
    { code: 'hi', name: 'Hindi (हिन्दी)' }, { code: 'gu', name: 'Gujarati (ગુજરાતી)' },
    { code: 'mr', name: 'Marathi (मराठी)' }, { code: 'it', name: 'Italian' },
    { code: 'ja', name: 'Japanese' }, { code: 'ko', name: 'Korean' },
    { code: 'pt', name: 'Portuguese' }, { code: 'ru', name: 'Russian' },
    { code: 'zh', name: 'Chinese' }, { code: 'ar', name: 'Arabic' },
];

// =================================================================
// 2. DOM ELEMENT REFERENCES
// =================================================================
// API Elements
const summarizationForm = document.getElementById('summarizationForm');
const inputText = document.getElementById('inputText');
const charCounter = document.getElementById('charCounter');
const sourceSelect = document.getElementById('sourceLanguageSelect');
const targetSelect = document.getElementById('languageSelect');
const summarizeButton = document.getElementById('btnSummarize');
const clearButton = document.getElementById('btnClear');
const cardLoading = document.getElementById('cardLoading');
const cardError = document.getElementById('cardError');
const cardOriginal = document.getElementById('cardOriginal');
const cardTranslated = document.getElementById('cardTranslated');
const errorMessage = document.getElementById('errorMessage');
const textOriginal = document.getElementById('textOriginal');
const textTranslated = document.getElementById('textTranslated');
const titleTranslated = document.getElementById('titleTranslated');

// THEME Elements
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeToggleBtnTop = document.getElementById('themeToggleBtnTop');
const themeIcon = document.getElementById('themeIcon');
const themeIconTop = document.getElementById('themeIconTop');
const body = document.body;

// =================================================================
// 3. CORE FUNCTIONS
// =================================================================

// --- Theme Management ---
function applyTheme(theme) {
    if (theme === 'dark') {
        body.classList.add('dark-mode');
        if (themeIcon) themeIcon.textContent = '☀️';
        if (themeIconTop) themeIconTop.textContent = '☀️';
        localStorage.setItem('theme', 'dark');
    } else {
        body.classList.remove('dark-mode');
        if (themeIcon) themeIcon.textContent = '🌙';
        if (themeIconTop) themeIconTop.textContent = '🌙';
        localStorage.setItem('theme', 'light');
    }
}

function toggleTheme() {
    const currentTheme = localStorage.getItem('theme') || 'light';
    applyTheme(currentTheme === 'light' ? 'dark' : 'light');
}

function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light'; // Default to light theme
    applyTheme(savedTheme);
}

// --- Language Dropdown ---
function populateLanguageDropdowns() {
    if (!sourceSelect || !targetSelect) {
        console.error("Fatal Error: Could not find language select elements.");
        return;
    }
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

// --- API & Form Handling ---
async function handleSummarize(event) {
    event.preventDefault();
    const text = inputText.value;
    const sourceLang = sourceSelect.value;
    const targetLang = targetSelect.value;

    if (text.trim().length === 0) {
        Swal.fire({ icon: 'warning', title: 'Input Required', text: 'Please enter some text.' });
        return;
    }

    summarizeButton.disabled = true;
    summarizeButton.querySelector('.btn-label').classList.add('d-none');
    summarizeButton.querySelector('.btn-loading').classList.remove('d-none');
    cardLoading.style.display = 'block';
    cardError.style.display = 'none';
    cardOriginal.style.display = 'none';
    cardTranslated.style.display = 'none';

    try {
        const response = await fetch('/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, sourceLang, targetLang }),
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        displayResults(data);
    } catch (error) {
        console.error('API Call Failed:', error);
        displayError(error.message);
    } finally {
        summarizeButton.disabled = false;
        summarizeButton.querySelector('.btn-label').classList.remove('d-none');
        summarizeButton.querySelector('.btn-loading').classList.add('d-none');
        cardLoading.style.display = 'none';
    }
}

function displayResults(data) {
    textOriginal.textContent = data.summary;
    cardOriginal.style.display = 'block';

    if (data.translated && data.target_language !== 'en') {
        const targetLanguage = SUPPORTED_LANGUAGES.find(l => l.code === data.target_language);
        titleTranslated.textContent = `Translated Summary (${targetLanguage ? targetLanguage.name : data.target_language})`;
        textTranslated.textContent = data.translated;
        cardTranslated.style.display = 'block';
    } else {
        cardTranslated.style.display = 'none';
    }
}

function displayError(message) {
    errorMessage.textContent = message;
    cardError.style.display = 'block';
}

function updateCharCounter() {
    const count = inputText.value.length;
    charCounter.textContent = `${count} / 5000`;
}

function clearAll() {
    inputText.value = '';
    updateCharCounter();
    cardOriginal.style.display = 'none';
    cardTranslated.style.display = 'none';
    cardError.style.display = 'none';
    sourceSelect.value = 'en';
    targetSelect.value = 'hi';
}

// =================================================================
// 4. INITIALIZATION
// Set up event listeners and run startup functions.
// =================================================================

function initialize() {
    // Run on page load
    initializeTheme();
    populateLanguageDropdowns();
    updateCharCounter();

    // Attach event listeners
    summarizationForm.addEventListener('submit', handleSummarize);
    inputText.addEventListener('input', updateCharCounter);
    clearButton.addEventListener('click', clearAll);
    if(themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);
    if(themeToggleBtnTop) themeToggleBtnTop.addEventListener('click', toggleTheme);
}

// Start the application
initialize();
