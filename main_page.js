// main_page.js - Complete Frontend Logic for EdgeScribe

// =================================================================
// 1. LANGUAGE CONFIGURATION
// Single source of truth for all supported languages.
// =================================================================
const SUPPORTED_LANGUAGES = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'hi', name: 'Hindi (हिन्दी)' },
    { code: 'gu', name: 'Gujarati (ગુજરાતી)' },
    { code: 'mr', name: 'Marathi (मराठी)' },
    { code: 'it', name: 'Italian' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'ru', name: 'Russian' },
    { code: 'zh', name: 'Chinese' },
    { code: 'ar', name: 'Arabic' },
];

// =================================================================
// 2. DOM ELEMENT REFERENCES
// Get references to all the HTML elements we need to interact with.
// These IDs are taken directly from your index.html file.
// =================================================================
const summarizationForm = document.getElementById('summarizationForm');
const inputText = document.getElementById('inputText');
const charCounter = document.getElementById('charCounter');
const sourceSelect = document.getElementById('sourceLanguageSelect');
const targetSelect = document.getElementById('languageSelect'); // CORRECT ID USED HERE
const summarizeButton = document.getElementById('btnSummarize');
const clearButton = document.getElementById('btnClear');

// Result Cards
const cardLoading = document.getElementById('cardLoading');
const cardError = document.getElementById('cardError');
const cardOriginal = document.getElementById('cardOriginal');
const cardTranslated = document.getElementById('cardTranslated');

// Result Text Elements
const errorMessage = document.getElementById('errorMessage');
const textOriginal = document.getElementById('textOriginal');
const textTranslated = document.getElementById('textTranslated');
const titleTranslated = document.getElementById('titleTranslated');


// =================================================================
// 3. CORE FUNCTIONS
// =================================================================

/**
 * Populates the language dropdowns from our SUPPORTED_LANGUAGES list.
 */
function populateLanguageDropdowns() {
    if (!sourceSelect || !targetSelect) {
        console.error("Fatal Error: Could not find language select elements in the HTML.");
        return;
    }

    SUPPORTED_LANGUAGES.forEach(lang => {
        const option = document.createElement('option');
        option.value = lang.code;
        option.textContent = lang.name;

        sourceSelect.appendChild(option.cloneNode(true));
        targetSelect.appendChild(option);
    });

    // Set default values
    sourceSelect.value = 'en';
    targetSelect.value = 'hi';
}

/**
 * Handles the form submission, calls the backend worker, and manages UI states.
 * @param {Event} event - The form submission event.
 */
async function handleSummarize(event) {
    event.preventDefault(); // Prevent the form from reloading the page

    const text = inputText.value;
    const sourceLang = sourceSelect.value;
    const targetLang = targetSelect.value;

    if (text.trim().length === 0) {
        Swal.fire({
            icon: 'warning',
            title: 'Input Required',
            text: 'Please enter some text to summarize.',
        });
        return;
    }

    // --- Show Loading State ---
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
        // --- Hide Loading State ---
        summarizeButton.disabled = false;
        summarizeButton.querySelector('.btn-label').classList.remove('d-none');
        summarizeButton.querySelector('.btn-loading').classList.add('d-none');
        cardLoading.style.display = 'none';
    }
}

/**
 * Displays the successful results in the UI cards.
 * @param {object} data - The data object from the API response.
 */
function displayResults(data) {
    textOriginal.textContent = data.summary;
    cardOriginal.style.display = 'block';

    if (data.translated && data.target_language !== 'en') {
        const targetLanguage = SUPPORTED_LANGUAGES.find(l => l.code === data.target_language);
        titleTranslated.textContent = `Translated Summary (${targetLanguage.name})`;
        textTranslated.textContent = data.translated;
        cardTranslated.style.display = 'block';
    } else {
        cardTranslated.style.display = 'none';
    }
}

/**
 * Displays an error message in the UI.
 * @param {string} message - The error message to display.
 */
function displayError(message) {
    errorMessage.textContent = message;
    cardError.style.display = 'block';
}

/**
 * Updates the character counter as the user types.
 */
function updateCharCounter() {
    const count = inputText.value.length;
    charCounter.textContent = `${count} / 5000`;
}

/**
 * Clears all input and output fields.
 */
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
// 4. EVENT LISTENERS
// Set up all the event handlers for the page.
// =================================================================

function initialize() {
    populateLanguageDropdowns();

    // Attach event listeners
    summarizationForm.addEventListener('submit', handleSummarize);
    inputText.addEventListener('input', updateCharCounter);
    clearButton.addEventListener('click', clearAll);
}

// =================================================================
// 5. START THE APPLICATION
// =================================================================
initialize();
