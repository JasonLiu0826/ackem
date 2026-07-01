"""
导出收藏的表情包

python3 export_emoticons.py                         # 导出全部到 ./exported_emoticons/
python3 export_emoticons.py -o ./my_emojis           # 指定输出目录
python3 export_emoticons.py --dry-run                 # 仅列出，不下载
python3 export_emoticons.py --filter "猫"             # 按关键词过滤（匹配 caption 或 product_id）
"""
import argparse
import json
import os
import sys

import functools
print = functools.partial(print, flush=True)

from config import load_config
from emoticons import build_emoji_lookup, download_emoji
from key_utils import strip_key_metadata


def main():
    parser = argparse.ArgumentParser(
        description="导出微信收藏的表情包图片",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
    python3 export_emoticons.py                         全量导出
    python3 export_emoticons.py -o ./my_emojis          指定输出目录
    python3 export_emoticons.py --dry-run                预览模式
    python3 export_emoticons.py --filter "猫"            按关键词过滤
""",
    )
    parser.add_argument(
        "output_dir",
        nargs="?",
        default=None,
        help="输出目录路径 (默认: ./exported_emoticons)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="预览模式：显示表情列表，不实际下载",
    )
    parser.add_argument(
        "--filter",
        default=None,
        help="按关键词过滤（匹配 caption 或 product_id）",
    )
    args = parser.parse_args()

    cfg = load_config()
    keys_file = cfg["keys_file"]
    db_dir = cfg["db_dir"]

    if not os.path.exists(keys_file):
        print("[!] 密钥文件不存在，请先运行 python main.py 提取密钥")
        sys.exit(1)

    with open(keys_file, encoding="utf-8") as f:
        keys = json.load(f)
    keys = strip_key_metadata(keys)
    if not keys:
        print("[!] 密钥为空，请先运行 python main.py 提取密钥")
        sys.exit(1)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = args.output_dir or os.path.join(script_dir, "exported_emoticons")

    print(f"[*] 构建表情映射...")
    lookup = build_emoji_lookup(keys, db_dir)
    if not lookup:
        print("[!] 未找到任何表情")
        sys.exit(1)

    # 过滤
    items = list(lookup.items())
    if args.filter:
        keyword = args.filter.lower()
        items = [
            (md5, info) for md5, info in items
            if keyword in (info.get("caption", "") or "").lower()
            or keyword in (info.get("product_id", "") or "").lower()
        ]
        print(f"[*] 过滤后: {len(items)} 个表情")

    if args.dry_run:
        print(f"\n{'MD5':<34} {'格式':>6} {'来源':>8} {'描述'}")
        print("-" * 80)
        for md5, info in items:
            src = "NonStore" if info.get("product_id", "") == "" else "Store"
            caption = info.get("caption", "") or ""
            has_cdn = "Y" if info.get("cdn_url") else "N"
            print(f"{md5}  cdn={has_cdn}  {src:>8}  {caption}")
        print(f"\n共 {len(items)} 个表情")
        return

    os.makedirs(output_dir, exist_ok=True)

    print(f"[*] 开始下载 {len(items)} 个表情到 {output_dir}")
    print()

    try:
        from tqdm import tqdm
        iterator = tqdm(items, desc="下载表情", unit="个")
    except ImportError:
        iterator = items

    success = 0
    failed = 0

    for md5, info in iterator:
        fname = download_emoji(md5, lookup, output_dir)
        if fname:
            success += 1
        else:
            failed += 1

    print()
    print(f"[+] 完成: {success} 成功, {failed} 失败")
    print(f"    输出目录: {output_dir}")


if __name__ == "__main__":
    main()
