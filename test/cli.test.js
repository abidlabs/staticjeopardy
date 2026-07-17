const test = require('node:test');
const assert = require('node:assert/strict');
const LZString = require('lz-string');
const { createUrls, normalizeGame, parseArgs } = require('../bin/static-jeopardy');

function authoringGame() {
    return {
        title: 'Math Night',
        categories: Array.from({ length: 4 }, (_, column) => ({
            name: `Category ${column + 1}`,
            questions: Array.from({ length: 4 }, (_, row) => ({
                question: `Question ${column + 1}.${row + 1}`,
                answer: `Answer ${column + 1}.${row + 1}`,
                dailyDouble: column === 2 && row === 1
            }))
        }))
    };
}

test('normalizes category-first input into the player row-major format', () => {
    const game = normalizeGame(authoringGame());
    assert.deepEqual(game.categories, ['Category 1', 'Category 2', 'Category 3', 'Category 4']);
    assert.equal(game.cells[0].question, 'Question 1.1');
    assert.equal(game.cells[1].question, 'Question 2.1');
    assert.equal(game.cells[4].question, 'Question 1.2');
    assert.deepEqual(game.settings.dailyDoubles, [6]);
    assert.equal(game.cells[15].value, 800);
});

test('creates URLs that decode to the normalized game', () => {
    const game = normalizeGame(authoringGame());
    const result = createUrls(game, 'https://example.com/games');
    const hash = new URL(result.playerUrl).hash.slice(1);
    const decoded = JSON.parse(LZString.decompressFromEncodedURIComponent(hash));
    assert.deepEqual(decoded, game);
    assert.match(result.playerUrl, /^https:\/\/example\.com\/games\/player\.html#/);
    assert.match(result.editorUrl, /^https:\/\/example\.com\/games\/editor\.html#/);
});

test('rejects uneven category sizes', () => {
    const input = authoringGame();
    input.categories[1].questions.pop();
    assert.throws(() => normalizeGame(input), /questions must contain 4 to 6 questions/);
});

test('parses create options', () => {
    assert.deepEqual(
        parseArgs(['create', 'game.json', '--base-url', 'https://example.com/', '--open', '--json']),
        {
            command: 'create',
            file: 'game.json',
            baseUrl: 'https://example.com/',
            host: '127.0.0.1',
            port: 4173,
            open: true,
            json: true
        }
    );
});

test('accepts help without a command', () => {
    assert.equal(parseArgs(['--help']).help, true);
});
