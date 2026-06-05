# vendor/

Third-party assets vendored into the repo so the site stays **buildless and
offline** (no CDN, no npm install) — consistent with the GitHub Pages deploy.

- **plotly.min.js** — Plotly.js v2.35.2, © 2012–2024 Plotly, Inc., MIT licensed
  (https://github.com/plotly/plotly.js). Full bundle (needed for Sankey and
  indicator/gauge traces used by the in-browser analysis dashboard). Loaded by
  `analysis.html` via a plain `<script>` tag.
