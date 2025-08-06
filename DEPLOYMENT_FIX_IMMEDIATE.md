# 腾讯云CloudBase部署问题立即修复方案

## 问题诊断

根据部署日志分析：
- ✅ Docker镜像构建成功（535MB）
- ✅ 镜像推送到TCR成功
- ❌ **服务创建失败** - 这是核心问题

## 立即执行的修复步骤

### 步骤1：登录腾讯云控制台

1. 访问：https://console.cloud.tencent.com/tcb
2. 进入「云托管」→「服务管理」
3. 找到服务 `get-url`

### 步骤2：删除失败的服务（重要）

1. 点击 `get-url` 服务
2. 点击「删除服务」
3. 确认删除

### 步骤3：重新创建服务（关键配置）

1. 点击「新建服务」
2. 服务名称：`get-url`
3. **重要配置**：
   ```
   内存配置：2GB（必须，之前可能是1GB不够）
   CPU配置：1核（必须，之前可能是0.5核不够）
   端口：80
   最小副本数：1
   最大副本数：10
   ```

4. **环境变量**：
   ```
   NODE_ENV=production
   PORT=80
   ```

5. **健康检查配置**：
   ```
   检查路径：/health
   检查端口：80
   超时时间：30秒
   检查间隔：30秒
   健康阈值：2次
   不健康阈值：3次
   启动等待时间：60秒（重要！）
   ```

### 步骤4：部署代码

1. 选择「代码仓库」部署方式
2. 确认分支：`main`
3. 构建目录：`/`（根目录）
4. Dockerfile路径：`Dockerfile`
5. 点击「开始部署」

### 步骤5：监控部署过程

1. 在部署日志中关注以下关键点：
   - Docker镜像构建是否成功
   - 镜像推送是否成功
   - **服务创建是否成功**（之前失败的地方）
   - 健康检查是否通过

2. 如果再次失败，记录具体错误信息

## 可能的失败原因和解决方案

### 原因1：资源配置不足
- **解决**：确保内存2GB、CPU 1核
- **说明**：Node.js应用 + 图像处理库需要较多资源

### 原因2：健康检查超时
- **解决**：启动等待时间设为60秒
- **说明**：应用启动需要时间加载依赖

### 原因3：端口配置错误
- **解决**：确保端口设为80，与Dockerfile一致

### 原因4：环境变量缺失
- **解决**：必须设置NODE_ENV=production

## 验证部署成功

部署完成后，执行以下验证：

### 1. 健康检查
```bash
curl https://your-service-url/health
```
预期响应：`{"status":"ok","timestamp":"..."}`

### 2. MCP协议测试
```bash
curl -X POST https://your-service-url/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```
预期响应：包含tools列表的JSON

### 3. read_link功能测试
```bash
curl -X POST https://your-service-url/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"read_link","arguments":{"url":"https://www.baidu.com"}}}'
```
预期响应：包含网页内容和`isError: false`字段

## 如果问题仍然存在

### 检查清单：
- [ ] 服务配置：内存2GB、CPU 1核
- [ ] 环境变量：NODE_ENV=production, PORT=80
- [ ] 健康检查：路径/health，超时30秒，启动等待60秒
- [ ] 代码仓库：确认最新代码已推送
- [ ] Dockerfile：确认已优化（当前版本）

### 获取帮助：
如果按照以上步骤仍然失败，请：
1. 截图完整的部署日志
2. 记录具体的错误信息
3. 联系腾讯云技术支持

## 成功指标

- ✅ 服务状态显示「运行中」
- ✅ 健康检查显示「健康」
- ✅ 可以访问 /health 端点
- ✅ MCP协议响应正常
- ✅ read_link功能返回正确格式（包含isError字段）

---

**重要提醒**：删除并重新创建服务是解决配置问题的最直接方法。确保按照上述配置参数精确设置。