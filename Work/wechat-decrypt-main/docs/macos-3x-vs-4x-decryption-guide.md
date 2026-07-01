# WeChat macOS 数据库解密指南：3.x vs 4.x 完整对比

## 一、背景

微信 macOS 版使用 SQLCipher 加密本地数据库。不同大版本的加密参数完全不同，解密方法不能混用。

| 项目 | WeChat 3.x (≤3.8.x) | WeChat 4.x (≥4.0.x) |
|------|---------------------|---------------------|
| SQLCipher 版本 | **3** | **4** |
| 默认 page_size | **1024** | **4096** |
| HMAC 算法 | HMAC-**SHA1** (20 bytes) | HMAC-**SHA512** (64 bytes) |
| Reserve 区大小 | **48** bytes (IV16 + HMAC20 + pad12) | **80** bytes (IV16 + HMAC64) |
| KDF 迭代次数 | **64,000** | **256,000** |
| KDF 算法 | PBKDF2-SHA1 | PBKDF2-SHA512 |
| 密钥使用方式 | 32字节 raw key **直接使用** | 32字节 raw key **直接使用** |

---

## 二、数据存放位置

### WeChat 3.x

```
~/Library/Containers/com.tencent.xinWeChat/Data/
  Library/Application Support/com.tencent.xinWeChat/
    2.0b4.0.9/<account_md5_hash>/
      Message/msg_0.db ~ msg_9.db     ← 聊天消息 (按hash分片)
      Contact/wccontact_new2.db        ← 联系人
      Session/session_new.db           ← 会话列表
      Group/group_new.db               ← 群信息
      Favorites/favorites.db           ← 收藏
      ...共约 34 个 DB
```

### WeChat 4.x

```
~/Library/Containers/com.tencent.xinWeChat/Data/
  Documents/xwechat_files/<account_id>/
    db_storage/
      message/message_0.db ~ message_5.db  ← 聊天消息
      contact/contact.db                    ← 联系人
      session/session.db                    ← 会话列表
      ...
```

**关键区别**: 3.x 用 MD5 hash 做账号目录名（看不出是谁），4.x 用微信ID做目录名。

---

## 三、密钥提取（核心步骤）

两个版本的密钥提取方式完全一样：**从微信进程内存中读取 32 字节 raw key**。

### 前提条件

1. 微信已登录且正在运行
2. 安装 Frida：`pip3 install frida-tools` 或 `brew install frida`
3. 管理员密码（sudo 权限）

### macOS 权限要求

密钥提取需要调用 `task_for_pid()`，能否成功取决于**微信 App 的代码签名状态**：

- **Ad-hoc 签名**（如安装了防撤回补丁）：`sudo` 即可，SSH 也行
- **Apple 官方签名**（有 Hardened Runtime）：需要本机 Terminal + sudo，SSH 不可行

```bash
# 检查微信签名状态
codesign -dv /Applications/WeChat.app 2>&1 | grep -E "Signature|flags"
# Ad-hoc: flags=0x2(adhoc) → sudo 直接可用
# Apple:  flags=0x10000(runtime) → 需本机 Terminal 或先重签名
```

如果需要 SSH 远程操作，可以重签名微信去掉 Hardened Runtime：
```bash
sudo codesign --force --deep --sign - /Applications/WeChat.app
# 重启微信后 SSH sudo 即可提取密钥
```

> 📖 完整的权限模型、SSH 配置、常见误区详见 [macOS 权限完全指南](macos-permission-guide.md)

### 新手操作步骤

根据你的微信签名状态，选择对应方案：

```bash
# 首先检查你的微信签名状态
codesign -dv /Applications/WeChat.app 2>&1 | grep -E "Signature|flags"

# 如果显示 Signature=adhoc, flags=0x2(adhoc)
# → 恭喜！直接 sudo 即可，SSH 也行
sudo ./find_all_keys_macos

# 如果显示 Authority=..Apple.., flags 包含 runtime
# → 需要本机 Terminal 操作，或者先重签名:
sudo codesign --force --deep --sign - /Applications/WeChat.app
# 然后重启微信，再用 sudo 提取密钥
```

