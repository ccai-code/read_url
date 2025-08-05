# Docker部署问题修复说明

## 问题总结

本次部署失败主要涉及以下几个问题：
1. Node.js版本不兼容
2. Canvas包编译失败
3. 系统依赖缺失
4. npm配置错误

## 1. Node.js版本不兼容问题

### 问题描述
- `cheerio`、`eventsource-parser`、`undici`等包要求Node.js版本>=20.0.0
- 原Dockerfile使用的是Node.js 18版本

### 解决方案
- 将基础镜像从`node:18-alpine`升级到`node:20-alpine`

## 2. Canvas包编译失败

### 问题描述
- `node-gyp`构建`canvas`模块时未能找到Python安装
- 缺少必要的系统构建工具和库

### 解决方案
- 安装Python3、make、g++等构建工具
- 安装cairo-dev、jpeg-dev、pango-dev等系统库

## 3. 国内镜像源配置

### 配置内容
- Alpine Linux包管理使用阿里云镜像
- npm使用淘宝镜像源(registry.npmmirror.com)

## 4. npm配置错误修复

### 问题描述
- 部署日志显示: `npm error network-timeout is not a valid npm option`
- npm配置中使用了无效的选项导致构建失败

### 解决方案
- 简化npm配置，移除无效的`network-timeout`选项
- 使用标准的npm配置命令
- 清理了多余的部署文件

## 修改的文件

1. **Dockerfile**: 升级Node.js版本、添加构建依赖、配置国内镜像源
2. **package.json**: 更新cheerio版本到1.1.2
3. **清理文件**: 移除Jenkins相关的过时文件

## 验证步骤

1. 重新构建Docker镜像
2. 检查构建过程中是否还有错误
3. 验证应用是否能正常启动
4. 测试应用功能是否正常

## 5. 端口配置问题修复

### 问题描述
- 应用默认监听3000端口，但Dockerfile暴露80端口
- 健康检查失败：`dial tcp 10.9.12.110:80: connect: connection refused`
- 容器内应用无法在80端口响应请求

### 解决方案
- 修改Dockerfile启动命令，添加`--port 80`参数
- 确保应用在容器中监听正确的端口

### 修改内容
- **Dockerfile**: 启动命令改为`CMD ["node", "index.js", "--port", "80"]`

## 预期效果

- 解决Node.js版本兼容性问题
- 成功编译Canvas模块
- 加速依赖安装过程
- 消除npm配置错误
- 修复端口配置问题
- 确保健康检查通过
- 确保部署流程顺利完成