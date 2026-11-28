"""Builds index.html: the page template with the game code and the model inlined (one file, no server needed)."""
import base64, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = root / 'src'
page = (src / 'page.html').read_text(encoding='utf-8')
code = '\n'.join((src / f).read_text(encoding='utf-8') for f in ['core.js', 'gfx.js', 'app.js', 'main.js'])
model = base64.b64encode((root / 'models' / 'classic-doodle.glb').read_bytes()).decode()
(root / 'index.html').write_text(page.replace('__CODE__', code).replace('__MODEL__', model), encoding='utf-8')
print('wrote index.html')
