# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

Payerer is a vanilla-JS PWA (no build step, no dependencies): `index.html`,
`app.js`, `styles.css`, `sw.js`. Open `index.html` directly to run it.

## Releasing changes

Whenever `app.js` or `styles.css` changes, bump the version number in both
places together (they must stay identical):

1. `?v=N` on the `styles.css` and `app.js` URLs in `index.html`
2. `VERSION` in `sw.js`

This cache-busts installed PWAs and prevents a device from mixing a new
`index.html` with stale cached scripts/styles on flaky connections.

## Workflow

After completing any edit to the code:

1. Commit the change on a feature branch and push it with
   `git push -u origin <branch-name>`.
2. Open a pull request into `main`.
3. Merge the pull request immediately — do not wait for review or ask
   for confirmation.
