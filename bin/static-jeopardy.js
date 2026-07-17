#!/usr/bin/env node

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const LZString = require('lz-string');
const packageJson = require('../package.json');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_BASE_URL = process.env.STATIC_JEOPARDY_URL || packageJson.homepage;

function usage() {
    return `Static Jeopardy CLI

Usage:
  static-jeopardy create <game.json|-> [--base-url <url>] [--open] [--json]
  static-jeopardy serve  <game.json|-> [--host <host>] [--port <port>] [--open] [--json]
  static-jeopardy validate <game.json|->

Commands:
  create    Print immediately shareable player and editor URLs.
  serve     Serve this checkout locally and print URLs for the supplied game.
  validate  Validate and normalize a game without creating a URL.

Options:
  --base-url <url>  Deployed site root (default: ${DEFAULT_BASE_URL})
  --host <host>     Local bind host (default: 127.0.0.1)
  --port <port>     Local port (default: 4173; use 0 for any free port)
  --open            Open the player URL in the default browser
  --json            Emit machine-readable JSON
  -h, --help        Show this help

Use - as the filename to read game JSON from stdin.`;
}

function parseArgs(argv) {
    const [command, ...rest] = argv;
    const options = {
        command,
        file: null,
        baseUrl: DEFAULT_BASE_URL,
        host: '127.0.0.1',
        port: 4173,
        open: false,
        json: false
    };
    if (command === '-h' || command === '--help') options.help = true;

    for (let i = 0; i < rest.length; i++) {
        const arg = rest[i];
        if (arg === '--base-url') options.baseUrl = requireValue(rest, ++i, arg);
        else if (arg === '--host') options.host = requireValue(rest, ++i, arg);
        else if (arg === '--port') options.port = parsePort(requireValue(rest, ++i, arg));
        else if (arg === '--open') options.open = true;
        else if (arg === '--json') options.json = true;
        else if (arg === '-h' || arg === '--help') options.help = true;
        else if (arg.startsWith('-') && arg !== '-') throw new Error(`Unknown option: ${arg}`);
        else if (options.file === null) options.file = arg;
        else throw new Error(`Unexpected argument: ${arg}`);
    }

    return options;
}

function requireValue(args, index, option) {
    const value = args[index];
    if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
    return value;
}

function parsePort(value) {
    const port = Number(value);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error(`Invalid port: ${value}`);
    }
    return port;
}

function readInput(filename) {
    const text = filename === '-'
        ? fs.readFileSync(0, 'utf8')
        : fs.readFileSync(path.resolve(filename), 'utf8');
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(`Invalid JSON in ${filename}: ${error.message}`);
    }
}

function nonEmptyString(value, location) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`${location} must be a non-empty string`);
    }
    return value.trim();
}

function integerInRange(value, fallback, min, max, location) {
    const result = value === undefined ? fallback : value;
    if (!Number.isInteger(result) || result < min || result > max) {
        throw new Error(`${location} must be an integer from ${min} to ${max}`);
    }
    return result;
}

function normalizeGame(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('Game must be a JSON object');
    }

    const title = nonEmptyString(input.title, 'title');
    if (!Array.isArray(input.categories) || input.categories.length < 4 || input.categories.length > 6) {
        throw new Error('categories must contain 4 to 6 categories');
    }

    const categories = input.categories.map((category, categoryIndex) => {
        const location = `categories[${categoryIndex}]`;
        if (!category || typeof category !== 'object' || Array.isArray(category)) {
            throw new Error(`${location} must be an object`);
        }
        const name = nonEmptyString(category.name, `${location}.name`);
        if (!Array.isArray(category.questions) || category.questions.length < 4 || category.questions.length > 6) {
            throw new Error(`${location}.questions must contain 4 to 6 questions`);
        }
        return {
            name,
            questions: category.questions.map((question, questionIndex) => {
                const questionLocation = `${location}.questions[${questionIndex}]`;
                if (!question || typeof question !== 'object' || Array.isArray(question)) {
                    throw new Error(`${questionLocation} must be an object`);
                }
                const mediaType = question.mediaType || 'none';
                if (!['none', 'image', 'video', 'audio'].includes(mediaType)) {
                    throw new Error(`${questionLocation}.mediaType must be none, image, video, or audio`);
                }
                const mediaUrl = question.mediaUrl || '';
                if (typeof mediaUrl !== 'string') {
                    throw new Error(`${questionLocation}.mediaUrl must be a string`);
                }
                if (mediaType !== 'none' && mediaUrl.trim() === '') {
                    throw new Error(`${questionLocation}.mediaUrl is required when mediaType is ${mediaType}`);
                }
                const value = question.value === undefined ? (questionIndex + 1) * 200 : question.value;
                if (!Number.isInteger(value) || value <= 0) {
                    throw new Error(`${questionLocation}.value must be a positive integer`);
                }
                return {
                    question: nonEmptyString(question.question, `${questionLocation}.question`),
                    answer: nonEmptyString(question.answer, `${questionLocation}.answer`),
                    value,
                    mediaType,
                    mediaUrl: mediaUrl.trim(),
                    dailyDouble: question.dailyDouble === true
                };
            })
        };
    });

    const questionCount = categories[0].questions.length;
    for (let i = 1; i < categories.length; i++) {
        if (categories[i].questions.length !== questionCount) {
            throw new Error('Every category must have the same number of questions');
        }
    }

    const cells = [];
    const dailyDoubles = [];
    for (let row = 0; row < questionCount; row++) {
        for (let column = 0; column < categories.length; column++) {
            const source = categories[column].questions[row];
            const cellIndex = cells.length;
            cells.push({
                question: source.question,
                answer: source.answer,
                value: source.value,
                mediaType: source.mediaType,
                mediaUrl: source.mediaUrl
            });
            if (source.dailyDouble) dailyDoubles.push(cellIndex);
        }
    }

    const settings = input.settings || {};
    if (typeof settings !== 'object' || Array.isArray(settings)) {
        throw new Error('settings must be an object');
    }
    const questionTimerSeconds = integerInRange(
        settings.questionTimerSeconds,
        0,
        0,
        300,
        'settings.questionTimerSeconds'
    );

    const finalInput = input.finalJeopardy || {};
    if (typeof finalInput !== 'object' || Array.isArray(finalInput)) {
        throw new Error('finalJeopardy must be an object');
    }
    const hasFinal = Object.keys(finalInput).length > 0;
    const finalJeopardy = {
        category: hasFinal ? nonEmptyString(finalInput.category, 'finalJeopardy.category') : '',
        question: hasFinal ? nonEmptyString(finalInput.question, 'finalJeopardy.question') : '',
        answer: hasFinal ? nonEmptyString(finalInput.answer, 'finalJeopardy.answer') : '',
        timerSeconds: integerInRange(finalInput.timerSeconds, 30, 10, 120, 'finalJeopardy.timerSeconds')
    };

    return {
        title,
        categories: categories.map((category) => category.name),
        cells,
        settings: {
            numCategories: categories.length,
            numQuestions: questionCount,
            dailyDoubles,
            questionTimerSeconds
        },
        finalJeopardy
    };
}

