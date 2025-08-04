# Jenkins部署失败解决方案

## 问题描述

部署持续失败，错误信息：
```
fatal: destination path '.' already exists and is not an empty directory.
```

## 根本原因

Jenkins工作目录 `/root/workspace` 存在残留文件，导致Git无法克隆到非空目录。

## 立即解决方案

### 方案1：修改Jenkins流水线配置（推荐）

在现有流水线的Git克隆步骤前添加清理命令：

```bash
# 在 git clone 命令前添加
rm -rf ./* 2>/dev/null || true
rm -rf .git 2>/dev/null || true
rm -rf .[^.]* 2>/dev/null || true

# 然后执行原有的git clone命令
git clone ****** .
```

### 方案2：使用强制克隆

修改Git克隆命令：
```bash
# 方法1：先删除再克隆
rm -rf .git && git clone ****** .

# 方法2：使用临时目录
git clone ****** temp_dir && mv temp_dir/* . && mv temp_dir/.* . 2>/dev/null || true && rm -rf temp_dir
```

### 方案3：Jenkins任务配置

在Jenkins任务配置中启用：
- "Delete workspace before build starts"
- "Clean before checkout"

## 完整的Jenkins流水线修复

我已经创建了完整的 `Jenkinsfile`，包含：
1. 工作空间清理阶段
2. 代码检出阶段
3. Docker构建阶段
4. 镜像推送阶段

## 验证步骤

1. 应用上述任一解决方案
2. 重新触发部署
3. 检查"检出代码仓库"阶段是否成功
4. 确认后续Docker构建阶段正常执行

## 预期结果

✅ Git克隆成功
✅ 进入Docker构建阶段
✅ 利用我们的构建优化（Node.js 20、国内镜像源等）
✅ 部署成功完成

---

**注意**：这是CI/CD环境配置问题，与代码本身无关。所有Docker构建优化都已正确配置。