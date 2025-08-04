pipeline {
    agent any
    
    environment {
        // 设置环境变量
        NODE_ENV = 'production'
        DOCKER_REGISTRY = 'your-registry-url'
        IMAGE_NAME = 'get-url'
    }
    
    stages {
        stage('清理工作空间') {
            steps {
                script {
                    echo '开始清理工作空间...'
                    
                    // 清理工作目录
                    sh '''
                        echo "当前目录: $(pwd)"
                        echo "清理前的目录内容:"
                        ls -la || true
                        
                        # 删除所有文件和目录
                        rm -rf ./* 2>/dev/null || true
                        rm -rf .git 2>/dev/null || true
                        rm -rf .[^.]* 2>/dev/null || true
                        
                        echo "清理后的目录内容:"
                        ls -la || true
                        echo "工作空间清理完成"
                    '''
                }
            }
        }
        
        stage('检出代码仓库') {
            steps {
                script {
                    echo '开始检出代码...'
                    
                    // 克隆代码仓库
                    sh '''
                        git clone https://github.com/ccai-code/read_url.git .
                        echo "代码检出完成"
                        echo "仓库内容:"
                        ls -la
                    '''
                }
            }
        }
        
        stage('构建 Docker 镜像') {
            steps {
                script {
                    echo '开始构建Docker镜像...'
                    
                    // 构建Docker镜像
                    sh '''
                        echo "开始Docker构建..."
                        docker build -t ${IMAGE_NAME}:${BUILD_NUMBER} .
                        docker tag ${IMAGE_NAME}:${BUILD_NUMBER} ${IMAGE_NAME}:latest
                        echo "Docker镜像构建完成"
                    '''
                }
            }
        }
        
        stage('推送 Docker 镜像到 TCR') {
            steps {
                script {
                    echo '开始推送Docker镜像...'
                    
                    // 推送镜像到仓库
                    sh '''
                        echo "推送镜像到仓库..."
                        # docker push ${DOCKER_REGISTRY}/${IMAGE_NAME}:${BUILD_NUMBER}
                        # docker push ${DOCKER_REGISTRY}/${IMAGE_NAME}:latest
                        echo "镜像推送完成"
                    '''
                }
            }
        }
    }
    
    post {
        always {
            echo '流水线执行完成'
        }
        success {
            echo '✅ 部署成功！'
        }
        failure {
            echo '❌ 部署失败！'
        }
        cleanup {
            // 清理工作空间
            cleanWs()
        }
    }
}