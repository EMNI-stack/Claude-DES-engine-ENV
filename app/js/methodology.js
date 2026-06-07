/* Methodology workspace controller.
   Renders the stepped conceptual-model builder + assumptions log + V&V framing,
   all bound to the shared project (project.js). Robinson's vocabulary is the
   one surfaced to students; Law stays behind the scenes. */

import {
  load, save, newFactor, newResponse, newAssumption,
  downloadProject, readProjectFile,
} from './project.js';

let project = load();
let current = (location.hash || '#objectives').slice(1);

const STEPS = [
  { id: 'objectives',  n: '1', group: 'Conceptual model', title: 'Objectives' },
  { id: 'factors',     n: '2', group: 'Conceptual model', title: 'Experimental factors' },
  { id: 'responses',   n: '3', group: 'Conceptual model', title: 'Responses' },
  { id: 'content',     n: '4', group: 'Conceptual model', title: 'Model content' },
  { id: 'assumptions', n: '5', group: 'Documentation',     title: 'Assumptions & simplifications' },
  { id: 'vv',          n: '6', group: 'Confidence',        title: 'Verification & validation' },
];
if (!STEPS.some((s) => s.id === current)) current = 'objectives';

/* ---- tiny DOM helper ---------------------------------------------------- */
function el(tag, props = {}, kids = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;        // trusted static markup only
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) n.setAttribute(k, '');
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const c of [].concat(kids)) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}
const $ = (id) => document.getElementById(id);

/* ---- persistence + save indicator -------------------------------------- */
let saveTimer = null;
function persist() {
  save(project);
  const s = $('saveState'); if (s) { s.textContent = 'saving…'; clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { s.textContent = 'saved'; }, 400); }
  renderRail();
}

/* ---- bound field builders ---------------------------------------------- */
function labelled(labelText, control, help) {
  return el('div', { class: 'field' }, [
    el('label', {}, labelText),
    control,
    help ? el('p', { class: 'helper', style: 'margin:0' }, help) : null,
  ]);
}
function textInput(value, oninput, attrs = {}) {
  const i = el('input', { class: 'input', type: 'text', autocomplete: 'off', ...attrs });
  i.value = value || '';
  i.addEventListener('input', () => oninput(i.value));
  return i;
}
function textArea(value, oninput, attrs = {}) {
  const t = el('textarea', { class: 'input', rows: '3', ...attrs });
  t.value = value || '';
  t.addEventListener('input', () => oninput(t.value));
  return t;
}
function segmented(options, currentVal, onpick, label) {
  const grp = el('div', { class: 'segmented', role: 'group', 'aria-label': label || '' });
  options.forEach((o) => {
    const b = el('button', { type: 'button', 'aria-pressed': String(o.value === currentVal) }, o.label);
    b.addEventListener('click', () => onpick(o.value));
    grp.append(b);
  });
  return grp;
}
function example(title, bodyNodes) {
  return el('details', { class: 'example' }, [
    el('summary', {}, title || 'View worked example (fast-food restaurant)'),
    el('div', { class: 'example__body small' }, bodyNodes),
  ]);
}

/* ---- step "done" heuristics (for the rail dots) ------------------------- */
function isDone(id) {
  const c = project.conceptual;
  switch (id) {
    case 'objectives':  return !!c.objectives.question.trim();
    case 'factors':     return c.factors.length > 0;
    case 'responses':   return c.responses.length > 0;
    case 'content':     return !!(c.content.included.trim() || c.content.detail.trim());
    case 'assumptions': return project.assumptions.length > 0;
    case 'vv':          return project.vv.checklist.some((x) => x.done) || !!project.vv.notes.trim();
    default: return false;
  }
}

/* ---- step rail ---------------------------------------------------------- */
function renderRail() {
  const rail = $('stepRail'); if (!rail) return;
  rail.innerHTML = '';
  let lastGroup = '';
  STEPS.forEach((s) => {
    if (s.group !== lastGroup) { rail.append(el('div', { class: 'steprail__group' }, s.group)); lastGroup = s.group; }
    const item = el('button', {
      class: 'step-item', 'data-done': String(isDone(s.id)),
      'aria-current': String(s.id === current), onclick: () => goto(s.id),
    }, [
      el('span', { class: 'step-item__dot' }),
      el('span', { class: 'step-item__n' }, s.n),
      el('span', {}, s.title),
    ]);
    rail.append(item);
  });
}

