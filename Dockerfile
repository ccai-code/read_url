# 使用官方Node.js运行时作为基础镜像
FROM node:20-alpine

# 配置国内镜像源
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 安装构建依赖和系统库
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    musl-dev \
    giflib-dev \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev

# 设置工作目录
WORKDIR /app

# 复制package.json和package-lock.json
COPY package*.json ./

# 配置npm使用国内镜像源并安装依赖
RUN npm config set registry https://registry.npmmirror.com && \
    npm ci --omit=dev

# 复制应用代码
COPY . .

# 以root权限运行，移除用户切换

# 暴露端口（如果需要HTTP模式）
EXPOSE 80

# 启动应用
CMD ["node", "index.js", "--port", "80"]