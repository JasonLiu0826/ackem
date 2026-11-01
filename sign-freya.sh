#!/bin/bash
# Freya 打包后的分层 ad-hoc 签名
# Electron app 必须从内到外签：二进制 → framework → helper → 主 app
# 用 --deep 会跳过内层顺序，导致运行时 securityd 报 -67062
set -u

APP="${1:-dist/mac-arm64/Ackem.app}"
ENT="${2:-build/entitlements.mac.plist}"
FW="$APP/Contents/Frameworks"

echo "== 0. 清理旧签名 =="
rm -rf "$APP/Contents/_CodeSignature"

echo "== 1. 内嵌动态库与原生模块 =="
find "$APP" -type f \( -name "*.dylib" -o -name "*.so" -o -name "*.node" \) -print0 2>/dev/null \
  | while IFS= read -r -d '' f; do
      codesign --force --sign - "$f" >/dev/null 2>&1 && echo "  ✓ $(basename "$f")" || echo "  ✗ $(basename "$f")"
    done

echo "== 2. Frameworks（先内部可执行，再 framework 本体）=="
for fwk in "$FW"/*.framework; do
  [ -e "$fwk" ] || continue
  find "$fwk" -type f -perm +111 -print0 2>/dev/null \
    | while IFS= read -r -d '' b; do
        codesign --force --sign - "$b" >/dev/null 2>&1
      done
  codesign --force --sign - "$fwk" >/dev/null 2>&1 && echo "  ✓ $(basename "$fwk")" || echo "  ✗ $(basename "$fwk")"
done

echo "== 3. Helper apps =="
for h in "$FW"/*.app; do
  [ -e "$h" ] || continue
  for b in "$h/Contents/MacOS/"*; do
    [ -f "$b" ] && codesign --force --sign - --entitlements "$ENT" "$b" >/dev/null 2>&1
  done
  codesign --force --sign - --entitlements "$ENT" "$h" >/dev/null 2>&1 \
    && echo "  ✓ $(basename "$h")" || echo "  ✗ $(basename "$h")"
done

echo "== 4. 主 app =="
codesign --force --sign - --entitlements "$ENT" "$APP" >/dev/null 2>&1 \
  && echo "  ✓ Ackem.app" || echo "  ✗ Ackem.app"

echo "== 5. 校验 =="
if codesign --verify --deep --strict "$APP" 2>&1; then
  echo "  ✓ 深层校验通过"
else
  echo "  ✗ 校验失败"
fi

echo "== 6. 打印签名摘要 =="
codesign -dv "$APP" 2>&1 | grep -E "Identifier|Signature|TeamIdentifier|Candidate"