function goto(id) { current = id; if (location.hash !== '#' + id) location.hash = id; renderRail(); renderContent(); }

/* ---- content host ------------------------------------------------------- */
function renderContent() {
  const host = $('stepContent'); if (!host) return;
  host.innerHTML = '';
  ({
    objectives: stepObjectives, factors: stepFactors, responses: stepResponses,
    content: stepContent, assumptions: stepAssumptions, vv: stepVV,
  }[current] || stepObjectives)(host);
  host.scrollIntoView({ block: 'nearest' });
}

function stepHeader(label, title, sub) {
  return el('div', { class: 'panel__head' }, [
    el('p', { class: 'section-label' }, label),
    el('h2', { class: 'panel__title' }, title),
    sub ? el('p', { class: 'panel__sub' }, sub) : null,
  ]);
}
function navButtons() {
  const idx = STEPS.findIndex((s) => s.id === current);
  const row = el('div', { class: 'row', style: 'justify-content:space-between;margin-top:var(--s-5)' });
  row.append(idx > 0
    ? el('button', { class: 'btn btn-ghost', onclick: () => goto(STEPS[idx - 1].id) }, '← ' + STEPS[idx - 1].title)
    : el('span', {}));
  row.append(idx < STEPS.length - 1
    ? el('button', { class: 'btn btn-primary', onclick: () => goto(STEPS[idx + 1].id) }, STEPS[idx + 1].title + ' →')
    : el('a', { class: 'btn btn-primary', href: 'export.html' }, 'Export →'));
  return row;
}

/* ---- 1. Objectives ------------------------------------------------------ */
function stepObjectives(host) {
  const o = project.conceptual.objectives;
  const panel = el('section', { class: 'panel stack' }, [
    stepHeader('Conceptual model · 1', 'Objectives',
      'What question does this study answer? Everything else exists to serve this. Keep it concrete.'),
    labelled('The question this study answers',
      textArea(o.question, (v) => { o.question = v; persist(); },
        { placeholder: 'e.g. How many tills are needed so most customers are served quickly at lunch?' }),
      'A good objective names the decision and the system, not the model.'),
    labelled('What result would mean the objective is met?',
      textArea(o.success, (v) => { o.success = v; persist(); },
        { placeholder: 'e.g. A till count where 95% of customers wait under 3 minutes at peak.' }),
      'This is your success criterion — it tells you which response to measure.'),
    labelled('Notes (optional)',
      textArea(o.notes, (v) => { o.notes = v; persist(); }, { placeholder: 'Context, constraints, who the decision is for…' })),
    example('View worked example (fast-food restaurant)', [
      el('p', {}, 'Question: how many service tills are needed so that most customers are served quickly during the lunch peak?'),
      el('p', {}, 'Success criterion: the smallest number of tills for which 95% of customers wait less than 3 minutes at peak demand.'),
    ]),
    navButtons(),
  ]);
  host.append(panel);
}

/* ---- 2. Experimental factors ------------------------------------------- */
function stepFactors(host) {
  const list = project.conceptual.factors;
  const wrap = el('section', { class: 'panel stack' }, [
    stepHeader('Conceptual model · 2', 'Experimental factors',
      'The inputs you will deliberately vary to answer the question (Robinson calls these experimental factors). Later phases let the model bind to these.'),
  ]);
  const listHost = el('div', {});
  function draw() {
    listHost.innerHTML = '';
    if (!list.length) listHost.append(el('div', { class: 'empty-hint' }, 'No factors yet. Add the first input you intend to vary.'));
    list.forEach((f, i) => listHost.append(entryCard(i + 1, () => { list.splice(i, 1); persist(); draw(); }, el('div', { class: 'entry__grid' }, [
      labelled('Name', textInput(f.name, (v) => { f.name = v; persist(); }, { placeholder: 'e.g. Number of tills' })),
      labelled('Unit', textInput(f.unit, (v) => { f.unit = v; persist(); }, { placeholder: 'e.g. tills, min, %' })),
      el('div', { class: 'full' }, labelled('Description', textInput(f.description, (v) => { f.description = v; persist(); }, { placeholder: 'What it controls in the system' }))),
      labelled('Baseline value', textInput(f.baseline, (v) => { f.baseline = v; persist(); }, { class: 'input num', placeholder: 'e.g. 3' })),
      labelled('Where it applies (optional)', textInput(f.bindingHint, (v) => { f.bindingHint = v; persist(); }, { placeholder: 'e.g. the Till workcenter' })),
    ]))));
  }
  draw();
  wrap.append(listHost,
    el('div', { class: 'row', style: 'margin-top:var(--s-3)' }, [
      el('button', { class: 'btn btn-ghost', onclick: () => { list.push(newFactor()); persist(); draw(); } }, '+ Add factor'),
    ]),
    example('View worked example (fast-food restaurant)', [
      el('p', {}, 'Factors: number of tills (baseline 3); staff on shift; whether a queue is shared across tills.'),
    ]),
    navButtons());
  host.append(wrap);
}

