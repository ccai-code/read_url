import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 确保fs模块正确导入
const { appendFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } = fs;

class Logger {
    constructor(logDir = null) {
        // 在Docker环境中使用绝对路径，本地开发使用相对路径
        this.logDir = logDir || (process.env.NODE_ENV === 'production' ? '/app/logs' : './logs');
        this.ensureLogDir();
        this.logFile = path.join(this.logDir, `mcp-${new Date().toISOString().split('T')[0]}.log`);
    }

    ensureLogDir() {
        if (!existsSync(this.logDir)) {
            mkdirSync(this.logDir, { recursive: true });
        }
    }

    formatTimestamp() {
        return new Date().toISOString();
    }

    writeLog(level, category, message, data = null) {
        const timestamp = this.formatTimestamp();
        const logEntry = {
            timestamp,
            level,
            category,
            message,
            data: data ? JSON.stringify(data, null, 2) : null,
            pid: process.pid
        };

        const logLine = `[${timestamp}] [${level}] [${category}] ${message}${data ? '\n' + JSON.stringify(data, null, 2) : ''}\n`;

        // 写入文件
        try {
            appendFileSync(this.logFile, logLine);
        } catch (error) {
            console.error('写入日志文件失败:', error);
            console.error('日志文件路径:', this.logFile);
        }

        // 同时输出到控制台
        console.log(logLine.trim());
    }

    // MCP协议相关日志
    mcpRequest(method, params, id) {
        this.writeLog('INFO', 'MCP_REQUEST', `收到MCP请求: ${method}`, {
            method,
            params,
            id,
            requestTime: Date.now()
        });
    }

    mcpResponse(id, result, error = null) {
        this.writeLog('INFO', 'MCP_RESPONSE', `发送MCP响应: ${id}`, {
            id,
            result,
            error,
            responseTime: Date.now()
        });
    }

    mcpError(error, context = null) {
        this.writeLog('ERROR', 'MCP_ERROR', `MCP协议错误: ${error.message}`, {
            error: {
                message: error.message,
                stack: error.stack,
                code: error.code
            },
            context
        });
    }

    // HTTP请求日志
    httpRequest(req) {
        this.writeLog('INFO', 'HTTP_REQUEST', `HTTP请求: ${req.method} ${req.url}`, {
            method: req.method,
            url: req.url,
            headers: req.headers,
            userAgent: req.headers['user-agent'],
            ip: req.ip || req.connection.remoteAddress
        });
    }

    httpResponse(res, statusCode, responseTime) {
        this.writeLog('INFO', 'HTTP_RESPONSE', `HTTP响应: ${statusCode}`, {
            statusCode,
            responseTime: `${responseTime}ms`,
            headers: res.getHeaders()
        });
    }

    // 服务器状态日志
    serverStart(port, config) {
        this.writeLog('INFO', 'SERVER', `MCP服务器启动成功`, {
            port,
            config,
            nodeVersion: process.version,
            platform: process.platform,
            memory: process.memoryUsage()
        });
    }

    serverError(error, context) {
        this.writeLog('ERROR', 'SERVER', `服务器错误: ${error.message}`, {
            error: {
                message: error.message,
                stack: error.stack
            },
            context,
            memory: process.memoryUsage()
        });
    }

    // 数字机器人交互日志
    robotConnection(clientInfo) {
        this.writeLog('INFO', 'ROBOT', '数字机器人连接', {
            clientInfo,
            connectionTime: Date.now()
        });
    }

    robotDisconnection(reason) {
        this.writeLog('WARN', 'ROBOT', '数字机器人断开连接', {
            reason,
            disconnectionTime: Date.now()
        });
    }

    robotMessage(direction, message) {
        this.writeLog('INFO', 'ROBOT', `机器人消息 [${direction}]`, {
            direction, // 'incoming' 或 'outgoing'
            message,
            messageTime: Date.now()
        });
    }

    // SSE连接日志
    sseConnection(clientId) {
        this.writeLog('INFO', 'SSE', 'SSE客户端连接', {
            clientId,
            connectionTime: Date.now()
        });
    }

    sseDisconnection(clientId, reason) {
        this.writeLog('INFO', 'SSE', 'SSE客户端断开', {
            clientId,
            reason,
            disconnectionTime: Date.now()
        });
    }

    sseMessage(clientId, data) {
        this.writeLog('INFO', 'SSE', 'SSE消息发送', {
            clientId,
            data,
            messageTime: Date.now()
        });
    }

    // 性能监控日志
    performance(operation, duration, details = null) {
        this.writeLog('INFO', 'PERFORMANCE', `性能监控: ${operation}`, {
            operation,
            duration: `${duration}ms`,
            details,
            memory: process.memoryUsage()
        });
    }

    // 调试日志
    debug(category, message, data = null) {
        this.writeLog('DEBUG', category, message, data);
    }

    // 警告日志
    warn(category, message, data = null) {
        this.writeLog('WARN', category, message, data);
    }

    // 信息日志
    info(category, message, data = null) {
        this.writeLog('INFO', category, message, data);
    }

    // 错误日志
    error(category, message, error = null) {
        this.writeLog('ERROR', category, message, error ? {
            message: error.message,
            stack: error.stack,
            code: error.code
        } : null);
    }

    // 获取日志统计
    getLogStats() {
        try {
            const logContent = fs.readFileSync(this.logFile, 'utf8');
            const lines = logContent.split('\n').filter(line => line.trim());

            const stats = {
                totalLines: lines.length,
                errors: lines.filter(line => line.includes('[ERROR]')).length,
                warnings: lines.filter(line => line.includes('[WARN]')).length,
                mcpRequests: lines.filter(line => line.includes('[MCP_REQUEST]')).length,
                mcpResponses: lines.filter(line => line.includes('[MCP_RESPONSE]')).length,
                httpRequests: lines.filter(line => line.includes('[HTTP_REQUEST]')).length,
                robotMessages: lines.filter(line => line.includes('[ROBOT]')).length
            };

            return stats;
        } catch (error) {
            return { error: error.message };
        }
    }

    // 清理旧日志文件
    cleanOldLogs(daysToKeep = 7) {
        try {
            const files = readdirSync(this.logDir);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

            files.forEach(file => {
                if (file.startsWith('mcp-') && file.endsWith('.log')) {
                    const filePath = path.join(this.logDir, file);
                    const stats = statSync(filePath);

                    if (stats.mtime < cutoffDate) {
                        unlinkSync(filePath);
                        this.info('CLEANUP', `删除旧日志文件: ${file}`);
                    }
                }
            });
        } catch (error) {
            this.error('CLEANUP', '清理日志文件失败', error);
        }
    }
}

// 创建全局日志实例
const logger = new Logger();

// 捕获未处理的异常
process.on('uncaughtException', (error) => {
    logger.error('PROCESS', '未捕获的异常', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('PROCESS', '未处理的Promise拒绝', {
        reason: reason?.message || reason,
        stack: reason?.stack
    });
});

// 定期清理日志
setInterval(() => {
    logger.cleanOldLogs();
}, 24 * 60 * 60 * 1000); // 每天清理一次

export default logger;