// 导入必要的模块
import { QueryManager } from './api.js';
import * as ui from './ui.js';

// 全局变量存储最后一次查询结果
// 全局变量
let lastQueryResult = null;

// 性能优化工具函数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function throttle(func, limit) {
    let inThrottle;
    return function () {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// 需要显示的列名（白名单模式）- 注意：设置为空数组以显示所有列
const VISIBLE_COLUMNS = [
    "日期",
    "移动拉新数",
    "移动转存数",
    "会员订单数",
    // "会员订单金额", // 已隐藏会员订单金额
    "会员佣金（元）"
];

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

        // 记录错误日志
        console.error(`[${context}] ${errorInfo.type}:`, {
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });

        // 显示用户友好的错误信息
        this.showUserError(errorInfo);

        // 错误上报（可选）
        this.reportError(errorInfo, context);

        return errorInfo;
    }

    static categorizeError(error) {
        // 超时错误
        if (
            error.name === 'TimeoutError' ||
            error.message.includes('timeout') ||
            error.message.includes('超时')
        ) {
            return {
                type: ErrorTypes.TIMEOUT_ERROR,
                userMessage: '请求超时，服务器响应时间过长，请稍后重试',
                canRetry: true
            };
        }

        // 网络错误
        if (
            error.name === 'TypeError' ||
            error.message.includes('网络') ||
            error.message.includes('fetch') ||
            error.message.includes('NetworkError')
        ) {
            return {
                type: ErrorTypes.NETWORK_ERROR,
                userMessage: '网络连接异常，请检查网络后重试',
                canRetry: true
            };
        }

        // 渲染错误
        if (
            error.message.includes('渲染') ||
            error.message.includes('DOM') ||
            error.message.includes('render')
        ) {
            return {
                type: ErrorTypes.RENDER_ERROR,
                userMessage: '页面渲染出错，请刷新页面重试',
                canRetry: true
            };
        }

        // 验证错误
        if (
            error.message.includes('验证') ||
            error.message.includes('validation')
        ) {
            return {
                type: ErrorTypes.VALIDATION_ERROR,
                userMessage: error.message,
                canRetry: false
            };
        }

        // 默认为API错误
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
            '<button class="mt-3 px-4 py-2 bg-blue-500 text-white rounded ' +
            'hover:bg-blue-600 transition-colors" onclick="location.reload()">' +
            '重试</button>' : '';

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
        ui.showStatus(errorInfo.userMessage, true);
    }

    static reportError(errorInfo, context) {
        // 可以发送到错误监控服务
        // 例如：Sentry, LogRocket 等
        try {
            // 这里可以添加错误上报逻辑
            console.log('Error reported:', { errorInfo, context });
        } catch (reportError) {
            console.error('Failed to report error:', reportError);
        }
    }

    static isRetryable(errorInfo) {
        return RETRY_CONFIG.retryableErrors.includes(errorInfo.type);
    }
}

// 验证器类
class FormValidator {
    static validate(formData) {
        const errors = [];

        if (!formData.ukCode || formData.ukCode.trim() === '') {
            errors.push({ field: 'ukCode', message: '请输入UK码' });
        } else if (!/^[A-Za-z0-9]+$/.test(formData.ukCode.trim())) {
            errors.push({
                field: 'ukCode',
                message: 'UK码格式不正确，只能包含字母和数字'
            });
        }

        if (!formData.startDate) {
            errors.push({ field: 'startDate', message: '请选择开始日期' });
        }

        if (!formData.endDate) {
            errors.push({ field: 'endDate', message: '请选择结束日期' });
        }

        if (formData.startDate && formData.endDate) {
            const start = new Date(formData.startDate);
            const end = new Date(formData.endDate);
            const today = new Date();
            today.setHours(23, 59, 59, 999); // 设置为今天的最后一刻

            if (start > today || end > today) {
                errors.push({ field: 'date', message: '日期不能超过今天' });
            }

            if (start > end) {
                errors.push({ field: 'date', message: '开始日期不能晚于结束日期' });
            }

            const daysDiff = (end - start) / (1000 * 60 * 60 * 24);
            if (daysDiff > 90) {
                errors.push({ field: 'date', message: '查询时间范围不能超过90天' });
            }
        }

        if (formData.appId && formData.appId.trim() !== '') {
            const appId = formData.appId.trim();
            if (!/^\d+$/.test(appId)) {
                errors.push({
                    field: 'appId',
                    message: '项目ID必须为数字'
                });
            } else if (appId.length > 10) {
                errors.push({
                    field: 'appId',
                    message: '项目ID长度不能超过10位'
                });
            }
        }

        return errors;
    }

