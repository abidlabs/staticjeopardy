let gameData = null;
let teams = [];
let usedCells = [];
let currentQuestion = null;
let currentWager = 0;

// Initialize player
window.addEventListener('DOMContentLoaded', () => {
    loadFromURL();
    if (gameData) {
        initializeGame();
    } else {
        alert('No game data found. Please use a valid game URL.');
        window.location.href = 'index.html';
    }
});

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

function initializeGame() {
    // Load saved game state from localStorage
    const gameId = window.location.hash;
    const savedState = localStorage.getItem('gameState_' + gameId);
    if (savedState) {
        const state = JSON.parse(savedState);
        teams = state.teams || [];
        usedCells = state.usedCells || [];
    }
    
    // Set title
    document.getElementById('gameTitle').textContent = gameData.title || 'Jeopardy Game';
    
    renderBoard();
    renderTeams();
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
        catDiv.textContent = gameData.categories[i] || `Category ${i + 1}`;
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
            cellDiv.className = 'game-cell';
            
            if (usedCells.includes(cellIndex)) {
                cellDiv.classList.add('used');
                cellDiv.textContent = '';
            } else {
                cellDiv.classList.add('available');
                cellDiv.textContent = `$${cell.value}`;
                cellDiv.onclick = () => selectQuestion(cellIndex);
            }
            
            questionsGrid.appendChild(cellDiv);
        }
    }
}

function selectQuestion(cellIndex) {
    if (usedCells.includes(cellIndex)) return;
    
    currentQuestion = cellIndex;
    const cell = gameData.cells[cellIndex];
    const isDailyDouble = gameData.settings.dailyDoubles.includes(cellIndex);
    
    if (isDailyDouble && teams.length > 0) {
        showDailyDouble(cell);
    } else {
        showQuestion(cell, cell.value);
    }
}

