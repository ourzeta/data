import asyncio
import atexit
import json
import logging
import os
import signal
import sys
import threading
import time
import weakref
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import asynccontextmanager
from datetime import datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from bs4 import BeautifulSoup
from flask import Flask, jsonify, render_template, request
from playwright.async_api import (
    TimeoutError as PlaywrightTimeoutError,
    async_playwright,
)

from config import config

# 设置Playwright浏览器路径环境变量


def setup_playwright_environment():
    """强制设置Playwright浏览器环境变量到项目venv目录，并验证环境配置"""
    try:
        # 获取当前目录和浏览器路径
        current_dir = Path(__file__).parent.absolute()
        browsers_path = current_dir / "venv" / "browsers"

        # 确保浏览器目录存在
        browsers_path.mkdir(parents=True, exist_ok=True)

        # 检查是否已经设置了环境变量
        import os  # 在函数内部重新导入

        existing_path = os.environ.get("PLAYWRIGHT_BROWSERS_PATH")
        if existing_path:
            print(f"[环境配置] 当前PLAYWRIGHT_BROWSERS_PATH: {existing_path}")
            # 如果已设置但不是我们期望的路径，记录警告
            if Path(existing_path) != browsers_path:
                print("[环境配置] 警告: 当前路径与期望路径不一致，将被覆盖")

        # 强制设置环境变量
        os.environ["PLAYWRIGHT_BROWSERS_PATH"] = str(browsers_path)
        print(f"[环境配置] 设置PLAYWRIGHT_BROWSERS_PATH为: {browsers_path}")

        # 验证路径设置
        if os.environ.get("PLAYWRIGHT_BROWSERS_PATH") == str(browsers_path):
            print(f"[环境配置] Playwright浏览器路径配置成功")
        else:
            print(f"[环境配置] 错误: 浏览器路径配置失败")
            raise EnvironmentError("无法设置Playwright浏览器路径环境变量")

        # 检查浏览器是否已安装
        import glob
        import platform

        # 根据操作系统确定浏览器路径模式
        if platform.system() == "Windows":
            chromium_path_pattern = str(browsers_path / "chromium-*")
        else:
            chromium_path_pattern = str(browsers_path / "*" / "chromium")

        chromium_paths = glob.glob(chromium_path_pattern)

        browser_needs_install = False

        if chromium_paths:
            print(f"[环境配置] 检测到已安装的Chromium浏览器: {chromium_paths[0]}")
            # 验证浏览器可执行文件是否存在
            if platform.system() == "Windows":
                executable = Path(chromium_paths[0]) / "chrome.exe"
            else:
                executable = Path(chromium_paths[0])

            if executable.exists():
                print(f"[环境配置] Chromium浏览器可执行文件验证成功")
            else:
                print(f"[环境配置] 警告: 浏览器可执行文件不存在，将自动重新安装")
                browser_needs_install = True
        else:
            print(f"[环境配置] 警告: 未检测到Chromium浏览器，将自动安装")
            browser_needs_install = True

        # 自动安装浏览器
        if browser_needs_install:
            try:
                print(f"[环境配置] 正在自动安装Playwright浏览器...")
                import subprocess
                import sys

                # 设置国内镜像源环境变量
                env = os.environ.copy()
                env["PLAYWRIGHT_DOWNLOAD_HOST"] = (
                    "https://npmmirror.com/mirrors/playwright"
                )
                env["PLAYWRIGHT_BROWSERS_PATH"] = str(browsers_path)

                # 多次重试安装，使用不同的策略
                install_success = False
                retry_count = 3

                for attempt in range(retry_count):
                    print(f"[环境配置] 安装尝试 {attempt + 1}/{retry_count}...")

                    try:
                        # 第一次尝试使用国内镜像
                        if attempt == 0:
                            result = subprocess.run(
                                [
                                    sys.executable,
                                    "-m",
                                    "playwright",
                                    "install",
                                    "--with-deps",
                                    "chromium",
                                ],
                                capture_output=True,
                                text=True,
                                timeout=600,  # 10分钟超时
                                env=env,
                            )
                        # 第二次尝试不使用镜像
                        elif attempt == 1:
                            result = subprocess.run(
                                [
                                    sys.executable,
                                    "-m",
                                    "playwright",
                                    "install",
                                    "chromium",
                                ],
                                capture_output=True,
                                text=True,
                                timeout=600,
                                env=env,
                            )
                        # 第三次尝试使用官方源
                        else:
                            env_official = os.environ.copy()
                            env_official["PLAYWRIGHT_BROWSERS_PATH"] = str(
                                browsers_path
                            )
                            result = subprocess.run(
                                [
                                    sys.executable,
                                    "-m",
                                    "playwright",
                                    "install",
                                    "chromium",
                                ],
                                capture_output=True,
                                text=True,
                                timeout=600,
                                env=env_official,
                            )

                        if result.returncode == 0:
                            print(
                                f"[环境配置] Playwright浏览器安装成功 (尝试 {attempt + 1})"
                            )
                            install_success = True
                            break
                        else:
                            print(
                                f"[环境配置] 尝试 {attempt + 1} 失败: {result.stderr[:200]}..."
                            )

                    except subprocess.TimeoutExpired:
                        print(f"[环境配置] 尝试 {attempt + 1} 超时")
                    except Exception as e:
                        print(f"[环境配置] 尝试 {attempt + 1} 异常: {e}")

                    # 等待一段时间再重试
                    if attempt < retry_count - 1:
                        print(f"[环境配置] 等待5秒后重试...")
                        time.sleep(5)

                if install_success:
                    # 重新检查安装结果
                    chromium_paths = glob.glob(chromium_path_pattern)
                    if chromium_paths:
                        print(f"[环境配置] 验证: 浏览器安装在 {chromium_paths[0]}")
                    else:
                        print(f"[环境配置] 警告: 安装后仍未检测到浏览器")
                else:
                    print(f"[环境配置] 错误: 所有安装尝试都失败")
                    print(f"[环境配置] 建议手动运行以下命令之一:")
                    print(
                        f"[环境配置] 1. python -m playwright install --with-deps chromium"
                    )
                    print(
                        f"[环境配置] 2. PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright python -m playwright install chromium"
                    )

            except Exception as install_error:
                print(f"[环境配置] 错误: 浏览器自动安装异常: {install_error}")
                print(
                    f"[环境配置] 请手动运行: python -m playwright install --with-deps chromium"
                )

        # 验证Playwright库是否可用
        try:
            from playwright.sync_api import sync_playwright

            print(f"[环境配置] Playwright库验证成功")
        except ImportError:
            print(f"[环境配置] 错误: Playwright库未安装或无法导入")
            print(f"[环境配置] 请确保已正确安装依赖: pip install playwright")
            raise

        return True
    except Exception as e:
        print(f"[环境配置] 错误: 设置Playwright环境时出错: {e}")
        import traceback

        traceback.print_exc()
        return False


