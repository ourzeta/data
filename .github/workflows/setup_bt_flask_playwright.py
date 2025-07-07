#!/usr/bin/env python3
# 宝塔服务器 Flask+Playwright 一键环境部署脚本（适合小白/新手）
import os
import sys
import subprocess
import platform
from pathlib import Path

def run(cmd, check=True, shell=False):
    print(f"\033[32m[执行]\033[0m {cmd}")
    result = subprocess.run(cmd, shell=shell, check=check)
    return result

def ensure_pip():
    try:
        import pip
        print("pip 已安装")
    except ImportError:
        print("未检测到 pip，正在安装...")
        run([sys.executable, "-m", "ensurepip", "--upgrade"])
        run([sys.executable, "-m", "pip", "install", "--upgrade", "pip"])

def set_mirror():
    # 自动设置国内镜像源
    print("设置国内 PyPI 镜像源...")
    pip_conf = Path.home() / ".pip/pip.conf"
    pip_conf.parent.mkdir(parents=True, exist_ok=True)
    pip_conf.write_text('[global]\nindex-url = https://pypi.tuna.tsinghua.edu.cn/simple\n')
    print(f"已写入 {pip_conf}")

def create_venv(venv_dir="venv"):
    venv_path = Path(venv_dir)
    if not venv_path.exists():
        print(f"创建虚拟环境: {venv_dir}")
        run([sys.executable, "-m", "venv", venv_dir])
    else:
        print(f"虚拟环境已存在: {venv_dir}")
    return venv_path

def get_python_bin(venv_dir="venv"):
    if platform.system() == "Windows":
        return str(Path(venv_dir) / "Scripts" / "python.exe")
    else:
        return str(Path(venv_dir) / "bin" / "python3")

def install_requirements(python_bin, req_file="requirements.txt"):
    print("安装 requirements.txt 依赖...")
    run([python_bin, "-m", "pip", "install", "--upgrade", "pip"])
    run([python_bin, "-m", "pip", "install", "-r", req_file])

def install_playwright_deps():
    print("安装 Playwright 系统依赖...")
    # 适配新版 Ubuntu 包名
    pkgs = [
        "libatk1.0-0t64", "libatk-bridge2.0-0t64", "libcups2t64", "libdrm2", "libxkbcommon0",
        "libatspi2.0-0t64", "libxcomposite1", "libxdamage1", "libxfixes3", "libxrandr2", "libgbm1"
    ]
    run(["apt-get", "update"])
    run(["apt-get", "install", "-y"] + pkgs)

def install_playwright_browser(python_bin):
    print("安装 Playwright 浏览器...")
    run([python_bin, "-m", "playwright", "install", "chromium"])

def upgrade_system():
    print("如遇系统过旧或依赖不支持，可尝试升级系统：")
    print("sudo apt-get update && sudo apt-get upgrade -y")
    print("如遇 Python 过旧，建议升级到 3.8+，可用宝塔面板一键安装新版 Python")

def main():
    print("\033[36m=== 宝塔 Flask+Playwright 一键部署脚本 ===\033[0m")
    ensure_pip()
    set_mirror()
    venv_dir = "venv"
    venv_path = create_venv(venv_dir)
    python_bin = get_python_bin(venv_dir)
    install_requirements(python_bin)
    install_playwright_deps()
    install_playwright_browser(python_bin)
    print("\033[32m[完成]\033[0m 环境部署完成！")
    print(f"\n激活虚拟环境并运行 Flask：\n  source {venv_path}/bin/activate\n  python app.py\n")
    print("如遇依赖或系统报错，请参考脚本注释和上方升级建议。")

if __name__ == "__main__":
    main()
