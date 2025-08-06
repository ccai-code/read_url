# 简化部署方案

## 问题诊断

原始部署失败的根本原因：
1. **复杂原生依赖**：canvas、sharp、tesseract.js、pdf-parse等需要编译的原生模块
2. **构建超时**：npm install阶段因依赖复杂导致构建时间过长
3. **内存不足**：原生模块编译需要大量内存和CPU资源

## 解决方案

### 已移除的复杂依赖
- ❌ `canvas` - Canvas图形处理
- ❌ `sharp` - 图片处理和优化
- ❌ `tesseract.js` - OCR文字识别
- ❌ `pdf-parse` - PDF文档解析

### 保留的核心功能
- ✅ 网页内容抓取（cheerio）
- ✅ HTTP请求处理（axios）
- ✅ Word文档处理（mammoth）
- ✅ Excel文档处理（xlsx）
- ✅ AI服务集成（OpenAI SDK）
- ✅ MCP协议支持

## 部署配置

### 腾讯云CloudBase配置
```yaml
# 基本配置
内存: 2GB
CPU: 1核
端口: 80
构建超时: 600秒（10分钟）

# 环境变量
NODE_ENV=production
PORT=80
npm_config_registry=https://registry.npmmirror.com

# 构建命令
npm install --production --prefer-offline --no-optional

# 启动命令
node index.js
```

### 健康检查
- 路径: `/health`
- 间隔: 30秒
- 超时: 10秒
- 重试: 3次

## 功能说明

### 可用功能
1. **网页内容读取** - 支持HTML页面内容提取
2. **文档处理** - 支持Word(.docx)和Excel(.xlsx)文件
3. **AI内容分析** - 集成多个AI服务进行内容分析
4. **健康检查** - 提供服务状态监控

### 暂时禁用的功能
1. **PDF文档处理** - 返回提示信息，建议使用其他格式
2. **图片OCR识别** - 返回提示信息，建议提供文本内容
3. **图片处理** - 相关功能已禁用

## 部署步骤

1. **确认代码更新**
   - package.json已简化依赖
   - Dockerfile已优化
   - 代码已移除复杂依赖引用

2. **重新部署**
   - 使用代码仓库部署方式
   - 配置上述参数
   - 等待构建完成

3. **验证部署**
   ```bash
   # 健康检查
   curl https://your-domain/health
   
   # 测试基本功能
   curl -X POST https://your-domain/read_link \
     -H "Content-Type: application/json" \
     -d '{"url": "https://example.com"}'
   ```

## 预期结果

- ✅ 构建时间：3-5分钟（原来15-30分钟）
- ✅ 内存使用：<1GB（原来2-4GB）
- ✅ 启动时间：<30秒（原来1-2分钟）
- ✅ 核心功能：完全可用
- ⚠️ 高级功能：暂时禁用，可后续优化恢复

## 后续优化计划

1. **阶段性恢复功能**
   - 使用预编译的二进制包
   - 采用多阶段构建
   - 使用专门的图像处理服务

2. **性能优化**
   - 实现缓存机制
   - 优化内存使用
   - 提升响应速度

3. **功能扩展**
   - 支持更多文档格式
   - 增强AI分析能力
   - 提供更好的错误处理