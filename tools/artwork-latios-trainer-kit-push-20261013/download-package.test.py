import importlib.util
import json
import unittest
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location("latios_trainer_kit_downloader", Path(__file__).with_name("download-package.py"))
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

    def test_exact_frozen_images_and_three_metadata_files(self):
        expected, entries = self.entries()
        module.validate_entries(entries, expected)
        self.assertEqual(len(expected) + 3, module.load_plan()["archive"]["file_count"])
        self.assertLess(len(expected), len(module.load_plan()["rows"]) * 4)

    def test_identical_thumbnail_alias_is_deduplicated_but_conflicting_alias_is_rejected(self):
        plan = module.load_plan()
        self.assertEqual(sum(len(row["objects"]) for row in plan["rows"]), 128)
        objects = [obj for row in plan["rows"] for obj in row["objects"]]
        shared = [obj for obj in objects if obj["sha256"] == "7b8c56ed5dc51f4cf44c328f84e07b8d0788521fead649d81cad1944c951d6cc"]
        self.assertEqual(len(shared), 2)
        self.assertEqual(shared[0], shared[1])
        for field in ["sha256", "byte_size", "width", "height", "mime_type", "role", "artifact_id"]:
            changed = json.loads(json.dumps(plan))
            duplicate = [obj for row in changed["rows"] for obj in row["objects"] if obj["sha256"] == shared[0]["sha256"]][-1]
            duplicate[field] = "conflict"
            with self.subTest(field=field), self.assertRaises(ValueError):
                module.expected_objects(changed)

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
