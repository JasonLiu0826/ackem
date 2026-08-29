# Britney Android

Android 客户端应用，基于 WebView 架构，支持热更新和原生能力桥接。

## 项目规格

- **包名**: `com.britney.android`
- **最低 SDK**: Android 12 (API 31)
- **目标 SDK**: 35 (Android 15)
- **语言**: Kotlin
- **构建系统**: Gradle (Kotlin DSL)

## 架构概览

```
britney-android/
├── app/
│   ├── src/main/
│   │   ├── java/com/britney/android/
│   │   │   ├── MainActivity.kt          # 主 Activity，WebView 容器
│   │   │   ├── BritneyWebViewClient.kt  # 热更新资源拦截
│   │   │   ├── bridge/
│   │   │   │   └── BritneyJSBridge.kt   # JS ↔ Native 桥接
│   │   │   ├── llm/
│   │   │   │   ├── LlmClient.kt        # LLM API 客户端
│   │   │   │   └── AgnesImageClient.kt  # 图片生成
│   │   │   ├── tts/
│   │   │   │   └── MimoTtsClient.kt    # TTS 语音合成
│   │   │   ├── db/
│   │   │   │   ├── BritneyDbHelper.kt   # SQLite 数据库
│   │   │   │   ├── ChatHistoryRepo.kt   # 聊天历史
│   │   │   │   ├── MemoryFactsRepo.kt   # 记忆事实
│   │   │   │   └── EmbeddingRepo.kt     # 向量存储
│   │   │   ├── embedding/
│   │   │   │   ├── EmbeddingEngine.kt   # ONNX Runtime 嵌入引擎
│   │   │   │   └── VectorSearcher.kt    # 向量相似度搜索
│   │   │   ├── sync/
│   │   │   │   ├── SyncClient.kt        # 同步客户端
│   │   │   │   ├── SyncWorker.kt        # WorkManager 后台同步
│   │   │   │   └── PairingManager.kt    # 设备配对管理
│   │   │   ├── security/
│   │   │   │   └── SecureKeyStore.kt    # 加密存储
│   │   │   └── update/
│   │   │       └── HotUpdateManager.kt  # 热更新管理
│   │   └── res/
│   │       └── values/
│   │           ├── strings.xml
│   │           ├── colors.xml
│   │           └── themes.xml
│   └── build.gradle.kts
├── gradle/
│   └── wrapper/
│       └── gradle-wrapper.properties
├── build.gradle.kts
├── settings.gradle.kts
├── gradle.properties
├── local.properties
├── gradlew
├── gradlew.bat
└── .gitignore
```

## 核心功能

### 1. WebView 架构
- 前端使用 WebView 加载 HTML/JS/CSS
- 支持热更新，无需重新安装 APK
- JavaScript 与原生代码双向通信

### 2. JS Bridge 接口

前端可通过 `window.britneyBridge` 调用以下方法：

#### LLM 聊天
```javascript
// 非流式
britneyBridge.chatCompletion(paramsJson, callbackId)

// 流式
britneyBridge.chatCompletionStream(paramsJson, streamId)
```

#### 图片生成
```javascript
britneyBridge.generateImage(prompt, size, callbackId)
```

#### TTS 语音
```javascript
britneyBridge.synthesizeSpeech(text, optionsJson, callbackId)
britneyBridge.stopSpeech()
```

#### 数据库操作
```javascript
britneyBridge.dbInsert(table, valuesJson)
britneyBridge.dbQuery(table, queryJson)
britneyBridge.dbUpdate(table, valuesJson, whereJson)
britneyBridge.dbDelete(table, whereJson)
```

#### 向量搜索
```javascript
britneyBridge.embeddingEncode(text, callbackId)
britneyBridge.vectorSearch(query, topK, callbackId)
```

#### 数据同步
```javascript
britneyBridge.syncPull(sinceTimestamp, callbackId)
britneyBridge.syncPush(changesJson, callbackId)
britneyBridge.syncPair(pairCode, callbackId)
```

#### 文件操作
```javascript
britneyBridge.saveImageBase64(base64, filename)
britneyBridge.loadImageBase64(path)
```

#### 设置
```javascript
britneyBridge.getSettings()
britneyBridge.saveSettings(settingsJson)
```

#### 平台信息
```javascript
britneyBridge.getPlatform()      // "android"
britneyBridge.getAppVersion()    // "1.0.0"
britneyBridge.getDeviceInfo()    // {platform, deviceId, deviceName}
```

### 3. 热更新机制

- 前端资源打包为 ZIP 下载到 `files/web_update/`
- WebView 拦截 `file:///android_asset/web/` 请求
- 优先从 `web_update/` 目录加载更新后的文件
- 支持版本检查和增量更新

### 4. 数据同步

- 使用 WorkManager 实现后台定期同步
- 支持 PC ↔ Android 双向数据同步
- 设备配对机制（6位配对码）
- 冲突解决策略（待实现）

### 5. 安全存储

- 使用 EncryptedSharedPreferences 存储敏感信息
- API Key、设备凭证加密存储
- 支持多套 API Key（MiMo、Agnes）

## 依赖库

| 库 | 版本 | 用途 |
|---|---|---|
| AndroidX Core | 1.12.0 | 基础组件 |
| AppCompat | 1.6.1 | 向后兼容 |
| Material | 1.11.0 | Material Design |
| WebKit | 1.9.0 | WebView 增强 |
| OkHttp | 4.12.0 | HTTP 客户端 |
| OkHttp SSE | 4.12.0 | 流式传输 |
| ONNX Runtime | 1.17.0 | 本地嵌入模型 |
| WorkManager | 2.9.0 | 后台任务 |
| Security Crypto | 1.1.0-alpha06 | 加密存储 |
| SQLite KTX | 2.4.0 | 数据库 |

## 开发环境

### 前置条件
- Android Studio Hedgehog (2023.1.1) 或更高版本
- JDK 17
- Android SDK 35

### 构建命令
```bash
# Debug 构建
./gradlew assembleDebug

# Release 构建
./gradlew assembleRelease

# 安装到设备
./gradlew installDebug
```

### 代码检查
```bash
# Lint 检查
./gradlew lint

# 格式化
./gradlew ktlintFormat
```

## 待实现功能

- [ ] LLM API Key 配置 UI
- [ ] 完整的 Tokenizer 实现
- [ ] ONNX 模型下载和初始化
- [ ] 数据同步冲突解决
- [ ] 离线模式支持
- [ ] 推送通知
- [ ] 深色模式适配
- [ ] 多语言支持
- [ ] 性能监控和崩溃上报

## 注意事项

1. **API Key 安全**: 所有 API Key 必须通过 EncryptedSharedPreferences 存储
2. **网络权限**: 应用需要 INTERNET 权限进行 API 调用和数据同步
3. **存储权限**: 热更新文件存储在应用私有目录，无需额外存储权限
4. **WebView 安全**: 禁用 `usesCleartextTraffic`，仅允许 HTTPS
5. **ProGuard**: Release 构建启用混淆，保留 JavascriptInterface 方法

## 联系方式

- 项目主页: https://github.com/your-repo/britney-android
- 问题反馈: https://github.com/your-repo/britney-android/issues
