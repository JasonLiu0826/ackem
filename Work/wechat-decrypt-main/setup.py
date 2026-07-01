#!/usr/bin/env python3
"""
WeChat Decrypt — 交互式配置向导

检测微信数据目录、选择转录 backend、生成 config.json。

用法:
    python3 setup.py           # 交互式配置
    python3 setup.py --check   # 仅检查环境，不修改文件
"""

import argparse
import glob
import json
import os
import platform
import shutil
import subprocess
import sys


def detect_wechat_dir():
    """自动检测微信数据目录"""
    system = platform.system().lower()

    if system == "darwin":
        containers = (
            os.path.expanduser(
                "~/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files"
            )
        )
        if os.path.exists(containers):
            dirs = [
                os.path.join(containers, d, "db_storage")
                for d in os.listdir(containers)
                if os.path.isdir(os.path.join(containers, d))
            ]
            dirs = [d for d in dirs if os.path.exists(d)]
            # 按修改时间排序，最近活跃的排最前
            dirs.sort(key=lambda d: os.path.getmtime(d), reverse=True)
            return dirs if dirs else None

    elif system == "linux":
        home = os.path.expanduser("~")
        candidates = [
            os.path.join(home, "Documents", "xwechat_files"),
            os.path.join(home, ".xwechat", "files"),
        ]
        for c in candidates:
            if os.path.exists(c):
                dirs = [
                    os.path.join(c, d, "db_storage")
                    for d in os.listdir(c)
                    if os.path.isdir(os.path.join(c, d))
                ]
                dirs = [d for d in dirs if os.path.exists(d)]
                if dirs:
                    return dirs

    elif system == "windows":
        localappdata = os.environ.get("LOCALAPPDATA", "")
        candidates = [
            os.path.join(localappdata, "xwechat_files"),
            os.path.join(os.environ.get("USERPROFILE", ""), "Documents", "xwechat_files"),
        ]
        for c in candidates:
            if os.path.exists(c):
                dirs = [
                    os.path.join(c, d, "db_storage")
                    for d in os.listdir(c)
                    if os.path.isdir(os.path.join(c, d))
                ]
                dirs = [d for d in dirs if os.path.exists(d)]
                if dirs:
                    return dirs

    return None


def detect_transcription_backends():
    """检测可用的转录 backend"""
    backends = {"local": True}  # local 总是可用（如果安装了依赖）

    # whisper-cpp
    if shutil.which("whisper-cpp") or shutil.which("whisper-cli"):
        backends["whisper_cpp"] = True
        model_dirs = [
            os.path.expanduser("~/Library/Application Support/whisper-cpp"),
            os.path.expanduser("~/whisper-models"),
            "/opt/homebrew/share/whisper-cpp/models",
        ]
        for md in model_dirs:
            if os.path.exists(md):
                models = [f for f in os.listdir(md) if f.startswith("ggml-") and f.endswith(".bin")]
                if models:
                    backends["whisper_cpp_model"] = models[0]
                    break
    else:
        backends["whisper_cpp"] = False

    # openai
    try:
        import openai  # noqa
        backends["openai"] = True
    except ImportError:
        backends["openai"] = False

    return backends


def check_environment():
    """检查环境，返回状态信息"""
    print("=== 环境检查 ===")
    py_ver = sys.version.split()[0]
    print(f"[Python] {py_ver}")

    # venv
    in_venv = sys.prefix != sys.base_prefix
    print(f"[venv]  {'是' if in_venv else '否'}")
    if not in_venv:
        print("       建议使用: python3 -m venv .venv && source .venv/bin/activate")

    # whisper-cpp
    whisper_bin = shutil.which("whisper-cpp") or shutil.which("whisper-cli")
    print(f"[whisper-cpp] {'✓ ' + whisper_bin if whisper_bin else '✗ 未安装 (brew install whisper-cpp)'}")

    # config
    if os.path.exists("config.json"):
        with open("config.json") as f:
            cfg = json.load(f)
        db_dir = cfg.get("db_dir", "?")
        backend = cfg.get("transcription_backend", "未设置")
        print(f"[config.json] ✓ (db_dir = {db_dir}, backend = {backend})")
    else:
        print("[config.json] ✗ 未找到")

    # 微信目录
    dirs = detect_wechat_dir()
    if dirs:
        print(f"[微信目录] 找到 {len(dirs)} 个:")
        for d in dirs:
            age_days = (os.path.getmtime(__file__ if '__file__' in dir() else 0) - os.path.getmtime(d)) / 86400 if os.path.exists(d) else 0
            print(f"            {d}")
    else:
        print("[微信目录] 未找到自动检测路径")

    return dirs


