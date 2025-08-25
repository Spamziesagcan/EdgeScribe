// =================================================================================
// IMPORTANT: CONFIGURE YOUR LIVE BACKEND URL HERE
// =================================================================================
const API_BASE_URL = ''; // <-- PASTE YOUR PUBLISHED WORKER URL HERE
// =================================================================================


// Typography override to use Poppins
document.documentElement.style.setProperty('--font-sans', "Poppins, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'");

// Helper: Toasts with SweetAlert2
const toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 2200,
    timerProgressBar: true
});
const showToast = (icon, title) => {
    if (document.getElementById('toggleToasts').checked) toast.fire({
        icon,
        title
    });
};

// Health check
async function checkHealth() {
    const healthDot = document.getElementById('healthDot');
    const healthText = document.getElementById('healthText');
    const sidebarPill = document.getElementById('sidebarStatusPill');
    const headerBadge = document.getElementById('headerHealthBadge');
    const statusDotLarge = document.getElementById('statusDotLarge');
    const statusTextLarge = document.getElementById('statusTextLarge');
    const statusSubText = document.getElementById('statusSubText');
    const start = Date.now();
    try {
        const res = await fetch(`${API_BASE_URL}/health`, {
            cache: 'no-store'
        });
        const ok = res.ok;
        const state = ok ? 'healthy' : 'down';
        applyHealthState(state);
        statusSubText.textContent = `Last checked ${Math.max(1, Math.round((Date.now()-start)/1000))}s ago`;
    } catch (e) {
        applyHealthState('down');
        statusSubText.textContent = 'Last check failed';
    }

    function applyHealthState(state) {
        const healthy = state === 'healthy';
        // Header dot
        healthDot.classList.toggle('health-healthy', healthy);
        healthDot.classList.toggle('health-down', !healthy);
        healthText.textContent = healthy ? 'Healthy' : 'Down';
        // Sidebar pill
        sidebarPill.classList.toggle('status-healthy', healthy);
        sidebarPill.classList.toggle('status-down', !healthy);
        // Header badge
        headerBadge.textContent = healthy ? 'Healthy' : 'Down';
        // Status section
        statusDotLarge.classList.toggle('success', healthy);
        statusDotLarge.classList.toggle('error', !healthy);
        statusTextLarge.textContent = healthy ? 'Healthy' : 'Down';
    }
}

// Periodic health checks
checkHealth();
setInterval(checkHealth, 10000);

// Theme toggle (placeholder)
document.querySelector('[data-theme-toggle]')?.addEventListener('click', () => {
    Swal.fire({
        icon: 'info',
        title: 'Theme',
        text: 'Dark theme coming soon!',
        confirmButtonColor: '#3B82F6'
    });
});

// Character counter and validation
const inputText = document.getElementById('inputText');
const charCounter = document.getElementById('charCounter');
const validationMsg = document.getElementById('validationMsg');
const btnSummarize = document.getElementById('btnSummarize');
const btnClear = document.getElementById('btnClear');
const languageSelect = document.getElementById('languageSelect');

function updateCounter() {
    const len = inputText.value.length;
    charCounter.textContent = `${len} / 5000`;
    const over = len > 5000;
    validationMsg.classList.toggle('d-none', !over);
    btnSummarize.disabled = over || len === 0 || isSubmitting;
    charCounter.classList.toggle('text-danger', over);
}
inputText.addEventListener('input', updateCounter);
inputText.addEventListener('paste', () => setTimeout(updateCounter));

// Submit handling
let isSubmitting = false;
const cardOriginal = document.getElementById('cardOriginal');
const cardTranslated = document.getElementById('cardTranslated');
const cardLoading = document.getElementById('cardLoading');
const cardError = document.getElementById('cardError');
const textOriginal = document.getElementById('textOriginal');
const textTranslated = document.getElementById('textTranslated');
const titleOriginal = document.getElementById('titleOriginal');
const titleTranslated = document.getElementById('titleTranslated');
const errorMessage = document.getElementById('errorMessage');

function setSubmitting(state) {
    isSubmitting = state;
    btnSummarize.disabled = state || inputText.value.length === 0 || inputText.value.length > 5000;
    btnSummarize.querySelector('.btn-label').classList.toggle('d-none', state);
    btnSummarize.querySelector('.btn-loading').classList.toggle('d-none', !state);
}

