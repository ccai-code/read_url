import axios from 'axios';

// 测试MCP协议初始化握手
async function testMCPInitialization() {
  const baseURL = 'http://localhost:3001';
  
  console.log('🧪 Testing MCP Protocol Initialization...');
  
  try {
    // 1. 测试initialize请求
    console.log('\n1️⃣ Testing initialize request...');
    const initResponse = await axios.post(`${baseURL}/mcp`, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        clientInfo: {
          name: 'test-client',
          version: '1.0.0'
        }
      }
    });
    
    console.log('✅ Initialize response:', JSON.stringify(initResponse.data, null, 2));
    
    // 2. 测试initialized通知
    console.log('\n2️⃣ Testing initialized notification...');
    const initializedResponse = await axios.post(`${baseURL}/mcp`, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {}
    });
    
    console.log('✅ Initialized response:', JSON.stringify(initializedResponse.data, null, 2));
    
    // 3. 测试tools/list
    console.log('\n3️⃣ Testing tools/list...');
    const toolsResponse = await axios.post(`${baseURL}/mcp`, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    });
    
    console.log('✅ Tools list response:', JSON.stringify(toolsResponse.data, null, 2));
    
    // 4. 测试tools/call
    console.log('\n4️⃣ Testing tools/call with read_link...');
    const toolCallResponse = await axios.post(`${baseURL}/mcp`, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'read_link',
        arguments: {
          url: 'https://httpbin.org/json'
        }
      }
    });
    
    console.log('✅ Tool call response:', JSON.stringify(toolCallResponse.data, null, 2));
    
    console.log('\n🎉 All MCP protocol tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// 运行测试
testMCPInitialization();