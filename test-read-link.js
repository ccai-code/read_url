import axios from 'axios';

async function testReadLink() {
  try {
    console.log('🔍 开始测试read_link工具读取图片...');
    
    const requestData = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'read_link',
        arguments: {
          url: 'https://www.learningcontainer.com/wp-content/uploads/2020/07/sample-jpg-file-for-testing.jpg'
        }
      }
    };

    console.log('📤 发送请求到MCP服务器...');
    const response = await axios.post('http://localhost:3001', requestData, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 60000 // 60秒超时
    });

    console.log('✅ 请求成功!');
    console.log('📋 响应结果:');
    console.log(JSON.stringify(response.data, null, 2));

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (error.response) {
      console.error('📋 错误响应:', error.response.data);
    }
  }
}

// 运行测试
testReadLink();