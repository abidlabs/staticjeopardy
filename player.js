let gameData = null;
let teams = [];
let usedCells = [];
let currentQuestion = null;
let currentWager = 0;
let lastQuestionValue = 200; // Default point value for +/- buttons
let finalJeopardyTimer = null;
let finalJeopardySeconds = 30;
let questionTimer = null;
let questionSeconds = 0;

// Initialize player
window.addEventListener('DOMContentLoaded', () => {
    loadFromURL();
    if (gameData && gameData.settings && Array.isArray(gameData.cells)) {
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

// Shrink category text as it gets longer so it fits the cell
function categoryScale(text) {
    const len = (text || '').length;
    if (len <= 14) return 1;
    if (len <= 28) return 0.9;
    if (len <= 44) return 0.8;
    return 0.7;
}

// Convert YouTube/Vimeo page URLs into embeddable player URLs.
// Returns null for anything else (direct media files, etc.)
function getEmbedUrl(url) {
    const yt = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
    const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
    return null;
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function initializeGame() {
    // Check if URL contains team data (backwards compatible)
    let urlTeams = null;
    if (gameData.playerState && gameData.playerState.teams) {
        urlTeams = gameData.playerState.teams;
    }
    
    // Load saved game state from localStorage
    const gameId = window.location.hash;
    const savedState = localStorage.getItem('gameState_' + gameId);
    if (savedState) {
        const state = JSON.parse(savedState);
        teams = state.teams || [];
        usedCells = state.usedCells || [];
    } else if (urlTeams) {
        // Use team names from URL if available
        teams = urlTeams.map(team => ({ name: team.name, score: team.score || 0 }));
        usedCells = [];
    } else {
        // Initialize with 3 default teams if no saved state
        teams = [
            { name: 'Team 1', score: 0 },
            { name: 'Team 2', score: 0 },
            { name: 'Team 3', score: 0 }
        ];
        usedCells = [];
    }
    
    // Set title
    document.getElementById('gameTitle').textContent = gameData.title || 'Jeopardy Game';
    
    renderBoard();
    renderTeams();
    
    // Show splash screen automatically when game loads
    showSplashScreen();
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
        const name = gameData.categories[i] || `Category ${i + 1}`;
        catDiv.textContent = name;
        catDiv.style.setProperty('--cat-scale', categoryScale(name));
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
    
    // Update last question value for +/- buttons
    lastQuestionValue = cell.value;
    renderTeams(); // Re-render to update button values
    
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

    // "True Daily Double" rule: max wager is the team's score, or the highest
    // clue value on the board if their score is lower
    const maxBoardValue = Math.max(...gameData.cells.map(c => c.value || 0));
    const maxWager = Math.max(teams[teamIndex] ? teams[teamIndex].score : 0, maxBoardValue);
    if (wager > maxWager) {
        alert(`Maximum wager is $${maxWager}`);
        return;
    }

    currentWager = wager;
    lastQuestionValue = wager; // Keep the +/- scoreboard buttons in sync with the wager
    document.getElementById('dailyDoubleModal').style.display = 'none';

    const cell = gameData.cells[currentQuestion];
    showQuestion(cell, wager, true);
}

function showQuestion(cell, value, isDailyDouble = false) {
    // Clear any timer left over from a previously opened question
    if (questionTimer) {
        clearInterval(questionTimer);
        questionTimer = null;
    }

    const modal = document.getElementById('questionModal');
    const questionContent = document.getElementById('questionContent');
    const mediaContainer = document.getElementById('mediaContainer');
    const answerContent = document.getElementById('answerContent');
    const showAnswerBtn = document.getElementById('showAnswerBtn');
    const teamButtons = document.getElementById('teamButtons');
    const questionTimerDisplay = document.getElementById('questionTimerDisplay');
    
    document.getElementById('questionValue').textContent = isDailyDouble ? 
        `Daily Double - $${value}` : `$${value}`;
    
    // Display question
    questionContent.textContent = cell.question || '';
    
    // Handle media (built via DOM so URLs with quotes/special chars can't break the markup)
    mediaContainer.innerHTML = '';
    if (cell.mediaType && cell.mediaType !== 'none' && cell.mediaUrl) {
        const embedUrl = getEmbedUrl(cell.mediaUrl);
        let mediaEl = null;
        if (embedUrl) {
            // YouTube/Vimeo links can't play in a <video> tag — embed their player
            mediaEl = document.createElement('iframe');
            mediaEl.src = embedUrl;
            mediaEl.className = 'media-embed';
            mediaEl.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
            mediaEl.allowFullscreen = true;
        } else if (cell.mediaType === 'image') {
            mediaEl = document.createElement('img');
            mediaEl.alt = 'Question media';
            mediaEl.src = cell.mediaUrl;
        } else if (cell.mediaType === 'video') {
            mediaEl = document.createElement('video');
            mediaEl.controls = true;
            mediaEl.src = cell.mediaUrl;
        } else if (cell.mediaType === 'audio') {
            mediaEl = document.createElement('audio');
            mediaEl.controls = true;
            mediaEl.src = cell.mediaUrl;
        }
        if (mediaEl) {
            mediaContainer.appendChild(mediaEl);
        }
    }
    
    // Reset answer display
    answerContent.style.display = 'none';
    answerContent.textContent = '';
    showAnswerBtn.style.display = 'block';
    teamButtons.style.display = 'none';
    
    // Handle question timer
    const timerSeconds = gameData.settings && gameData.settings.questionTimerSeconds ? gameData.settings.questionTimerSeconds : 0;
    if (timerSeconds > 0) {
        questionSeconds = timerSeconds;
        questionTimerDisplay.textContent = questionSeconds;
        questionTimerDisplay.style.display = 'block';
        
        questionTimer = setInterval(() => {
            questionSeconds--;
            questionTimerDisplay.textContent = questionSeconds;
            
            if (questionSeconds <= 0) {
                clearInterval(questionTimer);
                questionTimer = null;
                questionTimerDisplay.textContent = 'TIME!';
            }
        }, 1000);
    } else {
        questionTimerDisplay.style.display = 'none';
    }
    
    modal.style.display = 'block';
}

function showAnswer() {
    const cell = gameData.cells[currentQuestion];
    const answerContent = document.getElementById('answerContent');
    const showAnswerBtn = document.getElementById('showAnswerBtn');
    const teamButtons = document.getElementById('teamButtons');

    answerContent.textContent = cell.answer ? `Answer: ${cell.answer}` : '';
    answerContent.style.display = 'block';
    showAnswerBtn.style.display = 'none';

    // Stop the countdown once the answer is revealed
    if (questionTimer) {
        clearInterval(questionTimer);
        questionTimer = null;
    }

    // Render scoring buttons: ✓ awards points and closes, ✗ deducts and
    // leaves the clue open so another team can answer
    const points = currentWager > 0 ? currentWager : cell.value;
    teamButtons.innerHTML = '';

    const hint = document.createElement('div');
    hint.className = 'scoring-hint';
    hint.textContent = `✓ awards $${points} and closes the clue · ✗ deducts $${points}`;
    teamButtons.appendChild(hint);

    const buttonsRow = document.createElement('div');
    buttonsRow.className = 'scoring-buttons';
    teams.forEach((team, index) => {
        const group = document.createElement('div');
        group.className = 'team-scoring';

        const name = document.createElement('span');
        name.className = 'team-scoring-name';
        name.textContent = team.name;

        const correct = document.createElement('button');
        correct.className = 'btn-correct';
        correct.textContent = '✓';
        correct.title = `${team.name} answered correctly (+$${points})`;
        correct.onclick = () => scoreQuestion(index, points);

        const incorrect = document.createElement('button');
        incorrect.className = 'btn-incorrect';
        incorrect.textContent = '✗';
        incorrect.title = `${team.name} answered incorrectly (-$${points})`;
        incorrect.onclick = () => markIncorrect(index, points);

        group.appendChild(name);
        group.appendChild(correct);
        group.appendChild(incorrect);
        buttonsRow.appendChild(group);
    });
    teamButtons.appendChild(buttonsRow);

    const noAnswer = document.createElement('button');
    noAnswer.className = 'btn btn-secondary btn-small';
    noAnswer.textContent = 'No correct answer — close clue';
    noAnswer.onclick = () => scoreQuestion(null, 0);
    teamButtons.appendChild(noAnswer);

    teamButtons.style.display = 'block';
}

function markIncorrect(teamIndex, points) {
    teams[teamIndex].score -= points;
    saveGameState();
    renderTeams();
}

function finishCurrentQuestion() {
    if (currentQuestion !== null && !usedCells.includes(currentQuestion)) {
        usedCells.push(currentQuestion);
    }
    currentQuestion = null;
    currentWager = 0;
    saveGameState();
    renderBoard();
}

function scoreQuestion(teamIndex, points) {
    if (teamIndex !== null) {
        teams[teamIndex].score += points;
    }

    finishCurrentQuestion();
    renderTeams();
    closeQuestionModal();
}

function closeQuestionModal() {
    // If the answer was already revealed, closing the modal retires the clue
    const answerShown = document.getElementById('answerContent').style.display !== 'none';
    if (answerShown && currentQuestion !== null) {
        finishCurrentQuestion();
    }

    document.getElementById('questionModal').style.display = 'none';

    // Remove media so embedded videos/audio stop playing behind the board
    document.getElementById('mediaContainer').innerHTML = '';

    // Clear question timer if running
    if (questionTimer) {
        clearInterval(questionTimer);
        questionTimer = null;
    }
}

// Team Management
function renderTeams() {
    const container = document.getElementById('teamsContainer');
    container.innerHTML = '';
    
    teams.forEach((team, index) => {
        const teamDiv = document.createElement('div');
        teamDiv.className = 'team-card';
        const scoreClass = team.score < 0 ? 'team-score negative' : 'team-score';
        teamDiv.innerHTML = `
            <div class="team-header">
                <div class="team-name" onclick="editTeamName(${index})" title="Click to edit">${escapeHTML(team.name)}</div>
                <button onclick="removeTeam(${index})" class="btn-remove-subtle" title="Remove team">×</button>
            </div>
            <div class="team-score-row">
                <button onclick="adjustTeamScore(${index}, -lastQuestionValue)" class="btn-adjust-subtle" title="Subtract ${lastQuestionValue}">−</button>
                <div class="${scoreClass}" onclick="editTeamScore(${index})" title="Click to edit">${team.score < 0 ? '-$' + Math.abs(team.score) : '$' + team.score}</div>
                <button onclick="adjustTeamScore(${index}, lastQuestionValue)" class="btn-adjust-subtle" title="Add ${lastQuestionValue}">+</button>
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
        updateURLWithTeams();
        closeTeamModal();
    }
}

function closeTeamModal() {
    document.getElementById('teamModal').style.display = 'none';
}

function editTeamName(teamIndex) {
    const newName = prompt('Enter new team name:', teams[teamIndex].name);
    if (newName && newName.trim()) {
        teams[teamIndex].name = newName.trim();
        saveGameState();
        renderTeams();
        updateURLWithTeams();
    }
}

function editTeamScore(teamIndex) {
    const currentScore = teams[teamIndex].score;
    const newScore = prompt('Enter new score:', currentScore);
    if (newScore !== null) {
        const parsedScore = parseInt(newScore) || 0;
        teams[teamIndex].score = parsedScore;
        saveGameState();
        renderTeams();
    }
}

function adjustTeamScore(teamIndex, amount) {
    teams[teamIndex].score += amount;
    saveGameState();
    renderTeams();
}

function removeTeam(teamIndex) {
    if (confirm(`Remove team "${teams[teamIndex].name}"?`)) {
        teams.splice(teamIndex, 1);
        saveGameState();
        renderTeams();
        updateURLWithTeams();
    }
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

function updateURLWithTeams() {
    // Get the original game data from URL
    const hash = window.location.hash.substring(1);
    if (!hash) return;
    
    try {
        const decompressed = LZString.decompressFromEncodedURIComponent(hash);
        if (decompressed) {
            const originalData = JSON.parse(decompressed);
            
            // Add team names to the data (backwards compatible)
            const extendedData = {
                ...originalData,
                playerState: {
                    teams: teams.filter(team => team.name !== 'Team 1' && team.name !== 'Team 2' && team.name !== 'Team 3').length > 0 
                        ? teams.map(team => ({ name: team.name, score: team.score }))
                        : undefined
                }
            };
            
            // Only update URL if we have custom team names
            if (extendedData.playerState && extendedData.playerState.teams) {
                const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(extendedData));
                const newURL = window.location.pathname + '#' + compressed;
                window.history.replaceState(null, '', newURL);
            }
        }
    } catch (e) {
        console.error('Failed to update URL with teams:', e);
    }
}

function resetGame() {
    if (confirm('Are you sure you want to reset the game? This will clear all scores and progress.')) {
        teams = [
            { name: 'Team 1', score: 0 },
            { name: 'Team 2', score: 0 },
            { name: 'Team 3', score: 0 }
        ];
        usedCells = [];
        saveGameState();
        renderBoard();
        renderTeams();
        updateURLWithTeams();
    }
}

// Navigation
function shareGame() {
    const url = window.location.href;
    const button = document.querySelector('button[onclick="shareGame()"]');
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

// Modal close on outside click — route through the proper close handlers so
// timers get cleared and answered clues get retired
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        if (event.target.id === 'questionModal') {
            closeQuestionModal();
        } else if (event.target.id === 'finalJeopardyModal') {
            closeFinalJeopardy();
        } else {
            event.target.style.display = 'none';
        }
    }
}

// Splash Screen functions
function showSplashScreen() {
    const title = gameData.title || 'Jeopardy Game';
    document.getElementById('splashTitle').textContent = title;
    document.getElementById('splashScreen').style.display = 'flex';
    
    // Add keyboard listener to hide splash screen
    document.addEventListener('keydown', hideSplashScreenOnce);
}

function hideSplashScreen() {
    document.getElementById('splashScreen').style.display = 'none';
    // Remove the keyboard listener
    document.removeEventListener('keydown', hideSplashScreenOnce);
}

function hideSplashScreenOnce() {
    hideSplashScreen();
}

// Fullscreen toggle functionality
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        // Enter fullscreen
        document.documentElement.requestFullscreen().then(() => {
            // Show splash screen in fullscreen
            showSplashScreen();
        }).catch(err => {
            console.log('Error attempting to enable full-screen:', err);
            // Just show splash screen without fullscreen
            showSplashScreen();
        });
    } else {
        // Exit fullscreen
        document.exitFullscreen();
    }
}

// Final Jeopardy functions
function showFinalJeopardy() {
    if (!gameData.finalJeopardy || !gameData.finalJeopardy.category) {
        alert('No Final Jeopardy configured for this game.');
        return;
    }
    
    // Reset views
    document.getElementById('fjCategoryView').style.display = 'block';
    document.getElementById('fjQuestionView').style.display = 'none';
    document.getElementById('fjAnswerView').style.display = 'none';
    
    // Set content
    document.getElementById('fjCategoryText').textContent = gameData.finalJeopardy.category;
    document.getElementById('fjQuestionText').textContent = gameData.finalJeopardy.question || '';
    document.getElementById('fjAnswerText').textContent = gameData.finalJeopardy.answer || '';
    
    // Set timer duration
    finalJeopardySeconds = gameData.finalJeopardy.timerSeconds || 30;
    
    // Show modal
    document.getElementById('finalJeopardyModal').style.display = 'block';
}

function closeFinalJeopardy() {
    document.getElementById('finalJeopardyModal').style.display = 'none';
    if (finalJeopardyTimer) {
        clearInterval(finalJeopardyTimer);
        finalJeopardyTimer = null;
    }
}

function showFinalQuestion() {
    document.getElementById('fjCategoryView').style.display = 'none';
    document.getElementById('fjQuestionView').style.display = 'block';
    
    // Start timer
    let seconds = finalJeopardySeconds;
    document.getElementById('fjTimer').textContent = seconds;
    
    finalJeopardyTimer = setInterval(() => {
        seconds--;
        document.getElementById('fjTimer').textContent = seconds;
        
        if (seconds <= 0) {
            clearInterval(finalJeopardyTimer);
            finalJeopardyTimer = null;
            document.getElementById('fjTimer').textContent = 'TIME!';
        }
    }, 1000);
}

function showFinalAnswer() {
    document.getElementById('fjQuestionView').style.display = 'none';
    document.getElementById('fjAnswerView').style.display = 'block';
    
    if (finalJeopardyTimer) {
        clearInterval(finalJeopardyTimer);
        finalJeopardyTimer = null;
    }
}