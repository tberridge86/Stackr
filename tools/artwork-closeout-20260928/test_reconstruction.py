import hashlib, importlib, json, tempfile, unittest
from pathlib import Path
from PIL import Image

verify_file = importlib.import_module('verify-reconstruction').verify_file

class FileGuards(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.file = self.root / 'card.png'
        Image.new('RGB', (240, 330)).save(self.file)
        b = self.file.read_bytes()
        self.expected = {'sha256': hashlib.sha256(b).hexdigest(), 'byte_size': len(b), 'width': 240, 'height': 330}
    def tearDown(self):
        self.temp.cleanup()
    def test_valid_image(self):
        self.assertEqual(verify_file(self.root, 'card.png', self.expected)['sha256'], self.expected['sha256'])
    def test_changed_bytes(self):
        self.file.write_bytes(self.file.read_bytes() + b'x')
        with self.assertRaises(ValueError): verify_file(self.root, 'card.png', self.expected)
    def test_wrong_dimensions(self):
        with self.assertRaises(ValueError): verify_file(self.root, 'card.png', {**self.expected, 'width': 241})
    def test_path_escape(self):
        with self.assertRaises(ValueError): verify_file(self.root / 'subdirectory', '../card.png', self.expected)
    def test_not_an_image(self):
        self.file.write_bytes(b'not an image')
        expected = {**self.expected, 'sha256': hashlib.sha256(b'not an image').hexdigest(), 'byte_size': 12}
        with self.assertRaises(Exception): verify_file(self.root, 'card.png', expected)

if __name__ == '__main__': unittest.main()
