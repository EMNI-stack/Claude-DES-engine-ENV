/* Export the study front matter (conceptual model + assumptions + V&V) as a
   clean, readable document: an on-brand print-friendly HTML view, plus a
   Markdown download. Reads the shared project from localStorage. */

import { load, slug } from './project.js';

const project = load();

/* tiny DOM helper (safe: user text via text nodes) */
function el(tag, props = {}, kids = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v != null && v !== false) n.setAttribute(k, v);
  }
  for (const c of [].concat(kids)) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}
const has = (s) => !!(s && String(s).trim());
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return iso || ''; } };

/* ---- render the on-brand document -------------------------------------- */
function para(text) { return has(text) ? el('p', {}, text) : el('p', { class: 'faint' }, '—'); }

function renderDoc() {
  const c = project.conceptual;
  const doc = el('article', { class: 'doc' });

  doc.append(
    el('p', { class: 'section-label' }, 'Simulation study · conceptual model'),
    el('h1', {}, project.meta.title || 'Untitled study'),
    el('p', { class: 'docmeta' }, `${project.meta.author || 'Unattributed'} · ${fmtDate(project.meta.modified)}`),
  );

  // Objectives
  doc.append(el('h2', {}, 'Objectives'));
  doc.append(el('h3', {}, 'The question this study answers'), para(c.objectives.question));
  doc.append(el('h3', {}, 'Success criterion'), para(c.objectives.success));
  if (has(c.objectives.notes)) doc.append(el('h3', {}, 'Notes'), para(c.objectives.notes));

  // Factors
  doc.append(el('h2', {}, 'Experimental factors'));
  doc.append(c.factors.length ? table(
    ['Factor', 'Unit', 'Baseline', 'Description', 'Where it applies'],
    c.factors.map((f) => [f.name, f.unit, f.baseline, f.description, f.bindingHint]),
  ) : para(''));

  // Responses
  doc.append(el('h2', {}, 'Responses'));
  doc.append(c.responses.length ? table(
    ['Response', 'Unit', 'Description', 'How it shows the objective is met'],
    c.responses.map((r) => [r.name, r.unit, r.description, r.evidence]),
  ) : para(''));

  // Model content
  doc.append(el('h2', {}, 'Model content'));
  doc.append(el('h3', {}, 'In scope'), para(c.content.included));
  doc.append(el('h3', {}, 'Out of scope'), para(c.content.excluded));
  doc.append(el('h3', {}, 'Level of detail'), para(c.content.detail));
  doc.append(el('h3', {}, 'Why this is the simplest model that meets the objectives'), para(c.content.simplest));

  // Assumptions & simplifications
  doc.append(el('h2', {}, 'Assumptions & simplifications'));
  if (!project.assumptions.length) doc.append(para(''));
  else {
    const ul = el('ul');
    project.assumptions.forEach((a) => {
      const tags = [];
      if (a.data) tags.push(`data ${a.data}`);
      if (a.sensitivity) tags.push('sensitivity-test');
      const li = el('li', {}, [
        el('span', { class: 'pill' }, a.kind === 'assumption' ? 'assumption' : 'simplification'),
        ' ', el('strong', {}, a.description || '(no description)'),
        has(a.rationale) ? ` — ${a.rationale}` : '',
      ]);
      if (has(a.uncertainty) || tags.length) {
        li.append(el('div', { class: 'small faint' },
          [tags.join(' · '), has(a.uncertainty) ? `${tags.length ? ' · ' : ''}uncertainty: ${a.uncertainty}` : ''].join('')));
      }
      ul.append(li);
    });
    doc.append(ul);
  }

  // V&V
  doc.append(el('h2', {}, 'Verification & validation'));
  doc.append(el('p', { class: 'small' }, 'A model is never valid in general; V&V builds confidence. Progress checklist:'));
  const ul = el('ul');
  project.vv.checklist.forEach((i) => ul.append(el('li', {}, `${i.done ? '☑' : '☐'} ${i.label}`)));
  doc.append(ul);
  if (has(project.vv.notes)) doc.append(el('h3', {}, 'Notes'), para(project.vv.notes));

  return doc;
}

