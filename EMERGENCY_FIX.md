# 紧急修复方案

## 问题诊断

根据日志分析，问题出现在Docker构建的npm ci阶段：
- npm ci命令执行但被截断
- 可能是依赖安装超时或内存不足
- 腾讯云CloudBase构建环境资源限制

## 立即解决方案

### 方案1：使用预构建镜像（推荐）

1. **删除当前失败的服务**
   - 登录腾讯云控制台
   - 删除get-url服务

2. **使用镜像部署而非代码仓库部署**
   - 选择「镜像部署」
   - 镜像地址：`ccr.ccs.tencentyun.com/tcb-******-ofiy/ca-qgtxsdka_get-url:get-url-072-20250806213208`
   - 这个镜像已经构建成功（535MB）

3. **服务配置**
   ```
   服务名称：get-url
   内存：4096MB (4GB)
   CPU：2000m (2核)
   端口：80
   最小副本数：1
   最大副本数：10
   ```

4. **环境变量**
   ```
   NODE_ENV=production
   PORT=80
   ```

5. **健康检查**
   ```
   检查路径：/health
   检查端口：80
   超时时间：10秒
   启动等待时间：120秒
   检查间隔：30秒
   重试次数：3次
   ```

### 方案2：优化代码仓库部署

如果必须使用代码仓库部署：

1. **构建配置**
   ```
   构建命令：npm install --production --no-optional --registry=https://registry.npmmirror.com
   启动命令：node index.js
   构建超时：3600秒 (60分钟)
   构建内存：8GB
   构建CPU：4核
   ```

2. **环境变量**
   ```
   NODE_ENV=production
   PORT=80
   npm_config_registry=https://registry.npmmirror.com
   npm_config_fetch_timeout=600000
   npm_config_fetch_retries=5
   ```

## 执行步骤

### 立即执行（方案1）

1. 登录腾讯云控制台：https://console.cloud.tencent.com/tcb
2. 删除失败的get-url服务
3. 创建新服务，选择「镜像部署」
4. 使用已成功的镜像：`ccr.ccs.tencentyun.com/tcb-******-ofiy/ca-qgtxsdka_get-url:get-url-072-20250806213208`
5. 配置上述参数
6. 部署并等待启动

### 验证部署

部署成功后测试：
```bash
curl -X POST https://your-service-url/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "read_link",
      "arguments": {
        "url": "https://www.baidu.com"
      }
    }
  }'
```

预期响应：包含网页内容和`isError: false`字段

## 根本原因

1. **构建资源不足**：npm ci需要更多内存和时间
2. **依赖复杂性**：canvas、sharp等原生模块编译耗时
3. **网络超时**：依赖下载可能超时

## 长期优化

1. 使用多阶段构建减少最终镜像大小
2. 预编译原生依赖
3. 使用npm缓存
4. 优化依赖列表

---

**建议：立即使用方案1（预构建镜像），这是最快最可靠的解决方案。**