// 轻量级前端应用 - 针对低性能服务器优化
class DataQueryApp {
    constructor() {
        this.isLoading = false;
        this.lastQueryResult = null;
        this.abortController = null;
        
        // 配置
        this.config = {
            VISIBLE_COLUMNS: [
                "日期",
                "移动拉新数",
                "移动转存数", 
                "会员订单数",
                "会员佣金（元）"
            ],
            PROFIT_COEFFICIENTS: {
                new_user: 3.0,
                deposit: 0.1
            }
        };
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.initDateInputs();
        this.initAnnouncement();
        this.initCustomerService();
        this.initThemeToggle();
        console.log('数据查询应用已初始化');
    }

    setupEventListeners() {
        const form = document.getElementById('queryForm');
        if (form) {
            form.addEventListener('submit', (e) => this.handleSubmit(e));
        }

        const appIdInput = document.getElementById('appId');
        if (appIdInput) {
            appIdInput.addEventListener('input', (e) => this.showAppIdTip(e.target.value));
            appIdInput.addEventListener('focus', (e) => this.showAppIdTip(e.target.value));
        }

        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                form?.dispatchEvent(new Event('submit'));
            }
            if (e.key === 'Escape' && this.isLoading) {
                this.cancelQuery();
            }
        });
    }

    initDateInputs() {
        const today = new Date();
        const todayStr = this.formatDate(today);
        
        const startDate = document.getElementById('startDate');
        const endDate = document.getElementById('endDate');
        
        if (startDate && endDate) {
            startDate.value = todayStr;
            endDate.value = todayStr;
            startDate.max = todayStr;
            endDate.max = todayStr;
            
            startDate.addEventListener('change', () => {
                if (endDate.value < startDate.value) {
                    endDate.value = startDate.value;
                }
                endDate.min = startDate.value;
            });
            
            endDate.addEventListener('change', () => {
                if (startDate.value > endDate.value) {
                    startDate.value = endDate.value;
                }
            });
        }
    }

    initAnnouncement() {
        const announcement = document.getElementById('announcement');
        const closeBtn = document.getElementById('closeAnnouncement');
        
        if (!announcement || !closeBtn) return;
        
        const isClosed = localStorage.getItem('announcementClosed') === 'true';
        if (isClosed) {
            announcement.classList.add('hidden');
        }
        
        closeBtn.addEventListener('click', () => {
            announcement.classList.add('hidden');
            localStorage.setItem('announcementClosed', 'true');
        });
    }

    initCustomerService() {
        const customerServiceBtn = document.querySelector('#customerService button');
        if (!customerServiceBtn) return;
        
        customerServiceBtn.addEventListener('click', () => {
            this.showCustomerServiceModal();
        });
    }

    initThemeToggle() {
        // 简化的主题切换
        const themeToggle = document.createElement('div');
        themeToggle.className = 'theme-toggle';
        themeToggle.innerHTML = `
            <button class="bg-gray-200 hover:bg-gray-300 p-3 rounded-full shadow-lg transition-all">
                <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clip-rule="evenodd"></path>
                </svg>
            </button>
        `;
        document.body.appendChild(themeToggle);
    }

    async handleSubmit(e) {
        e.preventDefault();
        
        if (this.isLoading) {
            this.showStatus('查询正在进行中，请稍候', true);
            return;
        }

        try {
            const formData = this.getFormData();
            const errors = this.validateForm(formData);
            
            if (errors.length > 0) {
                this.showValidationErrors(errors);
                return;
            }

            this.clearValidationErrors();
            await this.executeQuery(formData);
            
        } catch (error) {
            console.error('表单提交失败:', error);
            this.showStatus(`提交失败: ${error.message}`, true);
        }
    }

    getFormData() {
        return {
            app_id: document.getElementById('appId')?.value?.trim() || '',
            uk_code: document.getElementById('ukCode')?.value?.trim() || '',
            start_date: document.getElementById('startDate')?.value || '',
            end_date: document.getElementById('endDate')?.value || '',
            headless: true
        };
    }

    validateForm(data) {
        const errors = [];
        
        if (!data.uk_code) {
            errors.push({ field: 'ukCode', message: '请输入UK码' });
        } else if (!/^[A-Za-z0-9]+$/.test(data.uk_code)) {
            errors.push({ field: 'ukCode', message: 'UK码格式不正确' });
        }
        
        if (!data.start_date) {
            errors.push({ field: 'startDate', message: '请选择开始日期' });
        }
        
        if (!data.end_date) {
            errors.push({ field: 'endDate', message: '请选择结束日期' });
        }
        
        if (data.start_date && data.end_date) {
            const start = new Date(data.start_date);
            const end = new Date(data.end_date);
            const today = new Date();
            
            if (start > today || end > today) {
                errors.push({ field: 'date', message: '日期不能超过今天' });
            } else if (start > end) {
                errors.push({ field: 'date', message: '开始日期不能晚于结束日期' });
            }
        }
        
        return errors;
    }

    showValidationErrors(errors) {
        this.clearValidationErrors();
        
        errors.forEach(error => {
            const field = document.getElementById(error.field);
            if (field) {
                const errorEl = document.createElement('div');
                errorEl.className = 'field-error text-red-500 text-sm mt-1';
                errorEl.textContent = error.message;
                field.parentNode.appendChild(errorEl);
                field.classList.add('border-red-500');
            }
        });
        
        this.showStatus(`表单验证失败: ${errors[0].message}`, true);
    }

    clearValidationErrors() {
        document.querySelectorAll('.field-error').forEach(el => el.remove());
        document.querySelectorAll('input').forEach(input => {
            input.classList.remove('border-red-500');
        });
    }

    async executeQuery(data) {
        this.setLoading(true);
        this.showStatus('正在查询数据，请稍候...');
        
        try {
            this.abortController = new AbortController();
            
            const response = await fetch('/api/query', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
                signal: this.abortController.signal
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            const result = await response.json();
            this.lastQueryResult = result;
            this.renderResults(result);
            this.showStatus('查询完成！');
            
        } catch (error) {
            if (error.name === 'AbortError') {
                this.showStatus('查询已取消');
                return;
            }
            
            console.error('查询失败:', error);
            this.showStatus(`查询失败: ${error.message}`, true);
            this.showErrorResult(error.message);
            
        } finally {
            this.setLoading(false);
            this.abortController = null;
        }
    }

    cancelQuery() {
        if (this.abortController) {
            this.abortController.abort();
            this.showStatus('查询已取消');
        }
    }

    setLoading(loading) {
        this.isLoading = loading;
        
        const queryBtn = document.getElementById('queryBtn');
        const spinner = document.getElementById('loadingSpinner');
        const btnText = document.getElementById('btnText');
        
        if (queryBtn && spinner && btnText) {
            queryBtn.disabled = loading;
            
            if (loading) {
                spinner.classList.remove('hidden');
                btnText.textContent = '查询中...';
                queryBtn.classList.add('opacity-75', 'cursor-not-allowed');
            } else {
                spinner.classList.add('hidden');
                btnText.textContent = '查询';
                queryBtn.classList.remove('opacity-75', 'cursor-not-allowed');
            }
        }
    }

    renderResults(data) {
        const resultCard = document.getElementById('resultCard');
        const resultTable = document.getElementById('resultTable');
        
        if (!resultCard || !resultTable) {
            console.error('找不到结果显示容器');
            return;
        }

        const tableHTML = this.createTableHTML(data.headers, data.rows);
        resultTable.innerHTML = tableHTML;
        resultCard.classList.remove('hidden');
        
        this.calculateAndDisplayTotals(data.headers, data.rows);
    }

    createTableHTML(headers, rows) {
        if (!headers || !Array.isArray(headers) || headers.length === 0) {
            return '<div class="p-4 text-red-500">无法显示表格：表头数据无效</div>';
        }

        if (!rows || !Array.isArray(rows) || rows.length === 0) {
            return '<div class="p-4 text-amber-500">查询结果为空，没有找到匹配的数据</div>';
        }

        // 过滤可见列
        const allColumns = headers.map((header, index) => ({ header, index }));
        let visibleColumns = allColumns;
        
        if (this.config.VISIBLE_COLUMNS.length > 0) {
            visibleColumns = allColumns.filter(col => 
                this.config.VISIBLE_COLUMNS.includes(col.header)
            );
        }

        if (visibleColumns.length === 0) {
            visibleColumns = allColumns;
        }

        let html = '<div class="table-container"><table class="styled-table">';
        
        // 表头
        html += '<thead><tr>';
        visibleColumns.forEach(col => {
            html += `<th>${col.header}</th>`;
        });
        html += '</tr></thead>';
        
        // 表体
        html += '<tbody>';
        rows.forEach(row => {
            if (!Array.isArray(row)) return;
            
            html += '<tr>';
            visibleColumns.forEach(col => {
                const cellValue = row[col.index] || '';
                html += `<td>${cellValue}</td>`;
            });
            html += '</tr>';
        });
        html += '</tbody></table></div>';
        
        return html;
    }

    calculateAndDisplayTotals(headers, rows) {
        try {
            const totals = {};
            const numericColumns = [
                "移动拉新数",
                "移动转存数", 
                "会员订单数",
                "会员佣金（元）"
            ];
            
            // 建立索引
            const indices = {};
            headers.forEach((header, i) => {
                if (numericColumns.includes(header)) {
                    indices[header] = i;
                    totals[header] = 0;
                }
            });
            
            // 计算总计
            rows.forEach(row => {
                if (!Array.isArray(row)) return;
                
                for (const colName in indices) {
                    const val = parseFloat(row[indices[colName]]);
                    if (!isNaN(val)) {
                        totals[colName] += val;
                    }
                }
            });
            
            // 显示基础总计
            this.updateElement('totalNewUsers', totals['移动拉新数'] || 0);
            this.updateElement('totalTransfers', totals['移动转存数'] || 0);
            this.updateElement('totalOrders', totals['会员订单数'] || 0);
            this.updateElement('totalCommission', this.formatCurrency(totals['会员佣金（元）'] || 0) + '元');
            
            // 计算收入
            const laxinIncome = (totals['移动拉新数'] || 0) * this.config.PROFIT_COEFFICIENTS.new_user;
            const zhuancunIncome = (totals['移动转存数'] || 0) * this.config.PROFIT_COEFFICIENTS.deposit;
            
            this.updateElement('totalNewUserIncome', this.formatCurrency(laxinIncome) + '元');
            this.updateElement('totalTransferIncome', this.formatCurrency(zhuancunIncome) + '元');
            
            // 显示统计区域
            const totalStats = document.getElementById('totalStats');
            if (totalStats) {
                totalStats.classList.remove('hidden');
            }
            
        } catch (error) {
            console.error('计算总计时出错:', error);
            this.showStatus(`计算出错: ${error.message}`, true);
        }
    }

    updateElement(id, value) {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = value;
        }
    }

    formatCurrency(amount) {
        if (typeof amount !== 'number' || isNaN(amount)) {
            return '0.00';
        }
        return amount.toFixed(2);
    }

    showErrorResult(message) {
        const resultCard = document.getElementById('resultCard');
        const resultTable = document.getElementById('resultTable');
        
        if (resultCard && resultTable) {
            resultTable.innerHTML = `
                <div class="p-6 bg-red-50 text-red-700 rounded-lg border border-red-200">
                    <div class="flex items-center mb-3">
                        <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
                        </svg>
                        <h3 class="font-semibold">查询失败</h3>
                    </div>
                    <p>${message}</p>
                </div>
            `;
            resultCard.classList.remove('hidden');
        }
    }

    showStatus(message, isError = false) {
        const statusEl = document.getElementById('statusMessage');
        if (!statusEl) return;
        
        statusEl.textContent = message;
        statusEl.classList.remove(
            'hidden', 'bg-blue-50', 'text-blue-700', 'border-blue-200',
            'bg-red-50', 'text-red-700', 'border-red-200'
        );
        
        if (isError) {
            statusEl.classList.add('bg-red-50', 'text-red-700', 'border', 'border-red-200');
        } else {
            statusEl.classList.add('bg-blue-50', 'text-blue-700', 'border', 'border-blue-200');
        }
        
        statusEl.classList.add('slide-in');
        
        if (!isError) {
            setTimeout(() => {
                statusEl.classList.add('hidden');
            }, 3000);
        }
    }

    showAppIdTip(appId) {
        const tipElement = document.getElementById('appIdTip');
        const tipTextElement = document.getElementById('appIdTipText');
        
        if (!tipElement || !tipTextElement) return;
        
        let tipText = '使用默认项目ID: 649';
        
        if (appId && appId.trim() !== '') {
            const trimmed = appId.trim();
            if (!/^\d+$/.test(trimmed)) {
                tipText = '项目ID应为数字格式';
            } else {
                tipText = `当前项目ID: ${trimmed}`;
            }
        }
        
        tipTextElement.textContent = tipText;
        tipElement.classList.remove('hidden');
    }

    showCustomerServiceModal() {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-semibold text-gray-900">联系客服</h3>
                    <button class="close-modal text-gray-400 hover:text-gray-600">
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
                </div>
                <div class="mt-6 flex justify-end">
                    <button class="close-modal px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                        确定
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 关闭模态框
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.classList.contains('close-modal')) {
                modal.remove();
            }
        });
    }

    formatDate(date) {
        if (!date) return '';
        
        try {
            if (typeof date === 'string') {
                date = new Date(date);
            }
            
            if (!(date instanceof Date) || isNaN(date.getTime())) {
                return '';
            }
            
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            
            return `${year}-${month}-${day}`;
        } catch (error) {
            console.error('日期格式化失败:', error);
            return '';
        }
    }
}

