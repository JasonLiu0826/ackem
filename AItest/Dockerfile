# ==============================================
# Qwen 大模型微调与 Ollama 推理 Dockerfile
# 基础镜像：NVIDIA CUDA 12.6 + cuDNN + Ubuntu 22.04
# ==============================================
FROM nvidia/cuda:12.6.0-cudnn-devel-ubuntu22.04

# 设置环境变量，避免交互式提示
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Asia/Shanghai
ENV LANG=C.UTF-8
ENV PYTHONUNBUFFERED=1

# 设置 Ollama 相关环境变量
ENV OLLAMA_HOST=0.0.0.0
ENV OLLAMA_PORT=11434
ENV OLLAMA_KEEP_ALIVE=10m
ENV OLLAMA_NUM_GPU_LAYERS=-1  # 自动使用所有 GPU 层

# ==============================================
# 第一阶段：系统基础与 CUDA 工具链
# ==============================================

# 更新系统并安装基础工具
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    git \
    vim \
    htop \
    net-tools \
    sudo \
    software-properties-common \
    build-essential \
    cmake \
    ninja-build \
    pkg-config \
    libprotobuf-dev \
    protobuf-compiler \
    libgoogle-glog-dev \
    libgomp1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libpython3-dev \
    python3-pip \
    python3-venv \
    python3-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 更新 pip 到最新版本
RUN python3 -m pip install --upgrade pip

# ==============================================
# 第二阶段：深度学习基础框架
# ==============================================

# 安装 PyTorch (CUDA 12.6 版本)
RUN pip3 install --no-cache-dir torch torchvision torchaudio \
    --index-url https://download.pytorch.org/whl/cu126

# 安装 Hugging Face 生态核心库（用于模型微调）
RUN pip3 install --no-cache-dir \
    transformers \
    datasets \
    accelerate \
    peft \
    trl \
    bitsandbytes \
    scipy \
    sentencepiece \
    tokenizers \
    tqdm \
    wandb \
    tensorboard \
    scikit-learn \
    pandas \
    numpy

# 安装优化库（Flash Attention - 提升训练速度）
RUN pip3 install --no-cache-dir flash-attn --no-build-isolation

# 安装模型量化与推理加速库
RUN pip3 install --no-cache-dir \
    optimum \
    auto-gptq \
    einops \
    xformers

# ==============================================
# 第三阶段：微调框架选择（二选一，此处安装 Unsloth）
# ==============================================

# 方案 A：安装 Unsloth 微调框架（推荐，速度快且内存效率高）
# Unsloth 需要从 GitHub 安装，指定 PyTorch 2.6.0 版本
RUN pip3 install --no-cache-dir \
    "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git" \
    --extra-index-url https://download.pytorch.org/whl/cu126

# 方案 B：如需使用 Axolotl 框架，取消下方注释
# RUN pip3 install --no-cache-dir packaging setuptools wheel ninja
# RUN pip3 install --no-build-isolation axolotl[flash-attn,deepspeed]

# 安装 DeepSpeed 分布式训练
RUN pip3 install --no-cache-dir deepspeed

# ==============================================
# 第四阶段：Ollama 大模型推理引擎安装
# ==============================================

# 下载 Ollama 二进制文件
RUN curl -fsSL https://ollama.com/install.sh | sh

# 创建 Ollama 服务目录
RUN mkdir -p /root/.ollama/models

# 暴露 Ollama 服务端口
EXPOSE 11434

# ==============================================
# 第五阶段：工作目录与用户配置
# ==============================================

# 创建工作目录
RUN mkdir -p /workspace/data /workspace/outputs /workspace/scripts

# 设置工作目录
WORKDIR /workspace

# 创建一个脚本，用于自动拉取 Qwen 模型
RUN echo '#!/bin/bash\n\
echo "正在拉取 Qwen2.5-7B-Instruct 模型..."\n\
ollama pull qwen2.5:7b-instruct-q4_K_M\n\
echo "模型下载完成！"\n\
echo "可使用以下命令运行模型："\n\
echo "ollama run qwen2.5:7b-instruct-q4_K_M"\n\
' > /usr/local/bin/pull_qwen.sh && chmod +x /usr/local/bin/pull_qwen.sh

# 创建训练启动脚本示例
RUN echo '#!/bin/bash\n\
echo "=== Qwen 微调训练环境就绪 ==="\n\
echo "GPU 信息："\n\
nvidia-smi --query-gpu=name,memory.total,compute_cap --format=csv\n\
echo ""\n\
echo "Ollama 服务正在启动..."\n\
ollama serve &\n\
sleep 5\n\
echo "Ollama 服务已启动在端口 11434"\n\
echo ""\n\
echo "模型列表："\n\
ollama list\n\
echo ""\n\
echo "=== 环境准备完成，开始训练 ==="\n\
bash\n\
' > /usr/local/bin/start_training.sh && chmod +x /usr/local/bin/start_training.sh

# 设置入口脚本
CMD ["/usr/local/bin/start_training.sh"]

# ==============================================
# 健康检查
# ==============================================
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:11434/api/tags || exit 1