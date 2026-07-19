// ==================== 数据存储层 ====================
// 全局错误捕获
window.addEventListener('error', function(e) {
    var msg = e.message || (e.error && e.error.message) || '未知错误';
    console.error('全局错误:', msg, '文件:', e.filename, '行:', e.lineno);
    if (!document.body) return;
    var errDiv = document.getElementById('globalError');
    if (!errDiv) {
        errDiv = document.createElement('div');
        errDiv.id = 'globalError';
        errDiv.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);background:#ff4444;color:#fff;padding:10px 20px;border-radius:8px;z-index:99999;max-width:90%;word-break:break-all;font-size:14px;cursor:pointer;box-shadow:0 4px 12px rgba(255,0,0,0.3);';
        errDiv.onclick = function() { this.remove(); };
        document.body.appendChild(errDiv);
    }
    errDiv.textContent = '应用出错: ' + msg + ' (点击关闭, 请刷新页面)';
});
window.addEventListener('unhandledrejection', function(e) {
    console.error('未处理的Promise错误:', e.reason);
});
const STORAGE_KEY = 'billApp_data';
const APP_DATA = {
    accounts: [],       // 登录账号 [{id, name, password, role, createdAt}]
    billUsers: [],      // 账单户 [{id, name, color, createdAt}]
    bills: [],          // 账单 [{id, userId, date, type, amount, note, source, createdAt}]
    currentAccountId: null,
};

function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        accounts: APP_DATA.accounts,
        billUsers: APP_DATA.billUsers,
        bills: APP_DATA.bills,
    }));
}

function loadData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            APP_DATA.accounts = data.accounts || [];
            APP_DATA.billUsers = data.billUsers || [];
            APP_DATA.bills = data.bills || [];
        }
    } catch (e) {
        console.error('数据加载失败', e);
    }
    // 确保至少有默认管理员账号
    if (APP_DATA.accounts.length === 0) {
        APP_DATA.accounts.push({
            id: 'admin_' + Date.now(),
            name: '管理员',
            password: '123456',
            role: 'admin',
            createdAt: new Date().toISOString()
        });
        saveData();
    }
}

function generateId(prefix) {
    return (prefix || 'id') + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

// ==================== 工具函数 ====================
function showToast(msg, type) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = 'toast ' + (type || '') + ' show';
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(function() { toast.className = 'toast'; }, 2500);
}

function openModal(id) {
    document.getElementById(id).classList.add('active');
}
function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function formatMoney(val) {
    return Number(val).toFixed(2);
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
}

// ==================== 登录系统 ====================
function initLogin() {
    var sel = document.getElementById('loginAccountSelect');
    sel.innerHTML = '<option value="">-- 选择账号 --</option>';
    APP_DATA.accounts.forEach(function(acc) {
        var opt = document.createElement('option');
        opt.value = acc.id;
        opt.textContent = acc.name + (acc.role === 'admin' ? ' (管理员)' : '');
        sel.appendChild(opt);
    });
    // 恢复上次登录账号和记住的密码
    var lastId = localStorage.getItem('billApp_lastAccount');
    var savedCred = localStorage.getItem('billApp_savedCred');
    var autoFillPassword = '';
    var rememberChecked = false;
    if (savedCred) {
        try {
            var cred = JSON.parse(savedCred);
            if (cred.id && cred.pw) {
                lastId = cred.id;
                autoFillPassword = atob(cred.pw);
                rememberChecked = true;
            }
        } catch(e) {}
    }
    if (lastId) {
        var exists = APP_DATA.accounts.find(function(a) { return a.id === lastId; });
        if (exists) {
            sel.value = lastId;
            document.getElementById('loginPassword').value = autoFillPassword;
            document.getElementById('loginRemember').checked = rememberChecked;
            // 如果密码已记住且账号密码匹配，自动登录
            if (autoFillPassword && exists.password === autoFillPassword) {
                setTimeout(function() { doLogin(true); }, 300);
                return;
            }
            document.getElementById('loginPassword').focus();
        }
    }
}

function doLogin(auto) {
    var accountId = document.getElementById('loginAccountSelect').value;
    var password = document.getElementById('loginPassword').value;
    var remember = document.getElementById('loginRemember').checked;
    var errEl = document.getElementById('loginError');

    if (!accountId) {
        errEl.textContent = '请选择账号';
        errEl.style.display = 'block';
        return;
    }
    if (!password) {
        errEl.textContent = '请输入密码';
        errEl.style.display = 'block';
        return;
    }

    var account = APP_DATA.accounts.find(function(a) { return a.id === accountId; });
    if (!account) {
        errEl.textContent = '账号不存在';
        errEl.style.display = 'block';
        return;
    }
    if (account.password !== password) {
        errEl.textContent = '密码错误';
        errEl.style.display = 'block';
        return;
    }

    APP_DATA.currentAccountId = accountId;
    // 记住密码：保存账号ID和密码（Base64编码）
    if (remember) {
        localStorage.setItem('billApp_savedCred', JSON.stringify({
            id: accountId,
            pw: btoa(password)
        }));
        localStorage.setItem('billApp_lastAccount', accountId);
    } else {
        localStorage.removeItem('billApp_savedCred');
        localStorage.setItem('billApp_lastAccount', accountId);
    }
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('appMain').style.display = 'block';
    errEl.style.display = 'none';
    if (!auto) {
        showToast('欢迎回来，' + account.name + '！', 'success');
    }
    switchView('home');
}

function doLogout() {
    APP_DATA.currentAccountId = null;
    document.getElementById('loginOverlay').style.display = 'flex';
    document.getElementById('appMain').style.display = 'none';
    document.getElementById('loginPassword').value = '';
    // 不清除记住的密码，退出后重新显示登录界面
    initLogin();
    showToast('已退出登录');
}

function showForgotPassword() {
    var listEl = document.getElementById('forgotAccountList');
    var html = '<ul style="list-style:none;padding:0;">';
    APP_DATA.accounts.forEach(function(acc) {
        html += '<li style="padding:6px 0;border-bottom:1px solid #eee;">' +
            '<strong>' + acc.name + '</strong>' +
            (acc.role === 'admin' ? ' <span style="color:#E65100;">(管理员)</span>' : '') +
            '</li>';
    });
    html += '</ul>';
    listEl.innerHTML = html;
    openModal('forgotPasswordModal');
}

// ==================== 视图切换 ====================
function switchView(view) {
    document.querySelectorAll('.view').forEach(function(v) { v.classList.remove('active'); });
    var target = document.getElementById('view-' + view);
    if (target) target.classList.add('active');

    if (view === 'home') {
        renderHomeView();
    } else if (view === 'settings') {
        renderSettingsView();
    }
}

// ==================== 主页视图 ====================
// 当前时间筛选模式：'month' | 'year' | 'day' | 'custom'
var _currentTimeMode = 'month';
// 分页状态
var _currentPage = 1;
var _pageSize = 20;
var _totalFiltered = 0;

// 筛选条件变更时重置页码
function onFilterChange() {
    _currentPage = 1;
    renderHomeView();
}

function setTimeMode(mode) {
    _currentTimeMode = mode;
    // 更新按钮激活状态
    document.querySelectorAll('.time-mode-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
    });
    // 显示/隐藏对应输入组
    document.getElementById('timeModeMonth').style.display = (mode === 'month' ? '' : 'none');
    document.getElementById('timeModeYear').style.display = (mode === 'year' ? '' : 'none');
    document.getElementById('timeModeDay').style.display = (mode === 'day' ? '' : 'none');
    document.getElementById('timeModeCustom').style.display = (mode === 'custom' ? '' : 'none');
    _currentPage = 1;
    renderHomeView();
}

function getFilterDateRange() {
    if (_currentTimeMode === 'month') {
        var y = document.getElementById('homeMonthYear').value;
        var m = document.getElementById('homeMonthMonth').value;
        if (y && m) {
            var lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
            return { from: y + '-' + m.padStart(2, '0') + '-01', to: y + '-' + m.padStart(2, '0') + '-' + lastDay };
        }
    } else if (_currentTimeMode === 'year') {
        var y = document.getElementById('homeYear').value;
        if (y) {
            return { from: y + '-01-01', to: y + '-12-31' };
        }
    } else if (_currentTimeMode === 'day') {
        var d = document.getElementById('homeDay').value;
        if (d) {
            return { from: d, to: d };
        }
    } else {
        return { from: document.getElementById('homeDateFrom').value, to: document.getElementById('homeDateTo').value };
    }
    return { from: '', to: '' };
}

function renderHomeView() {
    initColumnResize();
    var filterUser = document.getElementById('homeUserFilter').value;

    // 更新筛选下拉
    var userFilter = document.getElementById('homeUserFilter');
    if (userFilter.options.length <= 1) {
        userFilter.innerHTML = '<option value="all">全部账单户</option>';
        APP_DATA.billUsers.forEach(function(u) {
            var opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = u.name;
            userFilter.appendChild(opt);
        });
    }

    // 填充年月下拉框
    populateTimeSelects();

    // 获取当前时间筛选范围
    var range = getFilterDateRange();
    var dateFrom = range.from;
    var dateTo = range.to;

    // 筛选账单
    var filtered = APP_DATA.bills.filter(function(b) {
        if (filterUser !== 'all' && b.userId !== filterUser) return false;
        if (dateFrom && b.date < dateFrom) return false;
        if (dateTo && b.date > dateTo) return false;
        return true;
    });

    // 排序：按日期降序
    filtered.sort(function(a, b) { return b.date.localeCompare(a.date) || b.createdAt - a.createdAt; });

    // 分页切片
    _totalFiltered = filtered.length;
    var totalPages = Math.ceil(_totalFiltered / _pageSize) || 1;
    if (_currentPage > totalPages) _currentPage = totalPages;
    var start = (_currentPage - 1) * _pageSize;
    var pageBills = filtered.slice(start, start + _pageSize);

    // 计算当年数据（受账单户影响，不受时间模式影响）
    var currentYear = new Date().getFullYear().toString();
    var yearIncome = 0, yearExpense = 0, yearBalance = 0;
    APP_DATA.bills.forEach(function(b) {
        if (b.date >= currentYear + '-01-01' && b.date <= currentYear + '-12-31') {
            if (filterUser !== 'all' && b.userId !== filterUser) return;
            if (b.type === '收入') yearIncome += b.amount;
            else if (b.type === '结余') yearBalance += b.amount;
            else yearExpense += b.amount;
        }
    });
    var yearTotalBalance = yearBalance + yearIncome - yearExpense;

    // 计算当前视图筛选汇总（受账单户+时间模式双重影响）
    var totalIncome = 0, totalExpense = 0, totalBalance = 0;
    filtered.forEach(function(b) {
        if (b.type === '收入') totalIncome += b.amount;
        else if (b.type === '结余') totalBalance += b.amount;
        else totalExpense += b.amount;
    });
    var balance = totalBalance + totalIncome - totalExpense;

    // 判断是否有时间筛选（按月/按年/按日/自定义造成数据范围缩小）
    var hasTimeFilter = (dateFrom !== '' || dateTo !== '');

    // 筛选小字：有时间筛选且数据与年总额不同时，展示筛选汇总
    var filterSubText = '';
    if (hasTimeFilter && (yearTotalBalance !== balance || yearIncome !== totalIncome || yearExpense !== totalExpense)) {
        filterSubText = '<div style="margin-top:8px;text-align:center;font-size:12px;color:#888;white-space:nowrap;">' +
            '筛选结果：收入 ¥' + formatMoney(totalIncome) + ' · 支出 ¥' + formatMoney(totalExpense) + ' · 结余 ¥' + formatMoney(balance) +
        '</div>';
    }

    // 渲染汇总卡片（主数据始终为当年额度，受账单户影响）
    document.getElementById('summaryCards').innerHTML =
        '<div class="summary-card">' +
            '<div class="card-icon">📊</div>' +
            '<div class="card-label">总结余</div>' +
            '<div class="card-value balance">¥' + formatMoney(yearTotalBalance) + '</div>' +
        '</div>' +
        '<div class="summary-card">' +
            '<div class="card-icon">📈</div>' +
            '<div class="card-label">总收入</div>' +
            '<div class="card-value income">¥' + formatMoney(yearIncome) + '</div>' +
        '</div>' +
        '<div class="summary-card">' +
            '<div class="card-icon">📉</div>' +
            '<div class="card-label">总支出</div>' +
            '<div class="card-value expense">¥' + formatMoney(yearExpense) + '</div>' +
        '</div>' +
        '<div class="summary-card">' +
            '<div class="card-icon">📋</div>' +
            '<div class="card-label">账单数</div>' +
            '<div class="card-value" style="color:var(--text);">' + filtered.length + ' 条</div>' +
        '</div>' + filterSubText;

    // 渲染表格
    var tbody = document.getElementById('homeBillTbody');
    var emptyEl = document.getElementById('homeEmpty');

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        emptyEl.style.display = 'block';
    } else {
        emptyEl.style.display = 'none';
        var html = '';
        pageBills.forEach(function(b) {
            var user = APP_DATA.billUsers.find(function(u) { return u.id === b.userId; });
            var userName = user ? user.name : '未知';
            var userColor = user ? user.color : '#999';
            var amountClass = b.type === '收入' ? 'amount-income' : (b.type === '结余' ? 'amount-balance' : 'amount-expense');
            var sourceClass = '';
            if (b.source && b.source.includes('微信')) sourceClass = 'wechat';
            else if (b.source && b.source.includes('支付宝')) sourceClass = 'alipay';
            else if (b.source && b.source.includes('OCR')) sourceClass = 'ocr';
            else if (b.source && b.source.includes('Excel')) sourceClass = 'excel';

            html += '<tr data-id="' + b.id + '">' +
                '<td class="col-check" style="display:none;"><input type="checkbox" class="bill-checkbox" data-id="' + b.id + '"></td>' +
                '<td>' + formatDate(b.date) + '</td>' +
                '<td><span class="user-badge" style="background:' + userColor + ';">' + userName + '</span></td>' +
                '<td>' + b.type + '</td>' +
                '<td class="' + amountClass + '">¥' + formatMoney(b.amount) + '</td>' +
                '<td class="note-cell" title="' + (b.note || '') + '" onclick="openDetailModal(\'' + b.id + '\')">' + (b.note || '-') + '</td>' +
                '<td><span class="source-badge ' + sourceClass + '">' + (b.source || '手动') + '</span></td>' +
                '<td><div class="action-btns">' +
                    '<button class="btn-view" onclick="openDetailModal(\'' + b.id + '\')">查看</button>' +
                    '<button class="btn-edit" onclick="openEditBillModal(\'' + b.id + '\')">编辑</button>' +
                    '<button class="btn-delete" onclick="deleteBill(\'' + b.id + '\')">删除</button>' +
                '</div></td>' +
                '</tr>';
        });
        tbody.innerHTML = html;
    }

    // 渲染分页控件
    renderPagination();

    // 重置批量操作状态
    cancelBatchAction();
}

// ==================== 分页控件 ====================
function renderPagination() {
    var container = document.getElementById('paginationBar');
    if (!container) return;
    
    var totalPages = Math.ceil(_totalFiltered / _pageSize) || 1;
    
    if (_totalFiltered <= _pageSize) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'flex';
    
    var html = '';
    
    // 左侧：总条数 + 每页条数
    html += '<div class="pagination-info">';
    html += '<span>共 <strong>' + _totalFiltered + '</strong> 条</span>';
    html += '<select class="page-size-select" onchange="changePageSize(this.value)">';
    var sizes = [20, 50, 100, 500, 1000, 3000];
    sizes.forEach(function(s) {
        html += '<option value="' + s + '"' + (_pageSize === s ? ' selected' : '') + '>每页 ' + s + ' 条</option>';
    });
    html += '</select>';
    html += '</div>';
    
    // 右侧：页码按钮
    html += '<div class="pagination-btns">';
    
    // 上一页
    html += '<button class="page-btn" onclick="goToPage(' + (_currentPage - 1) + ')"' + (_currentPage <= 1 ? ' disabled' : '') + '>‹ 上一页</button>';
    
    // 页码计算：始终显示首尾，中间最多5个
    var pages = [];
    if (totalPages <= 7) {
        for (var i = 1; i <= totalPages; i++) pages.push(i);
    } else {
        pages.push(1);
        if (_currentPage > 3) pages.push('...');
        var left = Math.max(2, _currentPage - 1);
        var right = Math.min(totalPages - 1, _currentPage + 1);
        if (_currentPage <= 3) right = Math.max(right, 4);
        if (_currentPage >= totalPages - 2) left = Math.min(left, totalPages - 3);
        for (var j = left; j <= right; j++) pages.push(j);
        if (_currentPage < totalPages - 2) pages.push('...');
        pages.push(totalPages);
    }
    
    pages.forEach(function(p) {
        if (p === '...') {
            html += '<span class="page-ellipsis">...</span>';
        } else {
            html += '<button class="page-btn' + (p === _currentPage ? ' active' : '') + '" onclick="goToPage(' + p + ')">' + p + '</button>';
        }
    });
    
    // 下一页
    html += '<button class="page-btn" onclick="goToPage(' + (_currentPage + 1) + ')"' + (_currentPage >= totalPages ? ' disabled' : '') + '>下一页 ›</button>';
    
    html += '</div>';
    
    container.innerHTML = html;
}

