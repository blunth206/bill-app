// pwabuilder-auto.js - 自动化 PWABuilder 生成 APK
const { chromium } = require('playwright');

const PWA_URL = 'https://blunth206.github.io/bill-app/';
const OUTPUT_DIR = __dirname;

(async () => {
    console.log('启动浏览器...');
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();

    // 监听下载
    const downloadPromise = new Promise((resolve) => {
        page.on('download', async (download) => {
            const path = require('path').join(OUTPUT_DIR, '记账.apk');
            await download.saveAs(path);
            console.log(`✅ APK 已下载到: ${path}`);
            resolve(path);
        });
    });

    try {
        // 1. 打开 PWABuilder
        console.log('打开 PWABuilder...');
        await page.goto('https://www.pwabuilder.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(5000);
        console.log('页面已加载');

        // 2. 关闭 Discord 弹窗
        try {
            const closeBtn = page.locator('button[title="Close discord modal"], button:has-text("discord modal close")');
            if (await closeBtn.isVisible({ timeout: 3000 })) {
                await closeBtn.click();
                console.log('关闭了 Discord 弹窗');
            }
        } catch (e) {}

        // 3. 输入 PWA URL
        console.log('输入 PWA URL...');
        const urlInput = page.locator('input').filter({ hasAttribute: 'placeholder', hasText: 'Enter the URL to your PWA' }).or(page.locator('input[placeholder="Enter the URL to your PWA"]'));
        await urlInput.waitFor({ state: 'visible', timeout: 15000 });
        await urlInput.fill(PWA_URL);
        console.log('URL 已输入');
        await page.waitForTimeout(1000);

        // 4. 点击 Start
        console.log('点击 Start...');
        try {
            // 先尝试直接 Enter
            await urlInput.press('Enter');
            console.log('按 Enter 提交');
        } catch (e) {
            console.log('Enter 失败:', e.message);
            // 回退到点击坐标
            try {
                await page.locator('button').filter({ hasText: 'Start' }).click({ timeout: 10000 });
            } catch (e2) {
                await page.getByText('Start').first().click({ timeout: 10000 });
            }
        }

        // 5. 等待分析完成
        console.log('等待 PWA 分析...');
        const testDownloadBtn = page.locator('#test-download');
        let enabled = false;
        for (let i = 0; i < 120; i++) {
            await page.waitForTimeout(3000);
            try {
                enabled = await testDownloadBtn.isEnabled({ timeout: 3000 });
                if (enabled) {
                    console.log(`分析完成，耗时 ${i * 3} 秒`);
                    break;
                }
                if (i % 10 === 0) console.log(`  [${i * 3}s] 仍在分析...`);
            } catch (e) {
                if (i % 10 === 0) console.log(`  [${i * 3}s] 检查中...`);
            }
        }

        await page.waitForTimeout(2000);

        // 6. 点击 Package For Stores 或下载测试包
        console.log('尝试点击 Package For Stores...');
        try {
            const packageBtn = page.locator('button').filter({ hasText: 'Package For Stores' });
            if (await packageBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
                await packageBtn.click({ timeout: 5000 });
                console.log('点击了 Package For Stores');
            } else {
                throw new Error('Package For Stores not found');
            }
        } catch (e) {
            console.log('Package For Stores 未找到，尝试 Download Test Package...');
            try {
                await testDownloadBtn.click({ timeout: 5000 });
                console.log('点击了 Download Test Package');
            } catch (e2) {
                console.log('Download Test Package 也失败:', e2.message);
                throw e2;
            }
        }

        // 7. 等待新页面出现（选择平台）
        await page.waitForTimeout(3000);

        // 8. 生成 Android 包
        console.log('选择 Android 平台...');
        // 查找 Android 选项
        const androidOption = page.locator('text=Android').first();
        if (await androidOption.isVisible({ timeout: 5000 }).catch(() => false)) {
            await androidOption.click();
            await page.waitForTimeout(2000);
        }

        // 9. 点击生成/下载按钮
        console.log('点击生成...');
        const generateBtn = page.locator('button:has-text("Generate"), button:has-text("Download"), button:has-text("Package")').first();
        try {
            await generateBtn.click({ timeout: 5000 });
        } catch (e) {
            console.log('生成按钮未找到');
        }

        // 10. 等待下载
        console.log('等待 APK 下载...');
        await Promise.race([
            downloadPromise,
            new Promise(r => setTimeout(r, 180000)) // 最多等 3 分钟
        ]);

        console.log('完成！');
    } catch (err) {
        console.error('错误:', err.message);
        // 截图以便调试
        await page.screenshot({ path: require('path').join(OUTPUT_DIR, 'pwabuilder-debug.png') });
        console.log('已保存调试截图: pwabuilder-debug.png');
    } finally {
        await browser.close();
    }
})();
