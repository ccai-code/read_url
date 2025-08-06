# Docker部署指南

## 部署问题修复说明

在添加日志系统后，我们修复了以下Docker部署问题：

### 1. 健康检查问题
- **问题**: Docker容器启动后健康检查失败，显示 `connection refused` 错误
- **解决方案**: 
  - 移除了端口占用检查逻辑（在Docker中可能误判）
  - 添加了 `/health` 和 `/healthz` 健康检查端点
  - 修改服务器监听地址为 `0.0.0.0`（而非 `localhost`）
  - 更新 `Dockerfile.fixed` 中的健康检查路径

### 2. 日志路径问题
- **问题**: `logger.js`使用相对路径`./logs`在Docker容器中可能导致权限或路径问题
- **解决方案**: 修改为根据环境变量自动选择路径
  - 生产环境(Docker): `/app/logs`
  - 开发环境: `./logs`

### 2. Docker卷映射冲突
- **问题**: `docker-compose.yml`中的`./logs:/app/logs`映射可能与容器内目录创建冲突
- **解决方案**: 改用Docker命名卷`logs_data:/app/logs`

### 3. 目录权限问题
- **问题**: 容器内logs目录可能没有正确的写入权限
- **解决方案**: 在Dockerfile中显式创建目录并设置权限

## 部署选项

### 使用Docker构建和运行
```bash
# 构建镜像
docker build -t mcp-html-server .

# 运行容器
docker run -p 3000:3000 mcp-html-server
```

### 使用Docker Compose（推荐）
```bash
# 构建并启动服务
docker-compose up --build

# 后台运行
docker-compose up -d --build
```

## 验证部署

### 1. 检查容器状态
```bash
docker ps
docker logs mcp-html-server
```

### 2. 检查健康状态
```bash
docker inspect mcp-html-server | grep Health
```

### 3. 测试健康检查
```bash
# 测试健康检查端点
curl http://localhost/health

# 或使用提供的测试脚本
node test-health.js
```

### 4. 测试服务
```bash
# 测试基本连接
curl http://localhost

# 测试MCP端点
curl -X POST http://localhost/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
```

### 4. 检查日志文件
```bash
# 进入容器检查日志
docker exec -it mcp-html-server ls -la /app/logs/
```

## 故障排除

### 常见问题

1. **容器启动失败**
   ```bash
   # 查看详细日志
   docker logs mcp-html-server
   
   # 进入容器调试
   docker run -it --rm mcp-html-server sh
   ```

2. **日志文件无法写入**
   ```bash
   # 检查目录权限
   docker exec mcp-html-server ls -la /app/logs/
   
   # 检查环境变量
   docker exec mcp-html-server env | grep NODE_ENV
   ```

3. **Canvas模块问题**
   - 使用`Dockerfile.nocanvas`进行轻量化部署
   - 或检查系统依赖是否正确安装

### 调试模式

启用详细日志：
```bash
docker run -d \
  --name mcp-html-server-debug \
  -p 80:80 \
  -e NODE_ENV=production \
  -e DEBUG=* \
  mcp-html-server
```

## 生产环境建议

1. **资源限制**
   ```yaml
   deploy:
     resources:
       limits:
         memory: 512M
         cpus: '0.5'
   ```

2. **重启策略**
   ```yaml
   restart: unless-stopped
   ```

3. **日志轮转**
   - 容器内已配置自动清理7天前的日志
   - 可通过环境变量调整保留天数

4. **监控**
   - 使用健康检查监控服务状态
   - 监控日志文件大小和磁盘使用

## 更新部署

```bash
# 停止现有容器
docker-compose down

# 拉取最新代码
git pull origin main

# 重新构建并启动
docker-compose up -d --build
```

---

**注意**: 确保在部署前测试所有功能，特别是图像处理和AI服务集成。