    static showValidationErrors(errors) {
        // 清除之前的错误提示
        document.querySelectorAll('.field-error').forEach(el => el.remove());

        errors.forEach(error => {
            const field = document.getElementById(error.field);
            if (field) {
                const errorEl = document.createElement('div');
                errorEl.className = 'field-error text-red-500 text-sm mt-1';
                errorEl.textContent = error.message;
                field.parentNode.appendChild(errorEl);

                // 添加错误样式到输入框
                field.classList.add('border-red-500');

                // 监听输入变化，清除错误状态
                field.addEventListener('input', function clearError() {
                    field.classList.remove('border-red-500');
                    const errorDiv = field.parentNode.querySelector('.field-error');
                    if (errorDiv) {
                        errorDiv.remove();
                    }
                    field.removeEventListener('input', clearError);
                }, { once: true });
            }
        });

        if (errors.length > 0) {
            ui.showStatus(`表单验证失败：${errors[0].message}`, true);
        }
    }
}

// QueryManager类已从api.js导入，这里不再重复定义

// 初始化 QueryManager
const queryManager = new QueryManager(ui);

// 工具函数：转换为Markdown
function convertToMarkdown(headers, rows) {
    if (!headers || !rows || !Array.isArray(headers) || !Array.isArray(rows)) {
        return '# 数据导出失败\n\n数据格式不正确';
    }

    // 获取项目ID和UK码的索引
    const appIdIndex = headers.findIndex(header => header && (header.includes('项目ID') || header.includes('App ID')));
    const ukCodeIndex = headers.findIndex(header => header && header.includes('UK码'));

    // 只显示白名单中的列
    let visibleColumns = headers.map((header, index) => ({
        header: header,
        index: index
    }));

    if (VISIBLE_COLUMNS.length > 0) {
        visibleColumns = visibleColumns.filter(col => VISIBLE_COLUMNS.includes(col.header));
    }

    // 如果有项目ID列且不在可见列中，添加它
    if (appIdIndex >= 0 && !visibleColumns.some(col => col.index === appIdIndex)) {
        visibleColumns.unshift({
            header: '项目ID',
            index: appIdIndex
        });
    }

    // 计算每列的最大宽度
    const colWidths = visibleColumns.map((col, i) => {
        const headerLength = col.header.length;
        const cellLengths = rows.map(row => {
            const cellValue = row[col.index] || '';
            return String(cellValue).length;
        });
        return Math.max(headerLength, ...cellLengths);
    });

    // 创建表头
    let markdown = '| ' + visibleColumns.map((col, i) => col.header.padEnd(colWidths[i])).join(' | ') + ' |\n';
    markdown += '| ' + colWidths.map(w => '-'.repeat(w)).join(' | ') + ' |\n';

    // 创建数据行
    markdown += rows.map(row => {
        const visibleCells = visibleColumns.map((col, i) => {
            const cellValue = row[col.index] || '';
            return String(cellValue).padEnd(colWidths[i]);
        });
        return '| ' + visibleCells.join(' | ') + ' |';
    }).join('\n');

    return markdown;
}

