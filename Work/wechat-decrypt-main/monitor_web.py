"""
微信实时消息监听器 - Web UI (SSE推送 + mtime检测)

http://localhost:5678
- 30ms轮询WAL/DB文件的mtime变化（WAL是预分配固定大小，不能用size检测）
- 检测到变化后：全量解密DB + 全量WAL patch
- SSE 服务器推送
"""
import hashlib, struct, os, sys, json, time, sqlite3, io, threading, queue, traceback, subprocess
import uuid
import hmac as hmac_mod
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from Crypto.Cipher import AES
import urllib.parse
import glob as glob_mod
import zstandard as zstd
from decode_image import extract_md5_from_packed_info, decrypt_dat_file, is_v2_format
from key_utils import get_key_info, strip_key_metadata

_zstd_dctx = zstd.ZstdDecompressor()

PAGE_SZ = 4096
KEY_SZ = 32
SALT_SZ = 16
RESERVE_SZ = 80
SQLITE_HDR = b'SQLite format 3\x00'
WAL_HEADER_SZ = 32
WAL_FRAME_HEADER_SZ = 24

from config import load_config
_cfg = load_config()
DB_DIR = _cfg["db_dir"]
KEYS_FILE = _cfg["keys_file"]
CONTACT_CACHE = os.path.join(_cfg["decrypted_dir"], "contact", "contact.db")
DECRYPTED_SESSION = os.path.join(_cfg["decrypted_dir"], "session", "session.db")
DECODED_IMAGE_DIR = _cfg.get("decoded_image_dir", os.path.join(os.path.dirname(os.path.abspath(__file__)), "decoded_images"))
MONITOR_CACHE_DIR = os.path.join(_cfg["decrypted_dir"], "_monitor_cache")
WECHAT_BASE_DIR = _cfg.get("wechat_base_dir", "")
IMAGE_AES_KEY = _cfg.get("image_aes_key")  # V2 格式 AES key (从微信内存提取)
IMAGE_XOR_KEY = _cfg.get("image_xor_key", 0x88)  # XOR key

POLL_MS = 30  # 高频轮询WAL/DB的mtime，30ms一次
PORT = 5678

sse_clients = []
sse_lock = threading.Lock()
messages_log = []
messages_lock = threading.Lock()
MAX_LOG = 500
_img_executor = ThreadPoolExecutor(max_workers=3, thread_name_prefix='img')
_hidden_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix='hidden')

# ---- Emoji 缓存 (使用 emoticons.py 公共模块) ----
from emoticons import build_emoji_lookup as _build_emoji_lookup_mod, download_emoji as _download_emoji_mod, convert_hevc_to_jpeg as _convert_hevc_to_jpeg

_emoji_lookup = {}       # md5 → dict
_emoji_lookup_lock = threading.Lock()
_emoji_keys_dict = None
_emoji_last_refresh = 0


def _build_emoji_lookup(keys_dict):
    global _emoji_lookup, _emoji_keys_dict, _emoji_last_refresh
    _emoji_keys_dict = keys_dict
    lookup = _build_emoji_lookup_mod(keys_dict, DB_DIR)
    if lookup:
        with _emoji_lookup_lock:
            _emoji_lookup = lookup
        _emoji_last_refresh = time.time()


def _download_emoji(md5):
    with _emoji_lookup_lock:
        info = _emoji_lookup.get(md5)
    if not info:
        if _emoji_keys_dict and time.time() - _emoji_last_refresh > 60:
            print(f"  [emoji] lookup miss, 刷新 emoticon.db...", flush=True)
            _build_emoji_lookup(_emoji_keys_dict)
        with _emoji_lookup_lock:
            info = _emoji_lookup.get(md5)
        if not info:
            return None

    # 先检查是否已缓存（旧文件名格式兼容）
    for ext in ('.gif', '.png', '.jpg', '.webp'):
        cached = os.path.join(DECODED_IMAGE_DIR, f"emoji_{md5}{ext}")
        if os.path.exists(cached):
            return f"emoji_{md5}{ext}"

    result = _download_emoji_mod(md5, _emoji_lookup, DECODED_IMAGE_DIR)
    if result:
        # 统一用 emoji_ 前缀（兼容旧缓存）
        src = os.path.join(DECODED_IMAGE_DIR, result)
        dst = os.path.join(DECODED_IMAGE_DIR, f"emoji_{result}")
        if src != dst and os.path.exists(src):
            os.replace(src, dst)
        return f"emoji_{result}"
    return None


class MonitorDBCache:
    """轻量 DB 缓存，mtime 检测变化时重新解密（线程安全）"""

    def __init__(self, keys, tmp_dir):
        self.keys = keys
        self.tmp_dir = tmp_dir
        os.makedirs(tmp_dir, exist_ok=True)
        self._state = {}  # rel_key → (db_mtime, wal_mtime)
        self._locks = {}  # per-key 锁，防止并发解密同一 DB
        self._meta_lock = threading.Lock()

    def _get_lock(self, rel_key):
        with self._meta_lock:
            if rel_key not in self._locks:
                self._locks[rel_key] = threading.Lock()
            return self._locks[rel_key]

    def invalidate(self, rel_key):
        """强制清除缓存状态，下次 get() 会重新全量解密"""
        lock = self._get_lock(rel_key)
        with lock:
            self._state.pop(rel_key, None)

    def peek(self, rel_key):
        """返回当前已解密文件路径,**不触发**重新解密 (即使源 mtime 变了)。

        给主循环 hot path (check_updates → _lookup_latest_message) 用,
        避免每次新消息都同步等待整个 message_N.db 重新全量解密 (10s+),
        把主循环延迟从亚秒级飙到 8-125s。

        返回的路径可能 stale (滞后 1 个 mtime 周期)。调用方应能容忍 stale
        (比如查不到 latest_local_id 时跳过加 _shown_keys, 让 hidden 路径
        异步兜底)。

        get() 仍保留同步行为给真正需要最新的调用方 (hidden 路径异步线程)。
        """
        if not get_key_info(self.keys, rel_key):
            return None
        out_name = rel_key.replace('\\', '_').replace('/', '_')
        out_path = os.path.join(self.tmp_dir, out_name)
        return out_path if os.path.exists(out_path) else None

    def get(self, rel_key):
        """返回解密后的临时文件路径，mtime 变化时自动重新解密"""
        key_info = get_key_info(self.keys, rel_key)
        if not key_info:
            return None

        lock = self._get_lock(rel_key)
        with lock:
            enc_key = bytes.fromhex(key_info["enc_key"])
            rel_path = rel_key.replace('\\', '/').replace('/', os.sep)
            db_path = os.path.join(DB_DIR, rel_path)
            wal_path = db_path + "-wal"

            if not os.path.exists(db_path):
                return None

            try:
                db_mtime = os.path.getmtime(db_path)
                wal_mtime = os.path.getmtime(wal_path) if os.path.exists(wal_path) else 0
            except OSError:
                return None

            out_name = rel_key.replace('\\', '_').replace('/', '_')
            out_path = os.path.join(self.tmp_dir, out_name)

            prev = self._state.get(rel_key)

            if prev is None or db_mtime != prev[0]:
                t0 = time.perf_counter()
                for _retry in range(3):
                    try:
                        full_decrypt(db_path, out_path, enc_key)
                        break
                    except PermissionError:
                        if _retry < 2:
                            time.sleep(1)
                        else:
                            raise
                if os.path.exists(wal_path):
                    decrypt_wal_full(wal_path, out_path, enc_key)
                ms = (time.perf_counter() - t0) * 1000
                print(f"  [cache] {rel_key} 全量解密 {ms:.0f}ms", flush=True)
                self._state[rel_key] = (db_mtime, wal_mtime)
            elif wal_mtime != prev[1]:
                t0 = time.perf_counter()
                decrypt_wal_full(wal_path, out_path, enc_key)
                ms = (time.perf_counter() - t0) * 1000
                print(f"  [cache] {rel_key} WAL patch {ms:.0f}ms", flush=True)
                self._state[rel_key] = (db_mtime, wal_mtime)

            return out_path


def build_username_db_map():
    """从已解密的 Name2Id 表构建 username → [db_keys] 映射

    同一个 username 可能存在于多个 message_N.db 中,
    按 DB 文件修改时间倒序排列（最新的排前面）。
    """
    # 先获取每个 DB 的 mtime 用于排序
    db_mtimes = {}
    for i in range(5):
        rel_key = os.path.join("message", f"message_{i}.db")
        db_path = os.path.join(DB_DIR, "message", f"message_{i}.db")
        try:
            db_mtimes[rel_key] = os.path.getmtime(db_path)
        except OSError:
            db_mtimes[rel_key] = 0

    mapping = {}  # username → [db_keys], 最新的在前
    decrypted_msg_dir = os.path.join(_cfg["decrypted_dir"], "message")
    for i in range(5):
        db_path = os.path.join(decrypted_msg_dir, f"message_{i}.db")
        if not os.path.exists(db_path):
            continue
        rel_key = os.path.join("message", f"message_{i}.db")
        try:
            conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
            for row in conn.execute("SELECT user_name FROM Name2Id").fetchall():
                if row[0] not in mapping:
                    mapping[row[0]] = []
                mapping[row[0]].append(rel_key)
            conn.close()
        except Exception as e:
            print(f"  [WARN] Name2Id message_{i}.db: {e}", flush=True)

    # 对每个 username 的 db_keys 按 mtime 倒序（最新的优先）
    for username in mapping:
        mapping[username].sort(key=lambda k: db_mtimes.get(k, 0), reverse=True)

    return mapping


def decrypt_page(enc_key, page_data, pgno):
    """解密单个加密页面"""
    iv = page_data[PAGE_SZ - RESERVE_SZ: PAGE_SZ - RESERVE_SZ + 16]
    if pgno == 1:
        encrypted = page_data[SALT_SZ: PAGE_SZ - RESERVE_SZ]
        cipher = AES.new(enc_key, AES.MODE_CBC, iv)
        decrypted = cipher.decrypt(encrypted)
        return bytearray(SQLITE_HDR + decrypted + b'\x00' * RESERVE_SZ)
    else:
        encrypted = page_data[:PAGE_SZ - RESERVE_SZ]
        cipher = AES.new(enc_key, AES.MODE_CBC, iv)
        decrypted = cipher.decrypt(encrypted)
        return decrypted + b'\x00' * RESERVE_SZ


def full_decrypt(db_path, out_path, enc_key):
    """首次全量解密"""
    t0 = time.perf_counter()
    file_size = os.path.getsize(db_path)
    total_pages = file_size // PAGE_SZ

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(db_path, 'rb') as fin, open(out_path, 'wb') as fout:
        for pgno in range(1, total_pages + 1):
            page = fin.read(PAGE_SZ)
            if len(page) < PAGE_SZ:
                if len(page) > 0:
                    page = page + b'\x00' * (PAGE_SZ - len(page))
                else:
                    break
            fout.write(decrypt_page(enc_key, page, pgno))

    ms = (time.perf_counter() - t0) * 1000
    return total_pages, ms


def decrypt_wal_full(wal_path, out_path, enc_key):
    """解密WAL当前有效frame，patch到已解密的DB副本

    WAL是预分配固定大小(4MB)，包含当前有效frame和上一轮遗留的旧frame。
    通过WAL header中的salt值区分：只有frame header的salt匹配WAL header的才是有效frame。

    返回: (patched_pages, elapsed_ms)
    """
    t0 = time.perf_counter()

    if not os.path.exists(wal_path):
        return 0, 0

    wal_size = os.path.getsize(wal_path)
    if wal_size <= WAL_HEADER_SZ:
        return 0, 0

    frame_size = WAL_FRAME_HEADER_SZ + PAGE_SZ  # 24 + 4096 = 4120
    patched = 0

    with open(wal_path, 'rb') as wf, open(out_path, 'r+b') as df:
        # 读WAL header，获取当前salt值
        wal_hdr = wf.read(WAL_HEADER_SZ)
        wal_salt1 = struct.unpack('>I', wal_hdr[16:20])[0]
        wal_salt2 = struct.unpack('>I', wal_hdr[20:24])[0]

        while wf.tell() + frame_size <= wal_size:
            fh = wf.read(WAL_FRAME_HEADER_SZ)
            if len(fh) < WAL_FRAME_HEADER_SZ:
                break
            pgno = struct.unpack('>I', fh[0:4])[0]
            frame_salt1 = struct.unpack('>I', fh[8:12])[0]
            frame_salt2 = struct.unpack('>I', fh[12:16])[0]

            ep = wf.read(PAGE_SZ)
            if len(ep) < PAGE_SZ:
                break

            # 校验: pgno有效 且 salt匹配当前WAL周期
            if pgno == 0 or pgno > 1000000:
                continue
            if frame_salt1 != wal_salt1 or frame_salt2 != wal_salt2:
                continue  # 旧周期遗留的frame，跳过

            dec = decrypt_page(enc_key, ep, pgno)
            df.seek((pgno - 1) * PAGE_SZ)
            df.write(dec)
            patched += 1

    ms = (time.perf_counter() - t0) * 1000
    return patched, ms


def load_contact_names(db_path=None):
    """加载联系人名字字典。

    Args:
        db_path: 指定的 contact.db 路径。None 则使用 CONTACT_CACHE（静态快照，可能过期）。
                 实时场景应传入 db_cache.get("contact/contact.db") 返回的路径，确保数据最新。
    """
    names = {}
    try:
        conn = sqlite3.connect(db_path or CONTACT_CACHE)
        for r in conn.execute("SELECT username, nick_name, remark FROM contact").fetchall():
            names[r[0]] = r[2] if r[2] else r[1] if r[1] else r[0]
        conn.close()
    except:
        pass
    return names


def _extract_pb_field_30(data):
    """从 extra_buffer (protobuf) 中提取 Field #30 的字符串值（联系人标签ID）"""
    if not data:
        return None
    pos = 0
    n = len(data)
    while pos < n:
        tag = 0
        shift = 0
        while pos < n:
            b = data[pos]; pos += 1
            tag |= (b & 0x7f) << shift
            if not (b & 0x80):
                break
            shift += 7
        field_num = tag >> 3
        wire_type = tag & 0x07
        if wire_type == 0:
            while pos < n and data[pos] & 0x80:
                pos += 1
            pos += 1
        elif wire_type == 2:
            length = 0; shift = 0
            while pos < n:
                b = data[pos]; pos += 1
                length |= (b & 0x7f) << shift
                if not (b & 0x80):
                    break
                shift += 7
            if field_num == 30:
                try:
                    return data[pos:pos + length].decode('utf-8')
                except Exception:
                    return None
            pos += length
        elif wire_type == 1:
            pos += 8
        elif wire_type == 5:
            pos += 4
        else:
            break
    return None


def load_contact_tags():
    """加载联系人标签及其成员"""
    try:
        conn = sqlite3.connect(CONTACT_CACHE)
        try:
            label_rows = conn.execute(
                "SELECT label_id_, label_name_, sort_order_ FROM contact_label ORDER BY sort_order_"
            ).fetchall()
        except Exception:
            conn.close()
            return []
        if not label_rows:
            conn.close()
            return []

        labels = {}
        for lid, lname, sort_order in label_rows:
            labels[lid] = {'id': lid, 'name': lname, 'sort_order': sort_order, 'members': []}

        names = load_contact_names()
        rows = conn.execute(
            "SELECT username, extra_buffer FROM contact WHERE extra_buffer IS NOT NULL"
        ).fetchall()
        conn.close()

        for username, buf in rows:
            label_str = _extract_pb_field_30(buf)
            if not label_str:
                continue
            display = names.get(username, username)
            for lid_s in label_str.split(','):
                try:
                    lid = int(lid_s.strip())
                except (ValueError, AttributeError):
                    continue
                if lid in labels:
                    labels[lid]['members'].append({'username': username, 'display_name': display})

        result = sorted(labels.values(), key=lambda t: t['sort_order'])
        for t in result:
            t['member_count'] = len(t['members'])
        return result
    except Exception:
        return []


