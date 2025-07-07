/**
 * UI相关功能模块
 * 处理界面显示、状态更新、表格渲染等
 */

import {
    CALCULATION_CONFIG,
    PERFORMANCE_CONFIG,
    ERROR_MESSAGES
} from './config.js';
import { CalculationService } from './calculationService.js';

// 使用配置化的可见列
const VISIBLE_COLUMNS = CALCULATION_CONFIG.DISPLAY_COLUMNS;

/**
 * 显示状态消息
 * @param {string} message - 要显示的消息
 * @param {boolean} isError - 是否为错误消息
 */
export function showStatus(message, isError = false) {
    console.log(`显示状态消息: ${message}, 是否错误: ${isError}`);
    const statusEl = document.getElementById('statusMessage');
    if (!statusEl) {
        console.error('找不到状态消息元素');
        return;
    }

    statusEl.textContent = message;
    statusEl.classList.remove(
        'hidden',
        'bg-blue-50',
        'text-blue-700',
        'border-blue-200',
        'bg-red-50',
        'text-red-700',
        'border-red-200'
    );

    if (isError) {
        statusEl.classList.add(
            'bg-red-50',
            'text-red-700',
            'border',
            'border-red-200'
        );
    } else {
        statusEl.classList.add(
            'bg-blue-50',
            'text-blue-700',
            'border',
            'border-blue-200'
        );
    }

    // 自动隐藏成功消息
    if (!isError) {
        setTimeout(() => {
            statusEl.classList.add('hidden');
        }, 3000);
    }
}

/**
 * 设置加载状态
 * @param {boolean} loading - 是否处于加载状态
 */
export function setLoading(loading) {
    const queryBtn = document.getElementById('queryBtn');
    const spinner = document.getElementById('loadingSpinner');
    const btnText = document.getElementById('btnText');
    const form = document.getElementById('queryForm');

    if (!queryBtn || !spinner || !btnText || !form) {
        console.error('找不到加载状态相关元素');
        return;
    }

    queryBtn.disabled = loading;
    form.disabled = loading; // 禁用表单，防止重复提交
    if (loading) {
        spinner.classList.remove('hidden');
        btnText.textContent = '查询中...';
        queryBtn.classList.add('opacity-75', 'cursor-not-allowed');
    } else {
        spinner.classList.add('hidden');
        btnText.textContent = '查询数据';
        queryBtn.classList.remove('opacity-75', 'cursor-not-allowed');
    }
}

/**
 * 创建表格HTML
 * @param {string[]} headers - 表头数组
 * @param {Array<string[]>} rows - 数据行数组
 * @returns {string} - 生成的HTML字符串
 */
export function createTableHTML(headers, rows) {
    console.time('createTableHTML');

    if (!headers || !Array.isArray(headers) || headers.length === 0) {
        console.error('无效的表头数据:', headers);
        return (
            '<div class="p-4 text-red-500">' +
            '无法显示表格：表头数据无效</div>'
        );
    }

    if (!rows || !Array.isArray(rows)) {
        console.error('无效的行数据:', rows);
        return (
            '<div class="p-4 text-amber-500">' +
            '查询结果为空，没有找到匹配的数据</div>'
        );
    }

    const hasValidData = rows.some(row => {
        return Array.isArray(row) &&
               row.length > 0 &&
               row.some(cell => {
                   return cell !== null &&
                          cell !== undefined &&
                          cell !== '';
               });
    });
    if (!hasValidData) {
        console.warn('所有数据行都是空的:', rows);
        return (
            '<div class="p-4 text-amber-500">' +
            '查询结果为空，没有找到匹配的数据</div>'
        );
    }

    headers = headers.map((header, index) => header || `列 ${index + 1}`);

    const allColumns = headers.map((header, index) => ({
        header: header || `列 ${index + 1}`,
        index: index
    }));

    let visibleColumns = allColumns;
    if (VISIBLE_COLUMNS.length > 0) {
        visibleColumns = allColumns.filter(col => {
            return VISIBLE_COLUMNS.includes(col.header);
        });
    }

    if (visibleColumns.length === 0) {
        visibleColumns = allColumns;
    }

    let tableHTML = (
        '<div class="overflow-x-auto overflow-y-hidden" style="width:100%;">' +
        '<table class="min-w-full text-sm" style="table-layout:fixed;">'
    );

    tableHTML += '<thead><tr class="bg-gray-100">';
    visibleColumns.forEach(col => {
        tableHTML += (
            `<th class="p-3 text-left font-semibold text-gray-600 ` +
            `sticky top-0 bg-gray-100 z-10">${col.header}</th>`
        );
    });
    tableHTML += '</tr></thead>';

    tableHTML += '<tbody>';
    const batchSize = PERFORMANCE_CONFIG.TABLE_BATCH_SIZE;
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!Array.isArray(row)) continue;

        tableHTML += (
            `<tr class="border-b border-gray-200 hover:bg-gray-50 ` +
            `transition-colors">`
        );
        visibleColumns.forEach(col => {
            const cellValue = row[col.index] || '';
            tableHTML += (
                `<td class="p-3 text-gray-700 whitespace-nowrap ` +
                `overflow-hidden text-ellipsis">${cellValue}</td>`
            );
        });
        tableHTML += '</tr>';
    }
    tableHTML += '</tbody></table></div>';

    console.timeEnd('createTableHTML');
    return tableHTML;
}

