// widget-sandbox.js — receives the HTML of a custom widget and renders it in
// this sandboxed page. Inline <script>/<style> in that HTML work (sandbox
// CSP in manifest.json); external scripts don't.
window.addEventListener('message', (e) => {
  if (!e.data || typeof e.data.ninaWidgetHtml !== 'string') return;
  const base = '<style>html,body{margin:0;height:100%;background:transparent;color:#e4e4e7;font-family:system-ui,sans-serif}</style>';
  document.open();
  document.write(base + e.data.ninaWidgetHtml);
  document.close();
});