def format_msg_type(t):
    return {
        1: '文本', 3: '图片', 34: '语音', 42: '名片',
        43: '视频', 47: '表情', 48: '位置', 49: '链接/文件',
        50: '通话', 10000: '系统', 10002: '撤回',
    }.get(t, f'type={t}')


def msg_type_icon(t):
    return {
        1: '💬', 3: '🖼️', 34: '🎤', 42: '👤',
        43: '🎬', 47: '😀', 48: '📍', 49: '🔗',
        50: '📞', 10000: '⚙️', 10002: '↩️',
    }.get(t, '📨')


def broadcast_sse(msg_data):
    event_type = msg_data.get('event', '')
    data_line = f"data: {json.dumps(msg_data, ensure_ascii=False)}\n"
    if event_type:
        payload = f"event: {event_type}\n{data_line}\n"
    else:
        payload = f"{data_line}\n"
    with sse_lock:
        dead = []
        for q in sse_clients:
            try:
                q.put_nowait(payload)
            except:
                dead.append(q)
        for q in dead:
            sse_clients.remove(q)




# ============ 监听器 ============

class SessionMonitor:
    # 改名/备注变更场景的刷新最小间隔（秒）。低于此间隔的 mtime 变化不触发
    # 全量 reload，避免微信高频写 contact.db 时 CPU 抖动。30s 是经验值。
    CONTACT_REFRESH_COOLDOWN = 30

    def __init__(self, enc_key, session_db, contact_names, db_cache=None, username_db_map=None):
        self.enc_key = enc_key
        self.session_db = session_db
        self.wal_path = session_db + "-wal"
        self.contact_names = contact_names
        self.db_cache = db_cache
        self.username_db_map = username_db_map or {}
        self.prev_state = {}
        self.decrypt_ms = 0
        self.patched_pages = 0
        # 已显示消息去重: {(username, timestamp, base_msg_type), ...}
        self._shown_keys = set()
        # contact.db mtime + 上次刷新时间，用于检测改名/备注变更
        self._contact_db_mtime = 0
        self._last_contact_refresh = 0

    def _maybe_refresh_contacts(self):
        """检测 contact.db mtime 变化时全量 reload 联系人缓存。

        覆盖三种变更场景:
        - 新增联系人（之前 commit e86e00d 只覆盖了这种）
        - 修改备注名（issue #67）
        - 修改群名

        受 CONTACT_REFRESH_COOLDOWN 节流，避免 contact.db 高频变更时反复 reload。
        """
        if not self.db_cache:
            return
        try:
            contact_path = self.db_cache.get(os.path.join("contact", "contact.db"))
        except Exception as e:
            print(f"  [contact] 实时解密 contact.db 失败: {e}", flush=True)
            return
        if not contact_path:
            return
        try:
            curr_mtime = os.path.getmtime(contact_path)
        except OSError:
            return
        now = time.time()
        if curr_mtime <= self._contact_db_mtime:
            return  # mtime 没变，跳过
        if now - self._last_contact_refresh < self.CONTACT_REFRESH_COOLDOWN:
            return  # cooldown 中，等下次
        refreshed = load_contact_names(contact_path)
        if refreshed:
            self.contact_names.update(refreshed)
        self._contact_db_mtime = curr_mtime
        self._last_contact_refresh = now

    def resolve_image(self, username, timestamp):
        """解密图片: username+timestamp → 解密后的图片文件名，失败返回 None"""
        if not self.db_cache or not self.username_db_map:
            return None

        # 1. 找到 username 对应的所有 message_N.db（按 mtime 倒序）
        db_keys = self.username_db_map.get(username)
        if not db_keys:
            return None

        # 2. 遍历候选 DB，找到包含该 timestamp 消息的那个
        table_name = f"Msg_{hashlib.md5(username.encode()).hexdigest()}"
        local_id = None
        for db_key in db_keys:
            for _try in range(2):
                msg_db_path = self.db_cache.get(db_key)
                if not msg_db_path:
                    break
                try:
                    conn = sqlite3.connect(f"file:{msg_db_path}?mode=ro", uri=True)
                    # 微信4.0 图片的 local_type 可能是复合编码: (sub<<32)|3
                    row = conn.execute(f"""
                        SELECT local_id FROM [{table_name}]
                        WHERE (local_type = 3 OR (local_type > 4294967296 AND local_type % 4294967296 = 3))
                        AND create_time = ?
                    """, (timestamp,)).fetchone()
                    if not row:
                        row = conn.execute(f"""
                            SELECT local_id FROM [{table_name}]
                            WHERE (local_type = 3 OR (local_type > 4294967296 AND local_type % 4294967296 = 3))
                            AND ABS(create_time - ?) <= 3
                            ORDER BY ABS(create_time - ?) LIMIT 1
                        """, (timestamp, timestamp)).fetchone()
                    conn.close()
                    if row:
                        local_id = row[0]
                    break
                except Exception as e:
                    if 'malformed' in str(e) and _try == 0:
                        print(f"  [img] {db_key} malformed, 强制刷新...", flush=True)
                        self.db_cache.invalidate(db_key)
                        continue
                    if 'no such table' not in str(e):
                        print(f"  [img] 查询 {db_key}/{table_name} 失败: {e}", flush=True)
                    break
            if local_id:
                break

        if not local_id:
            print(f"  [img] 未找到 local_id: {username} t={timestamp}", flush=True)
            return None

        # 4. 查 message_resource.db 获取 MD5
        #    local_id 不全局唯一，需要同时匹配 create_time
        file_md5 = None
        for _try in range(2):
            res_path = self.db_cache.get(os.path.join("message", "message_resource.db"))
            if not res_path:
                return None
            try:
                conn = sqlite3.connect(f"file:{res_path}?mode=ro", uri=True)
                row = conn.execute(
                    "SELECT packed_info FROM MessageResourceInfo "
                    "WHERE message_local_id = ? AND message_create_time = ? "
                    "AND (message_local_type = 3 OR message_local_type % 4294967296 = 3)",
                    (local_id, timestamp)
                ).fetchone()
                if not row:
                    row = conn.execute(
                        "SELECT packed_info FROM MessageResourceInfo "
                        "WHERE message_create_time = ? "
                        "AND (message_local_type = 3 OR message_local_type % 4294967296 = 3)",
                        (timestamp,)
                    ).fetchone()
                conn.close()
                if row and row[0]:
                    file_md5 = extract_md5_from_packed_info(row[0])
                break
            except Exception as e:
                if 'malformed' in str(e) and _try == 0:
                    print(f"  [img] resource DB malformed, 强制刷新...", flush=True)
                    self.db_cache.invalidate(os.path.join("message", "message_resource.db"))
                    continue
                print(f"  [img] 查询 message_resource 失败: {e}", flush=True)
                return None

        if not file_md5:
            print(f"  [img] 未找到 MD5: local_id={local_id} t={timestamp}", flush=True)
            return None

        # 5. 查找 .dat 文件
        attach_dir = os.path.join(WECHAT_BASE_DIR, "msg", "attach")
        username_hash = hashlib.md5(username.encode()).hexdigest()
        search_base = os.path.join(attach_dir, username_hash)

        if not os.path.isdir(search_base):
            print(f"  [img] attach 目录不存在: {search_base}", flush=True)
            return None

        pattern = os.path.join(search_base, "*", "Img", f"{file_md5}*.dat")
        dat_files = sorted(glob_mod.glob(pattern))
        if not dat_files:
            print(f"  [img] 未找到 .dat: MD5={file_md5}", flush=True)
            return None

        # 分类 .dat 文件
        # 优先级: 原图.dat(最大) > _h.dat > _W.dat > _t.dat(缩略图)
        ranked = []
        for f in dat_files:
            fname = os.path.basename(f).lower()
            sz = os.path.getsize(f)
            if '_t_' in fname:
                rank = 5  # _t_W.dat 缩略图变体
            elif '_t.' in fname:
                rank = 4  # _t.dat 缩略图
            elif '_w.' in fname:
                rank = 2  # _W.dat (V2 可转 JPEG)
            elif '_h.' in fname:
                rank = 1  # 高清
            elif fname == f"{file_md5}.dat".lower():
                rank = 0  # 原图 (最优先)
            else:
                rank = 0
            ranked.append((rank, sz, f))
        ranked.sort(key=lambda x: (x[0], -x[1]))

        # 6. 解密图片
        os.makedirs(DECODED_IMAGE_DIR, exist_ok=True)
        out_base = os.path.join(DECODED_IMAGE_DIR, file_md5)
        rank_names = {0: 'orig', 1: 'h', 2: 'W', 4: 't', 5: 't_W'}
        browser_formats = ('jpg', 'png', 'gif', 'webp')

        # 已有可用缓存则跳过
        for ext in browser_formats:
            candidate = f"{out_base}.{ext}"
            if os.path.exists(candidate):
                cached_sz = os.path.getsize(candidate)
                best_rank = ranked[0][0] if ranked else 99
                if cached_sz > 20480 or best_rank >= 4:
                    return os.path.basename(candidate)
                os.unlink(candidate)
                print(f"  [img] 缩略图升级: {cached_sz/1024:.0f}KB → 重解密", flush=True)
                break

        for rank, sz, selected in ranked:
            sel_type = rank_names.get(rank, '?')
            print(f"  [img] 尝试 {sel_type}({sz/1024:.0f}KB): {os.path.basename(selected)}", flush=True)

            if is_v2_format(selected) and not IMAGE_AES_KEY:
                print(f"  [img] V2 格式缺少 AES key, 跳过", flush=True)
                continue

            result_path, fmt = decrypt_dat_file(selected, f"{out_base}.tmp", IMAGE_AES_KEY, IMAGE_XOR_KEY)
            if not result_path:
                print(f"  [img] 解密失败, 跳过", flush=True)
                continue

            # HEVC/wxgf → 用 pillow-heif 转 JPEG
            if fmt in ('hevc', 'bin'):
                jpg_path = _convert_hevc_to_jpeg(result_path, f"{out_base}.jpg")
                os.unlink(result_path)
                if jpg_path:
                    size_kb = os.path.getsize(jpg_path) / 1024
                    print(f"  [img] HEVC→JPEG 成功: {os.path.basename(jpg_path)} ({size_kb:.0f}KB)", flush=True)
                    return os.path.basename(jpg_path)
                print(f"  [img] HEVC→JPEG 转换失败, 尝试下一个", flush=True)
                continue

            final = f"{out_base}.{fmt}"
            if os.path.exists(final):
                os.unlink(final)
            os.rename(result_path, final)
            size_kb = os.path.getsize(final) / 1024
            print(f"  [img] 解密成功: {os.path.basename(final)} ({size_kb:.0f}KB)", flush=True)
            return os.path.basename(final)

        print(f"  [img] 所有 .dat 均无法解密", flush=True)
        return '__v2_unsupported__'

    def _async_resolve_image(self, username, timestamp, msg_data):
        """后台线程: 解密图片并通过 SSE 推送更新"""
        delays = [0.3, 1.0, 2.0]
        for attempt in range(3):
            try:
                img_name = self.resolve_image(username, timestamp)
                if img_name == '__v2_unsupported__':
                    msg_data['content'] = '[图片 - 新加密格式暂不支持预览]'
                    broadcast_sse({
                        'event': 'image_update',
                        'timestamp': timestamp,
                        'username': username,
                        'v2_unsupported': True,
                    })
                    return
                elif img_name:
                    image_url = f'/img/{img_name}'
                    msg_data['image_url'] = image_url
                    broadcast_sse({
                        'event': 'image_update',
                        'timestamp': timestamp,
                        'username': username,
                        'image_url': image_url,
                    })
                    print(f"  [img] 异步解密成功: {img_name}", flush=True)
                    return
                elif attempt < 2:
                    time.sleep(delays[attempt])
            except Exception as e:
                print(f"  [img] 异步解密失败(attempt={attempt}): {e}", flush=True)
                if attempt < 2:
                    time.sleep(delays[attempt])

    def _fresh_decrypt_query(self, db_key, table_name, prev_ts, curr_ts):
        """独立解密 message DB 到临时文件并查询，避免共享缓存竞态"""
        key_info = get_key_info(self.db_cache.keys, db_key)
        if not key_info:
            return []
        enc_key = bytes.fromhex(key_info["enc_key"])
        rel_path = db_key.replace('\\', '/').replace('/', os.sep)
        db_path = os.path.join(DB_DIR, rel_path)
        wal_path = db_path + "-wal"
        if not os.path.exists(db_path):
            return []

        import tempfile
        fd, tmp_path = tempfile.mkstemp(suffix='.db')
        os.close(fd)
        try:
            t0 = time.perf_counter()
            full_decrypt(db_path, tmp_path, enc_key)
            if os.path.exists(wal_path):
                decrypt_wal_full(wal_path, tmp_path, enc_key)
            ms = (time.perf_counter() - t0) * 1000
            print(f"  [hidden] {db_key} 独立解密 {ms:.0f}ms", flush=True)

            conn = sqlite3.connect(f"file:{tmp_path}?mode=ro", uri=True)
            rows = conn.execute(f"""
                SELECT create_time, local_type, message_content, WCDB_CT_message_content
                FROM [{table_name}]
                WHERE create_time >= ? AND create_time <= ?
                ORDER BY create_time ASC
            """, (prev_ts, curr_ts)).fetchall()
            conn.close()
            return rows
        except Exception as e:
            print(f"  [hidden] {db_key} 独立解密失败: {e}", flush=True)
            return []
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    def _lookup_latest_message(self, username, timestamp):
        """从 message_N.db 查指定 username 在 timestamp 的最新一条消息，返回
        (local_id, message_content)。

        SessionTable 推送时调用：
        - local_id 加入 _shown_keys，供 `_check_hidden_messages` 精确去重 (issue #79)
        - message_content 用于替换 SessionTable.summary 的 ~80 字短截断 (issue #42)

        两者本就同行，合并到一次 SELECT，相比原 MAX(local_id) 不增加 IO。

        时机风险：SessionTable 写入比 message DB 早几毫秒，可能查不到。查不到时返回
        (None, None)，调用方跳过加 key，由 `_check_hidden_messages` 兜底。
        """
        if not self.db_cache or not self.username_db_map:
            return None, None
        db_keys = self.username_db_map.get(username, [])
        if not db_keys:
            return None, None
        table_name = f"Msg_{hashlib.md5(username.encode()).hexdigest()}"
        for db_key in db_keys:
            # 用 peek 不触发同步解密 (主线程 hot path)。如果缓存还 stale
            # 没 latest_local_id, 让 hidden 异步路径稍后兜底加 _shown_keys。
            # 见 MonitorDBCache.peek 注释关于为什么这里不能用 .get。
            dec_path = self.db_cache.peek(db_key)
            if not dec_path:
                continue
            try:
                with closing(sqlite3.connect(f"file:{dec_path}?mode=ro&immutable=1", uri=True)) as conn:
                    row = conn.execute(
                        f"SELECT local_id, message_content, WCDB_CT_message_content "
                        f"FROM [{table_name}] WHERE create_time = ? "
                        f"ORDER BY local_id DESC LIMIT 1",
                        (timestamp,),
                    ).fetchone()
                    if row and row[0]:
                        local_id, mc, ct = row
                        if isinstance(mc, bytes) and ct == 4:
                            try:
                                mc = _zstd_dctx.decompress(mc).decode('utf-8', errors='replace')
                            except Exception:
                                mc = mc.decode('utf-8', errors='replace')
                        elif isinstance(mc, bytes):
                            mc = mc.decode('utf-8', errors='replace')
                        # 群消息 message_content 形如 'wxid_xxx:\n<正文>'，与
                        # SessionTable.summary 调用方一致地剥离前缀
                        if mc and ':\n' in mc:
                            mc = mc.split(':\n', 1)[1]
                        return local_id, mc
            except Exception:
                continue
        return None, None

    def _check_hidden_messages(self, username, prev_ts, curr_ts, curr_msg_type, display, is_group, sender):
        """检查时间窗口内是否有被 session 摘要覆盖的消息（文字、图片、表情等）

        先用共享缓存查询（快），失败或可疑时用独立解密（慢但可靠）。
        """
        if not self.username_db_map:
            return
        db_keys = self.username_db_map.get(username)
        if not db_keys:
            return

        table_name = f"Msg_{hashlib.md5(username.encode()).hexdigest()}"
        print(f"  [hidden] 检查 {display[:15]} prev_ts={prev_ts} curr_ts={curr_ts} type={curr_msg_type}", flush=True)

        # 等待 message DB 写入完成
        time.sleep(1.0)

        # 快速路径: 用共享缓存查询（带重试）
        all_rows = []
        cache_failed = False
        for _try in range(3):
            all_rows.clear()
            if self.db_cache:
                for db_key in db_keys:
                    dec_path = self.db_cache.get(db_key)
                    if not dec_path:
                        continue
                    try:
                        conn = sqlite3.connect(f"file:{dec_path}?mode=ro", uri=True)
                        rows = conn.execute(f"""
                            SELECT local_id, create_time, local_type, message_content, WCDB_CT_message_content
                            FROM [{table_name}]
                            WHERE create_time >= ? AND create_time <= ?
                            ORDER BY create_time ASC, local_id ASC
                        """, (prev_ts, curr_ts)).fetchall()
                        conn.close()
                        all_rows.extend(rows)
                    except Exception as e:
                        print(f"  [hidden] 缓存查询失败 {db_key}: {e}", flush=True)
                        cache_failed = True
                        break
            # 检查是否找到了 curr_ts 的消息（说明缓存是最新的）
            # 注: r[1] 是 create_time（新 schema：local_id, create_time, local_type, ...）
            has_curr = any(r[1] == curr_ts for r in all_rows)
            if has_curr or cache_failed:
                break
            # 缓存可能还没更新到最新数据，短暂等待后重试
            if _try < 2:
                time.sleep(1.5)
                print(f"  [hidden] 缓存未包含最新消息，重试({_try+1})...", flush=True)

        # 仅在缓存查询出错时才用昂贵的独立解密
        if cache_failed:
            print(f"  [hidden] 缓存异常，启动独立解密...", flush=True)
            all_rows = []
            for db_key in db_keys:
                rows = self._fresh_decrypt_query(db_key, table_name, prev_ts, curr_ts)
                all_rows.extend(rows)
                if rows:
                    break
        else:
            print(f"  [hidden] 缓存查到 {len(all_rows)} 条", flush=True)

        # 过滤出隐藏消息
        # 去重 key 用 local_id（之前用 (username, ts, base) 太粗，同秒同类型多条会被
        # 误判为重复，导致 issue #79 的 "10 丢 4"）
        hidden_msgs = []
        for local_id, ts, lt, mc, ct in all_rows:
            base = lt % 4294967296 if lt > 4294967296 else lt
            # 跳过已显示的消息（按 local_id 精确去重）
            if (username, local_id) in self._shown_keys:
                continue
            # 解压 zstd
            if isinstance(mc, bytes) and ct == 4:
                try:
                    mc = _zstd_dctx.decompress(mc).decode('utf-8', errors='replace')
                except Exception:
                    mc = mc.decode('utf-8', errors='replace') if isinstance(mc, bytes) else ''
            elif isinstance(mc, bytes):
                mc = mc.decode('utf-8', errors='replace')
            hidden_msgs.append((local_id, ts, base, mc or ''))

        print(f"  [hidden] 找到 {len(hidden_msgs)} 条隐藏消息", flush=True)

        if not hidden_msgs:
            return

        global messages_log
        for local_id, ts, base, mc in hidden_msgs:
            self._shown_keys.add((username, local_id))
            msg_data = {
                'time': datetime.fromtimestamp(ts).strftime('%H:%M:%S'),
                'timestamp': ts,
                'chat': display,
                'username': username,
                'is_group': is_group,
                'sender': sender,
            }
            if base == 3:
                # 隐藏的图片消息
                time.sleep(0.5)
                img_name = self.resolve_image(username, ts)
                if img_name and img_name != '__v2_unsupported__':
                    msg_data.update({
                        'type': '图片', 'type_icon': '\U0001f5bc\ufe0f',
                        'content': '', 'image_url': f'/img/{img_name}',
                    })
                    print(f"  [hidden] 补充图片: {img_name} t={ts}", flush=True)
                else:
                    continue
            elif base == 1:
                # 隐藏的文字消息
                msg_data.update({
                    'type': '文本', 'type_icon': '\U0001f4ac',
                    'content': mc,
                })
                print(f"  [hidden] 补充文字: {mc[:30]} t={ts}", flush=True)
            elif base == 47:
                # 隐藏的表情消息
                rich = self.resolve_rich_content(username, ts, 47)
                msg_data.update({
                    'type': '表情', 'type_icon': '\U0001f600',
                    'content': '[表情]',
                })
                if rich:
                    msg_data['rich_content'] = rich
                print(f"  [hidden] 补充表情 t={ts}", flush=True)
            elif base == 49:
                # 隐藏的富媒体消息
                rich = self.resolve_rich_content(username, ts, 49)
                msg_data.update({
                    'type': format_msg_type(base), 'type_icon': msg_type_icon(base),
                    'content': mc[:100] if mc else '',
                })
                if rich:
                    msg_data['rich_content'] = rich
                print(f"  [hidden] 补充富媒体 t={ts}", flush=True)
            else:
                # 其他类型
                msg_data.update({
                    'type': format_msg_type(base), 'type_icon': msg_type_icon(base),
                    'content': mc[:100] if mc else f'[{format_msg_type(base)}]',
                })
                print(f"  [hidden] 补充type={base} t={ts}", flush=True)

            with messages_lock:
                messages_log.append(msg_data)
                if len(messages_log) > MAX_LOG:
                    messages_log = messages_log[-MAX_LOG:]
            broadcast_sse(msg_data)

    def _query_msg_content(self, username, timestamp, base_type):
        """通用: 从 message_*.db 查找指定类型消息的 XML 内容

        base_type: 基础类型 (47, 49, 43, 34 等)
        微信4.0 的 local_type 是复合编码: (sub_type << 32) | base_type
        """
        db_keys = self.username_db_map.get(username, [])
        if not db_keys:
            return None

        tbl = f"Msg_{hashlib.md5(username.encode()).hexdigest()}"
        for dk in db_keys:
            for _try in range(2):
                dec_path = self.db_cache.get(dk)
                if not dec_path:
                    break
                try:
                    conn = sqlite3.connect(f"file:{dec_path}?mode=ro", uri=True)
                    row = conn.execute(f'''
                        SELECT message_content, WCDB_CT_message_content, local_type
                        FROM "{tbl}"
                        WHERE (local_type = ? OR (local_type > 4294967296 AND local_type % 4294967296 = ?))
                        AND create_time BETWEEN ? AND ?
                        ORDER BY create_time DESC LIMIT 1
                    ''', (base_type, base_type, timestamp - 5, timestamp + 5)).fetchone()
                    conn.close()

                    if not row:
                        break  # 表存在但没找到匹配行，换下一个 DB
                    mc, ct_flag, full_type = row
                    if isinstance(mc, bytes) and ct_flag == 4:
                        mc = _zstd_dctx.decompress(mc).decode('utf-8', errors='replace')
                    elif isinstance(mc, bytes):
                        mc = mc.decode('utf-8', errors='replace')
                    if not mc:
                        break

                    xml_start = mc.find('<msg>')
                    if xml_start < 0:
                        xml_start = mc.find('<msg\n')
                    if xml_start < 0:
                        xml_start = mc.find('<?xml')
                    if xml_start > 0:
                        mc = mc[xml_start:]

                    return mc, full_type

                except Exception as e:
                    if 'malformed' in str(e) and _try == 0:
                        print(f"  [rich] {dk} malformed, 强制刷新...", flush=True)
                        self.db_cache.invalidate(dk)
                        continue
                    if 'no such table' not in str(e):
                        print(f"  [rich] 查询 {dk} 失败: {e}", flush=True)
                    break
        return None

    def _parse_rich_content(self, username, timestamp, msg_type):
        """解析富媒体消息, 返回 dict 或 None"""
        import xml.etree.ElementTree as ET

        if msg_type == 47:
            # --- 表情 ---
            result = self._query_msg_content(username, timestamp, 47)
            if not result:
                print(f"  [emoji] 查询失败 user={username[:10]} ts={timestamp}", flush=True)
                return None
            mc, _ = result
            if '<emoji' not in mc:
                return None
            try:
                root = ET.fromstring(mc)
                emoji = root.find('.//emoji')
                if emoji is None:
                    return None
                md5 = emoji.get('md5', '')
                etype = emoji.get('type', '')
                # 优先用 XML 中的 URL
                url = emoji.get('thumburl') or emoji.get('externurl') or emoji.get('cdnurl') or ''
                url = url.replace('&amp;', '&')
                if url and url.startswith('http'):
                    print(f"  [emoji] XML有URL md5={md5[:12]} type={etype}", flush=True)
                    return {'type': 'emoji', 'emoji_url': url}
                # XML 无 URL → 从 emoticon.db 下载
                if md5:
                    with _emoji_lookup_lock:
                        in_lookup = md5 in _emoji_lookup
                        lookup_size = len(_emoji_lookup)
                    print(f"  [emoji] XML无URL md5={md5[:12]} type={etype} lookup={lookup_size} found={in_lookup}", flush=True)
                    img_name = _download_emoji(md5)
                    if img_name:
                        return {'type': 'emoji', 'emoji_url': f'/img/{img_name}'}
                    print(f"  [emoji] 下载失败 md5={md5[:12]}", flush=True)
                else:
                    print(f"  [emoji] 无md5 type={etype}", flush=True)
            except ET.ParseError:
                pass
            return None

        elif msg_type == 49:
            # --- 链接/文件/引用/公众号/小程序 ---
            result = self._query_msg_content(username, timestamp, 49)
            if not result:
                return None
            mc, full_type = result
            sub_type = full_type >> 32 if full_type > 4294967296 else 0
            if '<appmsg' not in mc:
                return None
            try:
                root = ET.fromstring(mc)
                appmsg = root.find('.//appmsg')
                if appmsg is None:
                    return None
                title = (appmsg.findtext('title') or '').strip()
                des = (appmsg.findtext('des') or '').strip()
                url = (appmsg.findtext('url') or '').strip().replace('&amp;', '&')
                app_type = int(appmsg.findtext('type') or sub_type or 0)

                if app_type == 57:
                    # 引用回复: title 是回复内容
                    ref = appmsg.find('.//refermsg')
                    ref_name = ref.findtext('displayname') if ref is not None else ''
                    ref_content = ref.findtext('content') if ref is not None else ''
                    if ref_content:
                        ref_content = ref_content.strip()[:100]
                    return {
                        'type': 'quote',
                        'title': title,
                        'ref_name': ref_name or '',
                        'ref_content': ref_content or '',
                    }
                elif app_type == 6:
                    # 文件
                    attach = appmsg.find('.//appattach')
                    size = int(attach.findtext('totallen') or 0) if attach is not None else 0
                    ext = (attach.findtext('fileext') or '') if attach is not None else ''
                    return {
                        'type': 'file',
                        'title': title,
                        'file_ext': ext,
                        'file_size': size,
                    }
                elif app_type == 5:
                    # 链接/文章 — 清理 tracking 参数
                    clean_url = url
                    if 'mp.weixin.qq.com' in url:
                        from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
                        pu = urlparse(url)
                        params = parse_qs(pu.query, keep_blank_values=False)
                        # 只保留文章必要参数
                        keep = {k: v for k, v in params.items()
                                if k in ('__biz', 'mid', 'idx', 'sn', 'chksm')}
                        clean_url = urlunparse(pu._replace(
                            query=urlencode(keep, doseq=True), fragment=''))
                    source = (appmsg.findtext('sourcedisplayname') or '').strip()
                    return {
                        'type': 'link',
                        'title': title,
                        'des': des[:200] if des else '',
                        'url': clean_url,
                        'source': source,
                    }
                elif app_type == 33 or app_type == 36:
                    # 小程序
                    source = (appmsg.findtext('sourcedisplayname') or '').strip()
                    return {
                        'type': 'miniapp',
                        'title': title,
                        'source': source,
                        'url': url,
                    }
                elif app_type == 51:
                    # 视频号
                    return {
                        'type': 'channels',
                        'title': title or '视频号内容',
                    }
                elif app_type == 19:
                    # 聊天记录转发 — 解析 recorditem 获取消息列表
                    items = []
                    ri = appmsg.findtext('recorditem') or ''
                    if ri:
                        try:
                            ri_root = ET.fromstring(ri)
                            for di in ri_root.findall('.//dataitem'):
                                name = (di.findtext('sourcename') or '').strip()
                                desc = (di.findtext('datadesc') or '').strip()
                                if name and desc:
                                    items.append({'name': name, 'text': desc[:100]})
                                if len(items) >= 20:
                                    break
                        except ET.ParseError:
                            pass
                    return {
                        'type': 'chatlog',
                        'title': title,
                        'des': des[:200] if des else '',
                        'items': items,
                    }
                elif app_type == 2000:
                    # 微信转账 — 复用 mcp_server 已有的解析器，单一来源避免字段漂移
                    # （snake/camel 大小写、未来新 paysubtype 兜底）。
                    import mcp_server  # 已被 chat_export_helpers 验证 import 安全
                    info = mcp_server._extract_transfer_info(appmsg) or {}
                    pay_memo = info.get('pay_memo', '')
                    paysubtype = info.get('paysubtype', '')
                    # 已知 paysubtype 显示中文 label；未知用空串而非"未知(paysubtype=N)"，
                    # 避免 UI 出现内部诊断字串。日志侧若需要可看 chat history。
                    direction = (info.get('paysubtype_label', '')
                                 if paysubtype in mcp_server._TRANSFER_PAYSUBTYPE_LABEL
                                 else '')
                    return {
                        'type': 'transfer',
                        'title': title or '微信转账',
                        'direction': direction,
                        'paysubtype': paysubtype,
                        'fee_desc': info.get('fee_desc', ''),
                        'pay_memo': pay_memo[:200] if pay_memo else '',
                    }
                else:
                    # 其他子类型: 用 title 显示
                    if title:
                        return {
                            'type': 'link',
                            'title': title,
                            'des': des[:200] if des else '',
                            'url': url,
                        }
            except ET.ParseError:
                pass
            return None

        elif msg_type == 43:
            # --- 视频 ---
            result = self._query_msg_content(username, timestamp, 43)
            if not result:
                return None
            mc, _ = result
            try:
                root = ET.fromstring(mc)
                video = root.find('.//videomsg')
                if video is None:
                    return None
                length = int(video.get('playlength') or 0)
                return {
                    'type': 'video',
                    'duration': length,
                }
            except ET.ParseError:
                pass
            return None

        elif msg_type == 34:
            # --- 语音 ---
            result = self._query_msg_content(username, timestamp, 34)
            if not result:
                return None
            mc, _ = result
            try:
                root = ET.fromstring(mc)
                voice = root.find('.//voicemsg')
                if voice is None:
                    return None
                length_ms = int(voice.get('voicelength') or 0)
                return {
                    'type': 'voice',
                    'duration': round(length_ms / 1000, 1),
                }
            except ET.ParseError:
                pass
            return None

        return None

    def _async_resolve_rich(self, username, timestamp, msg_type, msg_data):
        """后台线程: 解析富媒体内容并推送 SSE（带重试）"""
        delays = [0.5, 1.5, 3.0]
        for attempt in range(3):
            try:
                time.sleep(delays[attempt])
                info = self._parse_rich_content(username, timestamp, msg_type)
                if info:
                    msg_data['rich'] = info
                    broadcast_sse({
                        'event': 'rich_update',
                        'timestamp': timestamp,
                        'username': username,
                        'rich': info,
                    })
                    print(f"  [rich] {info['type']} 解析成功", flush=True)
                    return
            except Exception as e:
                print(f"  [rich] 解析失败: {e}", flush=True)
        print(f"  [rich] type={msg_type} 3次重试均失败: {username}", flush=True)

    def query_state(self):
        """查询已解密副本的session状态"""
        conn = sqlite3.connect(f"file:{DECRYPTED_SESSION}?mode=ro", uri=True)
        state = {}
        for r in conn.execute("""
            SELECT username, unread_count, summary, last_timestamp,
                   last_msg_type, last_msg_sender, last_sender_display_name
            FROM SessionTable WHERE last_timestamp > 0
        """).fetchall():
            state[r[0]] = {
                'unread': r[1], 'summary': r[2] or '', 'timestamp': r[3],
                'msg_type': r[4], 'sender': r[5] or '', 'sender_name': r[6] or '',
            }
        conn.close()
        return state

    def do_full_refresh(self):
        """全量解密DB + 全量WAL patch"""
        # 先解密主DB
        pages, ms = full_decrypt(self.session_db, DECRYPTED_SESSION, self.enc_key)
        total_ms = ms
        wal_patched = 0

        # 再patch所有WAL frames
        if os.path.exists(self.wal_path):
            wal_patched, ms2 = decrypt_wal_full(self.wal_path, DECRYPTED_SESSION, self.enc_key)
            total_ms += ms2

        self.decrypt_ms = total_ms
        self.patched_pages = pages + wal_patched
        return self.patched_pages

    def check_updates(self):
        global messages_log
        try:
            t0 = time.perf_counter()
            self.do_full_refresh()
            t1 = time.perf_counter()
            curr_state = self.query_state()
            t2 = time.perf_counter()
            print(f"  [perf] decrypt={self.patched_pages}页/{(t1-t0)*1000:.1f}ms, query={(t2-t1)*1000:.1f}ms", flush=True)
        except Exception as e:
            print(f"  [ERROR] check_updates: {e}", flush=True)
            return

        # 收集所有新消息，按时间排序后再推送
        new_msgs = []
        for username, curr in curr_state.items():
            prev = self.prev_state.get(username)
            # 检测: 时间戳变化 OR 同一秒内消息类型变化（文字+图片组合）
            is_new = prev and (curr['timestamp'] > prev['timestamp'] or
                               (curr['timestamp'] == prev['timestamp'] and curr['msg_type'] != prev.get('msg_type')))
            if is_new:
                # contact.db mtime 变化时刷新缓存：覆盖新增联系人、改名、改备注、群名
                # 修改等场景（issue #46, #67）。受 cooldown 节流。
                self._maybe_refresh_contacts()
                display = self.contact_names.get(username, username)
                is_group = '@chatroom' in username
                sender = ''
                if is_group:
                    sender = self.contact_names.get(curr['sender'], curr['sender_name'] or curr['sender'])

                summary = curr['summary']
                if isinstance(summary, bytes):
                    try:
                        summary = _zstd_dctx.decompress(summary).decode('utf-8', errors='replace')
                    except Exception:
                        summary = '(压缩内容)'
                if summary and ':\n' in summary:
                    summary = summary.split(':\n', 1)[1]

                msg_data = {
                    'time': datetime.fromtimestamp(curr['timestamp']).strftime('%H:%M:%S'),
                    'timestamp': curr['timestamp'],
                    'chat': display,
                    'username': username,
                    'is_group': is_group,
                    'sender': sender,
                    'type': format_msg_type(curr['msg_type']),
                    'type_icon': msg_type_icon(curr['msg_type']),
                    'content': summary,
                    'unread': curr['unread'],
                    'decrypt_ms': round(self.decrypt_ms, 1),
                    'pages': self.patched_pages,
                }

                new_msgs.append(msg_data)
                # _shown_keys 改用 (username, local_id) 精确去重（issue #79）。
                # SessionTable 不带 local_id，去 message_N.db 查同时拿 local_id 和完整正文：
                # - local_id 用于去重
                # - 完整正文替换 SessionTable.summary 的 ~80 字短截断（issue #42）
                # 查不到时（message DB 写入滞后于 SessionTable）跳过加 key，让 _check_hidden_messages
                # 1 秒后查到时自己 emit 并加 key。这种情况下偶发轻微重复，但比丢消息好。
                latest_local_id, full_content = self._lookup_latest_message(username, curr['timestamp'])
                if latest_local_id is not None:
                    self._shown_keys.add((username, latest_local_id))
                    if full_content and len(full_content) > len(msg_data['content']):
                        msg_data['content'] = full_content

                # 图片消息: 后台异步解密（不阻塞轮询）
                if curr['msg_type'] == 3:
                    _img_executor.submit(
                        self._async_resolve_image,
                        username, curr['timestamp'], msg_data
                    )

                # 富媒体消息: 后台解析内容
                if curr['msg_type'] in (47, 49, 43, 34):
                    _img_executor.submit(
                        self._async_resolve_rich,
                        username, curr['timestamp'], curr['msg_type'], msg_data
                    )

                # 检查时间窗口内是否有被 session 摘要覆盖的消息
                # (比如用户发了 图片+文字，session只记录最后一条)
                prev_ts = prev['timestamp'] if prev else curr['timestamp'] - 5
                _hidden_executor.submit(
                    self._check_hidden_messages,
                    username, prev_ts, curr['timestamp'], curr['msg_type'],
                    display, is_group, sender
                )

        # 按时间排序
        new_msgs.sort(key=lambda m: m['timestamp'])

        for msg in new_msgs:
            with messages_lock:
                messages_log.append(msg)
                if len(messages_log) > MAX_LOG:
                    messages_log = messages_log[-MAX_LOG:]

            broadcast_sse(msg)

            try:
                now = time.time()
                msg_age = now - msg['timestamp']
                tag = f"{self.patched_pages}pg/{self.decrypt_ms:.0f}ms"
                sender = msg['sender']
                now_str = datetime.fromtimestamp(now).strftime('%H:%M:%S')
                if sender:
                    print(f"[{msg['time']} 延迟={msg_age:.1f}s] [{msg['chat']}] {sender}: {msg['content']}  ({tag})", flush=True)
                else:
                    print(f"[{msg['time']} 延迟={msg_age:.1f}s] [{msg['chat']}] {msg['content']}  ({tag})", flush=True)
            except Exception:
                pass  # Windows CMD编码问题，不影响SSE推送

        self.prev_state = curr_state

        # 清理 _shown_keys（按数量上限）：local_id 不是时间戳不能按时间 prune。
        # 超过 10000 时保留 local_id 最大的 5000 条（最新消息优先）。
        # 实际触发频率：~几小时一次，set lookup 仍是 O(1)。
        if len(self._shown_keys) > 10000:
            by_local_id = sorted(self._shown_keys, key=lambda k: k[1], reverse=True)
            self._shown_keys = set(by_local_id[:5000])