// 导出功能
function exportData(format) {
    if (!window.app || !window.app.lastQueryResult) {
        window.app?.showStatus('没有可导出的数据', true);
        return;
    }

    try {
        const { headers, rows } = window.app.lastQueryResult;
        let content, filename, type;
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        if (format === 'html') {
            content = createHTMLExport(headers, rows);
            filename = `query-result-${timestamp}.html`;
            type = 'text/html';
        } else if (format === 'markdown') {
            content = createMarkdownExport(headers, rows);
            filename = `query-result-${timestamp}.md`;
            type = 'text/markdown';
        }
        
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
        
        window.app?.showStatus(`导出成功: ${filename}`);
    } catch (error) {
        console.error('导出失败:', error);
        window.app?.showStatus('导出失败: ' + error.message, true);
    }
}

function createHTMLExport(headers, rows) {
    let html = `
<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>查询结果导出</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        tr:nth-child(even) { background-color: #f9f9f9; }
    </style>
</head>
<body>
    <h1>数据查询结果</h1>
    <p>导出时间: ${new Date().toLocaleString()}</p>
    <table>
        <thead>
            <tr>
`;
    
    headers.forEach(header => {
        html += `                <th>${header}</th>\n`;
    });
    
    html += `            </tr>
        </thead>
        <tbody>
`;
    
    rows.forEach(row => {
        html += '            <tr>\n';
        row.forEach(cell => {
            html += `                <td>${cell}</td>\n`;
        });
        html += '            </tr>\n';
    });
    
    html += `        </tbody>
    </table>
</body>
</html>`;
    
    return html;
}

function createMarkdownExport(headers, rows) {
    let markdown = '# 数据查询结果\n\n';
    markdown += `导出时间: ${new Date().toLocaleString()}\n\n`;
    
    // 创建表头
    markdown += '| ' + headers.join(' | ') + ' |\n';
    markdown += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
    
    // 创建数据行
    rows.forEach(row => {
        markdown += '| ' + row.join(' | ') + ' |\n';
    });
    
    return markdown;
}

// 全局函数
window.exportData = exportData;

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    window.app = new DataQueryApp();
    console.log('数据查询应用已启动');
});