def interactive_setup():
    """交互式配置向导"""
    print("\n=== 微信解密工具 — 配置向导 ===\n")

    # 加载或创建配置
    config = {}
    if os.path.exists("config.json"):
        with open("config.json") as f:
            config = json.load(f)
        print(f"现有 config.json 已加载 ({len(config)} 个字段)")
        print()

    # 微信数据目录
    detected = detect_wechat_dir()
    if detected:
        if len(detected) == 1:
            chosen = detected[0]
            print(f"[1/3] 微信数据目录: 自动检测到")
            print(f"      {chosen}")
        else:
            print(f"[1/3] 检测到 {len(detected)} 个微信数据目录:")
            for i, d in enumerate(detected, 1):
                print(f"      [{i}] {d}")
            try:
                sel = int(input("\n请选择 (1-{}): ".format(len(detected))) or "1")
                chosen = detected[sel - 1]
            except (ValueError, IndexError):
                chosen = detected[0]
        config["db_dir"] = chosen
    else:
        print("[1/3] 微信数据目录: 未能自动检测")
        default_path = os.path.expanduser("~/Documents/xwechat_files/your_wxid/db_storage")
        chosen = input(f"      请手动输入路径 [{default_path}]: ") or default_path
        config["db_dir"] = chosen

    # 转录 backend
    backends = detect_transcription_backends()
    print(f"\n[2/3] 语音转录 backend:")
    print(f"      [1] local — 本地 CPU 转录（默认，隐私最佳，速度较慢）")
    status_w = "✓" if backends.get("whisper_cpp") else "✗ (brew install whisper-cpp)"
    print(f"      [2] whisper_cpp — GPU 加速 ({status_w})")
    status_o = "✓" if backends.get("openai") else "✗ (pip install openai)"
    print(f"      [3] openai — API 转录 ({status_o})")

    try:
        sel = int(input("\n      请选择 (1-3) [1]: ") or "1")
        if sel == 2:
            config["transcription_backend"] = "whisper_cpp"
            if "whisper_cpp_model" in backends:
                config["whisper_cpp_model"] = backends["whisper_cpp_model"]
        elif sel == 3:
            config["transcription_backend"] = "openai"
            key = input("      输入 OpenAI API Key: ").strip()
            if key:
                config["openai_api_key"] = key
        else:
            config["transcription_backend"] = "local"
    except (ValueError, IndexError):
        config["transcription_backend"] = "local"

    # 确认
    print(f"\n[3/3] 即将写入 config.json:")
    print(json.dumps(config, indent=4))
    ans = input("\n      确认？(Y/n): ").strip().lower()
    if ans in ("", "y", "yes"):
        with open("config.json", "w", encoding="utf-8") as f:
            json.dump(config, f, ensure_ascii=False, indent=4)
        print("      config.json 已写入")
    else:
        print("      已取消，config.json 未修改")

    print("\n配置完成！下一步:")
    print("  python main.py status    — 查看状态")
    print("  python main.py decrypt   — 解密数据库")
    print("  python main.py export    — 解密 + 导出聊天记录")


def main():
    parser = argparse.ArgumentParser(
        description="WeChat Decrypt — 配置向导",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="仅检查环境，不修改文件",
    )
    args = parser.parse_args()

    if args.check:
        check_environment()
    else:
        interactive_setup()


if __name__ == "__main__":
    main()
