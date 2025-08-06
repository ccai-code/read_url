import axios from 'axios';
import OpenAI from 'openai';
import crypto from 'crypto';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import xlsx from 'xlsx';

export class AIServices {
  constructor(config) {
    this.config = config;

    // 初始化OpenAI客户端（用于通义千问）
    this.openai = new OpenAI({
      apiKey: this.config.qwen.apiKey,
      baseURL: this.config.qwen.baseUrl
    });

    // 初始化GLM-4客户端
    if (this.config.glm4 && this.config.glm4.apiKey) {
      this.glm4Client = new OpenAI({
        apiKey: this.config.glm4.apiKey,
        baseURL: this.config.glm4.baseUrl
      });
    }

    // 初始化火山引擎客户端
    if (this.config.volcengine && this.config.volcengine.apiKey) {
      this.volcengineClient = new OpenAI({
        apiKey: this.config.volcengine.apiKey,
        baseURL: this.config.volcengine.baseUrl
      });
    }
  }

  // GLM-4文档处理方法
  async processDocumentWithGLM4(documentBuffer, fileType, prompt = "请提取并整理这个文档中的所有文字内容，保持原有的结构和格式。") {
    try {
      console.log('🔍 发送GLM-4 API请求...');

      // 提取文档文本
      let documentText = '';

      if (fileType === 'pdf') {
        throw new Error('PDF处理功能已禁用以简化部署。请使用其他格式的文档。');
      } else if (fileType === 'docx') {
        const result = await mammoth.extractRawText({ buffer: documentBuffer });
        documentText = result.value;
      } else if (fileType === 'txt') {
        // 文本文件处理
        documentText = documentBuffer.toString('utf-8');
      } else if (fileType === 'xlsx' || fileType === 'xls') {
        // Excel文件处理
        const workbook = xlsx.read(documentBuffer, { type: 'buffer' });
        const sheets = [];

        workbook.SheetNames.forEach(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
          const csvData = xlsx.utils.sheet_to_csv(worksheet);

          sheets.push({
            name: sheetName,
            data: jsonData,
            csv: csvData
          });
        });

        // 将Excel数据转换为文本描述
        documentText = this.formatExcelDataToText(sheets);
      }

      const response = await this.glm4Client.chat.completions.create({
        model: this.config.glm4.model,
        messages: [
          {
            role: "system",
            content: "你是一个专业的文档处理助手。用户会提供已经从PDF、DOCX等文档中提取出来的文本内容，你需要对这些文本进行分析、整理和总结。"
          },
          {
            role: "user",
            content: `以下是我已经从${fileType}文档中提取出来的文本内容，请帮我${prompt}\n\n提取的文本内容：\n${documentText}`
          }
        ],
        max_tokens: 4000,
        temperature: 0.1
      });

      return {
        success: true,
        content: response.choices[0].message.content,
        usage: response.usage,
        model: response.model
      };

    } catch (error) {
      console.error('❌ GLM-4 API调用失败:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 阿里通义千问图片识别（使用OpenAI兼容模式）
  async analyzeImageWithQwen(imageBuffer, prompt = "请详细描述这张图片中的所有文字内容，包括标题、正文、标签等。如果是表格，请按行列结构输出。") {
    try {
      const base64Image = imageBuffer.toString('base64');

      console.log('🔍 发送通义千问API请求...');
      console.log('📝 模型:', this.config.qwen.model);
      console.log('🔗 URL:', this.config.qwen.baseUrl);

      const response = await this.openai.chat.completions.create({
        model: this.config.qwen.model,
        messages: [
          {
            role: "system",
            content: [{
              type: "text",
              text: "You are a helpful assistant that can analyze images and extract text content."
            }]
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              },
              {
                type: "text",
                text: prompt
              }
            ]
          }
        ],
        max_tokens: 2000,
        temperature: 0.1
      });

      console.log('✅ 通义千问API响应成功');

      if (response.choices && response.choices[0]) {
        return {
          success: true,
          content: response.choices[0].message.content,
          usage: response.usage,
          model: response.model
        };
      } else {
        throw new Error('通义千问API返回格式异常');
      }
    } catch (error) {
      console.error('❌ 通义千问API调用失败:', error.message);

      let errorMessage = error.message;

      if (error.status) {
        switch (error.status) {
          case 401:
            errorMessage = `认证失败 (401): API密钥无效或已过期。请检查配置文件中的apiKey。`;
            break;
          case 403:
            errorMessage = `权限不足 (403): 没有访问该模型的权限。请检查账户权限。`;
            break;
          case 404:
            errorMessage = `模型不存在 (404): 模型名称可能不正确。`;
            break;
          case 429:
            errorMessage = `请求频率限制 (429): 请求过于频繁，请稍后重试。`;
            break;
          case 400:
            errorMessage = `请求参数错误 (400): ${error.message}`;
            break;
          case 500:
            errorMessage = `服务器内部错误 (500): 通义千问服务暂时不可用。`;
            break;
          default:
            errorMessage = `HTTP错误 (${error.status}): ${error.message}`;
        }
      }

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  // 通义千问文档处理方法（支持Word、Excel、视频等多种格式）
  async processDocumentWithQwen(documentBuffer, fileType, prompt = "请提取并整理这个文档中的所有文字内容，保持原有的结构和格式。") {
    try {
      console.log('🔍 发送通义千问文档处理请求...');
      console.log(`📄 文件类型: ${fileType}`);

      // 提取文档文本
      let documentText = '';
      let extractedData = null;

      if (fileType === 'pdf') {
        throw new Error('PDF处理功能已禁用以简化部署。请使用其他格式的文档。');
        extractedData = { pages: pdfData.numpages, textLength: documentText.length };
      } else if (fileType === 'docx' || fileType === 'doc') {
        // Word文档处理
        const result = await mammoth.extractRawText({ buffer: documentBuffer });
        documentText = result.value;
        extractedData = { textLength: documentText.length, hasImages: result.messages.some(m => m.type === 'warning' && m.message.includes('image')) };
      } else if (fileType === 'xlsx' || fileType === 'xls') {
        // Excel文档处理
        const workbook = xlsx.read(documentBuffer, { type: 'buffer' });
        const sheets = [];

        workbook.SheetNames.forEach(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
          const csvData = xlsx.utils.sheet_to_csv(worksheet);

          sheets.push({
            name: sheetName,
            data: jsonData,
            csv: csvData
          });
        });

        // 将Excel数据转换为文本描述
        documentText = this.formatExcelDataToText(sheets);
        extractedData = {
          sheetsCount: workbook.SheetNames.length,
          sheetNames: workbook.SheetNames,
          totalRows: sheets.reduce((sum, sheet) => sum + sheet.data.length, 0)
        };
      } else if (fileType === 'txt') {
        // 文本文件处理
        documentText = documentBuffer.toString('utf-8');
        extractedData = {
          textLength: documentText.length,
          encoding: 'utf-8'
        };
      } else if (fileType === 'mp4' || fileType === 'avi' || fileType === 'mov' || fileType === 'mkv') {
        // 视频文件处理（提取基本信息）
        documentText = `这是一个${fileType.toUpperCase()}格式的视频文件，文件大小约为${(documentBuffer.length / 1024 / 1024).toFixed(2)}MB。\n\n由于当前版本暂不支持视频内容分析，建议：\n1. 如果视频包含字幕，请提供字幕文件\n2. 如果需要分析视频截图，请提供关键帧图片\n3. 如果需要音频转录，请提供音频文件`;
        extractedData = {
          fileSize: documentBuffer.length,
          fileSizeMB: (documentBuffer.length / 1024 / 1024).toFixed(2)
        };
      } else {
        throw new Error(`不支持的文件类型: ${fileType}`);
      }

      // 发送给通义千问进行分析
      const response = await this.openai.chat.completions.create({
        model: this.config.qwen.model,
        messages: [
          {
            role: "system",
            content: "你是一个专业的文档分析助手。用户会提供已经从各种文档（PDF、Word、Excel、视频等）中提取出来的文本内容或数据，你需要对这些内容进行分析、整理和总结。"
          },
          {
            role: "user",
            content: `以下是我已经从${fileType}文档中提取出来的内容，请帮我${prompt}\n\n文件信息：${JSON.stringify(extractedData, null, 2)}\n\n提取的内容：\n${documentText}`
          }
        ],
        max_tokens: 4000,
        temperature: 0.1
      });

      return {
        success: true,
        content: response.choices[0].message.content,
        usage: response.usage,
        model: response.model,
        extractedData: extractedData,
        fileType: fileType
      };
    } catch (error) {
      console.error('❌ 通义千问文档处理失败:', error.message);
      return {
        success: false,
        error: error.message,
        fileType: fileType
      };
    }
  }

  // 将Excel数据格式化为文本
  formatExcelDataToText(sheets) {
    let text = '';

    sheets.forEach((sheet, index) => {
      text += `\n=== 工作表 ${index + 1}: ${sheet.name} ===\n`;

      if (sheet.data.length > 0) {
        // 添加表头
        if (sheet.data[0]) {
          text += '表头: ' + sheet.data[0].join(' | ') + '\n';
        }

        // 添加数据行（最多显示前20行）
        const maxRows = Math.min(20, sheet.data.length);
        for (let i = 1; i < maxRows; i++) {
          if (sheet.data[i] && sheet.data[i].length > 0) {
            text += `第${i}行: ` + sheet.data[i].join(' | ') + '\n';
          }
        }

        if (sheet.data.length > 20) {
          text += `... (还有 ${sheet.data.length - 20} 行数据)\n`;
        }
      } else {
        text += '(空工作表)\n';
      }

      text += '\n';
    });

    return text;
  }

  // 火山引擎文档处理
  async processDocumentWithVolcengine(documentBuffer, fileType, prompt = "请提取并整理这个文档中的所有文字内容，保持原有的结构和格式。") {
    try {
      console.log('🔍 发送火山引擎API请求...');
      console.log('📝 模型:', this.config.volcengine.model);
      console.log('🔗 URL:', this.config.volcengine.baseUrl);

      // 将文档内容转换为文本
      let documentText = '';

      if (fileType === 'txt') {
        // 直接读取文本文件内容
        documentText = documentBuffer.toString('utf-8');
      } else if (fileType === 'pdf') {
        throw new Error('PDF处理功能已禁用以简化部署。请使用其他格式的文档。');
      } else if (fileType === 'docx') {
        // 使用mammoth解析Word文档
        console.log('📄 正在解析Word文档...');
        try {
          const result = await mammoth.extractRawText({ buffer: documentBuffer });
          documentText = result.value;
          console.log(`✅ Word文档解析成功，提取了 ${documentText.length} 个字符`);
        } catch (docError) {
          console.error('Word文档解析失败:', docError.message);
          documentText = `Word文档解析失败: ${docError.message}。文件大小: ${(documentBuffer.length / 1024).toFixed(2)} KB`;
        }
      } else {
        // 对于其他文件类型，提供文件信息
        documentText = `这是一个 ${fileType.toUpperCase()} 文件，大小为 ${(documentBuffer.length / 1024).toFixed(2)} KB。\n\n注意：当前仅支持PDF、DOCX和TXT文件的文本提取。`;
      }

      // 检查提取的文本是否为空
      if (!documentText.trim()) {
        documentText = `文档内容为空或无法提取文本。文件类型: ${fileType}，大小: ${(documentBuffer.length / 1024).toFixed(2)} KB`;
      }

      // 使用Chat Completions API处理文本
      const response = await this.volcengineClient.chat.completions.create({
        model: this.config.volcengine.model,
        messages: [
          {
            role: "system",
            content: "你是一个专业的文档处理助手，能够准确提取和整理各种文档中的文字内容。"
          },
          {
            role: "user",
            content: `${prompt}\n\n文档类型：${fileType}\n文档内容：\n${documentText}`
          }
        ],
        max_tokens: 4000,
        temperature: 0.1
      });

      console.log('✅ 火山引擎API响应成功');

      if (response.choices && response.choices[0]) {
        return {
          success: true,
          content: response.choices[0].message.content,
          usage: response.usage,
          model: response.model
        };
      } else {
        throw new Error('火山引擎API返回格式异常');
      }
    } catch (error) {
      console.error('❌ 火山引擎API调用失败:', error.message);

      let errorMessage = error.message;

      if (error.status) {
        switch (error.status) {
          case 401:
            errorMessage = `认证失败 (401): API密钥无效或已过期。请检查配置文件中的apiKey。`;
            break;
          case 403:
            errorMessage = `权限不足 (403): 没有访问该模型的权限。请检查账户权限。`;
            break;
          case 404:
            errorMessage = `模型不存在 (404): 模型名称可能不正确。`;
            break;
          case 429:
            errorMessage = `请求频率限制 (429): 请求过于频繁，请稍后重试。`;
            break;
          case 400:
            errorMessage = `请求参数错误 (400): ${error.message}`;
            break;
          case 500:
            errorMessage = `服务器内部错误 (500): 火山引擎服务暂时不可用。`;
            break;
          default:
            errorMessage = `HTTP错误 (${error.status}): ${error.message}`;
        }
      }

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  // 生成火山引擎签名
  generateVolcengineSignature(timestamp) {
    const stringToSign = `${this.config.volcengine.accessKey}${timestamp}`;
    return crypto
      .createHmac('sha256', this.config.volcengine.secretKey)
      .update(stringToSign)
      .digest('hex');
  }

  // 获取文件类型对应的Content-Type
  getContentType(fileType) {
    const types = {
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'txt': 'text/plain'
    };
    return types[fileType] || 'application/octet-stream';
  }

  // 检测文件类型
  detectFileType(url, contentType) {
    const urlLower = url.toLowerCase();

    if (urlLower.includes('.pdf') || contentType?.includes('pdf')) {
      return 'pdf';
    }
    if (urlLower.includes('.doc') || contentType?.includes('msword')) {
      return urlLower.includes('.docx') ? 'docx' : 'doc';
    }
    if (urlLower.includes('.xlsx') || contentType?.includes('spreadsheetml')) {
      return 'xlsx';
    }
    if (urlLower.includes('.xls') || contentType?.includes('excel')) {
      return 'xls';
    }
    if (urlLower.includes('.txt') || contentType?.includes('text/plain')) {
      return 'txt';
    }
    // 视频文件类型检测
    if (urlLower.includes('.mp4') || contentType?.includes('video/mp4')) {
      return 'mp4';
    }
    if (urlLower.includes('.avi') || contentType?.includes('video/avi')) {
      return 'avi';
    }
    if (urlLower.includes('.mov') || contentType?.includes('video/quicktime')) {
      return 'mov';
    }
    if (urlLower.includes('.mkv') || contentType?.includes('video/x-matroska')) {
      return 'mkv';
    }

    return null;
  }
}