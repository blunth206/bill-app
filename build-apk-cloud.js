// build-apk-cloud.js - 通过 PWABuilder 云端 API 生成 APK
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PROJECT_DIR = __dirname;
const PWA_URL = 'https://mynotes-dp0d3o9jw5yd.edgeone.cool?eo_token=d1028775fbebe781eacad9e0788c0734&eo_time=1784333182';

function apiRequest(method, urlPath, body) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'pwabuilder.com',
            path: urlPath,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ status: res.statusCode, data: json });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(destPath);
        protocol.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                file.close();
                fs.unlinkSync(destPath);
                return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(destPath, () => {});
            reject(err);
        });
    });
}

async function main() {
    console.log('========================================');
    console.log('  记账 APK 云端构建');
    console.log('  使用 PWABuilder Cloud API');
    console.log('========================================');
    console.log('PWA URL:', PWA_URL);
    console.log('');

    // Step 1: 提交打包任务
    console.log('>>> Step 1: 提交 APK 生成任务...');
    const generateResult = await apiRequest('POST', '/api/packages/generate', {
        url: PWA_URL,
        platforms: ['android']
    });

    console.log('Response status:', generateResult.status);
    console.log('Response:', typeof generateResult.data === 'string' ? generateResult.data.substring(0, 500) : JSON.stringify(generateResult.data, null, 2));

    if (generateResult.status === 404) {
        console.log('\nAPI endpoint not found. Trying alternative endpoint...');
        // 尝试 PWABuilder 的旧版 API
        const altResult = await apiRequest('POST', '/api/package', {
            url: PWA_URL,
            platform: 'android'
        });
        console.log('Alt Response status:', altResult.status);
        console.log('Alt Response:', typeof altResult.data === 'string' ? altResult.data.substring(0, 500) : JSON.stringify(altResult.data, null, 2));
    }

    if (generateResult.status !== 200 && generateResult.status !== 201 && generateResult.status !== 202) {
        console.error('❌ Failed to submit generation task');
        console.log('\n尝试直接使用 PWABuilder 网页版:');
        console.log(`  1. 打开 https://www.pwabuilder.com/`);
        console.log(`  2. 输入 PWA URL: ${PWA_URL}`);
        console.log(`  3. 点击 Start → 选择 Android → 下载 APK`);
        return;
    }

    const taskId = generateResult.data.taskId || generateResult.data.id;
    if (!taskId) {
        // 也许直接返回了下载链接
        if (generateResult.data.downloadUrl || generateResult.data.url) {
            const downloadUrl = generateResult.data.downloadUrl || generateResult.data.url;
            console.log('\n>>> Download URL found, downloading APK...');
            const apkPath = path.join(PROJECT_DIR, '记账.apk');
            await downloadFile(downloadUrl, apkPath);
            console.log(`\n✅ APK downloaded to: ${apkPath}`);
            console.log(`   Size: ${(fs.statSync(apkPath).size / 1024 / 1024).toFixed(2)} MB`);
            return;
        }
        console.error('❌ No task ID or download URL in response');
        return;
    }

    // Step 2: 轮询任务状态
    console.log(`\n>>> Step 2: 等待构建完成 (Task ID: ${taskId})...`);
    let completed = false;
    let attempts = 0;
    const maxAttempts = 60; // 最多等 5 分钟

    while (!completed && attempts < maxAttempts) {
        attempts++;
        await new Promise(r => setTimeout(r, 5000)); // 等 5 秒

        const statusResult = await apiRequest('GET', `/api/packages/status/${taskId}`);
        console.log(`  [${attempts}] Status: ${statusResult.status}`, JSON.stringify(statusResult.data));

        if (statusResult.data.status === 'completed' || statusResult.data.status === 'done') {
            completed = true;
            const downloadUrl = statusResult.data.downloadUrl || statusResult.data.url || statusResult.data.apkUrl;
            if (downloadUrl) {
                console.log('\n>>> Step 3: 下载 APK...');
                const apkPath = path.join(PROJECT_DIR, '记账.apk');
                await downloadFile(downloadUrl, apkPath);
                console.log(`\n✅ APK 构建成功!`);
                console.log(`   位置: ${apkPath}`);
                console.log(`   大小: ${(fs.statSync(apkPath).size / 1024 / 1024).toFixed(2)} MB`);
            } else {
                console.log('⚠ Build completed but no download URL found');
            }
        } else if (statusResult.data.status === 'failed' || statusResult.data.status === 'error') {
            console.error('❌ Build failed:', statusResult.data.error || statusResult.data.message);
            break;
        }
    }

    if (!completed) {
        console.log('\n⚠ Timeout waiting for build. Try again later.');
    }
}

main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
});
