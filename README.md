# MCP HTML Server

一个基于 Model Context Protocol (MCP) 的 Node.js 服务器，支持网页内容爬取和图片 OCR 识别。

## 功能特性

- 🌐 **网页爬取**：自动提取网页标题和主要内容
- 🖼️ **图片 OCR**：使用 Tesseract.js 识别图片中的文字（支持中英文）
- 🔧 **MCP 兼容**：严格按照 @modelcontextprotocol/sdk 规范实现
- 🚀 **多种传输方式**：支持 stdio 和 HTTP 传输
- 📝 **智能内容提取**：自动识别并提取网页主要内容区域
- 🛡️ **错误处理**：完善的错误处理和重试机制

## 安装依赖

```bash
npm install
```

## 使用方法

### 1. Stdio 模式（默认）

```bash
npm start
```

### 2. HTTP 服务器模式

```bash
node index.js --http --port 3000
```

## 工具说明

### read_link

读取链接内容，自动识别链接类型并进行相应处理。

**参数：**
- `url` (string): 要读取的链接 URL

**支持的链接类型：**
- 网页链接：爬取网页内容，提取标题和主要文本
- 图片链接：使用 OCR 识别图片中的文字

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

## 测试

### 运行基本测试
```bash
npm test
```

### 运行图片链接测试
```bash
npm run test-image
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
- **tesseract.js**: OCR 文字识别
- **sharp**: 图片处理和优化

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