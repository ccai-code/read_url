import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import Tesseract from 'tesseract.js';
import sharp from 'sharp';
import { createServer } from 'http';
import { URL } from 'url';

class MCPHtmlServer {
  constructor() {
    this.server = new Server(
      {
        name: 'mcp-html-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupRequestHandlers();
  }

  setupToolHandlers() {
    // 注册读取链接工具
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'read_link',
            description: '读取链接内容，支持网页爬取和图片OCR识别',
            inputSchema: {
              type: 'object',
              properties: {
                url: {
                  type: 'string',
                  description: '要读取的链接URL，可以是网页或图片链接'
                }
              },
              required: ['url']
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name === 'read_link') {
        return await this.handleReadLink(args.url);
      }

      throw new Error(`Unknown tool: ${name}`);
    });
  }

  async handleReadLink(url) {
    try {
      // 验证URL格式
      const parsedUrl = new URL(url);

      // 获取响应头来判断内容类型
      const headResponse = await axios.head(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const contentType = headResponse.headers['content-type'] || '';

      // 判断是否为图片
      if (contentType.startsWith('image/')) {
        return await this.processImage(url);
      } else {
        return await this.processWebpage(url);
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `错误：无法处理链接 ${url}。错误信息：${error.message}`
          }
        ]
      };
    }
  }

  async processWebpage(url) {
    try {
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const $ = cheerio.load(response.data);

      // 移除脚本和样式标签
      $('script, style, nav, footer, aside').remove();

      // 提取标题
      const title = $('title').text().trim() || '无标题';

      // 提取主要内容
      let content = '';

      // 尝试提取文章内容
      const articleSelectors = [
        'article',
        '[role="main"]',
        '.content',
        '.post-content',
        '.entry-content',
        '.article-content',
        'main'
      ];

      let mainContent = '';
      for (const selector of articleSelectors) {
        const element = $(selector).first();
        if (element.length > 0) {
          mainContent = element.text().trim();
          if (mainContent.length > 100) {
            break;
          }
        }
      }

      // 如果没有找到主要内容，提取body内容
      if (!mainContent) {
        mainContent = $('body').text().trim();
      }

      // 清理文本
      content = mainContent
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim();

      // 限制内容长度
      if (content.length > 5000) {
        content = content.substring(0, 5000) + '...';
      }

      return {
        content: [
          {
            type: 'text',
            text: `网页标题：${title}\n\n网页内容：\n${content}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`网页爬取失败：${error.message}`);
    }
  }

  async processImage(url) {
    try {
      // 下载图片
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      // 使用sharp处理图片（如果需要）
      let imageBuffer = Buffer.from(response.data);

      try {
        // 尝试优化图片以提高OCR准确性
        imageBuffer = await sharp(imageBuffer)
          .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
          .grayscale()
          .normalize()
          .toBuffer();
      } catch (sharpError) {
        console.warn('图片处理失败，使用原始图片:', sharpError.message);
        imageBuffer = Buffer.from(response.data);
      }

      // 使用Tesseract进行OCR识别
      const { data: { text } } = await Tesseract.recognize(
        imageBuffer,
        'chi_sim+eng', // 支持中文简体和英文
        {
          logger: m => console.log(m) // 可选：显示进度
        }
      );

      const cleanedText = text.trim();

      if (!cleanedText) {
        return {
          content: [
            {
              type: 'text',
              text: '图片OCR识别完成，但未检测到文字内容。'
            }
          ]
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `图片OCR识别结果：\n\n${cleanedText}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`图片OCR处理失败：${error.message}`);
    }
  }

  setupRequestHandlers() {
    // 设置错误处理
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async startHttpServer(port = 3000) {
    const httpServer = createServer(async (req, res) => {
      // 设置CORS头
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Last-Event-ID');
      
      // 处理OPTIONS预检请求
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // 处理GET请求 - SSE连接
      if (req.method === 'GET') {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.writeHead(200);
        
        // 发送初始化事件
        res.write('event: initialized\n');
        res.write('data: {"type":"initialized"}\n\n');
        
        // 保持连接活跃
        const keepAlive = setInterval(() => {
          res.write('event: ping\n');
          res.write('data: {"type":"ping"}\n\n');
        }, 30000);
        
        req.on('close', () => {
          clearInterval(keepAlive);
        });
        
        return;
      }

      // 处理POST请求 - MCP协议
      if (req.method === 'POST') {
        res.setHeader('Content-Type', 'application/json');
        
        // 读取请求体
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });

        req.on('end', async () => {
          try {
            const request = JSON.parse(body);
            let response;

            // 处理MCP协议请求
            if (request.method === 'tools/list') {
              response = {
                tools: [
                  {
                    name: 'read_link',
                    description: '读取网页内容或图片OCR识别',
                    inputSchema: {
                      type: 'object',
                      properties: {
                        url: {
                          type: 'string',
                          description: '要读取的网页URL或图片URL'
                        }
                      },
                      required: ['url']
                    }
                  }
                ]
              };
            } else if (request.method === 'tools/call') {
              if (request.params.name === 'read_link') {
                response = await this.handleReadLink(request.params.arguments.url);
              } else {
                throw new Error(`Unknown tool: ${request.params.name}`);
              }
            } else {
              throw new Error(`Unknown method: ${request.method}`);
            }

            res.writeHead(200);
            res.end(JSON.stringify(response));
          } catch (error) {
            console.error('Request processing error:', error);
            res.writeHead(400);
            res.end(JSON.stringify({
              error: error.message,
              type: 'request_error'
            }));
          }
        });

        req.on('error', (error) => {
          console.error('Request error:', error);
          res.writeHead(400);
          res.end(JSON.stringify({
            error: 'Request error',
            type: 'connection_error'
          }));
        });
        
        return;
      }

      // 其他方法不支持
      res.writeHead(405);
      res.end(JSON.stringify({ error: 'Method not allowed' }));
    });

    // 启动HTTP服务器
    httpServer.listen(port, () => {
      console.log(`🚀 MCP SSE Server started on port ${port}`);
      console.log(`📡 Server endpoint: http://localhost:${port}`);
      console.log(`🔧 Available tools: read_link`);
    });

    return httpServer;
  }
}

// 启动服务器
const server = new MCPHtmlServer();

// 检查命令行参数
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = portIndex !== -1 ? parseInt(args[portIndex + 1]) : 3000;

// 启动HTTP服务器
server.startHttpServer(port).catch(console.error);

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\nShutting down MCP HTTP Server...');
  process.exit(0);
});