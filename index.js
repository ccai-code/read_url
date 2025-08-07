import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
// 移除了复杂的原生依赖：tesseract.js, sharp, canvas, pdf-parse
// 这些功能暂时禁用以确保快速部署
import { createServer } from 'http';
import { URL } from 'url';
import fs from 'fs';
import { AIServices } from './ai-services.js';
import logger from './logger.js';

// Canvas功能已禁用以简化部署
let canvasAvailable = false;

class MCPHtmlServer {
  constructor() {
    // 初始化日志
    console.log('🔧 开始初始化服务器...');
    logger.info('SERVER', 'MCP服务器初始化开始');

    // 加载配置
    console.log('🔧 开始加载配置...');
    this.loadConfig();
    console.log('✅ 配置加载完成');

    // 初始化AI服务
    console.log('🔧 开始初始化AI服务...');
    this.aiServices = new AIServices(this.config);
    console.log('✅ AI服务初始化完成');

    console.log('🔧 开始创建MCP服务器实例...');
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
    console.log('✅ MCP服务器实例创建完成');

    console.log('🔧 开始设置工具处理器...');
    this.setupToolHandlers();
    console.log('✅ 工具处理器设置完成');

    console.log('🔧 开始设置请求处理器...');
    this.setupRequestHandlers();
    console.log('✅ 请求处理器设置完成');

    logger.info('SERVER', 'MCP服务器初始化完成');
  }

  loadConfig() {
    console.log('🔧 开始加载配置文件...');
    try {
      // 优先加载生产环境配置
      const productionConfigPath = './config.production.json';
      const configPath = './config.json';
      console.log('🔧 检查配置文件路径...');

      let selectedConfigPath = configPath;
      if (fs.existsSync(productionConfigPath)) {
        selectedConfigPath = productionConfigPath;
        console.log('🔧 使用生产环境配置文件');
      } else if (fs.existsSync(configPath)) {
        console.log('🔧 使用开发环境配置文件');
      } else {
        console.warn('⚠️ 配置文件不存在，使用默认配置');
        this.config = {
          qwen: {
            apiKey: '',
            baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
            model: 'qwen-vl-plus'
          },
          fallback: { useOCR: true, maxFileSize: 10485760 }
        };
        return;
      }

      console.log('🔧 读取配置文件:', selectedConfigPath);
      this.config = JSON.parse(fs.readFileSync(selectedConfigPath, 'utf8'));
      console.log('✅ 配置文件加载成功', { configKeys: Object.keys(this.config) });
    } catch (error) {
      console.error('❌ 加载配置文件失败:', error.message);
      this.config = {
        qwen: {
          apiKey: '',
          baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          model: 'qwen-vl-plus'
        },
        fallback: { useOCR: true, maxFileSize: 10485760 }
      };
    }
  }

  setupToolHandlers() {
    console.log('🔧 设置ListTools处理器...');
    this.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
      logger.mcpRequest('list_tools', {}, request.id);

      const response = {
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

      logger.mcpResponse(request.id, response);
      return response;
    });

    console.log('🔧 设置CallTool处理器...');
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      logger.mcpRequest(name, args, request.id);

