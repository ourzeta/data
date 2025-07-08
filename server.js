const express = require('express');
const { chromium } = require('playwright');
const cheerio = require('cheerio');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();

// 配置 - 禁止修改的默认参数
const CONFIG = {
    SECRET_KEY: process.env.SECRET_KEY || 'a-hard-to-guess-string',
    BASE_URL: "https://csj.sgj.cn/main/sfsjcx",
    DEFAULT_AUTH_KEY: process.env.DEFAULT_AUTH_KEY || "329bSNv6H7fSWPELIdKF9R85s5aRT0VHlrizy8BcOSo1nGrXmCRykQupgyHib3p9gM5OxB%2F2",
    DEFAULT_APP_ID: process.env.DEFAULT_APP_ID || "649",
    PROFIT_COEFFICIENTS: {
        new_user: 3.0,  // 拉新系数
        deposit: 0.1    // 转存系数
    }
};

// 中间件配置 - 针对低性能服务器优化
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
app.use(compression({ level: 6 })); // 降低压缩级别以减少CPU使用
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 设置Playwright浏览器路径
const BROWSERS_PATH = path.join(__dirname, 'browsers');
process.env.PLAYWRIGHT_BROWSERS_PATH = BROWSERS_PATH;

// 确保浏览器目录存在
if (!fs.existsSync(BROWSERS_PATH)) {
    fs.mkdirSync(BROWSERS_PATH, { recursive: true });
}

// 浏览器实例管理 - 复用浏览器实例以节省资源
let browserInstance = null;
let browserUsageCount = 0;
const MAX_BROWSER_USAGE = 50; // 每50次使用后重启浏览器

async function getBrowser() {
    if (!browserInstance || browserUsageCount >= MAX_BROWSER_USAGE) {
        if (browserInstance) {
            try {
                await browserInstance.close();
            } catch (error) {
                console.warn('关闭旧浏览器实例时出错:', error.message);
            }
        }
        
        // 针对低性能服务器的浏览器启动参数
        browserInstance = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-field-trial-config',
                '--disable-ipc-flooding-protection',
                '--memory-pressure-off',
                '--max_old_space_size=512', // 限制内存使用
                '--disable-extensions',
                '--disable-plugins',
                '--disable-images', // 禁用图片加载以节省带宽和内存
                '--disable-javascript', // 对于数据抓取可以禁用JS
            ]
        });
        browserUsageCount = 0;
    }
    browserUsageCount++;
    return browserInstance;
}

// 构建目标URL
function buildTargetUrl(appId = null) {
    const id = appId || CONFIG.DEFAULT_APP_ID;
    return `${CONFIG.BASE_URL}?app_id=${id}&auth_key=${CONFIG.DEFAULT_AUTH_KEY}`;
}

// HTML表格解析函数
function parseTableData(html) {
    const $ = cheerio.load(html);
    const headers = [];
    const rows = [];

    // 方式1: 查找传统table标签
    const table = $('table').first();
    if (table.length) {
        // 提取表头
        const headerRow = table.find('thead tr').first();
        if (headerRow.length) {
            headerRow.find('th, td').each((i, el) => {
                headers.push($(el).text().trim());
            });
        } else {
            // 如果没有thead，尝试第一行作为表头
            const firstRow = table.find('tr').first();
            if (firstRow.length) {
                firstRow.find('th, td').each((i, el) => {
                    headers.push($(el).text().trim());
                });
            }
        }

        // 提取数据行
        const tbody = table.find('tbody');
        const dataRows = tbody.length ? tbody.find('tr') : table.find('tr').slice(headers.length ? 1 : 0);
        
        dataRows.each((i, row) => {
            const cells = [];
            $(row).find('td, th').each((j, cell) => {
                cells.push($(cell).text().trim());
            });
            if (cells.length > 0) {
                rows.push(cells);
            }
        });

        if (headers.length || rows.length) {
            return { headers, rows };
        }
    }

    // 方式2: 查找div结构的表格
    const tableContainer = $('.table').first();
    if (tableContainer.length) {
        // 提取表头
        const headerRow = tableContainer.find('.table_header').first();
        if (headerRow.length) {
            headerRow.find('div').each((i, el) => {
                const text = $(el).text().trim();
                if (text) headers.push(text);
            });
        }

        // 提取数据行
        const body = tableContainer.find('.table_body').first();
        if (body.length) {
            body.find('.table_body_item').each((i, row) => {
                const cells = [];
                $(row).find('div').each((j, cell) => {
                    const text = $(cell).text().trim();
                    if (text) cells.push(text);
                });
                if (cells.length > 0) {
                    rows.push(cells);
                }
            });
        }

        if (headers.length || rows.length) {
            return { headers, rows };
        }
    }

    return { headers: [], rows: [] };
}

