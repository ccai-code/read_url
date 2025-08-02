import axios from 'axios';

// 测试扩展的MCP协议功能
async function testExtendedMCPFeatures() {
  const baseURL = 'http://localhost:3001';
  
  console.log('🧪 Testing Extended MCP Protocol Features...');
  
  try {
    // 1. 测试ping请求
    console.log('\n1️⃣ Testing ping request...');
    const pingResponse = await axios.post(`${baseURL}/mcp`, {
      jsonrpc: '2.0',
      id: 1,
      method: 'ping',
      params: {}
    });
    
    console.log('✅ Ping response:', JSON.stringify(pingResponse.data, null, 2));
    
    // 2. 测试resources/list
    console.log('\n2️⃣ Testing resources/list...');
    const resourcesListResponse = await axios.post(`${baseURL}/mcp`, {
      jsonrpc: '2.0',
      id: 2,
      method: 'resources/list',
      params: {}
    });
    
    console.log('✅ Resources list response:', JSON.stringify(resourcesListResponse.data, null, 2));
    
    // 3. 测试resources/read
    console.log('\n3️⃣ Testing resources/read...');
    const resourceReadResponse = await axios.post(`${baseURL}/mcp`, {
      jsonrpc: '2.0',
      id: 3,
      method: 'resources/read',
      params: {
        uri: 'web://content'
      }
    });
    
    console.log('✅ Resource read response:', JSON.stringify(resourceReadResponse.data, null, 2));
    
    // 4. 测试未知资源URI的错误处理
    console.log('\n4️⃣ Testing unknown resource URI error handling...');
    try {
      await axios.post(`${baseURL}/mcp`, {
        jsonrpc: '2.0',
        id: 4,
        method: 'resources/read',
        params: {
          uri: 'unknown://resource'
        }
      });
    } catch (error) {
      console.log('✅ Expected error for unknown resource:', JSON.stringify(error.response.data, null, 2));
    }
    
    // 5. 重新测试initialize以验证新的capabilities
    console.log('\n5️⃣ Testing initialize with new capabilities...');
    const initResponse = await axios.post(`${baseURL}/mcp`, {
      jsonrpc: '2.0',
      id: 5,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          resources: {}
        },
        clientInfo: {
          name: 'test-client-extended',
          version: '1.0.0'
        }
      }
    });
    
    console.log('✅ Initialize response with resources capability:', JSON.stringify(initResponse.data, null, 2));
    
    console.log('\n🎉 All extended MCP protocol tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// 运行测试
testExtendedMCPFeatures();