function goToPage(page) {
    var totalPages = Math.ceil(_totalFiltered / _pageSize) || 1;
    if (page < 1 || page > totalPages) return;
    _currentPage = page;
    renderHomeView();
    // 滚动到表格顶部
    var tableEl = document.getElementById('homeBillTable');
    if (tableEl) tableEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function changePageSize(size) {
    _pageSize = parseInt(size);
    _currentPage = 1;
    renderHomeView();
}

// ==================== 列宽拖拽调整 ====================
var _colResizeInitialized = false;

// 各列默认宽度
var COLUMN_DEFAULTS = {
    check: 36,
    date: 105,
    user: 90,
    type: 60,
    amount: 100,
    note: 200,
    source: 80,
    action: 130
};

function getColWidthsKey() {
    var accId = APP_DATA.currentAccountId || 'default';
    return 'billColWidths_' + accId;
}

function loadColumnWidths() {
    try {
        var raw = localStorage.getItem(getColWidthsKey());
        return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
}

function saveColumnWidths() {
    var table = document.getElementById('homeBillTable');
    if (!table) return;
    var cols = table.querySelectorAll('colgroup.col-resize-group col');
    var widths = {};
    cols.forEach(function(col) {
        var key = col.getAttribute('data-col');
        if (key) widths[key] = parseInt(col.style.width) || COLUMN_DEFAULTS[key] || 80;
    });
    try {
        localStorage.setItem(getColWidthsKey(), JSON.stringify(widths));
    } catch (e) {}
}

function initColumnResize() {
    if (_colResizeInitialized) return;
    var table = document.getElementById('homeBillTable');
    if (!table) return;

    var ths = table.querySelectorAll('thead th');
    var colgroup = table.querySelector('colgroup.col-resize-group');
    if (!colgroup || colgroup.children.length > 0) {
        // 已初始化或 colgroup 不存在
        if (colgroup && colgroup.children.length > 0) {
            _colResizeInitialized = true;
            return;
        }
        return;
    }

    var savedWidths = loadColumnWidths();

    ths.forEach(function(th, i) {
        var colKey = th.getAttribute('data-col') || ('col' + i);
        var defaultWidth = COLUMN_DEFAULTS[colKey] || 80;
        var width = savedWidths[colKey] || defaultWidth;

        // 创建 col 元素
        var col = document.createElement('col');
        col.style.width = width + 'px';
        col.setAttribute('data-col', colKey);
        // check 列默认隐藏
        if (colKey === 'check') col.style.display = 'none';
        colgroup.appendChild(col);

        // 最后一列(操作)不加拖拽手柄
        if (i < ths.length - 1) {
            var handle = document.createElement('div');
            handle.className = 'col-resize-handle';
            th.appendChild(handle);

            (function(idx, colEl) {
                handle.addEventListener('mousedown', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    startColResize(e, idx, colEl);
                });
            })(i, col);
        }
    });

    _colResizeInitialized = true;
}

function startColResize(e, colIndex, colEl) {
    var table = document.getElementById('homeBillTable');
    var allCols = table.querySelectorAll('colgroup.col-resize-group col');
    var nextCol = allCols[colIndex + 1];

    var startX = e.clientX;
    var startWidth = colEl.offsetWidth;
    var nextStartWidth = nextCol ? nextCol.offsetWidth : 0;
    var minWidth = 36;

    // 全屏遮罩防止文本选中
    var overlay = document.createElement('div');
    overlay.className = 'col-resize-overlay';
    document.body.appendChild(overlay);

    var handle = e.target.closest('.col-resize-handle');
    if (handle) handle.classList.add('active');

    function onMouseMove(ev) {
        var delta = ev.clientX - startX;
        var newWidth = Math.max(minWidth, startWidth + delta);
        colEl.style.width = newWidth + 'px';
        if (nextCol) {
            var newNextWidth = Math.max(minWidth, nextStartWidth - delta);
            nextCol.style.width = newNextWidth + 'px';
        }
    }

    function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        overlay.remove();
        if (handle) handle.classList.remove('active');
        saveColumnWidths();
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

function populateTimeSelects() {
    // 找出所有账单的日期范围
    var years = [];
    var now = new Date();
    var thisYear = now.getFullYear();
    // 从数据中找最早和最晚年份
    APP_DATA.bills.forEach(function(b) {
        if (b.date) {
            var y = parseInt(b.date.substring(0, 4));
            if (y && years.indexOf(y) === -1) years.push(y);
        }
    });
    if (years.indexOf(thisYear) === -1) years.push(thisYear);
    years.sort(function(a, b) { return b - a; });
    if (years.length === 0) years.push(thisYear);

    // 按钮模式中的年份下拉
    var ymSel = document.getElementById('homeMonthYear');
    if (ymSel && ymSel.options.length === 0) {
        years.forEach(function(y) {
            var opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y + ' 年';
            ymSel.appendChild(opt);
        });
        ymSel.value = thisYear;
    }

    // 月份下拉
    var mmSel = document.getElementById('homeMonthMonth');
    if (mmSel && mmSel.options.length === 0) {
        for (var i = 1; i <= 12; i++) {
            var opt = document.createElement('option');
            opt.value = i;
            opt.textContent = i + ' 月';
            mmSel.appendChild(opt);
        }
        mmSel.value = now.getMonth() + 1;
    }

    // 按年模式的下拉
    var ySel = document.getElementById('homeYear');
    if (ySel && ySel.options.length === 0) {
        years.forEach(function(y) {
            var opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y + ' 年';
            ySel.appendChild(opt);
        });
        ySel.value = thisYear;
    }
}

function resetHomeFilter() {
    document.getElementById('homeUserFilter').value = 'all';
    document.getElementById('homeDateFrom').value = '';
    document.getElementById('homeDateTo').value = '';
    var now = new Date();
    var ymSel = document.getElementById('homeMonthYear');
    var mmSel = document.getElementById('homeMonthMonth');
    if (ymSel) ymSel.value = now.getFullYear();
    if (mmSel) mmSel.value = now.getMonth() + 1;
    setTimeMode('month');
}

// ==================== 账单详情弹窗 ====================
function openDetailModal(billId) {
    var b = APP_DATA.bills.find(function(x) { return x.id === billId; });
    if (!b) return;
    var user = APP_DATA.billUsers.find(function(u) { return u.id === b.userId; });
    var userName = user ? user.name : '未知';
    document.getElementById('detailContent').innerHTML =
        '<div style="font-size:14px;line-height:2;">' +
            '<p><strong>日期：</strong>' + formatDate(b.date) + '</p>' +
            '<p><strong>账单户：</strong>' + userName + '</p>' +
            '<p><strong>类型：</strong>' + b.type + '</p>' +
            '<p><strong>金额：</strong><span style="color:' + (b.type === '收入' ? 'var(--success)' : (b.type === '结余' ? 'var(--primary)' : 'var(--danger)')) + ';font-weight:700;">¥' + formatMoney(b.amount) + '</span></p>' +
            '<p><strong>备注：</strong>' + (b.note || '-') + '</p>' +
            '<p><strong>来源：</strong>' + (b.source || '手动录入') + '</p>' +
        '</div>';
    document.getElementById('detailModal')._billId = billId;
    openModal('detailModal');
}

function closeDetailModal() {
    closeModal('detailModal');
}

// ==================== 编辑账单弹窗 ====================
function openEditBillModal(billId) {
    var b = APP_DATA.bills.find(function(x) { return x.id === billId; });
    if (!b) return;

    // 填充账单户下拉
    var sel = document.getElementById('editBillUser');
    sel.innerHTML = '<option value="">-- 请选择账单户 --</option>';
    APP_DATA.billUsers.forEach(function(u) {
        var opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = u.name;
        if (u.id === b.userId) opt.selected = true;
        sel.appendChild(opt);
    });

    document.getElementById('editBillDate').value = b.date;
    document.getElementById('editBillType').value = b.type;
    document.getElementById('editBillAmount').value = b.amount;
    document.getElementById('editBillNote').value = b.note || '';
    document.getElementById('editBillSource').value = b.source || '';
    document.getElementById('editBillModal')._billId = billId;
    openModal('editBillModal');
}

function closeEditBillModal() {
    closeModal('editBillModal');
}

function saveEditBill() {
    var billId = document.getElementById('editBillModal')._billId;
    var b = APP_DATA.bills.find(function(x) { return x.id === billId; });
    if (!b) return;

    var userId = document.getElementById('editBillUser').value;
    if (!userId) { showToast('请选择账单户', 'error'); return; }

    b.userId = userId;
    b.date = document.getElementById('editBillDate').value;
    b.type = document.getElementById('editBillType').value;
    var amount = parseFloat(document.getElementById('editBillAmount').value);
    if (isNaN(amount) || amount === 0) { showToast('请输入有效金额', 'error'); return; }
    if (b.type !== '结余' && amount < 0) { showToast('支出/收入金额不能为负数', 'error'); return; }
    b.amount = amount;
    b.note = document.getElementById('editBillNote').value;
    b.source = document.getElementById('editBillSource').value;
    saveData();
    closeEditBillModal();
    renderHomeView();
    showToast('账单已更新', 'success');
}

// ==================== 删除账单 ====================
function deleteBill(billId) {
    if (!confirm('确定要删除这条账单吗？此操作不可恢复。')) return;
    APP_DATA.bills = APP_DATA.bills.filter(function(b) { return b.id !== billId; });
    saveData();
    renderHomeView();
    showToast('账单已删除', 'success');
}

// ==================== 导出功能 ====================
var _exportDropdownOpen = false;

function getFilteredBillsForExport() {
    var filterUser = document.getElementById('homeUserFilter').value;
    
    // 优先使用导出下拉中的日期范围
    var expFrom = document.getElementById('exportDateFrom').value || 
                  document.getElementById('exportDateFrom2').value;
    var expTo = document.getElementById('exportDateTo').value || 
                document.getElementById('exportDateTo2').value;
    
    var dateFrom, dateTo;
    if (expFrom || expTo) {
        dateFrom = expFrom;
        dateTo = expTo;
    } else {
        var range = getFilterDateRange();
        dateFrom = range.from;
        dateTo = range.to;
    }

    return APP_DATA.bills.filter(function(b) {
        if (filterUser !== 'all' && b.userId !== filterUser) return false;
        if (dateFrom && b.date < dateFrom) return false;
        if (dateTo && b.date > dateTo) return false;
        return true;
    }).sort(function(a, b) { return b.date.localeCompare(a.date) || b.createdAt - a.createdAt; });
}

function toggleExportMenu() {
    var menu = document.getElementById('exportDropdown') || document.getElementById('exportDropdown2');
    if (!menu) return;
    _exportDropdownOpen = !_exportDropdownOpen;
    menu.style.display = _exportDropdownOpen ? 'block' : 'none';
}

function closeExportMenu(e) {
    if (_exportDropdownOpen && e && !e.target.closest('.export-btn-wrapper')) {
        var m1 = document.getElementById('exportDropdown');
        var m2 = document.getElementById('exportDropdown2');
        if (m1) m1.style.display = 'none';
        if (m2) m2.style.display = 'none';
        _exportDropdownOpen = false;
    }
}

// 导出为表格（XLSX）
function exportAsXLSX() {
    closeExportMenu();
    var bills = getFilteredBillsForExport();
    if (bills.length === 0) { showToast('没有可导出的账单', 'error'); return; }

    var data = bills.map(function(b) {
        var user = APP_DATA.billUsers.find(function(u) { return u.id === b.userId; });
        return {
            '日期': b.date,
            '账单户': user ? user.name : '',
            '类型': b.type,
            '金额': b.amount,
            '备注': b.note || '',
            '来源': b.source || ''
        };
    });

    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.json_to_sheet(data);
    // 设置列宽
    ws['!cols'] = [
        { wch: 12 }, { wch: 10 }, { wch: 6 }, { wch: 12 }, { wch: 30 }, { wch: 10 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, '账单');
    XLSX.writeFile(wb, '梯众楼梯流水账_' + new Date().toISOString().split('T')[0] + '.xlsx');
    showToast('表格导出成功', 'success');
}

// 导出为 PDF（通过浏览器打印）
function exportAsPDF() {
    closeExportMenu();
    var bills = getFilteredBillsForExport();
    if (bills.length === 0) { showToast('没有可导出的账单', 'error'); return; }

    var printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
        showToast('请允许弹出窗口以导出PDF', 'error');
        return;
    }

    var totalIncome = 0, totalExpense = 0, totalBalance = 0;
    var rows = '';
    bills.forEach(function(b) {
        var user = APP_DATA.billUsers.find(function(u) { return u.id === b.userId; });
        var userName = user ? user.name : '';
        var typeClass = b.type === '收入' ? 'color:#00b894' : (b.type === '结余' ? 'color:#4A90D9' : 'color:#e17055');
        rows += '<tr>' +
            '<td>' + b.date + '</td>' +
            '<td>' + userName + '</td>' +
            '<td style="' + typeClass + '">' + b.type + '</td>' +
            '<td style="' + typeClass + ';font-weight:bold">¥' + b.amount.toFixed(2) + '</td>' +
            '<td>' + (b.note || '-') + '</td>' +
            '<td>' + (b.source || '') + '</td>' +
            '</tr>';
        if (b.type === '收入') totalIncome += b.amount;
        else if (b.type === '结余') totalBalance += b.amount;
        else totalExpense += b.amount;
    });

    printWindow.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>账单导出</title>' +
        '<style>body{font-family:"Microsoft YaHei",sans-serif;padding:20px;color:#333}' +
        'h1{text-align:center;margin-bottom:5px;font-size:20px}h3{text-align:center;color:#666;margin-top:0;margin-bottom:20px;font-weight:normal}' +
        '.summary{margin-bottom:20px;display:flex;justify-content:center;gap:24px;flex-wrap:wrap}' +
        '.summary span{padding:6px 16px;border-radius:6px;background:#f5f5f5;font-size:14px}' +
        'table{width:100%;border-collapse:collapse;margin-top:10px}' +
        'th,td{border:1px solid #ddd;padding:8px 12px;text-align:left;font-size:13px}' +
        'th{background:#f8f9fa;font-weight:600}' +
        '@media print{body{padding:10px}@page{size:A4 landscape;margin:10mm}}</style></head><body>' +
        '<h1>梯众楼梯流水账</h1>' +
        '<h3>导出日期：' + new Date().toISOString().split('T')[0] + '</h3>' +
        '<div class="summary">' +
        '<span>总收入：¥' + totalIncome.toFixed(2) + '</span>' +
        '<span>总支出：¥' + totalExpense.toFixed(2) + '</span>' +
        '<span>总结余：¥' + (totalBalance + totalIncome - totalExpense).toFixed(2) + '</span>' +
        '</div>' +
        '<table><thead><tr><th>日期</th><th>账单户</th><th>类型</th><th>金额</th><th>备注</th><th>来源</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table>' +
        '</body></html>');
    printWindow.document.close();
    // 等待渲染后打印
    setTimeout(function() {
        printWindow.print();
        printWindow.close();
    }, 500);
}

// 导出为图片
function exportAsImage() {
    closeExportMenu();
    var bills = getFilteredBillsForExport();
    if (bills.length === 0) { showToast('没有可导出的账单', 'error'); return; }

    showToast('正在生成图片...', 'info');

    // 计算当年总额（受账单户影响，不受时间模式影响）
    var filterUser = document.getElementById('homeUserFilter').value;
    var currentYear = new Date().getFullYear().toString();
    var yearIncome = 0, yearExpense = 0, yearBalance = 0;
    APP_DATA.bills.forEach(function(b) {
        if (b.date >= currentYear + '-01-01' && b.date <= currentYear + '-12-31') {
            if (filterUser !== 'all' && b.userId !== filterUser) return;
            if (b.type === '收入') yearIncome += b.amount;
            else if (b.type === '结余') yearBalance += b.amount;
            else yearExpense += b.amount;
        }
    });
    var yearTotalBalance = yearBalance + yearIncome - yearExpense;

    // 计算当前视图筛选汇总（用于对比）
    var totalIncome = 0, totalExpense = 0, totalBalance = 0;
    bills.forEach(function(b) {
        if (b.type === '收入') totalIncome += b.amount;
        else if (b.type === '结余') totalBalance += b.amount;
        else totalExpense += b.amount;
    });
    var balance = totalBalance + totalIncome - totalExpense;

    // 构建临时渲染容器
    var container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:720px;padding:20px;background:#fff;font-family:"Microsoft YaHei","PingFang SC",sans-serif;color:#333;z-index:9999;';
    
    // 获取当前筛选账单户名称
    var userName = '全部账户';
    var isAll = (filterUser === 'all');
    if (!isAll) {
        var u = APP_DATA.billUsers.find(function(x) { return x.id === filterUser; });
        if (u) userName = u.name;
    }

    // 动态标题
    var pageTitle = isAll ? '梯众楼梯总账' : escapeHtml(userName) + '的账';
    var subInfo = isAll ? '全部账单户' : '账单户：' + escapeHtml(userName);

    // 头部标题
    var html = '<div style="text-align:center;padding-bottom:20px;border-bottom:3px solid #4A90D9;margin-bottom:16px;">';
    html += '<h2 style="margin:0 0 8px;color:#4A90D9;font-size:26px;font-weight:bold;">' + pageTitle + '</h2>';
    // 日期范围：取过滤后账单的最早和最晚日期
    var dateRangeStr = '';
    if (bills.length > 0) {
        var minDate = bills[bills.length - 1].date;
        var maxDate = bills[0].date;
        dateRangeStr = ' | 日期范围：' + minDate + ' ~ ' + maxDate;
    }
    html += '<p style="margin:0;color:#666;font-size:16px;">' + subInfo + dateRangeStr + '</p>';
    html += '</div>';

    // 汇总卡片（当年总额，受账单户影响不受时间影响）
    html += '<div style="display:flex;gap:12px;margin-bottom:12px;">';
    html += '<div style="flex:1;padding:14px;border-radius:10px;background:linear-gradient(135deg,#e8f5e9,#f1f8e9);text-align:center;">';
    html += '<div style="font-size:12px;color:#666;margin-bottom:4px;">收入（当年）</div>';
    html += '<div style="font-size:24px;font-weight:bold;color:#00b894;">¥' + yearIncome.toFixed(2) + '</div>';
    html += '</div>';
    html += '<div style="flex:1;padding:14px;border-radius:10px;background:linear-gradient(135deg,#fff3e0,#fce4ec);text-align:center;">';
    html += '<div style="font-size:12px;color:#666;margin-bottom:4px;">支出（当年）</div>';
    html += '<div style="font-size:24px;font-weight:bold;color:#e17055;">¥' + yearExpense.toFixed(2) + '</div>';
    html += '</div>';
    html += '<div style="flex:1;padding:14px;border-radius:10px;background:linear-gradient(135deg,#e3f2fd,#e8eaf6);text-align:center;">';
    html += '<div style="font-size:12px;color:#666;margin-bottom:4px;">总结余（当年）</div>';
    html += '<div style="font-size:24px;font-weight:bold;color:' + (yearTotalBalance >= 0 ? '#00b894' : '#e17055') + ';">¥' + yearTotalBalance.toFixed(2) + '</div>';
    html += '</div>';
    html += '</div>';

    // 筛选小字：时间模式数据与年总额不同时展示
    if (yearTotalBalance !== balance || yearIncome !== totalIncome || yearExpense !== totalExpense) {
        html += '<div style="text-align:center;font-size:12px;color:#888;margin-bottom:12px;white-space:nowrap;">';
        html += '筛选结果：收入 ¥' + totalIncome.toFixed(2) + ' · 支出 ¥' + totalExpense.toFixed(2) + ' · 结余 ¥' + balance.toFixed(2);
        html += '</div>';
    }

    // 账单表格
    html += '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
    html += '<thead><tr style="background:#4A90D9;color:#fff;">';
    html += '<th style="padding:10px 10px;text-align:center;border:1px solid #3a7bc8;font-size:14px;">日期</th>';
    html += '<th style="padding:10px 10px;text-align:center;border:1px solid #3a7bc8;font-size:14px;">类型</th>';
    html += '<th style="padding:10px 10px;text-align:center;border:1px solid #3a7bc8;font-size:14px;">金额</th>';
    html += '<th style="padding:10px 10px;text-align:center;border:1px solid #3a7bc8;font-size:14px;">备注</th>';
    html += '</tr></thead><tbody>';
    
    bills.forEach(function(b, idx) {
        var bg = idx % 2 === 0 ? '#fafafa' : '#fff';
        var typeColor = b.type === '收入' ? '#00b894' : (b.type === '结余' ? '#4A90D9' : '#e17055');
        html += '<tr style="background:' + bg + ';">';
        html += '<td style="padding:6px 10px;border:1px solid #e0e0e0;">' + b.date + '</td>';
        html += '<td style="padding:6px 10px;border:1px solid #e0e0e0;color:' + typeColor + ';font-weight:600;">' + b.type + '</td>';
        html += '<td style="padding:6px 10px;border:1px solid #e0e0e0;text-align:right;color:' + typeColor + ';font-weight:bold;">¥' + (b.amount || 0).toFixed(2) + '</td>';
        html += '<td style="padding:6px 10px;border:1px solid #e0e0e0;">' + escapeHtml(b.note || '-') + '</td>';
        html += '</tr>';
    });
    html += '</tbody></table>';

    // 底部
    html += '<div style="text-align:center;color:#bbb;font-size:11px;margin-top:12px;">共 ' + bills.length + ' 条记录</div>';

    container.innerHTML = html;
    document.body.appendChild(container);

    // 使用 html2canvas 截图
    setTimeout(function() {
        if (typeof html2canvas === 'undefined') {
            document.body.removeChild(container);
            showToast('图片导出功能加载失败，请刷新页面后重试', 'error');
            return;
        }
        html2canvas(container, {
            backgroundColor: '#ffffff',
            scale: 2,  // 2倍清晰度
            useCORS: true,
            logging: false
        }).then(function(canvas) {
            document.body.removeChild(container);
            // 下载图片
            var link = document.createElement('a');
            link.download = pageTitle + '_' + new Date().toISOString().split('T')[0] + '.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
            showToast('图片导出成功', 'success');
        }).catch(function(err) {
            document.body.removeChild(container);
            showToast('图片生成失败：' + err.message, 'error');
        });
    }, 100);
}

// 导出当前筛选账单（详情弹窗用）
function exportCurrentBills(format) {
    if (format === 'xlsx') exportAsXLSX();
    else exportAsPDF();
}

// ==================== 批量操作 ====================
var batchMode = null; // 'edit' | 'delete' | null
var selectedBillIds = [];

function toggleBatchEdit() {
    if (batchMode === 'edit') { cancelBatchAction(); return; }
    batchMode = 'edit';
    enterBatchMode();
}

function toggleBatchDelete() {
    if (batchMode === 'delete') { cancelBatchAction(); return; }
    batchMode = 'delete';
    enterBatchMode();
}

function enterBatchMode() {
    selectedBillIds = [];
    document.getElementById('colCheckTh').style.display = '';
    document.querySelectorAll('.col-check').forEach(function(td) { td.style.display = ''; });
    document.getElementById('batchConfirmBtn').style.display = '';
    document.getElementById('batchCancelBtn').style.display = '';
    document.getElementById('batchCount').style.display = '';
    document.getElementById('selectAllCheckbox').checked = false;
    // 显示 colgroup 中 check 列
    var checkCol = document.querySelector('colgroup.col-resize-group col[data-col="check"]');
    if (checkCol) checkCol.style.display = '';
    updateBatchCount();
}

function cancelBatchAction() {
    batchMode = null;
    selectedBillIds = [];
    document.getElementById('colCheckTh').style.display = 'none';
    document.querySelectorAll('.col-check').forEach(function(td) { td.style.display = 'none'; });
    document.getElementById('batchConfirmBtn').style.display = 'none';
    document.getElementById('batchCancelBtn').style.display = 'none';
    document.getElementById('batchCount').style.display = 'none';
    document.getElementById('selectAllCheckbox').checked = false;
    // 隐藏 colgroup 中 check 列
    var checkCol = document.querySelector('colgroup.col-resize-group col[data-col="check"]');
    if (checkCol) checkCol.style.display = 'none';
}

function toggleSelectAll(cb) {
    var checks = document.querySelectorAll('.bill-checkbox');
    selectedBillIds = [];
    checks.forEach(function(c) {
        c.checked = cb.checked;
        if (cb.checked) selectedBillIds.push(c.dataset.id);
    });
    updateBatchCount();
}

function updateBatchCount() {
    document.getElementById('batchCount').textContent = '已选 ' + selectedBillIds.length + ' 条';
}

// 监听复选框变化
document.addEventListener('change', function(e) {
    if (e.target.classList.contains('bill-checkbox')) {
        var id = e.target.dataset.id;
        if (e.target.checked) {
            if (selectedBillIds.indexOf(id) === -1) selectedBillIds.push(id);
        } else {
            selectedBillIds = selectedBillIds.filter(function(x) { return x !== id; });
        }
        updateBatchCount();
    }
});

function confirmBatchAction() {
    // 重新从复选框收集选中ID
    selectedBillIds = [];
    document.querySelectorAll('.bill-checkbox:checked').forEach(function(c) {
        selectedBillIds.push(c.dataset.id);
    });

    if (selectedBillIds.length === 0) {
        showToast('请先勾选账单', 'error');
        return;
    }

    if (batchMode === 'delete') {
        if (!confirm('确定要删除选中的 ' + selectedBillIds.length + ' 条账单吗？此操作不可恢复。')) return;
        APP_DATA.bills = APP_DATA.bills.filter(function(b) { return selectedBillIds.indexOf(b.id) === -1; });
        saveData();
        cancelBatchAction();
        renderHomeView();
        showToast('已删除 ' + selectedBillIds.length + ' 条账单', 'success');
    } else if (batchMode === 'edit') {
        openBatchEditModal();
    }
}

// ==================== 批量修改弹窗 ====================
function openBatchEditModal() {
    document.getElementById('batchEditDateCheck').checked = false;
    document.getElementById('batchEditTypeCheck').checked = false;
    document.getElementById('batchEditAmountCheck').checked = false;
    document.getElementById('batchEditNoteCheck').checked = false;
    document.getElementById('batchEditSourceCheck').checked = false;
    document.getElementById('batchEditUserCheck').checked = false;
    document.getElementById('batchEditDate').disabled = true;
    document.getElementById('batchEditType').disabled = true;
    document.getElementById('batchEditAmount').disabled = true;
    document.getElementById('batchEditNote').disabled = true;
    document.getElementById('batchEditSource').disabled = true;
    document.getElementById('batchEditUser').disabled = true;
    
    // 填充账单户下拉
    var userSel = document.getElementById('batchEditUser');
    userSel.innerHTML = '<option value="">-- 请选择 --</option>';
    APP_DATA.billUsers.forEach(function(u) {
        var opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = u.name;
        userSel.appendChild(opt);
    });
    
    openModal('batchEditModal');
}

function closeBatchEditModal() {
    closeModal('batchEditModal');
}

// 批量编辑字段的checkbox联动
['batchEditDateCheck','batchEditTypeCheck','batchEditAmountCheck','batchEditNoteCheck','batchEditSourceCheck'].forEach(function(checkId) {
    var checkEl = document.getElementById(checkId);
    if (checkEl) {
        checkEl.addEventListener('change', function() {
            var inputId = checkId.replace('Check', '');
            var inputEl = document.getElementById(inputId);
            if (inputEl) inputEl.disabled = !this.checked;
        });
    }
});

function saveBatchEdit() {
    if (selectedBillIds.length === 0) {
        showToast('没有选中的账单', 'error');
        return;
    }

    var updates = {};
    if (document.getElementById('batchEditDateCheck').checked) updates.date = document.getElementById('batchEditDate').value;
    if (document.getElementById('batchEditTypeCheck').checked) updates.type = document.getElementById('batchEditType').value;
    if (document.getElementById('batchEditAmountCheck').checked) {
        var batchAmount = parseFloat(document.getElementById('batchEditAmount').value);
        if (isNaN(batchAmount) || batchAmount === 0) { showToast('请输入有效金额', 'error'); return; }
        updates.amount = batchAmount;
    }
    if (document.getElementById('batchEditNoteCheck').checked) updates.note = document.getElementById('batchEditNote').value;
    if (document.getElementById('batchEditSourceCheck').checked) updates.source = document.getElementById('batchEditSource').value;
    if (document.getElementById('batchEditUserCheck').checked) updates.userId = document.getElementById('batchEditUser').value;

    if (Object.keys(updates).length === 0) {
        showToast('请至少勾选一个要修改的字段', 'error');
        return;
    }

    // 账单户修改校验
    if (updates.userId && !updates.userId.trim()) {
        showToast('请选择有效的账单户', 'error');
        return;
    }

    APP_DATA.bills.forEach(function(b) {
        if (selectedBillIds.indexOf(b.id) !== -1) {
            Object.keys(updates).forEach(function(key) { b[key] = updates[key]; });
        }
    });

    saveData();
    closeBatchEditModal();
    cancelBatchAction();
    renderHomeView();
    showToast('已批量修改 ' + selectedBillIds.length + ' 条账单', 'success');
}

// ==================== 手动录入 ====================
function openManualEntry() {
    var sel = document.getElementById('manualUser');
    sel.innerHTML = '<option value="">-- 请选择账单户 --</option>';
    APP_DATA.billUsers.forEach(function(u) {
        sel.innerHTML += '<option value="' + u.id + '">' + u.name + '</option>';
    });
    document.getElementById('manualDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('manualAmount').value = '';
    document.getElementById('manualNote').value = '';
    document.getElementById('manualType').value = '支出';
    openModal('manualEntryModal');
}

function openManualEntryFromHome() {
    openManualEntry();
}

function closeManualEntry() {
    closeModal('manualEntryModal');
}

function addManualEntry() {
    var userId = document.getElementById('manualUser').value;
    if (!userId) { showToast('请选择账单户', 'error'); return; }

    var date = document.getElementById('manualDate').value;
    var type = document.getElementById('manualType').value;
    var amount = parseFloat(document.getElementById('manualAmount').value);
    var note = document.getElementById('manualNote').value;

    if (!date) { showToast('请选择日期', 'error'); return; }
    if (!amount || amount === 0 || isNaN(amount)) { showToast('请输入有效金额', 'error'); return; }
    if (type !== '结余' && amount < 0) { showToast('支出/收入金额不能为负数', 'error'); return; }

    APP_DATA.bills.push({
        id: generateId('bill'),
        userId: userId,
        date: date,
        type: type,
        amount: amount,
        note: note,
        source: '手动录入',
        createdAt: Date.now()
    });
    saveData();
    closeManualEntry();
    renderHomeView();
    showToast('账单添加成功', 'success');
}

// ==================== 设置页 ====================
function renderSettingsView() {
    renderAccountGrid();
    renderBillUserGrid();
}

// 账号户管理
function renderAccountGrid() {
    var grid = document.getElementById('accountGrid');
    var empty = document.getElementById('accountEmpty');
    if (APP_DATA.accounts.length === 0) {
        grid.innerHTML = '';
        empty.style.display = 'block';
    } else {
        empty.style.display = 'none';
        var html = '';
        APP_DATA.accounts.forEach(function(acc) {
            html += '<div class="user-card account-card">' +
                '<div class="user-avatar" style="background:' + (acc.role === 'admin' ? '#E17055' : '#4A90D9') + ';">' +
                    acc.name.charAt(0).toUpperCase() +
                '</div>' +
                '<div class="user-name">' + acc.name + '</div>' +
                '<div class="account-meta">' +
                    '<span class="account-badge ' + (acc.role === 'admin' ? 'admin' : '') + '">' +
                        (acc.role === 'admin' ? '管理员' : '普通用户') +
                    '</span>' +
                '</div>' +
                '<div class="card-actions">' +
                    '<button onclick="openEditAccountPasswordModal(\'' + acc.id + '\')">🔑 改密码</button>' +
                    (acc.role !== 'admin' ? '<button onclick="deleteAccount(\'' + acc.id + '\')" style="border-color:var(--danger);color:var(--danger);">删除</button>' : '') +
                '</div>' +
                '</div>';
        });
        grid.innerHTML = html;
    }
}

function openAddAccountModal() {
    document.getElementById('newAccountName').value = '';
    document.getElementById('newAccountPassword').value = '';
    document.getElementById('newAccountPassword2').value = '';
    openModal('addAccountModal');
}

function closeAddAccountModal() {
    closeModal('addAccountModal');
}

function addAccount() {
    var name = document.getElementById('newAccountName').value.trim();
    var pw1 = document.getElementById('newAccountPassword').value;
    var pw2 = document.getElementById('newAccountPassword2').value;

    if (!name) { showToast('请输入账号名', 'error'); return; }
    if (!pw1) { showToast('请设置密码', 'error'); return; }
    if (pw1 !== pw2) { showToast('两次密码不一致', 'error'); return; }
    if (APP_DATA.accounts.some(function(a) { return a.name === name; })) {
        showToast('账号名已存在', 'error'); return;
    }

    APP_DATA.accounts.push({
        id: generateId('account'),
        name: name,
        password: pw1,
        role: 'user',
        createdAt: new Date().toISOString()
    });
    saveData();
    closeAddAccountModal();
    renderAccountGrid();
    initLogin();
    showToast('账号添加成功', 'success');
}

function openEditAccountPasswordModal(accountId) {
    var acc = APP_DATA.accounts.find(function(a) { return a.id === accountId; });
    if (!acc) return;
    document.getElementById('editAccountNameDisplay').textContent = acc.name;
    document.getElementById('editAccountNewPassword').value = '';
    document.getElementById('editAccountNewPassword2').value = '';
    document.getElementById('editAccountPasswordModal')._accountId = accountId;
    openModal('editAccountPasswordModal');
}

function closeEditAccountPasswordModal() {
    closeModal('editAccountPasswordModal');
}

function saveAccountPassword() {
    var accountId = document.getElementById('editAccountPasswordModal')._accountId;
    var acc = APP_DATA.accounts.find(function(a) { return a.id === accountId; });
    if (!acc) return;

    var pw1 = document.getElementById('editAccountNewPassword').value;
    var pw2 = document.getElementById('editAccountNewPassword2').value;
    if (!pw1) { showToast('请输入新密码', 'error'); return; }
    if (pw1 !== pw2) { showToast('两次密码不一致', 'error'); return; }

    acc.password = pw1;
    saveData();
    closeEditAccountPasswordModal();
    showToast('密码已修改', 'success');
}

function deleteAccount(accountId) {
    var acc = APP_DATA.accounts.find(function(a) { return a.id === accountId; });
    if (!acc) return;
    if (acc.role === 'admin') { showToast('不能删除管理员账号', 'error'); return; }
    if (!confirm('确定要删除账号"' + acc.name + '"吗？')) return;
    APP_DATA.accounts = APP_DATA.accounts.filter(function(a) { return a.id !== accountId; });
    saveData();
    renderAccountGrid();
    initLogin();
    showToast('账号已删除', 'success');
}

// 账单户管理
function renderBillUserGrid() {
    var grid = document.getElementById('billUserGrid');
    var empty = document.getElementById('billUserEmpty');
    if (APP_DATA.billUsers.length === 0) {
        grid.innerHTML = '';
        empty.style.display = 'block';
    } else {
        empty.style.display = 'none';
        var html = '';
        APP_DATA.billUsers.forEach(function(u) {
            // 统计该账单户的数据
            var income = 0, expense = 0;
            APP_DATA.bills.forEach(function(b) {
                if (b.userId === u.id) {
                    if (b.type === '收入') income += b.amount;
                    else if (b.type !== '结余') expense += b.amount;
                }
            });
            html += '<div class="user-card">' +
                '<div class="user-avatar" style="background:' + u.color + ';">' + u.name.charAt(0) + '</div>' +
                '<div class="user-name">' + u.name + '</div>' +
                '<div class="user-stats">' +
                    '<span>收入<div class="stat-value income">¥' + formatMoney(income) + '</div></span>' +
                    '<span>支出<div class="stat-value expense">¥' + formatMoney(expense) + '</div></span>' +
                '</div>' +
                '<div class="card-actions">' +
                    '<button onclick="openEditUserModal(\'' + u.id + '\')">✏️ 编辑</button>' +
                    '<button onclick="deleteUser(\'' + u.id + '\')" style="border-color:var(--danger);color:var(--danger);">删除</button>' +
                '</div>' +
                '</div>';
        });
        grid.innerHTML = html;
    }
}

function openAddUserModal() {
    document.getElementById('newUserName').value = '';
    document.querySelectorAll('#colorPicker .color-dot').forEach(function(d) { d.classList.remove('active'); });
    document.querySelector('#colorPicker .color-dot').classList.add('active');
    openModal('addUserModal');
}

function closeAddUserModal() {
    closeModal('addUserModal');
}

// 颜色选择器交互
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('color-dot')) {
        var picker = e.target.parentElement;
        picker.querySelectorAll('.color-dot').forEach(function(d) { d.classList.remove('active'); });
        e.target.classList.add('active');
    }
    closeExportMenu(e);
});