function normalizeBaseUrl(baseUrl) {
    let url;
    try {
        url = new URL(baseUrl);
    } catch {
        throw new Error(`Invalid base URL: ${baseUrl}`);
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Base URL must use http or https');
    }
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    url.search = '';
    url.hash = '';
    return url.toString();
}

function createUrls(game, baseUrl) {
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(game));
    const root = normalizeBaseUrl(baseUrl);
    return {
        playerUrl: new URL(`player.html#${compressed}`, root).toString(),
        editorUrl: new URL(`editor.html#${compressed}`, root).toString(),
        urlLength: new URL(`player.html#${compressed}`, root).toString().length
    };
}

function printUrls(result, json) {
    if (json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        return;
    }
    process.stdout.write(`Player: ${result.playerUrl}\nEditor: ${result.editorUrl}\n`);
    if (result.urlLength > 8000) {
        process.stderr.write(`Warning: the player URL is ${result.urlLength} characters; some messaging apps may truncate it.\n`);
    }
}

function openUrl(url) {
    const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.unref();
}

function contentType(filename) {
    const extension = path.extname(filename).toLowerCase();
    return ({
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.svg': 'image/svg+xml'
    })[extension] || 'application/octet-stream';
}

function createStaticServer() {
    const publicFiles = new Set([
        'index.html',
        'editor.html',
        'editor.js',
        'player.html',
        'player.js',
        'styles.css',
        'game.schema.json'
    ]);
    return http.createServer((request, response) => {
        let pathname;
        try {
            pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        } catch {
            response.writeHead(400).end('Bad request');
            return;
        }
        const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
        if (!publicFiles.has(relativePath)) {
            response.writeHead(404).end('Not found');
            return;
        }
        const filename = path.resolve(ROOT, relativePath);
        fs.readFile(filename, (error, contents) => {
            if (error) {
                response.writeHead(error.code === 'ENOENT' ? 404 : 500).end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
                return;
            }
            response.writeHead(200, { 'Content-Type': contentType(filename) }).end(contents);
        });
    });
}

async function serve(game, options) {
    const server = createStaticServer();
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(options.port, options.host, resolve);
    });
    const address = server.address();
    const displayHost = options.host === '0.0.0.0' || options.host === '::' ? 'localhost' : options.host;
    const result = createUrls(game, `http://${displayHost}:${address.port}/`);
    printUrls(result, options.json);
    if (!options.json) process.stdout.write(`Serving ${ROOT} (press Ctrl+C to stop)\n`);
    if (options.open) openUrl(result.playerUrl);
}

async function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    if (options.help || !options.command) {
        process.stdout.write(`${usage()}\n`);
        return;
    }
    if (!['create', 'serve', 'validate'].includes(options.command)) {
        throw new Error(`Unknown command: ${options.command}`);
    }
    if (!options.file) throw new Error(`${options.command} requires a game JSON file (or - for stdin)`);

    const game = normalizeGame(readInput(options.file));
    if (options.command === 'validate') {
        process.stdout.write(options.json ? `${JSON.stringify(game, null, 2)}\n` : `Valid: ${game.title} (${game.settings.numCategories} categories × ${game.settings.numQuestions} questions)\n`);
        return;
    }
    if (options.command === 'serve') {
        await serve(game, options);
        return;
    }

    const result = createUrls(game, options.baseUrl);
    printUrls(result, options.json);
    if (options.open) openUrl(result.playerUrl);
}

if (require.main === module) {
    main().catch((error) => {
        process.stderr.write(`Error: ${error.message}\n`);
        process.exitCode = 1;
    });
}

module.exports = { createStaticServer, createUrls, normalizeGame, parseArgs };
