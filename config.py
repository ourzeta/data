"""Flask应用配置模块 - 优化版本

包含不同环境下的配置类，用于管理应用的各种设置参数。
默认参数禁止更改。
"""

import os


class Config:
    """基础配置类"""

    SECRET_KEY = os.environ.get("SECRET_KEY") or "a-hard-to-guess-string"
    BASE_URL = "https://csj.sgj.cn/main/sfsjcx"
    DEFAULT_AUTH_KEY = (
        os.environ.get("DEFAULT_AUTH_KEY")
        or "329bSNv6H7fSWPELIdKF9R85s5aRT0VHlrizy8BcOSo1nGrXmCRykQupgyHib3p9gM5OxB%2F2"
    )
    DEFAULT_APP_ID = os.environ.get("DEFAULT_APP_ID") or "649"

    # 收益计算系数配置
    PROFIT_COEFFICIENTS = {
        "new_user": 3.0,  # 拉新系数
        "deposit": 0.1    # 转存系数
    }

    @staticmethod
    def init_app(app):
        """初始化应用配置"""
        pass


class DevelopmentConfig(Config):
    """开发环境配置"""

    DEBUG = True


class ProductionConfig(Config):
    """生产环境配置"""

    DEBUG = False


class TestingConfig(Config):
    """测试环境配置"""

    TESTING = True
    DEBUG = True


config = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
    "default": DevelopmentConfig,
}