/**
 * 计算并显示总计
 * @param {string[]} headers - 表头数组
 * @param {Array<string[]>} rows - 数据行数组
 */
export function calculateAndDisplayTotals(headers, rows) {
    try {
        // 验证输入数据
        if (!CalculationService.validateCalculationData({ headers, rows })) {
            throw new Error('输入数据验证失败');
        }

        // 计算基础总计
        const calculationResult = CalculationService.calculateTotals(headers, rows);
        const { totals } = calculationResult;

        // 显示基础总计数据
        const columnMapping = {
            '移动拉新数': CALCULATION_CONFIG.ELEMENT_IDS.TOTAL_NEW_USERS,
            '移动转存数': CALCULATION_CONFIG.ELEMENT_IDS.TOTAL_TRANSFERS,
            '会员订单数': CALCULATION_CONFIG.ELEMENT_IDS.TOTAL_ORDERS,
            '会员订单金额': CALCULATION_CONFIG.ELEMENT_IDS.TOTAL_ORDER_AMOUNT,
            '会员佣金（元）': CALCULATION_CONFIG.ELEMENT_IDS.TOTAL_COMMISSION
        };
        
        for (const colName in totals) {
            const elementId = columnMapping[colName];
            if (elementId) {
                const el = document.getElementById(elementId);
                if (el) {
                    if (colName === '会员订单金额' || colName === '会员佣金（元）') {
                        el.textContent = CalculationService.formatCurrency(totals[colName]) + '元';
                    } else {
                        el.textContent = totals[colName].toString();
                    }
                } else {
                    console.warn(`找不到元素: ${elementId} (对应列: ${colName})`);
                }
            }
        }

        // 计算和显示收入
        const incomeData = CalculationService.calculateIncome(totals);
        
        // 显示拉新收入
        const laxinIncomeEl = document.getElementById(
            CALCULATION_CONFIG.ELEMENT_IDS.LAXIN_INCOME
        );
        if (laxinIncomeEl) {
            laxinIncomeEl.textContent = CalculationService.formatCurrency(
                incomeData.laxinIncome
            ) + '元';
        } else {
            console.warn(
                `找不到元素: ${CALCULATION_CONFIG.ELEMENT_IDS.LAXIN_INCOME}`
            );
        }

        // 显示转存收入
        const zhuancunIncomeEl = document.getElementById(
            CALCULATION_CONFIG.ELEMENT_IDS.ZHUANCUN_INCOME
        );
        if (zhuancunIncomeEl) {
            zhuancunIncomeEl.textContent = CalculationService.formatCurrency(
                incomeData.zhuancunIncome
            ) + '元';
        } else {
            console.warn(
                `找不到元素: ${CALCULATION_CONFIG.ELEMENT_IDS.ZHUANCUN_INCOME}`
            );
        }
        
        // 显示总计统计区域
        const totalStatsEl = document.getElementById('totalStats');
        if (totalStatsEl) {
            totalStatsEl.classList.remove('hidden');
        }

        // 输出计算摘要到控制台（便于调试）
        console.log('计算摘要:', {
            基础总计: totals,
            收入计算: incomeData,
            使用系数: incomeData.rates
        });

    } catch (error) {
        console.error('计算总计时出错:', error);
        showStatus(
            `${ERROR_MESSAGES.CALCULATION_ERROR}: ${error.message}`,
            true
        );
        
        // 显示错误状态
        const errorElements = [
            CALCULATION_CONFIG.ELEMENT_IDS.LAXIN_INCOME,
            CALCULATION_CONFIG.ELEMENT_IDS.ZHUANCUN_INCOME
        ];
        
        errorElements.forEach(elementId => {
            const el = document.getElementById(elementId);
            if (el) {
                el.textContent = '计算错误';
                el.style.color = '#ef4444'; // 红色错误提示
            }
        });
    }
}

/**
 * 渲染查询结果
 * @param {object} data - 查询结果数据
 */
export function renderResults(data) {
    try {
        console.time('renderResults');
        const resultCard = document.getElementById('resultCard');
        const resultTable = document.getElementById('resultTable');

        if (!resultCard || !resultTable) {
            throw new Error('找不到结果显示容器');
        }

        // 兼容性处理：确保 data.headers 和 data.rows 有效
        const headers = Array.isArray(data.headers) ? data.headers : [];
        const rows = Array.isArray(data.rows) ? data.rows : [];

        // 生成表格 HTML
        const tableHTML = createTableHTML(headers, rows);
        if (!tableHTML) {
            throw new Error('表格HTML生成失败');
        }

        // 插入表格到 DOM
        resultTable.innerHTML = tableHTML;
        resultCard.classList.remove('hidden');

        // 计算并显示统计
        calculateAndDisplayTotals(headers, rows);

        showStatus('查询完成！');
        console.timeEnd('renderResults');
    } catch (error) {
        console.error('渲染表格时出错:', error);
        showStatus(`渲染表格时出错: ${error.message}`, true);
        // 保证页面不会因异常而卡死
        const resultTable = document.getElementById('resultTable');
        if (resultTable) {
            resultTable.innerHTML = `<div class='p-4 text-red-500'>渲染表格时出错: ${error.message}</div>`;
        }
    }
}