# 在应用启动时设置Playwright环境
setup_playwright_environment()

app = Flask(__name__)
app.config.from_object(config[os.getenv("FLASK_CONFIG") or "default"])
config[os.getenv("FLASK_CONFIG") or "default"].init_app(app)

# Logging configuration
if not app.debug:
    if not os.path.exists("logs"):
        os.mkdir("logs")
    file_handler = RotatingFileHandler("logs/app.log", maxBytes=10240, backupCount=10)
    file_handler.setFormatter(
        logging.Formatter(
            "%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]"
        )
    )
    file_handler.setLevel(logging.INFO)
    app.logger.addHandler(file_handler)

    app.logger.setLevel(logging.INFO)
    app.logger.info("Flask V1 DataQuery startup")

# 优化线程池配置 - 根据CPU核心数动态调整
import multiprocessing

max_workers = min(4, max(2, multiprocessing.cpu_count()))
executor = ThreadPoolExecutor(
    max_workers=max_workers,
    thread_name_prefix="flask_async_",
)

# 线程本地存储用于事件循环管理
thread_local = threading.local()


# 注册清理函数
def cleanup():
    """优化的资源清理函数"""
    global executor
    app.logger.info("开始清理应用资源...")

    try:
        # 清理线程池 - 修复Python 3.11兼容性
        if executor and not executor._shutdown:
            app.logger.info("正在关闭线程池...")
            # 移除timeout参数以兼容Python 3.11
            executor.shutdown(wait=True)
            app.logger.info("线程池已关闭")
    except Exception as e:
        app.logger.error(f"关闭线程池时出错: {e}")

    try:
        # 清理线程本地存储的事件循环
        if hasattr(thread_local, "loop") and not thread_local.loop.is_closed():
            app.logger.info("正在关闭事件循环...")
            thread_local.loop.close()
            app.logger.info("事件循环已关闭")
    except Exception as e:
        app.logger.error(f"关闭事件循环时出错: {e}")

    app.logger.info("资源清理完成")


