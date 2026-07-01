.PHONY: setup build keys decrypt web export emoticons all status clean help

PYTHON ?= .venv/bin/python3
export SHELL := /bin/bash

help:
	@echo "WeChat Decrypt — Makefile"
	@echo ""
	@echo "  make setup    一键安装所有依赖 + 编译 + 初始配置"
	@echo "  make build    编译 macOS 密钥扫描器"
	@echo "  make keys     提取密钥（需要 root）"
	@echo "  make decrypt  提取密钥 + 解密全部数据库"
	@echo "  make web      启动 Web UI（实时消息监听）"
	@echo "  make export     解密 + 批量导出聊天记录"
	@echo "  make emoticons  导出收藏的表情包"
	@echo "  make all        从零到完成：setup → keys → decrypt → export"
	@echo "  make status   显示当前数据状态和磁盘用量"
	@echo "  make clean    交互式清理临时数据（解密库/导出/缓存）"
	@echo ""

setup:
	@bash setup.sh

build:
	cc -O2 -o find_all_keys_macos find_all_keys_macos.c -framework Foundation
	codesign -s - find_all_keys_macos

keys:
	sudo ./find_all_keys_macos

decrypt:
	$(PYTHON) main.py decrypt

web:
	$(PYTHON) main.py

export:
	$(PYTHON) main.py export

emoticons:
	$(PYTHON) main.py emoticons

all:
	$(PYTHON) main.py all

status:
	$(PYTHON) main.py status

clean:
	$(PYTHON) cleanup.py