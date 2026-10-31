// Nytt i appen: visar nyheter.json (görs av skript ur Obsidian-anteckningen Dart-klubbdatabas - Nyheter)
import { esc } from './lib.js?v=0.4.1';

export async function visaNyheter(app) {
  const r = await fetch(`nyheter.json?t=${Date.now()}`);
  const dagar = r.ok ? await r.json() : [];
  app.innerHTML = `
    <h1>Nytt i appen</h1>
    <p class="muted">Vad som har ändrats, dag för dag. Siffran inom parentes är versionen – den står längst ner på sidan.</p>
    ${dagar.map((d) => `<div class="kort nyhet"><h2>${esc(d.datum)}</h2><ul>${d.punkter.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`).join('') || '<p class="muted">Inga nyheter.</p>'}`;
}
