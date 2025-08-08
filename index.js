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
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    logger.info('LINK_PROCESS', `开始处理链接: ${url}`, { taskId, url, customPrompt });

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

      // 检测抖音视频链接
      if (this.isDouyinUrl(parsedUrl)) {
        logger.info('LINK_PROCESS', '检测到抖音视频链接，开始处理');
        return await this.processDouyinVideo(url, customPrompt);
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
        
        // 对于PDF文件，使用快速响应机制避免云端超时
        if (fileType === 'pdf' && buffer.length > 1024 * 1024) { // 大于1MB的PDF
          logger.info('LINK_PROCESS', '检测到大型PDF文件，使用快速处理模式');
          result = await this.processPDFQuickly(buffer, customPrompt, taskId);
        } else {
          result = await this.processDocumentWithAI(buffer, fileType, customPrompt);
        }
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
      timeout: 120000, // 增加到120秒，支持大文件下载
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
    const startTime = Date.now();

    // PDF文件强制使用Seed大模型
    if (fileType === 'pdf') {
      if (!this.config.seed?.apiKey) {
        throw new Error('PDF处理需要Seed大模型，但未配置API密钥');
      }
      
      try {
        console.log('🌱 使用Seed大模型处理PDF文档...');
        const result = await this.aiServices.processDocumentWithSeed(documentBuffer, fileType, customPrompt);
        
        const duration = Date.now() - startTime;
        logger.performance('PDF_PROCESS', duration, { fileType, success: true });
        
        if (result.success) {
          return {
            content: [
              {
                type: 'text',
                text: `🌱 Seed大模型PDF分析结果:\n\n${result.content}\n\n📊 使用情况: ${JSON.stringify(result.usage)}\n\n📄 文件信息: ${JSON.stringify(result.extractedData, null, 2)}\n\n⏱️ 处理时间: ${duration}ms`
              }
            ],
            isError: false
          };
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error('PDF_PROCESS', `PDF处理失败: ${error.message}`, { duration: `${duration}ms` });
        
        // 超时处理
        if (error.message.includes('timeout') || error.message.includes('超时')) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ PDF处理超时（${duration}ms），请稍后重试或检查网络连接。\n\n错误详情: ${error.message}`
              }
            ],
            isError: true
          };
        }
        
        return {
          content: [
            {
              type: 'text',
              text: `❌ PDF处理失败: ${error.message}\n\n处理时间: ${duration}ms`
            }
          ],
          isError: true
        };
      }
    }

    // 视频文件优先使用Seed大模型
    if (['mp4', 'avi', 'mov', 'mkv'].includes(fileType)) {
      if (this.config.seed?.apiKey) {
        try {
          console.log('🌱 使用Seed大模型处理视频文件...');
          const result = await this.aiServices.processDocumentWithSeed(documentBuffer, fileType, customPrompt);
          
          const duration = Date.now() - startTime;
          logger.performance('VIDEO_PROCESS', duration, { fileType, success: true });
          
          if (result.success) {
            return {
              content: [
                {
                  type: 'text',
                  text: `🌱 Seed大模型视频分析结果:\n\n${result.content}\n\n📊 使用情况: ${JSON.stringify(result.usage)}\n\n📄 文件信息: ${JSON.stringify(result.extractedData, null, 2)}\n\n⏱️ 处理时间: ${duration}ms`
                }
              ],
              isError: false
            };
          }
        } catch (error) {
          const duration = Date.now() - startTime;
          logger.error('VIDEO_PROCESS', `视频处理失败: ${error.message}`, { duration: `${duration}ms` });
          console.error('❌ Seed大模型处理视频失败:', error.message);
        }
      }
    }

    // 对于Excel文件，优先使用通义千问
    if (['xlsx', 'xls'].includes(fileType)) {
      if (this.config.qwen?.apiKey) {
        try {
          console.log('🤖 使用通义千问处理Excel文档...');
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

    // PDF文件最高优先级：使用本地文本提取 + 通义千问分析
    if (fileType === 'pdf') {
      try {
        console.log('📄 使用本地PDF文本提取 + 通义千问分析（推荐方式）...');
        const result = await this.processPDFLocally(documentBuffer, customPrompt);
        if (!result.isError) {
          return result;
        }
        console.log('⚠️ 本地PDF处理失败，尝试备选方案...');
      } catch (error) {
        console.error('❌ 本地PDF处理失败:', error.message);
      }
    }

    // PDF文件备选方案1：使用Qwen-Long处理（专门的文档理解模型）
    if (fileType === 'pdf' && this.config.qwenLong?.apiKey) {
      try {
        console.log('🚀 使用Qwen-Long处理PDF文档（备选方案1）...');
        const result = await this.aiServices.processDocumentWithQwenLong(documentBuffer, fileType, customPrompt);
        if (result.success) {
          return {
            content: [
              {
                type: 'text',
                text: `🚀 Qwen-Long PDF专业分析结果:\n\n${result.content}\n\n📊 使用情况: ${JSON.stringify(result.usage)}\n\n📄 文件信息: ${JSON.stringify(result.extractedData, null, 2)}\n\n🆔 文件ID: ${result.fileId}`
              }
            ],
            isError: false
          };
        }
      } catch (error) {
        console.error('❌ Qwen-Long处理PDF失败:', error.message);
      }
    }

    // PDF文件备选方案2：使用通义千问VL处理
    if (fileType === 'pdf' && this.config.qwen?.apiKey) {
      try {
        console.log('🤖 使用通义千问VL作为PDF处理备选方案2...');
        const result = await this.aiServices.processDocumentWithQwen(documentBuffer, fileType, customPrompt);
        if (result.success) {
          return {
            content: [
              {
                type: 'text',
                text: `🤖 通义千问VL PDF分析结果:\n\n${result.content}\n\n📊 使用情况: ${JSON.stringify(result.usage)}\n\n📄 文件信息: ${JSON.stringify(result.extractedData, null, 2)}`
              }
            ],
            isError: false
          };
        }
      } catch (error) {
        console.error('❌ 通义千问VL处理PDF失败:', error.message);
      }
    }

    // PDF文件备选方案3：火山引擎
    if (fileType === 'pdf' && this.config.volcengine?.accessKey) {
      try {
        console.log('🚀 使用火山引擎作为PDF处理备选方案3...');
        const result = await this.aiServices.processDocumentWithVolcengine(documentBuffer, fileType, customPrompt);
        if (result.success) {
          return {
            content: [
              {
                type: 'text',
                text: `🚀 火山引擎PDF分析结果:\n\n${result.content}\n\n📊 使用情况: ${JSON.stringify(result.usage)}`
              }
            ],
            isError: false
          };
        }
      } catch (error) {
        console.error('❌ 火山引擎处理PDF失败:', error.message);
      }
    }

    // PDF文件备选方案4：GLM-4
    if (fileType === 'pdf' && this.config.glm4?.apiKey) {
      try {
        console.log('🤖 使用GLM-4作为PDF处理备选方案4...');
        const result = await this.aiServices.processDocumentWithGLM4(documentBuffer, fileType, customPrompt);
        if (result.success) {
          return {
            content: [
              {
                type: 'text',
                text: `🤖 GLM-4 PDF分析结果:\n\n${result.content}\n\n📊 使用情况: ${JSON.stringify(result.usage)}`
              }
            ],
            isError: false
          };
        }
      } catch (error) {
        console.error('❌ GLM-4处理PDF失败:', error.message);
      }
    }

    // 非PDF文档（DOC、DOCX）优先使用GLM-4处理
    if (this.config.glm4?.apiKey && ['doc', 'docx'].includes(fileType)) {
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

    // 通义千问作为非PDF文档的备选方案
    if (this.config.qwen?.apiKey && ['doc', 'docx'].includes(fileType)) {
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
    console.log('📄 开始本地PDF文本提取...');

    try {
      // 使用AI服务中的PDF解析功能
      const pdfData = await this.aiServices.parsePDF(pdfBuffer);
      console.log(`✅ PDF解析成功，共${pdfData.numPages}页，提取了${pdfData.text.length}个字符`);

      // 优先使用Seed大模型分析PDF文本内容
      if (this.config.seed?.apiKey && pdfData.text.trim()) {
        console.log('🌱 使用Seed大模型分析PDF文本内容...');

        const prompt = customPrompt || "请分析这个PDF文档的内容，提取关键信息并进行总结。";

        try {
          const response = await this.aiServices.seedClient.chat.completions.create({
            model: this.config.seed.model,
            messages: [
              {
                role: "system",
                content: "你是一个专业的文档分析助手。用户会提供从PDF文档中提取出来的文本内容，你需要对这些内容进行分析、整理和总结。"
              },
              {
                role: "user",
                content: `以下是我从PDF文档中提取出来的文本内容，请帮我${prompt}\n\n文档信息：\n- 总页数：${pdfData.numPages}页\n- 文本长度：${pdfData.text.length}个字符\n\n提取的文本内容：\n${pdfData.text}`
              }
            ],
            max_tokens: 4000,
            temperature: 0.1
          });

          return {
            content: [
              {
                type: 'text',
                text: `📄 PDF文本提取+AI分析结果:\n\n${response.choices[0].message.content}\n\n📊 文档统计：\n- 页数：${pdfData.numPages}页\n- 提取字符数：${pdfData.text.length}个\n- 处理方式：本地文本提取 + Seed大模型分析`
              }
            ],
            isError: false
          };
        } catch (aiError) {
          console.error('❌ Seed大模型分析失败:', aiError.message);
          // 如果AI分析失败，返回原始文本
          return {
            content: [
              {
                type: 'text',
                text: `📄 PDF文本提取成功（AI分析失败）:\n\n${pdfData.text}\n\n📊 文档统计：\n- 页数：${pdfData.numPages}页\n- 提取字符数：${pdfData.text.length}个\n- 处理方式：本地文本提取\n\n⚠️ AI分析失败：${aiError.message}`
              }
            ],
            isError: false
          };
        }
      } else {
        // 如果没有配置Seed大模型或文本为空，直接返回提取的文本
        return {
          content: [
            {
              type: 'text',
              text: `📄 PDF文本提取结果:\n\n${pdfData.text || '未能提取到文本内容'}\n\n📊 文档统计：\n- 页数：${pdfData.numPages}页\n- 提取字符数：${pdfData.text.length}个\n- 处理方式：本地文本提取`
            }
          ],
          isError: false
        };
      }
    } catch (error) {
      console.error('❌ PDF处理失败:', error.message);
      return {
        content: [
          {
            type: 'text',
            text: `❌ PDF处理失败：${error.message}\n\n建议：\n1. 确保PDF文件格式正确且未加密\n2. 检查文件是否损坏\n3. 尝试使用其他格式的文档`
          }
        ],
        isError: true
      };
    }
  }

  async processPDFQuickly(pdfBuffer, customPrompt, taskId) {
    console.log('📄 开始快速PDF处理...');
    logger.info('PDF_QUICK_PROCESS', '开始快速PDF处理', { taskId });

    try {
      // 使用AI服务中的PDF解析功能，但只提取前几页
      const pdfData = await this.aiServices.parsePDF(pdfBuffer, { maxPages: 3 });
      logger.info('PDF_QUICK_PROCESS', `PDF快速解析成功，共${pdfData.numPages}页，已处理${Math.min(3, pdfData.numPages)}页`, { taskId });

      if (!pdfData.text || !pdfData.text.trim()) {
        // 如果文本提取失败，返回基本信息
        return {
          content: [
            {
              type: 'text',
              text: `📄 PDF文档信息:\n\n文档页数: ${pdfData.numPages}页\n文件大小: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)}MB\n\n⚠️ 注意：由于云端处理时间限制，仅提取了前3页内容。如需完整分析，请使用本地服务器。\n\n任务ID: ${taskId}`
            }
          ],
          isError: false
        };
      }

      // 强制使用Seed大模型进行快速分析
      let analysisResult = null;
      if (!this.config.seed?.apiKey) {
        throw new Error('PDF快速处理需要Seed大模型，但未配置API密钥');
      }
      
      if (pdfData.text.trim()) {
        try {
          console.log('🌱 使用Seed大模型进行快速PDF分析...');
          const prompt = customPrompt || "请快速分析这个PDF文档的内容，提取关键信息并进行总结。";
          const startAnalysisTime = Date.now();
          
          analysisResult = await this.aiServices.analyzeTextWithSeed(pdfData.text, prompt);
          
          const analysisDuration = Date.now() - startAnalysisTime;
          logger.performance('PDF_QUICK_ANALYSIS', analysisDuration, { taskId, success: true });
          
        } catch (error) {
          const analysisDuration = Date.now() - startAnalysisTime;
          logger.error('PDF_QUICK_ANALYSIS', `PDF快速分析失败: ${error.message}`, { taskId, duration: `${analysisDuration}ms` });
          
          // 超时处理
          if (error.message.includes('timeout') || error.message.includes('超时')) {
            return {
              content: [
                {
                  type: 'text',
                  text: `❌ PDF快速分析超时（${analysisDuration}ms）\n\n文档信息:\n- 页数：${pdfData.numPages}页\n- 已处理页数：${Math.min(3, pdfData.numPages)}页\n- 文件大小：${(pdfBuffer.length / 1024 / 1024).toFixed(2)}MB\n\n任务ID: ${taskId}\n\n请稍后重试或检查网络连接。`
                }
              ],
              isError: true
            };
          }
          
          console.error('❌ Seed大模型快速分析失败:', error.message);
        }
      }

      // 构建返回结果
      let resultText = `📄 PDF快速分析结果:\n\n文档页数: ${pdfData.numPages}页\n已分析页数: ${Math.min(3, pdfData.numPages)}页\n文件大小: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)}MB\n\n`;

      if (analysisResult && analysisResult.success) {
        resultText += `🤖 AI分析结果:\n${analysisResult.content}\n\n📊 使用情况: ${JSON.stringify(analysisResult.usage)}\n\n`;
      } else {
        // 快速分析（限制文本长度避免超时）
        const limitedText = pdfData.text.length > 2000 ? pdfData.text.substring(0, 2000) + '...' : pdfData.text;
        resultText += `📝 内容预览:\n${limitedText}\n\n`;
      }

      resultText += `⚠️ 注意：由于云端处理时间限制，这是快速分析结果。如需完整分析，请使用本地服务器。\n\n任务ID: ${taskId}`;

      return {
        content: [
          {
            type: 'text',
            text: resultText
          }
        ],
        isError: false
      };

    } catch (error) {
      logger.error('PDF_QUICK_PROCESS', 'PDF快速处理失败', { taskId, error: error.message });
      return {
        content: [
          {
            type: 'text',
            text: `❌ PDF快速处理失败: ${error.message}\n\n任务ID: ${taskId}\n\n建议：请尝试使用本地服务器进行完整处理。`
          }
        ],
        isError: true
      };
    }
  }

  async processWebpage(url) {
    try {
      const response = await axios.get(url, {
        timeout: 60000, // 增加到60秒，与文件下载保持一致
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
        timeout: 60000, // 增加到60秒，与其他方法保持一致
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

  // 检测是否为抖音视频链接
  isDouyinUrl(parsedUrl) {
    const douyinDomains = [
      'douyin.com',
      'v.douyin.com',
      'www.douyin.com',
      'iesdouyin.com',
      'www.iesdouyin.com'
    ];
    return douyinDomains.some(domain => parsedUrl.hostname.includes(domain));
  }

  // 处理抖音视频
  async processDouyinVideo(url, customPrompt) {
    const startTime = Date.now();
    logger.info('DOUYIN_PROCESS', `开始处理抖音视频: ${url}`);

    try {
      // 使用axios获取抖音页面内容，设置超时
      const response = await axios.get(url, {
        timeout: 30000, // 30秒超时
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        maxRedirects: 5
      });

      const $ = cheerio.load(response.data);
      
      // 改进的视频信息提取
      const videoInfo = {
        title: '抖音短视频',
        description: '抖音平台视频内容',
        keywords: '抖音,短视频,社交媒体',
        url: url,
        platform: '抖音',
        extractedContent: ''
      };

      // 多种方式提取信息
      try {
        // 提取标题
        const titleSources = [
          $('title').text(),
          $('meta[property="og:title"]').attr('content'),
          $('meta[name="title"]').attr('content'),
          $('h1').first().text(),
          $('[class*="title"]').first().text()
        ];
        
        for (const title of titleSources) {
          if (title && title.trim() && title.length > 3 && !title.includes('抖音')) {
            videoInfo.title = title.trim().substring(0, 100);
            break;
          }
        }

        // 提取描述
        const descSources = [
          $('meta[name="description"]').attr('content'),
          $('meta[property="og:description"]').attr('content'),
          $('meta[name="twitter:description"]').attr('content'),
          $('[class*="desc"]').first().text(),
          $('p').first().text()
        ];
        
        for (const desc of descSources) {
          if (desc && desc.trim() && desc.length > 5) {
            videoInfo.description = desc.trim().substring(0, 200);
            break;
          }
        }

        // 提取关键词
        const keywords = $('meta[name="keywords"]').attr('content');
        if (keywords && keywords.trim()) {
          videoInfo.keywords = keywords.trim();
        }

        // 提取页面中的文本内容作为补充
        const textContent = $('body').text().replace(/\s+/g, ' ').trim();
        if (textContent && textContent.length > 10) {
          videoInfo.extractedContent = textContent.substring(0, 500);
        }
      } catch (extractError) {
        logger.warn('DOUYIN_PROCESS', '视频信息提取部分失败', { error: extractError.message });
      }

      logger.info('DOUYIN_PROCESS', '抖音视频信息提取完成', videoInfo);

      // 使用Seed大模型进行智能分析
      const prompt = customPrompt || '请作为专业的短视频内容分析师，分析这个抖音视频的内容特征、可能主题和观看价值。';
      const analysisPrompt = `${prompt}\n\n请基于以下抖音视频信息进行智能分析：\n\n📱 平台：${videoInfo.platform}\n🎬 标题：${videoInfo.title}\n📝 描述：${videoInfo.description}\n🏷️ 关键词：${videoInfo.keywords}\n🔗 链接：${videoInfo.url}\n\n📄 页面内容摘要：${videoInfo.extractedContent}\n\n请提供：\n1. 视频内容主题分析\n2. 目标受众推测\n3. 内容价值评估\n4. 观看建议`;

      const result = await this.aiServices.processWithSeed(analysisPrompt, 'douyin_video');
      
      const duration = Date.now() - startTime;
      logger.performance('DOUYIN_PROCESS', duration, { url, success: true });
      logger.info('DOUYIN_PROCESS', `抖音视频处理完成: ${url}`, { duration: `${duration}ms` });
      
      return {
        content: [
          {
            type: 'text',
            text: `🎵 抖音视频智能分析结果:\n\n${result}\n\n📱 视频详细信息:\n- 🎬 标题：${videoInfo.title}\n- 📝 描述：${videoInfo.description}\n- 🏷️ 关键词：${videoInfo.keywords}\n- 🔗 链接：${videoInfo.url}\n- 📱 平台：${videoInfo.platform}\n\n📄 提取内容摘要：${videoInfo.extractedContent ? videoInfo.extractedContent.substring(0, 100) + '...' : '无额外内容'}\n\n⏱️ 处理时间：${duration}ms`
          }
        ],
        isError: false
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('DOUYIN_PROCESS', `抖音视频处理失败: ${error.message}`, { url, error: error.message, duration: `${duration}ms` });
      
      // 超时处理
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ 抖音视频处理超时（${duration}ms），请稍后重试或检查网络连接。\n\n错误详情：${error.message}`
            }
          ],
          isError: true
        };
      }
      
      return {
        content: [
          {
            type: 'text',
            text: `❌ 抖音视频处理失败：${error.message}\n\n处理时间：${duration}ms`
          }
        ],
        isError: true
      };
    }
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

      // 设置请求超时时间为3分钟，支持大文件处理
      req.setTimeout(180000);
      res.setTimeout(180000);

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