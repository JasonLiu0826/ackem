"""
表情包公共模块 — 从 emoticon.db 构建 MD5→CDN 映射 + 下载

供 monitor_web.py、export_emoticons.py 复用。
"""
import os
import re
import sqlite3
import struct
import tempfile
import urllib.request

from Crypto.Cipher import AES

from key_utils import get_key_info
from decrypt_db import decrypt_page

PAGE_SZ = 4096
WAL_HEADER_SZ = 32
WAL_FRAME_HEADER_SZ = 24


def _full_decrypt(db_path, out_path, enc_key):
    """全量解密数据库（跳过 HMAC 校验，适合运行时使用）"""
    file_size = os.path.getsize(db_path)
    total_pages = file_size // PAGE_SZ
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(db_path, "rb") as fin, open(out_path, "wb") as fout:
        for pgno in range(1, total_pages + 1):
            page = fin.read(PAGE_SZ)
            if len(page) < PAGE_SZ:
                if len(page) > 0:
                    page = page + b"\x00" * (PAGE_SZ - len(page))
                else:
                    break
            fout.write(decrypt_page(enc_key, page, pgno))


def _decrypt_wal(wal_path, out_path, enc_key):
    """解密 WAL 有效 frame 并 patch 到已解密的 DB 副本"""
    if not os.path.exists(wal_path):
        return
    wal_size = os.path.getsize(wal_path)
    if wal_size <= WAL_HEADER_SZ:
        return
    frame_size = WAL_FRAME_HEADER_SZ + PAGE_SZ
    with open(wal_path, "rb") as wf, open(out_path, "r+b") as df:
        wal_hdr = wf.read(WAL_HEADER_SZ)
        wal_salt1 = struct.unpack(">I", wal_hdr[16:20])[0]
        wal_salt2 = struct.unpack(">I", wal_hdr[20:24])[0]
        while wf.tell() + frame_size <= wal_size:
            fh = wf.read(WAL_FRAME_HEADER_SZ)
            if len(fh) < WAL_FRAME_HEADER_SZ:
                break
            pgno = struct.unpack(">I", fh[0:4])[0]
            frame_salt1 = struct.unpack(">I", fh[8:12])[0]
            frame_salt2 = struct.unpack(">I", fh[12:16])[0]
            ep = wf.read(PAGE_SZ)
            if len(ep) < PAGE_SZ:
                break
            if pgno == 0 or pgno > 1000000:
                continue
            if frame_salt1 != wal_salt1 or frame_salt2 != wal_salt2:
                continue
            dec = decrypt_page(enc_key, ep, pgno)
            df.seek((pgno - 1) * PAGE_SZ)
            df.write(dec)


def build_emoji_lookup(keys_dict, db_dir):
    """从 emoticon.db 构建 emoji md5 → URL 映射。

    返回: {md5: {cdn_url, aes_key, encrypt_url, caption, product_id}}
    """
    key_info = get_key_info(keys_dict, os.path.join("emoticon", "emoticon.db"))
    if not key_info:
        return {}

    src = os.path.join(db_dir, "emoticon", "emoticon.db")
    if not os.path.exists(src):
        return {}

    dst = os.path.join(tempfile.gettempdir(), "wechat_emoticon_dec.db")
    enc_key = bytes.fromhex(key_info["enc_key"])

    try:
        _full_decrypt(src, dst, enc_key)
        wal = src + "-wal"
        if os.path.exists(wal):
            _decrypt_wal(wal, dst, enc_key)
    except Exception as e:
        print(f"[emoticons] emoticon.db 解密失败: {e}", flush=True)
        return {}

    try:
        conn = sqlite3.connect(f"file:{dst}?mode=ro", uri=True)
        lookup = {}

        # 1. NonStore 表情（有独立 cdn_url）
        rows = conn.execute(
            "SELECT md5, aes_key, cdn_url, encrypt_url, product_id FROM kNonStoreEmoticonTable"
        ).fetchall()
        pkg_cdn_template = {}
        for md5, aes_key, cdn_url, encrypt_url, product_id in rows:
            if md5:
                lookup[md5] = {
                    "cdn_url": cdn_url or "",
                    "aes_key": aes_key or "",
                    "encrypt_url": encrypt_url or "",
                    "product_id": product_id or "",
                }
            if product_id and cdn_url:
                pkg_cdn_template[product_id] = cdn_url

        non_store_count = len(lookup)

        # 2. Store 表情（尝试构造 cdn_url）
        store_rows = conn.execute(
            "SELECT package_id_, md5_ FROM kStoreEmoticonFilesTable"
        ).fetchall()
        store_added = 0
        for pkg_id, md5 in store_rows:
            if md5 and md5 not in lookup:
                template = pkg_cdn_template.get(pkg_id, "")
                if template and "&" in template:
                    constructed = re.sub(r"m=[0-9a-f]+", f"m={md5}", template)
                    lookup[md5] = {
                        "cdn_url": constructed,
                        "aes_key": "",
                        "encrypt_url": "",
                        "product_id": pkg_id or "",
                    }
                    store_added += 1

        # 3. 收集 caption（表情描述）
        try:
            captions = conn.execute(
                "SELECT md5_, caption_ FROM kStoreEmoticonCaptionsTable WHERE language_='default'"
            ).fetchall()
            for md5, caption in captions:
                if md5 in lookup:
                    lookup[md5]["caption"] = caption or ""
        except Exception:
            pass

        conn.close()
        print(
            f"[emoticons] 已加载 {non_store_count} NonStore + {store_added} Store = {len(lookup)} 个表情映射",
            flush=True,
        )
        return lookup
    except Exception as e:
        print(f"[emoticons] 构建映射失败: {e}", flush=True)
        return {}
    finally:
        try:
            os.unlink(dst)
        except OSError:
            pass


