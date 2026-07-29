@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ====================================
echo      记账软件 - 本地服务器启动
echo      请勿关闭此窗口
echo ====================================
echo.
echo 正在启动...
echo.
echo 启动成功后，用浏览器访问：
echo http://localhost:3000
echo.
echo OCR 代理地址（在设置页面填写）：
echo http://localhost:3000/proxy
echo ====================================
echo.
node server.js
pause
