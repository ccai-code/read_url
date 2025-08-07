# 使用更轻量级的基础镜像
FROM node:20-alpine

# 设置工作目录
WORKDIR /app

# 更新Alpine包管理器源
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 只安装Node.js运行时需要的最基本依赖
RUN apk add --no-cache python3 make g++
RUN npm install pdfjs-dist

# 设置环境变量（优化npm安装）
ENV NODE_ENV=production
ENV PORT=80
ENV npm_config_registry=https://registry.npmmirror.com
ENV npm_config_cache=/tmp/.npm
ENV npm_config_prefer_offline=true
ENV npm_config_no_audit=true
ENV npm_config_no_fund=true
ENV npm_config_maxsockets=1
ENV npm_config_network_timeout=600000

# 复制package文件
COPY package*.json ./

# 一步完成npm配置和安装（减少层数和时间）
RUN npm install --production --prefer-offline --no-optional --ignore-scripts

# 复制应用代码
COPY . .

# 创建必要的目录
RUN mkdir -p logs temp

# 暴露端口
EXPOSE 80

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 CMD node -e "const http = require('http'); const req = http.request({hostname: 'localhost', port: 80, path: '/health', timeout: 8000}, (res) => process.exit(res.statusCode === 200 ? 0 : 1)); req.on('error', () => process.exit(1)); req.end();"

# 启动应用
CMD ["node", "index.js"]