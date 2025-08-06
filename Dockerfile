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
ENV NODE_OPTIONS="--max-old-space-size=6144"
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1
ENV SHARP_FORCE_GLOBAL_LIBVIPS=false
ENV npm_config_build_from_source=true
ENV npm_config_cache_max=0

# 复制package.json和package-lock.json
COPY package*.json ./

# 设置npm配置
RUN npm config set registry https://registry.npmmirror.com && \
    npm config set fetch-timeout 900000 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retries 5 && \
    npm config set audit false && \
    npm config set fund false && \
    npm config set progress false && \
    npm config set maxsockets 1

# 分阶段安装依赖 - 先安装关键的原生模块
RUN npm install --no-save canvas@3.1.2 --verbose --timeout=900000 || \
    (echo "First canvas install failed, retrying..." && sleep 10 && npm install --no-save canvas@3.1.2 --verbose --timeout=900000)

RUN npm install --no-save sharp@0.33.5 --verbose --timeout=900000 || \
    (echo "First sharp install failed, retrying..." && sleep 10 && npm install --no-save sharp@0.33.5 --verbose --timeout=900000)

# 安装其余依赖
RUN npm ci --omit=dev --no-audit --no-fund --verbose --timeout=900000 || \
    (echo "First npm ci failed, cleaning and retrying..." && \
     rm -rf node_modules package-lock.json && \
     npm install --omit=dev --no-audit --no-fund --verbose --timeout=900000)

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
    CMD node -e "const http = require('http'); const req = http.request({hostname: 'localhost', port: 80, path: '/health', timeout: 5000}, (res) => process.exit(res.statusCode === 200 ? 0 : 1)); req.on('error', () => process.exit(1)); req.end();"

# 启动应用
CMD ["node", "index.js", "--port", "80"]