document.getElementById('summarizationForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (inputText.value.trim().length === 0 || inputText.value.length > 5000) return;
    // Prep UI
    cardError.style.display = 'none';
    cardOriginal.style.display = 'none';
    cardTranslated.style.display = 'none';
    cardLoading.style.display = '';
    setSubmitting(true);

    const payload = {
        text: inputText.value.trim(),
        targetLang: languageSelect.value // Corrected key to match backend
    };
    try {
        const res = await fetch(`${API_BASE_URL}/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        if (!res.ok) {
             const errorData = await res.json().catch(() => ({ error: `Server responded with status ${res.status}` }));
             throw new Error(errorData.error);
        }

        const data = await res.json();
        
        // **FIXED**: Use correct keys from the backend response
        const orig = data.summary;
        const trans = data.translated;

        // Update UI
        titleOriginal.textContent = 'Original Summary (English)';
        titleTranslated.textContent = `Translated Summary (${languageSelect.options[languageSelect.selectedIndex].text})`;
        textOriginal.textContent = orig;
        textTranslated.textContent = trans;
        cardLoading.style.display = 'none';
        cardOriginal.style.display = '';
        cardTranslated.style.display = '';
        showToast('success', 'Summary ready');
        if (document.getElementById('autoScrollResults').checked) document.getElementById('results').scrollIntoView({
            behavior: 'smooth'
        });
        // Add to mock table for demo
        addMockRow({
            date: new Date().toISOString(),
            chars: inputText.value.length,
            lang: languageSelect.value,
            duration: Math.floor(200 + Math.random() * 600),
            status: 'OK',
            snippet: orig.slice(0, 64) + (orig.length > 64 ? '…' : '')
        });
    } catch (err) {
        cardLoading.style.display = 'none';
        errorMessage.textContent = mapErrorMessage(err);
        cardError.style.display = '';
        showToast('error', 'Request failed');
    } finally {
        setSubmitting(false);
    }
});

function mapErrorMessage(err) {
    const msg = (err && err.message) ? err.message : 'An unexpected error occurred.';
    if (/rate limit/i.test(msg)) return 'You have reached the rate limit. Please wait and try again.';
    if (/network/i.test(msg)) return 'A network error occurred. Please check your connection.';
    return msg; // Display the actual error message from the backend
}

btnClear.addEventListener('click', () => {
    inputText.value = '';
    updateCounter();
    cardOriginal.style.display = 'none';
    cardTranslated.style.display = 'none';
    cardLoading.style.display = 'none';
    cardError.style.display = 'none';
    document.getElementById('clear').scrollIntoView({
        behavior: 'smooth'
    });
});

// Notifications buttons
document.getElementById('btnNotifications').addEventListener('click', () => showToast('info', 'No new notifications'));
document.getElementById('btnMessages').addEventListener('click', () => showToast('info', 'No new messages'));

// Simple page search (scroll to section)
document.getElementById('pageSearch').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const q = e.target.value.toLowerCase();
        if (!q) return;
        const targets = ['summarization', 'results', 'help', 'status', 'settings'];
        const found = targets.find(id => id.includes(q));
        if (found) document.getElementById(found)?.scrollIntoView({
            behavior: 'smooth'
        });
    }
});

// Mock table data & interactions
const tableData = [{
    date: '2025-01-20T10:24:00Z',
    chars: 1123,
    lang: 'en',
    duration: 245,
    status: 'OK',
    snippet: 'Executive summary of quarterly performance…'
}, {
    date: '2025-01-19T14:12:00Z',
    chars: 4922,
    lang: 'es',
    duration: 612,
    status: 'OK',
    snippet: 'Resumen del informe técnico de la API…'
}, {
    date: '2025-01-18T09:03:00Z',
    chars: 387,
    lang: 'fr',
    duration: 210,
    status: 'OK',
    snippet: 'Résumé de la note de réunion…'
}, {
    date: '2025-01-17T16:44:00Z',
    chars: 2021,
    lang: 'de',
    duration: 355,
    status: 'OK',
    snippet: 'Zusammenfassung des Forschungsartikels…'
}, {
    date: '2025-01-16T12:30:00Z',
    chars: 4988,
    lang: 'ja',
    duration: 740,
    status: 'OK',
    snippet: '会議メモの要約…'
}, {
    date: '2025-01-15T08:22:00Z',
    chars: 1520,
    lang: 'en',
    duration: 260,
    status: 'OK',
    snippet: 'Project kickoff notes summary…'
}, {
    date: '2025-01-14T19:11:00Z',
    chars: 3210,
    lang: 'es',
    duration: 410,
    status: 'OK',
    snippet: 'Resumen del documento de diseño…'
}, {
    date: '2025-01-13T07:54:00Z',
    chars: 987,
    lang: 'fr',
    duration: 230,
    status: 'OK',
    snippet: 'Résumé du rapport de test…'
}, {
    date: '2025-01-12T15:39:00Z',
    chars: 4200,
    lang: 'de',
    duration: 520,
    status: 'OK',
    snippet: 'Zusammenfassung der Spezifikation…'
}, {
    date: '2025-01-11T11:17:00Z',
    chars: 750,
    lang: 'en',
    duration: 190,
    status: 'OK',
    snippet: 'Brief note summary…'
}, {
    date: '2025-01-10T20:05:00Z',
    chars: 2600,
    lang: 'ja',
    duration: 680,
    status: 'OK',
    snippet: 'テクニカルノートの要約…'
}, {
    date: '2025-01-09T09:42:00Z',
    chars: 4800,
    lang: 'es',
    duration: 600,
    status: 'OK',
    snippet: 'Resumen del informe financiero…'
}];

const pageSize = 6;
let currentPage = 1;
let sortKey = 'date';
let sortDir = 'desc';
let filterLang = 'all';
let searchTerm = '';

function renderTable() {
    const tbody = document.querySelector('#tableSummaries tbody');
    if (!tbody) return; // Guard clause
    let rows = tableData
        .filter(r => filterLang === 'all' ? true : r.lang === filterLang)
        .filter(r => searchTerm ? (r.snippet.toLowerCase().includes(searchTerm) || r.lang.includes(searchTerm)) : true)
        .sort((a, b) => {
            let va = a[sortKey],
                vb = b[sortKey];
            if (sortKey === 'date') {
                va = new Date(va).getTime();
                vb = new Date(vb).getTime();
            }
            if (va < vb) return sortDir === 'asc' ? -1 : 1;
            if (va > vb) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
    const total = rows.length;
    const startIdx = (currentPage - 1) * pageSize;
    const pageRows = rows.slice(startIdx, startIdx + pageSize);
    tbody.innerHTML = pageRows.map(r => rowHtml(r)).join('');
    document.getElementById('paginationInfo').textContent = `Showing ${Math.min(total, startIdx+1)}–${Math.min(total, startIdx + pageSize)} of ${total}`;
    // Wire actions
    tbody.querySelectorAll('[data-action="copy"]').forEach(btn => btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.getAttribute('data-snippet') || '').then(() => showToast('success', 'Copied'));
    }));
    tbody.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => new bootstrap.Tooltip(el));
}

function rowHtml(r) {
    const date = new Date(r.date).toLocaleString();
    const langLabel = ({
        en: 'English',
        es: 'Spanish',
        fr: 'French',
        de: 'German',
        ja: 'Japanese'
    })[r.lang] || r.lang;
    return `<tr>
        <td>${date}</td>
        <td class="text-end">${r.chars.toLocaleString()}</td>
        <td>${langLabel}</td>
        <td class="text-end">${r.duration.toLocaleString()}</td>
        <td><span class="badge-soft success">OK</span></td>
        <td>
          <div class="btn-group btn-group-sm" role="group">
            <button class="btn btn-light" type="button" data-bs-toggle="tooltip" title="View"><i class="fa-regular fa-eye"></i></button>
            <button class="btn btn-light" type="button" data-action="copy" data-snippet="${r.snippet.replace(/"/g,'&quot;')}"><i class="fa-regular fa-clipboard"></i></button>
          </div>
        </td>
      </tr>`;
}

function changeSort(key) {
    if (sortKey === key) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
        sortKey = key;
        sortDir = 'asc';
    }
    currentPage = 1;
    renderTable();
}

document.querySelectorAll('#tableSummaries thead th.sortable').forEach(th => th.addEventListener('click', () => changeSort(th.dataset.key)));
document.getElementById('filterLang').addEventListener('change', (e) => {
    filterLang = e.target.value;
    currentPage = 1;
    renderTable();
});
document.getElementById('searchTable').addEventListener('input', (e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    currentPage = 1;
    renderTable();
});
document.getElementById('prevPage').addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        renderTable();
    }
});
document.getElementById('nextPage').addEventListener('click', () => {
    const total = tableData.filter(r => filterLang === 'all' ? true : r.lang === filterLang).length;
    const maxPage = Math.ceil(total / pageSize);
    if (currentPage < maxPage) {
        currentPage++;
        renderTable();
    }
});

function addMockRow(r) {
    tableData.unshift(r);
    renderTable();
}

// Initial renders
updateCounter();
renderTable();