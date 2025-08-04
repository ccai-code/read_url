#!/bin/bash
# Jenkins Git克隆修复脚本
# 用于解决 "destination path '.' already exists and is not an empty directory" 错误

echo "=== Jenkins Git克隆修复脚本开始 ==="
echo "当前时间: $(date)"
echo "当前目录: $(pwd)"
echo "当前用户: $(whoami)"

# 显示清理前的目录状态
echo "\n--- 清理前的目录内容 ---"
ls -la 2>/dev/null || echo "目录为空或无法访问"

# 强制清理工作目录
echo "\n--- 开始清理工作目录 ---"
set +e  # 允许命令失败而不退出脚本

# 删除所有可见文件和目录
rm -rf ./* 2>/dev/null || true
echo "已删除可见文件和目录"

# 删除.git目录
rm -rf .git 2>/dev/null || true
echo "已删除.git目录"

# 删除其他隐藏文件和目录（排除. 和 ..）
rm -rf .[^.]* 2>/dev/null || true
echo "已删除隐藏文件和目录"

# 删除以..开头的文件（如果有）
rm -rf ..?* 2>/dev/null || true
echo "已删除..开头的文件"

set -e  # 重新启用错误时退出

# 显示清理后的目录状态
echo "\n--- 清理后的目录内容 ---"
ls -la 2>/dev/null || echo "目录已清空"

# 执行Git克隆
echo "\n--- 开始Git克隆 ---"
echo "克隆仓库: https://github.com/ccai-code/read_url.git"
echo "目标目录: ."

# 执行Git克隆命令
git clone https://github.com/ccai-code/read_url.git .

if [ $? -eq 0 ]; then
    echo "✅ Git克隆成功"
else
    echo "❌ Git克隆失败"
    exit 1
fi

# 显示克隆后的目录内容
echo "\n--- 克隆后的目录内容 ---"
ls -la

# 验证关键文件
echo "\n--- 验证关键文件 ---"
if [ -f "Dockerfile" ]; then
    echo "✅ Dockerfile 存在"
else
    echo "❌ Dockerfile 不存在"
fi

if [ -f "package.json" ]; then
    echo "✅ package.json 存在"
else
    echo "❌ package.json 不存在"
fi

if [ -f "index.js" ]; then
    echo "✅ index.js 存在"
else
    echo "❌ index.js 不存在"
fi

echo "\n=== Jenkins Git克隆修复脚本完成 ==="
echo "状态: 成功"
echo "时间: $(date)"