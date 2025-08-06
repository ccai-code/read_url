// 简单的健康检查测试脚本
import http from 'http';

const testHealth = () => {
  const options = {
    hostname: 'localhost',
    port: 80,
    path: '/health',
    method: 'GET',
    timeout: 5000
  };

  const req = http.request(options, (res) => {
    console.log(`健康检查状态码: ${res.statusCode}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        const response = JSON.parse(data);
        console.log('健康检查响应:', response);
        if (response.status === 'ok') {
          console.log('✅ 健康检查通过');
          process.exit(0);
        } else {
          console.log('❌ 健康检查失败');
          process.exit(1);
        }
      } catch (error) {
        console.log('❌ 健康检查响应解析失败:', error.message);
        process.exit(1);
      }
    });
  });

  req.on('error', (error) => {
    console.log('❌ 健康检查请求失败:', error.message);
    process.exit(1);
  });

  req.on('timeout', () => {
    console.log('❌ 健康检查超时');
    req.destroy();
    process.exit(1);
  });

  req.end();
};

console.log('开始健康检查测试...');
testHealth();