def convert_hevc_to_jpeg(hevc_path, jpeg_path):
    """将 wxgf/HEVC 文件转为 JPEG

    wxgf 是微信自有格式: wxgf header + ICC profile + HEVC NAL units
    通过扫描 HEVC VPS start code (00 00 00 01 40 01) 定位 Annex B 流，
    再用 PyAV (ffmpeg) 解码首帧为 JPEG。
    """
    try:
        import av

        with open(hevc_path, 'rb') as f:
            data = f.read()

        # 扫描 HEVC Annex B VPS start code: 00 00 00 01 40 01
        vps_sig = b'\x00\x00\x00\x01\x40\x01'
        hevc_start = data.find(vps_sig)
        if hevc_start < 0:
            # fallback: 找 SPS (00 00 00 01 42 01)
            hevc_start = data.find(b'\x00\x00\x00\x01\x42\x01')
        if hevc_start < 0:
            return None

        # 提取 HEVC Annex B 流并用 PyAV 解码
        h265_path = hevc_path + '.h265'
        with open(h265_path, 'wb') as f:
            f.write(data[hevc_start:])

        try:
            container = av.open(h265_path, format='hevc')
            for frame in container.decode(video=0):
                img = frame.to_image()
                img.save(jpeg_path, "JPEG", quality=90)
                container.close()
                return jpeg_path
            container.close()
        finally:
            if os.path.exists(h265_path):
                os.unlink(h265_path)

    except ImportError:
        pass
    except Exception:
        pass
    return None


def download_emoji(md5, lookup, out_dir):
    """从 CDN 下载单个表情到 out_dir，返回文件名或 None。

    lookup: build_emoji_lookup() 返回的字典
    """
    info = lookup.get(md5)
    if not info:
        return None

    # 检查是否已缓存
    for ext in (".gif", ".png", ".jpg", ".webp"):
        cached = os.path.join(out_dir, f"{md5}{ext}")
        if os.path.exists(cached):
            return f"{md5}{ext}"

    cdn_url = info.get("cdn_url", "")
    aes_key = info.get("aes_key", "")
    encrypt_url = info.get("encrypt_url", "")

    data = None
    # 方法1: 从 cdn_url 直接下载（未加密）
    if cdn_url:
        try:
            req = urllib.request.Request(cdn_url, headers={"User-Agent": "Mozilla/5.0"})
            resp = urllib.request.urlopen(req, timeout=15)
            data = resp.read()
        except Exception:
            pass

    # 方法2: 从 encrypt_url 下载 + AES-CBC 解密
    if not data and encrypt_url and aes_key:
        try:
            req = urllib.request.Request(encrypt_url, headers={"User-Agent": "Mozilla/5.0"})
            resp = urllib.request.urlopen(req, timeout=15)
            enc_data = resp.read()
            key_bytes = bytes.fromhex(aes_key)
            cipher = AES.new(key_bytes, AES.MODE_CBC, iv=key_bytes)
            data = cipher.decrypt(enc_data)
            if data:
                pad = data[-1]
                if 1 <= pad <= 16 and data[-pad:] == bytes([pad]) * pad:
                    data = data[:-pad]
        except Exception:
            pass

    if not data or len(data) < 4:
        return None

    # 检测格式
    if data[:3] == b"\xff\xd8\xff":
        ext = ".jpg"
    elif data[:4] == b"\x89PNG":
        ext = ".png"
    elif data[:3] == b"GIF":
        ext = ".gif"
    elif data[:4] == b"RIFF":
        ext = ".webp"
    elif data[:4] == b"WXGF" or b"\x00\x00\x00\x01\x40\x01" in data[:256]:
        # wxgf/wxam (HEVC): 先存临时文件再转 JPEG
        os.makedirs(out_dir, exist_ok=True)
        tmp_path = os.path.join(out_dir, f"{md5}.wxgf")
        with open(tmp_path, "wb") as f:
            f.write(data)
        jpg_path = os.path.join(out_dir, f"{md5}.jpg")
        if convert_hevc_to_jpeg(tmp_path, jpg_path):
            os.unlink(tmp_path)
            return f"{md5}.jpg"
        # 转换失败，保留 .bin
        os.replace(tmp_path, os.path.join(out_dir, f"{md5}.bin"))
        return f"{md5}.bin"
    else:
        ext = ".bin"

    os.makedirs(out_dir, exist_ok=True)
    out_name = f"{md5}{ext}"
    out_path = os.path.join(out_dir, out_name)
    with open(out_path, "wb") as f:
        f.write(data)
    return out_name
