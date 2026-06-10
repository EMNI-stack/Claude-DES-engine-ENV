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

  // Output analysis (Phase 4) — only when the study has been run
  const R = project.results;
  if (R && Array.isArray(R.responses) && R.responses.length) {
    const u = R.timeUnit || 'time units';
    doc.append(el('h2', {}, 'Output analysis'));
    const warm = R.studyType === 'steady'
      ? (R.warmupCutoff > 0 ? `steady-state study; the first ${num(R.warmupCutoff)} ${u} deleted as warm-up` : 'steady-state study; no warm-up deleted')
      : 'terminating study; the whole run analysed (no warm-up)';
    doc.append(el('p', { class: 'small' },
      `${R.reps} independent replications (seeds ${R.seeds ? R.seeds[0] : 1}–${R.seeds ? R.seeds[R.seeds.length - 1] : R.reps}), each run for ${num(R.horizon)} ${u} — ${warm}. ` +
      `Every response is a ${Math.round((1 - (R.alpha || 0.05)) * 100)}% confidence interval; a single run is never reported alone.`));
    doc.append(table(
      ['Response', 'Mean', '95% CI', 'Half-width', 'Rel. half-width', `Reps for ±${Math.round((R.precisionTarget || 0.15) * 100)}%`],
      R.responses.map((r) => [
        `${r.label}${has(r.unit) ? ' (' + r.unit + ')' : ''}`,
        num(r.mean), `[${num(r.ci_low)}, ${num(r.ci_high)}]`, `±${num(r.halfwidth)}`,
        Number.isFinite(r.rel_halfwidth) ? `±${(r.rel_halfwidth * 100).toFixed(1)}%` : '—',
        r.meetsTarget ? `met (${r.n})` : `~${r.repsForTarget}`,
      ]),
    ));
    if (R.bottleneck) doc.append(el('p', { class: 'small' }, `Bottleneck: ${R.bottleneck.name} at ${(R.bottleneck.utilisation * 100).toFixed(1)}% mean utilisation.`));
    const cm = R.comparison;
    if (cm) {
      doc.append(el('h3', {}, 'Scenario comparison'));
      const verdict = cm.differs
        ? `a real difference (95% CI on the difference [${num(cm.ci_low)}, ${num(cm.ci_high)}] excludes 0)`
        : `no significant difference (95% CI [${num(cm.ci_low)}, ${num(cm.ci_high)}] includes 0)`;
      doc.append(el('p', { class: 'small' },
        `Factor "${cm.factor}" — ${cm.response}: level ${cm.levelA} → ${num(cm.meanA)} vs level ${cm.levelB} → ${num(cm.meanB)} ${cm.unit || ''}. ` +
        `Difference ${num(cm.difference)} ± ${num(cm.halfwidth_crn)} (paired, common random numbers) — ${verdict}.`));
    }
  }

  return doc;
}
const num = (x) => { if (!Number.isFinite(x)) return '—'; const a = Math.abs(x); return a >= 100 ? x.toFixed(0) : a >= 10 ? x.toFixed(1) : a >= 1 ? x.toFixed(2) : x.toFixed(3); };

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

  const R = project.results;
  if (R && Array.isArray(R.responses) && R.responses.length) {
    const u = R.timeUnit || 'time units';
    sec('Output analysis');
    const warm = R.studyType === 'steady'
      ? (R.warmupCutoff > 0 ? `steady-state; first ${num(R.warmupCutoff)} ${u} deleted as warm-up` : 'steady-state; no warm-up deleted')
      : 'terminating; whole run analysed';
    L.push(`_${R.reps} independent replications, run length ${num(R.horizon)} ${u} — ${warm}. ${Math.round((1 - (R.alpha || 0.05)) * 100)}% confidence intervals; a single run is never reported alone._`, '');
    L.push('| Response | Mean | 95% CI | Half-width | Rel. | Reps for target |', '|---|---|---|---|---|---|');
    R.responses.forEach((r) => L.push(`| ${cell(r.label)}${has(r.unit) ? ' (' + cell(r.unit) + ')' : ''} | ${num(r.mean)} | [${num(r.ci_low)}, ${num(r.ci_high)}] | ±${num(r.halfwidth)} | ${Number.isFinite(r.rel_halfwidth) ? '±' + (r.rel_halfwidth * 100).toFixed(1) + '%' : '—'} | ${r.meetsTarget ? 'met (' + r.n + ')' : '~' + r.repsForTarget} |`));
    if (R.bottleneck) L.push('', `**Bottleneck:** ${cell(R.bottleneck.name)} at ${(R.bottleneck.utilisation * 100).toFixed(1)}% mean utilisation.`);
    const cm = R.comparison;
    if (cm) {
      L.push('', '### Scenario comparison', '');
      const verdict = cm.differs
        ? `a real difference (95% CI [${num(cm.ci_low)}, ${num(cm.ci_high)}] excludes 0)`
        : `no significant difference (95% CI [${num(cm.ci_low)}, ${num(cm.ci_high)}] includes 0)`;
      L.push(`Factor **${cell(cm.factor)}** — ${cell(cm.response)}: ${cell(cm.levelA)} → ${num(cm.meanA)} vs ${cell(cm.levelB)} → ${num(cm.meanB)} ${cell(cm.unit || '')}. Difference ${num(cm.difference)} ± ${num(cm.halfwidth_crn)} (paired / common random numbers) — ${verdict}.`);
    }
  }

  return L.join('\n');
}
const cell = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

function downloadMd() {
  const blob = new Blob([md()], { type: 'text/markdown' });
  const suffix = (project.results && project.results.responses && project.results.responses.length) ? '.study.md' : '.conceptual-model.md';
  const a = el('a', { href: URL.createObjectURL(blob), download: (slug(project.meta.title) || 'study') + suffix });
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
