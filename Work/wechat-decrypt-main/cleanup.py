#!/usr/bin/env python3
"""
WeChat Decrypt — 数据清理工具

安全地查看和解密导出数据占用的磁盘空间，交互式清理。

用法:
    python3 cleanup.py           # 交互式清理
    python3 cleanup.py status    # 仅显示磁盘用量
    python3 cleanup.py --dry-run # 显示将删除的内容但不实际操作
"""

import argparse
import glob
import json
import os
import shutil
import sys


def format_size(size_bytes):
    """格式化文件大小"""
    if size_bytes > 1024 * 1024 * 1024:
        return f"{size_bytes / 1024 / 1024 / 1024:.1f} GB"
    elif size_bytes > 1024 * 1024:
        return f"{size_bytes / 1024 / 1024:.0f} MB"
    elif size_bytes > 1024:
        return f"{size_bytes / 1024:.0f} KB"
    else:
        return f"{size_bytes} B"


class CleanupItem:
    def __init__(self, name, path, is_dir=True, pattern=None, description=""):
        self.name = name
        self.path = path
        self.is_dir = is_dir
        self.pattern = pattern
        self.description = description

    def size(self):
        if not self.exists():
            return 0
        if self.is_dir:
            if self.pattern:
                files = glob.glob(os.path.join(self.path, self.pattern), recursive=True)
                files = [f for f in files if os.path.isfile(f)]
            else:
                files = []
                for root, dirs, fnames in os.walk(self.path):
                    for fname in fnames:
                        files.append(os.path.join(root, fname))
            return sum(os.path.getsize(f) for f in files)
        else:
            return os.path.getsize(self.path) if os.path.isfile(self.path) else 0

    def exists(self):
        if self.is_dir:
            return os.path.isdir(self.path)
        return os.path.isfile(self.path)

    def delete(self):
        if not self.exists():
            return
        if self.is_dir:
            shutil.rmtree(self.path)
        else:
            os.unlink(self.path)


def get_items():
    """返回所有可清理项的列表"""
    items = []

    # 解密数据库
    cfg = {}
    if os.path.exists("config.json"):
        with open("config.json") as f:
            cfg = json.load(f)
    decrypted_dir = cfg.get("decrypted_dir", "decrypted")
    items.append(CleanupItem(
        "解密数据库", decrypted_dir,
        description="解密后的 SQLite 数据库文件（可重新解密恢复）"
    ))

    # WAV 解码缓存
    items.append(CleanupItem(
        "语音 WAV 缓存", "decoded_voices",
        description="SILK 解码后的临时 WAV 文件（可重新解码）"
    ))

    # 图片解码缓存
    items.append(CleanupItem(
        "图片解码缓存", "decoded_images",
        description="解密后的图片缓存"
    ))

    # 导出 JSON
    items.append(CleanupItem(
        "导出聊天记录", "exported_chats",
        description="export_all_chats.py 导出的 JSON 文件（可重新导出）"
    ))

    # 旧格式导出
    items.append(CleanupItem(
        "旧格式导出", "exports",
        description="旧版本导出的数据"
    ))

    # 密钥文件
    for kf in sorted(glob.glob("all_keys*.json")):
        items.append(CleanupItem(
            os.path.basename(kf), kf, is_dir=False,
            description="密钥缓存文件（可重新提取）"
        ))

    return items


def show_status(items):
    """显示各项目的磁盘用量"""
    total = 0
    rows = []
    for item in items:
        sz = item.size()
        if sz > 0:
            total += sz
            rows.append((item.name, sz, item.description))

    if not rows:
        print("没有需要清理的数据。")
        return 0

    # 找最长的名称
    name_width = max(len(r[0]) for r in rows) + 2
    print(f"{'项目':<{name_width}}{'大小':>10}  说明")
    print("-" * (name_width + 45))
    for name, sz, desc in rows:
        print(f"{name:<{name_width}}{format_size(sz):>10}  {desc}")
    print("-" * (name_width + 45))
    print(f"{'总计':<{name_width}}{format_size(total):>10}")
    return total


def cleanup(dry_run=False):
    """交互式清理"""
    items = get_items()

    print("=" * 60)
    print("  磁盘用量分析")
    print("=" * 60)
    print()
    total = show_status(items)
    if total == 0:
        print()
        print("没有需要清理的数据。")
        return

    print()
    print("选择要删除的项目（逗号分隔，如: 1,3,5）:")
    print("  输入 a 选择全部")
    print("  输入 n 取消")
    choice = input("> ").strip().lower()

    if choice in ("", "n"):
        print("已取消。")
        return

    # 解析选择
    indices = []
    if choice == "a":
        indices = list(range(len(items)))
    else:
        for part in choice.split(","):
            part = part.strip()
            try:
                idx = int(part) - 1
                if 0 <= idx < len(items):
                    indices.append(idx)
            except ValueError:
                pass

    if not indices:
        print("未选择任何项目。")
        return

    # 确认
    total_saved = 0
    print()
    for idx in indices:
        item = items[idx]
        if item.exists():
            sz = item.size()
            total_saved += sz
            print(f"  [{idx+1}] {item.name} ({format_size(sz)})")

    print(f"\n将释放 {format_size(total_saved)} 磁盘空间")
    if dry_run:
        print("（dry-run 模式，未实际删除）")
        return

    confirm = input("确认删除？(y/N): ").strip().lower()
    if confirm != "y":
        print("已取消。")
        return

    # 执行删除
    for idx in indices:
        item = items[idx]
        if item.exists():
            sz = item.size()
            item.delete()
            print(f"  已删除: {item.name} ({format_size(sz)})")

    print()
    # 显示剩余
    remaining = sum(item.size() for item in get_items())
    print(f"剩余: {format_size(remaining)}")
    print("清理完成。")


def main():
    parser = argparse.ArgumentParser(
        description="WeChat Decrypt — 数据清理工具",
    )
    parser.add_argument("mode", nargs="?", default="interactive",
                        choices=["interactive", "status"],
                        help="interactive（默认）或 status（仅显示）")
    parser.add_argument("--dry-run", action="store_true",
                        help="预览模式，不实际删除")
    args = parser.parse_args()

    if args.mode == "status":
        show_status(get_items())
    else:
        cleanup(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
