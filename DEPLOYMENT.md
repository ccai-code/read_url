# 部署指南

## 项目概述

这是一个MCP（Model Context Protocol）工具，专为AI助手设计，能够读取和分析各种类型的内容：

- 🌐 网页内容
- 🖼️ 图片文件（JPG、PNG、GIF等）
- 📄 文档文件（PDF、DOC、DOCX）
- 📊 表格文件（XLS、XLSX）
- 🎥 视频文件（MP4、AVI、MOV、MKV）

## 核心文件说明

### 主要文件
- `index.js` - 主服务器文件，包含所有核心功能
- `ai-services.js` - AI服务集成模块
- `logger.js` - 日志系统
- `config.json` - 配置文件（包含API密钥）

### 部署文件
- `Dockerfile` - Docker构建文件（已优化，包含健康检查）
- `docker-compose.yml` - Docker Compose配置
- `package.json` - Node.js依赖配置

### 文档文件
- `README.md` - 项目说明和使用指南
- `DOCKER_DEPLOYMENT_GUIDE.md` - Docker部署详细指南
- `test-health.js` - 健康检查测试脚本

## 推荐部署方式

### 方式1：Docker Compose（推荐）
```bash
docker-compose up -d --build
```

### 方式2：直接Docker
```bash
docker build -t mcp-html-server .
docker run -p 3000:3000 mcp-html-server
```

### 方式3：本地运行
```bash
npm install
node index.js --port 3000
```

## 验证部署

```bash
# 检查健康状态
curl http://localhost:3000/health

# 测试功能
node test-health.js
```

## 注意事项

1. **配置文件**：确保 `config.json` 中的API密钥有效
2. **端口配置**：默认使用3000端口，可通过 `--port` 参数修改
3. **日志目录**：Docker环境下日志保存在 `/app/logs`
4. **健康检查**：服务提供 `/health` 端点用于健康检查

## 功能测试

部署成功后，可以通过以下方式测试各种文件类型的读取：

```bash
# 测试网页读取
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"read_link","arguments":{"url":"https://example.com"}}}'

# 测试图片读取
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"read_link","arguments":{"url":"https://example.com/image.jpg"}}}'
```

所有功能已经完整实现并经过测试，可以直接用于生产环境。