function addUser() {
    var name = document.getElementById('newUserName').value.trim();
    if (!name) { showToast('请输入账单户名称', 'error'); return; }
    if (APP_DATA.billUsers.some(function(u) { return u.name === name; })) {
        showToast('账单户名称已存在', 'error'); return;
    }
    var activeDot = document.querySelector('#colorPicker .color-dot.active');
    var color = activeDot ? activeDot.dataset.color : '#4A90D9';

    APP_DATA.billUsers.push({
        id: generateId('user'),
        name: name,
        color: color,
        createdAt: new Date().toISOString()
    });
    saveData();
    closeAddUserModal();
    renderBillUserGrid();
    renderHomeView();
    showToast('账单户添加成功', 'success');
}

function openEditUserModal(userId) {
    var u = APP_DATA.billUsers.find(function(x) { return x.id === userId; });
    if (!u) return;
    document.getElementById('editUserName').value = u.name;
    document.querySelectorAll('#editColorPicker .color-dot').forEach(function(d) {
        d.classList.remove('active');
        if (d.dataset.color === u.color) d.classList.add('active');
    });
    document.getElementById('editUserModal')._userId = userId;
    openModal('editUserModal');
}

function closeEditUserModal() {
    closeModal('editUserModal');
}

function saveEditUser() {
    var userId = document.getElementById('editUserModal')._userId;
    var u = APP_DATA.billUsers.find(function(x) { return x.id === userId; });
    if (!u) return;

    var name = document.getElementById('editUserName').value.trim();
    if (!name) { showToast('请输入账单户名称', 'error'); return; }
    var conflict = APP_DATA.billUsers.some(function(x) { return x.name === name && x.id !== userId; });
    if (conflict) { showToast('账单户名称已存在', 'error'); return; }

    u.name = name;
    var activeDot = document.querySelector('#editColorPicker .color-dot.active');
    if (activeDot) u.color = activeDot.dataset.color;
    saveData();
    closeEditUserModal();
    renderBillUserGrid();
    renderHomeView();
    showToast('账单户已更新', 'success');
}