### SSH 远程提取方案（需 ad-hoc 签名）

以下方法全部在 Apple 官方签名的微信上失败（经多台机器穷举验证）：
- `sudo frida -p <pid>` → "unable to access process"
- `lldb -p <pid>` → "non-interactive debug session"
- `sudo gcore <pid>` → "insufficient privilege"
- 自编译带 `com.apple.security.cs.debugger` entitlement 的 C 程序 → KERN_FAILURE=5
- `vmmap`/`heap` → 只能看元数据，无法读内存内容
- LaunchDaemon (root) / LaunchAgent (Aqua) / `launchctl asuser` → 全部失败
- 修改 TCC.db → SIP 保护，`restricted` 标志，只读

### 实际操作步骤

#### 方法 A: 使用 C 版扫描器（推荐，4.x）

```bash
# 编译
cc -O2 -o find_all_keys_macos find_all_keys_macos.c -framework Foundation

# 运行（自动查找微信进程、扫描内存、匹配 DB salt）
sudo ./find_all_keys_macos
```

扫描器会在内存中搜索 `x'<64hex_key><32hex_salt>'` 格式的密钥，自动匹配 DB 文件的 salt，输出 `all_keys.json`。

#### 方法 B: 使用 Frida（3.x / 通用）

```bash
# 附加到微信进程，手动 dump 内存搜索 32 字节密钥
sudo frida -p $(pgrep -x WeChat) -l scan_keys.js
```

输出示例（3.x 实际结果）：

```
600000d8d930  72 8e 8e dd 26 68 48 37 92 89 2c 7b 24 10 58 9d  r...&hH7..,{$.X.
600000d8d940  3e 64 1e e7 ef b3 47 c9 9f 17 3d 58 bf 9d 38 05  >d....G...=X..8.
```

这 32 字节就是密钥：`728e8edd2668483792892c7b2410589d3e641ee7efb347c99f173d58bf9d3805`

---

## 四、解密实现

### 核心原理

SQLCipher 加密的每一页（page）结构：

```
┌─────────────────────────────────────────────────────┐
│                    第 1 页 (特殊)                      │
├──────────┬──────────────────────┬───────────────────┤
│ Salt     │ 加密的数据            │ Reserve区          │
│ 16 bytes │ (page_size-16-rsv)   │ IV+HMAC+padding   │
├──────────┴──────────────────────┴───────────────────┤
│                                                      │
│              第 2~N 页 (普通页)                        │
├────────────────────────────────┬────────────────────┤
│ 加密的数据                      │ Reserve区           │
│ (page_size - reserve)          │ IV + HMAC + padding │
└────────────────────────────────┴────────────────────┘
```

**第 1 页特殊处理**：前 16 字节是明文 salt（不加密），解密后需要拼回 `SQLite format 3\0` 头。

### WeChat 3.x 解密参数

```python
# SQLCipher 3 参数
PAGE_SIZE = 1024
RESERVE = 48          # 16(IV) + 20(HMAC-SHA1) + 12(padding)
KDF_ITER = 64000
HMAC_ALGO = 'sha1'
HMAC_LEN = 20
```

### WeChat 4.x 解密参数

```python
# SQLCipher 4 参数
PAGE_SIZE = 4096
RESERVE = 80          # 16(IV) + 64(HMAC-SHA512)
KDF_ITER = 256000
HMAC_ALGO = 'sha512'
HMAC_LEN = 64
```

### 3.x 的特殊陷阱：同一账号的 DB 使用不同参数！

这是 3.x 最坑的地方。我们实测发现同一个账号的 34 个 DB 居然用了 **4 种不同的 SQLCipher 配置**：

| DB 类别 | page_size | key 模式 |
|---------|-----------|---------|
| 大部分 DB (msg, contact, session...) | 1024 | raw key **直接使用** |
| WebTemplate/webtemplate.db | 4096 | raw key **直接使用** |
| FTS 索引 (ftsmessage, ftsfilemessage) | 1024 | PBKDF2(raw_key, salt, 64000) |
| mediaData.db | 4096 | PBKDF2(raw_key, salt, 64000) |

