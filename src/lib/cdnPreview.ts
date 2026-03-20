import type { FileNode } from '@/store/appStore'

// ─── CDN package → esm.sh URL map ────────────────────────────────────────────
const CDN_MAP: Record<string, string> = {
  // React core
  'react':                      'https://esm.sh/react@18',
  'react/jsx-runtime':          'https://esm.sh/react@18/jsx-runtime',
  'react-dom':                  'https://esm.sh/react-dom@18',
  'react-dom/client':           'https://esm.sh/react-dom@18/client',
  // Three.js
  'three':                      'https://esm.sh/three',
  '@react-three/fiber':         'https://esm.sh/@react-three/fiber@8?external=react,react-dom,three',
  '@react-three/drei':          'https://esm.sh/@react-three/drei@9?external=react,react-dom,three,@react-three/fiber',
  // Animation
  'framer-motion':              'https://esm.sh/framer-motion@11?external=react',
  'gsap':                       'https://esm.sh/gsap',
  '@gsap/react':                'https://esm.sh/@gsap/react?external=react,gsap',
  // Icons / UI utilities
  'lucide-react':               'https://esm.sh/lucide-react?external=react',
  'clsx':                       'https://esm.sh/clsx',
  'tailwind-merge':             'https://esm.sh/tailwind-merge',
  'class-variance-authority':   'https://esm.sh/class-variance-authority',
  // State
  'zustand':                    'https://esm.sh/zustand@4?external=react',
  'valtio':                     'https://esm.sh/valtio?external=react',
  'jotai':                      'https://esm.sh/jotai?external=react',
  // Data / charts
  'd3':                         'https://esm.sh/d3',
  'recharts':                   'https://esm.sh/recharts?external=react,react-dom',
  'chart.js':                   'https://esm.sh/chart.js',
  'react-chartjs-2':            'https://esm.sh/react-chartjs-2?external=react,chart.js',
  // Routing / forms / data
  'react-router-dom':           'https://esm.sh/react-router-dom@6?external=react,react-dom',
  '@tanstack/react-query':      'https://esm.sh/@tanstack/react-query?external=react',
  'react-hook-form':            'https://esm.sh/react-hook-form?external=react',
  'zod':                        'https://esm.sh/zod',
  'axios':                      'https://esm.sh/axios',
  // Misc
  'date-fns':                   'https://esm.sh/date-fns',
  'p5':                         'https://esm.sh/p5',
  'tone':                       'https://esm.sh/tone',
}

// Build/type-only packages that don't need to be in CDN_MAP
const SKIP_PREFIXES = [
  'typescript', '@types/', 'vite', '@vitejs/', 'eslint', '@eslint',
  'prettier', 'autoprefixer', 'postcss', 'tailwindcss',
]

// ─── Tree helpers ─────────────────────────────────────────────────────────────

/** Walk a FileNode tree and collect all leaf files with their full relative paths. */
function extractWithPaths(
  nodes: FileNode[],
  prefix = '',
): Array<{ name: string; content: string }> {
  const result: Array<{ name: string; content: string }> = []
  for (const node of nodes) {
    if (node.type === 'archive') continue
    const fullPath = prefix ? `${prefix}/${node.name}` : node.name
    if (node.type === 'folder') {
      result.push(...extractWithPaths(node.children ?? [], fullPath))
    } else {
      result.push({ name: fullPath, content: node.content ?? '' })
    }
  }
  return result
}

/**
 * Strip a single shared project-root prefix from all paths.
 * e.g. "myapp/src/App.tsx" → "src/App.tsx" when every file shares "myapp/".
 */