function showDailyDouble(cell) {
    const modal = document.getElementById('dailyDoubleModal');
    const teamSelect = document.getElementById('ddTeamSelect');
    
    // Populate teams
    teamSelect.innerHTML = '';
    teams.forEach((team, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${team.name} ($${team.score})`;
        teamSelect.appendChild(option);
    });
    
    modal.style.display = 'block';
}

function submitWager() {
    const teamIndex = parseInt(document.getElementById('ddTeamSelect').value);
    const wager = parseInt(document.getElementById('wagerAmount').value) || 0;
    
    if (wager <= 0) {
        alert('Please enter a valid wager amount');
        return;
    }
    
    currentWager = wager;
    document.getElementById('dailyDoubleModal').style.display = 'none';
    
    const cell = gameData.cells[currentQuestion];
    showQuestion(cell, wager, true);
}

function showQuestion(cell, value, isDailyDouble = false) {
    const modal = document.getElementById('questionModal');
    const questionContent = document.getElementById('questionContent');
    const mediaContainer = document.getElementById('mediaContainer');
    const answerContent = document.getElementById('answerContent');
    const showAnswerBtn = document.getElementById('showAnswerBtn');
    const teamButtons = document.getElementById('teamButtons');
    
    document.getElementById('questionValue').textContent = isDailyDouble ? 
        `Daily Double - $${value}` : `$${value}`;
    
    // Display question
    questionContent.textContent = cell.question || 'No question provided';
    
    // Handle media
    mediaContainer.innerHTML = '';
    if (cell.mediaType && cell.mediaType !== 'none' && cell.mediaUrl) {
        if (cell.mediaType === 'image') {
            mediaContainer.innerHTML = `<img src="${cell.mediaUrl}" alt="Question media">`;
        } else if (cell.mediaType === 'video') {
            mediaContainer.innerHTML = `<video controls src="${cell.mediaUrl}"></video>`;
        } else if (cell.mediaType === 'audio') {
            mediaContainer.innerHTML = `<audio controls src="${cell.mediaUrl}"></audio>`;
        }
    }
    
    // Reset answer display
    answerContent.style.display = 'none';
    answerContent.textContent = '';
    showAnswerBtn.style.display = 'block';
    teamButtons.style.display = 'none';
    
    modal.style.display = 'block';
}

function showAnswer() {
    const cell = gameData.cells[currentQuestion];
    const answerContent = document.getElementById('answerContent');
    const showAnswerBtn = document.getElementById('showAnswerBtn');
    const teamButtons = document.getElementById('teamButtons');
    
    answerContent.textContent = `Answer: ${cell.answer || 'No answer provided'}`;
    answerContent.style.display = 'block';
    showAnswerBtn.style.display = 'none';
    
    // Show team scoring buttons
    if (teams.length > 0) {
        const value = currentWager || gameData.cells[currentQuestion].value;
        teamButtons.innerHTML = '<div class="scoring-label">Award points to:</div>';
        
        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'scoring-buttons';
        
        teams.forEach((team, index) => {
            const correctBtn = document.createElement('button');
            correctBtn.className = 'btn btn-success';
            correctBtn.textContent = `${team.name} ✓`;
            correctBtn.onclick = () => scoreQuestion(index, value);
            
            const incorrectBtn = document.createElement('button');
            incorrectBtn.className = 'btn btn-danger';
            incorrectBtn.textContent = `${team.name} ✗`;
            incorrectBtn.onclick = () => scoreQuestion(index, -value);
            
            const teamDiv = document.createElement('div');
            teamDiv.className = 'team-scoring';
            teamDiv.appendChild(correctBtn);
            teamDiv.appendChild(incorrectBtn);
            buttonsContainer.appendChild(teamDiv);
        });
        
        const noScoreBtn = document.createElement('button');
        noScoreBtn.className = 'btn btn-secondary';
        noScoreBtn.textContent = 'No Score';
        noScoreBtn.onclick = () => scoreQuestion(null, 0);
        
        teamButtons.appendChild(buttonsContainer);
        teamButtons.appendChild(noScoreBtn);
        teamButtons.style.display = 'block';
    }
}

function scoreQuestion(teamIndex, points) {
    if (teamIndex !== null) {
        teams[teamIndex].score += points;
    }
    
    usedCells.push(currentQuestion);
    currentQuestion = null;
    currentWager = 0;
    
    saveGameState();
    renderBoard();
    renderTeams();
    closeQuestionModal();
}

function closeQuestionModal() {
    document.getElementById('questionModal').style.display = 'none';
}

// Team Management
function renderTeams() {
    const container = document.getElementById('teamsContainer');
    container.innerHTML = '';
    
    teams.forEach((team, index) => {
        const teamDiv = document.createElement('div');
        teamDiv.className = 'team-card';
        teamDiv.innerHTML = `
            <div class="team-name">${team.name}</div>
            <div class="team-score">$${team.score}</div>
            <div class="team-actions">
                <button onclick="adjustScore(${index}, 100)" class="btn-adjust">+100</button>
                <button onclick="adjustScore(${index}, -100)" class="btn-adjust">-100</button>
                <button onclick="removeTeam(${index})" class="btn-remove">✕</button>
            </div>
        `;
        container.appendChild(teamDiv);
    });
}

function addTeam() {
    document.getElementById('teamModal').style.display = 'block';
    document.getElementById('teamName').value = '';
}

function saveTeam() {
    const teamName = document.getElementById('teamName').value.trim();
    if (teamName) {
        teams.push({
            name: teamName,
            score: 0
        });
        saveGameState();
        renderTeams();
        closeTeamModal();
    }
}

function closeTeamModal() {
    document.getElementById('teamModal').style.display = 'none';
}

function removeTeam(index) {
    if (confirm(`Remove team "${teams[index].name}"?`)) {
        teams.splice(index, 1);
        saveGameState();
        renderTeams();
    }
}

function adjustScore(teamIndex, amount) {
    teams[teamIndex].score += amount;
    saveGameState();
    renderTeams();
}

// Game State Management
function saveGameState() {
    const gameId = window.location.hash;
    const state = {
        teams: teams,
        usedCells: usedCells
    };
    localStorage.setItem('gameState_' + gameId, JSON.stringify(state));
}

function resetGame() {
    if (confirm('Are you sure you want to reset the game? This will clear all scores and progress.')) {
        teams = [];
        usedCells = [];
        saveGameState();
        renderBoard();
        renderTeams();
    }
}

// Navigation
function editGame() {
    const hash = window.location.hash;
    const baseURL = window.location.origin + window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'));
    window.location.href = baseURL + '/editor.html' + hash;
}

function shareGame() {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
        alert('Game URL copied to clipboard!');
    }).catch(() => {
        prompt('Copy this URL:', url);
    });
}

// Modal close on outside click
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
}