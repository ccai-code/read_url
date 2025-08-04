# MCP HTML服务器 - AI大模型集成指南

## 概述

本项目已升级为支持多种AI大模型的增强版MCP服务器，可以处理：
- 📄 网页内容抓取
- 🖼️ 图片内容识别（通义千问）
- 📋 PDF文档解析（火山引擎）
- 📝 Word文档解析（火山引擎）

## 功能特性

### 1. 图片处理
- **主要服务**: 阿里云通义千问 (qwen-vl-plus)
- **降级方案**: Tesseract OCR
- **支持格式**: JPG, PNG, GIF, BMP, WEBP, SVG等

### 2. 文档处理
- **主要服务**: 火山引擎大模型
- **支持格式**: PDF, DOC, DOCX, TXT
- **智能解析**: 保持原有格式和结构

### 3. 网页处理
- **技术**: Cheerio + Axios
- **功能**: 智能提取网页文本内容

## 配置步骤

### 1. 获取API密钥

#### 阿里云通义千问
1. 访问 [阿里云DashScope](https://dashscope.aliyun.com/)
2. 注册并实名认证
3. 创建API Key
4. 开通qwen-vl-plus模型权限

#### 火山引擎
1. 访问 [火山引擎控制台](https://console.volcengine.com/)
2. 注册并完成企业认证
3. 开通"机器学习平台"服务
4. 创建Access Key和Secret Key
5. 部署文档解析模型

### 2. 配置文件设置

编辑 `config.json` 文件：

```json
{
  "qwen": {
    "apiKey": "sk-your-qwen-api-key",
    "baseUrl": "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
    "model": "qwen-vl-plus"
  },
  "volcengine": {
    "accessKey": "your-volcengine-access-key",
    "secretKey": "your-volcengine-secret-key",
    "region": "cn-north-1",
    "baseUrl": "https://ark.cn-beijing.volces.com/api/v3",
    "model": "your-model-endpoint-id"
  },
  "fallback": {
    "useOCR": true,
    "maxFileSize": 10485760
  }
}
```

### 3. 安装依赖

```bash
npm install
```

### 4. 启动服务

```bash
npm start
```

## API调用示例

### 1. 图片识别

```javascript
// 基础图片识别
const result = await mcpClient.callTool('read_link', {
  url: 'https://example.com/image.jpg'
});

// 自定义提示词
const result = await mcpClient.callTool('read_link', {
  url: 'https://example.com/chart.png',
  prompt: '请分析这个图表中的数据趋势和关键指标'
});
```

### 2. PDF文档处理

```javascript
const result = await mcpClient.callTool('read_link', {
  url: 'https://example.com/document.pdf',
  prompt: '请提取文档中的关键信息并总结要点'
});
```

### 3. Word文档处理

```javascript
const result = await mcpClient.callTool('read_link', {
  url: 'https://example.com/report.docx',
  prompt: '请整理文档结构并提取重要内容'
});
```

## 错误处理和降级策略

### 1. 图片处理降级
- 通义千问API失败 → 自动降级到Tesseract OCR
- OCR失败 → 返回详细错误信息

### 2. 文档处理
- 火山引擎API失败 → 返回错误信息
- 文件格式不支持 → 尝试作为文本处理

### 3. 网络问题
- 连接超时：30秒
- 文件大小限制：10MB
- 自动重试机制

## 成本优化建议

### 1. API调用优化
- 图片压缩：自动调整到合适尺寸
- 缓存机制：避免重复处理相同内容
- 批量处理：减少API调用次数

### 2. 降级策略
- 小图片优先使用OCR
- 简单文档优先使用本地解析
- 设置每日调用限额

## 监控和日志

### 1. 日志级别
- INFO: 正常处理流程
- WARN: 降级处理
- ERROR: 处理失败

### 2. 性能监控
- API响应时间
- 成功率统计
- 成本追踪

## 故障排除

### 常见问题

1. **通义千问API调用失败**
   - 检查API Key是否正确
   - 确认账户余额充足
   - 验证模型权限

2. **火山引擎连接失败**
   - 检查Access Key和Secret Key
   - 确认模型端点ID正确
   - 验证网络连接

3. **文件下载失败**
   - 检查URL是否有效
   - 确认文件大小未超限
   - 验证网络权限

### 调试模式

启动调试模式：
```bash
DEBUG=true npm start
```

## 更新日志

### v2.0.0
- ✅ 集成阿里云通义千问图片识别
- ✅ 集成火山引擎文档处理
- ✅ 添加智能降级策略
- ✅ 优化错误处理机制
- ✅ 增加自定义提示词支持

## 技术支持

如有问题，请检查：
1. 配置文件格式是否正确
2. API密钥是否有效
3. 网络连接是否正常
4. 日志输出中的错误信息