atexit.register(cleanup)


# 信号处理
def signal_handler(signum, frame):
    """处理中断信号"""
    print("\n收到中断信号，正在安全关闭...")
    cleanup()
    sys.exit(0)


signal.signal(signal.SIGINT, signal_handler)
if hasattr(signal, "SIGTERM"):
    signal.signal(signal.SIGTERM, signal_handler)


def build_target_url(app_id=None):
    """构建目标URL"""
    app_id = app_id or app.config["DEFAULT_APP_ID"]
    return (
        f"{app.config['BASE_URL']}"
        f"?app_id={app_id}&"
        f"auth_key={app.config['DEFAULT_AUTH_KEY']}"
    )


def html_table_to_data(html: str) -> Tuple[List[str], List[List[str]]]:
    """将HTML表格转换为结构化数据"""
    soup = BeautifulSoup(html, "html.parser")

    # 尝试多种表格结构解析方式
    headers = []
    rows = []

    # 方式1: 查找传统table标签
    table = soup.find("table")
    if table:
        # 提取表头
        header_row = table.find("thead")
        if header_row:
            headers = [
                header.get_text().strip()
                for header in header_row.find_all(["th", "td"])
            ]
        else:
            # 如果没有thead，尝试第一行作为表头
            first_row = table.find("tr")
            if first_row:
                headers = [
                    cell.get_text().strip() for cell in first_row.find_all(["th", "td"])
                ]

        # 提取数据行
        body = table.find("tbody")
        if body:
            for row in body.find_all("tr"):
                cells = [cell.get_text().strip() for cell in row.find_all(["td", "th"])]
                if cells:  # 只添加非空行
                    rows.append(cells)
        else:
            # 如果没有tbody，直接从table中提取所有tr（跳过表头行）
            all_rows = table.find_all("tr")
            for i, row in enumerate(all_rows):
                if i == 0 and headers:  # 跳过表头行
                    continue
                cells = [cell.get_text().strip() for cell in row.find_all(["td", "th"])]
                if cells:
                    rows.append(cells)

        if headers or rows:
            return headers, rows

    # 方式2: 查找div结构的表格（针对目标页面）
    table_container = soup.find("div", class_="table")
    if table_container:
        # 提取表头
        header_row = table_container.find("div", class_="table_header")
        if header_row:
            headers = [
                header.get_text().strip()
                for header in header_row.find_all("div")
                if header.get_text().strip()
            ]

        # 提取数据行
        body = table_container.find("div", class_="table_body")
        if body:
            for row in body.find_all("div", class_="table_body_item"):
                cells = [
                    cell.get_text().strip()
                    for cell in row.find_all("div")
                    if cell.get_text().strip()
                ]
                if cells:
                    rows.append(cells)

        if headers or rows:
            return headers, rows

    # 方式3: 通用div结构解析
    # 查找可能的表格容器
    possible_containers = soup.find_all(
        "div",
        class_=lambda x: x
        and ("table" in x.lower() or "list" in x.lower() or "data" in x.lower()),
    )

    for container in possible_containers:
        # 尝试提取结构化数据
        container_rows = container.find_all("div", recursive=False)
        if len(container_rows) >= 2:  # 至少有表头和一行数据
            # 第一行作为表头
            first_row = container_rows[0]
            potential_headers = [
                cell.get_text().strip()
                for cell in first_row.find_all("div")
                if cell.get_text().strip()
            ]

            # 其余行作为数据
            potential_rows = []
            for row_div in container_rows[1:]:
                cells = [
                    cell.get_text().strip()
                    for cell in row_div.find_all("div")
                    if cell.get_text().strip()
                ]
                if cells:
                    potential_rows.append(cells)

            if potential_headers and potential_rows:
                return potential_headers, potential_rows

    # 方式4: 最后尝试提取所有文本内容并按行分割
    text_content = soup.get_text()
    if text_content.strip():
        lines = [line.strip() for line in text_content.split("\n") if line.strip()]
        if len(lines) >= 2:
            # 简单的文本解析，假设第一行是表头
            headers = [lines[0]] if lines else []
            rows = [[line] for line in lines[1:]] if len(lines) > 1 else []
            return headers, rows

    return [], []


