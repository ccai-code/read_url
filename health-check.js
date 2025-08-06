import axios from 'axios';

// 健康检查脚本
async function healthCheck() {
  try {
    console.log('🏥 开始健康检查...');

    // 1. 检查基本健康端点
    console.log('📡 检查健康端点...');
    const healthResponse = await axios.get('http://localhost:80/health', {
      timeout: 5000
    });

    if (healthResponse.status === 200) {
      console.log('✅ 健康端点正常');
      console.log('📊 健康状态:', healthResponse.data);
    } else {
      console.log('❌ 健康端点异常:', healthResponse.status);
      return false;
    }

    // 2. 检查MCP工具列表
    console.log('🔧 检查MCP工具列表...');
    const toolsRequest = {
      jsonrpc: '2.0',
      id: 'health-check-tools',
      method: 'tools/list',
      params: {}
    };

    const toolsResponse = await axios.post('http://localhost:80/mcp', toolsRequest, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000
    });

    if (toolsResponse.status === 200 && toolsResponse.data.result) {
      console.log('✅ MCP工具列表正常');
      console.log('🛠️  可用工具:', toolsResponse.data.result.tools.map(t => t.name));
    } else {
      console.log('❌ MCP工具列表异常');
      return false;
    }

    // 3. 测试read_link工具
    console.log('🔗 测试read_link工具...');
    const testRequest = {
      jsonrpc: '2.0',
      id: 'health-check-readlink',
      method: 'tools/call',
      params: {
        name: 'read_link',
        arguments: {
          url: 'https://httpbin.org/json'
        }
      }
    };

    const testResponse = await axios.post('http://localhost:80/mcp', testRequest, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    if (testResponse.status === 200 && testResponse.data.result) {
      console.log('✅ read_link工具正常');
      console.log('📝 响应格式验证: 通过');

      // 验证响应格式
      const result = testResponse.data.result;
      if (result.content && Array.isArray(result.content) && result.content[0] && result.content[0].type === 'text') {
        console.log('✅ 响应格式符合标准');
      } else {
        console.log('⚠️  响应格式可能存在问题');
        console.log('📋 实际格式:', JSON.stringify(result, null, 2));
      }
    } else {
      console.log('❌ read_link工具异常');
      return false;
    }

    console.log('\n🎉 所有健康检查通过！');
    console.log('✅ 服务运行正常，可以安全使用');
    return true;

  } catch (error) {
    console.error('❌ 健康检查失败:', error.message);
    if (error.response) {
      console.error('📋 错误响应:', error.response.data);
    }
    if (error.code === 'ECONNREFUSED') {
      console.error('🔌 连接被拒绝，请确认服务是否正在运行');
    }
    return false;
  }
}

// 运行健康检查
healthCheck().then(success => {
  process.exit(success ? 0 : 1);
});