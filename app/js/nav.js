/* Shared application chrome (header + footer).
   Injected on every page so navigation stays consistent and DRY.
   Each page sets <body data-page="..."> to mark the active section. */

const NAV = [
  { key: 'home',        label: 'Home',            href: 'index.html' },
  { key: 'methodology', label: 'Methodology',     href: 'methodology.html' },
  { key: 'floor',       label: 'Model & Floor',   href: 'floor.html',       soon: true },
  { key: 'analyse',     label: 'Run & Analyse',   href: 'analyse.html',     soon: true },
  { key: 'physics',     label: 'Factory Physics', href: 'physics.html',     soon: true },
];

// Minimal Lucide-style line icons (1.5px stroke set in CSS via .icon).
const ICONS = {
  arrowRight: '<svg class="icon" viewBox="0 0 24 24"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>',
  play:       '<svg class="icon" viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4"/></svg>',
  layers:     '<svg class="icon" viewBox="0 0 24 24"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/></svg>',
  grid:       '<svg class="icon" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
  chart:      '<svg class="icon" viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="m7 14 3-3 3 3 5-6"/></svg>',
  beaker:     '<svg class="icon" viewBox="0 0 24 24"><path d="M9 3h6"/><path d="M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7 15h10"/></svg>',
  external:   '<svg class="icon" viewBox="0 0 24 24"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>',
};
export { ICONS };

function header(active) {
  const links = NAV.map((n) => {
    const cur = n.key === active ? ' aria-current="page"' : '';
    const tag = n.soon ? `<span class="nav__tag">soon</span>` : '';
    return `<a class="nav__link" href="${n.href}"${cur}>${n.label}${tag}</a>`;
  }).join('');
  return `
  <header class="app-header">
    <div class="app-header__inner">
      <a class="brand" href="index.html">
        <span class="brand__mark">DES</span>
        <span class="brand__name">Simulation Studio</span>
      </a>
      <nav class="nav" aria-label="Primary">${links}</nav>
    </div>
  </header>`;
}

function footer() {
  return `
  <footer class="app-footer">
    <div class="app-footer__inner">
      <span class="section-label">Simulering og produktionslayout</span>
      <a href="gallery.html">Design&nbsp;system</a>
      <a href="smoke.html">Engine&nbsp;check</a>
      <span class="faint">Legacy prototype:</span>
      <a href="../demo.html">Production line</a>
      <a href="../advanced.html">Factory builder</a>
    </div>
  </footer>`;
}

function mount() {
  const active = document.body.dataset.page || '';
  document.body.insertAdjacentHTML('afterbegin', header(active));
  document.body.insertAdjacentHTML('beforeend', footer());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