还有 3 个 DB 根本没加密（kv_config, solitaire_chat, multiTalk），直接复制即可。

所以解密脚本必须自动判断并尝试多种组合。

### 完整解密代码（Python, 3.x）

```python
#!/usr/bin/env python3
"""WeChat 3.x macOS 数据库解密器"""

import hashlib, hmac, struct, shutil
from Crypto.Cipher import AES

def decrypt_page(page_data, enc_key, page_no, page_size, reserve):
    """解密单个 page"""
    if page_no == 1:
        # 第1页: 前16字节是salt(明文), 后面才是加密数据
        salt = page_data[:16]
        encrypted = page_data[16:page_size - reserve]
        iv = page_data[page_size - reserve:page_size - reserve + 16]
    else:
        encrypted = page_data[:page_size - reserve]
        iv = page_data[page_size - reserve:page_size - reserve + 16]

    cipher = AES.new(enc_key, AES.MODE_CBC, iv)
    decrypted = cipher.decrypt(encrypted)

    if page_no == 1:
        # 拼回 SQLite 头: "SQLite format 3\0" + 解密内容 + reserve填零
        page = bytearray(b'SQLite format 3\x00' + decrypted + b'\x00' * reserve)
        # 清除 header offset 20 的 reserved-space 字段
        # 加密时该字段 = reserve size，解密后需要归零，否则 SQLite 误判 usable page size
        page[20] = 0
        return bytes(page)
    else:
        # Reserve 区填零（SQLite 不读取该区域，清零保持输出干净）
        return decrypted + b'\x00' * reserve


def verify_hmac_page1(page_data, enc_key, page_size, reserve):
    """验证第1页的 HMAC-SHA1 (SQLCipher 3)"""
    salt = page_data[:16]
    mac_salt = bytes([b ^ 0x3a for b in salt])
    mac_key = hashlib.pbkdf2_hmac('sha1', enc_key, mac_salt, 2, dklen=32)

    content = page_data[16:page_size - reserve]
    iv = page_data[page_size - reserve:page_size - reserve + 16]
    stored_hmac = page_data[page_size - reserve + 16:page_size - reserve + 36]

    msg = content + iv + struct.pack('<I', 1)
    calc_hmac = hmac.new(mac_key, msg, hashlib.sha1).digest()

    return calc_hmac == stored_hmac


def decrypt_db(db_path, raw_key_hex, output_path):
    """
    解密单个数据库文件
    自动尝试多种 SQLCipher 参数组合
    """
    raw_key = bytes.fromhex(raw_key_hex)

    with open(db_path, 'rb') as f:
        data = f.read()

    # 检查是否已经是 SQLite (未加密)
    if data[:15] == b'SQLite format 3':
        shutil.copy2(db_path, output_path)
        return 'unencrypted'

    salt = data[:16]

    # 尝试的参数组合: (page_size, use_pbkdf2, reserve)
    # SQLCipher 3 reserve = 48: IV(16) + HMAC-SHA1(20) + padding(12)
    configs = [
        (1024, False, 48),   # 大部分 DB
        (4096, False, 48),   # WebTemplate
        (1024, True,  48),   # FTS 索引
        (4096, True,  48),   # mediaData
    ]

    for page_size, use_pbkdf2, reserve in configs:
        if use_pbkdf2:
            enc_key = hashlib.pbkdf2_hmac('sha1', raw_key, salt, 64000, dklen=32)
        else:
            enc_key = raw_key

        if verify_hmac_page1(data, enc_key, page_size, reserve):
            # HMAC 验证通过，开始解密
            # 注意: 生产代码应对每一页都验证 HMAC，防止单页损坏/篡改
            # 后续页的 HMAC 计算方式相同，只是 content 从 offset 0 开始（无 salt），
            # 且 page_no 使用对应的页码（从 1 开始）
            num_pages = len(data) // page_size
            output = b''
            for i in range(num_pages):
                page = data[i * page_size:(i + 1) * page_size]
                output += decrypt_page(page, enc_key, i + 1, page_size, reserve)

            with open(output_path, 'wb') as f:
                f.write(output)

            mode = 'pbkdf2' if use_pbkdf2 else 'direct'
            return f'ok (page={page_size}, {mode})'

    return 'failed'
```

