#!/bin/bash

# 数据查询应用一键安装脚本 - 针对CentOS 7.6优化
# 适用于小白用户和低性能服务器

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[信息]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[成功]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[警告]${NC} $1"
}

log_error() {
    echo -e "${RED}[错误]${NC} $1"
}

# 检查是否为root用户
check_root() {
    if [[ $EUID -eq 0 ]]; then
        log_warning "检测到root用户，建议使用普通用户运行"
        read -p "是否继续？(y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# 检测系统信息
detect_system() {
    log_info "检测系统信息..."
    
    if [[ -f /etc/redhat-release ]]; then
        OS="centos"
        VERSION=$(cat /etc/redhat-release | grep -oE '[0-9]+\.[0-9]+' | head -1)
        log_info "检测到 CentOS/RHEL $VERSION"
    elif [[ -f /etc/debian_version ]]; then
        OS="debian"
        VERSION=$(cat /etc/debian_version)
        log_info "检测到 Debian/Ubuntu $VERSION"
    else
        log_error "不支持的操作系统"
        exit 1
    fi
    
    # 检查架构
    ARCH=$(uname -m)
    log_info "系统架构: $ARCH"
    
    # 检查内存
    MEMORY=$(free -m | awk 'NR==2{printf "%.0f", $2/1024}')
    log_info "系统内存: ${MEMORY}GB"
    
    if [[ $MEMORY -lt 1 ]]; then
        log_warning "内存不足1GB，可能影响性能"
    fi
}

# 安装系统依赖
install_system_deps() {
    log_info "安装系统依赖..."
    
    if [[ "$OS" == "centos" ]]; then
        # CentOS/RHEL 依赖安装
        if ! command -v yum &> /dev/null; then
            log_error "yum 包管理器未找到"
            exit 1
        fi
        
        # 更新yum源为国内镜像
        log_info "配置国内yum源..."
        if [[ "$VERSION" == "7"* ]]; then
            # CentOS 7
            sudo yum install -y wget curl
            sudo wget -O /etc/yum.repos.d/CentOS-Base.repo http://mirrors.aliyun.com/repo/Centos-7.repo
            sudo yum clean all
            sudo yum makecache
        fi
        
        # 安装基础依赖
        sudo yum update -y
        sudo yum groupinstall -y "Development Tools"
        sudo yum install -y \
            wget curl git unzip \
            gcc gcc-c++ make \
            fontconfig libXcomposite libXcursor libXdamage libXext libXi libXtst \
            cups-libs libXScrnSaver libXrandr GConf2 alsa-lib atk gtk3 \
            ipa-gothic-fonts xorg-x11-fonts-100dpi xorg-x11-fonts-75dpi \
            xorg-x11-utils xorg-x11-fonts-cyrillic xorg-x11-fonts-Type1 xorg-x11-fonts-misc
            
    elif [[ "$OS" == "debian" ]]; then
        # Debian/Ubuntu 依赖安装
        sudo apt-get update
        sudo apt-get install -y \
            wget curl git unzip build-essential \
            libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
            libatspi2.0-0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
            libgbm1 libasound2 libxss1 libgtk-3-0
    fi
    
    log_success "系统依赖安装完成"
}

# 安装Node.js
install_nodejs() {
    log_info "检查Node.js安装状态..."
    
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        log_info "检测到Node.js版本: $NODE_VERSION"
        
        # 检查版本是否满足要求 (>=14.0.0)
        NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
        if [[ $NODE_MAJOR -ge 14 ]]; then
            log_success "Node.js版本满足要求"
            return 0
        else
            log_warning "Node.js版本过低，需要升级"
        fi
    fi
    
    log_info "安装Node.js..."
    
    # 使用NodeSource官方脚本安装Node.js 18 LTS
    curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
    
    if [[ "$OS" == "centos" ]]; then
        sudo yum install -y nodejs
    elif [[ "$OS" == "debian" ]]; then
        sudo apt-get install -y nodejs
    fi
    
    # 验证安装
    if command -v node &> /dev/null && command -v npm &> /dev/null; then
        NODE_VERSION=$(node --version)
        NPM_VERSION=$(npm --version)
        log_success "Node.js安装成功: $NODE_VERSION"
        log_success "npm版本: $NPM_VERSION"
    else
        log_error "Node.js安装失败"
        exit 1
    fi
    
    # 配置npm国内镜像源
    log_info "配置npm国内镜像源..."
    npm config set registry https://registry.npmmirror.com
    npm config set disturl https://npmmirror.com/dist
    npm config set electron_mirror https://npmmirror.com/mirrors/electron/
    npm config set sass_binary_site https://npmmirror.com/mirrors/node-sass/
    npm config set phantomjs_cdnurl https://npmmirror.com/mirrors/phantomjs/
    npm config set chromedriver_cdnurl https://npmmirror.com/mirrors/chromedriver
    npm config set operadriver_cdnurl https://npmmirror.com/mirrors/operadriver
    npm config set fse_binary_host_mirror https://npmmirror.com/mirrors/fsevents
    
    log_success "npm镜像源配置完成"
}

# 安装应用依赖
install_app_deps() {
    log_info "安装应用依赖..."
    
    # 检查package.json是否存在
    if [[ ! -f "package.json" ]]; then
        log_error "package.json文件不存在"
        exit 1
    fi
    
    # 安装依赖
    npm install --production --registry=https://registry.npmmirror.com
    
    log_success "应用依赖安装完成"
}

# 安装Playwright浏览器
install_playwright_browser() {
    log_info "安装Playwright浏览器..."
    
    # 设置Playwright环境变量
    export PLAYWRIGHT_BROWSERS_PATH="$(pwd)/browsers"
    export PLAYWRIGHT_DOWNLOAD_HOST="https://npmmirror.com/mirrors/playwright"
    
    # 创建浏览器目录
    mkdir -p browsers
    
    # 安装Chromium浏览器
    npx playwright install chromium
    
    # 验证安装
    if [[ -d "browsers" ]] && [[ $(ls -la browsers/ | wc -l) -gt 2 ]]; then
        log_success "Playwright浏览器安装成功"
    else
        log_warning "Playwright浏览器安装可能失败，但程序仍可运行"
    fi
}

# 创建启动脚本
create_start_script() {
    log_info "创建启动脚本..."
    
    cat > start.sh << 'EOF'
#!/bin/bash

# 数据查询应用启动脚本

# 设置环境变量
export NODE_ENV=production
export PORT=5001
export HOST=0.0.0.0
export PLAYWRIGHT_BROWSERS_PATH="$(pwd)/browsers"

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo "错误: Node.js未安装"
    exit 1
fi

# 检查依赖
if [[ ! -d "node_modules" ]]; then
    echo "错误: 依赖未安装，请先运行 npm install"
    exit 1
fi

# 启动应用
echo "启动数据查询应用..."
echo "访问地址: http://localhost:5001"
echo "测试UK码: 663832639"
echo "按 Ctrl+C 停止服务"
echo ""

node server.js
EOF

    chmod +x start.sh
    log_success "启动脚本创建完成"
}

# 创建系统服务
create_systemd_service() {
    log_info "创建系统服务..."
    
    # 获取当前用户和工作目录
    CURRENT_USER=$(whoami)
    WORK_DIR=$(pwd)
    
    sudo tee /etc/systemd/system/data-query.service > /dev/null << EOF
[Unit]
Description=Data Query Application
After=network.target

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$WORK_DIR
Environment=NODE_ENV=production
Environment=PORT=5001
Environment=HOST=0.0.0.0
Environment=PLAYWRIGHT_BROWSERS_PATH=$WORK_DIR/browsers
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=data-query

[Install]
WantedBy=multi-user.target
EOF

    # 重新加载systemd配置
    sudo systemctl daemon-reload
    
    log_success "系统服务创建完成"
    log_info "使用以下命令管理服务:"
    log_info "  启动服务: sudo systemctl start data-query"
    log_info "  停止服务: sudo systemctl stop data-query"
    log_info "  开机自启: sudo systemctl enable data-query"
    log_info "  查看状态: sudo systemctl status data-query"
    log_info "  查看日志: sudo journalctl -u data-query -f"
}

# 性能优化
optimize_performance() {
    log_info "应用性能优化..."
    
    # 创建性能优化配置
    cat > .env << EOF
# 性能优化配置
NODE_ENV=production
NODE_OPTIONS=--max-old-space-size=512
UV_THREADPOOL_SIZE=4

# 应用配置
PORT=5001
HOST=0.0.0.0

# Playwright配置
PLAYWRIGHT_BROWSERS_PATH=./browsers
PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright
EOF

    log_success "性能优化配置完成"
}

# 防火墙配置
configure_firewall() {
    log_info "配置防火墙..."
    
    if command -v firewall-cmd &> /dev/null; then
        # CentOS 7 firewalld
        sudo firewall-cmd --permanent --add-port=5001/tcp
        sudo firewall-cmd --reload
        log_success "防火墙配置完成 (firewalld)"
    elif command -v ufw &> /dev/null; then
        # Ubuntu ufw
        sudo ufw allow 5001/tcp
        log_success "防火墙配置完成 (ufw)"
    elif command -v iptables &> /dev/null; then
        # 传统iptables
        sudo iptables -A INPUT -p tcp --dport 5001 -j ACCEPT
        sudo service iptables save 2>/dev/null || true
        log_success "防火墙配置完成 (iptables)"
    else
        log_warning "未检测到防火墙，请手动开放5001端口"
    fi
}

# 运行测试
run_test() {
    log_info "运行应用测试..."
    
    # 启动应用进行测试
    timeout 10s node server.js &
    SERVER_PID=$!
    
    sleep 5
    
    # 测试健康检查接口
    if curl -s http://localhost:5001/api/health > /dev/null; then
        log_success "应用测试通过"
    else
        log_warning "应用测试失败，但安装已完成"
    fi
    
    # 停止测试服务器
    kill $SERVER_PID 2>/dev/null || true
}

# 显示安装完成信息
show_completion_info() {
    log_success "安装完成！"
    echo ""
    echo "=========================================="
    echo "  数据查询应用安装成功"
    echo "=========================================="
    echo ""
    echo "📍 应用信息:"
    echo "   - 端口: 5001"
    echo "   - 测试UK码: 663832639"
    echo "   - 工作目录: $(pwd)"
    echo ""
    echo "🚀 启动方式:"
    echo "   方式1: ./start.sh"
    echo "   方式2: node server.js"
    echo "   方式3: sudo systemctl start data-query"
    echo ""
    echo "🌐 访问地址:"
    echo "   - 本地: http://localhost:5001"
    echo "   - 局域网: http://$(hostname -I | awk '{print $1}'):5001"
    echo ""
    echo "📋 管理命令:"
    echo "   - 查看状态: sudo systemctl status data-query"
    echo "   - 查看日志: sudo journalctl -u data-query -f"
    echo "   - 停止服务: sudo systemctl stop data-query"
    echo ""
    echo "⚠️  注意事项:"
    echo "   - 确保防火墙已开放5001端口"
    echo "   - 首次运行可能需要下载浏览器驱动"
    echo "   - 建议在低峰期进行大量查询操作"
    echo ""
    echo "🔧 故障排除:"
    echo "   - 如遇权限问题，请检查文件权限"
    echo "   - 如遇端口占用，请修改.env中的PORT配置"
    echo "   - 如遇浏览器问题，请重新运行: npx playwright install chromium"
    echo ""
    echo "=========================================="
}

# 主安装流程
main() {
    echo ""
    echo "=========================================="
    echo "  数据查询应用一键安装脚本"
    echo "  适用于 CentOS 7.6 / 低性能服务器"
    echo "=========================================="
    echo ""
    
    # 检查权限
    check_root
    
    # 检测系统
    detect_system
    
    # 安装系统依赖
    install_system_deps
    
    # 安装Node.js
    install_nodejs
    
    # 安装应用依赖
    install_app_deps
    
    # 安装Playwright浏览器
    install_playwright_browser
    
    # 性能优化
    optimize_performance
    
    # 创建启动脚本
    create_start_script
    
    # 创建系统服务
    create_systemd_service
    
    # 配置防火墙
    configure_firewall
    
    # 运行测试
    run_test
    
    # 显示完成信息
    show_completion_info
}

# 错误处理
trap 'log_error "安装过程中发生错误，请检查日志"; exit 1' ERR

# 运行主程序
main "$@"