import importlib.util
import hashlib
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location("neo_downloader", Path(__file__).with_name("download-package.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ArchiveSafety(unittest.TestCase):
    def test_corrupt_or_truncated_outer_archive_is_rejected_before_creating_target(self):
        plan = json.loads(json.dumps(module.load_plan()))
        original = b"pinned archive bytes"
        plan["archive"]["byte_size"] = len(original)
        plan["archive"]["sha256"] = hashlib.sha256(original).hexdigest()
        for data in [bytes([original[0] ^ 1]) + original[1:], original[:-1]]:
            with self.subTest(length=len(data)), tempfile.TemporaryDirectory() as temporary:
                archive = Path(temporary) / "corrupt.zip"
                archive.write_bytes(data)
                target = Path(temporary) / "uncreated"
                with self.assertRaisesRegex(ValueError, "archive checksum mismatch"):
                    module.extract(archive, target, plan)
                self.assertFalse(target.exists())

    def entries(self):
        expected = module.expected_objects()
        entries = []
        for name in list(expected) + sorted(module.METADATA):
            info = zipfile.ZipInfo(name)
            info.file_size = expected[name]["byte_size"] if name in expected else 1024
            entries.append(info)
        return expected, entries

    def test_exact_unique_images_and_four_metadata_files(self):
        expected, entries = self.entries()
        module.validate_entries(entries, expected)
        self.assertEqual(len(expected) + 4, module.load_plan()["archive"]["file_count"])

    def test_identical_paths_deduplicate_and_incompatible_aliases_fail(self):
        plan = module.load_plan()
        expected = module.expected_objects(plan)
        duplicate = json.loads(json.dumps(plan))
        duplicate["rows"].append(json.loads(json.dumps(duplicate["rows"][0])))
        self.assertEqual(module.expected_objects(duplicate), expected)
        for field in ["sha256", "byte_size", "width", "height", "mime_type", "role", "artifact_id"]:
            changed = json.loads(json.dumps(duplicate))
            changed["rows"][-1]["objects"][2][field] = "conflict"
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

    def test_all_four_metadata_members_are_checked_before_any_extraction(self):
        plan = module.load_plan()
        fake = json.loads(json.dumps(plan))
        fake["rows"] = [fake["rows"][0]]
        objects = fake["rows"][0]["objects"]
        image_data = {obj["file"]: (obj["role"] + "-test-bytes").encode() for obj in objects}
        for obj in objects:
            obj["byte_size"] = len(image_data[obj["file"]])
            obj["sha256"] = hashlib.sha256(image_data[obj["file"]]).hexdigest()
        metadata_data = {name: b'{"test":"frozen"}' for name in module.METADATA}
        fake["archive_metadata"] = [{"file": name, "sha256": hashlib.sha256(data).hexdigest(), "byte_size": len(data)} for name, data in metadata_data.items()]
        for changed_name in [None] + sorted(module.METADATA):
            with self.subTest(changed=changed_name), tempfile.TemporaryDirectory() as temporary:
                archive = Path(temporary) / "test.zip"
                with zipfile.ZipFile(archive, "w") as bundle:
                    for name, data in image_data.items():
                        bundle.writestr(name, data)
                    for name, data in metadata_data.items():
                        bundle.writestr(name, b'{"test":"altered"}' if name == changed_name else data)
                fake["archive"]["byte_size"] = archive.stat().st_size
                fake["archive"]["sha256"] = module.file_hash(archive)
                target = Path(temporary) / "extracted"
                if changed_name is None:
                    module.extract(archive, target, fake)
                    self.assertEqual(len(list(target.rglob("*.json"))), 4)
                else:
                    with self.assertRaisesRegex(ValueError, "metadata bytes changed"):
                        module.extract(archive, target, fake)
                    self.assertEqual(list(target.rglob("*")), [])


    def test_changed_image_rejected_before_extraction_even_with_rehashed_outer_archive(self):
        fake = json.loads(json.dumps(module.load_plan()))
        fake["rows"] = [fake["rows"][0]]
        objects = fake["rows"][0]["objects"]
        image_data = {obj["file"]: (obj["role"] + "-test-bytes").encode() for obj in objects}
        for obj in objects:
            obj["byte_size"] = len(image_data[obj["file"]])
            obj["sha256"] = hashlib.sha256(image_data[obj["file"]]).hexdigest()
        metadata_data = {name: b'{"test":"frozen"}' for name in module.METADATA}
        fake["archive_metadata"] = [{"file": name, "sha256": hashlib.sha256(data).hexdigest(), "byte_size": len(data)} for name, data in metadata_data.items()]
        with tempfile.TemporaryDirectory() as temporary:
            archive = Path(temporary) / "changed-image.zip"
            changed_name = objects[0]["file"]
            with zipfile.ZipFile(archive, "w") as bundle:
                for name, data in image_data.items():
                    bundle.writestr(name, bytes([data[0] ^ 1]) + data[1:] if name == changed_name else data)
                for name, data in metadata_data.items():
                    bundle.writestr(name, data)
            fake["archive"]["byte_size"] = archive.stat().st_size
            fake["archive"]["sha256"] = module.file_hash(archive)
            target = Path(temporary) / "extracted"
            with self.assertRaisesRegex(ValueError, "image checksum mismatch"):
                module.extract(archive, target, fake)
            self.assertEqual(list(target.rglob("*")), [])


if __name__ == "__main__":
    unittest.main()
