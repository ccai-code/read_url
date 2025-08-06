# 使用Alpine Linux作为基础镜像
FROM node:20-alpine AS builder

# 配置国内镜像源
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 设置工作目录
WORKDIR /app

# 安装必要的系统依赖（优化版本）
RUN apk add --no-cache \
    python3 py3-pip make g++ gcc libc-dev \
    cairo-dev jpeg-dev pango-dev musl-dev giflib-dev \
    pixman-dev pangomm-dev \
    libjpeg-turbo-dev freetype-dev pkgconfig \
    vips-dev libpng-dev

# 设置环境变量
ENV npm_config_build_from_source=true
ENV npm_config_cache=/tmp/.npm

# 复制package文件
COPY package*.json ./

# 优化npm配置 - 增加超时时间，提高稳定性
RUN npm config set registry https://registry.npmmirror.com && \
    npm config set fetch-timeout 600000 && \
    npm config set fetch-retry-mintimeout 10000 && \
    npm config set fetch-retry-maxtimeout 60000 && \
    npm config set fetch-retries 5 && \
    npm config set audit false && \
    npm config set fund false && \
    npm config set progress false && \
    npm config set maxsockets 3

# 安装依赖
RUN npm ci --omit=dev --no-audit --no-fund --prefer-offline

# 生产阶段
FROM node:20-alpine AS production

# 配置国内镜像源
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 安装运行时依赖
RUN apk add --no-cache \
    cairo jpeg pango giflib pixman \
    libjpeg-turbo freetype libpng \
    vips glib

WORKDIR /app

# 复制依赖和代码
COPY --from=builder /app/node_modules ./node_modules
COPY . .

# 创建日志目录
RUN mkdir -p /app/logs && chmod 755 /app/logs

# 验证入口文件
RUN node --check index.js

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=80

# 创建非root用户
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# 更改文件所有权
RUN chown -R nextjs:nodejs /app
USER nextjs

# 暴露端口
EXPOSE 80

# 健康检查（优化超时时间）
HEALTHCHECK --interval=30s --timeout=15s --start-period=30s --retries=3 \
    CMD node -e "const http = require('http'); const req = http.request({hostname: 'localhost', port: 80, path: '/health', timeout: 10000}, (res) => process.exit(res.statusCode === 200 ? 0 : 1)); req.on('error', () => process.exit(1)); req.end();"

# 启动应用
CMD ["node", "index.js"]