function deleteUser(userId) {
    var u = APP_DATA.billUsers.find(function(x) { return x.id === userId; });
    if (!u) return;
    var billCount = APP_DATA.bills.filter(function(b) { return b.userId === userId; }).length;
    if (!confirm('确定要删除账单户"' + u.name + '"吗？\n' + (billCount > 0 ? '（该账单户下有 ' + billCount + ' 条账单记录将被一并删除）' : ''))) return;
    APP_DATA.bills = APP_DATA.bills.filter(function(b) { return b.userId !== userId; });
    APP_DATA.billUsers = APP_DATA.billUsers.filter(function(x) { return x.id !== userId; });
    saveData();
    renderBillUserGrid();
    renderHomeView();
    showToast('账单户已删除', 'success');
}

// ==================== 导入弹窗 ====================
function openImportModal() {
    // 填充账单户下拉
    var sel = document.getElementById('importUser');
    sel.innerHTML = '<option value="">-- 请选择账单户 --</option>';
    APP_DATA.billUsers.forEach(function(u) {
        var opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = u.name;
        sel.appendChild(opt);
    });
    document.getElementById('billFileInput').value = '';
    document.getElementById('cameraInput').value = '';
    document.getElementById('selectedFileName').textContent = '';
    document.getElementById('imagePreview').style.display = 'none';
    _boxes = [];
    window._currentOCRFile = null;
    document.getElementById('imagePreview').style.display = 'none';
    _boxes = [];
    window._currentOCRFile = null;
    if (typeof setOCRMode === 'function') setOCRMode('auto');
    clearPasteContent();
    openModal('importModal');
    window._previewBills = [];
}

function closeImportModal() {
    closeModal('importModal');
    window._previewBills = [];
}

// ==================== 文件拖拽 ====================
(function() {
    var dropZone = document.getElementById('fileDropZone');
    if (!dropZone) return;
    dropZone.addEventListener('dragover', function(e) { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', function() { dropZone.classList.remove('dragover'); });
    dropZone.addEventListener('drop', function(e) {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        var files = e.dataTransfer.files;
        if (files.length > 0) processFile(files[0]);
    });
    dropZone.addEventListener('click', function(e) {
        // 如果点击的是按钮或input，不要重复触发
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.tagName === 'LABEL') return;
        document.getElementById('billFileInput').click();
    });
})();

function handleFileSelect(input) {
    var file = (input && input.files) ? input.files[0] : null;
    if (file) processFile(file);
}

function processFile(file) {
    var ext = file.name.split('.').pop().toLowerCase();
    document.getElementById('selectedFileName').textContent = '已选择：' + file.name;

    if (ext === 'csv' || ext === 'txt') {
        var reader = new FileReader();
        reader.onload = function(e) {
            parseTextContent(e.target.result, file.name);
        };
        reader.readAsText(file, 'UTF-8');
    } else if (ext === 'xlsx' || ext === 'xls') {
        var userId = document.getElementById('importUser').value;
        if (!userId) { showToast('请先选择账单户', 'error'); return; }
        var reader = new FileReader();
        reader.onload = function(e) {
            try {
                var wb = XLSX.read(e.target.result, { type: 'array' });
                var sheet = wb.Sheets[wb.SheetNames[0]];
                if (!sheet) { showToast('Excel中没有可用工作表', 'error'); return; }
                // 用二维数组方式读取，保留列结构
                var rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
                if (!Array.isArray(rows)) {
                    // 兼容：如果 sheet_to_json 返回异常，回退到 CSV 解析
                    var csvText = XLSX.utils.sheet_to_csv(sheet);
                    parseTextContent(csvText, file.name);
                    return;
                }
                parseExcelRows(rows, file.name, userId);
            } catch (err) {
                console.error('Excel解析错误', err);
                showToast('Excel解析失败：' + err.message, 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    } else if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
        processImageOCR(file);
    } else {
        showToast('不支持的文件格式', 'error');
    }
}

// ==================== 粘贴功能 ====================
(function() {
    var pasteZone = document.getElementById('pasteZone');
    if (!pasteZone) return;
    pasteZone.addEventListener('click', function() { pasteZone.focus(); });
    pasteZone.addEventListener('paste', function(e) {
        e.preventDefault();
        var items = e.clipboardData.items;
        var handled = false;
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (item.type.indexOf('image') !== -1) {
                var blob = item.getAsFile();
                showPastedImage(blob);
                handled = true;
                break;
            } else if (item.type === 'text/plain') {
                item.getAsString(function(text) {
                    showPastedText(text);
                });
                handled = true;
                break;
            }
        }
        if (!handled) {
            // 尝试从clipboardData读取
            var text = e.clipboardData.getData('text/plain');
            if (text) showPastedText(text);
        }
    });
})();

function showPastedImage(blob) {
    var url = URL.createObjectURL(blob);
    document.getElementById('pastePlaceholder').style.display = 'none';
    document.getElementById('pastePreview').style.display = 'block';
    document.getElementById('pasteActions').style.display = 'flex';
    document.getElementById('pastePreviewLabel').textContent = '已粘贴截图';
    var imgEl = document.getElementById('pasteImage');
    imgEl.src = url;
    imgEl.style.display = 'block';
    document.getElementById('pasteText').style.display = 'none';
    window._pastedBlob = blob;
    window._pastedType = 'image';
}

function showPastedText(text) {
    if (!text || !text.trim()) return;
    document.getElementById('pastePlaceholder').style.display = 'none';
    document.getElementById('pastePreview').style.display = 'block';
    document.getElementById('pasteActions').style.display = 'flex';
    document.getElementById('pastePreviewLabel').textContent = '已粘贴文字';
    document.getElementById('pasteImage').style.display = 'none';
    var preEl = document.getElementById('pasteText');
    preEl.textContent = text;
    preEl.style.display = 'block';
    window._pastedText = text;
    window._pastedType = 'text';
}

function clearPasteContent() {
    document.getElementById('pastePlaceholder').style.display = '';
    document.getElementById('pastePreview').style.display = 'none';
    document.getElementById('pasteActions').style.display = 'none';
    document.getElementById('pasteImage').src = '';
    document.getElementById('pasteText').textContent = '';
    document.getElementById('pasteOcrProgress').style.display = 'none';
    window._pastedBlob = null;
    window._pastedText = null;
    window._pastedType = null;
}

function handlePastedContent() {
    if (window._pastedType === 'image' && window._pastedBlob) {
        processImageOCR(window._pastedBlob);
    } else if (window._pastedType === 'text' && window._pastedText) {
        parseTextContent(window._pastedText, '粘贴内容');
    }
}

// ==================== 文本解析（CSV/TXT/Excel/粘贴） ====================
function parseTextContent(text, sourceName) {
    var userId = document.getElementById('importUser').value;
    if (!userId) { showToast('请先选择账单户', 'error'); return; }

    var lines = text.split(/\n/).filter(function(l) { return l.trim(); });
    var bills = [];

    // 尝试多种解析策略
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        // 策略1: CSV格式 "日期,类型,金额,备注" 或 "日期,金额,备注"
        var parts = line.split(/[,，\t]/);
        if (parts.length >= 3) {
            var csvDate = parseDateStr(parts[0]);
            var csvAmount = extractAmount(parts[2] || parts[1]);
            if (csvDate && csvAmount) {
                var csvType = '支出';
                if (parts[1] && (parts[1].includes('收入') || parts[1].includes('入账'))) {
                    csvType = '收入';
                } else if (parts[2] && parts[2].startsWith('+')) {
                    csvType = '收入';
                }
                bills.push({
                    date: csvDate,
                    type: csvType,
                    amount: Math.abs(csvAmount),
                    note: parts.slice(csvType === '支出' ? 2 : 3).join(' ').trim() || (sourceName + '导入'),
                });
                continue;
            }
        }

        // 策略2: 微信/支付宝格式 "2024-01-15 支出 ¥250.00 餐饮"
        var wxMatch = line.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2})/);
        var amt = extractAmount(line);
        if (wxMatch && amt) {
            var wxDate = parseDateStr(wxMatch[1]);
            var wxType = '支出';
            if (line.indexOf('收入') !== -1 || line.indexOf('+') !== -1 || (line.indexOf('-') === -1 && amt > 0)) {
                wxType = '收入';
            } else if (line.indexOf('支出') !== -1 || line.indexOf('-') !== -1) {
                wxType = '支出';
            }
            var note = line.replace(wxMatch[0], '').replace(/[¥￥]\s*[\d,.]+/g, '').replace(/[+-]\s*/g, '').trim();
            if (!note) note = sourceName + '导入';
            bills.push({
                date: wxDate,
                type: wxType,
                amount: Math.abs(amt),
                note: note,
            });
            continue;
        }

        // 策略3: 简单金额行
        if (amt && !isNaN(amt)) {
            var note3 = line.replace(/[¥￥]\s*[\d,.]+/g, '').replace(/[+-]\s*/g, '').trim();
            bills.push({
                date: new Date().toISOString().split('T')[0],
                type: amt < 0 ? '支出' : '收入',
                amount: Math.abs(amt),
                note: note3 || (sourceName + '导入'),
            });
        }
    }

    if (bills.length === 0) {
        showToast('未能解析到账单数据，请检查格式', 'error');
        return;
    }

    // 预览
    showPreview(bills, userId);
}

function parseDateStr(str) {
    if (!str) return null;
    str = str.trim();
    // 2024-01-15 / 2024/01/15 / 2024.01.15
    var m = str.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    // 1月15日 / 01-15
    m = str.match(/(\d{1,2})[月\-](\d{1,2})[日]?/);
    if (m) {
        var now = new Date();
        return now.getFullYear() + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
    }
    return null;
}

function extractAmount(text) {
    if (!text) return null;
    // 修正OCR常见错误
    text = fixOCRCommonErrors(text);
    // 匹配带符号的金额：-396.00, +250.00, ¥396.00, 396.00
    var m = text.match(/[+\-]?\s*[¥￥]?\s*([\d,]+(?:\s+[\d,]+)*)(?:\.(\d{1,2}))?/);
    if (m) {
        var numStr = m[1].replace(/[\s,]/g, '');
        var dec = m[2] || '00';
        var val = parseFloat(numStr + '.' + dec);
        var fullMatch = m[0];
        if (fullMatch.trim().startsWith('-') || text.indexOf('支出') !== -1) {
            return -Math.abs(val);
        }
        return val;
    }
    return null;
}

function fixOCRCommonErrors(text) {
    if (!text) return text;
    // 合并被空格分割的数字
    text = text.replace(/(\d)\s+(\d{3})([\.\s]\d{2}\b)/g, '$1$2$3');
    text = text.replace(/(\d)\s+(\d)(\d{2})([\.\s]\d{2}\b)/g, '$1$2$3$4');
    // 修正常见OCR混淆
    text = text.replace(/[oO]/g, '0').replace(/[lI]/g, '1').replace(/[sS]/g, '5');
    return text;
}

// ===== Excel 智能解析 =====
function parseExcelRows(rows, sourceName, userId) {
    if (!rows || !Array.isArray(rows)) { showToast('Excel读取异常', 'error'); return; }
    var cleanRows = rows.filter(function(r) {
        return Array.isArray(r) && r.some(function(c) { return c !== '' && c !== null && c !== undefined; });
    });
    if (cleanRows.length === 0) { showToast('Excel中没有有效数据', 'error'); return; }
    window._previewUserId = userId;

    var headerIdx = 0;
    var headers = [];
    for (var i = 0; i < Math.min(cleanRows.length, 20); i++) {
        var rowText = cleanRows[i].join(' ').replace(/\s+/g, '');
        if (/日期|时间|备注|类型|金额|收入|支出|进出|方向|收支|说明|摘要|交易|类别|分类/i.test(rowText)) {
            headerIdx = i;
            headers = cleanRows[i].map(function(c) { return String(c).trim(); });
            break;
        }
    }

    if (headers.length === 0) {
        parseExcelAsSimple(cleanRows, sourceName);
        return;
    }

    var colMap = { dateCol: -1, noteCol: -1, amountCol: -1, incomeCol: -1, expenseCol: -1, typeCol: -1 };

    headers.forEach(function(h, idx) {
        var hLower = h.toLowerCase();
        if (colMap.dateCol === -1 && /日期|时间|date|time/i.test(hLower)) colMap.dateCol = idx;
        if (colMap.noteCol === -1 && /备注|说明|摘要|交易|商户|类别|分类|note|desc|memo|remark/i.test(hLower)) colMap.noteCol = idx;
        if (colMap.amountCol === -1 && /^金额$|^余额$|^发生额$/i.test(hLower)) colMap.amountCol = idx;
        if (colMap.incomeCol === -1 && /^收(?:入|进|账)?(?:\s*[（(].*?[）)])?$|^进账$|^入账$|^income$/i.test(hLower)) colMap.incomeCol = idx;
        if (colMap.expenseCol === -1 && /^支(?:出|付)?(?:\s*[（(].*?[）)])?$|^出账$|^付款$|^消费$|^expense$/i.test(hLower)) colMap.expenseCol = idx;
        if (colMap.typeCol === -1 && /^类型$|^方向$|^收支$|^进出$/i.test(hLower)) colMap.typeCol = idx;
    });

    // 宽松匹配补漏
    headers.forEach(function(h, idx) {
        if (colMap.amountCol === -1 && /金额|amount/i.test(h)) colMap.amountCol = idx;
        if (colMap.incomeCol === -1 && /收|入账|进账|income/i.test(h)) colMap.incomeCol = idx;
        if (colMap.expenseCol === -1 && /支|出账|付款|消费|expense/i.test(h)) colMap.expenseCol = idx;
        if (colMap.noteCol === -1 && /备注|说明|摘要|交易|商户|类别|分类|note|desc/i.test(h)) colMap.noteCol = idx;
    });

    // 补充备注列
    if (colMap.noteCol === -1) {
        for (var j = 0; j < headers.length; j++) {
            if (j !== colMap.dateCol && j !== colMap.amountCol && j !== colMap.incomeCol && 
                j !== colMap.expenseCol && j !== colMap.typeCol) {
                colMap.noteCol = j;
                break;
            }
        }
    }

    var isSeparateMode = (colMap.incomeCol !== -1 || colMap.expenseCol !== -1);

    if (isSeparateMode) {
        parseExcelSeparateMode(cleanRows, headerIdx, colMap, sourceName);
    } else if (colMap.typeCol !== -1 && colMap.amountCol !== -1) {
        parseExcelTypeMode(cleanRows, headerIdx, colMap, sourceName);
    } else if (colMap.amountCol !== -1) {
        parseExcelSingleAmountMode(cleanRows, headerIdx, colMap, sourceName);
    } else {
        var amountGuess = findAmountColumn(cleanRows, headerIdx, headers, colMap);
        if (amountGuess !== -1) {
            colMap.amountCol = amountGuess;
            parseExcelSingleAmountMode(cleanRows, headerIdx, colMap, sourceName);
        } else {
            var csvText = rows.map(function(r) { return r.join(','); }).join('\n');
            parseTextContent(csvText, sourceName);
        }
    }
}

function findAmountColumn(rows, headerIdx, headers, colMap) {
    var bestCol = -1, bestScore = 0, dataStart = headerIdx + 1;
    for (var c = 0; c < headers.length; c++) {
        // 避免把日期/类型列识别成金额列
        if (c === colMap.dateCol || c === colMap.typeCol) continue;
        var numCount = 0;
        for (var r = dataStart; r < Math.min(dataStart + 50, rows.length); r++) {
            var val = String(rows[r] && rows[r][c] !== undefined ? rows[r][c] : '').trim();
            if (/^[+-]?\s*[\d,]+(?:\.\d{1,2})?$/.test(val) && parseFloat(val.replace(/[,~\s]/g, '')) > 0) {
                numCount++;
            }
        }
        if (numCount > bestScore) { bestScore = numCount; bestCol = c; }
    }
    return bestScore >= 2 ? bestCol : -1;
}

