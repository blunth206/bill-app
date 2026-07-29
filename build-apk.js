// build-apk.js - Bubblewrap APK 构建脚本（自动回答交互式问题）
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PROJECT_DIR = __dirname;
const ANDROID_DIR = path.resolve(PROJECT_DIR, 'android-twa');
const BUBBLEWRAP_BIN = path.resolve(process.env.USERPROFILE, 'nodejs-portable', 'node-v22.12.0-win-x64', 'node_modules', '@bubblewrap', 'cli', 'bin', 'bubblewrap.js');
const NODE_EXE = path.resolve(process.env.USERPROFILE, 'nodejs-portable', 'node-v22.12.0-win-x64', 'node.exe');
const JDK_DIR = path.resolve(process.env.USERPROFILE, '.bubblewrap', 'jdk');

// 设置 JAVA_HOME
process.env.JAVA_HOME = JDK_DIR;

console.log('========================================');
console.log('  记账 APK 构建脚本');
console.log('========================================');
console.log('JAVA_HOME:', JDK_DIR);
console.log('Project:', PROJECT_DIR);
console.log('Android Dir:', ANDROID_DIR);

function runBubblewrap(args, inputs = []) {
    return new Promise((resolve, reject) => {
        console.log(`\nRunning: bubblewrap ${args.join(' ')}`);
        
        const child = spawn(NODE_EXE, [BUBBLEWRAP_BIN, ...args], {
            cwd: ANDROID_DIR,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, JAVA_HOME: JDK_DIR }
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            const text = data.toString();
            stdout += text;
            process.stdout.write(text);
        });

        child.stderr.on('data', (data) => {
            const text = data.toString();
            stderr += text;
            process.stderr.write(text);
        });

        // 自动回答交互式问题
        let inputIndex = 0;
        child.stdout.on('data', (data) => {
            const text = data.toString();
            if (inputIndex < inputs.length && (text.includes('?') || text.includes('(Y/n)') || text.includes('(y/N)'))) {
                const answer = inputs[inputIndex];
                console.log(`\n[AUTO ANSWER]: ${answer}`);
                child.stdin.write(answer + '\n');
                inputIndex++;
            }
        });

        child.on('close', (code) => {
            console.log(`\nExit code: ${code}`);
            if (code === 0) resolve({ stdout, stderr });
            else reject(new Error(`Exit code: ${code}\nStderr: ${stderr.slice(-500)}`));
        });

        child.on('error', reject);
    });
}

async function main() {
    try {
        // Step 1: Init
        console.log('\n>>> Step 1: Initializing TWA project...');
        // 回答 n（不安装JDK，用我们自己的）
        await runBubblewrap([
            'init',
            '--manifest', path.join(ANDROID_DIR, 'twa-manifest.json'),
            '--directory', ANDROID_DIR
        ], ['n']);
        
        console.log('\n>>> Init complete! Files in android-twa:');
        const files = fs.readdirSync(ANDROID_DIR);
        console.log(files.join('\n'));

        // Step 2: Build
        console.log('\n>>> Step 2: Building APK...');
        await runBubblewrap(['build'], []);

        // 查找生成的 APK
        console.log('\n>>> Looking for generated APK...');
        function findApk(dir) {
            const items = fs.readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
                const fullPath = path.join(dir, item.name);
                if (item.isDirectory()) {
                    const found = findApk(fullPath);
                    if (found) return found;
                } else if (item.name.endsWith('.apk')) {
                    return fullPath;
                }
            }
            return null;
        }
        
        const apkPath = findApk(ANDROID_DIR);
        if (apkPath) {
            const destPath = path.join(PROJECT_DIR, '记账.apk');
            fs.copyFileSync(apkPath, destPath);
            console.log(`\n✅ APK built successfully!`);
            console.log(`   Location: ${destPath}`);
            console.log(`   Size: ${(fs.statSync(destPath).size / 1024 / 1024).toFixed(2)} MB`);
        } else {
            console.log('\n⚠ APK not found. Checking build output...');
        }
    } catch (err) {
        console.error('\n❌ Build failed:', err.message);
        process.exit(1);
    }
}

main();