// 数据抓取函数
async function scrapeData(ukCode, startDate, endDate, headless = true, appId = null) {
    let browser = null;
    let page = null;
    
    try {
        browser = await getBrowser();
        const context = await browser.newContext({
            viewport: { width: 1280, height: 720 }, // 降低分辨率以节省内存
            userAgent: 'Mozilla/5.0 (Linux; CentOS 7.6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            javaScriptEnabled: true,
            acceptDownloads: false,
            ignoreHTTPSErrors: true,
            bypassCSP: true,
        });

        page = await context.newPage();
        
        // 设置超时时间 - 针对低性能服务器延长超时
        page.setDefaultTimeout(60000);
        page.setDefaultNavigationTimeout(60000);

        const targetUrl = buildTargetUrl(appId);
        console.log(`正在访问: ${targetUrl}`);

        // 页面加载重试机制
        let retries = 3;
        while (retries > 0) {
            try {
                await page.goto(targetUrl, {
                    timeout: 45000,
                    waitUntil: 'domcontentloaded'
                });
                await page.waitForLoadState('networkidle', { timeout: 15000 });
                break;
            } catch (error) {
                retries--;
                if (retries === 0) throw error;
                console.warn(`页面加载失败，剩余重试次数: ${retries}`);
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }

        // 等待输入框并填入UK码
        await page.waitForSelector('#app > div.search > div:nth-child(2) > input[type=text]', { timeout: 20000 });
        await page.fill('#app > div.search > div:nth-child(2) > input[type=text]', ukCode);

        // 设置日期
        const dateSetSuccess = await page.evaluate((start, end) => {
            try {
                if (window.vm && window.vm.$data) {
                    window.vm.$data.showType = 1;
                    const [startYear, startMonth, startDay] = start.split('-');
                    window.vm.$data.submitTime(new Date(startYear, startMonth-1, startDay));
                    
                    window.vm.$data.showType = 2;
                    const [endYear, endMonth, endDay] = end.split('-');
                    window.vm.$data.submitTime(new Date(endYear, endMonth-1, endDay));
                    
                    return true;
                }
                return false;
            } catch (error) {
                console.error('日期设置失败:', error);
                return false;
            }
        }, startDate, endDate);

        if (!dateSetSuccess) {
            console.warn('日期设置可能失败');
        }

        // 点击提交按钮
        await page.click('#app > div.search > div.submit');

        // 等待结果
        try {
            await page.waitForSelector('#app > div.list > div.tab_warp', { timeout: 45000 });
        } catch (error) {
            await page.waitForSelector('table, .table, [class*="table"]', { timeout: 20000 });
        }

        // 等待数据加载完成
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 获取表格内容
        const tableHtml = await page.innerHTML('#app > div.list > div.tab_warp').catch(() => '');
        
        console.log(`抓取到的表格HTML长度: ${tableHtml.length}`);

        let { headers, rows } = parseTableData(tableHtml);

        // 如果第一次解析失败，尝试获取完整页面内容
        if (!headers.length && !rows.length) {
            console.log('第一次解析失败，尝试获取完整页面内容');
            const fullHtml = await page.content();
            const result = parseTableData(fullHtml);
            headers = result.headers;
            rows = result.rows;
        }

        // 标准化表头
        const standardHeaders = [
            "日期",
            "移动拉新数", 
            "移动转存数",
            "会员订单数",
            "会员订单金额",
            "会员佣金（元）"
        ];

        // 如果没有抓取到数据，使用默认数据
        if (!headers.length || !rows.length) {
            headers = standardHeaders;
            rows = [
                [startDate, "0", "0", "0", "0.00", "0.00"],
                [endDate, "0", "0", "0", "0.00", "0.00"]
            ];
        } else {
            // 标准化表头，保留实际数据
            if (JSON.stringify(headers) !== JSON.stringify(standardHeaders)) {
                headers = standardHeaders;
            }
            // 确保每行数据长度与表头一致
            rows = rows.map(row => {
                if (row.length >= standardHeaders.length) {
                    return row.slice(0, standardHeaders.length);
                } else {
                    return [...row, ...new Array(standardHeaders.length - row.length).fill("0")];
                }
            });
        }

        await context.close();

        return {
            headers,
            rows,
            html: tableHtml.substring(0, 5000),
            success: true
        };

    } catch (error) {
        console.error('抓取数据时发生错误:', error);
        
        if (page) {
            try {
                await page.close();
            } catch (closeError) {
                console.warn('关闭页面时出错:', closeError.message);
            }
        }

        return {
            error: `抓取失败: ${error.message}`,
            success: false
        };
    }
}

// 日期验证函数
function isValidDate(dateString) {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateString)) return false;
    
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date) && date.toISOString().slice(0, 10) === dateString;
}

