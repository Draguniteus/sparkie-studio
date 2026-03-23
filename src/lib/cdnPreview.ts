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

// Backend-only packages — if present, project needs WC/E2B, not CDN
const BACKEND_DEPS = new Set([
  'express', 'fastify', 'koa', 'hapi', '@nestjs/core', '@nestjs/common',
  'http-server', 'http', 'https', 'net', 'fs', 'child_process', 'worker_threads',
  'pg', 'pg-pool', 'mysql', 'mysql2', 'mongoose', 'mongodb', 'prisma', '@prisma/client',
  'sequelize', 'typeorm', 'knex', 'redis', 'ioredis',
  'socket.io', 'ws', 'node-fetch', 'nodemailer', 'sharp',
])

// Signals that a package.json is for a frontend/browser project
const FRONTEND_SIGNALS = [
  'react', 'react-dom', 'vue', 'svelte', 'solid-js', '@solidjs/core',
  'preact', 'lit', 'three', 'p5', 'pixi.js', 'd3', 'gsap',
  'framer-motion', 'react-spring', '@react-spring/web',
  'lucide-react', '@heroicons/react', 'recharts', 'chart.js',
]

// ─── Tree walker ──────────────────────────────────────────────────────────────

/**
 * Walk a FileNode tree recursively and collect all leaf files with their
 * FULL relative paths (e.g. "sparkie/src/App.tsx"), not just leaf names.
 * Archive nodes are skipped.
 */
function walkTree(
  nodes: FileNode[],
  prefix = '',
): Array<{ name: string; content: string }> {
  const result: Array<{ name: string; content: string }> = []
  for (const node of nodes) {
    if (node.type === 'archive') continue
    const path = prefix ? `${prefix}/${node.name}` : node.name
    if (node.type === 'folder') {
      result.push(...walkTree(node.children ?? [], path))
    } else {
      result.push({ name: path, content: node.content ?? '' })
    }
  }
  return result
}

/**
 * Derive the project root prefix from where package.json lives.
 * e.g. if package.json is at "sparkie/package.json", prefix = "sparkie/"
 * Works regardless of what the root folder is named.
 */
function deriveRootPrefix(all: Array<{ name: string }>): string {
  const pkg = all.find(f => f.name === 'package.json' || f.name.endsWith('/package.json'))
  if (!pkg) return ''
  const parts = pkg.name.split('/')
  // package.json at root → no prefix; inside a folder → strip that folder
  return parts.length > 1 ? parts.slice(0, -1).join('/') + '/' : ''
}

/** Strip the project root prefix from all paths. */
function applyPrefix(
  files: Array<{ name: string; content: string }>,
  prefix: string,
): Array<{ name: string; content: string }> {
  if (!prefix) return files
  return files.map(f => ({
    ...f,
    name: f.name.startsWith(prefix) ? f.name.slice(prefix.length) : f.name,
  }))
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true when the project is a browser/frontend app that can be previewed
 * via CDN (esm.sh + Babel standalone), skipping npm install / WebContainer entirely.
 *
 * Strategy: allow any project that has at least one frontend signal and NO backend-only
 * packages. Unknown frontend deps are auto-resolved via esm.sh in buildCDNPreviewHtml.
 */
export function isCDNCompatible(files: FileNode[], activeProjectRoot?: string | null): boolean {
  // Walk the full tree to get all leaf files with reconstructed full paths
  const all = walkTree(files)

  // Filter to active project only when specified
  const scoped = activeProjectRoot
    ? all.filter(f => f.name === activeProjectRoot + '/package.json' || f.name.startsWith(activeProjectRoot + '/'))
    : all

  // Find package.json at any depth, regardless of root folder name
  const pkg = scoped.find(f => f.name === 'package.json' || f.name.endsWith('/package.json'))
  if (!pkg?.content) return false

  try {
    const parsed = JSON.parse(pkg.content) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    // Check all deps (runtime + dev) for backend-only packages
    const allDeps = { ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) }
    const depKeys = Object.keys(allDeps).filter(d => !SKIP_PREFIXES.some(s => d.startsWith(s)))

    // If any dep is a known backend package, this project needs WC/E2B
    const hasBackend = depKeys.some(d => BACKEND_DEPS.has(d))
    if (hasBackend) return false

    // Must have at least one recognizable frontend signal
    const hasFrontend = depKeys.some(d =>
      FRONTEND_SIGNALS.some(sig => d === sig || d.startsWith(sig + '/') || d.startsWith('@' + sig.replace(/^@/, '')))
    )
    if (hasFrontend) return true

    // Vite-only projects: all deps are in SKIP_PREFIXES → depKeys is empty.
    // Fall back to checking for JSX/TSX/static files — if they exist and no backend,
    // treat as CDN-compatible (React will be auto-resolved via esm.sh).
    const hasJsxFiles = scoped.some(f => /\.(tsx|jsx)$/.test(f.name))
    const hasStaticHtml = scoped.some(f => f.name === 'index.html' || f.name.endsWith('/index.html'))
    return hasJsxFiles || hasStaticHtml
  } catch { return false }
}