/* ---- 3. Responses ------------------------------------------------------- */
function stepResponses(host) {
  const list = project.conceptual.responses;
  const wrap = el('section', { class: 'panel stack' }, [
    stepHeader('Conceptual model · 3', 'Responses',
      'The outputs you measure — and, for each, how it shows whether the objective is met.'),
  ]);
  const listHost = el('div', {});
  function draw() {
    listHost.innerHTML = '';
    if (!list.length) listHost.append(el('div', { class: 'empty-hint' }, 'No responses yet. Add the first output you will measure.'));
    list.forEach((r, i) => listHost.append(entryCard(i + 1, () => { list.splice(i, 1); persist(); draw(); }, el('div', { class: 'entry__grid' }, [
      labelled('Name', textInput(r.name, (v) => { r.name = v; persist(); }, { placeholder: 'e.g. Customer waiting time' })),
      labelled('Unit', textInput(r.unit, (v) => { r.unit = v; persist(); }, { placeholder: 'e.g. minutes, %, jobs/hr' })),
      el('div', { class: 'full' }, labelled('Description', textInput(r.description, (v) => { r.description = v; persist(); }, { placeholder: 'What is measured' }))),
      el('div', { class: 'full' }, labelled('How it shows the objective is met', textInput(r.evidence, (v) => { r.evidence = v; persist(); }, { placeholder: 'e.g. 95th-percentile wait compared to the 3-minute target' }))),
    ]))));
  }
  draw();
  wrap.append(listHost,
    el('div', { class: 'row', style: 'margin-top:var(--s-3)' }, [
      el('button', { class: 'btn btn-ghost', onclick: () => { list.push(newResponse()); persist(); draw(); } }, '+ Add response'),
    ]),
    example('View worked example (fast-food restaurant)', [
      el('p', {}, 'Responses: waiting time (mean and 95th percentile) — shows the 3-minute target; queue length; till utilisation.'),
    ]),
    navButtons());
  host.append(wrap);
}

/* ---- 4. Model content --------------------------------------------------- */
function stepContent(host) {
  const c = project.conceptual.content;
  host.append(el('section', { class: 'panel stack' }, [
    stepHeader('Conceptual model · 4', 'Model content',
      'Scope (what is in and out) and level of detail. Aim for the simplest model that meets the objectives.'),
    labelled('In scope — what the model includes',
      textArea(c.included, (v) => { c.included = v; persist(); }, { placeholder: 'e.g. Arrivals → queue → till service → leave' })),
    labelled('Out of scope — what is deliberately excluded',
      textArea(c.excluded, (v) => { c.excluded = v; persist(); }, { placeholder: 'e.g. Drive-through, cleaning, payment failures' })),
    labelled('Level of detail',
      textArea(c.detail, (v) => { c.detail = v; persist(); }, { placeholder: 'e.g. Each till is one server with a service-time distribution; individual menu items not modelled.' }),
      'How finely each in-scope part is represented.'),
    labelled('Why this is the simplest model that meets the objectives',
      textArea(c.simplest, (v) => { c.simplest = v; persist(); }, { placeholder: 'What you left out, and why it does not change the answer to the question.' }),
      'Accuracy has diminishing returns; a smaller model is faster to build, run, validate, and understand.'),
    example('View worked example (fast-food restaurant)', [
      el('p', {}, 'In scope: customer arrivals, a queue, the tills, departures. Out of scope: drive-through and cleaning. Detail: each till is a single server with a service-time distribution; menu items are not modelled individually — only their effect on service time.'),
    ]),
    navButtons(),
  ]));
}

