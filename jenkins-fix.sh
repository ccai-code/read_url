#!/bin/bash

# Jenkins Pipeline Fix Script
# This script should be added to the Jenkins pipeline BEFORE the git clone step

echo "=== Jenkins Workspace Cleanup ==="

# Get current working directory
echo "Current directory: $(pwd)"
echo "Directory contents before cleanup:"
ls -la

# Remove all files and directories except Jenkins workspace metadata
echo "\nCleaning workspace..."
find . -mindepth 1 -maxdepth 1 ! -name '.jenkins*' ! -name 'workspace*' -exec rm -rf {} + 2>/dev/null || true

# Alternative cleanup method if find doesn't work
rm -rf ./* 2>/dev/null || true
rm -rf .git 2>/dev/null || true
rm -rf .gitignore 2>/dev/null || true
rm -rf .[^.]* 2>/dev/null || true

echo "Directory contents after cleanup:"
ls -la

echo "\n=== Workspace cleanup completed ==="
echo "Ready for git clone operation"

# Now the git clone command should work
echo "\nExecuting git clone..."
git clone https://github.com/ccai-code/read_url.git .

if [ $? -eq 0 ]; then
    echo "✅ Git clone successful"
    echo "Repository contents:"
    ls -la
else
    echo "❌ Git clone failed"
    exit 1
fi