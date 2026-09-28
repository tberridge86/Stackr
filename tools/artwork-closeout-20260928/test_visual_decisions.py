import importlib,json,unittest
from pathlib import Path
verify=importlib.import_module('recover-reviewed-pokedata').verify_decisions
class VisualDecisions(unittest.TestCase):
 def test_frozen_review(self):
  raw=Path(__file__).with_name('visual-decisions-18.json').read_bytes().replace(b'\r\n',b'\n')
  self.assertEqual(len(verify(raw)),18)
 def test_changed_image_fails(self):
  rows=json.loads(Path(__file__).with_name('visual-decisions-18.json').read_text(encoding='utf8'))
  rows[0]['sha256']='0'*64
  with self.assertRaisesRegex(ValueError,'Visual decisions changed'):verify(json.dumps(rows).encode())