function parseExcelSeparateMode(rows, headerIdx, colMap, sourceName) {
    var results = [];
    var today = new Date().toISOString().slice(0, 10);
    for (var i = headerIdx + 1; i < rows.length; i++) {
        var row = rows[i];
        if (!row || row.length === 0) continue;

        var date = today;
        if (colMap.dateCol !== -1 && row[colMap.dateCol]) date = parseExcelDate(row[colMap.dateCol]);

        var note = '';
        if (colMap.noteCol !== -1 && row[colMap.noteCol]) note = String(row[colMap.noteCol]).trim();

        if (colMap.incomeCol !== -1 && row[colMap.incomeCol]) {
            var incomeVal = parseExcelAmount(row[colMap.incomeCol]);
            if (incomeVal > 0) {
                if (!note) note = 'OCR识别';
                results.push({ date: date, type: '收入', amount: incomeVal, note: note, source: sourceName });
            }
        }
        if (colMap.expenseCol !== -1 && row[colMap.expenseCol]) {
            var expenseVal = parseExcelAmount(row[colMap.expenseCol]);
            if (expenseVal > 0) {
                if (!note) note = 'OCR识别';
                results.push({ date: date, type: '支出', amount: expenseVal, note: note, source: sourceName });
            }
        }
        // 如果既能分列但收入列不存在时，回退金额列 = 支出
        if (colMap.incomeCol === -1 && colMap.expenseCol === -1 && colMap.amountCol !== -1 && row[colMap.amountCol]) {
            var amtVal = parseExcelAmount(row[colMap.amountCol]);
            if (amtVal > 0) {
                if (!note) note = 'OCR识别';
                results.push({ date: date, type: '支出', amount: amtVal, note: note, source: sourceName });
            }
        }
    }
    if (results.length === 0) {
        showToast('未能从Excel中解析到账单数据，请检查表格格式', 'error');
    } else {
        pendingBills = results;
        showPreview(results, window._previewUserId);
    }
}

function parseExcelTypeMode(rows, headerIdx, colMap, sourceName) {
    var results = [];
    var today = new Date().toISOString().slice(0, 10);
    for (var i = headerIdx + 1; i < rows.length; i++) {
        var row = rows[i];
        if (!row || row.length === 0) continue;

        var typeStr = String(row[colMap.typeCol] || '').trim();
        var amtStr = String(row[colMap.amountCol] || '').trim();
        var amtVal = parseExcelAmount(amtStr);
        if (amtVal <= 0) continue;

        var billType = '支出';
        var noteForInfer = (colMap.noteCol !== -1 && row[colMap.noteCol]) ? String(row[colMap.noteCol]) : '';
        if (/收|入|进|存|工资|退款/i.test(typeStr)) billType = '收入';
        else if (/支|出|付|消费|购买/i.test(typeStr)) billType = '支出';
        else if (/^\+/.test(amtStr)) billType = '收入';
        else if (/^\-/.test(amtStr)) billType = '支出';
        // 类型列为空时，根据备注关键词推断
        else if (/来自|收款|入账|退款|工资|奖金|红包|利息/i.test(noteForInfer)) billType = '收入';

        var date = today;
        if (colMap.dateCol !== -1 && row[colMap.dateCol]) date = parseExcelDate(row[colMap.dateCol]);

        var note = '';
        if (colMap.noteCol !== -1 && row[colMap.noteCol]) note = String(row[colMap.noteCol]).trim();
        if (!note) note = 'OCR识别';

        results.push({ date: date, type: billType, amount: amtVal, note: note, source: sourceName });
    }
    if (results.length === 0) showToast('未能从Excel中解析到账单数据', 'error');
    else { pendingBills = results; showPreview(results, window._previewUserId); }
}

function parseExcelSingleAmountMode(rows, headerIdx, colMap, sourceName) {
    var results = [];
    var today = new Date().toISOString().slice(0, 10);
    for (var i = headerIdx + 1; i < rows.length; i++) {
        var row = rows[i];
        if (!row || row.length === 0) continue;

        var amtStr = String(row[colMap.amountCol] || '').trim();
        if (/^(收入|支出|合计|总计)/.test(amtStr)) continue;

        var isNegative = /^\-/.test(amtStr);
        var isPositive = /^\+/.test(amtStr);
        var amtVal = parseExcelAmount(amtStr);
        if (amtVal <= 0) continue;

        var billType = isNegative ? '支出' : (isPositive ? '收入' : '支出');

        var date = today;
        if (colMap.dateCol !== -1 && row[colMap.dateCol]) date = parseExcelDate(row[colMap.dateCol]);

        var note = '';
        if (colMap.noteCol !== -1 && row[colMap.noteCol]) note = String(row[colMap.noteCol]).trim();
        if (!note) note = 'OCR识别';

        results.push({ date: date, type: billType, amount: amtVal, note: note, source: sourceName });
    }
    if (results.length === 0) showToast('未能从Excel中解析到账单数据', 'error');
    else { pendingBills = results; showPreview(results, window._previewUserId); }
}

function parseExcelAsSimple(rows, sourceName) {
    var textLines = [];
    for (var i = 0; i < rows.length; i++) {
        var line = rows[i].map(function(c) { return String(c).trim(); }).join(' ');
        if (line) textLines.push(line);
    }
    parseTextContent(textLines.join('\n'), sourceName);
}

function parseExcelAmount(val) {
    var s = String(val).trim().replace(/[~～]/g, '-').replace(/[\s,，]/g, '').replace(/[¥￥]/g, '');
    var m = s.match(/[-+]?\d+(?:\.\d{1,2})?/);
    return m ? Math.abs(parseFloat(m[0])) : 0;
}

function parseExcelDate(val) {
    var s = String(val).trim();
    // Excel序列号（5位数字）
    if (/^\d{4,5}$/.test(s)) {
        var serial = parseInt(s);
        if (serial > 30000) {
            var d = new Date((serial - 25569) * 86400 * 1000);
            return d.toISOString().slice(0, 10);
        }
    }
    // yyyy-mm-dd / yyyy/mm/dd / yyyy.mm.dd
    var m1 = s.match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    if (m1) return m1[1] + '-' + m1[2].padStart(2,'0') + '-' + m1[3].padStart(2,'0');
    // mm/dd/yyyy
    var m2 = s.match(/(\d{1,2})[\/](\d{1,2})[\/](\d{4})/);
    if (m2) return m2[3] + '-' + m2[1].padStart(2,'0') + '-' + m2[2].padStart(2,'0');
    return new Date().toISOString().slice(0, 10);
}

// ==================== 重复数据检测 ====================
function checkDuplicates(bills, userId) {
    // 对每条待导入账单，检查是否与已有数据重复
    // 判定标准：同一账单户 + 同一日期 + 同一类型 + 金额相同(容差0.01) + 备注相似
    var existing = APP_DATA.bills;
    return bills.map(function(bill) {
        var dup = existing.find(function(ex) {
            if (ex.date !== bill.date) return false;
            if (ex.type !== bill.type) return false;
            if (Math.abs((ex.amount || 0) - (bill.amount || 0)) > 0.01) return false;
            // 备注：完全相同 或 一方包含另一方
            var n1 = (ex.note || '').trim();
            var n2 = (bill.note || '').trim();
            if (n1 && n2 && n1 !== n2) {
                if (n1.indexOf(n2) === -1 && n2.indexOf(n1) === -1) return false;
            }
            return true;
        });
        return {
            isDuplicate: !!dup,
            matchedId: dup ? dup.id : null,
            matchedNote: dup ? (dup.note || '') : ''
        };
    });
}

// ==================== 预览与确认导入 ====================
function showPreview(bills, userId) {
    window._previewBills = bills;
    window._previewUserId = userId;
    
    // 检测重复
    var dupResults = checkDuplicates(bills, userId);
    window._dupResults = dupResults;
    var dupCount = dupResults.filter(function(d) { return d.isDuplicate; }).length;
    
    document.getElementById('previewCount').textContent = bills.length;
    document.getElementById('previewArea').style.display = 'block';
    
    // 显示/隐藏重复警告
    var dupBar = document.getElementById('dupWarningBar');
    var dupBadge = document.getElementById('dupCountBadge');
    var removeDupBtn = document.getElementById('removeDupBtn');
    if (dupCount > 0) {
        dupBar.style.display = 'flex';
        dupBadge.textContent = dupCount;
        removeDupBtn.style.display = '';
    } else {
        dupBar.style.display = 'none';
    }

    var tbody = document.getElementById('previewTbody');
    var html = '';
    bills.forEach(function(b, idx) {
        var isDup = dupResults[idx] && dupResults[idx].isDuplicate;
        var dupClass = isDup ? ' dup-row' : '';
        var dupIcon = isDup ? ' <span class="dup-icon" title="与已有记录重复：' + escapeHtml(dupResults[idx].matchedNote) + '">⚠️重复</span>' : '';
        var amountClass = b.type === '收入' ? 'amount-income' : (b.type === '结余' ? 'amount-balance' : 'amount-expense');
        html += '<tr class="' + dupClass + '">' +
            '<td><input type="date" class="preview-date-input" value="' + b.date + '" data-idx="' + idx + '" onchange="updatePreviewDate(' + idx + ', this.value);recheckDuplicates();"></td>' +
            '<td><select class="preview-type-select" onchange="updatePreviewType(' + idx + ', this.value);recheckDuplicates();">' +
            '<option value="支出"' + (b.type === '支出' ? ' selected' : '') + '>支出</option>' +
            '<option value="收入"' + (b.type === '收入' ? ' selected' : '') + '>收入</option>' +
            '<option value="结余"' + (b.type === '结余' ? ' selected' : '') + '>结余</option>' +
            '</select></td>' +
            '<td><input type="number" step="0.01" class="preview-amount-input" value="' + b.amount + '" onchange="updatePreviewAmount(' + idx + ', this.value);recheckDuplicates();"></td>' +
            '<td><input type="text" class="preview-note-input" value="' + (b.note || '') + '" data-idx="' + idx + '" onchange="updatePreviewNote(' + idx + ', this.value);recheckDuplicates();">' + dupIcon + '</td>' +
            '<td><button class="btn-del-row" onclick="deletePreviewRow(' + idx + ')" title="删除此行" style="background:none;border:none;cursor:pointer;font-size:18px;padding:4px 8px;color:#999;border-radius:4px;">&times;</button></td>' +
            '</tr>';
    });
    tbody.innerHTML = html;
    document.getElementById('confirmImportBtn').disabled = false;
}

function recheckDuplicates() {
    if (!window._previewBills || !window._previewUserId) return;
    var results = checkDuplicates(window._previewBills, window._previewUserId);
    window._dupResults = results;
    var dupCount = results.filter(function(d) { return d.isDuplicate; }).length;
    
    // 更新行样式
    var rows = document.querySelectorAll('#previewTbody tr');
    rows.forEach(function(row, idx) {
        if (results[idx] && results[idx].isDuplicate) {
            row.classList.add('dup-row');
        } else {
            row.classList.remove('dup-row');
        }
        // 更新重复图标
        var noteCell = row.querySelector('td:nth-child(4)');
        if (noteCell) {
            var existingIcon = noteCell.querySelector('.dup-icon');
            if (results[idx] && results[idx].isDuplicate) {
                if (!existingIcon) {
                    noteCell.innerHTML = noteCell.innerHTML.replace(/<\/input>/, '</input> <span class="dup-icon" title="与已有记录重复：' + escapeHtml(results[idx].matchedNote) + '">⚠️重复</span>');
                } else {
                    existingIcon.title = '与已有记录重复：' + escapeHtml(results[idx].matchedNote);
                }
            } else if (existingIcon) {
                existingIcon.remove();
            }
        }
    });
    
    var dupBar = document.getElementById('dupWarningBar');
    var dupBadge = document.getElementById('dupCountBadge');
    var removeDupBtn = document.getElementById('removeDupBtn');
    if (dupCount > 0) {
        dupBar.style.display = 'flex';
        dupBadge.textContent = dupCount;
        removeDupBtn.style.display = '';
    } else {
        dupBar.style.display = 'none';
    }
}

function removeDuplicates() {
    if (!window._previewBills || !window._dupResults) return;
    var newBills = [];
    window._previewBills.forEach(function(b, idx) {
        if (!window._dupResults[idx] || !window._dupResults[idx].isDuplicate) {
            newBills.push(b);
        }
    });
    if (newBills.length === 0) {
        showToast('所有行均为重复数据，已全部移除', 'info');
        document.getElementById('previewArea').style.display = 'none';
        document.getElementById('confirmImportBtn').disabled = true;
        window._previewBills = [];
        window._dupResults = [];
        return;
    }
    var removedCount = window._previewBills.length - newBills.length;
    window._previewBills = newBills;
    showPreview(newBills, window._previewUserId);
    showToast('已移除 ' + removedCount + ' 条重复数据', 'success');
}

function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function updatePreviewDate(idx, val) {
    if (window._previewBills && window._previewBills[idx]) {
        window._previewBills[idx].date = val;
    }
}

function updatePreviewNote(idx, val) {
    if (window._previewBills && window._previewBills[idx]) {
        window._previewBills[idx].note = val;
    }
}

function updatePreviewAmount(idx, val) {
    var amt = parseFloat(val);
    if (!isNaN(amt) && amt >= 0 && window._previewBills && window._previewBills[idx]) {
        window._previewBills[idx].amount = amt;
    }
}

function updatePreviewType(idx, val) {
    if (window._previewBills && window._previewBills[idx]) {
        window._previewBills[idx].type = val;
    }
}

function deletePreviewRow(idx) {
    if (!window._previewBills) return;
    window._previewBills.splice(idx, 1);
    if (window._previewBills.length === 0) {
        document.getElementById('previewArea').style.display = 'none';
        document.getElementById('confirmImportBtn').disabled = true;
        toggleModal('previewModal', false);
        showToast('已删除全部行', 'info');
        return;
    }
    showPreview(window._previewBills, window._previewUserId);
}

function confirmImport() {
    var userId = window._previewUserId;
    var bills = window._previewBills;
    var dupResults = window._dupResults || [];
    if (!userId || !bills || bills.length === 0) {
        showToast('没有可导入的数据', 'error');
        return;
    }

    var count = 0;
    var skipCount = 0;
    bills.forEach(function(b, idx) {
        if (!b.date) b.date = new Date().toISOString().split('T')[0];
        // 跳过重复数据
        if (dupResults[idx] && dupResults[idx].isDuplicate) {
            skipCount++;
            return;
        }
        APP_DATA.bills.push({
            id: generateId('bill'),
            userId: userId,
            date: b.date,
            type: b.type || '支出',
            amount: b.amount || 0,
            note: b.note || '',
            source: '导入',
            createdAt: Date.now()
        });
        count++;
    });
    saveData();
    closeImportModal();
    
    var msg = '成功导入 ' + count + ' 条记录';
    if (skipCount > 0) {
        msg += '，已自动跳过 ' + skipCount + ' 条重复数据';
    }
    showToast(msg, 'success');
    renderHomeView();
}

// ==================== 拍照功能 ====================
function openCamera() {
    // 移动端优先使用原生相机（file input + capture，兼容性最好）
    if (window.innerWidth <= 768) {
        var cameraInput = document.getElementById('cameraInput');
        if (cameraInput) {
            cameraInput.click();
            return;
        }
        // 降级：全屏拍照
        openFullscreenCamera();
        return;
    }
    // PC端使用弹窗内拍照
    var video = document.getElementById('cameraVideo');
    document.getElementById('cameraContainer').style.display = 'block';
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(function(stream) {
        video.srcObject = stream;
        video.play().catch(function() {});
        window._cameraStream = stream;
    }).catch(function(err) {
        showToast('无法打开摄像头：' + err.message, 'error');
    });
}

function closeCamera() {
    var video = document.getElementById('cameraVideo');
    if (window._cameraStream) {
        window._cameraStream.getTracks().forEach(function(t) { t.stop(); });
        window._cameraStream = null;
    }
    video.srcObject = null;
    document.getElementById('cameraContainer').style.display = 'none';
}

function capturePhoto() {
    var video = document.getElementById('cameraVideo');
    var canvas = document.getElementById('cameraCanvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(function(blob) {
        closeCamera();
        processImageOCR(blob);
    }, 'image/jpeg', 0.9);
}

// 全屏拍照（移动端）
function openFullscreenCamera() {
    var fsCam = document.getElementById('fullscreenCamera');
    var video = document.getElementById('fsCameraVideo');
    fsCam.style.display = 'block';
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(function(stream) {
        video.srcObject = stream;
        video.play().catch(function() {});
        window._fsCameraStream = stream;
    }).catch(function(err) {
        showToast('无法打开摄像头：' + err.message, 'error');
        fsCam.style.display = 'none';
    });
}

function closeFullscreenCamera() {
    var video = document.getElementById('fsCameraVideo');
    if (window._fsCameraStream) {
        window._fsCameraStream.getTracks().forEach(function(t) { t.stop(); });
        window._fsCameraStream = null;
    }
    video.srcObject = null;
    document.getElementById('fullscreenCamera').style.display = 'none';
}

function captureFullscreenPhoto() {
    var video = document.getElementById('fsCameraVideo');
    var canvas = document.getElementById('fsCameraCanvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(function(blob) {
        closeFullscreenCamera();
        processImageOCR(blob);
    }, 'image/jpeg', 0.9);
}

function handleCameraCapture(input) {
    var file = (input && input.files) ? input.files[0] : null;
    if (file) { processImageOCR(file); }
}