async def scrape_data(
    uk_code: str,
    start_date: str,
    end_date: str,
    headless: bool = True,
    app_id: Optional[str] = None,
) -> Dict[str, Any]:
    """抓取数据"""
    # 优化浏览器启动参数，提高老站点兼容性
    browser_args = [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
        "--disable-web-security",  # 提高老站点兼容性
        "--disable-features=VizDisplayCompositor",  # 兼容老版本渲染
        "--disable-background-timer-throttling",  # 防止后台定时器被限制
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-field-trial-config",
        "--disable-ipc-flooding-protection",
        "--force-color-profile=srgb",  # 确保颜色一致性
        "--disable-blink-features=AutomationControlled",  # 避免被检测
    ]

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=headless,
            args=browser_args,
            slow_mo=50 if not headless else 0,  # 非headless模式下稍微减慢操作
        )

        # 创建页面上下文，设置更好的兼容性
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            java_script_enabled=True,
            accept_downloads=False,
            ignore_https_errors=True,  # 忽略HTTPS错误，提高老站点兼容性
            bypass_csp=True,  # 绕过内容安全策略
        )

        page = await context.new_page()
        try:
            target_url = build_target_url(app_id)
            app.logger.info(f"正在访问: {target_url}")

            # 优化页面加载，增加重试机制
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    await page.goto(
                        target_url,
                        timeout=45000,  # 增加超时时间
                        wait_until="domcontentloaded",  # 等待DOM加载完成
                    )

                    # 等待页面完全加载
                    await page.wait_for_load_state("networkidle", timeout=10000)
                    break
                except Exception as e:
                    if attempt == max_retries - 1:
                        raise
                    app.logger.warning(f"页面加载失败，第{attempt + 1}次重试: {e}")
                    await asyncio.sleep(2)  # 等待2秒后重试

            # 等待输入框出现并填入UK码
            await page.wait_for_selector(
                "#app > div.search > div:nth-child(2) > input[type=text]", timeout=15000
            )
            await page.fill(
                "#app > div.search > div:nth-child(2) > input[type=text]", uk_code
            )

            # 优化日期设置，增加兼容性检查
            date_set_success = await page.evaluate(
                f"""() => {{
                const start = "{start_date}";
                const end = "{end_date}";
                
                // 多种方式尝试设置日期，提高兼容性
                try {{
                    if (window.vm && window.vm.$data) {{
                        window.vm.$data.showType = 1;
                        const [startYear, startMonth, startDay] = start.split('-');
                        window.vm.$data.submitTime(new Date(startYear, startMonth-1, startDay));
                        
                        window.vm.$data.showType = 2;
                        const [endYear, endMonth, endDay] = end.split('-');
                        window.vm.$data.submitTime(new Date(endYear, endMonth-1, endDay));
                        
                        return true;
                    }}
                    
                    // 备用方案：直接操作DOM元素
                    const startInput = document.querySelector(
                        'input[type="date"], input[placeholder*="开始"], input[placeholder*="起始"]'
                    );
                    const endInput = document.querySelector(
                        'input[type="date"], input[placeholder*="结束"], input[placeholder*="截止"]'
                    );
                    
                    if (startInput && endInput) {{
                        startInput.value = start;
                        endInput.value = end;
                        
                        // 触发change事件
                        startInput.dispatchEvent(
                            new Event('change', {{ bubbles: true }})
                        );
                        endInput.dispatchEvent(
                            new Event('change', {{ bubbles: true }})
                        );
                        
                        return true;
                    }}
                    
                    return false;
                }} catch (error) {{
                    console.error('日期设置失败:', error);
                    return false;
                }}
            }}"""
            )

            if not date_set_success:
                app.logger.warning("日期设置可能失败，尝试备用方案")
                # 可以在这里添加更多备用方案

            # 点击提交按钮
            await page.click("#app > div.search > div.submit")

            # 优化等待策略，增加多种等待条件
            try:
                await page.wait_for_selector(
                    "#app > div.list > div.tab_warp", timeout=30000
                )
            except PlaywrightTimeoutError:
                # 备用等待策略
                await page.wait_for_selector(
                    'table, .table, [class*="table"]', timeout=15000
                )

            # 等待一下确保数据加载完成
            await asyncio.sleep(2)

            # 尝试获取表格内容
            table_html = await page.inner_html("#app > div.list > div.tab_warp")

            app.logger.info(f"抓取到的表格HTML长度: {len(table_html)}")
            app.logger.info(f"表格HTML前500字符: {table_html[:500]}")

            headers, rows = html_table_to_data(table_html)

            app.logger.info(f"解析得到的表头: {headers}")
            app.logger.info(f"解析得到的数据行数: {len(rows)}")
            if rows:
                app.logger.info(f"第一行数据: {rows[0] if rows else 'None'}")

            # 如果第一次解析失败，尝试获取整个页面内容进行解析
            if not headers or not rows:
                app.logger.info("第一次解析失败，尝试获取完整页面内容")
                full_html = await page.content()
                soup = BeautifulSoup(full_html, "html.parser")

                # 查找所有可能的表格元素
                tables = soup.find_all("table")
                app.logger.info(f"找到 {len(tables)} 个table标签")

                # 查找所有可能包含数据的div
                data_divs = soup.find_all(
                    "div",
                    class_=lambda x: x
                    and (
                        "list" in x.lower()
                        or "table" in x.lower()
                        or "data" in x.lower()
                    ),
                )
                app.logger.info(f"找到 {len(data_divs)} 个可能的数据容器div")

                if tables:
                    table = tables[0]
                    headers = []
                    header_row = table.find("thead")
                    if header_row:
                        headers = [
                            header.get_text().strip()
                            for header in header_row.find_all("th")
                        ]

                    rows = []
                    body = table.find("tbody")
                    if body:
                        for row in body.find_all("tr"):
                            cells = [
                                cell.get_text().strip() for cell in row.find_all("td")
                            ]
                            rows.append(cells)

                    app.logger.info(f"从完整页面解析得到表头: {headers}")
                    app.logger.info(f"从完整页面解析得到数据行数: {len(rows)}")

            # 标准化表头，确保与前端 DISPLAY_COLUMNS 一致
            standard_headers = [
                "日期",
                "移动拉新数",
                "移动转存数",
                "会员订单数",
                "会员订单金额",
                "会员佣金（元）",
            ]

            # 如果没有抓取到数据，使用默认数据
            if not headers or not rows:
                headers = standard_headers
                rows = [
                    [start_date, "0", "0", "0", "0.00", "0.00"],
                    [end_date, "0", "0", "0", "0.00", "0.00"],
                ]
            else:
                # 如果抓取到了数据但表头不一致，只标准化表头，保留实际数据
                if headers != standard_headers:
                    headers = standard_headers
                # 确保每行数据长度与表头一致
                rows = [
                    (
                        row[: len(standard_headers)]
                        if len(row) >= len(standard_headers)
                        else row + ["0"] * (len(standard_headers) - len(row))
                    )
                    for row in rows
                ]

            return {
                "headers": headers,
                "rows": rows,
                "html": table_html if "table_html" in locals() else "",
                "full_html": (full_html[:5000] if "full_html" in locals() else "")[
                    :5000
                ],
            }

        except PlaywrightTimeoutError:
            app.logger.error("Playwright操作超时")
            return {"error": "页面加载超时，请稍后重试或检查网络连接。"}
        except Exception as e:
            app.logger.error(f"抓取数据时发生未知错误: {e}", exc_info=True)
            return {"error": f"发生未知错误: {e}"}
        finally:
            try:
                await browser.close()
            except Exception as close_error:
                app.logger.warning(f"关闭浏览器时出错: {close_error}")


