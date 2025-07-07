// API模块：封装所有与后端API交互的逻辑

import { setLoading } from './ui.js';

// 错误类型枚举
const ErrorTypes = {
    NETWORK_ERROR: 'NETWORK_ERROR',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    RENDER_ERROR: 'RENDER_ERROR',
    API_ERROR: 'API_ERROR',
    TIMEOUT_ERROR: 'TIMEOUT_ERROR'
};

// 重试配置
const RETRY_CONFIG = {
    maxRetries: 2,
    retryDelay: 2000, // 2秒
    retryableErrors: [ErrorTypes.NETWORK_ERROR, ErrorTypes.TIMEOUT_ERROR]
};

// 统一错误处理类
class ErrorHandler {
    static handle(error, context = '') {
        const errorInfo = this.categorizeError(error);

        console.error(`[${context}] ${errorInfo.type}:`, {
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });

        this.showUserError(errorInfo);
        this.reportError(errorInfo, context);
        return errorInfo;
    }

    static categorizeError(error) {
        if (error.name === 'TimeoutError' || error.message.includes('timeout') || error.message.includes('超时')) {
            return {
                type: ErrorTypes.TIMEOUT_ERROR,
                userMessage: '请求超时，服务器响应时间过长，请稍后重试',
                canRetry: true
            };
        }

        if (error.name === 'TypeError' || error.message.includes('网络') || error.message.includes('fetch') || error.message.includes('NetworkError')) {
            return {
                type: ErrorTypes.NETWORK_ERROR,
                userMessage: '网络连接异常，请检查网络后重试',
                canRetry: true
            };
        }

        if (error.message.includes('渲染') || error.message.includes('DOM') || error.message.includes('render')) {
            return {
                type: ErrorTypes.RENDER_ERROR,
                userMessage: '页面渲染出错，请刷新页面重试',
                canRetry: true
            };
        }

        if (error.message.includes('验证') || error.message.includes('validation')) {
            return {
                type: ErrorTypes.VALIDATION_ERROR,
                userMessage: error.message,
                canRetry: false
            };
        }

        return {
            type: ErrorTypes.API_ERROR,
            userMessage: error.message || '操作失败，请稍后重试',
            canRetry: true
        };
    }

    static showUserError(errorInfo) {
        const resultCard = document.getElementById('resultCard');
        const resultTable = document.getElementById('resultTable');

        if (!resultCard || !resultTable) {
            console.error('找不到结果显示容器');
            alert(errorInfo.userMessage);
            return;
        }

        const retryButton = errorInfo.canRetry ?
            '<button class="mt-3 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors" onclick="location.reload()">重试</button>' : '';

        resultTable.innerHTML = `
            <div class="p-6 bg-red-50 text-red-700 rounded-lg border border-red-200">
                <div class="flex items-center mb-3">
                    <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
                    </svg>
                    <h3 class="font-semibold">操作失败</h3>
                </div>
                <p class="mb-2">${errorInfo.userMessage}</p>
                <p class="text-sm text-red-600">错误类型: ${errorInfo.type}</p>
                ${retryButton}
            </div>
        `;

        resultCard.classList.remove('hidden');
        // 使用全局showStatus或通过参数传递
        if (window.showStatus) {
            window.showStatus(errorInfo.userMessage, true);
        }
    }

    static reportError(errorInfo, context) {
        console.log('Error reported:', { errorInfo, context });
    }

    static isRetryable(errorInfo) {
        return RETRY_CONFIG.retryableErrors.includes(errorInfo.type);
    }
}

// 查询管理器类
export class QueryManager {
    constructor(ui) {
        this.isLoading = false;
        this.abortController = null;
        this.retryCount = 0;
        this.currentParams = null;
        this.ui = ui; // 依赖注入UI模块
    }

    async executeQuery(params) {
        if (this.isLoading) {
            throw new Error('查询正在进行中，请稍候');
        }

        this.currentParams = params;
        this.retryCount = 0;

        try {
            this.setLoading(true);
            this.abortController = new AbortController();

            const response = await this.sendRequestWithTimeout(params);
            const data = await this.processResponse(response);

            this.ui.renderResults(data);

            return data;
        } catch (error) {
            if (error.name === 'AbortError') {
                this.ui.showStatus('查询已取消');
                return;
            }

            const errorInfo = ErrorHandler.handle(error, 'QueryManager.executeQuery');

            if (ErrorHandler.isRetryable(errorInfo) && this.retryCount < RETRY_CONFIG.maxRetries) {
                this.retryCount++;
                this.ui.showStatus(`请求失败，正在进行第 ${this.retryCount} 次重试...`);

                await new Promise(resolve => setTimeout(resolve, RETRY_CONFIG.retryDelay));
                return this.executeQuery(this.currentParams);
            }

            throw error;
        } finally {
            this.setLoading(false);
            this.abortController = null;
        }
    }

    async sendRequestWithTimeout(params, timeout = 60000) {
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error('请求超时，服务器响应时间过长'));
            }, timeout);
        });

        const fetchPromise = this.sendRequest(params);
        return Promise.race([fetchPromise, timeoutPromise]);
    }

    async sendRequest(params) {
        try {
            const response = await fetch('/api/query', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(params),
                signal: this.abortController.signal
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
            }

            return response;
        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                throw new Error('网络连接异常，无法连接到服务器');
            }
            throw error;
        }
    }

    async processResponse(response) {
        try {
            const data = await response.json();

            if (!data.headers || !data.rows) {
                throw new Error('服务器返回的数据格式不正确');
            }

            if (!Array.isArray(data.headers) || !Array.isArray(data.rows)) {
                throw new Error('数据格式错误：headers或rows不是数组');
            }

            return data;
        } catch (error) {
            if (error instanceof SyntaxError) {
                throw new Error('服务器返回的数据格式无效，无法解析JSON');
            }
            throw error;
        }
    }

    setLoading(loading) {
        this.isLoading = loading;
        this.ui.setLoading(loading);

        const cancelBtn = document.getElementById('cancelBtn');
        if (cancelBtn) {
            if (loading) {
                cancelBtn.classList.remove('hidden');
            } else {
                cancelBtn.classList.add('hidden');
            }
        }
    }

    cancelQuery() {
        if (this.abortController) {
            this.abortController.abort();
            this.ui.showStatus('查询已取消');
        }
    }
}