function table(headers, rows) {
  const t = el('table', { class: 'table' });
  t.append(el('thead', {}, el('tr', {}, headers.map((h) => el('th', {}, h)))));
  const tb = el('tbody', {});
  rows.forEach((r) => tb.append(el('tr', {}, r.map((cell) => el('td', {}, has(cell) ? cell : '—')))));
  t.append(tb);
  return t;
}

/* ---- Markdown builder --------------------------------------------------- */
function md() {
  const c = project.conceptual;
  const L = [];
  const sec = (s) => { L.push('', `## ${s}`, ''); };
  const field = (label, val) => L.push(`**${label}:** ${has(val) ? val : '—'}`, '');

  L.push(`# ${project.meta.title || 'Untitled study'}`);
  L.push(`*${project.meta.author || 'Unattributed'} · ${fmtDate(project.meta.modified)}*`);
  L.push('', '_Simulation study — conceptual model (front matter)._');

  sec('Objectives');
  field('Question', c.objectives.question);
  field('Success criterion', c.objectives.success);
  if (has(c.objectives.notes)) field('Notes', c.objectives.notes);

  sec('Experimental factors');
  if (c.factors.length) {
    L.push('| Factor | Unit | Baseline | Description | Where it applies |', '|---|---|---|---|---|');
    c.factors.forEach((f) => L.push(`| ${cell(f.name)} | ${cell(f.unit)} | ${cell(f.baseline)} | ${cell(f.description)} | ${cell(f.bindingHint)} |`));
  } else L.push('_None._');

  sec('Responses');
  if (c.responses.length) {
    L.push('| Response | Unit | Description | Shows objective met |', '|---|---|---|---|');
    c.responses.forEach((r) => L.push(`| ${cell(r.name)} | ${cell(r.unit)} | ${cell(r.description)} | ${cell(r.evidence)} |`));
  } else L.push('_None._');

  sec('Model content');
  field('In scope', c.content.included);
  field('Out of scope', c.content.excluded);
  field('Level of detail', c.content.detail);
  field('Simplest model that meets the objectives', c.content.simplest);

  sec('Assumptions & simplifications');
  if (project.assumptions.length) {
    project.assumptions.forEach((a) => {
      const meta = [];
      if (a.data) meta.push(`data ${a.data}`);
      if (a.sensitivity) meta.push('sensitivity-test');
      if (has(a.uncertainty)) meta.push(`uncertainty: ${a.uncertainty}`);
      L.push(`- **[${a.kind === 'assumption' ? 'ASSUMPTION' : 'SIMPLIFICATION'}]** ${cell(a.description) || '(no description)'}` +
        (has(a.rationale) ? ` — ${a.rationale}` : '') + (meta.length ? `  \n  _(${meta.join(' · ')})_` : ''));
    });
  } else L.push('_None._');

  sec('Verification & validation');
  L.push('_A model is never valid in general; V&V builds confidence._', '');
  project.vv.checklist.forEach((i) => L.push(`- [${i.done ? 'x' : ' '}] ${i.label}`));
  if (has(project.vv.notes)) { L.push('', `**Notes:** ${project.vv.notes}`); }

  return L.join('\n');
}
const cell = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

function downloadMd() {
  const blob = new Blob([md()], { type: 'text/markdown' });
  const a = el('a', { href: URL.createObjectURL(blob), download: (slug(project.meta.title) || 'study') + '.conceptual-model.md' });
  a.click(); URL.revokeObjectURL(a.href);
}

/* ---- mount -------------------------------------------------------------- */
function init() {
  const host = document.getElementById('docHost');
  if (host) { host.innerHTML = ''; host.append(renderDoc()); }
  const p = document.getElementById('btnPrint'); if (p) p.addEventListener('click', () => window.print());
  const m = document.getElementById('btnMd'); if (m) m.addEventListener('click', downloadMd);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
