# 数据查询应用 - Node.js轻量级版本

## 项目简介

这是一个专为CentOS 7.6和低性能服务器优化的轻量级数据查询应用，完全保持原Flask版本的功能，使用Node.js重构以提供更好的性能和更简单的部署体验。

## 特性

✅ **功能1:1还原** - 完全保持原Flask版本的所有功能  
✅ **轻量级设计** - 针对低性能服务器优化  
✅ **一键安装** - 傻瓜式安装脚本，适合小白用户  
✅ **国内源优化** - 所有依赖使用国内镜像源  
✅ **CentOS 7.6兼容** - 专门适配CentOS 7.6系统  
✅ **浏览器复用** - 智能浏览器实例管理，节省资源  
✅ **系统服务** - 支持systemd服务管理  

## 系统要求

- **操作系统**: CentOS 7.6+ / RHEL 7+ / Ubuntu 16.04+
- **内存**: 最低512MB，推荐1GB+
- **磁盘**: 最低1GB可用空间
- **网络**: 需要访问外网下载依赖

## 快速安装

### 方法一：一键安装（推荐）

```bash
# 下载并运行安装脚本
curl -fsSL https://raw.githubusercontent.com/your-repo/install.sh | bash

# 或者下载后执行
wget https://raw.githubusercontent.com/your-repo/install.sh
chmod +x install.sh
./install.sh
```

### 方法二：手动安装

```bash
# 1. 克隆项目
git clone https://github.com/your-repo/data-query-app.git
cd data-query-app

# 2. 运行安装脚本
chmod +x install.sh
./install.sh

# 3. 启动应用
./start.sh
```

## 使用方法

### 启动应用

```bash
# 方式1: 使用启动脚本（推荐）
./start.sh

# 方式2: 直接运行
node server.js

# 方式3: 系统服务方式
sudo systemctl start data-query
sudo systemctl enable data-query  # 开机自启
```

### 访问应用

- **本地访问**: http://localhost:5001
- **局域网访问**: http://你的服务器IP:5001

### 测试数据

- **测试UK码**: 663832639
- **日期范围**: 选择任意有效日期范围

## 配置说明

### 环境变量配置

应用支持通过`.env`文件或环境变量进行配置：

```bash
# 服务配置
PORT=5001                    # 服务端口
HOST=0.0.0.0                # 监听地址

# 性能配置
NODE_ENV=production          # 运行环境
NODE_OPTIONS=--max-old-space-size=512  # 内存限制

# Playwright配置
PLAYWRIGHT_BROWSERS_PATH=./browsers    # 浏览器路径
```

### 默认参数（禁止修改）

以下参数为系统核心配置，**禁止修改**：

```javascript
const CONFIG = {
    BASE_URL: "https://csj.sgj.cn/main/sfsjcx",
    DEFAULT_AUTH_KEY: "329bSNv6H7fSWPELIdKF9R85s5aRT0VHlrizy8BcOSo1nGrXmCRykQupgyHib3p9gM5OxB%2F2",
    DEFAULT_APP_ID: "649",
    PROFIT_COEFFICIENTS: {
        new_user: 3.0,  // 拉新系数
        deposit: 0.1    // 转存系数
    }
};
```

## 服务管理

### systemd服务命令

```bash
# 启动服务
sudo systemctl start data-query

# 停止服务
sudo systemctl stop data-query

# 重启服务
sudo systemctl restart data-query

# 查看状态
sudo systemctl status data-query

# 开机自启
sudo systemctl enable data-query

# 取消自启
sudo systemctl disable data-query

# 查看日志
sudo journalctl -u data-query -f
```

### 日志管理

```bash
# 查看实时日志
sudo journalctl -u data-query -f

# 查看最近日志
sudo journalctl -u data-query -n 100

# 查看错误日志
sudo journalctl -u data-query -p err
```

## API接口

### 健康检查

```bash
GET /api/health
```

响应示例：
```json
{
    "status": "ok",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "memory": {...},
    "uptime": 3600
}
```

### 获取系数配置

```bash
GET /api/coefficients
```

响应示例：
```json
{
    "success": true,
    "data": {
        "new_user": 3.0,
        "deposit": 0.1
    }
}
```

