# 云服务器部署指南

## 概述

本指南详细说明如何在云服务器上部署MCP HTML服务器，并解决数字工作人连接问题。

## 部署步骤

### 1. 服务器准备

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node --version
npm --version
```

### 2. 项目部署

```bash
# 克隆项目
git clone <your-repo-url>
cd mcp-html

# 安装依赖
npm install

# 配置API密钥
cp config.production.json config.json
# 或者手动编辑config.json填入你的API密钥
```

### 3. 配置文件设置

确保 `config.json` 包含有效的API密钥：

```json
{
    "qwen": {
        "apiKey": "sk-your-actual-qwen-api-key",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "model": "qwen-vl-plus"
    },
    "glm4": {
        "apiKey": "your-actual-glm4-api-key",
        "baseUrl": "https://open.bigmodel.cn/api/paas/v4",
        "model": "glm-4"
    },
    "fallback": {
        "useOCR": true,
        "maxFileSize": 10485760
    }
}
```

### 4. 防火墙配置

```bash
# 开放80端口
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable

# 检查状态
sudo ufw status
```

### 5. 启动服务

#### 方式一：直接启动（测试用）

```bash
node index.js --http --port 80
```

#### 方式二：使用PM2（生产环境推荐）

```bash
# 安装PM2
npm install -g pm2

# 启动服务
pm2 start index.js --name "mcp-html-server" -- --http --port 80

# 设置开机自启
pm2 startup
pm2 save

# 查看状态
pm2 status
pm2 logs mcp-html-server
```

## 数字工作人配置

### MCP连接配置

在数字工作人的MCP配置中，使用以下设置：

```json
{
    "mcpServers": {
        "mcp-html-server": {
            "url": "http://your-server-ip:80/mcp"
        }
    }
}
```

**重要**: 确保使用 `/mcp` 端点，而不是根路径。

### 连接验证

```bash
# 测试MCP协议初始化
curl -X POST http://your-server-ip:80/mcp \
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

期望响应：
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {},
      "resources": {},
      "logging": {}
    },
    "serverInfo": {
      "name": "mcp-html-server",
      "version": "1.0.0"
    }
  }
}
```

## 常见问题解决

### 1. Docker构建超时问题 ⚠️

**问题描述**: Docker构建在npm安装阶段超时失败

**解决方案**:
1. **使用优化的Dockerfile**:
   ```bash
   cp Dockerfile.optimized Dockerfile
   ```

2. **增加构建超时时间**:
   - 在云平台设置构建超时为30分钟
   - 分配至少2GB内存给构建过程

3. **使用轻量版依赖**:
   ```bash
   cp package.lightweight.json package.json
   ```

4. **本地预构建镜像**:
   ```bash
   docker build -t your-registry/mcp-html:latest .
   docker push your-registry/mcp-html:latest
   ```

### 2. "Unknown method: initialize" 错误

**原因**: 旧版本代码不支持根路径的initialize方法

**解决方案**:
- 使用最新版本代码
- 确保数字工作人连接到 `/mcp` 端点

### 3. API调用失败

**检查步骤**:
```bash
# 检查配置文件
cat config.json

# 测试网络连接
curl -I https://dashscope.aliyuncs.com
curl -I https://open.bigmodel.cn

# 检查服务日志
pm2 logs mcp-html-server
```

### 3. 端口访问问题

```bash
# 检查端口监听
netstat -tlnp | grep :80

# 检查进程
ps aux | grep node

# 检查防火墙
sudo ufw status
```

### 4. 文档处理失败

**可能原因**:
- API密钥无效或过期
- 网络连接问题
- 文件大小超过限制

**解决方案**:
```bash
# 检查API密钥有效性
curl -H "Authorization: Bearer your-api-key" \
     https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation

# 调整文件大小限制
# 在config.json中修改 fallback.maxFileSize
```

## 监控和维护

### 日志查看

```bash
# PM2日志
pm2 logs mcp-html-server

# 实时日志
pm2 logs mcp-html-server --lines 100 -f
```

### 服务重启

```bash
# 重启服务
pm2 restart mcp-html-server

# 重新加载配置
pm2 reload mcp-html-server
```

### 性能监控

```bash
# 查看服务状态
pm2 monit

# 系统资源使用
top
htop
df -h
```

## 安全建议

1. **API密钥安全**:
   - 不要将API密钥提交到版本控制
   - 定期轮换API密钥
   - 使用环境变量存储敏感信息

2. **网络安全**:
   - 配置防火墙只开放必要端口
   - 使用HTTPS（推荐配置反向代理）
   - 定期更新系统和依赖

3. **访问控制**:
   - 限制MCP服务器的访问来源
   - 配置适当的CORS策略
   - 监控异常访问

## 故障排除清单

- [ ] Node.js版本 >= 20.0.0
- [ ] 所有依赖正确安装
- [ ] 配置文件包含有效API密钥
- [ ] 防火墙开放80端口
- [ ] 服务正在监听80端口
- [ ] 数字工作人使用正确的MCP端点URL
- [ ] 网络连接正常，可访问外部API
- [ ] 服务日志无错误信息

如果问题仍然存在，请检查服务器日志并联系技术支持。