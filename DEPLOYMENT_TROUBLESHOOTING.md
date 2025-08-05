# 部署故障排除指南

## 问题分析

根据部署日志分析，主要问题是Docker构建在npm安装阶段超时失败。

### 失败原因

1. **构建超时**: npm安装原生依赖（如canvas）时间过长
2. **网络问题**: 下载依赖包时网络不稳定
3. **资源限制**: 云服务器资源不足导致编译失败
4. **依赖复杂**: canvas等原生模块需要编译C++代码

## 解决方案

### 方案1: 使用无Canvas版本（推荐）

针对canvas依赖构建超时问题，我们提供了无canvas版本：

```bash
# 使用无canvas版本构建（最快）
docker build -f Dockerfile.nocanvas -t mcp-html-reader .
```

### 方案2: 使用优化的Dockerfile

使用多阶段构建的优化版本：

```bash
# 使用优化的Dockerfile
cp Dockerfile.optimized Dockerfile
```

### 方案2: 增加构建超时时间

如果使用云服务平台，在构建配置中增加超时时间：
- 构建超时：30分钟
- 内存限制：2GB以上

### 方案3: 预构建镜像

在本地构建镜像并推送到镜像仓库：

```bash
# 本地构建
docker build -t your-registry/mcp-html:latest .

# 推送到镜像仓库
docker push your-registry/mcp-html:latest
```

### 方案4: 简化依赖

创建一个不包含canvas的轻量版本：

```bash
# 移除canvas依赖
npm uninstall canvas

# 在代码中添加条件判断
if (process.env.ENABLE_CANVAS !== 'false') {
  // canvas相关功能
}
```

## 具体修复步骤

### 步骤1: 更新Dockerfile

已优化的Dockerfile包含以下改进：
- 增加npm超时配置
- 使用多阶段构建
- 减少最终镜像大小
- 优化依赖安装过程

### 步骤2: 更新.dockerignore

已添加更多忽略文件，减少构建上下文：
- 文档文件
- 测试文件
- 配置文件
- 日志文件

### 步骤3: 环境变量配置

在云服务器上设置环境变量：

```bash
# 设置npm配置
export NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
export NPM_CONFIG_FETCH_TIMEOUT=600000
export NPM_CONFIG_MAXSOCKETS=1
```

### 步骤4: 重新部署

```bash
# 提交更改
git add .
git commit -m "优化Docker构建配置，解决部署超时问题"
git push origin main

# 在云平台重新触发部署
```

## 监控和验证

### 构建日志检查

关注以下关键信息：
- npm安装进度
- 原生模块编译状态
- 内存使用情况
- 网络连接状态

### 成功标志

构建成功的标志：
```
✅ npm ci completed successfully
✅ All dependencies installed
✅ Docker image built successfully
✅ Container started successfully
```

## 备用方案

### 方案A: 使用预构建基础镜像

```dockerfile
# 使用包含编译工具的基础镜像
FROM node:20-alpine

# 预安装常用原生依赖
RUN apk add --no-cache python3 make g++ cairo-dev jpeg-dev pango-dev
```

### 方案B: 分离原生依赖

将canvas等原生依赖作为可选功能：

```javascript
// 条件加载原生依赖
let canvas;
try {
  canvas = await import('canvas');
} catch (error) {
  console.log('Canvas not available, image processing disabled');
}
```

### 方案C: 使用Docker Compose

```yaml
version: '3.8'
services:
  mcp-server:
    build:
      context: .
      dockerfile: Dockerfile.optimized
    environment:
      - NODE_ENV=production
    ports:
      - "80:80"
    restart: unless-stopped
```

## 性能优化建议

1. **使用npm ci替代npm install**
2. **启用npm缓存**
3. **使用多阶段构建**
4. **减少镜像层数**
5. **优化依赖安装顺序**

## 常见错误和解决方法

### 错误1: npm install超时
```bash
# 解决方法：增加超时时间
npm config set fetch-timeout 600000
```

### 错误2: 原生模块编译失败
```bash
# 解决方法：安装编译依赖
apk add python3 make g++
```

### 错误3: 内存不足
```bash
# 解决方法：增加swap空间或升级服务器配置
```

### 错误4: 网络连接问题
```bash
# 解决方法：使用国内镜像源
npm config set registry https://registry.npmmirror.com
```

## 联系支持

如果问题仍然存在，请提供：
1. 完整的构建日志
2. 服务器配置信息
3. 网络环境描述
4. 错误截图

通过这些优化措施，应该能够解决Docker构建超时的问题。