### 数据查询

```bash
POST /api/query
Content-Type: application/json

{
    "uk_code": "663832639",
    "start_date": "2024-01-01",
    "end_date": "2024-01-31",
    "headless": true,
    "app_id": "649"
}
```

响应示例：
```json
{
    "headers": ["日期", "移动拉新数", "移动转存数", "会员订单数", "会员佣金（元）"],
    "rows": [
        ["2024-01-01", "10", "5", "3", "15.00"],
        ["2024-01-02", "8", "4", "2", "10.00"]
    ],
    "execution_time": 5.23,
    "request_id": "1672531200000_abc123"
}
```

## 性能优化

### 针对低性能服务器的优化

1. **内存限制**: 限制Node.js最大内存使用为512MB
2. **浏览器复用**: 智能复用浏览器实例，减少资源消耗
3. **压缩优化**: 启用gzip压缩，减少网络传输
4. **禁用功能**: 禁用不必要的浏览器功能（图片、插件等）
5. **连接池**: 优化数据库连接池配置

### 监控和调优

```bash
# 查看内存使用
free -h

# 查看进程资源使用
top -p $(pgrep -f "node server.js")

# 查看端口占用
netstat -tlnp | grep 5001

# 查看应用日志
tail -f /var/log/syslog | grep data-query
```

## 故障排除

### 常见问题

1. **端口被占用**
   ```bash
   # 查看端口占用
   lsof -i :5001
   
   # 修改端口配置
   echo "PORT=5002" >> .env
   ```

2. **权限问题**
   ```bash
   # 修复文件权限
   chmod +x start.sh
   chown -R $USER:$USER .
   ```

3. **浏览器驱动问题**
   ```bash
   # 重新安装浏览器
   npx playwright install chromium
   
   # 检查浏览器路径
   ls -la browsers/
   ```

4. **内存不足**
   ```bash
   # 检查内存使用
   free -h
   
   # 调整内存限制
   export NODE_OPTIONS="--max-old-space-size=256"
   ```

5. **网络问题**
   ```bash
   # 测试网络连接
   curl -I https://csj.sgj.cn/main/sfsjcx
   
   # 检查DNS解析
   nslookup csj.sgj.cn
   ```

### 日志分析

```bash
# 查看错误日志
grep -i error /var/log/syslog | grep data-query

# 查看性能日志
grep -i "execution_time" /var/log/syslog | grep data-query

# 查看内存使用日志
grep -i "memory" /var/log/syslog | grep data-query
```

## 安全建议

1. **防火墙配置**
   ```bash
   # CentOS 7
   firewall-cmd --permanent --add-port=5001/tcp
   firewall-cmd --reload
   
   # Ubuntu
   ufw allow 5001/tcp
   ```

2. **反向代理**（可选）
   ```nginx
   # Nginx配置示例
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://localhost:5001;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```

3. **SSL证书**（生产环境推荐）
   ```bash
   # 使用Let's Encrypt
   certbot --nginx -d your-domain.com
   ```

## 更新升级

```bash
# 停止服务
sudo systemctl stop data-query

# 备份数据
cp -r . ../data-query-backup

# 更新代码
git pull origin main

# 安装新依赖
npm install --production

# 重新安装浏览器（如需要）
npx playwright install chromium

# 启动服务
sudo systemctl start data-query
```

## 卸载

```bash
# 停止并禁用服务
sudo systemctl stop data-query
sudo systemctl disable data-query

# 删除服务文件
sudo rm /etc/systemd/system/data-query.service
sudo systemctl daemon-reload

# 删除应用文件
rm -rf /path/to/data-query-app

# 删除Node.js（可选）
sudo yum remove nodejs npm  # CentOS
sudo apt-get remove nodejs npm  # Ubuntu
```

## 技术支持

- **邮箱**: support@example.com
- **电话**: 400-123-4567
- **在线客服**: 工作时间 9:00-18:00

## 许可证

MIT License

## 更新日志

### v1.0.0 (2024-01-01)
- 初始版本发布
- 完整功能实现
- CentOS 7.6优化
- 一键安装脚本

---

**注意**: 本应用专为CentOS 7.6和低性能服务器优化，在其他环境中使用可能需要调整配置。