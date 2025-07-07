/**
 * 前端配置文件
 * 集中管理所有可配置的参数和常量
 */

// 计算配置
export const CALCULATION_CONFIG = {
    // 收入计算系数 - 根据页面显示的实际系数配置
    INCOME_RATES: {
        LAXIN: 3,        // 拉新收入系数（新用户奖励）
        ZHUANCUN: 0.1    // 转存收入系数（转存激励）
    },

    // 显示列配置
    DISPLAY_COLUMNS: [
        "日期",
        "移动拉新数",
        "移动转存数",
        "会员订单数",
        // "会员订单金额", // 已隐藏会员订单金额
        "会员佣金（元）"
    ],

    // 数值计算列配置
    NUMERIC_COLUMNS: [
        "移动拉新数",
        "移动转存数",
        "会员订单数",
        // "会员订单金额", // 已隐藏会员订单金额 
        "会员佣金（元）"
    ],

    // 格式化配置
    FORMAT_CONFIG: {
        CURRENCY: {
            locale: 'en-US',
            options: {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }
        }
    },

    // 元素ID映射 - 与HTML模板中的实际ID保持一致
    ELEMENT_IDS: {
        LAXIN_INCOME: 'totalNewUserIncome',      // 拉新总收益
        ZHUANCUN_INCOME: 'totalTransferIncome',  // 转存总收益
        TOTAL_NEW_USERS: 'totalNewUsers',        // 总移动拉新数
        TOTAL_TRANSFERS: 'totalTransfers',       // 移动总转存数
        TOTAL_ORDERS: 'totalOrders',             // 总会员订单数
        TOTAL_ORDER_AMOUNT: 'totalOrderAmount',  // 总会员订单金额
        TOTAL_COMMISSION: 'totalCommission'      // 总会员佣金
    }
};

// 性能配置
export const PERFORMANCE_CONFIG = {
    TABLE_BATCH_SIZE: 50,
    CACHE_ENABLED: true,
    DEBOUNCE_DELAY: 300
};

// 错误消息配置
export const ERROR_MESSAGES = {
    INVALID_HEADERS: '无效的表头数据',
    INVALID_ROWS: '无效的行数据',
    CALCULATION_ERROR: '计算出错',
    ELEMENT_NOT_FOUND: '找不到目标元素'
};

// 导出默认配置
export default {
    CALCULATION_CONFIG,
    PERFORMANCE_CONFIG,
    ERROR_MESSAGES
};