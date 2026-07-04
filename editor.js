let gameData = {
    title: "My Jeopardy Game",
    categories: [],
    cells: [],
    settings: {
        numCategories: 5,
        numQuestions: 5,
        dailyDoubles: [],
        questionTimerSeconds: 0
    },
    finalJeopardy: {
        category: "",
        question: "",
        answer: "",
        timerSeconds: 30
    }
};

let currentEditingCell = null;

// Initialize editor
window.addEventListener('DOMContentLoaded', () => {
    loadFromURL();
    initializeBoard();
    loadFinalJeopardy();
});

function initializeBoard() {
    const numCats = gameData.settings.numCategories;
    const numQs = gameData.settings.numQuestions;
    
    // Set dropdowns and inputs
    document.getElementById('numCategories').value = numCats;
    document.getElementById('numQuestions').value = numQs;
    document.getElementById('gameTitle').value = gameData.title;
    document.getElementById('questionTimer').value = gameData.settings.questionTimerSeconds || 0;
    
    // Initialize categories if needed
    if (gameData.categories.length !== numCats) {
        gameData.categories = Array(numCats).fill('').map((_, i) => 
            gameData.categories[i] || `Category ${i + 1}`
        );
    }
    
    // Initialize cells if needed
    const totalCells = numCats * numQs;
    if (gameData.cells.length !== totalCells) {
        const oldCells = [...gameData.cells];
        gameData.cells = [];
        for (let i = 0; i < totalCells; i++) {
            gameData.cells[i] = oldCells[i] || {
                question: '',
                answer: '',
                value: Math.floor(i / numCats + 1) * 200,
                mediaType: 'none',
                mediaUrl: ''
            };
        }
    }
    
    renderBoard();
}

function renderBoard() {
    const numCats = gameData.settings.numCategories;
    const numQs = gameData.settings.numQuestions;
    
    // Render categories
    const categoriesRow = document.getElementById('categoriesRow');
    categoriesRow.innerHTML = '';
    categoriesRow.style.setProperty('--num-categories', numCats);
    for (let i = 0; i < numCats; i++) {
        const catDiv = document.createElement('div');
        catDiv.className = 'category-cell';
        // A textarea (not an input) so long category names wrap instead of clipping
        const input = document.createElement('textarea');
        input.rows = 1;
        input.value = gameData.categories[i]; // set as a property so quotes/HTML in names are safe
        input.placeholder = `Category ${i + 1}`;
        const fit = () => {
            catDiv.style.setProperty('--cat-scale', categoryScale(input.value));
            input.style.height = 'auto';
            input.style.height = input.scrollHeight + 'px';
        };
        input.onfocus = () => clearDefaultCategory(input, i);
        input.oninput = () => {
            updateCategory(i, input.value);
            fit();
        };
        catDiv.appendChild(input);
        categoriesRow.appendChild(catDiv);
        fit();
    }
    
    // Render question cells
    const questionsGrid = document.getElementById('questionsGrid');
    questionsGrid.innerHTML = '';
    questionsGrid.style.gridTemplateColumns = `repeat(${numCats}, 1fr)`;
    
    for (let row = 0; row < numQs; row++) {
        for (let col = 0; col < numCats; col++) {
            const cellIndex = row * numCats + col;
            const cell = gameData.cells[cellIndex];
            const cellDiv = document.createElement('div');
            cellDiv.className = 'question-cell';
            
            const isDailyDouble = gameData.settings.dailyDoubles.includes(cellIndex);
            if (isDailyDouble) {
                cellDiv.classList.add('daily-double');
            }
            
            // Check if cell has any content (question, answer, or media)
            const hasContent = cell.question || cell.answer || (cell.mediaType && cell.mediaType !== 'none' && cell.mediaUrl);
            if (hasContent) {
                cellDiv.classList.add('has-content');
            }
            
            // Determine what to show as preview
            let previewContent = '';
            if (cell.question) {
                previewContent = truncateText(cell.question, 50);
            } else if (cell.answer) {
                previewContent = `A: ${truncateText(cell.answer, 40)}`;
            } else if (cell.mediaType && cell.mediaType !== 'none' && cell.mediaUrl) {
                previewContent = `📎 ${cell.mediaType.toUpperCase()}`;
            }
            
            cellDiv.innerHTML = `
                <div class="cell-value">$${cell.value}</div>
                ${isDailyDouble ? '<div class="dd-indicator">DD</div>' : ''}
                ${hasContent ? '<div class="content-indicator">●</div>' : ''}
                ${previewContent ? '<div class="cell-preview">' + escapeHTML(previewContent) + '</div>' : ''}
            `;
            cellDiv.onclick = () => openCellEditor(cellIndex);
            questionsGrid.appendChild(cellDiv);
        }
    }
}