// ==================== OCR 截图识别 ====================
function preprocessImage(file) {
    return new Promise(function(resolve, reject) {
        var img = new Image();
        img.onload = function() {
            var MAX_DIM = 2000; // 限制最大尺寸，防止大图OOM
            var origW = img.width, origH = img.height;
            var scale = 2;
            // 如果缩放后超过最大尺寸，进一步降低 scale
            if (Math.max(origW, origH) * scale > MAX_DIM) {
                scale = MAX_DIM / Math.max(origW, origH);
            }
            var canvas = document.createElement('canvas');
            canvas.width = Math.floor(origW * scale);
            canvas.height = Math.floor(origH * scale);
            var ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            var data = imageData.data;

            for (var i = 0; i < data.length; i += 4) {
                var r = data[i], g = data[i + 1], b = data[i + 2];
                var isYellowish = r > 180 && g > 130 && b < 130 && (r - b) > 60 && (g - b) > 30;
                var isDark = r < 100 && g < 100 && b < 100;
                if (isYellowish) {
                    data[i] = 0; data[i + 1] = 0; data[i + 2] = 0;
                } else if (isDark) {
                    var val = 255 - Math.min(255, ((255 - r) + (255 - g) + (255 - b)) / 3 * 2.2);
                    data[i] = val; data[i + 1] = val; data[i + 2] = val;
                } else {
                    var gray = 0.299 * r + 0.587 * g + 0.114 * b;
                    var adjusted = (gray - 128) * 1.5 + 128;
                    var val = Math.max(0, Math.min(255, adjusted));
                    data[i] = val; data[i + 1] = val; data[i + 2] = val;
                }
            }
            ctx.putImageData(imageData, 0, 0);
            resolve(canvas);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

function processImageOCR(file) {
    var userId = document.getElementById('importUser').value;
    if (!userId) { showToast('请先选择账单户', 'error'); return; }

    // 新图上传时自动清除旧的框选
    window._currentOCRFile = file;
    clearAllBoxes();

    // 显示图片预览
    var previewDiv = document.getElementById('imagePreview');
    var previewImg = document.getElementById('previewImage');
    previewImg.onload = function() {
        initBoxCanvas();
    };
    previewImg.src = URL.createObjectURL(file);
    previewDiv.style.display = 'block';

    // 显示进度
    var progressDiv = document.getElementById('ocrProgress');
    var progressText = document.getElementById('ocrProgressText');
    progressDiv.style.display = 'flex';
    progressText.textContent = '正在识别截图中的账单信息...';

    // 先预处理图像
    preprocessImage(file).then(function(processedCanvas) {
        var dataUrl = processedCanvas.toDataURL('image/png');

        // 使用Tesseract进行OCR
        Tesseract.recognize(dataUrl, 'chi_sim+eng', {
            tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
            logger: function(info) {
                if (info.status === 'recognizing text') {
                    var pct = Math.round(info.progress * 100);
                    progressText.textContent = '正在识别... ' + pct + '%';
                }
            }
        }).then(function(result) {
            progressDiv.style.display = 'none';
            var text = result.data.text;
            // 解析OCR文本
            parseOCRText(text, userId);
        }).catch(function(err) {
            progressDiv.style.display = 'none';
            showToast('OCR识别失败：' + err.message, 'error');
        });
    }).catch(function(err) {
        progressDiv.style.display = 'none';
        showToast('图片处理失败：' + err.message, 'error');
    });
}

// ==================== 截图类型检测 ====================
// 根据OCR文本特征自动判断截图类型，优先级从高到低
// 关键：Tesseract 常在中文间插入空格，需先归一化再匹配关键词
function detectScreenshotType(text, lines) {
    var txt = text || '';
    // 去除所有空格，用于中文关键词匹配
    var tns = txt.replace(/\s+/g, '');
    var features = {};

    // 微信账单列表：必须有"全部账单"/"查找交易"/"收支统计"等特有字段
    features.wechatBill = (
        /全部账单|查找交易|收支统计/.test(tns) ||
        /微信账单/.test(tns)
    );
    // 微信账单列表的强特征：多行有 +¥ 或 -¥ 形式（排除账户明细）
    if (!features.wechatBill) {
        var isBalanceDetail = /尾号/.test(tns) && !/微信/.test(tns);
        if (!isBalanceDetail) {
            var plusMinusCount = 0;
            for (var j = 0; j < lines.length; j++) {
                if (/[+-]\s*¥?\d/.test(lines[j])) plusMinusCount++;
            }
            features.wechatBill = plusMinusCount >= 2 && /微信|转账|消费|商户/.test(tns);
        }
    }

    // 支付宝账单列表特征
    features.alipayBill = (
        /支付宝/.test(tns) && (
            /账单|交易记录|收支明细/.test(tns) ||
            /20\d{2}\s*年\s*\d{1,2}\s*月/.test(txt) ||
            /支出\s*\d|收入\s*\d/.test(txt)
        )
    );
    // 支付宝多行+/-金额 + 显式标题
    if (!features.alipayBill) {
        var aliCount = 0;
        for (var k = 0; k < lines.length; k++) {
            if (/[+-]\s*¥?\d/.test(lines[k])) aliCount++;
        }
        features.alipayBill = aliCount >= 2 && /支付宝/.test(tns);
    }
    // 兜底：支付宝账单列表模式（无"支付宝"标题时，通过列表结构识别）
    if (!features.alipayBill && !features.wechatBill) {
        var aliCategoryCount = 0, aliDateTimeCount = 0, aliSignedAmountCount = 0;
        for (var k = 0; k < lines.length; k++) {
            var lineK = lines[k];
            if (/家居家装|餐饮美食|交通出行|购物消费|休闲娱乐|教育培训|医疗健康|生活缴费|通讯服务|服饰美容|运动健身|酒店旅游|其他/.test(lineK)) aliCategoryCount++;
            if (/\d{2}-\d{2}\s+\d{2}:\d{2}/.test(lineK)) aliDateTimeCount++;
            if (/[+-]\s*[¥￥]?\s*[\d,]+\.\d{2}/.test(lineK)) aliSignedAmountCount++;
        }
        // 至少2个带符号金额 + 至少1个分类标签 + 至少1个日期时间 = 支付宝账单列表
        if (aliSignedAmountCount >= 2 && aliCategoryCount >= 1 && aliDateTimeCount >= 1) {
            features.alipayBill = true;
        }
    }

    // 微信单笔转账/收款截图：转账-来自、微信转账+转账时间/收款时间、已转入零钱通+带符号金额
    features.wechatTransfer = (
        /转账[-—]?来自/.test(tns) ||
        (/微信转账/.test(tns) && /转账时间|收款时间|已转入零钱通/.test(tns)) ||
        (/已转入零钱通|已收款|已到账/.test(tns) && /[+-]\s*[\d,]+\.\d{2}/.test(txt))
    );

    // 单笔支付/收款详情：支付成功、付款金额等
    features.singlePayment = (
        /支付成功|付款成功|转账成功|交易成功/.test(tns) ||
        /付款金额|支付金额|交易金额|转账金额/.test(tns) ||
        (/付款方|收款方|对方/.test(tns) && /金额/.test(tns)) ||
        (/向.*转账|给.*转账/.test(tns) && extractAmountCount(tns) >= 1)
    );

    // 银行流水/账户明细特征：包含"银行"关键词，或包含"余额"+"尾号"+多行加减金额
    features.bankStatement = (
        /银行/.test(tns) && (
            /流水|交易明细|账户明细/.test(tns) ||
            /账号|卡号/.test(tns) ||
            /借方|贷方/.test(tns) ||
            /余额/.test(tns)
        )
    );
    // 微信/支付宝/第三方账户明细：带余额或尾号 + 多行加减金额
    if (!features.bankStatement) {
        var hasBalanceOrTail = /余额/.test(tns) || /尾号/.test(tns);
        var multiSignAmounts = 0;
        for (var b = 0; b < lines.length; b++) {
            var lb = lines[b].trim();
            if (/尾号/.test(lb)) continue;
            if (/[+-]\s*[¥￥]?\s*[\d,]+\.\d{2}/.test(lb)) multiSignAmounts++;
            else if (/[¥￥]\s*[\d,]+\.\d{2}/.test(lb)) multiSignAmounts++;
        }
        features.bankStatement = hasBalanceOrTail && multiSignAmounts >= 2;
    }

    // 客户付款截图特征
    features.customerPayment = (
        /付款/.test(tns) && /收款/.test(tns) && (
            /户名|姓名|账户|卡号/.test(tns) ||
            /到账|成功|已转/.test(tns)
        )
    );

    // 输出特征检测结果到控制台（方便调试点问题）
    console.log('[OCR检测] 特征匹配结果:', JSON.stringify({
        wechatBill: features.wechatBill,
        alipayBill: features.alipayBill,
        bankStatement: features.bankStatement,
        wechatTransfer: features.wechatTransfer,
        singlePayment: features.singlePayment,
        customerPayment: features.customerPayment,
        generic: true
    }));

    // 判断优先级：账单列表 > 银行流水 > 微信单笔转账 > 单笔支付 > 客户付款 > 通用
    if (features.wechatBill) return 'wechatBill';
    if (features.alipayBill) return 'alipayBill';
    if (features.bankStatement) return 'bankStatement';
    if (features.wechatTransfer) return 'wechatTransfer';
    if (features.singlePayment) return 'singlePayment';
    if (features.customerPayment) return 'customerPayment';
    return 'generic';
}

// 统计文本中可识别的金额数量
function extractAmountCount(text) {
    var matches = text.match(/[¥￥]\s*[\d,]+(?:\.\d{1,2})?/g) || [];
    matches = matches.concat(text.match(/\d[\d,]*\.\d{2}/g) || []);
    return matches.length;
}

// 将 OCR 误识别的金额字符串归一化为标准数字
// 例如：4.068.94 (OCR 把千分位逗号识别成点) → 4068.94
//       Y8,.461.07 (OCR 混用符号) → 8461.07
function normalizeOcrAmount(amountStr) {
    if (!amountStr) return '';
    var s = amountStr.replace(/[¥￥Y\s]/g, '').replace(/,/g, '');
    var dots = s.match(/\./g);
    if (dots && dots.length >= 2) {
        var parts = s.split('.');
        var decimal = parts.pop();
        var integer = parts.join('');
        return integer + '.' + decimal;
    }
    return s;
}

// ==================== 各类型独立解析器 ====================

// 解析器1：微信账单列表（保持原有完美逻辑不变）
function parseWeChatBill(lines, today, currentYear) {
    var bills = [];
    // 找到表头位置
    var headerEnd = -1;
    for (var i = 0; i < lines.length; i++) {
        if (/全部账单|查找交易|收支统计|账单/.test(lines[i]) || /20\d{2,5}\s*年\s*\d{1,2}\s*月/.test(lines[i])) {
            headerEnd = Math.max(headerEnd, i);
        }
    }

    for (var i = headerEnd + 1; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line || line.length < 3) continue;

        // Tesseract 常把负号识别成波浪号，先还原
        line = line.replace(/~(?=\s*\d)/g, '-');

        // 跳过顶部汇总行（灰底部分：年月标题 + 支出/收入合计）
        if (/支出.*收入|收入.*支出/.test(line)) continue;
        if (/20\d{2,5}\s*年\s*\d{1,2}\s*月/.test(line) && /[支出收入]/.test(line)) continue;
        if (/^\s*(?:收入|支出|又出|收文|收人|支也|支人|支田)[^\d]*\d/.test(line)) continue;
        if (/收入\s*[¥￥]\s*[\d,]+\.\d{2}/.test(line) && !/[+-]/.test(line)) continue;
        if (/支出\s*[¥￥]\s*[\d,]+\.\d{2}/.test(line) && !/[+-]/.test(line)) continue;

        // 跳过纯噪声行
        if (!/[\u4e00-\u9fa5]/.test(line) && !/转/.test(line) && !/[+-]\s*[\d\s,]+(?:\.\d{1,2})?/.test(line)) continue;

        // 使用行内最后一个金额作为交易金额
        var amounts = line.match(/[+-]?\s*[\d\s,]+(?:\.\d{1,2})?/g);
        if (!amounts || amounts.length === 0) continue;

        var lastAmountStr = amounts[amounts.length - 1].replace(/\s/g, '');
        var amt = parseFloat(lastAmountStr);
        if (isNaN(amt) || Math.abs(amt) < 0.01) continue;

        // 提取备注：最后一个金额前面的内容
        var lastAmountIdx = line.lastIndexOf(amounts[amounts.length - 1]);
        var note = lastAmountIdx > 0 ? line.substring(0, lastAmountIdx) : line;
        note = note.replace(/[.,·]+/g, '')
            .replace(/[，,]/g, '')
            .replace(/\s+/g, '')
            .trim();
        if (!note || !/[\u4e00-\u9fa5]/.test(note)) note = 'OCR识别';

        // 类型判断
        var type = '支出';
        if (lastAmountStr.indexOf('+') !== -1) {
            type = '收入';
        } else if (lastAmountStr.indexOf('-') !== -1) {
            type = '支出';
        } else if (/来自|二维码收款|入账|收款|收入/.test(note)) {
            type = '收入';
        }

        // 日期解析
        var date = today;
        var dateSources = [line];
        if (i + 1 < lines.length) dateSources.push(lines[i + 1]);
        for (var d = 0; d < dateSources.length; d++) {
            var parsed = parseDateStr(dateSources[d]);
            if (parsed) { date = parsed; break; }
        }

        bills.push({
            date: date, type: type, amount: Math.abs(amt), note: note
        });
    }
    return bills;
}

// 解析器2：支付宝账单列表
function parseAlipayBill(lines, today, currentYear) {
    var bills = [];
    // 支付宝账单格式类似微信，每行通常包含 日期+备注+金额（或+/−金额）
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line || line.length < 3) continue;

        // 跳过页眉/汇总行
        if (/支付宝|账单|收支明细|总计|合计/.test(line) && !/\d/.test(line)) continue;
        if (/20\d{2}\s*年\s*\d{1,2}\s*月/.test(line) && /[支出收入]/.test(line)) continue;

        // 还原OCR错误
        line = line.replace(/~(?=\s*\d)/g, '-');

        // 先移除日期/时间，避免把日期分隔符"-"或时间中的数字误识别为金额
        var lineForAmount = line
            .replace(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/g, '')
            .replace(/\d{1,2}-\d{1,2}\s+\d{2}:\d{2}/g, '')
            .replace(/\d{1,2}[月\-/]\d{1,2}/g, '')
            .replace(/\d{1,2}:\d{2}/g, '')
            .trim();

        // 提取金额：查找 ¥xxx.xx 或 +/-xxx.xx 或 纯数字.xx
        var amt = null;
        var type = '支出';

        // 先找带符号的金额（+收入/-支出）
        var signedMatch = lineForAmount.match(/([+-])\s*[¥￥]?\s*([\d,]+(?:\.\d{1,2})?)/);
        if (signedMatch) {
            amt = parseFloat(signedMatch[2].replace(/,/g, ''));
            type = signedMatch[1] === '+' ? '收入' : '支出';
        } else {
            // 没有符号，找 ¥金额
            var yuanMatch = lineForAmount.match(/[¥￥]\s*([\d,]+(?:\.\d{1,2})?)/);
            if (yuanMatch) {
                amt = parseFloat(yuanMatch[1].replace(/,/g, ''));
                type = /收入|入账|退款/.test(lineForAmount) ? '收入' : '支出';
            } else {
                // 最后尝试纯数字金额（至少x.xx格式）
                var numMatch = lineForAmount.match(/([\d,]+\.\d{2})/);
                if (numMatch) {
                    amt = parseFloat(numMatch[1].replace(/,/g, ''));
                    type = /收入|入账|退款/.test(lineForAmount) ? '收入' : '支出';
                }
            }
        }

        if (!amt || isNaN(amt) || Math.abs(amt) < 0.01) continue;

        // 提取日期（当前行、上一行、后续2行都检查，适配"商家+金额/分类/日期"的列表结构）
        var date = today;
        var dateSources = [];
        if (i > 0) dateSources.push(lines[i - 1]);
        dateSources.push(line);
        if (i + 1 < lines.length) dateSources.push(lines[i + 1]);
        if (i + 2 < lines.length) dateSources.push(lines[i + 2]);
        for (var d = 0; d < dateSources.length; d++) {
            var parsedDate = parseDateStr(dateSources[d]);
            if (parsedDate) { date = parsedDate; break; }
        }


        // 提取备注：去掉日期和金额后的内容（从原始行提取，保留商家名）
        var note = line
            .replace(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/g, '')
            .replace(/\d{1,2}-\d{1,2}\s+\d{2}:\d{2}/g, '')
            .replace(/\d{1,2}[月\-/]\d{1,2}/g, '')
            .replace(/\d{1,2}:\d{2}/g, '')
            .replace(/[¥￥]\s*[\d,]+(?:\.\d{1,2})?/g, '')
            .replace(/[+-]\s*[\d,]+(?:\.\d{1,2})?/g, '')
            .replace(/[\d,]+\.\d{2}/g, '')
            .replace(/收入|支出/g, '')
            .replace(/[,，·]/g, '')
            .trim();
        if (!note || note.length < 2) note = 'OCR识别';

        bills.push({
            date: date, type: type, amount: Math.abs(amt), note: note
        });
    }
    return bills;
}


// 解析器3：银行流水/账户明细（支持传统银行流水、微信/支付宝零钱明细等）
function parseBankStatement(lines, today, currentYear) {
    var bills = [];
    if (!lines || lines.length === 0) return bills;

    // 步骤1：收集所有"金额行"索引（排除余额/尾号行，¥可缺失）
    var amountLineIndices = [];
    for (var i = 0; i < lines.length; i++) {
        var l = lines[i].trim();
        if (!l) continue;
        if (/余额/.test(l) || /尾号/.test(l)) continue;
        // 过滤收方/付方/纯金额行（OCR可能把余额拆成独立行）
        if (/^(收|付)\s*方/.test(l)) continue;
        if (/^[¥￥]\s*[\d,]+\.\d{2}$/.test(l)) continue;
        if (/^[收付]\s*方\s*\d+/.test(l)) continue;
        if (/[+-]\s*[¥￥]?\s*[\d,]+\.\d{2}/.test(l)) {
            amountLineIndices.push(i);
        } else if (/[¥￥]\s*[\d,]+\.\d{2}/.test(l)) {
            var stripped = l.replace(/[¥￥]\s*[\d,]+\.\d{2}/g, '').replace(/\s+/g, '').trim();
            if (stripped.length >= 2 && /[\u4e00-\u9fa5a-zA-Z]/.test(stripped)) {
                amountLineIndices.push(i);
            }
        }
    }

    // 步骤2：没有金额行则兜底，按老逻辑逐行解析
    if (amountLineIndices.length === 0) {
        return parseBankStatementLegacy(lines, today, currentYear);
    }

    // 步骤3：以每个金额行为锚点，向上/向下取窗口内内容组成交易块
    for (var a = 0; a < amountLineIndices.length; a++) {
        var idx = amountLineIndices[a];
        var start = Math.max(0, idx - 2); // 向上最多2行
        var end = Math.min(lines.length, idx + 5); // 向下最多4行（不含边界）
        var block = [];
        for (var k = start; k < end; k++) {
            block.push(lines[k].trim());
        }
        var amountLine = lines[idx].trim(); // 真正的金额行
        var amountBlockIdx = idx - start; // 金额行在 block 中的索引

        // 提取金额和类型
        var amt = null;
        var type = '支出';
        var signMatch = amountLine.match(/([+-])\s*[¥￥Y]?\s*([\d\s.,]+\.\d{2})/);
        if (signMatch) {
            amt = parseFloat(normalizeOcrAmount(signMatch[2]));
            type = signMatch[1] === '+' ? '收入' : '支出';
        } else {
            var yuanMatch = amountLine.match(/[¥￥Y]?\s*([\d\s.,]+\.\d{2})/);
            if (yuanMatch) {
                amt = parseFloat(normalizeOcrAmount(yuanMatch[1]));
                type = /收入|存入|转入|贷方/.test(amountLine) ? '收入' : '支出';
            }
        }
        if (!amt || isNaN(amt) || Math.abs(amt) < 0.01) continue;

        // 提取日期：优先在金额行之后查找，找不到再向前找
        var date = today;
        var dateFound = false;
        // 先向后找
        for (var l = amountBlockIdx; l < block.length; l++) {
            var line = block[l];
            var m1 = line.match(/(\d{1,2})[-/.](\d{1,2})\s+\d{1,2}:\d{2}/);
            if (m1) {
                date = currentYear + '-' + m1[1].padStart(2, '0') + '-' + m1[2].padStart(2, '0');
                dateFound = true; break;
            }
            m1 = line.match(/(\d{1,2})[-/.](\d{1,2})/);
            if (m1 && !/\d{1,2}:\d{2}/.test(line)) {
                if (!/[\d,]+\.\d{2}/.test(line)) {
                    date = currentYear + '-' + m1[1].padStart(2, '0') + '-' + m1[2].padStart(2, '0');
                    dateFound = true; break;
                }
            }
            m1 = line.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
            if (m1) {
                date = m1[1] + '-' + m1[2].padStart(2, '0') + '-' + m1[3].padStart(2, '0');
                dateFound = true; break;
            }
        }
        // 向后找不到再向前找
        if (!dateFound) {
            for (var l = amountBlockIdx - 1; l >= 0; l--) {
                var line = block[l];
                var m1 = line.match(/(\d{1,2})[-/.](\d{1,2})\s+\d{1,2}:\d{2}/);
                if (m1) {
                    date = currentYear + '-' + m1[1].padStart(2, '0') + '-' + m1[2].padStart(2, '0');
                    dateFound = true; break;
                }
                m1 = line.match(/(\d{1,2})[-/.](\d{1,2})/);
                if (m1 && !/\d{1,2}:\d{2}/.test(line)) {
                    if (!/[\d,]+\.\d{2}/.test(line)) {
                        date = currentYear + '-' + m1[1].padStart(2, '0') + '-' + m1[2].padStart(2, '0');
                        dateFound = true; break;
                    }
                }
                m1 = line.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
                if (m1) {
                    date = m1[1] + '-' + m1[2].padStart(2, '0') + '-' + m1[3].padStart(2, '0');
                    dateFound = true; break;
                }
            }
        }

        // 辅助行判断（跳过余额、尾号、时间、纯金额、纯数字等）
        function isAuxiliaryLine(line) {
            if (!line) return true;
            if (/^\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2}$/.test(line)) return true;
            if (/^\d{1,2}:\d{2}$/.test(line)) return true;
            if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(line)) return true;
            if (/^[\d\s.,\-:/]+$/.test(line)) return true;
            if (!/[\u4e00-\u9fa5]/.test(line) && !/[a-zA-Z]/.test(line) && /\d/.test(line)) return true;
            if (/余额/.test(line)) return true;
            if (/尾号/.test(line)) return true;
            if (/^[\d\s.,]*$/.test(line)) return true;
            // 含金额格式的行（如 ¥22,080.98、+ 1,345.68）视为辅助行，不参与备注提取
            if (/[\d,]+\.\d{2}/.test(line)) return true;
            return false;
        }

        // 提取备注：金额行之前最近的中文行作为标题，之后最近的中文行作为副标题
        var title = '';
        for (var l = amountBlockIdx - 1; l >= 0; l--) {
            var line = block[l].trim();
            if (!isAuxiliaryLine(line)) {
                title = line;
                break;
            }
        }
        var subtitle = '';
        for (var l = amountBlockIdx + 1; l < block.length; l++) {
            var line = block[l].trim();
            if (!isAuxiliaryLine(line)) {
                // 防止把前一条交易的描述行误当成当前备注（跨交易污染）
                if (line === title) continue;
                subtitle = line;
                break;
            }
        }
        // 优先从金额行本身提取标题（大部分交易的描述和金额在同一行）
        if (!title) {
            var selfTitle = amountLine
                .replace(/[+-]\s*[¥￥]?\s*[\d,]+\.\d{2}/g, '')
                .replace(/[,，·]/g, '')
                .replace(/\s+/g, '')
                .trim();
            if (selfTitle && !/^[\d\s.,¥￥+-]+$/.test(selfTitle) && selfTitle.length >= 2) {
                title = selfTitle;
            }
        }
        // 如果仍为空，用后面的标题兜底
        if (!title && subtitle) {
            title = subtitle;
            subtitle = '';
        }

        // 如果标题还是空，从金额行本身提取（兜底）
        if (!title) {
            title = amountLine
                .replace(/[+-]\s*[¥￥]?\s*[\d,]+\.\d{2}/g, '')
                .replace(/[,，·]/g, '')
                .replace(/\s+/g, '')
                .trim();
            if (title && !/^[\d\s.,¥￥-]+$/.test(title)) {
                // 如果金额行本身没有中文，title 可能为空或只剩符号
            } else {
                title = '';
            }
        }

        var note = title;

        if (subtitle && subtitle !== title) {
            note = title + ' ' + subtitle;
        }
        note = note
            .replace(/[\d,]+\.\d{2}/g, '')
            .replace(/[¥￥]/g, '')
            .replace(/[,，·]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!note || note.length < 2) note = '账户明细';

        bills.push({
            date: date, type: type, amount: Math.abs(amt), note: note
        });
    }
    return bills;
}