def check_date(date_str: str) -> bool:
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
        return True
    except ValueError:
        return False


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/health")
def health_check():
    """健康检查接口"""
    return jsonify({"status": "ok"}), 200


@app.route("/api/coefficients", methods=["GET"])
def get_coefficients():
    """获取收益计算系数接口"""
    return jsonify({"success": True, "data": app.config["PROFIT_COEFFICIENTS"]})


def get_or_create_event_loop():
    """获取或创建事件循环，优化线程本地存储"""
    if not hasattr(thread_local, "loop") or thread_local.loop.is_closed():
        thread_local.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(thread_local.loop)
    return thread_local.loop


def run_async_task(coroutine):
    """在线程池中运行异步任务 - 优化版本"""
    try:
        # 使用线程本地存储的事件循环
        loop = get_or_create_event_loop()

        # 设置任务超时和取消机制
        async def wrapped_coroutine():
            try:
                # 2分钟超时
                return await asyncio.wait_for(coroutine, timeout=120)
            except asyncio.TimeoutError:
                app.logger.error("异步任务执行超时")
                raise TimeoutError("任务执行超时")

        return loop.run_until_complete(wrapped_coroutine())
    except Exception as e:
        app.logger.error(f"异步任务执行失败: {e}", exc_info=True)
        raise
    finally:
        # 清理未完成的任务
        try:
            pending = asyncio.all_tasks(loop)
            for task in pending:
                if not task.done():
                    task.cancel()
        except Exception as cleanup_error:
            app.logger.warning(f"清理异步任务时出错: {cleanup_error}")


