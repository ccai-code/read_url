# MCP HTML Server

一个基于 Model Context Protocol (MCP) 的智能文档处理工具，为AI助手提供强大的内容读取能力。

## 核心功能

- 🌐 **网页内容读取**：智能提取网页标题和主要内容
- 📄 **文档处理**：支持Word(DOC/DOCX)文档内容提取
- 📊 **表格处理**：支持Excel(XLS/XLSX)表格数据读取
- 🤖 **AI智能分析**：集成通义千问、GLM-4等AI模型进行内容分析
- 🔧 **MCP标准**：完全兼容Model Context Protocol规范

### 暂时禁用的功能（简化部署）
- ❌ **图片内容识别**：已禁用OCR功能
- ❌ **PDF文档处理**：已禁用PDF处理
- ❌ **视频文件分析**：已禁用视频处理

## 安装依赖

```bash
npm install
```

## 配置说明

### API密钥配置

1. **开发环境**: 复制 `config.json` 并填入你的API密钥
2. **生产环境**: 使用 `config.production.json` (已包含有效密钥)

```json
{
    "qwen": {
        "apiKey": "your-qwen-api-key-here",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "model": "qwen-vl-plus"
    },
    "glm4": {
        "apiKey": "your-glm4-api-key-here",
        "baseUrl": "https://open.bigmodel.cn/api/paas/v4",
        "model": "glm-4"
    },
    "fallback": {
        "useOCR": true,
        "maxFileSize": 10485760
    }
}
```

### 获取API密钥

- **通义千问**: 访问 [阿里云DashScope](https://dashscope.aliyuncs.com/) 获取API密钥
- **GLM-4**: 访问 [智谱AI开放平台](https://open.bigmodel.cn/) 获取API密钥

## 快速开始

### 1. 本地运行
```bash
# 安装依赖
npm install

# 启动服务（MCP模式）
node index.js

# 或启动HTTP服务（测试模式）
node index.js --port 3000
```

### 2. Docker部署（推荐）
```bash
# 使用Docker Compose
docker-compose up -d --build

# 或直接使用Docker
docker build -t mcp-html-server .
docker run -p 3000:3000 mcp-html-server
```

### 3. 使用示例
```bash
# 测试网页读取
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "read_link",
      "arguments": {
        "url": "https://example.com"
      }
    }
  }'
```

## 工具说明

### read_link

读取链接内容，自动识别链接类型并进行相应处理。

**参数：**
- `url` (string): 要读取的链接 URL

**支持的链接类型：**
- 网页链接：爬取网页内容，提取标题和主要文本
- 图片链接：使用 OCR 识别图片中的文字

## 故障排除

### MCP协议连接问题

如果在云服务器部署后，数字工作人无法处理网址、Word文档和Excel文档，可能是以下原因：

#### 1. MCP协议初始化失败

**问题现象**: 日志显示 `Unknown method: initialize` 错误

**解决方案**: 
- 确保使用最新版本的代码（已修复initialize方法处理）
- 数字工作人应连接到正确的MCP端点：`http://your-server:80/mcp`

#### 2. API密钥配置问题

**问题现象**: 文档处理失败，返回认证错误

**解决方案**:
```bash
# 检查配置文件是否正确
cat config.json
# 或使用生产环境配置
cp config.production.json config.json
```

#### 3. 网络连接问题

**问题现象**: 无法访问外部API或下载文件

**解决方案**:
- 检查服务器网络连接
- 确保防火墙允许出站HTTPS连接
- 检查API服务商的服务状态

#### 4. 端口访问问题

**问题现象**: 数字工作人无法连接到MCP服务器

**解决方案**:
```bash
# 检查端口是否正在监听
netstat -tlnp | grep :80
# 检查防火墙设置
sudo ufw status
```

### 配置验证

部署完成后，可以通过以下方式验证服务是否正常：

```bash
# 测试服务器响应
curl -X POST http://localhost:80/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {"name": "test-client", "version": "1.0.0"}
    }
  }'
```

**示例请求（HTTP 模式）：**

```json
{
  "method": "tools/call",
  "params": {
    "name": "read_link",
    "arguments": {
      "url": "https://example.com"
    }
  }
}
```

## 健康检查

```bash
node health-check.js
```

## 问题修复

### 图片链接读取问题

**问题描述：**
- 某些图片服务（如 Picsum Photos）返回 405 错误
- HEAD 请求不被某些服务支持
- 图片下载失败时的错误处理不完善

**解决方案：**
1. **多重请求策略**：先尝试 HEAD 请求，失败后使用 GET 请求
2. **渐进式降级**：如果 arraybuffer 请求失败，尝试普通 GET 请求
3. **更好的错误处理**：提供详细的错误信息和处理建议
4. **内容类型检测**：改进图片类型检测逻辑

## API 端点（HTTP 模式）

- `POST /` - 处理 MCP 请求
  - `tools/list` - 获取可用工具列表
  - `tools/call` - 调用指定工具

## 技术栈

- **@modelcontextprotocol/sdk**: MCP 协议实现
- **axios**: HTTP 请求处理
- **cheerio**: HTML 解析和内容提取
- **mammoth**: Word文档处理
- **xlsx**: Excel表格处理
- **openai**: AI服务集成
- **form-data**: 表单数据处理

### 已移除的依赖（简化部署）
- ❌ **tesseract.js**: OCR 文字识别
- ❌ **sharp**: 图片处理和优化
- ❌ **canvas**: 图形绘制和处理
- ❌ **pdf-parse**: PDF文档解析

## 注意事项

1. OCR 功能首次使用时会下载语言包，可能需要一些时间
2. 图片 OCR 支持中文简体和英文识别
3. 网页爬取会自动过滤脚本、样式等无关内容
4. 内容长度限制为 5000 字符，超出部分会被截断
5. 图片大小限制为 10MB，超出限制的图片会被拒绝

## 开发模式

```bash
npm run dev
```

使用 `--watch` 参数自动重启服务器。