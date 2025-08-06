# 云服务器部署指南

## 问题分析

根据日志分析，发现以下问题：

1. **本地服务器已修复**：本地测试显示AI兼容性修复已成功，响应格式完全符合MCP协议
2. **云服务器代码未更新**：云服务器 `get-url-171895-8-1256349444.sh.run.tcloudbase.com` 上的代码还是旧版本
3. **AI客户端连接云服务器**：Claude AI正在连接云服务器，而不是本地服务器

## 解决方案

### 方案1：更新云服务器代码（推荐）

1. **上传修复后的文件到云服务器**
   ```bash
   # 需要上传的关键文件：
   - index.js (包含AI兼容性修复)
   - health-check.js (如果有修改)
   - package.json (确保依赖正确)
   ```

2. **重启云服务器服务**
   ```bash
   # 在云服务器上执行
   npm install  # 如果有新依赖
   pm2 restart all  # 或者其他重启命令
   ```

### 方案2：验证修复内容

**关键修复点检查清单：**

1. **index.js 第782行** - 移除JSON.stringify包装
   ```javascript
   // 修复前（错误）：
   result: JSON.stringify({ content: [...], isError: false })
   
   // 修复后（正确）：
   result: { content: [...], isError: false }
   ```

2. **index.js 第853行** - 移除JSON.stringify包装
   ```javascript
   // 修复前（错误）：
   result: JSON.stringify({ content: [...], isError: false })
   
   // 修复后（正确）：
   result: { content: [...], isError: false }
   ```

3. **所有错误处理** - 添加isError字段
   ```javascript
   // 确保所有错误响应都包含：
   result: {
     content: [{ type: 'text', text: '错误信息' }],
     isError: true
   }
   ```

### 方案3：本地测试验证

运行以下命令验证本地修复是否正确：
```bash
node debug-response.js
```

预期输出应该包含：
- ✅ result类型: object
- ✅ 是否有content字段: true
- ✅ 是否有isError字段: true
- ✅ content是否为数组: true

## 部署步骤

### 腾讯云CloudBase部署

1. **使用CloudBase CLI**
   ```bash
   # 安装CLI
   npm install -g @cloudbase/cli
   
   # 登录
   tcb login
   
   # 部署
   tcb functions:deploy
   ```

2. **手动上传文件**
   - 登录腾讯云控制台
   - 进入CloudBase函数管理
   - 上传修复后的index.js文件
   - 重启函数

3. **验证部署**
   ```bash
   # 测试云服务器响应
   curl -X POST https://get-url-171895-8-1256349444.sh.run.tcloudbase.com/mcp \
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

## 验证修复成功

修复成功后，AI客户端应该能够：
1. 正确解析MCP响应
2. 获取网页内容
3. 不再出现JSON解析错误

## 注意事项

1. **备份原文件**：部署前备份云服务器上的原文件
2. **测试环境**：建议先在测试环境验证
3. **监控日志**：部署后监控云服务器日志确认修复生效
4. **版本控制**：确保云服务器代码与本地代码版本一致

## 联系支持

如果部署过程中遇到问题，请提供：
- 云服务器错误日志
- 部署步骤详情
- 具体错误信息