// 兼容旧版银行流水解析器（作为无金额行时的兜底）
function parseBankStatementLegacy(lines, today, currentYear) {
    var bills = [];
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line || line.length < 3) continue;
        if (/日期|摘要|借方|贷方|余额|账号|卡号|交易明细|流水/.test(line) && !/\d{4}/.test(line)) continue;

        var date = today;
        var dateMatch = line.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
        if (dateMatch) {
            date = dateMatch[1] + '-' + dateMatch[2].padStart(2, '0') + '-' + dateMatch[3].padStart(2, '0');
        } else {
            dateMatch = line.match(/(\d{1,2})[月\-/](\d{1,2})/);
            if (dateMatch) {
                date = currentYear + '-' + dateMatch[1].padStart(2, '0') + '-' + dateMatch[2].padStart(2, '0');
            }
        }

        var allAmounts = line.match(/[\d,]+\.\d{2}/g);
        if (!allAmounts || allAmounts.length === 0) continue;

        var amountStrs = allAmounts.map(function(a) { return parseFloat(a.replace(/,/g, '')); });
        var amt = null;
        var type = '支出';
        if (amountStrs.length === 1) {
            amt = amountStrs[0];
            type = /贷方|收入|存入|转入/.test(line) ? '收入' : '支出';
        } else if (amountStrs.length >= 2) {
            amt = amountStrs[0];
            if (Math.abs(amt) < 0.01 && amountStrs.length > 1) amt = amountStrs[1];
            type = /贷方|收入|存入|转入/.test(line) ? '收入' : '支出';
        }
        if (!amt || isNaN(amt) || Math.abs(amt) < 0.01) continue;

        var note = line
            .replace(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/g, '')
            .replace(/\d{1,2}[月\-/]\d{1,2}/g, '')
            .replace(/[\d,]+\.\d{2}/g, '')
            .replace(/借方|贷方|余额|支出|收入|存入|转入|转出/g, '')
            .replace(/[,，·]/g, '')
            .trim();
        if (!note || note.length < 2) note = '银行交易';

        bills.push({ date: date, type: type, amount: Math.abs(amt), note: note });
    }
    return bills;
}

// 解析器4：单笔支付/收款详情（微信/支付宝单笔交易截图）
function parseSinglePayment(lines, text, today, currentYear) {
    var bills = [];
    var amt = null;
    var type = '支出'; // 默认
    var date = today;
    var note = '';

    // 方式1：查找 "金额 ¥XXX" 或 "付款金额 ¥XXX" 等模式
    var amountPatterns = [
        /(?:付款|支付|交易|转账|收款|到账)\s*金额[：:\s]*[¥￥]?\s*([\d,]+\.\d{2})/,
        /金额[：:\s]*[¥￥]?\s*([\d,]+\.\d{2})/,
        /[¥￥]\s*([\d,]+\.\d{2})/,
        /([\d,]+\.\d{2})\s*元/,
    ];
    for (var p = 0; p < amountPatterns.length; p++) {
        var m = text.match(amountPatterns[p]);
        if (m) {
            amt = parseFloat(m[1].replace(/,/g, ''));
            break;
        }
    }

    if (!amt || isNaN(amt) || Math.abs(amt) < 0.01) {
        // 降级：查找最大的金额
        var allAmts = text.match(/[\d,]+\.\d{2}/g);
        if (allAmts) {
            var maxAmt = 0;
            for (var a = 0; a < allAmts.length; a++) {
                var val = parseFloat(allAmts[a].replace(/,/g, ''));
                if (val > maxAmt) maxAmt = val;
            }
            amt = maxAmt;
        }
    }

    if (!amt || isNaN(amt) || Math.abs(amt) < 0.01) return bills;

    // 判断类型：收款/到账/入账 → 收入；付款/支付/转账给他人 → 支出
    if (/收款成功|到账|入账|二维码收款|向你转账|转账给你|转入|存入/.test(text)) {
        type = '收入';
    } else if (/付款成功|支付成功|向.*转账|转出|消费/.test(text)) {
        type = '支出';
    } else if (/收款|到账/.test(text)) {
        type = '收入';
    } else {
        type = '支出';
    }

    // 提取日期
    var dateMatch = text.match(/(\d{4})[年\-/.](\d{1,2})[月\-/.](\d{1,2})/);
    if (dateMatch) {
        date = dateMatch[1] + '-' + dateMatch[2].padStart(2, '0') + '-' + dateMatch[3].padStart(2, '0');
    } else {
        dateMatch = text.match(/(\d{1,2})[月\-/](\d{1,2})/);
        if (dateMatch) {
            date = currentYear + '-' + dateMatch[1].padStart(2, '0') + '-' + dateMatch[2].padStart(2, '0');
        }
    }

    // 提取备注（对方名称/用途）
    var notePatterns = [
        /付款方[：:\s]*([^\n]{2,20})/,
        /收款方[：:\s]*([^\n]{2,20})/,
        /对方[：:\s]*([^\n]{2,20})/,
        /商户[：:\s]*([^\n]{2,20})/,
        /商品[：:\s]*([^\n]{2,20})/,
        /备注[：:\s]*([^\n]{2,30})/,
        /用途[：:\s]*([^\n]{2,30})/,
    ];
    for (var n = 0; n < notePatterns.length; n++) {
        var nm = text.match(notePatterns[n]);
        if (nm && nm[1] && nm[1].trim()) {
            note = nm[1].trim().replace(/[\s,，]+/g, '');
            break;
        }
    }
    if (!note) {
        // 尝试提取第一行有意义的中文作为备注
        for (var ln = 0; ln < lines.length; ln++) {
            var l = lines[ln].trim();
            if (/[\u4e00-\u9fa5]{3,}/.test(l) && !/金额|日期|时间|交易|成功/.test(l)) {
                note = l.replace(/[,，·\s]/g, '').substring(0, 20);
                break;
            }
        }
    }
    if (!note) note = (type === '收入' ? '收款' : '付款');

    bills.push({
        date: date, type: type, amount: Math.abs(amt), note: note
    });
    return bills;
}

// 解析器4.5：微信单笔转账/收款详情（如"转账-来自湖南常德 聂新华 +3000.00"）
function parseWeChatTransfer(lines, text, today, currentYear) {
    var bills = [];
    // 关键：Tesseract 常在中文间加空格，用于关键词匹配的部分先归一化
    var tns = text.replace(/\s+/g, '');
    var amt = null;
    var date = today;
    var note = '';
    var type = '收入';

    // 1. 提取金额：微信转账金额行没有空格干扰，直接匹配 "+3000.00"
    var amountMatch = text.match(/([+-])\s*([\d,]+(?:\.\d{1,2})?)/);
    if (amountMatch) {
        amt = parseFloat(amountMatch[2].replace(/,/g, ''));
        var sign = amountMatch[1];
        if (sign === '-') {
            if (/来自|已转入|已收款|已到账|收款/.test(tns)) sign = '+';
        }
        type = sign === '+' ? '收入' : '支出';
    } else {
        var allAmts = text.match(/[\d,]+\.\d{2}/g);
        if (allAmts) {
            var maxAmt = 0;
            for (var a = 0; a < allAmts.length; a++) {
                var val = parseFloat(allAmts[a].replace(/,/g, ''));
                if (val > maxAmt) maxAmt = val;
            }
            amt = maxAmt;
        }
    }

    if (!amt || isNaN(amt) || Math.abs(amt) < 0.01) return bills;

    // 2. 提取日期：从"转账时间"或"收款时间"后提取（去空格后匹配标签）
    var dateMatch = tns.match(/(?:转账时间|收款时间).*?(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (dateMatch) {
        date = dateMatch[1] + '-' + dateMatch[2].padStart(2, '0') + '-' + dateMatch[3].padStart(2, '0');
    } else {
        dateMatch = text.match(/(\d{4})\s*[年\-/.]\s*(\d{1,2})\s*[月\-/.]\s*(\d{1,2})/);
        if (dateMatch) {
            date = dateMatch[1] + '-' + dateMatch[2].padStart(2, '0') + '-' + dateMatch[3].padStart(2, '0');
        }
    }

    // 3. 提取备注：从"转账-来自湖南常德聂新华"中提取（去空格版）
    var senderMatch = tns.match(/转账[-—]?来自([^\d]{2,30})/);
    if (senderMatch) {
        note = senderMatch[1].replace(/[,，]+/g, '').trim();
    }
    if (!note) {
        senderMatch = tns.match(/转账[-—]?给([^\d]{2,30})/);
        if (senderMatch) {
            note = '转给' + senderMatch[1].replace(/[,，]+/g, '').trim();
            type = '支出';
        }
    }
    // 兜底：提取电话号码前面的中文名字
    if (!note) {
        for (var ln = 0; ln < lines.length; ln++) {
            var l = lines[ln].trim();
            var nameMatch = l.match(/([\u4e00-\u9fa5]{2,10})\s*(?:1\d{10}|\d{3,})/);
            if (nameMatch) {
                note = nameMatch[1].trim();
                break;
            }
        }
    }
    if (!note) {
        for (var ln2 = 0; ln2 < lines.length; ln2++) {
            var l2 = lines[ln2].trim();
            if (/[\u4e00-\u9fa5]{3,}/.test(l2) && !/当前状态|转账说明|转账时间|收款时间|转账单号|账单服务/.test(l2)) {
                note = l2.replace(/[,，·\s]/g, '').substring(0, 20);
                break;
            }
        }
    }
    if (!note) note = '微信转账';

    bills.push({
        date: date, type: type, amount: Math.abs(amt), note: note
    });
    return bills;
}

// 解析器5：客户付款截图
function parseCustomerPayment(lines, text, today, currentYear) {
    // 客户付款截图通常包含：付款方、收款方、金额、时间
    // 和单笔支付类似，但识别侧重点不同（更关注收付款双方信息）
    return parseSinglePayment(lines, text, today, currentYear);
}

// 解析器6：通用格式（兜底）
function parseGeneric(lines, text, today, currentYear) {
    var bills = [];
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;
        // 排除余额/尾号/收付方行
        if (/余额/.test(line) || /尾号/.test(line)) continue;
        if (/^(收|付)\s*方/.test(line)) continue;
        if (/^[收付]\s*方\s*\d+/.test(line)) continue;
        if (/^[¥￥]\s*[\d,]+\.\d{2}$/.test(line)) continue;

        var amt = extractAmount(line);
        if (!amt) continue;

        // 查找日期
        var date = today;
        var dateMatch = line.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2})/);
        if (dateMatch) {
            date = parseDateStr(dateMatch[1]) || today;
        } else {
            dateMatch = line.match(/(\d{1,2})[月\-](\d{1,2})/);
            if (dateMatch) {
                date = currentYear + '-' + dateMatch[1].padStart(2, '0') + '-' + dateMatch[2].padStart(2, '0');
            } else if (i + 1 < lines.length) {
                var nextDate = parseDateStr(lines[i + 1]);
                if (nextDate) date = nextDate;
            }
        }

        // 判断类型
        var type = '支出';
        if (line.indexOf('收入') !== -1 || line.indexOf('入账') !== -1 || amt > 0) {
            type = '收入';
        }

        // 提取备注
        var note = line.replace(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/g, '')
            .replace(/\d{1,2}[月\-]\d{1,2}/g, '')
            .replace(/[¥￥]\s*[\d\s,.]+/g, '')
            .replace(/[+\-]\s*[\d\s,.]+/g, '')
            .replace(/\d[\d,]*\.\d{2}/g, '')
            .replace(/收入|支出|入账/g, '')
            .replace(/[,，·]/g, '')
            .trim();
        if (!note) note = 'OCR识别';

        bills.push({
            date: date, type: type, amount: Math.abs(amt), note: note
        });
    }
    return bills;
}

// ==================== OCR 调试支持 ====================
var _lastOcrText = '';
var _lastOcrUserId = null;
var _manualOcrType = '';

// 外部调用：手动指定OCR类型
function setManualOCRType(type) {
    _manualOcrType = type;
}