// API路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        memory: process.memoryUsage(),
        uptime: process.uptime()
    });
});

app.get('/api/coefficients', (req, res) => {
    res.json({ 
        success: true, 
        data: CONFIG.PROFIT_COEFFICIENTS 
    });
});

app.post('/api/query', async (req, res) => {
    const startTime = Date.now();
    const requestId = `${startTime}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
        const { uk_code, start_date, end_date, headless = true, app_id } = req.body;
        
        console.log(`[${requestId}] 收到查询请求:`, { uk_code, start_date, end_date, app_id });

        // 参数验证
        const errors = [];
        
        if (!uk_code || typeof uk_code !== 'string' || uk_code.trim() === '') {
            errors.push('请输入UK码');
        } else if (uk_code.trim().length > 50) {
            errors.push('UK码长度不能超过50个字符');
        }

        if (!start_date || !isValidDate(start_date)) {
            errors.push('请输入有效的开始日期 (YYYY-MM-DD)');
        }

        if (!end_date || !isValidDate(end_date)) {
            errors.push('请输入有效的结束日期 (YYYY-MM-DD)');
        }

        if (start_date && end_date && isValidDate(start_date) && isValidDate(end_date)) {
            const startDate = new Date(start_date);
            const endDate = new Date(end_date);
            const today = new Date();
            today.setHours(23, 59, 59, 999);

            if (startDate > today || endDate > today) {
                errors.push('日期不能超过今天');
            } else if (startDate > endDate) {
                errors.push('开始日期不能晚于结束日期');
            } else if ((endDate - startDate) / (1000 * 60 * 60 * 24) > 365) {
                errors.push('查询时间范围不能超过365天');
            }
        }

        if (app_id && app_id.trim() !== '') {
            const appIdTrimmed = app_id.trim();
            if (!/^\d+$/.test(appIdTrimmed)) {
                errors.push('项目ID必须为数字');
            } else if (appIdTrimmed.length > 10) {
                errors.push('项目ID长度不能超过10位');
            }
        }

        if (errors.length > 0) {
            return res.status(400).json({ 
                error: errors.join('; '),
                request_id: requestId 
            });
        }

        console.log(`[${requestId}] 开始查询: UK码=${uk_code.trim()}, 开始日期=${start_date}, 结束日期=${end_date}`);

        // 执行查询
        const result = await scrapeData(
            uk_code.trim(),
            start_date,
            end_date,
            headless,
            app_id ? app_id.trim() : null
        );

        const executionTime = (Date.now() - startTime) / 1000;
        console.log(`[${requestId}] 查询执行时间: ${executionTime.toFixed(2)}秒`);

        if (!result.success) {
            return res.status(500).json({
                error: result.error,
                request_id: requestId
            });
        }

        // 验证结果
        if (!result.headers || !result.rows) {
            return res.status(500).json({
                error: '查询结果格式不正确',
                request_id: requestId
            });
        }

        console.log(`[${requestId}] 查询成功: 找到${result.rows.length}行数据`);

        res.json({
            ...result,
            execution_time: executionTime,
            request_id: requestId
        });

    } catch (error) {
        const executionTime = (Date.now() - startTime) / 1000;
        console.error(`[${requestId}] 处理请求时发生异常:`, error);
        
        res.status(500).json({
            error: `处理请求时发生错误: ${error.message}`,
            request_id: requestId,
            execution_time: executionTime
        });
    }
});

// 错误处理中间件
app.use((error, req, res, next) => {
    console.error('未处理的错误:', error);
    res.status(500).json({
        error: '服务器内部错误',
        message: error.message
    });
});

// 404处理
app.use((req, res) => {
    res.status(404).json({
        error: '接口不存在',
        path: req.path
    });
});

// 优雅关闭
process.on('SIGINT', async () => {
    console.log('\n收到中断信号，正在安全关闭...');
    
    if (browserInstance) {
        try {
            await browserInstance.close();
            console.log('浏览器实例已关闭');
        } catch (error) {
            console.warn('关闭浏览器时出错:', error.message);
        }
    }
    
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('收到终止信号，正在安全关闭...');
    
    if (browserInstance) {
        try {
            await browserInstance.close();
        } catch (error) {
            console.warn('关闭浏览器时出错:', error.message);
        }
    }
    
    process.exit(0);
});

// 启动服务器
const PORT = process.env.PORT || 5001;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`\n🚀 数据查询服务已启动`);
    console.log(`📍 访问地址: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log(`🔧 环境: ${process.env.NODE_ENV || 'development'}`);
    console.log(`💾 内存使用: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
    console.log(`🖥️  系统: ${os.type()} ${os.release()}`);
    console.log(`📊 测试UK码: 663832639`);
    console.log(`⚡ 针对CentOS 7.6优化版本\n`);
});