// 导出功能
function exportData(format) {
    if (!lastQueryResult) {
        ui.showStatus('没有可导出的数据', true);
        return;
    }

    try {
        let content;
        let filename;
        let type;

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        if (format === 'html') {
            content = createTableHTML(lastQueryResult.headers, lastQueryResult.rows);
            filename = `query-result-${timestamp}.html`;
            type = 'text/html';
        } else if (format === 'markdown') {
            content = convertToMarkdown(lastQueryResult.headers, lastQueryResult.rows);
            filename = `query-result-${timestamp}.md`;
            type = 'text/markdown';
        } else if (format === 'csv') {
            content = convertToCSV(lastQueryResult.headers, lastQueryResult.rows);
            filename = `query-result-${timestamp}.csv`;
            type = 'text/csv';
        } else {
            throw new Error('不支持的导出格式');
        }

        // 创建下载链接
        const blob = new Blob([content], { type: `${type};charset=utf-8` });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        ui.showStatus(`导出成功: ${filename}`);
    } catch (error) {
        console.error('导出失败:', error);
        ui.showStatus('导出失败: ' + error.message, true);
    }
}

// 新增：转换为CSV格式
function convertToCSV(headers, rows) {
    if (!headers || !rows || !Array.isArray(headers) || !Array.isArray(rows)) {
        return '数据格式不正确';
    }

    // 只显示白名单中的列
    let visibleColumns = headers.map((header, index) => ({
        header: header,
        index: index
    }));

    if (VISIBLE_COLUMNS.length > 0) {
        visibleColumns = visibleColumns.filter(col => VISIBLE_COLUMNS.includes(col.header));
    }

    // 如果没有可见列，显示所有列
    if (visibleColumns.length === 0) {
        visibleColumns = headers.map((header, index) => ({
            header: header,
            index: index
        }));
    }

    // 创建CSV头
    const csvHeader = visibleColumns.map(col => {
        // 处理包含逗号的标题
        return `"${col.header.replace(/"/g, '""')}"`;
    }).join(',');

    // 创建CSV行
    const csvRows = rows.map(row => {
        return visibleColumns.map(col => {
            const cellValue = col.index < row.length ? row[col.index] : '';
            // 处理包含逗号、引号的单元格
            return `"${String(cellValue).replace(/"/g, '""')}"`;
        }).join(',');
    }).join('\n');

    return csvHeader + '\n' + csvRows;
}

// 项目ID提示信息配置
const APP_ID_TIPS = {
    'default': '请输入有效的项目ID进行查询',
    '649': '默认项目ID，查询主要业务数据',
    'test': '测试环境项目ID，用于开发调试',
    'prod': '生产环境项目ID，查询生产数据',
    'demo': '演示项目ID，显示示例数据'
};

// 显示项目ID提示
function showAppIdTip(appId) {
    const tipElement = document.getElementById('appIdTip');
    const tipTextElement = document.getElementById('appIdTipText');

    if (!tipElement || !tipTextElement) {
        return;
    }

    if (!appId || appId.trim() === '') {
        // 空值时显示默认提示
        tipTextElement.textContent = '使用默认项目ID: 649';
        tipElement.classList.remove('hidden');
        return;
    }

    // 根据项目ID显示不同提示
    let tipText = APP_ID_TIPS['default'];

    // 检查是否是特定的项目ID
    const trimmedAppId = appId.trim();
    if (APP_ID_TIPS[trimmedAppId]) {
        tipText = APP_ID_TIPS[trimmedAppId];
    } else {
        // 根据项目ID特征显示不同提示
        if (trimmedAppId.includes('test') || trimmedAppId.includes('dev')) {
            tipText = '检测到测试环境项目ID，将查询测试数据';
        } else if (trimmedAppId.includes('prod') || trimmedAppId.includes('live')) {
            tipText = '检测到生产环境项目ID，将查询生产数据';
        } else if (!/^\d+$/.test(trimmedAppId)) {
            tipText = '项目ID应为数字格式，请确认输入正确';
        } else if (trimmedAppId.length < 2) {
            tipText = '项目ID长度较短，请确认输入正确';
        } else if (trimmedAppId.length > 10) {
            tipText = '项目ID长度较长，请确认输入正确';
        } else {
            tipText = `当前项目ID: ${appId}，点击查询按钮开始数据查询`;
        }
    }

    tipTextElement.textContent = tipText;
    tipElement.classList.remove('hidden');
}

