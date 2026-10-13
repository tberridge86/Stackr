import importlib.util
import unittest
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location("sm_trainer_kit_downloader", Path(__file__).with_name("download-package.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ArchiveSafety(unittest.TestCase):
    def entries(self):
        expected = module.expected_objects()
        entries = []
        for name in list(expected) + sorted(module.METADATA):
            info = zipfile.ZipInfo(name)
            info.file_size = expected[name]["byte_size"] if name in expected else 1024
            entries.append(info)
        return expected, entries

    def test_exact_120_images_and_three_metadata_files(self):
        expected, entries = self.entries()
        module.validate_entries(entries, expected)
        self.assertEqual(len(expected), 120)

    def test_duplicate_extra_traversal_symlink_size_and_encryption_rejected(self):
        for change in ["duplicate", "extra", "traversal", "symlink", "size", "encrypted"]:
            expected, entries = self.entries()
            if change == "duplicate":
                entries[-1].filename = entries[0].filename
            elif change == "extra":
                entries.append(zipfile.ZipInfo("extra.txt"))
            elif change == "traversal":
                entries[-1].filename = "../escaped.txt"
            elif change == "symlink":
                entries[0].external_attr = 0o120777 << 16
            elif change == "encrypted":
                entries[0].flag_bits = 1
            else:
                entries[0].file_size += 1
            with self.subTest(change=change), self.assertRaises(ValueError):
                module.validate_entries(entries, expected)


if __name__ == "__main__":
    unittest.main()
