# Static Jeopardy

Static Jeopardy stores the whole game in the URL, so a generated link can be
opened locally or on the deployed site without uploading game data or running a
backend.

## Create a game from the CLI

Install the one CLI dependency:

```sh
npm install
```

Write a game JSON file using [`game.schema.json`](game.schema.json). The
authoring format is category-first, which makes it easy for a person or coding
agent to write a complete board. Each entry in `categories` looks like this:

```json
{
  "name": "Algebra",
  "questions": [
    { "question": "Solve for x: 2x + 3 = 11", "answer": "x = 4" },
    { "question": "Factor x² - 9", "answer": "(x - 3)(x + 3)" },
    { "question": "What is the slope of y = 5x - 2?", "answer": "5" },
    { "question": "Simplify 3(x + 2) - x", "answer": "2x + 6" }
  ]
}
```

A board must contain 4–6 categories with 4–6 questions in each category. Every
category must have the same number of questions. Values default to $200, $400,
$600, and so on.

Validate it and create a deployed URL:

```sh
npm run jeopardy -- validate math-night.json
npm run jeopardy -- create math-night.json
```

`create` prints both a player link and an editor link. It targets the GitHub
Pages deployment by default. Use another deployment with `--base-url` or the
`STATIC_JEOPARDY_URL` environment variable:

```sh
npm run jeopardy -- create math-night.json --base-url https://example.com/jeopardy/
```

To serve this checkout and immediately open the generated local game:

```sh
npm run jeopardy -- serve math-night.json --open
```

The CLI also accepts JSON on stdin by using `-` as the filename, and `--json`
provides machine-readable output for other tooling.

### Prompting a coding agent

For example:

> Create `math-night.json` matching `game.schema.json`. Make four math
> categories with four progressively harder clues and answers in each. Then run
> `npm run jeopardy -- create math-night.json` and give me the player URL.

The URL fragment uses the same LZ String encoding as the browser editor, so a
CLI-created game remains fully editable on the website.