def monitor_thread(enc_key, session_db, contact_names, db_cache=None, username_db_map=None):
    mon = SessionMonitor(enc_key, session_db, contact_names, db_cache, username_db_map)
    wal_path = mon.wal_path

    # 初始全量解密
    pages, ms = full_decrypt(session_db, DECRYPTED_SESSION, enc_key)
    wal_patched = 0
    wal_ms = 0
    if os.path.exists(wal_path):
        wal_patched, wal_ms = decrypt_wal_full(wal_path, DECRYPTED_SESSION, enc_key)
        print(f"[init] DB {pages}页/{ms:.0f}ms + WAL {wal_patched}页/{wal_ms:.0f}ms", flush=True)
    else:
        print(f"[init] DB {pages}页/{ms:.0f}ms", flush=True)

    mon.prev_state = mon.query_state()
    print(f"[monitor] 跟踪 {len(mon.prev_state)} 个会话", flush=True)
    print(f"[monitor] mtime轮询模式 (每{POLL_MS}ms)", flush=True)

    # mtime-based 轮询: WAL是预分配固定大小，不能用size检测
    poll_interval = POLL_MS / 1000
    prev_wal_mtime = os.path.getmtime(wal_path) if os.path.exists(wal_path) else 0
    prev_db_mtime = os.path.getmtime(session_db)

    while True:
        time.sleep(poll_interval)
        try:
            # 用mtime检测WAL和DB变化
            try:
                wal_mtime = os.path.getmtime(wal_path) if os.path.exists(wal_path) else 0
                db_mtime = os.path.getmtime(session_db)
            except OSError:
                continue

            if wal_mtime == prev_wal_mtime and db_mtime == prev_db_mtime:
                continue  # 无变化

            t_detect = time.perf_counter()
            wal_changed = wal_mtime != prev_wal_mtime
            db_changed = db_mtime != prev_db_mtime

            mon.check_updates()

            t_done = time.perf_counter()
            try:
                detect_str = datetime.now().strftime('%H:%M:%S.%f')[:-3]
                print(f"  [{detect_str}] WAL={'变' if wal_changed else '-'} DB={'变' if db_changed else '-'} 总耗时={(t_done-t_detect)*1000:.1f}ms", flush=True)
            except Exception:
                pass

            prev_wal_mtime = wal_mtime
            prev_db_mtime = db_mtime

        except Exception as e:
            print(f"[poll] 错误: {e}", flush=True)
            time.sleep(1)


