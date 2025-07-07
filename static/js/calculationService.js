/**
 * 计算服务类
 * 封装所有数据计算和格式化逻辑
 */

import { CALCULATION_CONFIG, ERROR_MESSAGES } from './config.js';

export class CalculationService {
    /**
     * 计算收入数据
     * @param {Object} totals - 总计数据对象
     * @returns {Object} 收入计算结果
     */
    static calculateIncome(totals) {
        try {
            const laxinTotal = totals['移动拉新数'] || 0;
            const zhuancunTotal = totals['移动转存数'] || 0;

            const laxinIncome = laxinTotal * CALCULATION_CONFIG.INCOME_RATES.LAXIN;
            const zhuancunIncome = zhuancunTotal * CALCULATION_CONFIG.INCOME_RATES.ZHUANCUN;

            return {
                laxinTotal,
                zhuancunTotal,
                laxinIncome,
                zhuancunIncome,
                totalIncome: laxinIncome + zhuancunIncome,
                rates: {
                    laxin: CALCULATION_CONFIG.INCOME_RATES.LAXIN,
                    zhuancun: CALCULATION_CONFIG.INCOME_RATES.ZHUANCUN
                }
            };
        } catch (error) {
            console.error('计算收入时出错:', error);
            throw new Error(`${ERROR_MESSAGES.CALCULATION_ERROR}: ${error.message}`);
        }
    }

    /**
     * 计算数值列总计
     * @param {Array} headers - 表头数组
     * @param {Array} rows - 数据行数组
     * @returns {Object} 总计结果
     */
    static calculateTotals(headers, rows) {
        try {
            if (!headers || !Array.isArray(headers)) {
                throw new Error(ERROR_MESSAGES.INVALID_HEADERS);
            }

            if (!rows || !Array.isArray(rows)) {
                throw new Error(ERROR_MESSAGES.INVALID_ROWS);
            }

            const totals = {};
            const indices = {};

            // 建立数值列索引
            headers.forEach((header, i) => {
                if (CALCULATION_CONFIG.NUMERIC_COLUMNS.includes(header)) {
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

            return {
                totals,
                indices,
                rowCount: rows.length,
                columnCount: Object.keys(indices).length
            };
        } catch (error) {
            console.error('计算总计时出错:', error);
            throw error;
        }
    }

    /**
     * 格式化货币数值
     * @param {number} amount - 金额
     * @returns {string} 格式化后的字符串
     */
    static formatCurrency(amount) {
        try {
            if (typeof amount !== 'number' || isNaN(amount)) {
                return '0.00';
            }

            return amount.toLocaleString(
                CALCULATION_CONFIG.FORMAT_CONFIG.CURRENCY.locale,
                CALCULATION_CONFIG.FORMAT_CONFIG.CURRENCY.options
            );
        } catch (error) {
            console.error('格式化货币时出错:', error);
            return amount.toString();
        }
    }

    /**
     * 验证计算数据
     * @param {Object} data - 要验证的数据
     * @returns {boolean} 验证结果
     */
    static validateCalculationData(data) {
        if (!data || typeof data !== 'object') {
            return false;
        }

        const { headers, rows } = data;

        if (!headers || !Array.isArray(headers) || headers.length === 0) {
            return false;
        }

        if (!rows || !Array.isArray(rows)) {
            return false;
        }

        return true;
    }

    /**
     * 获取配置信息
     * @returns {Object} 当前配置
     */
    static getConfig() {
        return {
            incomeRates: { ...CALCULATION_CONFIG.INCOME_RATES },
            numericColumns: [...CALCULATION_CONFIG.NUMERIC_COLUMNS],
            displayColumns: [...CALCULATION_CONFIG.DISPLAY_COLUMNS],
            formatConfig: { ...CALCULATION_CONFIG.FORMAT_CONFIG }
        };
    }

    /**
     * 更新收入系数（运行时动态更新）
     * @param {Object} newRates - 新的系数配置
     */
    static updateIncomeRates(newRates) {
        if (newRates && typeof newRates === 'object') {
            if (typeof newRates.LAXIN === 'number' && newRates.LAXIN > 0) {
                CALCULATION_CONFIG.INCOME_RATES.LAXIN = newRates.LAXIN;
            }
            if (typeof newRates.ZHUANCUN === 'number' && newRates.ZHUANCUN > 0) {
                CALCULATION_CONFIG.INCOME_RATES.ZHUANCUN = newRates.ZHUANCUN;
            }

            console.log('收入系数已更新:', CALCULATION_CONFIG.INCOME_RATES);
        }
    }
}

// 导出默认实例
export default CalculationService;