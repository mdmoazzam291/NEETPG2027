"""Build the same static artifact for CI and GitHub Pages."""
from pathlib import Path
import os
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / '_site'
subprocess.run(['python', str(ROOT / 'scripts/generate_question_manifest.py')], check=True)
DEST.mkdir(exist_ok=True)
for name in ['assets', 'neuralvault', 'data/pyq']:
    shutil.copytree(ROOT / name, DEST / name, dirs_exist_ok=True)
for name in ['index.html', 'manifest.webmanifest', 'sw.js']:
    shutil.copy2(ROOT / name, DEST / name)
page = (DEST / 'index.html').read_text()
styles = ['ui-v4', 'exam-v9', 'phase13', 'auth-v2']
scripts = ['supabase-config', 'phase13-preauth', 'auth-sync', 'auth-provider-guard', 'auth-v2', 'neetpg-timer', 'ui-v4', 'exam-analytics', 'exam-v9', 'phase10-taxonomy', 'pyq-metadata', 'phase11-analytics', 'phase11-exam-overlay', 'phase12-planning', 'phase13-hardening']
page = page.replace('</head>', ''.join(f'<link rel="stylesheet" href="assets/{name}.css">' for name in styles) + '</head>')
page = page.replace('</body>', '<script src="neuralvault/vault-db.js"></script>' + ''.join(f'<script src="assets/{name}.js" defer></script>' for name in scripts) + '</body>')
(DEST / 'index.html').write_text(page)
version = os.environ.get('GITHUB_SHA', 'dev')[:12]
for path in [DEST / 'index.html', DEST / 'neuralvault/index.html']:
    text = re.sub(r'(["\'])([^"\']+\.(?:js|css))\1', lambda m: f'{m[1]}{m[2]}?v={version}{m[1]}', path.read_text())
    path.write_text(text)
    for url in re.findall(r'(?:src|href)=["\']([^"\']+)["\']', text):
        if url.startswith(('http', '#', 'data:')): continue
        resource = url.split('?')[0]
        if resource.endswith(('.js', '.css')) and not (path.parent / resource).exists():
            raise RuntimeError(f'Missing production asset: {resource}')
print(f'Built {DEST}')

