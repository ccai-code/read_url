# 多阶段构建 - 构建阶段
FROM node:20-alpine AS builder

# 配置国内镜像源
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 安装构建依赖（包含canvas所需的完整依赖）
RUN apk add --no-cache \
    python3 py3-pip make g++ gcc libc-dev \
    cairo-dev jpeg-dev pango-dev musl-dev \
    giflib-dev pixman-dev pangomm-dev \
    libjpeg-turbo-dev freetype-dev pkgconfig \
    vips-dev libpng-dev

# 设置工作目录
WORKDIR /app

# 设置环境变量
ENV PYTHON=/usr/bin/python3
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV npm_config_build_from_source=true
ENV npm_config_cache=/tmp/.npm
ENV CANVAS_PREBUILT=false
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1

# 复制package文件
COPY package*.json ./

# 优化npm配置 - 减少超时时间，提高并发
RUN npm config set registry https://registry.npmmirror.com && \
    npm config set fetch-timeout 300000 && \
    npm config set fetch-retry-mintimeout 5000 && \
    npm config set fetch-retry-maxtimeout 30000 && \
    npm config set fetch-retries 3 && \
    npm config set audit false && \
    npm config set fund false && \
    npm config set progress false && \
    npm config set maxsockets 5

# 清理npm和node-gyp缓存，避免构建冲突
RUN npm cache clean --force && \
    rm -rf /root/.cache/node-gyp && \
    rm -rf /root/.npm

# 安装依赖 - 确保sharp和canvas平台依赖正确安装
RUN npm ci --omit=dev --no-audit --no-fund --prefer-offline

# 生产阶段 - 最小化镜像
FROM node:20-alpine AS production

# 配置国内镜像源
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 只安装运行时依赖（包含sharp所需的vips库）
RUN apk add --no-cache \
    cairo pango jpeg giflib pixman \
    libjpeg-turbo freetype vips-dev

# 设置工作目录
WORKDIR /app

# 从构建阶段复制node_modules
COPY --from=builder /app/node_modules ./node_modules

# 复制应用代码
COPY . .

# 创建logs目录
RUN mkdir -p /app/logs && chmod 755 /app/logs

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=80
ENV NODE_OPTIONS="--max-old-space-size=2048"
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1
ENV SHARP_FORCE_GLOBAL_LIBVIPS=false

# 验证关键文件
RUN node --check index.js

# 暴露端口
EXPOSE 80

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "const http = require('http'); const req = http.request({hostname: 'localhost', port: 80, path: '/health', timeout: 5000}, (res) => process.exit(res.statusCode === 200 ? 0 : 1)); req.on('error', () => process.exit(1)); req.end();"

# 启动应用
CMD ["node", "index.js", "--port", "80"]