# ============ Web ============

HTML_PAGE = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>微信消息监听</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  /* 颜色 */
  --bg:#0a0a0f;--bg-elev:#12121a;
  --surface:rgba(255,255,255,.04);--surface-hover:rgba(255,255,255,.07);
  --border:rgba(255,255,255,.08);--border-strong:rgba(255,255,255,.16);
  --text:#e8eaed;--text-dim:#9aa0a6;--text-faint:#5f6368;
  --accent:#4fc3f7;--accent-bg:rgba(79,195,247,.12);
  --success:#81c784;--warn:#ffd54f;--danger:#ef9a9a;
  /* 4-step 间距 */
  --s1:4px;--s2:8px;--s3:12px;--s4:16px;--s5:24px;--s6:32px;
  /* 4-step 字号 */
  --t1:11px;--t2:12px;--t3:13px;--t4:15px;--t5:18px;--t6:24px;
  /* 圆角 */
  --r1:6px;--r2:10px;--r3:14px;--r-pill:999px;
  /* 阴影 */
  --shadow-1:0 1px 2px rgba(0,0,0,.3);
  --shadow-2:0 8px 24px rgba(0,0,0,.4);
  --shadow-glow:0 0 0 1px var(--border),0 4px 14px rgba(79,195,247,.18);
}
/* 字体: 中文优先用苹方 / 思源, 避免 Segoe UI 把中文渲染糊 */
body{
  font-family:"PingFang SC","HarmonyOS Sans","Source Han Sans CN","Microsoft YaHei UI",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  background:radial-gradient(ellipse at top,#14142a 0%,#0a0a0f 60%) fixed;
  color:var(--text);
  height:100vh;display:flex;flex-direction:column;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
}
/* 顶部 header: sticky + 防按钮被挤掉
   原本用 backdrop-filter:blur(20px) 但每次 SSE 推消息触发 reflow 都要 GPU
   重绘整个 header, 在低端机 / 高频消息时拖慢渲染。改用纯渐变背景。 */
.header{
  background:linear-gradient(135deg,#1a1a2e,#16213e);
  padding:14px 24px;
  border-bottom:1px solid var(--border);
  display:flex;align-items:center;gap:12px;
  flex-shrink:0;flex-wrap:wrap;row-gap:8px;
  position:sticky;top:0;z-index:50;
}
.header h1{font-size:18px;font-weight:600;background:linear-gradient(90deg,#4fc3f7,#81c784);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.status{font-size:12px;padding:4px 10px;border-radius:12px;transition:all .3s}
.status.ok{background:rgba(76,175,80,.15);color:#81c784;border:1px solid rgba(76,175,80,.3)}
.status.ok::before{content:'';display:inline-block;width:6px;height:6px;border-radius:50%;background:#4caf50;margin-right:6px;animation:pulse 2s infinite}
.status.err{background:rgba(244,67,54,.15);color:#ef9a9a;border:1px solid rgba(244,67,54,.3)}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
.stats{margin-left:auto;font-size:var(--t2);color:var(--text-faint);display:flex;gap:var(--s4);min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.messages{flex:1;overflow-y:auto;padding:12px}
.msg{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:10px 14px;margin-bottom:5px;transition:transform .3s ease}
.msg:hover{background:rgba(255,255,255,.05)}
.msg.hl{border-left:3px solid #4fc3f7;background:rgba(79,195,247,.05);animation:slideIn .3s cubic-bezier(.22,1,.36,1)}
@keyframes slideIn{from{opacity:0;transform:translateY(-20px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
.msg-header{display:flex;align-items:center;gap:8px;margin-bottom:3px}
.msg-time{font-size:11px;color:#555;font-family:"SF Mono",Monaco,monospace;min-width:55px}
.msg-chat{font-weight:600;color:#4fc3f7;font-size:13px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.msg-chat.grp{color:#ce93d8}
.msg-sender{font-size:12px;color:#999}
.msg-r{margin-left:auto;display:flex;gap:6px;align-items:center}
.msg-type{font-size:10px;padding:2px 5px;border-radius:3px;background:rgba(255,255,255,.06);color:#777}
.msg-unread{font-size:10px;padding:1px 6px;border-radius:8px;background:rgba(244,67,54,.2);color:#ef9a9a;font-weight:600}
.msg-perf{font-size:9px;color:#333}
.msg-content{font-size:13px;line-height:1.4;color:#bbb;word-break:break-all;padding-left:63px}
.msg-img{max-width:300px;max-height:200px;border-radius:8px;cursor:pointer;margin-top:4px;transition:transform .2s}
.msg-img:hover{transform:scale(1.02)}
.msg-emoji{max-width:120px;max-height:120px;border-radius:4px;margin-top:2px}
.msg-link{display:inline-block;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:8px 12px;margin-top:4px;max-width:400px;cursor:pointer;transition:background .2s}
.msg-link:hover{background:rgba(255,255,255,.1)}
.msg-link-title{font-size:13px;color:#4fc3f7;font-weight:500;line-height:1.3}
.msg-link-des{font-size:11px;color:#888;margin-top:3px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.msg-link-src{font-size:10px;color:#555;margin-top:4px}
.msg-quote{background:rgba(255,255,255,.04);border-left:2px solid #666;padding:4px 8px;margin-top:4px;border-radius:0 6px 6px 0}
.msg-quote-ref{font-size:11px;color:#777;margin-bottom:3px}
.msg-quote-ref b{color:#999;font-weight:500}
.msg-file{display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:8px 12px;margin-top:4px}
.msg-file-icon{font-size:24px}
.msg-file-name{font-size:13px;color:#ccc}
.msg-file-size{font-size:11px;color:#666}
.msg-voice{display:inline-flex;align-items:center;gap:6px;background:rgba(76,175,80,.1);border:1px solid rgba(76,175,80,.2);border-radius:16px;padding:6px 14px;margin-top:4px}
.msg-video{display:inline-flex;align-items:center;gap:6px;background:rgba(79,195,247,.08);border:1px solid rgba(79,195,247,.15);border-radius:8px;padding:6px 12px;margin-top:4px}
.msg-chatlog{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:8px 12px;margin-top:4px;max-width:450px}
.chatlog-body{margin-top:6px;border-top:1px solid rgba(255,255,255,.06);padding-top:6px}
.chatlog-item{font-size:12px;color:#999;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chatlog-item b{color:#bbb;font-weight:500}
.chatlog-more{font-size:11px;color:#555;margin-top:4px}
.msg-transfer{display:inline-block;background:rgba(255,170,60,.1);border:1px solid rgba(255,170,60,.25);border-radius:8px;padding:8px 14px;margin-top:4px;min-width:180px}
.msg-transfer-head{font-size:13px;color:#ffb84d;font-weight:500}
.msg-transfer-amount{font-size:18px;color:#ffd28a;font-weight:600;margin-top:4px}
.msg-transfer-memo{font-size:11px;color:#999;margin-top:4px}
a.msg-link{text-decoration:none;color:inherit}
#lightbox{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.92);z-index:1000;cursor:zoom-out;justify-content:center;align-items:center}
#lightbox.show{display:flex}
#lightbox img{max-width:95vw;max-height:95vh;object-fit:contain;border-radius:4px;box-shadow:0 4px 30px rgba(0,0,0,.5)}
.empty{text-align:center;padding:80px 20px;color:#444}
.empty .icon{font-size:48px;margin-bottom:12px}
::-webkit-scrollbar{width:4px}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08);border-radius:2px}
/* 设置面板 */
.settings-btn{background:none;border:1px solid var(--border-strong);color:var(--text-dim);font-size:16px;cursor:pointer;padding:6px 10px;border-radius:var(--r1);transition:all .2s;flex-shrink:0}
.settings-btn:hover{color:var(--text);border-color:var(--accent);background:var(--accent-bg)}
.settings-overlay{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);z-index:900}
.settings-overlay.show{display:block}
.settings-panel{position:fixed;top:0;right:-420px;width:400px;height:100%;background:#12121a;border-left:1px solid rgba(255,255,255,.1);z-index:901;transition:right .3s ease;display:flex;flex-direction:column;overflow:hidden}
.settings-panel.show{right:0}
.sp-header{padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.sp-header h2{font-size:16px;color:#e0e0e0;font-weight:600}
.sp-close{background:none;border:none;color:#666;font-size:20px;cursor:pointer;padding:4px 8px}
.sp-close:hover{color:#ccc}
.sp-body{flex:1;overflow-y:auto;padding:16px 20px}
.sp-section{margin-bottom:20px}
.sp-section h3{font-size:13px;color:#888;margin-bottom:10px;text-transform:uppercase;letter-spacing:1px}
.sp-toggle{display:flex;align-items:center;justify-content:space-between;padding:8px 0}
.sp-toggle label{font-size:13px;color:#ccc}
.switch{position:relative;width:40px;height:22px;flex-shrink:0}
.switch input{display:none}
.switch .slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#333;border-radius:11px;transition:.3s}
.switch input:checked+.slider{background:#4caf50}
.switch .slider:before{content:'';position:absolute;height:16px;width:16px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.3s}
.switch input:checked+.slider:before{transform:translateX(18px)}
.rule-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:12px;margin-bottom:10px}
.rule-card .rule-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.rule-card .rule-del{background:none;border:none;color:#666;cursor:pointer;font-size:14px;padding:2px 6px}
.rule-card .rule-del:hover{color:#ef5350}
.rule-card input[type=text]{width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:4px;padding:6px 8px;color:#ccc;font-size:12px;margin-bottom:6px;outline:none}
.rule-card input[type=text]:focus{border-color:rgba(79,195,247,.5)}
.rule-card input[type=text]::placeholder{color:#555}
.rule-opts{display:flex;gap:12px;margin-top:4px}
.rule-opts label{font-size:11px;color:#999;display:flex;align-items:center;gap:4px;cursor:pointer}
.rule-opts input[type=checkbox]{accent-color:#4caf50}
.add-rule-btn{width:100%;padding:8px;background:rgba(79,195,247,.1);border:1px dashed rgba(79,195,247,.3);border-radius:6px;color:#4fc3f7;font-size:12px;cursor:pointer;transition:all .2s}
.add-rule-btn:hover{background:rgba(79,195,247,.2)}
/* 通知高亮 */
.msg.notify-hl{border-left:3px solid #ffd54f;background:rgba(255,213,79,.08);box-shadow:0 0 12px rgba(255,213,79,.1)}
/* 导出筛选模态框 */
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(4px);z-index:1100;align-items:center;justify-content:center}
.modal-overlay.show{display:flex;animation:fadeIn .15s ease-out}
.modal{background:var(--bg-elev);border:1px solid var(--border);border-radius:var(--r3);width:560px;max-width:90vw;max-height:85vh;display:flex;flex-direction:column;box-shadow:var(--shadow-2);overflow:hidden}
.modal-h{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.modal-h h2{font-size:var(--t4);color:var(--text);font-weight:600}
.modal-close{background:none;border:none;color:var(--text-faint);font-size:20px;cursor:pointer;padding:4px 10px;border-radius:var(--r1);transition:all .15s}
.modal-close:hover{color:var(--text);background:var(--surface)}
.modal-b{padding:16px 20px;overflow-y:auto;flex:1}
.modal-f{padding:14px 20px;border-top:1px solid var(--border);display:flex;justify-content:space-between;gap:8px;align-items:center;flex-shrink:0;background:rgba(0,0,0,.2)}
.modal-search{width:100%;background:var(--surface);border:1px solid var(--border);border-radius:var(--r1);padding:8px 12px;color:var(--text);font-size:var(--t3);outline:none;font-family:inherit;margin-bottom:var(--s3)}
.modal-search:focus{border-color:var(--accent)}
.modal-search::placeholder{color:var(--text-faint)}
.session-list{max-height:280px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--r1);background:rgba(0,0,0,.2)}
.session-item{display:flex;align-items:center;gap:var(--s2);padding:8px 12px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.03);transition:background .1s;font-size:var(--t3)}
.session-item:hover{background:var(--surface-hover)}
.session-item:last-child{border-bottom:none}
.session-item input[type=checkbox]{accent-color:var(--accent);width:14px;height:14px;cursor:pointer;margin:0}
.session-type{font-size:10px;padding:2px 6px;border-radius:var(--r-pill);color:var(--text-dim);background:var(--surface);min-width:28px;text-align:center;flex-shrink:0}
.session-type.grp{background:rgba(206,147,216,.12);color:#ce93d8}
.session-type.single{background:rgba(79,195,247,.12);color:var(--accent)}
.session-name{flex:1;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.session-ts{font-size:var(--t1);color:var(--text-faint);flex-shrink:0;font-family:Consolas,monospace}
.modal-selctrl{display:flex;gap:var(--s2);margin:var(--s3) 0;flex-wrap:wrap}
.modal-selctrl button{background:var(--surface);border:1px solid var(--border);color:var(--text-dim);padding:5px 10px;border-radius:var(--r1);font-size:var(--t1);cursor:pointer;transition:all .15s;font-family:inherit}
.modal-selctrl button:hover{background:var(--surface-hover);color:var(--text)}
.modal-section{margin-top:var(--s4)}
.modal-section-label{font-size:var(--t1);color:var(--text-faint);margin-bottom:var(--s2);text-transform:uppercase;letter-spacing:1.2px;font-weight:600}
.modal-fmt{display:flex;gap:var(--s4);flex-wrap:wrap}
.modal-fmt label{display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:var(--t3);color:var(--text)}
.modal-fmt input{accent-color:var(--accent);width:14px;height:14px;cursor:pointer}
.modal-selcount{color:var(--text-dim);font-size:var(--t2)}
.modal-btn{padding:8px 18px;border-radius:var(--r1);font-size:var(--t3);cursor:pointer;border:none;font-family:inherit;font-weight:500;transition:all .15s}
.modal-btn.secondary{background:var(--surface);color:var(--text-dim);border:1px solid var(--border)}
.modal-btn.secondary:hover{background:var(--surface-hover);color:var(--text)}
.modal-btn.primary{background:linear-gradient(135deg,#4fc3f7,#29b6f6);color:#001528;font-weight:600;box-shadow:0 4px 14px rgba(79,195,247,.35)}
.modal-btn.primary:hover:not(:disabled){background:linear-gradient(135deg,#5fd0ff,#3fc4ff);transform:translateY(-1px)}
.modal-btn:disabled{opacity:.4;cursor:not-allowed;transform:none!important}
.modal-loading{text-align:center;color:var(--text-faint);padding:30px;font-size:var(--t3)}
/* Icon 通用样式 (替代 emoji) */
.i{width:16px;height:16px;display:inline-block;vertical-align:-3px;flex-shrink:0;color:inherit}
.i-sm{width:13px;height:13px;vertical-align:-2px}
.i-lg{width:20px;height:20px;vertical-align:-5px}
.i-xl{width:32px;height:32px;vertical-align:middle}
.spin{animation:spin 1s linear infinite;transform-origin:center}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
/* 工具面板 (Web 版替代 tkinter app_gui.py) */
.tools-btn{background:none;border:1px solid var(--border-strong);color:var(--text-dim);font-size:var(--t3);cursor:pointer;padding:6px 12px;border-radius:var(--r1);transition:all .2s;margin-left:var(--s2);flex-shrink:0;font-weight:500}
.tools-btn:hover{color:var(--accent);border-color:var(--accent);background:var(--accent-bg)}
#toolsPanel{display:none;background:var(--bg-elev);border-top:1px solid var(--border);padding:0;flex-shrink:0;max-height:60vh;overflow:hidden;flex-direction:column;box-shadow:inset 0 8px 16px -8px rgba(0,0,0,.4)}
#toolsPanel.show{display:flex}
/* Tab 头 — 加 hover 浮起 + active 渐变 + 顶部 strip */
.tool-tabs{display:flex;background:rgba(0,0,0,.3);border-bottom:1px solid var(--border);padding:0 var(--s5);gap:0;flex-shrink:0;position:relative}
.tool-tab{position:relative;background:none;border:none;color:var(--text-faint);font-size:var(--t3);padding:14px 22px;cursor:pointer;transition:all .2s;font-family:inherit;font-weight:500;letter-spacing:.3px}
.tool-tab:hover{color:var(--text);background:rgba(255,255,255,.03)}
.tool-tab.active{color:var(--accent);background:linear-gradient(180deg,transparent,var(--accent-bg))}
.tool-tab.active::after{content:'';position:absolute;left:22px;right:22px;bottom:0;height:2px;background:var(--accent);border-radius:2px 2px 0 0;box-shadow:0 0 8px rgba(79,195,247,.5)}
/* Tab 内容 */
.tool-pane{display:none;padding:var(--s5);overflow:auto;flex:1}
.tool-pane.active{display:block;animation:fadeIn .2s ease-out}
@keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
/* 前置条件 → 紧凑 chip (不再像 form error) */
.tool-prereq{display:inline-flex;align-items:center;gap:var(--s2);background:rgba(255,213,79,.08);color:var(--warn);font-size:var(--t1);padding:6px 12px;border-radius:var(--r-pill);border:none;margin-bottom:var(--s4);font-weight:500;letter-spacing:.2px}
.tool-prereq.info{background:rgba(79,195,247,.08);color:var(--accent)}
.tool-step{margin-bottom:var(--s4)}
.tool-step-label{font-size:var(--t1);color:var(--text-faint);margin-bottom:var(--s2);text-transform:uppercase;letter-spacing:1.2px;font-weight:600}
.tools-row{display:flex;flex-wrap:wrap;gap:var(--s2);align-items:center}
/* 默认按钮 — 安静 */
.tool-task-btn{
  background:var(--surface);border:1px solid var(--border);
  color:var(--text);padding:10px 18px;border-radius:var(--r2);
  font-size:var(--t3);cursor:pointer;transition:all .15s ease;
  font-family:inherit;font-weight:500;
}
.tool-task-btn:hover:not(:disabled){background:var(--surface-hover);border-color:var(--border-strong);transform:translateY(-1px);box-shadow:var(--shadow-1)}
.tool-task-btn:active:not(:disabled){transform:translateY(0)}
.tool-task-btn:disabled{opacity:.4;cursor:not-allowed}
/* primary 按钮 — 真 primary, 实心渐变 + 阴影 */
.tool-task-btn.primary{
  background:linear-gradient(135deg,#4fc3f7,#29b6f6);
  border:none;color:#001528;font-weight:600;
  box-shadow:0 4px 14px rgba(79,195,247,.35),inset 0 1px 0 rgba(255,255,255,.25);
  padding:10px 22px;
}
.tool-task-btn.primary:hover:not(:disabled){
  background:linear-gradient(135deg,#5fd0ff,#3fc4ff);
  transform:translateY(-2px);
  box-shadow:0 6px 20px rgba(79,195,247,.5),inset 0 1px 0 rgba(255,255,255,.3)
}
.tool-task-btn.primary:active:not(:disabled){transform:translateY(0);box-shadow:0 2px 8px rgba(79,195,247,.4)}
/* 终止按钮 — 红色警示 */
.tool-task-btn.cancel{
  background:linear-gradient(135deg,#ef5350,#e53935)!important;
  border:none!important;color:#fff!important;font-weight:600;
  box-shadow:0 4px 14px rgba(239,83,80,.4),inset 0 1px 0 rgba(255,255,255,.2)!important;
  animation:pulseRed 1.5s infinite;
}
.tool-task-btn.cancel:hover:not(:disabled){
  background:linear-gradient(135deg,#f44336,#d32f2f)!important;
  box-shadow:0 6px 20px rgba(239,83,80,.6)!important;
}
@keyframes pulseRed{0%,100%{box-shadow:0 4px 14px rgba(239,83,80,.4)}50%{box-shadow:0 4px 20px rgba(239,83,80,.7)}}
/* 日志框 */
.tool-log-wrap{
  background:#05060a;border:1px solid var(--border);border-radius:var(--r2);
  padding:var(--s3) var(--s4);
  font-family:"JetBrains Mono","SF Mono",Consolas,"Courier New",monospace;
  font-size:var(--t2);color:#cfd8dc;line-height:1.55;
  max-height:240px;overflow:auto;white-space:pre-wrap;word-break:break-all;
  margin-top:var(--s4);
  box-shadow:inset 0 1px 3px rgba(0,0,0,.4);
}
.tool-log-wrap:empty::before{content:"点击上方按钮开始任务,日志会实时显示";color:var(--text-faint);font-style:italic}
.tool-status{display:inline-block;font-size:var(--t2);padding:4px 12px;border-radius:var(--r-pill);margin-left:var(--s2);vertical-align:middle;font-weight:500}
.tool-status.running{background:var(--accent-bg);color:var(--accent);border:1px solid rgba(79,195,247,.3)}
.tool-status.ok{background:rgba(76,175,80,.15);color:var(--success);border:1px solid rgba(76,175,80,.3)}
.tool-status.err{background:rgba(244,67,54,.15);color:var(--danger);border:1px solid rgba(244,67,54,.3)}
</style>
</head>
<body>
<!-- SVG icon library (Lucide-style, stroke 2, viewBox 24x24). 一次性内嵌 ~1KB,
     用 <svg class="i"><use href="#i-xxx"/></svg> 引用, currentColor 自动跟文字色。 -->
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="i-wrench" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></symbol>
  <symbol id="i-settings" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></symbol>
  <symbol id="i-chat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></symbol>
  <symbol id="i-briefcase" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></symbol>
  <symbol id="i-sliders" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></symbol>
  <symbol id="i-alert" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></symbol>
  <symbol id="i-info" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></symbol>
  <symbol id="i-radio" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/></symbol>
  <symbol id="i-stop" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="1"/></symbol>
  <symbol id="i-loader" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></symbol>
</svg>
<div class="header">
<h1>WeChat Monitor</h1>
<div class="status ok" id="st">SSE 实时</div>
<div class="stats"><span id="cnt">0 消息</span><span id="perf"></span></div>
<button class="tools-btn" onclick="toggleTools()" title="工具箱 (解密 / 导出 / 企业微信)"><svg class="i"><use href="#i-wrench"/></svg> 工具</button>
<button class="settings-btn" onclick="toggleSettings()" title="通知设置"><svg class="i"><use href="#i-settings"/></svg></button>
</div>
<div id="toolsPanel">
  <div class="tool-tabs">
    <button class="tool-tab active" data-pane="wechat"><svg class="i"><use href="#i-chat"/></svg> 个人微信</button>
    <button class="tool-tab" data-pane="wxwork"><svg class="i"><use href="#i-briefcase"/></svg> 企业微信</button>
    <button class="tool-tab" data-pane="misc"><svg class="i"><use href="#i-sliders"/></svg> 工具</button>
    <span id="toolStatus" class="tool-status" style="display:none;margin-left:auto;align-self:center;margin-right:24px"></span>
  </div>

  <div class="tool-pane active" data-pane="wechat">
    <div class="tool-prereq"><svg class="i i-sm"><use href="#i-alert"/></svg> 前置：微信 PC 版正在运行且已登录</div>
    <div class="tool-step">
      <div class="tool-step-label">Step 1 — 解密</div>
      <div class="tools-row">
        <button class="tool-task-btn primary" data-task="wechat_decrypt">① 提取密钥 + 解密数据库</button>
        <button class="tool-task-btn" data-task="image_key">② 提取图片密钥</button>
      </div>
    </div>
    <div class="tool-step">
      <div class="tool-step-label">Step 2 — 导出/解码（可独立运行，需先 Step 1）</div>
      <div class="tools-row">
        <button class="tool-task-btn" data-task="export_all">③ 导出全部聊天 (JSON)</button>
        <button class="tool-task-btn" data-task="decode_images">④ 批量解密 .dat 图片</button>
        <button class="tool-task-btn" data-task="sns_decrypt">⑤ 朋友圈解密 + 导出</button>
      </div>
    </div>
    <div class="tool-log-wrap" id="toolLog_wechat"></div>
  </div>

  <div class="tool-pane" data-pane="wxwork">
    <div class="tool-prereq"><svg class="i i-sm"><use href="#i-alert"/></svg> 前置：企业微信 PC 版正在运行且已登录（独立于个人微信）</div>
    <div class="tool-step">
      <div class="tool-step-label">Step 1 — 解密</div>
      <div class="tools-row">
        <button class="tool-task-btn primary" data-task="wxwork_decrypt">① 提取密钥 + 解密数据库</button>
      </div>
    </div>
    <div class="tool-step">
      <div class="tool-step-label">Step 2 — 导出</div>
      <div class="tools-row">
        <button class="tool-task-btn" data-task="wxwork_export">② 导出聊天 (CSV/HTML/JSON)</button>
      </div>
    </div>
    <div class="tool-log-wrap" id="toolLog_wxwork"></div>
  </div>

  <div class="tool-pane" data-pane="misc">
    <div class="tool-prereq info"><svg class="i i-sm"><use href="#i-info"/></svg> 跟微信/企微进程无关，只读已解密产物</div>
    <div class="tool-step">
      <div class="tool-step-label">语音 / 转码</div>
      <div class="tools-row">
        <button class="tool-task-btn" data-task="voice_mp3">语音转 MP3（需 ffmpeg in PATH）</button>
      </div>
    </div>
    <div class="tool-log-wrap" id="toolLog_misc"></div>
  </div>
</div>
<div class="settings-overlay" id="settingsOverlay" onclick="toggleSettings()"></div>
<div class="settings-panel" id="settingsPanel">
<div class="sp-header"><h2>通知设置</h2><button class="sp-close" onclick="toggleSettings()">&times;</button></div>
<div class="sp-body">
<div class="sp-section">
<h3>全局</h3>
<div class="sp-toggle"><label>启用通知过滤</label><label class="switch"><input type="checkbox" id="notifyEnabled" onchange="saveNotifySettings()"><span class="slider"></span></label></div>
<div class="sp-toggle"><label>声音提醒</label><label class="switch"><input type="checkbox" id="soundEnabled" onchange="saveNotifySettings()"><span class="slider"></span></label></div>
</div>
<div class="sp-section">
<h3>规则</h3>
<div id="rulesContainer"></div>
<button class="add-rule-btn" onclick="addRule()">+ 添加规则</button>
</div>
</div>
</div>
<div id="lightbox" onclick="this.classList.remove('show')"><img id="lb-img" /></div>
<!-- 导出筛选模态框 -->
<div class="modal-overlay" id="exportModal">
  <div class="modal" onclick="event.stopPropagation()">
    <div class="modal-h">
      <h2 id="exportModalTitle">导出聊天</h2>
      <button class="modal-close" onclick="closeExportModal()">&times;</button>
    </div>
    <div class="modal-b">
      <input type="text" class="modal-search" id="exportSearch" placeholder="🔍 按名字 / wxid 搜索..." oninput="filterSessions()">
      <div class="session-list" id="exportSessionList">
        <div class="modal-loading">加载中...</div>
      </div>
      <div class="modal-selctrl">
        <button onclick="selectAllSessions(true)">全选</button>
        <button onclick="selectAllSessions(false)">清空</button>
        <button onclick="selectRecentSessions(30)">选最近 30 天活跃</button>
        <span class="modal-selcount" id="exportSelCount" style="margin-left:auto">已选 0 个</span>
      </div>
      <div class="modal-section" id="exportFmtSection">
        <div class="modal-section-label">格式</div>
        <div class="modal-fmt">
          <label><input type="checkbox" value="csv" checked> CSV</label>
          <label><input type="checkbox" value="html"> HTML</label>
          <label><input type="checkbox" value="json"> JSON</label>
        </div>
      </div>
    </div>
    <div class="modal-f">
      <button class="modal-btn secondary" onclick="closeExportModal()">取消</button>
      <button class="modal-btn primary" id="exportConfirmBtn" onclick="confirmExport()" disabled>确认导出 →</button>
    </div>
  </div>
</div>
<div class="messages" id="msgs">
<div class="empty" id="empty"><svg class="i i-xl" style="opacity:.4;margin-bottom:12px"><use href="#i-radio"/></svg><p>等待新消息...</p><p style="margin-top:6px;font-size:11px;color:#333">WAL增量解密 · SSE推送</p></div>
</div>
<script>
let n=0;
const M=document.getElementById('msgs'), S=document.getElementById('st');
const seen = new Set();  // 去重: timestamp+username
let sseReady = false;

function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
const WX_EMOJI={'微笑':'😊','撇嘴':'😣','色':'😍','发呆':'😳','得意':'😎','流泪':'😢','害羞':'😳','闭嘴':'🤐','睡':'😴','大哭':'😭','尴尬':'😅','发怒':'😡','调皮':'😜','呲牙':'😁','惊讶':'😮','难过':'😞','酷':'😎','冷汗':'😰','抓狂':'😫','吐':'🤮','偷笑':'🤭','可爱':'🥰','白眼':'🙄','傲慢':'😤','饥饿':'🤤','困':'😪','惊恐':'😨','流汗':'😓','憨笑':'😄','大兵':'🫡','奋斗':'💪','咒骂':'🤬','疑问':'❓','嘘':'🤫','晕':'😵','折磨':'😩','衰':'😥','骷髅':'💀','敲打':'🔨','再见':'👋','擦汗':'😓','抠鼻':'🤏','鼓掌':'👏','糗大了':'😳','坏笑':'😏','左哼哼':'😤','右哼哼':'😤','哈欠':'🥱','鄙视':'😒','委屈':'🥺','快哭了':'🥺','阴险':'😈','亲亲':'😘','吓':'😱','可怜':'🥺','菜刀':'🔪','西瓜':'🍉','啤酒':'🍺','篮球':'🏀','乒乓':'🏓','咖啡':'☕','饭':'🍚','猪头':'🐷','玫瑰':'🌹','凋谢':'🥀','示爱':'💗','爱心':'❤️','心碎':'💔','蛋糕':'🎂','闪电':'⚡','炸弹':'💣','刀':'🔪','足球':'⚽','瓢虫':'🐞','便便':'💩','月亮':'🌙','太阳':'☀️','礼物':'🎁','拥抱':'🤗','强':'👍','弱':'👎','握手':'🤝','胜利':'✌️','抱拳':'🙏','勾引':'👆','拳头':'✊','差劲':'👎','爱你':'🤟','NO':'🙅','OK':'👌','爱情':'💑','飞吻':'😘','跳跳':'💃','发抖':'🥶','怄火':'😤','转圈':'💫','磕头':'🙇','回头':'🔙','跳绳':'🏃','挥手':'👋','激动':'🤩','街舞':'💃','献吻':'😘','左太极':'☯️','右太极':'☯️','嘿哈':'😆','捂脸':'🤦','奸笑':'😏','机智':'🤓','皱眉':'😟','耶':'✌️','红包':'🧧','鸡':'🐔','Emm':'🤔','加油':'💪','汗':'😓','天啊':'😱','社会社会':'🤙','旺柴':'🐕','好的':'👌','打脸':'🤦','哇':'😲','翻白眼':'🙄','666':'👍','让我看看':'👀','叹气':'😮‍💨','苦涩':'😣','裂开':'💔','嘴唇':'💋','爱心':'❤️','破涕为笑':'😂'};
function wxEmoji(text){
  return text.replace(/\\[([^\\]]{1,4})\\]/g, (m,k)=>WX_EMOJI[k]||m);
}
function linkify(text){
  return text.replace(/(https?:\\/\\/[^\\s<>"'\\]\\)]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:#4fc3f7;text-decoration:underline">$1</a>');
}
function fmtSize(b){
  if(b<1024) return b+'B';
  if(b<1048576) return (b/1024).toFixed(1)+'KB';
  return (b/1048576).toFixed(1)+'MB';
}
function renderRich(r){
  if(!r) return null;
  if(r.type==='emoji' && r.emoji_url) return `<img class="msg-emoji" src="${esc(r.emoji_url)}" onerror="this.outerHTML='<span style=\\'color:#999\\'>😀 [表情]</span>'" />`;
  if(r.type==='link') {
    let src = r.source ? '<div class="msg-link-src">'+esc(r.source)+'</div>' : '';
    return `<a href="${esc(r.url)}" target="_blank" rel="noopener" class="msg-link"><div class="msg-link-title">🔗 ${esc(r.title)}</div>${r.des?'<div class="msg-link-des">'+esc(r.des)+'</div>':''}${src}</a>`;
  }
  if(r.type==='file') return `<div class="msg-file"><span class="msg-file-icon">📄</span><div><div class="msg-file-name">${esc(r.title)}</div><div class="msg-file-size">${r.file_ext?r.file_ext.toUpperCase()+' · ':''}${fmtSize(r.file_size)}</div></div></div>`;
  if(r.type==='quote') return `<div class="msg-quote"><div class="msg-quote-ref">↩ <b>${esc(r.ref_name)}</b>: ${esc(r.ref_content)}</div><div>${esc(r.title)}</div></div>`;
  if(r.type==='miniapp') return `<div class="msg-link"><div class="msg-link-title">🟢 ${esc(r.title)}</div>${r.source?'<div class="msg-link-src">小程序 · '+esc(r.source)+'</div>':''}</div>`;
  if(r.type==='channels') return `<div class="msg-video"><span>📺</span> ${esc(r.title)} <span style="color:#666;font-size:11px">视频号</span></div>`;
  if(r.type==='chatlog') {
    let items = r.items||[];
    let body = '';
    if(items.length>0) {
      let preview = items.slice(0,4).map(it=>'<div class="chatlog-item"><b>'+esc(it.name)+'</b>: '+esc(it.text)+'</div>').join('');
      let more = items.length>4 ? '<div class="chatlog-more">... 共'+items.length+'条消息</div>' : '';
      body = '<div class="chatlog-body">'+preview+more+'</div>';
    } else if(r.des) {
      body = '<div class="msg-link-des">'+esc(r.des)+'</div>';
    }
    return `<div class="msg-chatlog"><div class="msg-link-title">📋 ${esc(r.title)}</div>${body}</div>`;
  }
  if(r.type==='transfer') {
    let dirLabel = r.direction || '微信转账';
    let amount = r.fee_desc ? '<div class="msg-transfer-amount">'+esc(r.fee_desc)+'</div>' : '';
    let memo = r.pay_memo ? '<div class="msg-transfer-memo">备注: '+esc(r.pay_memo)+'</div>' : '';
    return `<div class="msg-transfer"><div class="msg-transfer-head">💸 ${esc(dirLabel)}</div>${amount}${memo}</div>`;
  }
  if(r.type==='voice') return `<div class="msg-voice">🎤 语音 ${r.duration}s</div>`;
  if(r.type==='video') return `<div class="msg-video">🎬 视频${r.duration?' '+r.duration+'s':''}</div>`;
  return null;
}
function showLightbox(url){
  const lb=document.getElementById('lightbox'), img=document.getElementById('lb-img');
  img.src=url;
  lb.classList.add('show');
}
function renderContent(m){
  if(m.image_url) return `<img class="msg-img" src="${m.image_url}" onclick="showLightbox('${m.image_url}')" onerror="this.style.display='none';this.nextElementSibling.style.display='inline'" /><span style="display:none">${esc(m.content||'')}</span>`;
  const richHtml = renderRich(m.rich);
  if(richHtml) return richHtml;
  const raw = esc(m.content||'');
  return linkify(wxEmoji(raw));
}

// ---- 通知过滤 ----
const DEFAULT_NOTIFY = {enabled:false, sound_enabled:true, rules:[]};
function loadNotifySettings(){
  try{ return JSON.parse(localStorage.getItem('wechat_notify'))||DEFAULT_NOTIFY; }catch(e){ return DEFAULT_NOTIFY; }
}
function saveNotifySettings(){
  const s = {
    enabled: document.getElementById('notifyEnabled').checked,
    sound_enabled: document.getElementById('soundEnabled').checked,
    rules: collectRules()
  };
  localStorage.setItem('wechat_notify', JSON.stringify(s));
}
function collectRules(){
  const rules=[];
  document.querySelectorAll('.rule-card').forEach(card=>{
    const inputs=card.querySelectorAll('input[type=text]');
    const checks=card.querySelectorAll('input[type=checkbox]');
    rules.push({
      group_name: inputs[0]?.value||'',
      sender_name: inputs[1]?.value||'',
      notify_on_any: checks[0]?.checked||false
    });
  });
  return rules;
}
function renderRules(){
  const s=loadNotifySettings();
  document.getElementById('notifyEnabled').checked=s.enabled;
  document.getElementById('soundEnabled').checked=s.sound_enabled;
  const c=document.getElementById('rulesContainer');
  c.innerHTML='';
  (s.rules||[]).forEach((_,i)=>addRuleCard(s.rules[i]));
}
function addRuleCard(r){
  r=r||{group_name:'',sender_name:'',notify_on_any:true};
  const c=document.getElementById('rulesContainer');
  const d=document.createElement('div');
  d.className='rule-card';
  d.innerHTML=`<div class="rule-header"><span style="font-size:12px;color:#888">规则 #${c.children.length+1}</span><button class="rule-del" onclick="this.closest('.rule-card').remove();saveNotifySettings()">&times;</button></div><input type="text" placeholder="群名（模糊匹配）" value="${esc(r.group_name)}" onchange="saveNotifySettings()"><input type="text" placeholder="发送人（可选，模糊匹配）" value="${esc(r.sender_name)}" onchange="saveNotifySettings()"><div class="rule-opts"><label><input type="checkbox" ${r.notify_on_any?'checked':''} onchange="saveNotifySettings()"> 匹配时通知</label></div>`;
  c.appendChild(d);
}
function addRule(){addRuleCard();saveNotifySettings();}
function toggleSettings(){
  const p=document.getElementById('settingsPanel'),o=document.getElementById('settingsOverlay');
  const show=!p.classList.contains('show');
  p.classList.toggle('show',show);
  o.classList.toggle('show',show);
  if(show) renderRules();
}
function toggleTools(){
  const p=document.getElementById('toolsPanel');
  p.classList.toggle('show');
}
window.__activeToolPane='wechat';
function switchToolTab(name){
  window.__activeToolPane=name;
  document.querySelectorAll('.tool-tab').forEach(t=>t.classList.toggle('active', t.dataset.pane===name));
  document.querySelectorAll('.tool-pane').forEach(p=>p.classList.toggle('active', p.dataset.pane===name));
}
async function cancelTool(){
  try{
    await fetch('/api/tool/cancel',{method:'POST'});
  }catch(e){}
}

// —— 导出筛选模态框 ——
window.__exportCtx = { source: null, task: null, btn: null, sessions: [] };

async function openExportModal(modalKind, task, btn){
  const source = modalKind === 'export_wxwork' ? 'wxwork' : 'wechat';
  window.__exportCtx = { source, task, btn, sessions: [] };
  document.getElementById('exportModalTitle').textContent =
    source === 'wxwork' ? '导出企业微信聊天' : '导出个人微信聊天';
  document.getElementById('exportSearch').value = '';
  // 企微脚本支持 --formats, 个人微信脚本目前只 JSON; 隐藏个人微信的格式选项
  document.getElementById('exportFmtSection').style.display = source === 'wxwork' ? 'block' : 'none';
  document.getElementById('exportConfirmBtn').disabled = true;
  document.getElementById('exportSelCount').textContent = '已选 0 个';
  document.getElementById('exportSessionList').innerHTML = '<div class="modal-loading">加载会话列表...</div>';
  document.getElementById('exportModal').classList.add('show');
  try{
    const r = await fetch('/api/sessions?source=' + source);
    const sessions = await r.json();
    if(sessions.error) throw new Error(sessions.error);
    window.__exportCtx.sessions = sessions;
    renderSessions(sessions, '');
  }catch(e){
    document.getElementById('exportSessionList').innerHTML =
      '<div class="modal-loading" style="color:var(--danger)">加载失败: ' + esc(e.message) + '</div>';
  }
}
function closeExportModal(){
  document.getElementById('exportModal').classList.remove('show');
}
function renderSessions(sessions, filter){
  const list = document.getElementById('exportSessionList');
  const lo = filter.toLowerCase();
  const filtered = sessions.filter(s =>
    !lo || s.name.toLowerCase().includes(lo) || (s.username||'').toLowerCase().includes(lo)
  );
  if(!filtered.length){
    list.innerHTML = '<div class="modal-loading">没匹配的会话</div>';
    return;
  }
  list.innerHTML = filtered.map((s, idx) => {
    const tsLabel = s.last_ts ? new Date(s.last_ts*1000).toISOString().slice(0,10) : '';
    const typeCls = s.type === '群' ? 'grp' : (s.type === '单聊' ? 'single' : '');
    return `<label class="session-item">
      <input type="checkbox" data-username="${esc(s.username)}" onchange="updateSelCount()">
      <span class="session-type ${typeCls}">${esc(s.type)}</span>
      <span class="session-name" title="${esc(s.username)}">${esc(s.name)}</span>
      <span class="session-ts">${tsLabel}</span>
    </label>`;
  }).join('');
}
function filterSessions(){
  renderSessions(window.__exportCtx.sessions, document.getElementById('exportSearch').value);
  updateSelCount();  // refilter 后保留 selection 但 count 重新统计当前可见的
}
function updateSelCount(){
  const checked = document.querySelectorAll('#exportSessionList input[type=checkbox]:checked');
  document.getElementById('exportSelCount').textContent = '已选 ' + checked.length + ' 个';
  document.getElementById('exportConfirmBtn').disabled = checked.length === 0;
}
function selectAllSessions(yes){
  document.querySelectorAll('#exportSessionList input[type=checkbox]').forEach(c => c.checked = yes);
  updateSelCount();
}
function selectRecentSessions(days){
  const cutoff = Date.now()/1000 - days*86400;
  const list = window.__exportCtx.sessions;
  document.querySelectorAll('#exportSessionList input[type=checkbox]').forEach(c => {
    const u = c.dataset.username;
    const s = list.find(x => x.username === u);
    c.checked = s && s.last_ts >= cutoff;
  });
  updateSelCount();
}
function confirmExport(){
  const users = [...document.querySelectorAll('#exportSessionList input[type=checkbox]:checked')]
    .map(c => c.dataset.username);
  const formats = [...document.querySelectorAll('#exportFmtSection input[type=checkbox]:checked')]
    .map(c => c.value);
  closeExportModal();
  // 实际触发任务,带 args
  const { task, btn } = window.__exportCtx;
  runToolWithArgs(task, btn, { users, formats });
}
// 需要弹模态框先筛选会话的任务
const NEEDS_MODAL = { 'export_all': 'export_wechat', 'wxwork_export': 'export_wxwork' };

async function runTool(task, btn){
  // 取消已运行任务
  if(btn.classList.contains('cancel')){
    btn.disabled = true;
    btn.textContent = '终止中...';
    cancelTool();
    return;
  }
  // 导出类任务先弹模态框
  if(NEEDS_MODAL[task]){
    openExportModal(NEEDS_MODAL[task], task, btn);
    return;
  }
  runToolWithArgs(task, btn, null);
}

async function runToolWithArgs(task, btn, args){
  const s=document.getElementById('toolStatus');
  document.querySelectorAll('.tool-task-btn').forEach(b=>{
    if(b!==btn) b.disabled=true;
  });
  btn.dataset.origText = btn.textContent;
  btn.dataset.origHtml = btn.innerHTML;
  btn.innerHTML = '<svg class="i"><use href="#i-stop"/></svg> 终止';
  btn.classList.add('cancel');
  window.__runningBtn = btn;
  const L=document.getElementById('toolLog_'+window.__activeToolPane);
  if(L) L.textContent='';
  s.style.display='inline-block';
  s.className='tool-status running';
  s.innerHTML='<svg class="i i-sm spin"><use href="#i-loader"/></svg> 运行中: '+esc(btn.dataset.origText.trim());
  try{
    const payload = { task: task };
    if(args) payload.args = args;
    const r=await fetch('/api/tool',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const d=await r.json();
    if(!r.ok){
      s.className='tool-status err';
      s.textContent='✗ '+(d.error||'启动失败');
      document.querySelectorAll('.tool-task-btn').forEach(b=>{
        b.disabled=false;
        if(b.dataset.origHtml){b.innerHTML = b.dataset.origHtml; b.dataset.origHtml=''; b.dataset.origText='';}
        b.classList.remove('cancel');
      });
    }
  }catch(e){
    s.className='tool-status err';
    s.textContent='✗ 网络错误: '+e.message;
    document.querySelectorAll('.tool-task-btn').forEach(b=>{
      b.disabled=false;
      if(b.dataset.origHtml){b.innerHTML = b.dataset.origHtml; b.dataset.origHtml=''; b.dataset.origText='';}
      b.classList.remove('cancel');
    });
  }
}
// 工具按钮 + tab 切换 click handler 绑定
document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('.tool-task-btn').forEach(b=>{
    b.addEventListener('click',()=>runTool(b.dataset.task, b));
  });
  document.querySelectorAll('.tool-tab').forEach(t=>{
    t.addEventListener('click',()=>switchToolTab(t.dataset.pane));
  });
});
function beep(){
  try{
    const ctx=new(window.AudioContext||window.webkitAudioContext)();
    const osc=ctx.createOscillator();
    const gain=ctx.createGain();
    osc.connect(gain);gain.connect(ctx.destination);
    osc.frequency.value=880;gain.gain.value=0.3;
    osc.start();osc.stop(ctx.currentTime+0.15);
  }catch(e){}
}
function checkNotifyMatch(m){
  const s=loadNotifySettings();
  if(!s.enabled||!s.rules||!s.rules.length) return false;
  const chat=(m.chat||'').toLowerCase();
  const sender=(m.sender||'').toLowerCase();
  for(const r of s.rules){
    if(!r.group_name) continue;
    if(!chat.includes(r.group_name.toLowerCase())) continue;
    if(r.sender_name && !sender.includes(r.sender_name.toLowerCase())) continue;
    if(r.notify_on_any) return true;
  }
  return false;
}
function sendNotification(m){
  const title=m.chat+(m.sender?' - '+m.sender:'');
  const body=(m.content||'').slice(0,100);
  if(Notification.permission==='granted'){
    new Notification(title,{body,icon:'📡'});
  }else if(Notification.permission!=='denied'){
    Notification.requestPermission().then(p=>{if(p==='granted') new Notification(title,{body,icon:'📡'});});
  }
  const s=loadNotifySettings();
  if(s.sound_enabled) beep();
}

function addMsg(m, animate){
  // 去重（包含类型，避免同时间戳的文字+图片组合被误判重复）
  const key = m.timestamp + '|' + (m.username||m.chat) + '|' + (m.type||'');
  if(seen.has(key)) return;
  seen.add(key);

  const x=document.getElementById('empty');
  if(x) x.remove();

  n++;
  document.getElementById('cnt').textContent=n+' 消息';
  if(m.decrypt_ms!=null) document.getElementById('perf').textContent=m.pages+'页/'+m.decrypt_ms+'ms';

  const d=document.createElement('div');
  d.className = animate ? 'msg hl' : 'msg';

  const sn=m.sender?`<span class="msg-sender">${esc(m.sender)}</span>`:'';
  const ur=m.unread>0?`<span class="msg-unread">${m.unread}</span>`:'';
  const cc=m.is_group?'msg-chat grp':'msg-chat';

  let contentHtml = renderContent(m);

  const dk=m.timestamp+'|'+(m.username||m.chat);
  d.dataset.ts = m.timestamp || 0;  // 用于按 timestamp 排序定位
  d.innerHTML=`<div class="msg-header"><span class="msg-time">${m.time}</span><span class="${cc}">${esc(m.chat)}</span>${sn}<div class="msg-r"><span class="msg-type">${m.type_icon} ${m.type}</span>${ur}</div></div><div class="msg-content" data-key="${dk}">${contentHtml}</div>`;

  // 通知匹配检查
  if(animate && checkNotifyMatch(m)){
    d.classList.add('notify-hl');
    sendNotification(m);
    setTimeout(()=>d.classList.remove('notify-hl'), 10000);
  }

  // 按 timestamp 找正确插入位置 (降序: 大 ts 在顶, 小 ts 在底)
  // 之前的 bug: insertBefore(d, M.firstChild) 永远插最前面,
  // 导致 SSE 实时消息 + hidden 路径补抓的旧消息混在一起时顺序乱。
  const ts = +d.dataset.ts;
  const kids = M.children;
  let inserted = false;
  for(let i=0; i<kids.length; i++){
    const existingTs = +(kids[i].dataset.ts || 0);
    if(ts > existingTs){
      M.insertBefore(d, kids[i]);
      inserted = true;
      break;
    }
  }
  if(!inserted) M.appendChild(d);  // 比所有现有都早, 放最底

  if(animate){
    setTimeout(()=>d.classList.remove('hl'), 3000);
    document.title='('+n+') 微信监听';
  }

  // 限制最多200条
  while(M.children.length>200) M.removeChild(M.lastChild);
}

// 页面加载时请求通知权限
if('Notification' in window && Notification.permission==='default'){
  Notification.requestPermission();
}

function connectSSE(){
  const es=new EventSource('/stream');
  es.onopen=()=>{
    S.textContent='SSE 实时';
    S.className='status ok';
    sseReady=true;
  };
  es.onmessage=ev=>{
    addMsg(JSON.parse(ev.data), true);  // 新消息有动画
  };
  es.addEventListener('image_update', ev=>{
    const d=JSON.parse(ev.data);
    const key=d.timestamp+'|'+(d.username||'');
    const msgs=M.querySelectorAll('.msg');
    for(const el of msgs){
      const ct=el.querySelector('.msg-content');
      if(ct && ct.dataset.key===key){
        if(d.v2_unsupported){
          ct.innerHTML='<span style="color:#999;font-style:italic">[图片 - 新加密格式暂不支持预览]</span>';
        } else if(d.image_url){
          ct.innerHTML=`<img class="msg-img" src="${d.image_url}" onclick="showLightbox('${d.image_url}')" onerror="this.style.display='none'" />`;
        }
        break;
      }
    }
  });
  es.addEventListener('rich_update', ev=>{
    const d=JSON.parse(ev.data);
    const key=d.timestamp+'|'+(d.username||'');
    for(const el of M.querySelectorAll('.msg')){
      const ct=el.querySelector('.msg-content');
      if(ct && ct.dataset.key===key){
        const html=renderRich(d.rich);
        if(html) ct.innerHTML=html;
        break;
      }
    }
  });
  es.addEventListener('tool_log', ev=>{
    const d=JSON.parse(ev.data);
    // 写到当前激活 pane 的日志框
    const pane=window.__activeToolPane||'wechat';
    const L=document.getElementById('toolLog_'+pane);
    if(L){L.textContent += d.line; L.scrollTop = L.scrollHeight;}
  });
  es.addEventListener('tool_done', ev=>{
    const d=JSON.parse(ev.data);
    const s=document.getElementById('toolStatus');
    if(d.cancelled){
      s.textContent = '⊘ 已终止';
      s.className = 'tool-status err';
    } else {
      s.textContent = d.ok ? '✓ 完成' : ('✗ 失败 (code ' + d.exit_code + ')');
      s.className = 'tool-status ' + (d.ok ? 'ok' : 'err');
    }
    // 还原所有按钮 + 把"终止"按钮还原成原文本
    document.querySelectorAll('.tool-task-btn').forEach(b=>{
      b.disabled=false;
      if(b.dataset.origHtml){b.innerHTML = b.dataset.origHtml; b.dataset.origHtml=''; b.dataset.origText='';}
      b.classList.remove('cancel');
    });
    window.__runningBtn = null;
  });
  es.onerror=()=>{
    S.textContent='重连...';
    S.className='status err';
    sseReady=false;
    es.close();
    setTimeout(connectSSE, 2000);  // 重连不清页面
  };
}

// 启动: 加载历史(无动画) → 连接SSE(有动画)
fetch('/api/history').then(r=>r.json()).then(ms=>{
  ms.sort((a,b)=>a.timestamp-b.timestamp);
  ms.forEach(m=>addMsg(m, false));  // 历史消息无动画
  connectSSE();
});
</script>
</body>
</html>'''


# ────────────── 工具任务 (Web GUI 替代 tkinter app_gui.py 的入口) ────────────
#
# 复用现有 SSE 通道 (broadcast_sse + sse_clients), 后端跑子进程, 实时把 stdout
# 推到浏览器。架构原则: 一次只允许 1 个工具任务运行 (避免两个解密同时挤内存)。
#
# 前端在 HTML_PAGE 顶部加一个折叠区,点按钮 POST /api/tool {task: "..."}。
# SSE 事件用 event=tool_log / tool_done 跟原 message 事件区分。

def _build_export_steps(users, formats):
    """根据用户选择的会话 + 格式拼 export_all_chats.py argv"""
    cmd = [sys.executable, "export_all_chats.py"]
    if users:
        cmd += ["--users", ",".join(users)]
    # export_all_chats 当前只输出 JSON, formats 暂时忽略
    # (export_messages.py 有 CSV/HTML/JSON, 但走的是另一条路径, 不在 v1 范围)
    return [cmd]


def _build_wxwork_export_steps(users, formats):
    """根据用户选择拼 export_wxwork_messages.py argv (--conversation 可重复)"""
    cmd = [sys.executable, "export_wxwork_messages.py"]
    for u in (users or []):
        cmd += ["--conversation", u]
    if formats:
        cmd += ["--formats", ",".join(formats)]
    return [cmd]


# task 配置:
#   steps         — 固定 cmd 列表 (无参任务)
#   build_steps   — fn(args)->[cmd, ...] 动态构造 (需要用户选会话/格式的导出任务)
#   needs_modal   — 前端点这个 task 时要弹模态框 ('export_wechat' | 'export_wxwork')
TOOL_TASKS = {
    # —— 个人微信 ——
    "wechat_decrypt": {
        "name": "① 微信解密",
        "steps": [[sys.executable, "main.py", "decrypt"]],
    },
    "image_key": {
        "name": "② 图片密钥",
        "steps": [[sys.executable, "find_image_key.py"]],
    },
    "export_all": {
        "name": "③ 导出聊天",
        "build_steps": _build_export_steps,
        "needs_modal": "export_wechat",
    },
    "decode_images": {
        "name": "④ 批量解密图片",
        "steps": [[sys.executable, "main.py", "decode-images"]],
    },
    # —— 朋友圈 ——
    "sns_decrypt": {
        "name": "⑤ 朋友圈解密",
        "steps": [
            [sys.executable, "decrypt_sns.py"],
            [sys.executable, "export_sns.py"],
        ],
    },
    # —— 企业微信 ——
    "wxwork_decrypt": {
        "name": "⑥ 企业微信解密",
        "steps": [
            [sys.executable, "find_wxwork_keys.py"],
            [sys.executable, "decrypt_wxwork_db.py"],
        ],
    },
    "wxwork_export": {
        "name": "⑦ 企业微信导出",
        "build_steps": _build_wxwork_export_steps,
        "needs_modal": "export_wxwork",
    },
    # —— 工具 ——
    "voice_mp3": {
        "name": "⑧ 语音转 MP3",
        "steps": [[sys.executable, "voice_to_mp3.py"]],
    },
}

_tool_lock = threading.Lock()
_tool_running = {"job": None, "proc": None, "cancelled": False}  # 同时只允许一个任务


def _list_sessions(source):
    """列会话, 供导出筛选模态框消费。返回 [{name, username, type, last_ts}]
    按 last_ts 降序。

    source:
      wechat — 个人微信, 从 decrypted/session/session.db 读 SessionTable
      wxwork — 企业微信, 从 wxwork_decrypted/session.db 读 conversation_table
    """
    out = []
    if source == "wechat":
        if not os.path.exists(DECRYPTED_SESSION):
            return []
        # 复用 load_contact_names (静态快照即可, 模态框开时调一次性 OK)
        names = load_contact_names()
        try:
            with closing(sqlite3.connect(f"file:{DECRYPTED_SESSION}?mode=ro&immutable=1", uri=True)) as conn:
                for r in conn.execute(
                    "SELECT username, type, last_timestamp, last_sender_display_name, summary "
                    "FROM SessionTable WHERE username IS NOT NULL AND username != '' "
                    "ORDER BY last_timestamp DESC"
                ):
                    username, type_, ts, sender, summary = r
                    is_group = username.endswith("@chatroom") if username else False
                    is_public = username.startswith("gh_") if username else False
                    type_label = "群" if is_group else ("公众号" if is_public else "单聊")
                    name = names.get(username) or sender or username
                    out.append({
                        "username": username,
                        "name": name,
                        "type": type_label,
                        "last_ts": ts or 0,
                        "summary": (summary or "")[:60],
                    })
        except Exception:
            pass
    elif source == "wxwork":
        script_dir = os.path.dirname(os.path.abspath(__file__))
        path = os.path.join(script_dir, "wxwork_decrypted", "session.db")
        if not os.path.exists(path):
            return []
        try:
            with closing(sqlite3.connect(f"file:{path}?mode=ro&immutable=1", uri=True)) as conn:
                conn.text_factory = lambda b: b.decode("utf-8", errors="replace") if isinstance(b, bytes) else b
                for r in conn.execute(
                    "SELECT id, name, last_message_time FROM conversation_table "
                    "WHERE id IS NOT NULL AND id != '' "
                    "ORDER BY last_message_time DESC"
                ):
                    cid, name, ts = r
                    # id 前缀: R=群 / S=单聊 / E=外部/系统 / Y=其他
                    if cid.startswith("R:"):
                        type_label = "群"
                    elif cid.startswith("S:"):
                        type_label = "单聊"
                    elif cid.startswith("E:"):
                        type_label = "外部"
                    else:
                        type_label = "其他"
                    out.append({
                        "username": cid,
                        "name": name or cid,
                        "type": type_label,
                        "last_ts": ts or 0,
                        "summary": "",
                    })
        except Exception:
            pass
    return out


def _broadcast_tool_event(event, **fields):
    payload = {"event": event, **fields}
    broadcast_sse(payload)


def _run_tool_task(job_id, task_name, args=None):
    """后台线程: 顺序跑 TOOL_TASKS[task_name].steps 的每条命令,实时推 SSE。

    args 含用户在前端模态框选的参数 (users / formats 等), 由 build_steps
    动态构造 cmd。固定任务 (无 build_steps) 直接用 steps。
    """
    task = TOOL_TASKS.get(task_name)
    if not task:
        _broadcast_tool_event("tool_done", job_id=job_id, ok=False,
                              error=f"未知任务: {task_name}")
        with _tool_lock:
            _tool_running["job"] = None
        return

    # 动态构造 steps (导出类) 或用固定 steps
    if "build_steps" in task:
        a = args or {}
        steps = task["build_steps"](a.get("users", []), a.get("formats", []))
    else:
        steps = task["steps"]

    _broadcast_tool_event("tool_log", job_id=job_id,
                          line=f"━━━ 开始: {task['name']} ━━━\n")

    exit_code = 0
    cancelled = False
    for step in steps:
        cmd_str = " ".join(step)
        _broadcast_tool_event("tool_log", job_id=job_id,
                              line=f"\n>>> {cmd_str}\n\n")
        try:
            proc = subprocess.Popen(
                step,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                cwd=os.path.dirname(os.path.abspath(__file__)),
                env={**os.environ,
                     "PYTHONIOENCODING": "utf-8",
                     "WECHAT_DECRYPT_NONINTERACTIVE": "1"},
                bufsize=1,
                text=True,
                encoding="utf-8",
                errors="replace",
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)
                              if sys.platform == "win32" else 0,
            )
        except Exception as e:
            _broadcast_tool_event("tool_log", job_id=job_id,
                                  line=f"[ERROR] 启动失败: {e}\n")
            exit_code = -1
            break

        # 暴露 proc 给取消路由
        with _tool_lock:
            _tool_running["proc"] = proc

        for line in proc.stdout:
            _broadcast_tool_event("tool_log", job_id=job_id, line=line)
            with _tool_lock:
                if _tool_running.get("cancelled"):
                    break
        proc.wait()
        with _tool_lock:
            _tool_running["proc"] = None
            if _tool_running.get("cancelled"):
                cancelled = True
                _broadcast_tool_event("tool_log", job_id=job_id,
                                      line=f"\n[CANCELLED] 任务被用户终止\n")
                break
        if proc.returncode != 0:
            _broadcast_tool_event("tool_log", job_id=job_id,
                                  line=f"\n[FAIL] 返回码 {proc.returncode}\n")
            exit_code = proc.returncode
            break

    if cancelled:
        _broadcast_tool_event("tool_done", job_id=job_id, ok=False,
                              exit_code=-15, cancelled=True)
    else:
        _broadcast_tool_event("tool_done", job_id=job_id, ok=(exit_code == 0),
                              exit_code=exit_code)
    with _tool_lock:
        _tool_running["job"] = None
        _tool_running["proc"] = None
        _tool_running["cancelled"] = False


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def handle(self):
        try:
            super().handle()
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError, OSError):
            pass  # 浏览器关闭连接，正常

    def do_GET(self):
        if self.path in ('/', '/index.html'):
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(HTML_PAGE.encode('utf-8'))

        elif self.path.startswith('/api/history'):
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            filter_chat = params.get('chat', [''])[0].strip().lower()
            since_ts = 0
            try:
                since_ts = int(params.get('since', ['0'])[0])
            except (ValueError, TypeError):
                pass
            limit_val = 500
            try:
                limit_val = min(int(params.get('limit', ['500'])[0]), 2000)
            except (ValueError, TypeError):
                pass

            with messages_lock:
                data = sorted(messages_log, key=lambda m: m.get('timestamp', 0))

            if since_ts:
                data = [m for m in data if m.get('timestamp', 0) > since_ts]
            if filter_chat:
                data = [m for m in data if filter_chat in m.get('chat', '').lower()
                        or filter_chat in m.get('username', '').lower()]
            data = data[-limit_val:]

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

        elif self.path.startswith('/img/'):
            filename = urllib.parse.unquote(self.path[5:])
            # 安全: 防目录穿越
            if '/' in filename or '\\' in filename or '..' in filename:
                self.send_error(403)
                return
            filepath = os.path.join(DECODED_IMAGE_DIR, filename)
            if not os.path.isfile(filepath):
                self.send_error(404)
                return
            ext = os.path.splitext(filename)[1].lower()
            ct = {
                '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                '.png': 'image/png', '.gif': 'image/gif',
                '.webp': 'image/webp', '.bmp': 'image/bmp',
                '.tif': 'image/tiff',
            }.get(ext, 'application/octet-stream')
            with open(filepath, 'rb') as f:
                data = f.read()
            self.send_response(200)
            self.send_header('Content-Type', ct)
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'public, max-age=86400')
            self.end_headers()
            self.wfile.write(data)

        elif self.path.startswith('/api/tags'):
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            name_filter = params.get('name', [''])[0].strip().lower()

            tags = load_contact_tags()
            if name_filter:
                tags = [t for t in tags if name_filter in t['name'].lower()]

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps(tags, ensure_ascii=False).encode('utf-8'))

        elif self.path == '/stream':
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.end_headers()

            q = queue.Queue()
            with sse_lock:
                sse_clients.append(q)
            try:
                while True:
                    try:
                        payload = q.get(timeout=15)
                        self.wfile.write(payload.encode('utf-8'))
                        self.wfile.flush()
                    except queue.Empty:
                        self.wfile.write(b': hb\n\n')
                        self.wfile.flush()
            except:
                pass
            finally:
                with sse_lock:
                    if q in sse_clients:
                        sse_clients.remove(q)
        elif self.path == "/api/sessions" or self.path.startswith("/api/sessions?"):
            # 列会话(用于导出筛选模态框)
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            source = params.get("source", ["wechat"])[0]
            try:
                sessions = _list_sessions(source)
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps(sessions, ensure_ascii=False).encode())
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())

        else:
            self.send_error(404)

    def do_POST(self):
        if self.path == "/api/tool":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length).decode("utf-8") if length else "{}"
                req = json.loads(body)
                task_name = req.get("task", "")
                task_args = req.get("args", {}) or {}
            except Exception as e:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": f"bad request: {e}"}).encode())
                return

            if task_name not in TOOL_TASKS:
                self.send_response(404)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": f"未知任务: {task_name}",
                                             "available": list(TOOL_TASKS)}).encode())
                return

            with _tool_lock:
                if _tool_running["job"]:
                    self.send_response(409)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "error": "已有任务在跑",
                        "running_job": _tool_running["job"],
                    }).encode())
                    return
                job_id = "j_" + uuid.uuid4().hex[:8]
                _tool_running["job"] = job_id

            threading.Thread(target=_run_tool_task,
                             args=(job_id, task_name, task_args),
                             daemon=True).start()

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "job_id": job_id,
                "task": task_name,
                "name": TOOL_TASKS[task_name]["name"],
            }).encode())
        elif self.path == "/api/tool/cancel":
            with _tool_lock:
                proc = _tool_running.get("proc")
                job = _tool_running.get("job")
                if not proc or not job:
                    self.send_response(404)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "无运行中任务"}).encode())
                    return
                _tool_running["cancelled"] = True
            try:
                proc.terminate()
                # 给 1.5 秒优雅退, 否则强杀
                try:
                    proc.wait(timeout=1.5)
                except subprocess.TimeoutExpired:
                    proc.kill()
            except Exception as e:
                pass  # 进程可能正好自己退了
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"job_id": job, "cancelled": True}).encode())
        else:
            self.send_error(404)


class ThreadedServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def _start_monitor_if_ready():
    """如果 keys 已存在且能解出 session.db, 启动监听线程; 否则跳过。

    用户在 Web UI 工具箱点 "① 提取密钥 + 解密数据库" 后, keys 文件就会
    存在。届时刷新页面即可激活监听 (重启 monitor_web 或者下次访问 UI
    时再尝试启动)。

    返回 True = 监听已启动, False = 未启动 (UI 仍可用作工具箱)。
    """
    if not os.path.exists(KEYS_FILE):
        print(f"[!] 未找到 keys 文件: {KEYS_FILE}", flush=True)
        print("    Web UI 仍可用作工具箱 (从右上角 🛠️ 工具 启动 '① 提取密钥')",
              flush=True)
        print("    解密完成后重启本进程, 监听会自动启动\n", flush=True)
        return False

    try:
        with open(KEYS_FILE, encoding="utf-8") as f:
            keys = strip_key_metadata(json.load(f))
    except Exception as e:
        print(f"[!] 读取 keys 文件失败: {e}", flush=True)
        print("    Web UI 仍可用作工具箱\n", flush=True)
        return False

    session_key_info = get_key_info(keys, os.path.join("session", "session.db"))
    if not session_key_info:
        print("[!] keys 文件里没有 session.db 密钥", flush=True)
        print("    可能 keys 是部分提取的, 工具箱 → '① 提取密钥' 重跑一次\n",
              flush=True)
        return False

    enc_key = bytes.fromhex(session_key_info["enc_key"])
    session_db = os.path.join(DB_DIR, "session", "session.db")
    if not os.path.exists(session_db):
        print(f"[!] session.db 不存在: {session_db}", flush=True)
        print("    检查 config.json 的 db_dir 是否对应当前微信账号\n", flush=True)
        return False

    print("加载联系人...", flush=True)
    contact_names = load_contact_names()
    print(f"已加载 {len(contact_names)} 个联系人", flush=True)

    print("构建 username→DB 映射...", flush=True)
    username_db_map = build_username_db_map()
    print(f"已映射 {len(username_db_map)} 个用户名", flush=True)

    # 启动时清理可能损坏的缓存
    if os.path.isdir(MONITOR_CACHE_DIR):
        for f in os.listdir(MONITOR_CACHE_DIR):
            fp = os.path.join(MONITOR_CACHE_DIR, f)
            if f.endswith('.db'):
                try:
                    c = sqlite3.connect(fp)
                    c.execute("SELECT 1 FROM sqlite_master LIMIT 1")
                    c.close()
                except Exception:
                    try:
                        os.unlink(fp)
                        print(f"[cleanup] 删除损坏缓存: {f}", flush=True)
                    except PermissionError:
                        print(f"[cleanup] 缓存被占用跳过: {f}", flush=True)

    db_cache = MonitorDBCache(keys, MONITOR_CACHE_DIR)

    # 后台预热所有 message DB
    def _warmup():
        try:
            t0 = time.perf_counter()
            warmup_keys = [os.path.join("message", "message_resource.db")]
            for i in range(5):
                k = os.path.join("message", f"message_{i}.db")
                if get_key_info(keys, k):
                    warmup_keys.append(k)
            for k in warmup_keys:
                t1 = time.perf_counter()
                try:
                    db_cache.get(k)
                    print(f"[warmup] {k} {(time.perf_counter()-t1)*1000:.0f}ms", flush=True)
                except Exception as e:
                    print(f"[warmup] {k} 失败: {e}", flush=True)
        except Exception as e:
            print(f"[warmup] 异常: {e}", flush=True)
        _build_emoji_lookup(keys)
        print(f"[warmup] 全部完成 {(time.perf_counter()-t0)*1000:.0f}ms", flush=True)
    threading.Thread(target=_warmup, daemon=True).start()

    t = threading.Thread(target=monitor_thread,
                         args=(enc_key, session_db, contact_names, db_cache, username_db_map),
                         daemon=True)
    t.start()
    return True


def main():
    print("=" * 60, flush=True)
    print("  WeChat Decrypt — Web UI + 实时监听", flush=True)
    print("=" * 60, flush=True)

    _start_monitor_if_ready()

    server = ThreadedServer(('0.0.0.0', PORT), Handler)
    print(f"=> http://localhost:{PORT}", flush=True)
    print("Ctrl+C 停止\n", flush=True)

    try:
        import webbrowser
        webbrowser.open(f'http://localhost:{PORT}')
    except Exception:
        pass

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")


if __name__ == '__main__':
    main()
