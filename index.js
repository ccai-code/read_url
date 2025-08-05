import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import Tesseract from 'tesseract.js';
import sharp from 'sharp';
import { createServer } from 'http';
import { URL } from 'url';
import fs from 'fs';
import { AIServices } from './ai-services.js';

class MCPHtmlServer {
  constructor() {
    // 加载配置
    this.loadConfig();

    // 初始化AI服务
    this.aiServices = new AIServices(this.config);

    this.server = new Server(
      {
        name: 'mcp-html-server-enhanced',
        version: '2.0.0',
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

  loadConfig() {
    try {
      // 优先加载生产环境配置
      const productionConfigPath = './config.production.json';
      const configPath = './config.json';
      
      let selectedConfigPath = configPath;
      if (fs.existsSync(productionConfigPath)) {
        selectedConfigPath = productionConfigPath;
        console.log('🔧 使用生产环境配置文件');
      } else if (fs.existsSync(configPath)) {
        console.log('🔧 使用开发环境配置文件');
      } else {
        console.warn('⚠️ 配置文件不存在，使用默认配置');
        this.config = {
          fallback: { useOCR: true, maxFileSize: 10485760 }
        };
        return;
      }
      
      this.config = JSON.parse(fs.readFileSync(selectedConfigPath, 'utf8'));
      console.log('✅ 配置文件加载成功');
    } catch (error) {
      console.error('❌ 加载配置文件失败:', error.message);
      this.config = {
        fallback: { useOCR: true, maxFileSize: 10485760 }
      };
    }
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'read_link',
            description: '读取链接内容，支持网页、图片、PDF、Word文档、Excel表格、视频文件等多种格式，使用AI大模型进行智能识别',
            inputSchema: {
              type: 'object',
              properties: {
                url: {
                  type: 'string',
                  description: '要读取的链接URL，支持网页、图片(jpg,png,gif等)、PDF、Word文档(doc,docx)、Excel表格(xls,xlsx)、视频文件(mp4,avi,mov,mkv)等'
                },
                prompt: {
                  type: 'string',
                  description: '可选：自定义AI分析提示词，用于指导AI如何处理内容'
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
        return await this.handleReadLink(args.url, args.prompt);
      }

      throw new Error(`Unknown tool: ${name}`);
    });
  }

  async handleReadLink(url, customPrompt) {
    try {
      const parsedUrl = new URL(url);
      console.log(`🔍 开始处理链接: ${url}`);

      // 检测Bing图片搜索链接
      if (parsedUrl.hostname.includes('bing.com') && parsedUrl.pathname.includes('/images/search')) {
        const mediaUrl = parsedUrl.searchParams.get('mediaurl');
        if (mediaUrl) {
          const decodedImageUrl = decodeURIComponent(mediaUrl);
          console.log(`🔍 检测到Bing图片搜索，提取实际图片链接: ${decodedImageUrl}`);
          return await this.processImage(decodedImageUrl, customPrompt);
        }
      }

      // 获取文件信息
      const { contentType, buffer } = await this.downloadFile(url);

      // 检测文件类型
      const fileType = this.detectFileType(url, contentType);

      if (this.isImageType(contentType, url)) {
        return await this.processImageWithAI(buffer, customPrompt);
      } else if (fileType && ['pdf', 'doc', 'docx', 'xlsx', 'xls', 'mp4', 'avi', 'mov', 'mkv'].includes(fileType)) {
        return await this.processDocumentWithAI(buffer, fileType, customPrompt);
      } else {
        return await this.processWebpage(url);
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ 处理链接失败: ${error.message}`
          }
        ]
      };
    }
  }

  async downloadFile(url) {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      maxContentLength: this.config.fallback.maxFileSize
    });

    return {
      contentType: response.headers['content-type'] || '',
      buffer: Buffer.from(response.data)
    };
  }

  async processImageWithAI(imageBuffer, customPrompt) {
    console.log('🖼️ 使用AI处理图片...');

    // 优先使用通义千问
    if (this.config.qwen?.apiKey) {
      const result = await this.aiServices.analyzeImageWithQwen(imageBuffer, customPrompt);
      if (result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `🤖 通义千问图片分析结果:\n\n${result.content}\n\n📊 使用情况: ${JSON.stringify(result.usage)}`
            }
          ]
        };
      }
    }

    // 降级到OCR
    if (this.config.fallback.useOCR) {
      console.log('⚠️ AI服务不可用，降级使用OCR...');
      return await this.processImageBuffer(imageBuffer, 'image/jpeg');
    }

    throw new Error('图片处理服务不可用');
  }

  async processDocumentWithAI(documentBuffer, fileType, customPrompt) {
    console.log(`📄 使用AI处理${fileType.toUpperCase()}文档...`);

    // 对于新支持的文件类型（Excel、视频），优先使用通义千问
    if (['xlsx', 'xls', 'mp4', 'avi', 'mov', 'mkv'].includes(fileType)) {
      if (this.config.qwen?.apiKey) {
        try {
          console.log('🤖 使用通义千问处理文档...');
          const result = await this.aiServices.processDocumentWithQwen(documentBuffer, fileType, customPrompt);
          if (result.success) {
            return {
              content: [
                {
                  type: 'text',
                  text: `🤖 通义千问文档分析结果:\n\n${result.content}\n\n📊 使用情况: ${JSON.stringify(result.usage)}\n\n📄 文件信息: ${JSON.stringify(result.extractedData, null, 2)}`
                }
              ]
            };
          }
        } catch (error) {
          console.error('❌ 通义千问处理失败:', error.message);
        }
      }
    }

    // 优先使用GLM-4处理传统文档格式
    if (this.config.glm4?.apiKey && ['pdf', 'doc', 'docx'].includes(fileType)) {
      try {
        console.log('🤖 尝试使用GLM-4处理文档...');
        const result = await this.aiServices.processDocumentWithGLM4(documentBuffer, fileType, customPrompt);
        if (result.success) {
          return {
            content: [
              {
                type: 'text',
                text: `🤖 GLM-4文档分析结果:\n\n${result.content}\n\n📊 使用情况: ${JSON.stringify(result.usage)}`
              }
            ]
          };
        }
      } catch (error) {
        console.error('❌ GLM-4处理失败:', error.message);
      }
    }

    // 通义千问作为备选方案处理传统格式
    if (this.config.qwen?.apiKey && ['pdf', 'doc', 'docx'].includes(fileType)) {
      try {
        console.log('🤖 使用通义千问作为备选方案...');
        const result = await this.aiServices.processDocumentWithQwen(documentBuffer, fileType, customPrompt);
        if (result.success) {
          return {
            content: [
              {
                type: 'text',
                text: `🤖 通义千问文档分析结果:\n\n${result.content}\n\n📊 使用情况: ${JSON.stringify(result.usage)}\n\n📄 文件信息: ${JSON.stringify(result.extractedData, null, 2)}`
              }
            ]
          };
        }
      } catch (error) {
        console.error('❌ 通义千问处理失败:', error.message);
      }
    }

    // 使用火山引擎处理文档
    if (this.config.volcengine?.accessKey && ['pdf', 'doc', 'docx', 'txt'].includes(fileType)) {
      const result = await this.aiServices.processDocumentWithVolcengine(documentBuffer, fileType, customPrompt);
      if (result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `🚀 火山引擎文档分析结果:\n\n${result.content}\n\n📊 使用情况: ${JSON.stringify(result.usage)}`
            }
          ]
        };
      }
    }

    // 降级到本地PDF处理
    if (fileType === 'pdf') {
      console.log('⚠️ AI服务不可用，使用本地PDF解析...');
      return await this.processPDFLocally(documentBuffer, customPrompt);
    }

    throw new Error(`${fileType.toUpperCase()}文档处理服务不可用`);
  }

  async processPDFLocally(pdfBuffer, customPrompt) {
    try {
      console.log('📄 正在使用本地pdf-parse解析PDF...');

      // 直接使用pdf-parse的lib文件，绕过有问题的index.js
      const pdfParseLib = await import('./node_modules/pdf-parse/lib/pdf-parse.js');
      const pdfParse = pdfParseLib.default;

      const pdfData = await pdfParse(pdfBuffer);
      const extractedText = pdfData.text;

      console.log(`✅ PDF解析成功，提取了 ${extractedText.length} 个字符`);

      // 清理和格式化文本
      const cleanedText = extractedText
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim();

      // 限制输出长度
      const maxLength = 8000;
      const finalText = cleanedText.length > maxLength
        ? cleanedText.substring(0, maxLength) + '...\n\n(内容已截断，仅显示前' + maxLength + '个字符)'
        : cleanedText;

      return {
        content: [
          {
            type: 'text',
            text: `📄 PDF文档内容提取结果:\n\n${finalText}\n\n📊 文档信息:\n- 页数: ${pdfData.numpages}\n- 文本长度: ${extractedText.length} 字符\n- 文件大小: ${(pdfBuffer.length / 1024).toFixed(2)} KB`
          }
        ]
      };
    } catch (error) {
      console.error('❌ PDF解析失败:', error.message);
      throw new Error(`PDF解析失败: ${error.message}`);
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
        },
        maxContentLength: 10 * 1024 * 1024 // 限制10MB
      });

      return await this.processImageBuffer(response.data, response.headers['content-type'] || 'image/jpeg');
    } catch (error) {
      throw new Error(`图片下载失败：${error.message}`);
    }
  }

  async processImageBuffer(buffer, contentType) {
    try {
      // 使用sharp处理图片（如果需要）
      let imageBuffer = Buffer.from(buffer);

      try {
        // 尝试优化图片以提高OCR准确性
        imageBuffer = await sharp(imageBuffer)
          .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
          .grayscale()
          .normalize()
          .toBuffer();
      } catch (sharpError) {
        console.warn('图片处理失败，使用原始图片:', sharpError.message);
        imageBuffer = Buffer.from(buffer);
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

  detectFileType(url, contentType) {
    return this.aiServices.detectFileType(url, contentType);
  }

  isImageType(contentType, url) {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff', '.ico'];
    const urlLower = url.toLowerCase();
    return contentType?.startsWith('image/') || imageExtensions.some(ext => urlLower.endsWith(ext));
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
        // 检查是否是/mcp端点
        const url = new URL(req.url, `http://localhost:${port}`);

        res.setHeader('Content-Type', 'application/json');

        // 读取请求体
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });

        req.on('end', async () => {
          let request = null;
          try {
            request = JSON.parse(body);
            let response;

            // 处理/mcp端点的MCP协议初始化
            if (url.pathname === '/mcp') {
              if (request.method === 'initialize') {
                // 处理初始化请求
                response = {
                  jsonrpc: '2.0',
                  id: request.id,
                  result: {
                    protocolVersion: '2024-11-05',
                    capabilities: {
                      tools: {},
                      resources: {},
                      logging: {}
                    },
                    serverInfo: {
                      name: 'mcp-html-server',
                      version: '1.0.0'
                    }
                  }
                };
                console.log('🤝 MCP Initialize request received');
              } else if (request.method === 'notifications/initialized') {
                // 处理初始化完成通知
                response = {
                  jsonrpc: '2.0',
                  id: request.id || null,
                  result: {}
                };
                console.log('✅ MCP Initialized notification received');
              } else if (request.method === 'ping') {
                // 处理ping请求
                response = {
                  jsonrpc: '2.0',
                  id: request.id,
                  result: {}
                };
                console.log('🏓 Ping request received');
              } else if (request.method === 'resources/list') {
                // 处理资源列表请求
                response = {
                  jsonrpc: '2.0',
                  id: request.id,
                  result: {
                    resources: [
                      {
                        uri: 'web://content',
                        name: 'Web Content Reader',
                        description: '读取网页内容和图片OCR识别',
                        mimeType: 'text/plain'
                      }
                    ]
                  }
                };
              } else if (request.method === 'resources/read') {
                // 处理资源读取请求
                const uri = request.params.uri;
                if (uri === 'web://content') {
                  response = {
                    jsonrpc: '2.0',
                    id: request.id,
                    result: {
                      contents: [
                        {
                          uri: uri,
                          mimeType: 'text/plain',
                          text: 'Web Content Reader - 支持读取网页内容和图片OCR识别。使用read_link工具来处理具体的URL。'
                        }
                      ]
                    }
                  };
                } else {
                  throw new Error(`Unknown resource URI: ${uri}`);
                }
              } else if (request.method === 'tools/list') {
                response = {
                  jsonrpc: '2.0',
                  id: request.id,
                  result: {
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
                  }
                };
              } else if (request.method === 'tools/call') {
                if (request.params.name === 'read_link') {
                  const result = await this.handleReadLink(request.params.arguments.url);
                  response = {
                    jsonrpc: '2.0',
                    id: request.id,
                    result: {
                      content: [
                        {
                          type: 'text',
                          text: JSON.stringify(result, null, 2)
                        }
                      ]
                    }
                  };
                } else {
                  throw new Error(`Unknown tool: ${request.params.name}`);
                }
              } else {
                throw new Error(`Unknown method: ${request.method}`);
              }
            } else {
              // 处理非/mcp端点的传统MCP协议请求
              if (request.method === 'initialize') {
                // 处理初始化请求
                response = {
                  jsonrpc: '2.0',
                  id: request.id,
                  result: {
                    protocolVersion: '2024-11-05',
                    capabilities: {
                      tools: {},
                      resources: {},
                      logging: {}
                    },
                    serverInfo: {
                      name: 'mcp-html-server',
                      version: '1.0.0'
                    }
                  }
                };
                console.log('🤝 MCP Initialize request received');
              } else if (request.method === 'notifications/initialized') {
                // 处理初始化完成通知
                response = {
                  jsonrpc: '2.0',
                  id: request.id || null,
                  result: {}
                };
                console.log('✅ MCP Initialized notification received');
              } else if (request.method === 'tools/list') {
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
            }

            res.writeHead(200);
            res.end(JSON.stringify(response));
          } catch (error) {
            console.error('Request processing error:', error);
            res.writeHead(400);
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              id: request?.id || null,
              error: {
                code: -32603,
                message: error.message,
                data: {
                  type: 'request_error'
                }
              }
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
      console.log(`🤝 MCP Protocol endpoint: http://localhost:${port}/mcp`);
      console.log(`🔧 Available tools: read_link`);
      console.log(`💡 Supports MCP initialize/initialized handshake`);
    });

    return httpServer;
  }
}

// 导出类以供测试使用
export { MCPHtmlServer };

// 启动服务器
console.log('🚀 正在启动MCP HTML服务器...');

try {
  const server = new MCPHtmlServer();
  console.log('✅ 服务器实例创建成功');

  const args = process.argv.slice(2);
  const portIndex = args.indexOf('--port');
  const port = portIndex !== -1 ? parseInt(args[portIndex + 1]) : 3000;

  console.log(`🔧 配置端口: ${port}`);

  server.startHttpServer(port).then(() => {
    console.log('✅ 服务器启动完成');
  }).catch((error) => {
    console.error('❌ 服务器启动失败:', error);
    process.exit(1);
  });

  process.on('SIGINT', () => {
    console.log('\n正在关闭服务器...');
    process.exit(0);
  });
} catch (error) {
  console.error('❌ 创建服务器实例失败:', error);
  process.exit(1);
}