@app.route("/api/query", methods=["POST"])
def query():
    """优化的查询接口"""
    start_time = time.time()
    request_id = f"{int(start_time * 1000)}_{threading.current_thread().ident}"

    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "请求数据不能为空"}), 400

        app.logger.info(f"[{request_id}] 收到查询请求: {data}")

        # 参数提取和验证
        uk_code = data.get("uk_code", "").strip()
        start_date = data.get("start_date", "").strip()
        end_date = data.get("end_date", "").strip()
        headless = data.get("headless", True)
        app_id = data.get("app_id", "").strip()

        # 输入验证优化
        validation_errors = []

        if not uk_code:
            validation_errors.append("请输入UK码")
        elif len(uk_code) > 50:  # 添加长度限制
            validation_errors.append("UK码长度不能超过50个字符")

        if not start_date:
            validation_errors.append("请输入开始日期")
        elif not check_date(start_date):
            validation_errors.append("开始日期格式错误，请使用YYYY-MM-DD格式")

        if not end_date:
            validation_errors.append("请输入结束日期")
        elif not check_date(end_date):
            validation_errors.append("结束日期格式错误，请使用YYYY-MM-DD格式")

        # 日期范围验证
        if start_date and end_date and check_date(start_date) and check_date(end_date):
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            end_dt = datetime.strptime(end_date, "%Y-%m-%d")
            today = datetime.now().date()

            if start_dt.date() > today or end_dt.date() > today:
                validation_errors.append("日期不能超过今天")
            elif start_dt > end_dt:
                validation_errors.append("开始日期不能晚于结束日期")
            elif (end_dt - start_dt).days > 365:  # 限制查询范围
                validation_errors.append("查询时间范围不能超过365天")

        if validation_errors:
            return jsonify({"error": "; ".join(validation_errors)}), 400

        # app_id处理
        if not app_id:
            app_id = None
            app.logger.info(f"[{request_id}] 使用默认app_id")
        else:
            app.logger.info(f"[{request_id}] 使用自定义app_id: {app_id}")

        app.logger.info(
            f"[{request_id}] 开始查询: UK码={uk_code}, "
            f"开始日期={start_date}, 结束日期={end_date}, headless={headless}"
        )

        # 优化的异步任务执行
        try:
            # 创建带超时的任务
            future = executor.submit(
                run_async_task,
                scrape_data(uk_code, start_date, end_date, headless, app_id),
            )

            # 动态超时设置
            timeout_seconds = 90  # 增加到90秒
            result = future.result(timeout=timeout_seconds)

            execution_time = time.time() - start_time
            app.logger.info(f"[{request_id}] 查询执行时间: {execution_time:.2f}秒")

            # 结果验证和处理
            if not isinstance(result, dict):
                app.logger.error(f"[{request_id}] 查询结果类型错误: {type(result)}")
                return jsonify({"error": "查询结果格式不正确"}), 500

            if "error" in result:
                app.logger.warning(f"[{request_id}] 查询返回错误: {result['error']}")
                return jsonify({"error": result["error"]}), 500

            # 确保结果包含必要的字段
            required_fields = ["headers", "rows"]
            missing_fields = [field for field in required_fields if field not in result]

            if missing_fields:
                app.logger.error(f"[{request_id}] 结果缺少必要字段: {missing_fields}")
                return (
                    jsonify(
                        {
                            "error": "查询结果格式不正确",
                            "debug_info": {
                                "missing_fields": missing_fields,
                                "available_fields": list(result.keys()),
                            },
                        }
                    ),
                    500,
                )

            # 数据完整性检查
            headers = result.get("headers", [])
            rows = result.get("rows", [])

            if not headers and not rows:
                app.logger.info(f"[{request_id}] 查询结果为空")
                return jsonify(
                    {
                        "headers": [],
                        "rows": [],
                        "html": result.get("html", ""),
                        "message": "查询结果为空，请检查查询条件",
                        "execution_time": execution_time,
                    }
                )

            app.logger.info(f"[{request_id}] 查询成功: 找到{len(rows)}行数据")

            # 添加执行时间到响应
            result["execution_time"] = execution_time
            result["request_id"] = request_id

            return jsonify(result)

        except TimeoutError:
            app.logger.error(f"[{request_id}] 查询超时({timeout_seconds}秒)")
            return (
                jsonify(
                    {
                        "error": (
                            f"查询超时({timeout_seconds}秒)，"
                            "请稍后重试或缩小查询范围"
                        ),
                        "request_id": request_id,
                    }
                ),
                504,
            )
        except Exception as e:
            app.logger.error(
                f"[{request_id}] 执行查询时发生异常: {str(e)}", exc_info=True
            )
            return (
                jsonify(
                    {"error": f"查询过程中发生错误: {str(e)}", "request_id": request_id}
                ),
                500,
            )

    except Exception as e:
        app.logger.error(f"[{request_id}] 处理请求时发生异常: {str(e)}", exc_info=True)
        return (
            jsonify(
                {"error": f"处理请求时发生错误: {str(e)}", "request_id": request_id}
            ),
            500,
        )


if __name__ == "__main__":
    try:
        app.run(debug=True, host="127.0.0.1", port=5001, threaded=True)
    except KeyboardInterrupt:
        print("\n应用被用户中断")
    except Exception as e:
        app.logger.error(f"应用启动失败: {e}", exc_info=True)
        print(f"应用启动失败: {e}")
    finally:
        cleanup()