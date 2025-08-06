# 部署问题修复说明

## 问题描述

在云部署过程中，服务出现健康检查失败的问题：
```
Readiness probe failed: dial tcp 10.9.12.108:80: connect: connection refused
Liveness probe failed: dial tcp 10.9.12.108:80: connect: connection refused
```

## 问题根因

**端口不匹配问题**：
- Docker容器配置期望服务监听80端口
- 应用程序默认监听3000端口
- 导致健康检查无法连接到正确端口

## 解决方案

### 1. 修改应用默认端口

将应用程序默认端口从3000改为80：

```javascript
// 修改前
const port = process.env.PORT || (portIndex !== -1 ? parseInt(args[portIndex + 1]) : 3000);
async startHttpServer(port = 3000) {

// 修改后  
const port = process.env.PORT || (portIndex !== -1 ? parseInt(args[portIndex + 1]) : 80);
async startHttpServer(port = 80) {
```

### 2. 验证Docker配置

确认Docker配置正确：

**Dockerfile**:
```dockerfile
EXPOSE 80
CMD ["node", "index.js", "--port", "80"]
```

**docker-compose.yml**:
```yaml
ports:
  - "80:80"
```

### 3. 健康检查配置

**Dockerfile健康检查**:
```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/health || exit 1
```

**应用健康检查端点**:
```javascript
if (req.method === 'GET' && (req.url === '/health' || req.url === '/healthz')) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
  return;
}
```

## 修复验证

### 本地测试

1. **启动服务器**:
   ```bash
   node index.js
   ```

2. **验证端口监听**:
   ```bash
   curl http://localhost:80/health
   ```

3. **预期响应**:
   ```json
   {"status":"ok","timestamp":"2025-08-06T06:38:07.018Z"}
   ```

### Docker测试

1. **构建镜像**:
   ```bash
   docker build -t mcp-html-server .
   ```

2. **运行容器**:
   ```bash
   docker run -p 80:80 mcp-html-server
   ```

3. **验证健康检查**:
   ```bash
   curl http://localhost:80/health
   ```

## 部署建议

### 推荐部署方式

**使用Docker Compose**:
```bash
docker-compose up -d --build
```

### 云部署注意事项

1. **端口配置**: 确保云平台端口映射正确
2. **健康检查**: 配置适当的健康检查超时时间
3. **启动时间**: 设置足够的启动等待时间（建议40秒）
4. **资源限制**: 确保容器有足够的内存和CPU资源

## 问题预防

1. **统一端口配置**: 在所有配置文件中使用一致的端口设置
2. **本地测试**: 部署前在本地Docker环境中完整测试
3. **健康检查**: 确保健康检查端点简单可靠
4. **日志监控**: 部署后监控应用启动日志

## 相关文件

- `index.js` - 主应用文件（已修复端口配置）
- `Dockerfile` - Docker构建文件（端口80配置正确）
- `docker-compose.yml` - Docker Compose配置（端口映射正确）
- `config.production.json` - 生产环境配置（包含有效API密钥）

## 修复状态

✅ **已修复**: 端口不匹配问题  
✅ **已验证**: 本地健康检查正常  
✅ **已测试**: Docker容器启动成功  
🚀 **可部署**: 修复后的代码已准备好重新部署