/* ---- 5. Assumptions & simplifications ----------------------------------- */
function stepAssumptions(host) {
  const list = project.assumptions;
  const wrap = el('section', { class: 'panel stack' }, [
    stepHeader('Documentation · 5', 'Assumptions & simplifications',
      'Two different things, kept apart. An ASSUMPTION fills a gap in knowledge about the real system. A SIMPLIFICATION is a deliberate reduction to keep the model tractable.'),
  ]);
  const listHost = el('div', {});
  function draw() {
    listHost.innerHTML = '';
    if (!list.length) listHost.append(el('div', { class: 'empty-hint' }, 'No entries yet. Log every assumption and every simplification as you make it.'));
    list.forEach((a, i) => {
      const dataNote = el('div', {});
      const renderDataNote = () => {
        dataNote.innerHTML = '';
        if (a.data === 'C') {
          dataNote.append(el('div', { class: 'process__vv', style: 'margin-top:var(--s-3)' },
            'Category C — not available. Note it should be tested by sensitivity analysis later (Phase 4), and record your estimate and its uncertainty.'));
        }
      };
      const body = el('div', { class: 'entry__grid' }, [
        el('div', { class: 'full' }, labelled('Type', segmented(
          [{ value: 'assumption', label: 'Assumption' }, { value: 'simplification', label: 'Simplification' }],
          a.kind, (v) => { a.kind = v; persist(); draw(); }, 'Entry type'),
          a.kind === 'assumption' ? 'Fills a gap in knowledge about the real system.' : 'A deliberate reduction for tractability.')),
        el('div', { class: 'full' }, labelled('Description', textInput(a.description, (v) => { a.description = v; persist(); }, { placeholder: a.kind === 'assumption' ? 'e.g. Peak arrival rate is 2 customers/min' : 'e.g. All orders share one service-time distribution' }))),
        el('div', { class: 'full' }, labelled('Rationale', textInput(a.rationale, (v) => { a.rationale = v; persist(); }, { placeholder: 'Why this is reasonable / why it does not change the answer' }))),
        labelled('Data availability', segmented(
          [{ value: '', label: '—' }, { value: 'A', label: 'A' }, { value: 'B', label: 'B' }, { value: 'C', label: 'C' }],
          a.data, (v) => { a.data = v; if (v === 'C') a.sensitivity = true; persist(); draw(); }, 'Data availability'),
          'A available · B collectable · C not available'),
        labelled('Uncertainty note', textInput(a.uncertainty, (v) => { a.uncertainty = v; persist(); }, { placeholder: 'How sure are you? Range / source' })),
        el('label', { class: 'row', style: 'gap:var(--s-2);align-items:center;grid-column:1/-1;font-size:var(--fs-small);color:var(--ink-2)' }, [
          (() => { const cb = el('input', { type: 'checkbox', style: 'width:16px;height:16px;accent-color:var(--primary)' }); cb.checked = !!a.sensitivity; cb.addEventListener('change', () => { a.sensitivity = cb.checked; persist(); }); return cb; })(),
          'Flag for sensitivity analysis later',
        ]),
      ]);
      const card = entryCard(i + 1, () => { list.splice(i, 1); persist(); draw(); }, el('div', {}, [body, dataNote]),
        el('span', { class: 'badge ' + (a.kind === 'assumption' ? '' : 'badge--blocked') }, a.kind === 'assumption' ? 'assumption' : 'simplification'));
      listHost.append(card);
      renderDataNote();
    });
  }
  draw();
  wrap.append(listHost,
    el('div', { class: 'row', style: 'margin-top:var(--s-3)' }, [
      el('button', { class: 'btn btn-ghost', onclick: () => { list.push(newAssumption({ kind: 'assumption' })); persist(); draw(); } }, '+ Add assumption'),
      el('button', { class: 'btn btn-ghost', onclick: () => { list.push(newAssumption({ kind: 'simplification' })); persist(); draw(); } }, '+ Add simplification'),
    ]),
    example('View worked example (fast-food restaurant)', [
      el('p', {}, 'Assumption: peak arrival rate ≈ 2 customers/min (estimated from a busy-hour count — data category B).'),
      el('p', {}, 'Simplification: balking and reneging customers are ignored — at the target service level few customers leave (category C → test by sensitivity later).'),
    ]),
    navButtons());
  host.append(wrap);
}

