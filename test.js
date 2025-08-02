import axios from 'axios';
import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

// 测试 HTTP 模式的 MCP 服务器
async function testHttpServer() {
  console.log('启动 HTTP 服务器测试...');

  // 启动服务器
  const serverProcess = spawn('node', ['index.js', '--http', '--port', '3001'], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // 等待服务器启动
  await setTimeout(2000);

  try {
    // 测试工具列表
    console.log('\n1. 测试工具列表...');
    const listResponse = await axios.post('http://localhost:3001', {
      method: 'tools/list'
    });
    console.log('工具列表:', JSON.stringify(listResponse.data, null, 2));

    // 测试网页爬取
    console.log('\n2. 测试网页爬取...');
    const webResponse = await axios.post('http://localhost:3001', {
      method: 'tools/call',
      params: {
        name: 'read_link',
        arguments: {
          url: 'https://httpbin.org/html'
        }
      }
    });
    console.log('网页爬取结果:', JSON.stringify(webResponse.data, null, 2));

    console.log('\n✅ HTTP 服务器测试完成！');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (error.response) {
      console.error('响应数据:', error.response.data);
    }
  } finally {
    // 关闭服务器
    serverProcess.kill();
  }
}

// 运行测试
testHttpServer().catch(console.error);