// 公告栏功能
function initAnnouncement() {
    const announcement = document.getElementById('announcement');
    const closeBtn = document.getElementById('closeAnnouncement');

    if (!announcement || !closeBtn) {
        return;
    }

    // 检查本地存储，看用户是否已关闭公告
    const isAnnouncementClosed = localStorage.getItem('announcementClosed');

    if (isAnnouncementClosed === 'true') {
        announcement.classList.add('hidden');
    }

    // 关闭按钮点击事件
    closeBtn.addEventListener('click', function () {
        announcement.classList.add('hidden');
        // 保存到本地存储
        localStorage.setItem('announcementClosed', 'true');
    });
}

// 客服功能
function initCustomerService() {
    const customerServiceBtn = document.querySelector('#customerService button');

    if (!customerServiceBtn) {
        return;
    }

    customerServiceBtn.addEventListener('click', function () {
        // 创建客服对话框
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-semibold text-gray-900">联系客服</h3>
                    <button class="text-gray-400 hover:text-gray-600 transition-colors" onclick="this.closest('.fixed').remove()">
                        <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                        </svg>
                    </button>
                </div>
                <div class="space-y-4">
                    <div class="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                        <svg class="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"></path>
                            <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"></path>
                        </svg>
                        <div>
                            <p class="text-sm font-medium text-gray-900">邮箱支持</p>
                            <p class="text-sm text-gray-600">support@example.com</p>
                        </div>
                    </div>
                    <div class="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                        <svg class="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"></path>
                        </svg>
                        <div>
                            <p class="text-sm font-medium text-gray-900">电话支持</p>
                            <p class="text-sm text-gray-600">400-123-4567</p>
                        </div>
                    </div>
                    <div class="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                        <svg class="w-5 h-5 text-purple-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clip-rule="evenodd"></path>
                        </svg>
                        <div>
                            <p class="text-sm font-medium text-gray-900">在线客服</p>
                            <p class="text-sm text-gray-600">工作时间：9:00-18:00</p>
                        </div>
                    </div>
                </div>
                <div class="mt-6 flex justify-end">
                    <button class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors" onclick="this.closest('.fixed').remove()">
                        确定
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 点击背景关闭模态框
        modal.addEventListener('click', function (e) {
            if (e.target === modal) {
                modal.remove();
            }
        });

        // ESC键关闭模态框
        const handleEscape = function (e) {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    });
}

// 添加取消查询按钮
function addCancelButton() {
    const queryBtn = document.getElementById('queryBtn');
    if (!queryBtn) {
        return;
    }

    // 检查是否已存在取消按钮
    if (document.getElementById('cancelBtn')) {
        return;
    }

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.id = 'cancelBtn';
    cancelBtn.className = 'ml-2 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors hidden';
    cancelBtn.textContent = '取消查询';
    cancelBtn.onclick = () => queryManager.cancelQuery();

    queryBtn.parentNode.appendChild(cancelBtn);
}

// 改进的表单提交处理
document.addEventListener('DOMContentLoaded', function () {
    const queryForm = document.getElementById('queryForm');
    if (!queryForm) {
        console.error('找不到查询表单');
        return;
    }

    queryForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        try {
            // 获取表单数据
            const formData = {
                appId: document.getElementById('appId')?.value?.trim() || '',
                ukCode: document.getElementById('ukCode')?.value?.trim() || '',
                startDate: document.getElementById('startDate')?.value || '',
                endDate: document.getElementById('endDate')?.value || '',
                headless: document.getElementById('headless')?.checked || false
            };

            console.log('表单提交参数:', formData);

            // 验证表单
            const validationErrors = FormValidator.validate(formData);
            if (validationErrors.length > 0) {
                FormValidator.showValidationErrors(validationErrors);
                return;
            }

            // 清除之前的错误提示
            document.querySelectorAll('.field-error').forEach(el => el.remove());
            document.querySelectorAll('input').forEach(input => {
                input.classList.remove('border-red-500');
            });

            // 显示查询状态
            ui.showStatus('正在查询数据，请稍候...');

            // 执行查询
            await queryManager.executeQuery({
                app_id: formData.appId,
                uk_code: formData.ukCode,
                start_date: formData.startDate,
                end_date: formData.endDate,
                headless: formData.headless
            });

        } catch (error) {
            // 错误已经在 QueryManager 中处理
            console.error('表单提交失败:', error);
        }
    });
});