/* ---- 6. Verification & validation --------------------------------------- */
function stepVV(host) {
  const vv = project.vv;
  const cards = el('div', { class: 'grid-2' }, [
    el('div', { class: 'panel panel--quiet' }, [
      el('p', { class: 'section-label' }, 'Verification'),
      el('h3', { style: 'margin:var(--s-2) 0' }, 'Building the model right'),
      el('p', { class: 'small' }, 'Does the built model faithfully match your conceptual model? Checking the internals — element by element — is verification.'),
    ]),
    el('div', { class: 'panel panel--quiet' }, [
      el('p', { class: 'section-label' }, 'Validation'),
      el('h3', { style: 'margin:var(--s-2) 0' }, 'Building the right model'),
      el('p', { class: 'small' }, 'Does the model represent the real system well enough for the objectives? That is validation — a question about purpose, not just code.'),
    ]),
  ]);
  const core = el('div', { class: 'process__vv', style: 'padding:var(--s-4)' }, [
    el('b', {}, 'A model is never "valid" in general. '),
    'You cannot prove a model correct — V&V tries to prove it ',
    el('em', {}, 'wrong'), ', and the confidence you earn is always tied to the purpose. Stay critical of results, uncertainty, and limitations.',
  ]);
  const forms = el('p', { class: 'small' }, 'Forms of validation you will touch as the study advances: conceptual-model, data, white-box (internal), black-box (overall behaviour), experimentation, and solution validation.');

  const ul = el('ul', { class: 'checklist' });
  vv.checklist.forEach((item) => {
    const cb = el('input', { type: 'checkbox' }); cb.checked = !!item.done;
    cb.addEventListener('change', () => { item.done = cb.checked; persist(); });
    ul.append(el('li', { class: item.phase === 'later' ? 'later' : '' }, [
      cb,
      el('span', { class: 'lbl' }, [item.label, el('span', { class: 'phase-pill' }, item.phase === 'later' ? 'Phase 3–4' : 'now')]),
    ]));
  });

  host.append(el('section', { class: 'panel stack' }, [
    stepHeader('Confidence · 6', 'Verification & validation',
      'Taught as a first-class idea: V&V is continuous and builds confidence — it is never "finished".'),
    cards, core, forms,
    el('div', { class: 'panel__head', style: 'margin-top:var(--s-5)' }, [
      el('p', { class: 'section-label' }, 'Progress checklist'),
      el('p', { class: 'panel__sub' }, 'Tick these manually as your study advances. The later items need a running model and results (Phases 3–4) — they are here so the whole picture is visible from the start.'),
    ]),
    ul,
    labelled('V&V notes (optional)', textArea(vv.notes, (v) => { vv.notes = v; persist(); }, { placeholder: 'Who reviewed the conceptual model, what you checked, doubts raised…' })),
    navButtons(),
  ]));
}

/* ---- shared entry-card chrome ------------------------------------------ */
function entryCard(num, onRemove, body, badge) {
  const head = el('div', { class: 'entry__head' }, [
    el('span', { class: 'num' }, '#' + num),
    badge || null,
    el('button', { class: 'btn-icon', title: 'Remove', 'aria-label': 'Remove entry', onclick: onRemove },
      el('span', { html: '<svg class="icon" viewBox="0 0 24 24" style="width:16px;height:16px"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/></svg>' })),
  ]);
  // push remove button to the right
  head.style.justifyContent = 'flex-start';
  head.lastChild.style.marginLeft = 'auto';
  return el('div', { class: 'entry' }, [head, body]);
}

/* ---- project bar wiring ------------------------------------------------- */
function wireBar() {
  const title = $('studyTitle'), author = $('studyAuthor');
  if (title) { title.value = project.meta.title === 'Untitled study' ? '' : project.meta.title;
    title.addEventListener('input', () => { project.meta.title = title.value || 'Untitled study'; persist(); }); }
  if (author) { author.value = project.meta.author || '';
    author.addEventListener('input', () => { project.meta.author = author.value; persist(); }); }

  const btnSave = $('btnSave'); if (btnSave) btnSave.addEventListener('click', () => downloadProject(project));
  const fileInput = $('fileInput'), btnLoad = $('btnLoad');
  if (btnLoad && fileInput) {
    btnLoad.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files && fileInput.files[0]; if (!f) return;
      try {
        project = await readProjectFile(f);
        save(project);
        if (title) title.value = project.meta.title === 'Untitled study' ? '' : project.meta.title;
        if (author) author.value = project.meta.author || '';
        renderRail(); renderContent();
      } catch (e) { alert('Could not read that file as a study: ' + (e && e.message || e)); }
      fileInput.value = '';
    });
  }
}

window.addEventListener('hashchange', () => {
  const id = (location.hash || '').slice(1);
  if (STEPS.some((s) => s.id === id) && id !== current) { current = id; renderRail(); renderContent(); }
});

function init() { wireBar(); renderRail(); renderContent(); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
