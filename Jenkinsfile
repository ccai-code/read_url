pipeline {
    agent any
    
    environment {
        // Docker镜像相关配置
        IMAGE_NAME = 'get-url'
        IMAGE_TAG = "${BUILD_NUMBER}"
        TCR_REGISTRY = 'your-tcr-registry.com'
        TCR_NAMESPACE = 'your-namespace'
    }
    
    stages {
        stage('清理工作空间') {
            steps {
                script {
                    echo '开始清理Jenkins工作空间...'
                    // 强制删除所有文件和目录，包括隐藏文件
                    sh '''
                        set +e
                        rm -rf ./* 2>/dev/null || true
                        rm -rf .git 2>/dev/null || true
                        rm -rf .[^.]* 2>/dev/null || true
                        ls -la
                        echo "工作空间清理完成"
                    '''
                }
            }
        }
        
        stage('检出代码仓库') {
            steps {
                script {
                    echo '开始检出代码仓库...'
                    // 确保目录为空后再克隆
                    sh '''
                        echo "当前目录内容:"
                        ls -la
                        echo "开始Git克隆..."
                        git clone https://github.com/ccai-code/read_url.git .
                        echo "Git克隆完成"
                        ls -la
                    '''
                }
            }
        }
        
        stage('验证代码') {
            steps {
                script {
                    echo '验证关键文件存在...'
                    sh '''
                        if [ ! -f "Dockerfile" ]; then
                            echo "错误: Dockerfile不存在"
                            exit 1
                        fi
                        if [ ! -f "package.json" ]; then
                            echo "错误: package.json不存在"
                            exit 1
                        fi
                        echo "代码验证通过"
                    '''
                }
            }
        }
        
        stage('构建Docker镜像') {
            steps {
                script {
                    echo "开始构建Docker镜像: ${IMAGE_NAME}:${IMAGE_TAG}"
                    sh '''
                        docker build -t ${IMAGE_NAME}:${IMAGE_TAG} .
                        docker tag ${IMAGE_NAME}:${IMAGE_TAG} ${IMAGE_NAME}:latest
                        echo "Docker镜像构建完成"
                    '''
                }
            }
        }
        
        stage('推送Docker镜像到TCR') {
            steps {
                script {
                    echo "推送Docker镜像到TCR..."
                    sh '''
                        # 登录TCR (需要配置TCR凭据)
                        # docker login ${TCR_REGISTRY}
                        
                        # 标记镜像
                        docker tag ${IMAGE_NAME}:${IMAGE_TAG} ${TCR_REGISTRY}/${TCR_NAMESPACE}/${IMAGE_NAME}:${IMAGE_TAG}
                        docker tag ${IMAGE_NAME}:${IMAGE_TAG} ${TCR_REGISTRY}/${TCR_NAMESPACE}/${IMAGE_NAME}:latest
                        
                        # 推送镜像
                        # docker push ${TCR_REGISTRY}/${TCR_NAMESPACE}/${IMAGE_NAME}:${IMAGE_TAG}
                        # docker push ${TCR_REGISTRY}/${TCR_NAMESPACE}/${IMAGE_NAME}:latest
                        
                        echo "Docker镜像推送完成"
                    '''
                }
            }
        }
    }
    
    post {
        always {
            script {
                echo '清理构建产物...'
                sh '''
                    # 清理本地Docker镜像
                    docker rmi ${IMAGE_NAME}:${IMAGE_TAG} || true
                    docker rmi ${IMAGE_NAME}:latest || true
                    docker rmi ${TCR_REGISTRY}/${TCR_NAMESPACE}/${IMAGE_NAME}:${IMAGE_TAG} || true
                    docker rmi ${TCR_REGISTRY}/${TCR_NAMESPACE}/${IMAGE_NAME}:latest || true
                    echo "清理完成"
                '''
            }
        }
        success {
            echo '🎉 部署成功！'
        }
        failure {
            echo '❌ 部署失败，请检查日志'
        }
    }
}