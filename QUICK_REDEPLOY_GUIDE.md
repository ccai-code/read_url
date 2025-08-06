# 云服务器快速重新部署指南

## 🚀 GitHub代码已更新

✅ **最新代码已推送到GitHub仓库**: `https://github.com/ccai-code/read_url.git`

包含的修复内容：
- AI兼容性修复（移除JSON.stringify包装）
- 添加isError字段支持
- 完整的MCP协议合规性
- 详细的部署和故障排查文档

## 📋 云服务器重新部署步骤

### 方案1：腾讯云CloudBase重新部署

1. **登录腾讯云控制台**
   - 进入CloudBase控制台
   - 选择对应的环境和函数

2. **更新代码**
   ```bash
   # 方式A：通过Git拉取最新代码
   git pull origin main
   
   # 方式B：重新上传代码包
   # 下载GitHub最新代码 -> 打包 -> 上传
   ```

3. **重启函数**
   - 在CloudBase控制台重启函数
   - 或使用CLI命令：`tcb functions:deploy`

### 方案2：Docker重新部署

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 重新构建镜像
docker build -t mcp-html-server .

# 3. 停止旧容器
docker stop mcp-html-container
docker rm mcp-html-container

# 4. 启动新容器
docker run -d --name mcp-html-container -p 80:80 mcp-html-server
```

### 方案3：直接文件替换

**关键文件列表：**
- `index.js` (主要修复文件)
- `health-check.js`
- `package.json`
- `AI_COMPATIBILITY_FIX_REPORT.md`

**替换步骤：**
1. 备份云服务器上的原文件
2. 从GitHub下载最新文件
3. 替换云服务器上的对应文件
4. 重启服务

## 🔍 部署验证

### 验证命令
```bash
# 测试云服务器响应格式
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

### 预期结果
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "网页内容..."
      }
    ],
    "isError": false
  }
}
```

**关键检查点：**
- ✅ `result`是对象类型（不是字符串）
- ✅ 包含`content`数组
- ✅ 包含`isError`字段
- ✅ 无JSON.stringify包装

## ⚠️ 常见部署问题

### 问题1：权限不足
```bash
# 解决方案：使用sudo或管理员权限
sudo systemctl restart your-service
```

### 问题2：端口占用
```bash
# 查找占用进程
lsof -i :80
# 或
netstat -tulpn | grep :80

# 停止占用进程
kill -9 <PID>
```

### 问题3：依赖缺失
```bash
# 重新安装依赖
npm install
# 或
npm ci
```

## 📊 部署后监控

1. **检查服务状态**
   ```bash
   # 检查进程
   ps aux | grep node
   
   # 检查端口
   netstat -tulpn | grep :80
   ```

2. **监控日志**
   ```bash
   # 实时查看日志
   tail -f logs/mcp-*.log
   ```

3. **测试AI兼容性**
   - 让AI客户端重新连接
   - 测试read_link工具调用
   - 验证响应格式正确

## 🎯 成功标志

部署成功后：
- ✅ 云服务器响应格式正确
- ✅ AI客户端不再报JSON解析错误
- ✅ read_link工具正常工作
- ✅ 网页内容正确返回

## 📞 技术支持

如果重新部署后仍有问题：
1. 检查云服务器日志
2. 验证代码版本是否最新
3. 确认AI客户端已重新连接
4. 参考 `TROUBLESHOOTING_GUIDE.md`

---

**GitHub仓库**: https://github.com/ccai-code/read_url.git  
**最后更新**: 2025-08-06  
**状态**: 准备重新部署 🚀