// 外部调用：切换调试面板
function toggleOcrDebug() {
    var body = document.getElementById('ocrDebugBody');
    var toggle = document.getElementById('ocrDebugToggle');
    if (body.style.display === 'none') {
        body.style.display = 'block';
        toggle.textContent = '收起 ▲';
    } else {
        body.style.display = 'none';
        toggle.textContent = '展开 ▼';
    }
}

// 外部调用：用手动指定的类型重新解析上一张图
function reparseWithManualType() {
    if (!_lastOcrText) {
        showToast('没有可重新解析的OCR数据，请先上传图片', 'error');
        return;
    }
    _manualOcrType = document.getElementById('debugManualType').value;
    parseOCRText(_lastOcrText, _lastOcrUserId);
}

// 外部调用：复制 OCR 原始文本
function copyOcrRawText() {
    var textarea = document.getElementById('debugRawText');
    if (!textarea) return;
    var text = textarea.value;
    if (!text) {
        showToast('没有可复制的内容', 'warning');
        return;
    }
    function fallbackCopy() {
        textarea.select();
        textarea.setSelectionRange(0, 99999);
        try {
            var ok = document.execCommand('copy');
            showToast(ok ? 'OCR原始文本已复制' : '复制失败，请手动复制', ok ? 'success' : 'error');
        } catch (e) {
            showToast('复制失败，请手动复制', 'error');
        }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
            showToast('OCR原始文本已复制', 'success');
        }).catch(function() {
            fallbackCopy();
        });
    } else {
        fallbackCopy();
    }
}

// ==================== 主解析入口 ====================
function parseOCRText(text, userId) {
    if (!text || !text.trim()) {
        showToast('OCR未能识别到文字，请尝试更清晰的截图', 'error');
        return;
    }

    // 保存原始文本和userId，供手动重新解析使用
    _lastOcrText = text;
    _lastOcrUserId = userId;

    var lines = text.split(/\n/).filter(function(l) { return l.trim(); });
    var today = new Date().toISOString().split('T')[0];
    var yearMatch = text.match(/20\d{2}/);
    var currentYear = yearMatch ? yearMatch[0] : String(new Date().getFullYear());

    // 第1步：检测截图类型（支持手动覆盖，但仅对当次有效，用完即清）
    var manualOverride = _manualOcrType;
    _manualOcrType = '';
    var screenshotType = manualOverride || detectScreenshotType(text, lines);

    // 第2步：根据类型调用对应的独立解析器
    var parserUsed = '';
    var bills = [];
    switch (screenshotType) {
        case 'wechatBill':
            bills = parseWeChatBill(lines, today, currentYear);
            parserUsed = '微信账单列表';
            break;
        case 'alipayBill':
            bills = parseAlipayBill(lines, today, currentYear);
            parserUsed = '支付宝账单列表';
            break;
        case 'bankStatement':
            bills = parseBankStatement(lines, today, currentYear);
            parserUsed = '银行流水';
            break;
        case 'wechatTransfer':
            bills = parseWeChatTransfer(lines, text, today, currentYear);
            parserUsed = '微信转账';
            break;
        case 'singlePayment':
            bills = parseSinglePayment(lines, text, today, currentYear);
            parserUsed = '单笔支付/收款';
            break;
        case 'customerPayment':
            bills = parseCustomerPayment(lines, text, today, currentYear);
            parserUsed = '客户付款截图';
            break;
        default:
            bills = parseGeneric(lines, text, today, currentYear);
            parserUsed = '通用格式';
            break;
    }

    // 第3步：如果主解析器无结果且非手动模式，尝试用通用解析器兜底
    var fallbackUsed = false;
    if (bills.length === 0 && screenshotType !== 'generic' && !manualOverride) {
        bills = parseGeneric(lines, text, today, currentYear);
        fallbackUsed = true;
    }

    // --- 填充调试面板 ---
    var panel = document.getElementById('ocrDebugPanel');
    if (panel) { 
        panel.style.display = 'block'; 
        
        var typeLabel = detectScreenshotType(text, lines);
        var typeMap = {
            'wechatBill': '微信账单列表', 'alipayBill': '支付宝账单列表',
            'bankStatement': '银行流水', 'wechatTransfer': '微信转账',
            'singlePayment': '单笔支付/收款', 'customerPayment': '客户付款截图', 'generic': '通用格式'
        };
        document.getElementById('debugDetectedType').textContent = typeMap[typeLabel] || typeLabel;
        document.getElementById('debugParser').textContent = parserUsed + (manualOverride ? ' (手动指定)' : '');
        document.getElementById('debugResultCount').textContent = bills.length === 0
            ? '⚠ 0条（' + (fallbackUsed ? '降级到通用解析器仍无结果' : '请尝试手动指定类型或检查截图质量') + '）'
            : '✓ ' + bills.length + '条' + (fallbackUsed ? '（已降级到通用解析器）' : '');
        document.getElementById('debugRawText').value = text;
        // 触发一次折叠面板展开
        document.getElementById('ocrDebugBody').style.display = 'block';
        document.getElementById('ocrDebugToggle').textContent = '收起 ▲';
    }

    // --- 控制台日志 ---
    console.log('[OCR] 自动检测类型:', typeMap[typeLabel] || typeLabel);
    console.log('[OCR] 实际使用解析器:', parserUsed, manualOverride ? '(手动)' : '(自动)');
    console.log('[OCR] 识别结果:', bills.length, '条');
    console.log('[OCR] 原始文本:\n' + text);

    // 第4步：全局余额过滤——从OCR原文中提取所有疑似余额行的金额，过滤掉匹配的账单
    var balanceAmounts = new Set();
    var rawLines = text.split(/\n/);
    for (var bf = 0; bf < rawLines.length; bf++) {
        var bl = rawLines[bf].trim();
        if (!bl) continue;
        if (/余额/.test(bl) || /尾号/.test(bl) || /^(收|付)\s*方/.test(bl) || /^[收付]\s*方\s*\d+/.test(bl) || /^[¥￥]\s*[\d,]+\.\d{2}$/.test(bl) || /年\s*\d{1,2}\s*月.*[支出收入]/.test(bl) || /支出.*收入|收入.*支出/.test(bl)) {
            var bm = bl.match(/[\d,]+\.\d{2}/g);
            if (bm) bm.forEach(function(v) { balanceAmounts.add(parseFloat(v.replace(/,/g, ''))); });
        }
    }
    var filteredBills = [];
    for (var fi = 0; fi < bills.length; fi++) {
        if (balanceAmounts.has(bills[fi].amount)) {
            console.log('[OCR] 过滤疑似余额: ¥' + bills[fi].amount.toFixed(2) + ' | ' + bills[fi].note);
            continue;
        }
        filteredBills.push(bills[fi]);
    }
    bills = filteredBills;
    console.log('[OCR v2.5] 全局过滤后剩余:', bills.length, '条');

    if (bills.length === 0) {
        showToast('未能从截图中识别到账单数据，请检查截图质量', 'error');
        return;
    }

    showPreview(bills, userId);
}

// ==================== 初始化 ====================
function init() {
    loadData();
    initLogin();

    // 检查是否已登录
    var lastId = localStorage.getItem('billApp_lastAccount');
    if (lastId && APP_DATA.accounts.find(function(a) { return a.id === lastId; })) {
        // 用户之前登录过，显示登录界面
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    init();
});

// 点击弹窗遮罩关闭
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal-overlay')) {
        // 不自动关闭，需要显式调用closeModal
    }
});

// 确保忘记密码弹窗的关闭按钮有效
document.querySelector('#forgotPasswordModal .btn-close') && document.querySelector('#forgotPasswordModal .btn-close').addEventListener('click', function() {
    closeModal('forgotPasswordModal');
});

// ==================== OCR 框选识别模式 ====================
var _ocrMode = 'auto';
var _boxColor = 'amount';
var _boxes = [];
var _isDrawingBox = false;
var _currentBoxStart = null;
var _lastTouchPos = null;
var _boxCtx = null;

function setOCRMode(mode) {
    _ocrMode = mode;
    document.querySelectorAll('.btn-ocr-mode').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    var boxToolbar = document.getElementById('boxOcrToolbar');
    var boxHint = document.getElementById('boxOcrHint');
    if (mode === 'box') {
        boxToolbar.style.display = 'flex';
        boxHint.style.display = 'block';
        initBoxCanvas();
    } else {
        boxToolbar.style.display = 'none';
        boxHint.style.display = 'none';
    }
}

function setBoxColor(color) {
    _boxColor = color;
    document.querySelectorAll('.box-color-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.color === color);
    });
}

function initBoxCanvas() {
    var wrapper = document.getElementById('imagePreviewWrapper');
    var img = document.getElementById('previewImage');
    var canvas = document.getElementById('boxCanvas');
    if (!wrapper || !img || !canvas) return;
    if (!img.clientWidth || !img.clientHeight) return;

    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;
    canvas.style.width = img.clientWidth + 'px';
    canvas.style.height = img.clientHeight + 'px';

    _boxCtx = canvas.getContext('2d');
    drawBoxes();
}

function clearAllBoxes() {
    _boxes = [];
    initBoxCanvas();
    drawBoxes();
}

function drawBoxes() {
    if (!_boxCtx) return;
    var canvas = document.getElementById('boxCanvas');
    _boxCtx.clearRect(0, 0, canvas.width, canvas.height);

    var colors = {
        amount: 'rgba(232, 93, 117, 0.85)',
        note: 'rgba(74, 144, 217, 0.85)',
        date: 'rgba(0, 184, 148, 0.85)'
    };

    _boxes.forEach(function(box) {
        var color = colors[box.type] || colors.amount;
        _boxCtx.strokeStyle = color;
        _boxCtx.lineWidth = 2;
        _boxCtx.strokeRect(box.x, box.y, box.w, box.h);

        _boxCtx.fillStyle = color.replace('0.85', '0.12');
        _boxCtx.fillRect(box.x, box.y, box.w, box.h);

        _boxCtx.fillStyle = color;
        _boxCtx.font = 'bold 12px sans-serif';
        var label = box.type === 'amount' ? '金额' : box.type === 'note' ? '备注' : '日期';
        _boxCtx.fillText(label, box.x + 4, box.y + 14);
    });
}

function recognizeBoxes() {
    if (!_boxes || _boxes.length === 0) {
        showToast('请先绘制识别框', 'error');
        return;
    }
    var userId = document.getElementById('importUser').value;
    if (!userId) { showToast('请先选择账单户', 'error'); return; }

    var file = window._currentOCRFile;
    if (!file) {
        showToast('没有可识别的图片', 'error');
        return;
    }

    var progressDiv = document.getElementById('ocrProgress');
    var progressText = document.getElementById('ocrProgressText');
    progressDiv.style.display = 'flex';
    progressText.textContent = '正在识别选中区域...';

    var img = new Image();
    img.onload = function() {
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        var displayImg = document.getElementById('previewImage');
        var scaleX = img.width / displayImg.clientWidth;
        var scaleY = img.height / displayImg.clientHeight;

        var boxResults = [];
        _boxes.forEach(function(box) {
            var sx = Math.floor(box.x * scaleX);
            var sy = Math.floor(box.y * scaleY);
            var sw = Math.floor(box.w * scaleX);
            var sh = Math.floor(box.h * scaleY);

            sx = Math.max(0, sx);
            sy = Math.max(0, sy);
            sw = Math.min(sw, img.width - sx);
            sh = Math.min(sh, img.height - sy);

            var regionCanvas = document.createElement('canvas');
            regionCanvas.width = sw;
            regionCanvas.height = sh;
            var regionCtx = regionCanvas.getContext('2d');
            regionCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

            boxResults.push({
                type: box.type,
                x: box.x,
                y: box.y,
                image: regionCanvas.toDataURL('image/png')
            });
        });

        var completed = 0;
        var recognized = [];
        boxResults.forEach(function(br) {
            Tesseract.recognize(br.image, 'chi_sim+eng', {
                tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
                logger: function(info) {
                    if (info.status === 'recognizing text') {
                        var pct = Math.round((completed + info.progress) / boxResults.length * 100);
                        progressText.textContent = '正在识别... ' + pct + '%';
                    }
                }
            }).then(function(result) {
                completed++;
                recognized.push({
                    type: br.type,
                    x: br.x,
                    y: br.y,
                    text: result.data.text.trim()
                });
                if (completed === boxResults.length) {
                    progressDiv.style.display = 'none';
                    var bills = groupBoxResultsIntoBills(recognized);
                    if (bills.length > 0) {
                        showPreview(bills, userId);
                    } else {
                        showToast('未能从框选区域中识别到有效账单', 'error');
                    }
                }
            }).catch(function() {
                completed++;
                if (completed === boxResults.length) {
                    progressDiv.style.display = 'none';
                    if (recognized.length > 0) {
                        var bills = groupBoxResultsIntoBills(recognized);
                        if (bills.length > 0) showPreview(bills, userId);
                        else showToast('识别完成，但未能组合成有效账单', 'error');
                    } else {
                        showToast('框选区域识别失败', 'error');
                    }
                }
            });
        });
    };
    img.src = URL.createObjectURL(file);
}

function groupBoxResultsIntoBills(results) {
    results.sort(function(a, b) { return a.y - b.y; });
    var groups = [];
    var threshold = 40;

    results.forEach(function(r) {
        var placed = false;
        for (var i = 0; i < groups.length; i++) {
            if (Math.abs(r.y - groups[i].y) < threshold) {
                groups[i].items.push(r);
                groups[i].y = (groups[i].y * (groups[i].items.length - 1) + r.y) / groups[i].items.length;
                placed = true;
                break;
            }
        }
        if (!placed) {
            groups.push({ y: r.y, items: [r] });
        }
    });

    var bills = [];
    groups.forEach(function(g) {
        var amount = null, note = null, date = null;
        g.items.forEach(function(item) {
            if (item.type === 'amount') {
                var amt = extractAmount(item.text);
                if (amt) amount = amt;
            } else if (item.type === 'note') {
                note = item.text.trim();
            } else if (item.type === 'date') {
                date = parseDateStr(item.text);
            }
        });

        if (amount) {
            bills.push({
                date: date || new Date().toISOString().split('T')[0],
                type: amount < 0 ? '支出' : '收入',
                amount: Math.abs(amount),
                note: note || '框选识别'
            });
        }
    });

    return bills;
}

// 框选画布交互
(function initBoxCanvasEvents() {
    var canvas = document.getElementById('boxCanvas');
    if (!canvas) return;

    function getPos(e) {
        var rect = canvas.getBoundingClientRect();
        var clientX = e.clientX;
        var clientY = e.clientY;
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else if (e.changedTouches && e.changedTouches.length > 0) {
            clientX = e.changedTouches[0].clientX;
            clientY = e.changedTouches[0].clientY;
        }
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }

    canvas.addEventListener('mousedown', function(e) {
        if (_ocrMode !== 'box') return;
        e.preventDefault();
        _isDrawingBox = true;
        _currentBoxStart = getPos(e);
    });

    canvas.addEventListener('mousemove', function(e) {
        if (!_isDrawingBox || !_currentBoxStart) return;
        e.preventDefault();
        var pos = getPos(e);
        var x = Math.min(_currentBoxStart.x, pos.x);
        var y = Math.min(_currentBoxStart.y, pos.y);
        var w = Math.abs(pos.x - _currentBoxStart.x);
        var h = Math.abs(pos.y - _currentBoxStart.y);

        drawBoxes();
        var colors = {
            amount: 'rgba(232, 93, 117, 0.85)',
            note: 'rgba(74, 144, 217, 0.85)',
            date: 'rgba(0, 184, 148, 0.85)'
        };
        var color = colors[_boxColor] || colors.amount;
        _boxCtx.strokeStyle = color;
        _boxCtx.lineWidth = 2;
        _boxCtx.strokeRect(x, y, w, h);
    });

    canvas.addEventListener('mouseup', function(e) {
        if (!_isDrawingBox) return;
        _isDrawingBox = false;
        var pos = getPos(e);
        var x = Math.min(_currentBoxStart.x, pos.x);
        var y = Math.min(_currentBoxStart.y, pos.y);
        var w = Math.abs(pos.x - _currentBoxStart.x);
        var h = Math.abs(pos.y - _currentBoxStart.y);
        if (w > 10 && h > 10) {
            _boxes.push({ type: _boxColor, x: x, y: y, w: w, h: h });
        }
        drawBoxes();
    });

    canvas.addEventListener('touchstart', function(e) {
        if (_ocrMode !== 'box') return;
        e.preventDefault();
        _isDrawingBox = true;
        _currentBoxStart = getPos(e);
        _lastTouchPos = _currentBoxStart;
    }, { passive: false });

    canvas.addEventListener('touchmove', function(e) {
        if (!_isDrawingBox || !_currentBoxStart) return;
        e.preventDefault();
        var pos = getPos(e);
        _lastTouchPos = pos;
        var x = Math.min(_currentBoxStart.x, pos.x);
        var y = Math.min(_currentBoxStart.y, pos.y);
        var w = Math.abs(pos.x - _currentBoxStart.x);
        var h = Math.abs(pos.y - _currentBoxStart.y);

        drawBoxes();
        var colors = {
            amount: 'rgba(232, 93, 117, 0.85)',
            note: 'rgba(74, 144, 217, 0.85)',
            date: 'rgba(0, 184, 148, 0.85)'
        };
        var color = colors[_boxColor] || colors.amount;
        _boxCtx.strokeStyle = color;
        _boxCtx.lineWidth = 2;
        _boxCtx.strokeRect(x, y, w, h);
    }, { passive: false });

    canvas.addEventListener('touchend', function(e) {
        if (!_isDrawingBox) return;
        _isDrawingBox = false;
        var pos = _lastTouchPos || getPos(e);
        var x = Math.min(_currentBoxStart.x, pos.x);
        var y = Math.min(_currentBoxStart.y, pos.y);
        var w = Math.abs(pos.x - _currentBoxStart.x);
        var h = Math.abs(pos.y - _currentBoxStart.y);
        if (w > 10 && h > 10) {
            _boxes.push({ type: _boxColor, x: x, y: y, w: w, h: h });
        }
        drawBoxes();
        _lastTouchPos = null;
    });
})();