function stripRoot(files: Array<{ name: string; content: string }>): Array<{ name: string; content: string }> {
  if (files.length === 0) return files
  const roots = new Set(files.map(f => f.name.split('/')[0]))
  if (roots.size !== 1) return files
  const root = [...roots][0]
  return files.map(f => ({ ...f, name: f.name.slice(root.length + 1) }))
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true when all runtime deps declared in package.json are available
 * on esm.sh, meaning we can preview without npm install / WebContainer.
 */
export function isCDNCompatible(files: FileNode[]): boolean {
  const all = stripRoot(extractWithPaths(files))
  const pkg = all.find(f => f.name === 'package.json')
  if (!pkg?.content) return false
  try {
    const parsed = JSON.parse(pkg.content) as { dependencies?: Record<string, string> }
    const deps = Object.keys(parsed.dependencies ?? {})
      .filter(d => !SKIP_PREFIXES.some(s => d.startsWith(s)))
    if (deps.length === 0) return false
    return deps.every(dep =>
      Object.keys(CDN_MAP).some(k => k === dep || k.startsWith(dep + '/'))
    )
  } catch { return false }
}

/**
 * Build a self-contained srcdoc HTML string that:
 *  1. Embeds all source files as JSON
 *  2. Loads @babel/standalone from unpkg
 *  3. Compiles each .tsx/.ts/.jsx/.js file in-browser with Babel
 *  4. Creates blob URLs for each compiled module, replacing imports with
 *     CDN URLs (external deps) or blob URLs (local modules)
 *  5. Dynamically loads the entry point — zero npm install, zero build step
 */
export function buildCDNPreviewHtml(files: FileNode[]): string {
  const all = stripRoot(extractWithPaths(files))

  const srcFiles = all
    .filter(f => /\.(tsx?|jsx?)$/.test(f.name))
    .filter(f => !/vite\.config|tsconfig|\.test\.|\.spec\.|\.d\.ts$/.test(f.name))

  const css = all
    .filter(f => f.name.endsWith('.css'))
    .map(f => f.content.replace(/@tailwind\s+\w+;?\s*/g, ''))  // strip @tailwind directives
    .join('\n')
    .replace(/<\/style>/gi, '<\\/style>')

  const filesJson = JSON.stringify(srcFiles)
  const cdnJson   = JSON.stringify(CDN_MAP)

  // The inline script runs inside the iframe. Double-backslashes in this TS
  // template become single backslashes in the emitted HTML (correct regex syntax).
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://cdn.tailwindcss.com"><\/script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
<style>*{box-sizing:border-box}body{margin:0;background:#0a0a0a;color:#e2e8f0;font-family:system-ui,sans-serif}canvas{display:block}${css}<\/style>
</head>
<body>
<div id="root"></div>
<script>
(function () {
  var FILES = ${filesJson};
  var CDN   = ${cdnJson};

  // Build a name→content lookup
  var srcMap = {};
  FILES.forEach(function (f) { srcMap[f.name] = f.content; });

  // Try to find a source file for a bare path (tries common extensions)
  var EXTS = ['', '.tsx', '.ts', '.jsx', '.js',
               '/index.tsx', '/index.ts', '/index.jsx', '/index.js'];
  function findSrc(path) {
    for (var i = 0; i < EXTS.length; i++) {
      if (srcMap[path + EXTS[i]] !== undefined) return path + EXTS[i];
    }
    return null;
  }

  // Resolve a package name to its CDN URL
  function cdnFor(imp) {
    if (CDN[imp]) return CDN[imp];
    var root = imp.startsWith('@')
      ? imp.split('/').slice(0, 2).join('/')
      : imp.split('/')[0];
    if (CDN[root]) {
      var sub = imp.slice(root.length);
      return sub ? CDN[root].split('?')[0] + sub : CDN[root];
    }
    return null;
  }

  var blobs = {}, busy = {};

  // Resolve an import specifier to a CDN URL or blob URL.
  // baseName is the path of the file doing the importing (e.g. "src/App.tsx").
  function resolveImp(imp, baseName) {
    // @/ alias → src/
    if (imp.startsWith('@/')) {
      var af = findSrc('src/' + imp.slice(2));
      if (af) { var ab = getBlob(af); if (ab) return ab; }
      return imp;
    }
    // External CDN package
    var cdn = cdnFor(imp);
    if (cdn) return cdn;
    // Relative local import — resolve against the importing file's directory
    if (imp.startsWith('.')) {
      var dir = baseName.indexOf('/') !== -1
        ? baseName.split('/').slice(0, -1).join('/')
        : '';
      var joined = dir ? dir + '/' + imp : imp;
      // Normalize: collapse . and ..
      var parts = [];
      joined.split('/').forEach(function (p) {
        if (p === '..') { parts.pop(); }
        else if (p && p !== '.') { parts.push(p); }
      });
      var rf = findSrc(parts.join('/'));
      if (rf) { var rb = getBlob(rf); if (rb) return rb; }
    }
    return imp;
  }

  function getBlob(name) {
    if (blobs[name] !== undefined) return blobs[name];
    if (busy[name]) return null;   // cycle guard
    busy[name] = true;

    var src = srcMap[name];
    if (!src) { blobs[name] = null; busy[name] = false; return null; }

    // Compile with Babel (react + typescript presets)
    var compiled;
    try {
      compiled = Babel.transform(src, {
        filename: name,
        presets: [
          ['react', { runtime: 'automatic' }],
          ['typescript', { isTSX: true, allExtensions: true }]
        ]
      }).code;
    } catch (e) {
      console.error('[CDN Preview] Babel error in ' + name + ':', e.message);
      blobs[name] = null; busy[name] = false; return null;
    }

    // Strip CSS side-effect imports (not resolvable as ES modules)
    compiled = compiled.replace(/\\bimport\\s+["'][^"']+\\.css["'];?\\n?/g, '');

    // Replace every import/from specifier with a CDN URL or blob URL.
    // Capture (keyword)(quote)(specifier)(quote) separately so we can
    // reconstruct the replacement unambiguously without match.replace() tricks.
    compiled = compiled.replace(
      /\\b(from|import)\\s+(["'])([^"']+)(["'])/g,
      function (m, kw, q1, imp, q2) {
        var resolved = resolveImp(imp, name);
        return resolved !== imp ? kw + ' ' + q1 + resolved + q2 : m;
      }
    );

    var url = URL.createObjectURL(new Blob([compiled], { type: 'text/javascript' }));
    blobs[name] = url;
    busy[name]  = false;
    return url;
  }

  // Pre-build blob URLs for all source files
  FILES.forEach(function (f) { getBlob(f.name); });

  // Find the app entry point
  var ENTRIES = [
    'src/main.tsx', 'src/main.ts', 'src/main.jsx', 'src/main.js',
    'main.tsx', 'main.jsx', 'main.ts', 'main.js',
  ];
  var entry = null;
  for (var i = 0; i < ENTRIES.length; i++) {
    if (blobs[ENTRIES[i]]) { entry = blobs[ENTRIES[i]]; break; }
  }

  // Fallback: auto-mount an App component if no main found
  if (!entry) {
    var APPS = ['src/App.tsx', 'src/App.jsx', 'App.tsx', 'App.jsx'];
    for (var i = 0; i < APPS.length; i++) {
      if (blobs[APPS[i]]) {
        var mount = [
          'import App from "' + blobs[APPS[i]] + '";',
          'import { createRoot } from "' + CDN['react-dom/client'] + '";',
          'import { createElement as h } from "' + CDN['react'] + '";',
          'createRoot(document.getElementById("root")).render(h(App));',
        ].join('\\n');
        entry = URL.createObjectURL(new Blob([mount], { type: 'text/javascript' }));
        break;
      }
    }
  }

  if (entry) {
    var s = document.createElement('script');
    s.type = 'module';
    s.src  = entry;
    s.onerror = function () {
      var r = document.getElementById('root');
      if (r) r.innerHTML = '<pre style="color:#ef4444;padding:16px;font-size:12px;font-family:monospace">'
        + 'Module load error — open browser console for details<\\/pre>';
    };
    document.head.appendChild(s);
  } else {
    var r = document.getElementById('root');
    if (r) r.textContent = 'No entry point found.';
  }
})();
<\/script>
</body>
</html>`
}
