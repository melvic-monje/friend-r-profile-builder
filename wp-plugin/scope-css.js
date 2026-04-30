// Scopes static/style.css so every selector is prefixed with `.frpb-shell`.
// Keeps `body.view-mode` rules (they intentionally target body) and @media intact.
// Strips bare `html, body { ... }` rules so they don't fight with the WP theme.

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'static', 'style.css');
const DST = path.join(__dirname, 'friend-r-profile-builder', 'assets', 'style.css');
const SCOPE = '.frpb-shell';

let css = fs.readFileSync(SRC, 'utf-8');

// 1) Strip "html, body { ... }" — those rules belong to the WP page body, not us.
css = css.replace(/html\s*,\s*body\s*\{[\s\S]*?\}/g, '');

function prefixSelector(sel) {
  return sel
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      if (!s) return s;
      // Already scoped
      if (s.startsWith(SCOPE)) return s;
      // Targets the document body intentionally — pass through
      if (/^body[\.\s:#\[]/.test(s) || s === 'body') return s;
      // The wildcard becomes `.frpb-shell *`
      if (s === '*') return `${SCOPE} *`;
      return `${SCOPE} ${s}`;
    })
    .join(', ');
}

function processBlock(input) {
  let out = '';
  let i = 0;
  const len = input.length;

  while (i < len) {
    // Whitespace passthrough
    if (/\s/.test(input[i])) { out += input[i]; i++; continue; }

    // /* comments */
    if (input[i] === '/' && input[i + 1] === '*') {
      const end = input.indexOf('*/', i + 2);
      if (end === -1) { out += input.slice(i); break; }
      out += input.slice(i, end + 2);
      i = end + 2;
      continue;
    }

    // Find start of next block
    const braceIdx = input.indexOf('{', i);
    if (braceIdx === -1) { out += input.slice(i); break; }

    let head = input.slice(i, braceIdx).trim();
    i = braceIdx + 1;

    // Walk to matching closing brace
    let level = 1;
    const bodyStart = i;
    while (i < len && level > 0) {
      const ch = input[i];
      if (ch === '{') level++;
      else if (ch === '}') level--;
      i++;
    }
    const body = input.slice(bodyStart, i - 1);

    if (head.startsWith('@media') || head.startsWith('@supports')) {
      // Recurse into the at-rule body so its selectors get prefixed too
      out += `${head} { ${processBlock(body)} }\n`;
    } else if (head.startsWith('@')) {
      // @keyframes / @font-face / @import — leave intact
      out += `${head} { ${body} }\n`;
    } else if (head) {
      const prefixed = prefixSelector(head);
      out += `${prefixed} { ${body} }\n`;
    }
  }
  return out;
}

const scoped = `/* Auto-generated from static/style.css — DO NOT EDIT BY HAND.
   All selectors prefixed with ${SCOPE} so the plugin's CSS doesn't fight
   with the WP theme. Re-run wp-plugin/scope-css.js after editing the
   source. */

${SCOPE} {
  /* Reset that neutralizes common theme styles INSIDE the builder.
     Anything outside .frpb-shell is untouched. */
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  line-height: 1.45;
  color: #222;
  background: #f0eee6;
  display: block;
}
${SCOPE} * { box-sizing: border-box; }
${SCOPE} h1, ${SCOPE} h2, ${SCOPE} h3, ${SCOPE} h4 { margin: 0; font-weight: bold; line-height: 1.2; }
${SCOPE} p { margin: 0 0 8px; }
${SCOPE} a { text-decoration: none; }
${SCOPE} img { max-width: 100%; display: block; }
${SCOPE} button, ${SCOPE} input, ${SCOPE} textarea, ${SCOPE} select {
  font: inherit; color: inherit; line-height: 1.45;
}
${SCOPE} button { cursor: pointer; }
${SCOPE} ul, ${SCOPE} ol { margin: 0; padding-left: 20px; }
${SCOPE} table { border-collapse: collapse; }

${processBlock(css)}
`;

fs.writeFileSync(DST, scoped);
console.log(`Scoped CSS written: ${DST} (${(scoped.length / 1024).toFixed(1)} KB)`);
