# 使用官方Node.js运行时作为基础镜像
FROM node:20-alpine

# 配置国内镜像源
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 安装构建依赖和系统库
RUN apk add --no-cache \
    python3 \
    py3-pip \
    make \
    g++ \
    gcc \
    libc-dev \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    musl-dev \
    giflib-dev \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev \
    pkgconfig \
    cairo-tools \
    pango-tools

# 设置工作目录
WORKDIR /app

# 设置环境变量以帮助原生模块编译
ENV PYTHON=/usr/bin/python3
ENV CANVAS_PREBUILT=false
ENV NODE_OPTIONS="--max-old-space-size=4096"

# 复制package.json和package-lock.json
COPY package*.json ./

# 设置npm配置和安装依赖
RUN npm config set registry https://registry.npmmirror.com && \
    npm config set fetch-timeout 600000 && \
    npm config set fetch-retry-mintimeout 10000 && \
    npm config set fetch-retry-maxtimeout 60000 && \
    npm config set audit false && \
    npm config set fund false && \
    npm config set progress false && \
    npm ci --omit=dev --no-audit --no-fund --verbose

# 复制应用代码
COPY . .

# 创建logs目录并设置权限
RUN mkdir -p /app/logs && chmod 755 /app/logs

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=80

# 验证关键文件存在
RUN ls -la /app/ && \
    ls -la /app/logger.js && \
    ls -la /app/ai-services.js && \
    node --check index.js

# 暴露端口
EXPOSE 80

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/health || exit 1

# 启动应用
CMD ["node", "index.js", "--port", "80"]