// 设置日期选择器的默认值和范围
document.addEventListener('DOMContentLoaded', function () {
    const today = new Date();
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const appIdInput = document.getElementById('appId');

    // 初始化公告栏
    initAnnouncement();

    // 初始化客服功能
    initCustomerService();

    // 添加取消查询按钮
    addCancelButton();

    if (startDateInput && endDateInput) {
        // 设置默认值为今天
        startDateInput.value = formatDate(today);
        endDateInput.value = formatDate(today);

        // 设置最大日期为今天
        const maxDate = formatDate(today);
        startDateInput.max = maxDate;
        endDateInput.max = maxDate;

        // 确保结束日期不早于开始日期
        startDateInput.addEventListener('change', function () {
            if (endDateInput.value < this.value) {
                endDateInput.value = this.value;
            }
            endDateInput.min = this.value;
        });

        endDateInput.addEventListener('change', function () {
            if (startDateInput.value > this.value) {
                startDateInput.value = this.value;
            }
            startDateInput.max = this.value;
        });
    }

    if (appIdInput) {
        // 初始显示项目ID提示
        showAppIdTip(appIdInput.value);

        // 使用防抖优化输入监听器
        const debouncedShowTip = debounce((value) => showAppIdTip(value), 300);

        appIdInput.addEventListener('input', function () {
            debouncedShowTip(this.value);
        });

        appIdInput.addEventListener('blur', function () {
            showAppIdTip(this.value);
        });

        appIdInput.addEventListener('focus', function () {
            showAppIdTip(this.value);
        });
    }

    // 确保表格容器可以滚动
    const resultTable = document.getElementById('resultTable');
    if (resultTable) {
        // 防止事件冒泡导致滚动问题
        resultTable.addEventListener('wheel', function (e) {
            e.stopPropagation();
        }, { passive: true });
    }

    // 设置主题切换
    const themeToggle = document.createElement('div');
    themeToggle.className = 'fixed bottom-4 right-4 z-50';
    themeToggle.innerHTML = `
        <label class="swap swap-rotate bg-base-200 p-2 rounded-full shadow-lg cursor-pointer">
            <input type="checkbox" class="theme-controller" value="dark" />
            <svg class="swap-on fill-current w-8 h-8" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5.64,17l-.71.71a1,1,0,0,0,0,1.41,1,1,0,0,0,1.41,0l.71-.71A1,1,0,0,0,5.64,17ZM5,12a1,1,0,0,0-1-1H3a1,1,0,0,0,0,2H4A1,1,0,0,0,5,12Zm7-7a1,1,0,0,0,1-1V3a1,1,0,0,0-2,0V4A1,1,0,0,0,12,5ZM5.64,7.05a1,1,0,0,0,.7.29,1,1,0,0,0,.71-.29,1,1,0,0,0,0-1.41l-.71-.71A1,1,0,0,0,4.93,6.34Zm12,.29a1,1,0,0,0,.7-.29l.71-.71a1,1,0,1,0-1.41-1.41L17,5.64a1,1,0,0,0,0,1.41A1,1,0,0,0,17.66,7.34ZM21,11H20a1,1,0,0,0,0,2h1a1,1,0,0,0,0-2Zm-9,8a1,1,0,0,0-1,1v1a1,1,0,0,0,2,0V20A1,1,0,0,0,12,19ZM18.36,17A1,1,0,0,0,17,18.36l.71.71a1,1,0,0,0,1.41,0,1,1,0,0,0,0-1.41ZM12,6.5A5.5,5.5,0,1,0,17.5,12,5.51,5.51,0,0,0,12,6.5Zm0,9A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z"/></svg>
            <svg class="swap-off fill-current w-8 h-8" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21.64,13a1,1,0,0,0-1.05-.14,8.05,8.05,0,0,1-3.37.73A8.15,8.15,0,0,1,9.08,5.49a8.59,8.59,0,0,1,.25-2A1,1,0,0,0,8,2.36,10.14,10.14,0,1,0,22,14.05,1,1,0,0,0,21.64,13Zm-9.5,6.69A8.14,8.14,0,0,1,7.08,5.22v.27A10.15,10.15,0,0,0,17.22,15.63a9.79,9.79,0,0,0,2.1-.22A8.11,8.11,0,0,1,12.14,19.73Z"/></svg>
        </label>
    `;
    document.body.appendChild(themeToggle);

    // 主题切换逻辑
    const themeController = document.querySelector('.theme-controller');
    if (themeController) {
        themeController.addEventListener('change', function () {
            const htmlElement = document.documentElement;
            if (this.checked) {
                htmlElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
            } else {
                htmlElement.setAttribute('data-theme', 'light');
                localStorage.setItem('theme', 'light');
            }
        });

        // 恢复保存的主题
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            themeController.checked = true;
            document.documentElement.setAttribute('data-theme', 'dark');
        }
    }

    // 添加键盘快捷键支持
    document.addEventListener('keydown', function (e) {
        // Ctrl+Enter 或 Cmd+Enter 提交表单
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            const queryForm = document.getElementById('queryForm');
            if (queryForm) {
                queryForm.dispatchEvent(new Event('submit'));
            }
        }

        // Escape 取消查询
        if (e.key === 'Escape' && queryManager.isLoading) {
            queryManager.cancelQuery();
        }
    });
});