// Shrink category text as it gets longer so it fits the cell
function categoryScale(text) {
    const len = (text || '').length;
    if (len <= 14) return 1;
    if (len <= 28) return 0.9;
    if (len <= 44) return 0.8;
    return 0.7;
}

function clearDefaultCategory(input, index) {
    // Clear the input if it contains the default "Category X" text
    if (input.value === `Category ${index + 1}`) {
        input.value = '';
    }
}

function updateCategory(index, value) {
    gameData.categories[index] = value;
    saveToURL();
}

function updateBoardSize() {
    const oldCats = gameData.settings.numCategories;
    const newCats = parseInt(document.getElementById('numCategories').value);
    const newQs = parseInt(document.getElementById('numQuestions').value);

    // Remap cells by row/column so existing clues stay under their category
    // when the board dimensions change, and recompute dollar values per row
    const oldCells = gameData.cells;
    const newCells = [];
    for (let row = 0; row < newQs; row++) {
        for (let col = 0; col < newCats; col++) {
            const oldCell = col < oldCats ? oldCells[row * oldCats + col] : null;
            newCells.push({
                question: oldCell ? oldCell.question : '',
                answer: oldCell ? oldCell.answer : '',
                value: (row + 1) * 200,
                mediaType: oldCell ? oldCell.mediaType : 'none',
                mediaUrl: oldCell ? oldCell.mediaUrl : ''
            });
        }
    }
    gameData.cells = newCells;

    gameData.settings.numCategories = newCats;
    gameData.settings.numQuestions = newQs;
    gameData.settings.dailyDoubles = []; // Reset daily doubles (indexes no longer match)
    initializeBoard();
    saveToURL();
}

function updateQuestionTimer() {
    gameData.settings.questionTimerSeconds = parseInt(document.getElementById('questionTimer').value) || 0;
    saveToURL();
}

function openCellEditor(cellIndex) {
    currentEditingCell = cellIndex;
    const cell = gameData.cells[cellIndex];
    
    document.getElementById('cellQuestion').value = cell.question || '';
    document.getElementById('cellAnswer').value = cell.answer || '';
    document.getElementById('mediaType').value = cell.mediaType || 'none';
    document.getElementById('mediaUrl').value = cell.mediaUrl || '';
    document.getElementById('isDailyDouble').checked = gameData.settings.dailyDoubles.includes(cellIndex);
    
    updateMediaInput();
    document.getElementById('cellModal').style.display = 'block';
    // Auto-focus on the question textarea
    setTimeout(() => {
        document.getElementById('cellQuestion').focus();
    }, 100);
}

function closeCellModal() {
    document.getElementById('cellModal').style.display = 'none';
    currentEditingCell = null;
}

function updateMediaInput() {
    const mediaType = document.getElementById('mediaType').value;
    const mediaUrlInput = document.getElementById('mediaUrl');
    
    if (mediaType === 'none') {
        mediaUrlInput.style.display = 'none';
    } else {
        mediaUrlInput.style.display = 'block';
        mediaUrlInput.placeholder = mediaType === 'video'
            ? 'Enter video URL (YouTube, Vimeo, or direct .mp4 link)'
            : `Enter ${mediaType} URL`;
    }
}