      try {
        let result;

        if (name === 'read_link') {
          result = await this.handleReadLink(args.url, args.prompt);

          // 简化响应格式以提高兼容性
          if (result && result.content && Array.isArray(result.content) && result.content[0]) {
            const simplifiedResult = {
              content: [{
                type: 'text',
                text: result.content[0].text
              }]
            };
            logger.mcpResponse(request.id, simplifiedResult);
            return simplifiedResult;
          }
        } else {
          throw new Error(`Unknown tool: ${name}`);
        }

        logger.mcpResponse(request.id, result);
        return result;
      } catch (error) {
        logger.mcpError(error, { request: request.params });
        const errorResult = {
          content: [{
            type: 'text',
            text: `❌ 处理失败: ${error.message}`
          }]
        };
        return errorResult;
      }
    });
  }

  async handleReadLink(url, customPrompt) {
    const startTime = Date.now();
    logger.info('LINK_PROCESS', `开始处理链接: ${url}`, { url, customPrompt });

    try {
      // 检查是否为data URL
      if (url.startsWith('data:')) {
        logger.debug('LINK_PROCESS', '检测到data URL，直接解析');
        const { contentType, buffer } = this.parseDataUrl(url);
        logger.info('LINK_PROCESS', 'data URL解析完成', { contentType, bufferSize: buffer.length });
        
        // 检测文件类型
        const fileType = this.detectFileType(url, contentType);
        logger.debug('LINK_PROCESS', '文件类型检测完成', { fileType, contentType });
        
        let result;
        if (this.isImageType(contentType, url)) {
          logger.info('LINK_PROCESS', '开始处理图片文件');
          result = await this.processImageWithAI(buffer, customPrompt);
        } else if (fileType && ['pdf', 'doc', 'docx', 'xlsx', 'xls', 'mp4', 'avi', 'mov', 'mkv'].includes(fileType)) {
          logger.info('LINK_PROCESS', `开始处理文档文件: ${fileType}`);
          result = await this.processDocumentWithAI(buffer, fileType, customPrompt);
        } else {
          logger.info('LINK_PROCESS', '不支持的data URL类型');
          throw new Error('不支持的data URL类型');
        }
        
        const duration = Date.now() - startTime;
        logger.performance('LINK_PROCESS', duration, { url, fileType, success: true });
        logger.info('LINK_PROCESS', `链接处理完成: ${url}`, { duration: `${duration}ms` });
        return result;
      }
      
      const parsedUrl = new URL(url);
      logger.debug('LINK_PROCESS', `URL解析成功`, { hostname: parsedUrl.hostname, pathname: parsedUrl.pathname });

      // 检测Bing图片搜索链接
      if (parsedUrl.hostname.includes('bing.com') && parsedUrl.pathname.includes('/images/search')) {
        const mediaUrl = parsedUrl.searchParams.get('mediaurl');
        if (mediaUrl) {
          const decodedImageUrl = decodeURIComponent(mediaUrl);
          logger.info('LINK_PROCESS', `检测到Bing图片搜索，提取实际图片链接`, { originalUrl: url, extractedUrl: decodedImageUrl });
          return await this.processImage(decodedImageUrl, customPrompt);
        }
      }

      // 获取文件信息
      logger.debug('LINK_PROCESS', '开始下载文件');
      const { contentType, buffer } = await this.downloadFile(url);
      logger.info('LINK_PROCESS', '文件下载完成', { contentType, bufferSize: buffer.length });

      // 检测文件类型
      const fileType = this.detectFileType(url, contentType);
      logger.debug('LINK_PROCESS', '文件类型检测完成', { fileType, contentType });

      let result;
      if (this.isImageType(contentType, url)) {
        logger.info('LINK_PROCESS', '开始处理图片文件');
        result = await this.processImageWithAI(buffer, customPrompt);
      } else if (fileType && ['pdf', 'doc', 'docx', 'xlsx', 'xls', 'mp4', 'avi', 'mov', 'mkv'].includes(fileType)) {
        logger.info('LINK_PROCESS', `开始处理文档文件: ${fileType}`);
        result = await this.processDocumentWithAI(buffer, fileType, customPrompt);
      } else {
        logger.info('LINK_PROCESS', '开始处理网页内容');
        result = await this.processWebpage(url);
      }

      const duration = Date.now() - startTime;
      logger.performance('LINK_PROCESS', duration, { url, fileType, success: true });
      logger.info('LINK_PROCESS', `链接处理完成: ${url}`, { duration: `${duration}ms` });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('LINK_PROCESS', `处理链接失败: ${url}`, error);
      logger.performance('LINK_PROCESS', duration, { url, success: false, error: error.message });

      return {
        content: [
          {
            type: 'text',
            text: `❌ 处理链接失败: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }

  parseDataUrl(dataUrl) {
    // 解析data URL格式: data:[<mediatype>][;base64],<data>
    const match = dataUrl.match(/^data:([^;]+)(;base64)?,(.+)$/);
    if (!match) {
      throw new Error('无效的data URL格式');
    }
    
    const contentType = match[1] || 'text/plain';
    const isBase64 = match[2] === ';base64';
    const data = match[3];
    
    let buffer;
    if (isBase64) {
      buffer = Buffer.from(data, 'base64');
    } else {
      buffer = Buffer.from(decodeURIComponent(data), 'utf8');
    }
    
    return {
      contentType,
      buffer
    };
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
          ],
          isError: false
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
              ],
              isError: false
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
            ],
            isError: false
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
            ],
            isError: false
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
          ],
          isError: false
        };
      }
    }

    throw new Error(`${fileType.toUpperCase()}文档处理服务不可用`);
  }

  async processPDFLocally(pdfBuffer, customPrompt) {
    console.log('📄 PDF解析功能已禁用（简化部署）');

    return {
      content: [
        {
          type: 'text',
          text: '抱歉，PDF解析功能暂时不可用。请提供其他格式的文档或网页链接。'
        }
      ]
    };
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
        ],
        isError: false
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
    console.log('🖼️ OCR功能已禁用（简化部署）');

    return {
      content: [
        {
          type: 'text',
          text: '抱歉，图片OCR识别功能暂时不可用。请提供文本内容或网页链接。'
        }
      ]
    };
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
    console.log('🔧 设置错误处理器...');
    // 设置错误处理
    this.server.onerror = (error) => {
      logger.serverError(error, 'MCP服务器错误');
    };

    process.on('SIGINT', async () => {
      logger.info('SERVER', '收到SIGINT信号，正在关闭服务器');
      await this.server.close();
      logger.info('SERVER', 'MCP服务器已关闭');
      process.exit(0);
    });
  }

  async startHttpServer(port = 80) {
    console.log(`🔧 准备启动HTTP服务器，端口: ${port}`);
    logger.info('SERVER', `开始启动HTTP服务器，端口: ${port}`);

    const httpServer = createServer(async (req, res) => {
      const requestStart = Date.now();
      const clientId = req.headers['x-client-id'] || `${req.connection.remoteAddress}-${Date.now()}`;

      // 记录HTTP请求
      logger.httpRequest(req);

      // 设置CORS头
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Last-Event-ID');

      // 处理OPTIONS预检请求
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        const responseTime = Date.now() - requestStart;
        logger.httpResponse(res, 200, responseTime);
        return;
      }

      // 处理健康检查请求
      if (req.method === 'GET' && (req.url === '/health' || req.url === '/healthz')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
        const responseTime = Date.now() - requestStart;
        logger.httpResponse(res, 200, responseTime);
        return;
      }

      // 处理GET请求 - SSE连接
      if (req.method === 'GET') {
        logger.sseConnection(clientId);

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.writeHead(200);

        // 发送初始化事件
        const initData = { "type": "initialized", "clientId": clientId };
        res.write('event: initialized\n');
        res.write(`data: ${JSON.stringify(initData)}\n\n`);
        logger.sseMessage(clientId, initData);

        // 保持连接活跃
        const keepAlive = setInterval(() => {
          const pingData = { "type": "ping", "timestamp": Date.now() };
          res.write('event: ping\n');
          res.write(`data: ${JSON.stringify(pingData)}\n\n`);
        }, 30000);

        req.on('close', () => {
          clearInterval(keepAlive);
          logger.sseDisconnection(clientId, 'client_disconnect');
        });

        const responseTime = Date.now() - requestStart;
        logger.httpResponse(res, 200, responseTime);
        return;
      }

      // 处理POST请求 - MCP协议
      if (req.method === 'POST') {
        // 检查是否是/mcp端点
        const url = new URL(req.url, `http://localhost:${port}`);
        logger.debug('HTTP_REQUEST', `POST请求到端点: ${url.pathname}`);

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
            logger.robotMessage('incoming', request);

            let response;

            // 处理/mcp端点的MCP协议初始化
            if (url.pathname === '/mcp') {
              if (request.method === 'initialize') {
                logger.info('MCP_PROTOCOL', 'MCP初始化请求', { clientCapabilities: request.params?.capabilities });
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
                logger.info('MCP_PROTOCOL', 'MCP初始化响应已发送');
              } else if (request.method === 'notifications/initialized') {
                logger.info('MCP_PROTOCOL', 'MCP初始化完成通知');
                // 处理初始化完成通知
                response = {
                  jsonrpc: '2.0',
                  id: request.id || null,
                  result: {}
                };
                logger.info('MCP_PROTOCOL', 'MCP握手完成，连接已建立');
              } else if (request.method === 'ping') {
                logger.debug('MCP_PROTOCOL', 'Ping请求');
                // 处理ping请求
                response = {
                  jsonrpc: '2.0',
                  id: request.id,
                  result: {}
                };
                logger.debug('MCP_PROTOCOL', 'Pong响应已发送');
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
                logger.info('MCP_PROTOCOL', 'tools/list请求');
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
                logger.info('MCP_PROTOCOL', 'tools/list响应已发送');
              } else if (request.method === 'tools/call') {
                logger.info('MCP_PROTOCOL', `tools/call请求: ${request.params.name}`, { arguments: request.params.arguments });
                if (request.params.name === 'read_link') {
                  const result = await this.handleReadLink(request.params.arguments.url);
                  response = {
                    jsonrpc: '2.0',
                    id: request.id,
                    result: result
                  };
                  logger.info('MCP_PROTOCOL', `tools/call响应已发送: ${request.params.name}`);
                } else {
                  logger.error('MCP_PROTOCOL', `未知工具: ${request.params.name}`);
                  throw new Error(`Unknown tool: ${request.params.name}`);
                }
              } else {
                logger.error('MCP_PROTOCOL', `未知方法: ${request.method}`);
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
                    result: result
                  };
                } else {
                  throw new Error(`Unknown tool: ${request.params.name}`);
                }
              } else {
                throw new Error(`Unknown method: ${request.method}`);
              }
            }

            // 验证响应格式
            if (!response || typeof response !== 'object') {
              logger.error('MCP_PROTOCOL', '响应格式无效');
              throw new Error('Invalid response format');
            }

            // 确保所有响应都有jsonrpc字段
            if (!response.jsonrpc) {
              response.jsonrpc = '2.0';
            }

            logger.debug('MCP_PROTOCOL', 'MCP响应已生成', { responseId: response.id, method: request.method });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response));
            logger.debug('HTTP', 'MCP响应已发送', { statusCode: 200 });
          } catch (error) {
            logger.error('MCP_PROTOCOL', 'MCP请求处理错误', {
              error: error.message,
              stack: error.stack,
              requestId: request?.id,
              method: request?.method
            });

            // 确保错误响应格式正确
            const errorResponse = {
              jsonrpc: '2.0',
              id: request?.id || null,
              error: {
                code: -32603,
                message: error.message || 'Internal error',
                data: {
                  type: 'request_error',
                  stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
                }
              }
            };

            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(errorResponse));
            logger.debug('HTTP', 'MCP错误响应已发送', { statusCode: 500, errorCode: -32603 });
          }
        });

        req.on('error', (error) => {
          logger.error('HTTP', 'HTTP请求错误', { error: error.message, stack: error.stack });

          const errorResponse = {
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32700,
              message: 'Parse error',
              data: {
                type: 'connection_error',
                originalError: error.message
              }
            }
          };

          res.writeHead(400, { 'Content-Type': 'application/json' });
          logger.debug('HTTP', 'HTTP错误响应已发送', { statusCode: 400, errorCode: -32700 });
          res.end(JSON.stringify(errorResponse));
        });

        return;
      }

      // 其他方法不支持
      res.writeHead(405);
      res.end(JSON.stringify({ error: 'Method not allowed' }));
    });

    // 启动HTTP服务器
    httpServer.listen(port, '0.0.0.0', () => {
      logger.info('SERVER', `MCP SSE Server started on port ${port}`);
      logger.info('SERVER', `Server endpoint: http://0.0.0.0:${port}`);
      logger.info('SERVER', `MCP Protocol endpoint: http://0.0.0.0:${port}/mcp`);
      logger.info('SERVER', `Health check endpoint: http://0.0.0.0:${port}/health`);
      logger.info('SERVER', 'Available tools: read_link');
      logger.info('SERVER', 'Supports MCP initialize/initialized handshake');
    });

    return httpServer;
  }
}