// 页面可见性变化处理
document.addEventListener('visibilitychange', function () {
    if (document.hidden && queryManager.isLoading) {
        console.log('页面隐藏，查询继续在后台运行');
    } else if (!document.hidden) {
        console.log('页面重新可见');
    }
});

// 页面卸载前的清理
window.addEventListener('beforeunload', function (e) {
    if (queryManager.isLoading) {
        e.preventDefault();
        e.returnValue = '查询正在进行中，确定要离开吗？';
        return e.returnValue;
    }
});

// 全局错误处理
window.addEventListener('error', function (e) {
    console.error('全局错误:', e.error);
    ErrorHandler.handle(e.error, 'Global Error Handler');
});

// 未处理的Promise拒绝
window.addEventListener('unhandledrejection', function (e) {
    console.error('未处理的Promise拒绝:', e.reason);
    ErrorHandler.handle(new Error(e.reason), 'Unhandled Promise Rejection');
    e.preventDefault();
});

// 复制到剪贴板功能
function copyToClipboard(text) {
    if (!text) {
        ui.showStatus('没有可复制的内容', true);
        return;
    }

    try {
        // 使用现代的 Clipboard API
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(() => {
                ui.showStatus('已复制到剪贴板');
            }).catch(err => {
                console.error('复制失败:', err);
                fallbackCopyToClipboard(text);
            });
        } else {
            // 降级方案
            fallbackCopyToClipboard(text);
        }
    } catch (error) {
        console.error('复制功能出错:', error);
        ui.showStatus('复制失败: ' + error.message, true);
    }
}

// 降级复制方案
function fallbackCopyToClipboard(text) {
    try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);

        if (successful) {
            ui.showStatus('已复制到剪贴板');
        } else {
            ui.showStatus('复制失败，请手动复制', true);
        }
    } catch (error) {
        console.error('降级复制方案失败:', error);
        ui.showStatus('复制功能不可用，请手动复制', true);
    }
}

// 日期格式化函数
function formatDate(date) {
    if (!date) {
        return '';
    }

    try {
        // 如果传入的是字符串，尝试转换为Date对象
        if (typeof date === 'string') {
            date = new Date(date);
        }

        // 检查是否是有效的日期
        if (!(date instanceof Date) || isNaN(date.getTime())) {
            console.error('无效的日期:', date);
            return '';
        }

        // 格式化为 YYYY-MM-DD
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;
    } catch (error) {
        console.error('日期格式化失败:', error);
        return '';
    }
}

// 导出全局函数供HTML使用
window.copyToClipboard = copyToClipboard;
window.exportData = exportData;
window.showStatus = ui.showStatus;
window.queryManager = queryManager;
window.ErrorHandler = ErrorHandler;
window.FormValidator = FormValidator;
window.formatDate = formatDate;

console.log('Script.js 加载完成，所有功能已初始化');