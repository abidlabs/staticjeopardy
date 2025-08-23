let gameData = {
    title: "My Jeopardy Game",
    categories: [],
    cells: [],
    settings: {
        numCategories: 5,
        numQuestions: 5,
        dailyDoubles: []
    }
};

let currentEditingCell = null;

// Initialize editor
window.addEventListener('DOMContentLoaded', () => {
    loadFromURL();
    initializeBoard();
});

function initializeBoard() {
    const numCats = gameData.settings.numCategories;
    const numQs = gameData.settings.numQuestions;
    
    // Set dropdowns
    document.getElementById('numCategories').value = numCats;
    document.getElementById('numQuestions').value = numQs;
    document.getElementById('gameTitle').value = gameData.title;
    
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
        catDiv.innerHTML = `
            <input type="text" 
                   value="${gameData.categories[i]}" 
                   placeholder="Category ${i + 1}"
                   onfocus="clearDefaultCategory(this, ${i})"
                   onchange="updateCategory(${i}, this.value)">
        `;
        categoriesRow.appendChild(catDiv);
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
            
            if (cell.question) {
                cellDiv.classList.add('has-content');
            }
            
            cellDiv.innerHTML = `
                <div class="cell-value">$${cell.value}</div>
                ${isDailyDouble ? '<div class="dd-indicator">DD</div>' : ''}
                ${cell.question ? '<div class="cell-preview">' + truncateText(cell.question, 50) + '</div>' : ''}
            `;
            cellDiv.onclick = () => openCellEditor(cellIndex);
            questionsGrid.appendChild(cellDiv);
        }
    }
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
    gameData.settings.numCategories = parseInt(document.getElementById('numCategories').value);
    gameData.settings.numQuestions = parseInt(document.getElementById('numQuestions').value);
    gameData.settings.dailyDoubles = []; // Reset daily doubles
    initializeBoard();
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
        mediaUrlInput.placeholder = `Enter ${mediaType} URL`;
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

// URL Management
function saveToURL() {
    gameData.title = document.getElementById('gameTitle').value;
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(gameData));
    const newURL = window.location.pathname + '#' + compressed;
    window.history.pushState(gameData, '', newURL);
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
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
        alert('Editor URL copied to clipboard!');
    }).catch(() => {
        prompt('Copy this URL:', url);
    });
}

function sharePlayer() {
    const hash = window.location.hash;
    const baseURL = window.location.origin + window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'));
    const playerURL = baseURL + '/player.html' + hash;
    navigator.clipboard.writeText(playerURL).then(() => {
        alert('Player URL copied to clipboard!');
    }).catch(() => {
        prompt('Copy this URL:', playerURL);
    });
}

// Handle browser back/forward
window.addEventListener('popstate', (event) => {
    if (event.state) {
        gameData = event.state;
        initializeBoard();
    }
});