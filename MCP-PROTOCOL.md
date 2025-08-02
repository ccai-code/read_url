# MCP协议支持文档

## 概述

本服务器现在支持完整的MCP (Model Context Protocol) 协议初始化握手流程，包括 `initialize` 和 `initialized` 消息处理。

## 端点

### 主要端点
- **根端点**: `http://localhost:3001/` - 传统MCP协议支持
- **MCP端点**: `http://localhost:3001/mcp` - 完整MCP协议支持，包括初始化握手

## MCP协议初始化流程

### 1. Initialize 请求

客户端发送初始化请求到 `/mcp` 端点：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {}
    },
    "clientInfo": {
      "name": "your-client",
      "version": "1.0.0"
    }
  }
}
```

服务器响应：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {},
      "logging": {}
    },
    "serverInfo": {
      "name": "mcp-html-server",
      "version": "1.0.0"
    }
  }
}
```

### 2. Initialized 通知

客户端发送初始化完成通知：

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/initialized",
  "params": {}
}
```

服务器响应：

```json
{
  "jsonrpc": "2.0",
  "id": null,
  "result": {}
}
```

## 工具调用

### 获取工具列表

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {}
}
```

### 调用工具

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "read_link",
    "arguments": {
      "url": "https://example.com"
    }
  }
}
```

## 可用工具

### read_link

读取网页内容或图片OCR识别

**参数**:
- `url` (string, required): 要读取的网页URL或图片URL

**功能**:
- 网页内容抓取和解析
- 图片OCR文字识别
- 自动检测内容类型

## 测试

运行测试脚本验证MCP协议功能：

```bash
node test-mcp-init.js
```

## 日志

服务器会记录以下MCP协议相关日志：
- `🤝 MCP Initialize request received` - 收到初始化请求
- `✅ MCP Initialized notification received` - 收到初始化完成通知

## 兼容性

- 支持MCP协议版本: `2024-11-05`
- 同时保持对传统端点的向后兼容
- 支持JSON-RPC 2.0格式