# Docker部署指南

## 部署问题修复说明

在添加日志系统后，我们修复了以下Docker部署问题：

### 1. 日志路径问题
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

### 选项1: 使用标准Dockerfile（推荐）
```bash
# 构建镜像
docker build -t mcp-html-server .

# 使用docker-compose启动
docker-compose up -d
```

### 选项2: 使用优化的Dockerfile.fixed
```bash
# 构建镜像
docker build -f Dockerfile.fixed -t mcp-html-server .

# 手动运行容器
docker run -d \
  --name mcp-html-server \
  -p 80:80 \
  -e NODE_ENV=production \
  -v mcp_logs:/app/logs \
  mcp-html-server
```

### 选项3: 无Canvas版本（轻量化）
如果遇到Canvas相关的构建问题：
```bash
# 使用无Canvas版本
docker build -f Dockerfile.nocanvas -t mcp-html-server-lite .
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

### 3. 测试服务
```bash
curl http://localhost/health
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