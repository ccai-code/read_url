# 使用单阶段构建，简化构建过程
FROM node:20-alpine

# 设置工作目录
WORKDIR /app

# 更新Alpine包管理器源为阿里云镜像
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 安装系统依赖（合并安装减少层数）
RUN apk add --no-cache python3 py3-pip make g++ gcc libc-dev cairo-dev jpeg-dev pango-dev musl-dev giflib-dev pixman-dev pangomm-dev libjpeg-turbo-dev freetype-dev pkgconfig vips-dev libpng-dev

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=80
ENV npm_config_build_from_source=true
ENV PYTHON=/usr/bin/python3

# 复制package文件
COPY package*.json ./

# 配置npm（简化配置）
RUN npm config set registry https://registry.npmmirror.com && npm config set fetch-timeout 300000 && npm config set fetch-retries 3 && npm config set audit false && npm config set fund false

# 安装依赖（使用更简单的命令）
RUN npm install --production --no-audit --no-fund

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