function saveCellData() {
    if (currentEditingCell === null) return;
    
    const cell = gameData.cells[currentEditingCell];
    cell.question = document.getElementById('cellQuestion').value;
    cell.answer = document.getElementById('cellAnswer').value;
    cell.mediaType = document.getElementById('mediaType').value;
    cell.mediaUrl = document.getElementById('mediaUrl').value;
    
    // Handle Daily Double
    const isDailyDouble = document.getElementById('isDailyDouble').checked;
    const ddIndex = gameData.settings.dailyDoubles.indexOf(currentEditingCell);
    
    if (isDailyDouble && ddIndex === -1) {
        gameData.settings.dailyDoubles.push(currentEditingCell);
    } else if (!isDailyDouble && ddIndex !== -1) {
        gameData.settings.dailyDoubles.splice(ddIndex, 1);
    }
    
    renderBoard();
    saveToURL();
    closeCellModal();
}

function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// URL Management
// replaceState (not pushState) — otherwise every keystroke creates a history
// entry and the Back button becomes unusable
function saveToURL() {
    gameData.title = document.getElementById('gameTitle').value;
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(gameData));
    const newURL = window.location.pathname + '#' + compressed;
    window.history.replaceState(gameData, '', newURL);
}

function loadFromURL() {
    const hash = window.location.hash.substring(1);
    if (hash) {
        try {
            const decompressed = LZString.decompressFromEncodedURIComponent(hash);
            if (decompressed) {
                gameData = JSON.parse(decompressed);
            }
        } catch (e) {
            console.error('Failed to load game data from URL:', e);
        }
    }
}

function shareEditor() {
    saveToURL(); // Make sure the URL reflects the latest edits before copying
    const url = window.location.href;
    const button = document.querySelector('button[onclick="shareEditor()"]');
    const originalText = button.textContent;
    
    navigator.clipboard.writeText(url).then(() => {
        button.textContent = 'Copied!';
        setTimeout(() => {
            button.textContent = originalText;
        }, 2000);
    }).catch(() => {
        prompt('Copy this URL:', url);
    });
}

function sharePlayer() {
    saveToURL(); // Make sure the URL reflects the latest edits before copying
    const hash = window.location.hash;
    const baseURL = window.location.origin + window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'));
    const playerURL = baseURL + '/player.html' + hash;
    const button = document.querySelector('button[onclick="sharePlayer()"]');
    const originalText = button.textContent;
    
    navigator.clipboard.writeText(playerURL).then(() => {
        button.textContent = 'Copied!';
        setTimeout(() => {
            button.textContent = originalText;
        }, 2000);
    }).catch(() => {
        prompt('Copy this URL:', playerURL);
    });
}

// Handle browser back/forward
window.addEventListener('popstate', (event) => {
    if (event.state) {
        gameData = event.state;
        initializeBoard();
        loadFinalJeopardy();
    }
});

// Final Jeopardy functions
function loadFinalJeopardy() {
    if (!gameData.finalJeopardy) {
        gameData.finalJeopardy = {
            category: "",
            question: "",
            answer: "",
            timerSeconds: 30
        };
    }
    
    document.getElementById('fjCategory').value = gameData.finalJeopardy.category || '';
    document.getElementById('fjQuestion').value = gameData.finalJeopardy.question || '';
    document.getElementById('fjAnswer').value = gameData.finalJeopardy.answer || '';
    document.getElementById('fjTimer').value = gameData.finalJeopardy.timerSeconds || 30;
}

function updateFinalJeopardy() {
    gameData.finalJeopardy = {
        category: document.getElementById('fjCategory').value,
        question: document.getElementById('fjQuestion').value,
        answer: document.getElementById('fjAnswer').value,
        timerSeconds: parseInt(document.getElementById('fjTimer').value) || 30
    };
    saveToURL();
}