// 导出类以供测试使用
export { MCPHtmlServer };

// 启动服务器
// 主启动函数
async function main() {
  console.log('🚀 开始启动MCP HTML服务器...');
  logger.info('SERVER', '正在启动MCP HTML服务器...');

  try {
    // Canvas功能已禁用以简化部署
    console.log('🔧 跳过Canvas初始化，开始创建服务器实例...');

    const server = new MCPHtmlServer();
    logger.info('SERVER', '服务器实例创建成功');

    const args = process.argv.slice(2);
    const portIndex = args.indexOf('--port');
    const port = process.env.PORT || (portIndex !== -1 ? parseInt(args[portIndex + 1]) : 80);

    logger.info('SERVER', `配置端口: ${port}`);

    server.startHttpServer(port).then((httpServer) => {
      if (httpServer) {
        logger.info('SERVER', '服务器启动完成');
      } else {
        logger.info('SERVER', '服务器已在运行，跳过启动');
        process.exit(0);
      }
    }).catch((error) => {
      logger.error('SERVER', '服务器启动失败', { error: error.message, stack: error.stack });
      process.exit(1);
    });

    process.on('SIGINT', () => {
      logger.info('SERVER', '正在关闭服务器...');
      process.exit(0);
    });
  } catch (error) {
    logger.error('SERVER', '创建服务器实例失败', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// 只在直接运行此文件时启动服务器
// 修复Windows路径分隔符问题和Docker环境兼容性
const currentFileUrl = import.meta.url;
const scriptPath = `file:///${process.argv[1].replace(/\\/g, '/')}`;

// 检查是否为主模块（支持Docker环境）
const isMainModule = currentFileUrl === scriptPath ||
  process.argv[1].endsWith('index.js') ||
  process.argv[1].endsWith('/app/index.js');

if (isMainModule) {
  main().catch(error => {
    console.error('❌ 启动失败:', error);
    process.exit(1);
  });
}