**依赖安装**: `pip3 install pycryptodome`

### 4.x 的解密差异

4.x 的代码逻辑相同，只需改参数：
- `reserve = 80`, HMAC 用 SHA512, `mac_key` 的 PBKDF2 也用 SHA512
- `verify_hmac` 中 `stored_hmac` 长度为 64 字节
- 4.x 中所有 DB 使用统一的参数（不像 3.x 那样混用多种配置）

---

## 五、新手操作清单

### 你需要准备什么

- [x] macOS 电脑，微信已登录
- [x] Python 3 + pycryptodome (`pip3 install pycryptodome`)
- [x] Frida (`pip3 install frida-tools`)
- [x] 管理员密码（sudo 权限）

### 一步步操作

```bash
# 1. 确认微信版本
ls ~/Library/Containers/com.tencent.xinWeChat/Data/Library/Application\ Support/com.tencent.xinWeChat/
# 如果看到 2.0b4.0.9 → 3.x 版本
# 如果看到其他 / Documents/xwechat_files → 4.x 版本

# 2. 找到你的账号目录
ls ~/Library/Containers/com.tencent.xinWeChat/Data/Library/Application\ Support/com.tencent.xinWeChat/2.0b4.0.9/
# 最大的那个目录就是你的主账号

# 3. 确认数据库是加密的
file ~/.../<account>/Message/msg_0.db
# 应该显示 "data" 而不是 "SQLite 3.x database"

# 4. 提取密钥 (必须在本机 Terminal!)
# 方法 A: 使用 C 工具（推荐，见本 repo 的 find_all_keys_macos.c）
cc -O2 -o find_all_keys_macos find_all_keys_macos.c -framework Foundation
sudo ./find_all_keys_macos
# 输出 all_keys.json，可直接用于解密

# 方法 B: 使用 Frida（需自行编写扫描脚本）
# sudo frida -p $(pgrep -x WeChat) -l your_scan_script.js

# 5. 运行解密（需配置 config.json 指向 db_storage 目录）
python3 decrypt_db.py

# 6. 验证
file decrypted/Message/msg_0.db
# 应该显示 "SQLite 3.x database"
sqlite3 decrypted/Message/msg_0.db "SELECT COUNT(*) FROM (SELECT name FROM sqlite_master WHERE type='table')"
```

### 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| Frida 报 "unable to access process" | SSH 下运行 / TCC 未授权 | 必须在本机 Terminal 运行 |
| 解密后文件打不开 | 参数不匹配 | 脚本会自动尝试4种配置 |
| 部分 DB 用不同密钥 | ChatSync.db 等特殊 DB | 非关键数据，可跳过 |
| "No module named Crypto" | 未安装 pycryptodome | `pip3 install pycryptodome` |
| 3.x 和 4.x 混用参数 | 版本判断错误 | 先确认微信版本号 |

---

## 六、总结对比

```
WeChat 3.x                          WeChat 4.x
──────────                          ──────────
SQLCipher 3                         SQLCipher 4
page 1024 (混用4096)                 page 4096 (统一)
HMAC-SHA1, reserve 48               HMAC-SHA512, reserve 80
KDF 64000 迭代                       KDF 256000 迭代
4种参数组合混用 (坑!)                  统一参数 (简单)
msg_0~msg_9.db                      message_0~message_5.db
Chat_<hash> 表名                     不同表结构
密钥提取方式相同: Frida dump 32字节    密钥提取方式相同
```

**核心经验**: 密钥提取是最难的一步（受 macOS TCC 限制），解密算法本身是确定的。3.x 比 4.x 更复杂，因为同一账号内的数据库使用了不同的加密参数组合。