/**
 * Build a self-contained srcdoc HTML string using a two-pass compilation approach:
 *  1. Phase 1: Compile ALL .tsx/.ts files with Babel (JSX + TS → ES modules)
 *  2. Phase 2: Build a dependency graph from parsed imports
 *  3. Phase 3: Topological sort — leaf components (no local deps) processed first
 *  4. Phase 4: Create blob URLs in topo order — by the time file N is processed,
 *     all its local dependencies already have blob URLs in blobMap
 *
 * CDN bare specifiers (react, three, etc.) are handled by the importmap — never
 * replaced with blob URLs. Only @/ and relative (./) imports get blob-ified.
 */
export function buildCDNPreviewHtml(files: FileNode[], activeProjectRoot?: string | null): string {
  // Walk tree for full paths, then filter to active project and normalize paths
  const all = walkTree(files)
  const scoped = activeProjectRoot
    ? all.filter(f => f.name.startsWith(activeProjectRoot + '/') || f.name === activeProjectRoot + '/package.json')
    : all
  const prefix = deriveRootPrefix(scoped.length > 0 ? scoped : all)
  const norm   = applyPrefix(scoped.length > 0 ? scoped : all, prefix)

  const srcFiles = norm
    .filter(f => /\.(tsx?|jsx?)$/.test(f.name))
    .filter(f => !/vite\.config|tsconfig|\.test\.|\.spec\.|\.d\.ts$/.test(f.name))

  const css = norm
    .filter(f => f.name.endsWith('.css'))
    .map(f => f.content.replace(/@tailwind\s+\w+;?\s*/g, ''))  // strip @tailwind directives
    .join('\n')
    .replace(/<\/style>/gi, '<\\/style>')

  // Auto-resolve any runtime dep not in CDN_MAP via esm.sh
  const extraImports: Record<string, string> = {}
  const pkgFile = norm.find(f => f.name === 'package.json' || f.name.endsWith('/package.json'))
  if (pkgFile?.content) {
    try {
      const parsed = JSON.parse(pkgFile.content) as { dependencies?: Record<string, string> }
      for (const [dep, ver] of Object.entries(parsed.dependencies ?? {})) {
        if (!CDN_MAP[dep] && !SKIP_PREFIXES.some(s => dep.startsWith(s))) {
          const cleanVer = ver.replace(/[\^~>=<*]/g, '').split('.')[0] || 'latest'
          extraImports[dep] = `https://esm.sh/${dep}@${cleanVer}`
        }
      }
    } catch { /* ignore */ }
  }

  const filesJson     = JSON.stringify(srcFiles)
  const importmapJson = JSON.stringify({ imports: { ...CDN_MAP, ...extraImports } })

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script type="importmap">${importmapJson}<\/script>
<script src="https://cdn.tailwindcss.com"><\/script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{width:100%;min-height:100%}
body{width:100%;min-height:100vh;overflow:auto;background:#0a0a0a;color:#e2e8f0;font-family:system-ui,sans-serif}
#root{width:100%;min-height:100vh;display:flex;flex-direction:column}
canvas{max-width:100%;display:block}
.app,.App,[class*="app"],[class*="App"]{width:100%;min-height:100%}
${css}<\/style>
</head>
<body style="margin:0;padding:0;width:100%;min-height:100vh;overflow:auto;background:#0a0a0a">
<div id="root" style="width:100%;height:100%;display:flex;flex-direction:column"></div>
<script>
(function () {
  var FILES = ${filesJson};

  // Build name→content map
  var srcMap = {};
  FILES.forEach(function(f) { srcMap[f.name] = f.content; });

  var EXTS = ['', '.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.jsx', '/index.js'];
  function findSrc(path) {
    for (var i = 0; i < EXTS.length; i++) {
      if (srcMap[path + EXTS[i]] !== undefined) return path + EXTS[i];
    }
    return null;
  }

  // Resolve a local import specifier to a normalized file path, or null for CDN imports
  function resolveLocalPath(imp, baseName) {
    if (imp.startsWith('@/')) return findSrc('src/' + imp.slice(2));
    if (imp.startsWith('.')) {
      var dir = baseName.indexOf('/') !== -1 ? baseName.split('/').slice(0, -1).join('/') : '';
      var raw = dir ? dir + '/' + imp : imp;
      var parts = [];
      raw.split('/').forEach(function(p) {
        if (p === '..') parts.pop();
        else if (p && p !== '.') parts.push(p);
      });
      return findSrc(parts.join('/'));
    }
    return null;
  }

  // \u2500\u2500 Phase 1: Compile ALL files with Babel \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  var compiledMap = {};
  FILES.forEach(function(f) {
    try {
      var code = Babel.transform(f.content, {
        filename: f.name,
        presets: [
          ['react', { runtime: 'automatic' }],
          ['typescript', { isTSX: true, allExtensions: true }]
        ]
      }).code;
      // Strip CSS side-effect imports (not loadable as ES modules)
      code = code.replace(/\\bimport\\s+["'][^"']+\\.css["'];?\\n?/g, '');
      compiledMap[f.name] = code;
    } catch(e) {
      console.error('[CDN Preview] Babel error in ' + f.name + ':', e.message);
      compiledMap[f.name] = null;
    }
  });

  // \u2500\u2500 Phase 2: Build dependency graph \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function parseLocalDeps(code, baseName) {
    var deps = [], seen = {};
    var re = /\\b(?:from|import)\\s+["']([^"']+)["']/g, m;
    while ((m = re.exec(code)) !== null) {
      var r = resolveLocalPath(m[1], baseName);
      if (r && !seen[r]) { seen[r] = 1; deps.push(r); }
    }
    return deps;
  }

  var allNames = FILES.map(function(f) { return f.name; }).filter(function(n) { return !!compiledMap[n]; });
  var depGraph = {};
  allNames.forEach(function(n) { depGraph[n] = parseLocalDeps(compiledMap[n], n); });

  // \u2500\u2500 Phase 3: Topological sort (leaf deps first) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  // inDeg[n] = number of local deps n needs processed before it can be blobbed
  var inDeg = {};
  allNames.forEach(function(n) { inDeg[n] = 0; });
  allNames.forEach(function(n) {
    depGraph[n].forEach(function(dep) { if (inDeg.hasOwnProperty(dep)) inDeg[n]++; });
  });
  var queue = allNames.filter(function(n) { return inDeg[n] === 0; });
  var ordered = [];
  while (queue.length) {
    var node = queue.shift();
    ordered.push(node);
    allNames.forEach(function(n) {
      if (depGraph[n].indexOf(node) !== -1 && --inDeg[n] === 0) queue.push(n);
    });
  }
  // Append any remaining cyclic nodes so they still get processed
  allNames.forEach(function(n) { if (ordered.indexOf(n) === -1) ordered.push(n); });

  // \u2500\u2500 Phase 4: Create blob URLs in topological order \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  // By the time we process file N, all its deps already have blob URLs
  var blobMap = {};
  ordered.forEach(function(name) {
    var code = compiledMap[name];
    if (!code) return;
    // Replace local import specifiers with already-created blob URLs
    code = code.replace(
      /\\b(from|import)\\s+(["'])([^"']+)(["'])/g,
      function(m, kw, q1, imp, q2) {
        if (!imp.startsWith('.') && !imp.startsWith('@/')) return m;
        var r = resolveLocalPath(imp, name);
        return (r && blobMap[r]) ? kw + ' ' + q1 + blobMap[r] + q2 : m;
      }
    );
    blobMap[name] = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  });

  // \u2500\u2500 Find entry point \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  var ENTRIES = ['src/main.tsx','src/main.ts','src/main.jsx','src/main.js','main.tsx','main.jsx','main.ts','main.js'];
  var entry = null;
  for (var i = 0; i < ENTRIES.length; i++) {
    if (blobMap[ENTRIES[i]]) { entry = blobMap[ENTRIES[i]]; break; }
  }

  // Fallback: auto-mount App component if no main.tsx found
  if (!entry) {
    var APPS = ['src/App.tsx','src/App.jsx','App.tsx','App.jsx'];
    for (var j = 0; j < APPS.length; j++) {
      if (blobMap[APPS[j]]) {
        var mount = 'import App from "' + blobMap[APPS[j]] + '";\\n'
          + 'import { createRoot } from "react-dom/client";\\n'
          + 'import { createElement as h } from "react";\\n'
          + 'createRoot(document.getElementById("root")).render(h(App));';
        entry = URL.createObjectURL(new Blob([mount], { type: 'text/javascript' }));
        break;
      }
    }
  }

  if (entry) {
    var s = document.createElement('script');
    s.type = 'module';
    s.src  = entry;
    s.onerror = function() {
      var r = document.getElementById('root');
      if (r) r.innerHTML = '<pre style="color:#ef4444;padding:16px;font-size:12px;font-family:monospace">Module load error \u2014 open browser console for details<\\/pre>';
    };
    document.head.appendChild(s);
  } else {
    var r = document.getElementById('root');
    if (r) r.textContent = 'No entry point found (expected src/main.tsx or src/App.tsx).';
  }
})();
<\/script>
</body>
</html>`
}
