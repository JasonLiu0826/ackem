import hashlib
import io
import json
import os
import sqlite3
import tempfile
import unittest
from contextlib import redirect_stderr
from unittest.mock import patch

import export_all_chats


class DeltaHelperTests(unittest.TestCase):
    def test_run_id_uses_timestamp_shape(self):
        self.assertRegex(
            export_all_chats._delta_run_id(1779724800),
            r"\d{8}T\d{6}",
        )

    def test_filename_contains_safe_display_and_username(self):
        filename = export_all_chats._delta_filename(
            display_name="张三:/客户",
            is_group=False,
            username="wxid_abc",
        )
        self.assertEqual(filename, "single_张三__客户__wxid_abc.delta.json")

    def test_msg_uid_includes_username_db_local_id_timestamp_type_and_content(self):
        actual = export_all_chats._delta_msg_uid(
            username="wxid_abc",
            db_path=r"D:\wechat\message_1.db",
            local_id=7,
            timestamp=1778889601,
            msg_type="text",
            content="hello",
        )
        expected = hashlib.sha256((
            "wxid_abc|message_1.db|7|1778889601|text|"
            + hashlib.sha256("hello".encode("utf-8")).hexdigest()
        ).encode("utf-8")).hexdigest()
        self.assertEqual(actual, expected)


class ExportDeltaOneTests(unittest.TestCase):
    def test_writes_only_window_and_does_not_rewrite_full_json(self):
        username = "wxid_delta"
        with tempfile.TemporaryDirectory() as tmp:
            db_path = os.path.join(tmp, "message_1.db")
            table_name = _create_message_db(db_path, username)
            full_json = os.path.join(tmp, "single_张三.json")
            with open(full_json, "w", encoding="utf-8") as f:
                json.dump(
                    {"chat": "张三", "username": username, "messages": []},
                    f,
                    ensure_ascii=False,
                )
            with open(full_json, encoding="utf-8") as f:
                before = f.read()

            ctx = {
                "username": username,
                "display_name": "张三",
                "message_tables": [{"db_path": db_path, "table_name": table_name}],
                "is_group": False,
            }

            with patch.object(export_all_chats.mcp_server, "_resolve_chat_context",
                              return_value=ctx), \
                 patch.object(export_all_chats, "_resolve_sender",
                              return_value="me"), \
                 patch.object(export_all_chats, "_extract_content",
                              return_value=("rendered in range", None)), \
                 patch.object(export_all_chats, "_contact_metadata_for_export",
                              return_value={"contact_remark": "张三"}):
                result = export_all_chats.export_delta_one(
                    username=username,
                    delta_root=tmp,
                    names={username: "张三"},
                    run_id="20260526T080000",
                    start_ts=1778889600,
                    end_ts=1778890000,
                    transcribe=False,
                )

            self.assertTrue(result["success"])
            self.assertEqual(result["message_count"], 1)
            with open(full_json, encoding="utf-8") as f:
                self.assertEqual(f.read(), before)

            delta_path = os.path.join(
                tmp,
                "deltas",
                "20260526T080000",
                result["path"],
            )
            with open(delta_path, encoding="utf-8") as f:
                data = json.load(f)
            self.assertEqual(data["export_kind"], "wechat_delta")
            self.assertEqual(data["username"], username)
            self.assertEqual(data["message_count"], 1)
            self.assertEqual(data["messages"][0]["content"], "rendered in range")
            self.assertEqual(
                data["messages"][0]["msg_uid"],
                export_all_chats._delta_msg_uid(
                    username=username,
                    db_path=db_path,
                    local_id=2,
                    timestamp=1778889601,
                    msg_type="text",
                    content="in range",
                ),
            )

    def test_skips_file_when_window_is_empty(self):
        username = "wxid_delta"
        with tempfile.TemporaryDirectory() as tmp:
            db_path = os.path.join(tmp, "message_1.db")
            table_name = _create_message_db(db_path, username)
            ctx = {
                "username": username,
                "display_name": "张三",
                "message_tables": [{"db_path": db_path, "table_name": table_name}],
                "is_group": False,
            }

            with patch.object(export_all_chats.mcp_server, "_resolve_chat_context",
                              return_value=ctx):
                result = export_all_chats.export_delta_one(
                    username=username,
                    delta_root=tmp,
                    names={username: "张三"},
                    run_id="20260526T080000",
                    start_ts=1778890001,
                    end_ts=1778890100,
                    transcribe=False,
                )

            self.assertTrue(result["success"])
            self.assertTrue(result["skipped"])
            self.assertEqual(result["message_count"], 0)
            self.assertNotIn("path", result)
            self.assertFalse(os.path.exists(os.path.join(
                tmp,
                "deltas",
                "20260526T080000",
                "chats",
            )))


class DeltaOnlyCliTests(unittest.TestCase):
    def test_requires_start_before_touching_decrypted_dir(self):
        err = io.StringIO()
        with redirect_stderr(err):
            with self.assertRaises(SystemExit) as cm:
                export_all_chats.main(["--delta-only", r"D:\tmp\out"])

        self.assertEqual(cm.exception.code, 2)
        self.assertIn("--delta-only requires --start", err.getvalue())


class DeltaManifestTests(unittest.TestCase):
    def test_records_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            manifest_path = export_all_chats._write_delta_manifest(
                delta_root=tmp,
                run_id="20260526T080000",
                start_ts=1778889600,
                end_ts=1778890000,
                chats_checked=3,
                results=[
                    {
                        "success": True,
                        "username": "wxid_delta",
                        "chat": "张三",
                        "path": "chats/single_张三__wxid_delta.delta.json",
                        "message_count": 2,
                    },
                    {
                        "success": False,
                        "username": "wxid_empty",
                        "message_count": 0,
                        "reason": "no tables",
                    },
                    {
                        "success": True,
                        "skipped": True,
                        "username": "wxid_window_empty",
                        "message_count": 0,
                        "reason": "no messages in delta window",
                    },
                ],
            )
            with open(manifest_path, encoding="utf-8") as f:
                data = json.load(f)

        self.assertEqual(data["export_kind"], "wechat_delta_run")
        self.assertEqual(data["chats_checked"], 3)
        self.assertEqual(data["chats_with_messages"], 1)
        self.assertEqual(data["messages_exported"], 2)
        self.assertEqual(data["files"][0]["username"], "wxid_delta")
        self.assertEqual(data["errors"][0]["username"], "wxid_empty")


def _msg_table_name(username):
    return "Msg_" + hashlib.md5(username.encode("utf-8")).hexdigest()


def _create_message_db(path, username):
    table = _msg_table_name(username)
    conn = sqlite3.connect(path)
    conn.execute(
        f"""
        CREATE TABLE [{table}] (
            local_id INTEGER,
            local_type INTEGER,
            create_time INTEGER,
            real_sender_id INTEGER,
            message_content TEXT,
            WCDB_CT_message_content INTEGER
        )
        """
    )
    conn.executemany(
        f"INSERT INTO [{table}] VALUES (?, ?, ?, ?, ?, ?)",
        [
            (1, 1, 1778889500, 0, "too early", 0),
            (2, 1, 1778889601, 0, "in range", 0),
        ],
    )
    conn.commit()
    conn.close()
    return table


if __name__ == "__main__":
    unittest.main()
