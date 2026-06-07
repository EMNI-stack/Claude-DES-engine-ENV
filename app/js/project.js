/* ============================================================================
   Project container — one student's whole simulation study.
   Phase 2 fills the "conceptual model", "assumptions" and "V&V" sections.
   Later phases attach to the SAME object: `model` (Phase 3 floor/line) and
   `results` (Phase 4). Experimental factors & responses carry stable ids so the
   Phase 3 model can bind to them.

   Persistence is client-side only (localStorage autosave + JSON file save/load),
   consistent with how the legacy demo saves configs. No backend.
   ========================================================================== */

export const STUDY_SCHEMA = 'des-study/v1';
const STORAGE_KEY = 'des-study/v1';

/* ---- ids ---------------------------------------------------------------- */
export function uid(prefix = 'id') {
  const r = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${r}`;
}

/* ---- element factories (stable ids so Phase 3 can bind) ----------------- */
export function newFactor(p = {}) {
  return { id: uid('f'), name: '', description: '', unit: '', baseline: '', bindingHint: '', ...p };
}
export function newResponse(p = {}) {
  return { id: uid('r'), name: '', description: '', unit: '', evidence: '', ...p };
}
export function newAssumption(p = {}) {
  // kind: 'assumption' (fills a knowledge gap) | 'simplification' (deliberate reduction)
  // data: '' | 'A' (available) | 'B' (collectable) | 'C' (not available)
  return { id: uid('a'), kind: 'assumption', description: '', rationale: '',
           data: '', uncertainty: '', sensitivity: false, ...p };
}

/* ---- V&V checklist (manual; Robinson's forms of validation) ------------- */
export function defaultChecklist() {
  return [
    { id: 'cv',  label: 'Conceptual-model validation — the conceptual model is a reasonable representation for the objectives (reviewed with someone).', phase: 'now', done: false },
    { id: 'dv',  label: 'Data validation — data sources identified and judged (availability A/B/C); estimates documented.', phase: 'now', done: false },
    { id: 'as',  label: 'Assumptions & simplifications documented and sanity-checked.', phase: 'now', done: false },
    { id: 'wb',  label: 'White-box (internal) verification — the built model matches the conceptual model, element by element.', phase: 'later', done: false },
    { id: 'bb',  label: 'Black-box validation — overall output behaves as expected / compared to reality or theory.', phase: 'later', done: false },
    { id: 'ev',  label: 'Experimentation validation — warm-up, run-length, and number of replications are adequate.', phase: 'later', done: false },
    { id: 'sv',  label: 'Solution validation — the recommended solution is credible in the real context.', phase: 'later', done: false },
  ];
}

/* ---- a fresh project ---------------------------------------------------- */
export function newProject() {
  const now = new Date().toISOString();
  return {
    schema: STUDY_SCHEMA,
    meta: { title: 'Untitled study', author: '', created: now, modified: now },
    conceptual: {
      objectives: { question: '', success: '', notes: '' },
      factors: [],
      responses: [],
      content: { included: '', excluded: '', detail: '', simplest: '' },
    },
    assumptions: [],
    vv: { checklist: defaultChecklist(), notes: '' },
    model: null,    // Phase 3 — 2D floor & line; binds to factors/responses by id
    results: null,  // Phase 4 — runs, warm-up, replications, CIs
  };
}

/* ---- defensive migration: fill any missing shape -------------------------
   Keeps old/partial saved projects loadable as the schema grows. */
export function migrate(p) {
  const base = newProject();
  if (!p || typeof p !== 'object') return base;
  const c = p.conceptual || {};
  return {
    schema: STUDY_SCHEMA,
    meta: { ...base.meta, ...(p.meta || {}) },
    conceptual: {
      objectives: { ...base.conceptual.objectives, ...(c.objectives || {}) },
      factors: Array.isArray(c.factors) ? c.factors.map((f) => newFactor(f)) : [],
      responses: Array.isArray(c.responses) ? c.responses.map((r) => newResponse(r)) : [],
      content: { ...base.conceptual.content, ...(c.content || {}) },
    },
    assumptions: Array.isArray(p.assumptions) ? p.assumptions.map((a) => newAssumption(a)) : [],
    vv: {
      checklist: mergeChecklist(p.vv && p.vv.checklist),
      notes: (p.vv && p.vv.notes) || '',
    },
    model: p.model ?? null,
    results: p.results ?? null,
  };
}
function mergeChecklist(saved) {
  const def = defaultChecklist();
  if (!Array.isArray(saved)) return def;
  return def.map((d) => {
    const m = saved.find((s) => s.id === d.id);
    return m ? { ...d, done: !!m.done } : d;
  });
}

/* ---- persistence -------------------------------------------------------- */
export function load() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) return migrate(JSON.parse(s));
  } catch (e) { /* ignore corrupt/absent */ }
  return newProject();
}
export function save(p) {
  try {
    p.meta.modified = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch (e) { /* quota / private mode — non-fatal */ }
}

/* ---- file save / load (client-side, like the demo) ---------------------- */
export function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}
export function downloadProject(p) {
  const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (slug(p.meta.title) || 'study') + '.des-study.json';
  a.click();
  URL.revokeObjectURL(a.href);
}
export function readProjectFile(file) {
  return new Promise((resolve, reject) => {
    const rd = new FileReader();
    rd.onload = () => { try { resolve(migrate(JSON.parse(rd.result))); } catch (e) { reject(e); } };
    rd.onerror = reject;
    rd.readAsText(file);
  });
}
