// [JustGolf B] 後台時段管理:分頁切換 + 排程時間列動態增減
// SPA:註冊為 window.pageInit.slots(root),首次載入與 SPA 換頁皆由 spa.js 呼叫(可重入,DOM 查詢限定 root)。
(function () {
    window.pageInit = window.pageInit || {};
    window.pageInit.slots = function (root) {
        root = root || document;
    // --- 分頁切換 ---
    const tabs = root.querySelectorAll('.b-tab');
    const panels = root.querySelectorAll('.b-panel');
    function activate(name) {
        tabs.forEach(t => t.classList.toggle('b-tab-active', t.dataset.tab === name));
        panels.forEach(p => p.classList.toggle('hidden', p.dataset.panel !== name));
    }
    tabs.forEach(t => t.addEventListener('click', () => {
        activate(t.dataset.tab);
        try { localStorage.setItem('bSlotsTab', t.dataset.tab); } catch (e) {}
    }));
    // 預設停留在上次分頁,否則第一個(時段狀態)
    let initial = 'status';
    try { initial = localStorage.getItem('bSlotsTab') || 'status'; } catch (e) {}
    if (![...tabs].some(t => t.dataset.tab === initial)) initial = 'status';
    activate(initial);

    // --- 時段格子彈窗:看明細 / 改狀態 ---
    const modal = root.querySelector('#b-cell-modal');
    if (modal) {
        const title = root.querySelector('#bm-title');
        const bookingsBox = root.querySelector('#bm-bookings');
        const statusUrlTpl = modal.dataset.statusUrl;
        const bookingUrlTpl = modal.dataset.bookingUrl;
        const createUrl = modal.dataset.createUrl;
        const week = modal.dataset.week || '0';
        const date = modal.dataset.date || '';
        const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
        const stOpts = [['pending', '待確認'], ['confirmed', '已確認'], ['cancelled', '已取消'], ['checked_in', '已報到'], ['no_show', '未到']];
        const payOpts = [['unpaid', '未付款'], ['paid', '已付款'], ['onsite', '現場付款'], ['failed', '付款失敗']];

        // 綠=完成/正常,紅=未完成,灰=已取消(與後台 bookings 一致)
        const DONE_ST = ['confirmed', 'checked_in'], NEUTRAL_ST = ['cancelled'], DONE_PAY = ['paid'];
        function labelOf(list, v) { const o = list.find(function (x) { return x[0] === v; }); return o ? o[1] : (v || ''); }
        function stColor(v) { return NEUTRAL_ST.indexOf(v) >= 0 ? '#6b7280' : (DONE_ST.indexOf(v) >= 0 ? '#16a34a' : '#dc2626'); }
        function payColor(v) { return DONE_PAY.indexOf(v) >= 0 ? '#16a34a' : '#dc2626'; }
        function statusLine(b) {
            return '<div class="text-xs">狀態:<span style="color:' + stColor(b.status) + ';font-weight:600">' + labelOf(stOpts, b.status) +
                '</span> / 付款:<span style="color:' + payColor(b.payment) + ';font-weight:600">' + labelOf(payOpts, b.payment) + '</span></div>';
        }

        function opts(list, selected) {
            return list.map(function (o) {
                return '<option value="' + o[0] + '"' + (o[0] === selected ? ' selected' : '') + '>' + o[1] + '</option>';
            }).join('');
        }

        function playerOpts(selected) {
            let s = '';
            for (let i = 1; i <= 4; i++) {
                s += '<option value="' + i + '"' + (i === Number(selected) ? ' selected' : '') + '>' + i + '人</option>';
            }
            return s;
        }

        function bookingCard(b) {
            const action = bookingUrlTpl.replace('__BID__', b.id);
            return '<div class="rounded border p-2">' +
                '<div class="font-semibold">' + (b.name || '') + '（' + (b.players || 0) + ' 人）</div>' +
                '<div class="text-gray-600">' + (b.phone || '') + ' · ' + (b.code || '') + '</div>' +
                statusLine(b) +
                '<form method="post" action="' + action + '" class="b-bk-form mt-2 flex flex-wrap items-end gap-2"' +
                ' data-payment="' + (b.payment || '') + '" data-total="' + (b.total || 0) + '">' +
                '<input type="hidden" name="csrf_token" value="' + csrf + '">' +
                '<input type="hidden" name="back" value="slots">' +
                '<input type="hidden" name="week" value="' + week + '">' +
                '<input type="hidden" name="date" value="' + date + '">' +
                '<select name="players" class="b-select" title="人數">' + playerOpts(b.players) + '</select>' +
                '<select name="status" class="b-select">' + opts(stOpts, b.status) + '</select>' +
                '<select name="payment_status" class="b-select">' + opts(payOpts, b.payment) + '</select>' +
                '<button class="b-btn b-btn-text">更新</button>' +
                '</form></div>';
        }

        function createForm(btn) {
            const remaining = Number(btn.dataset.remaining) || 0;
            let pOpts = '';
            for (let i = 1; i <= Math.min(remaining, 4); i++) pOpts += '<option value="' + i + '">' + i + '人</option>';
            return '<form method="post" action="' + createUrl + '" class="space-y-3 b-create-form">' +
                '<input type="hidden" name="csrf_token" value="' + csrf + '">' +
                '<input type="hidden" name="zone_id" value="' + btn.dataset.zoneId + '">' +
                '<input type="hidden" name="play_date" value="' + date + '">' +
                '<input type="hidden" name="tee_time" value="' + btn.dataset.time + '">' +
                '<input type="hidden" name="week" value="' + week + '">' +
                '<div class="grid grid-cols-2 gap-3">' +
                '<input name="guest_name" required placeholder="姓名" class="b-input b-create-name">' +
                '<input name="guest_phone" required placeholder="手機" class="b-input b-create-phone">' +
                '</div>' +
                '<div class="grid grid-cols-2 gap-3">' +
                '<label class="b-label">人數<select name="players" class="b-select">' + pOpts + '</select></label>' +
                '<label class="b-label">付款<select name="payment_method" class="b-select"><option value="onsite">現場</option><option value="unpaid">未收</option></select></label>' +
                '</div>' +
                '<input name="note" placeholder="備註(選填)" class="b-input">' +
                '<div class="text-right"><button class="b-btn b-btn-text b-create-submit" disabled>建立訂單</button></div>' +
                '</form>';
        }

        function initCreateForm(container) {
            const form = container.querySelector('.b-create-form');
            if (!form) return;
            const nameEl = form.querySelector('.b-create-name');
            const phoneEl = form.querySelector('.b-create-phone');
            const submitBtn = form.querySelector('.b-create-submit');
            function updateSubmit() {
                const ok = nameEl.value.trim() !== '' && phoneEl.value.trim() !== '';
                submitBtn.disabled = !ok;
            }
            nameEl.addEventListener('input', updateSubmit);
            phoneEl.addEventListener('input', updateSubmit);
        }

        const subEl = root.querySelector('#bm-sub');
        const statusSelect = modal.querySelector('.bm-status-select');
        const statusForm = modal.querySelector('.bm-status-form');
        // 狀態下拉文字色:選了開放(綠)/保留(灰)/關閉(紅);選了即送出。
        // ⚠️ 此 <select> 會被共用 BDropdown 漸進增強(包成自訂下拉、隱藏原生 select),
        //    故不可用 .options/.selectedIndex(包裝後不可靠);改以 value 查對應 option 的 data-tone,
        //    並整段 try 保護,避免任何取值錯誤中斷 openModal(否則 modal 開不了)。
        const TONE_COLOR = { ok: 'var(--fg-success)', neutral: 'var(--text-body-subtle)', bad: 'var(--fg-danger)' };
        // data-state → select value 對應(few/full 等狀態屬預約量,不代表人工關閉,不預選)
        const STATE_TO_STATUS = { open: 'open', reserved: 'reserved', blocked: 'blocked', paused: 'blocked' };
        function paintStatusSelect() {
            if (!statusSelect) return;
            try {
                const val = statusSelect.value || '';
                const opt = statusSelect.querySelector('option[value="' + val + '"]');
                const tone = (opt && opt.dataset.tone) || '';
                statusSelect.style.color = TONE_COLOR[tone] || '';
                statusSelect.style.fontWeight = tone ? '600' : '';
            } catch (e) { /* 包裝差異不致命,忽略 */ }
        }
        let _settingStatus = false;   // 程式設值時阻止自動送出
        if (statusSelect && statusForm) {
            statusSelect.addEventListener('change', function () {
                paintStatusSelect();
                if (!_settingStatus && statusSelect.value) statusForm.submit();
            });
        }

        const contentBox = root.querySelector('#bm-content');
        const statusPanel = root.querySelector('#bm-status-panel');

        function setSub(text) { if (subEl) subEl.textContent = text || ''; }

        // modal 畫面一:看/管預約 + 新增訂單
        function showBookings(btn) {
            const remaining = btn.dataset.remaining;
            let bookings = [];
            try { bookings = JSON.parse(btn.dataset.bookings || '[]'); } catch (e) {}
            const bookable = (btn.dataset.state === 'open' || btn.dataset.state === 'few') &&
                Number(remaining) > 0 && btn.dataset.past !== '1' && createUrl;
            if (bookings.length) {
                bookingsBox.innerHTML = bookings.map(bookingCard).join('');
            } else if (bookable) {
                bookingsBox.innerHTML = '<p class="mb-2 text-gray-500">此時段尚無預約,可直接建立:</p>' + createForm(btn);
                initCreateForm(bookingsBox);
            } else {
                bookingsBox.innerHTML = '<p class="text-gray-500">此時段尚無預約。</p>';
            }
            if (window.BDropdown) window.BDropdown.init(bookingsBox);
            contentBox.classList.remove('hidden');
            statusPanel.classList.add('hidden');
            setSub(bookings.length ? (bookings.length + ' 筆預約') : '新增訂單');
            openModalShell(btn);
        }

        // modal 畫面二:變更時段狀態
        function showStatus(btn) {
            if (statusSelect) {
                _settingStatus = true;
                statusSelect.value = STATE_TO_STATUS[btn.dataset.state] || '';
                statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
                paintStatusSelect();
                _settingStatus = false;
            }
            contentBox.classList.add('hidden');
            statusPanel.classList.remove('hidden');
            setSub('變更時段狀態');
            openModalShell(btn);
        }

        // 開 modal 外殼(標題 + 狀態表單 action)。畫面內容由 showBookings/showStatus 先設好。
        function openModalShell(btn) {
            const slotId = btn.dataset.slotId;
            title.textContent = btn.dataset.time + ' ' + btn.dataset.zone;
            modal.querySelectorAll('.bm-status-form').forEach(function (f) {
                f.action = statusUrlTpl.replace('__SID__', slotId);
            });
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }

        // ── 指標旁動作選單:改用共用元件 BContextMenu(context-menu.js) ──
        // 依格子狀態算出可用動作 → 交給元件彈出;元件負責手風琴/定位/開關/anchor(td)高亮。
        function openActionMenu(btn, x, y) {
            if (!window.BContextMenu) return;
            const remaining = Number(btn.dataset.remaining) || 0;
            let bookings = [];
            try { bookings = JSON.parse(btn.dataset.bookings || '[]'); } catch (e) {}
            const bookable = (btn.dataset.state === 'open' || btn.dataset.state === 'few') &&
                remaining > 0 && btn.dataset.past !== '1' && createUrl;

            const items = [];
            if (bookings.length) {
                items.push({ id: 'bookings', icon: 'users', label: '查看 / 管理預約' });
            }
            if (bookable) {
                items.push({ id: 'create', icon: 'plus', label: '新增訂單' });
            }
            if (!bookings.length && !bookable) {
                items.push({ id: 'bookings', icon: 'users', label: '查看預約' });
            }
            if (btn.dataset.past !== '1') {
                items.push({ id: 'status', icon: 'sliders-horizontal', label: '變更時段狀態' });
            }

            window.BContextMenu.open({
                x: x, y: y,
                items: items,
                anchorEl: btn.closest('td'),   // 選單開著時,該格 td 維持 .is-active(hover 外觀)
                onSelect: function (id) {
                    if (id === 'bookings' || id === 'create') showBookings(btn);
                    else if (id === 'status') showStatus(btn);
                }
            });
        }

        // 關閉:先播淡出(is-closing),動畫結束才隱藏;與開啟動畫(.flex 的 keyframes)對稱
        let closeTimer = null;
        function closeModal() {
            if (modal.classList.contains('hidden')) return;
            modal.classList.add('is-closing');
            if (closeTimer) clearTimeout(closeTimer);
            closeTimer = setTimeout(function () {
                modal.classList.add('hidden');
                modal.classList.remove('flex', 'is-closing');
            }, 120);
        }

        let ctxOpenFor = null;   // 目前選單對應的格子(給 toggle 用)
        root.querySelectorAll('.b-cell').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();   // 避免同一次點擊被 document 監聽當成「點外面」立刻關掉
                // 同一格再點一下 → 收起(toggle)
                if (window.BContextMenu && window.BContextMenu.isOpen() && ctxOpenFor === btn) {
                    window.BContextMenu.close();
                    ctxOpenFor = null;
                    return;
                }
                ctxOpenFor = btn;
                openActionMenu(btn, e.clientX, e.clientY);
            });
        });
        const closeBtn = root.querySelector('#bm-close');
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    }

    // --- 排程時間列動態增減 ---
    const list = root.querySelector('#session-rows');
    const addBtn = root.querySelector('#add-session');
    if (list && addBtn) {
        function makeRow() {
            const row = document.createElement('div');
            row.className = 'b-row-grid b-session-grid session-row';
            row.innerHTML =
                '<input type="text" name="session_name" placeholder="名稱(例:上午場)" class="b-input">' +
                '<input type="time" name="session_open" required class="b-input">' +
                '<span class="b-row-sep">—</span>' +
                '<input type="time" name="session_close" required class="b-input">' +
                '<button type="button" class="remove-session b-btn b-btn-text b-btn-text-danger b-btn-sm">移除</button>';
            return row;
        }
        addBtn.addEventListener('click', () => list.appendChild(makeRow()));
        list.addEventListener('click', e => {
            if (e.target.classList.contains('remove-session')) {
                if (list.querySelectorAll('.session-row').length > 1) e.target.closest('.session-row').remove();
            }
        });
    }

    // --- 時段狀態表:時段 / 小時 篩選(下拉版) ---
    // 語意:選下拉「不即時生效」,只更新暫存(pending);按「套用篩選」才過濾、按「重置」才回全部。
    //       與其他頁 filter_panel(filter.js「submit 才生效」)行為一致。
    const gridTable = root.querySelector('#grid-table');
    if (gridTable) {
        const rows = Array.from(gridTable.querySelectorAll('.grid-row'));
        const sessionSel = root.querySelector('#filter-session');
        const hourSel = root.querySelector('#filter-hour');
        const pop = root.querySelector('#slots-filter-pop');
        // pending = 面板內下拉目前的選擇(尚未套用);applied = 已套用到 grid 的條件
        let pendingSession = '', pendingHour = 'all';
        let appliedSession = '', appliedHour = 'all';

        // 依「已套用」條件過濾 grid
        function apply() {
            rows.forEach(function (r) {
                const okS = !appliedSession || r.dataset.session === appliedSession;
                const okH = appliedHour === 'all' || r.dataset.hour === appliedHour;
                r.classList.toggle('hidden', !(okS && okH));
            });
        }
        // 依 pending 時段重建小時下拉選項(下拉內容即時對,但不觸發過濾)
        function renderHours() {
            if (!hourSel) return;
            const hs = [];
            rows.forEach(function (r) {
                if (pendingSession && r.dataset.session !== pendingSession) return;
                if (r.dataset.hour && hs.indexOf(r.dataset.hour) === -1) hs.push(r.dataset.hour);
            });
            hs.sort();
            if (hs.indexOf(pendingHour) === -1) pendingHour = 'all';   // 換時段後原小時可能不存在
            hourSel.innerHTML = '<option value="all">全部時間</option>' +
                hs.map(function (h) { return '<option value="' + h + '">' + h + ':00</option>'; }).join('');
            hourSel.value = pendingHour;
            if (window.BDropdown && window.BDropdown.refresh) window.BDropdown.refresh(hourSel);
        }
        function closePop() {
            if (!pop) return;
            pop.classList.remove('is-open');
            const trig = pop.querySelector('[data-pop]');
            if (trig) trig.setAttribute('aria-expanded', 'false');
        }
        // 已套用態:篩選鈕高亮(有非預設條件時)
        function syncTriggerState() {
            if (!pop) return;
            const btn = pop.querySelector('.b-btn-filter');
            if (btn) btn.classList.toggle('is-active', !!appliedSession || appliedHour !== 'all');
        }

        // 選時段 → 只更新 pending + 重建小時選項,不過濾
        if (sessionSel) {
            sessionSel.addEventListener('change', function () {
                pendingSession = sessionSel.value || '';
                pendingHour = 'all';
                renderHours();
            });
        }
        // 選時間 → 只更新 pending,不過濾
        if (hourSel) {
            hourSel.addEventListener('change', function () {
                pendingHour = hourSel.value || 'all';
            });
        }

        // 「套用篩選」= 把 pending 提交成 applied → 過濾 → 關面板
        if (pop) {
            pop.querySelectorAll('[data-pop-close]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    appliedSession = pendingSession;
                    appliedHour = pendingHour;
                    apply();
                    syncTriggerState();
                    closePop();
                });
            });
        }

        // 「重置」= 清空 pending + applied → 立即回全部(按下即變回來)
        const resetBtn = root.querySelector('#filter-reset');
        if (resetBtn) {
            resetBtn.addEventListener('click', function () {
                pendingSession = ''; pendingHour = 'all';
                appliedSession = ''; appliedHour = 'all';
                if (sessionSel) {
                    sessionSel.value = '';
                    if (window.BDropdown && window.BDropdown.refresh) window.BDropdown.refresh(sessionSel);
                }
                renderHours();
                apply();
                syncTriggerState();
            });
        }

        renderHours();
        apply();
    }

    // --- 排程儲存前:時段時間衝突即時檢查 ---
    const schedForm = root.querySelector('#schedule-form');
    if (schedForm) {
        const toMin = function (v) {
            const p = (v || '').split(':');
            return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
        };
        schedForm.addEventListener('submit', function (e) {
            const rows = Array.from(schedForm.querySelectorAll('.session-row'));
            const spans = [];
            for (const r of rows) {
                const o = r.querySelector('[name="session_open"]').value;
                const c = r.querySelector('[name="session_close"]').value;
                const nm = (r.querySelector('[name="session_name"]') || {}).value || '某段';
                if (!o || !c) continue;
                const a = toMin(o), b = toMin(c);
                if (a >= b) {
                    e.preventDefault();
                    BDialog.alert({ variant: 'warn', title: '無法儲存', desc: '時段時間「' + nm + '」的開始必須早於結束。' });
                    return;
                }
                spans.push([a, b, nm]);
            }
            spans.sort((x, y) => x[0] - y[0]);
            for (let i = 1; i < spans.length; i++) {
                if (spans[i][0] < spans[i - 1][1]) {
                    e.preventDefault();
                    BDialog.alert({ variant: 'warn', title: '無法儲存', desc: '時段時間有重疊(' + spans[i - 1][2] + ' 與 ' + spans[i][2] + '),請調整後再儲存。' });
                    return;
                }
            }
        });
    }

    // --- 依日期區間價格列動態增減 ---
    const dpList = root.querySelector('#dateprice-rows');
    const dpAdd = root.querySelector('#add-dateprice');
    if (dpList && dpAdd) {
        dpAdd.addEventListener('click', function () {
            const row = document.createElement('div');
            row.className = 'b-row-grid b-dateprice-grid dateprice-row';
            row.innerHTML =
                '<input type="date" name="dp_from" class="b-input">' +
                '<span class="b-row-sep">~</span>' +
                '<input type="date" name="dp_to" class="b-input">' +
                '<input type="number" name="dp_price" min="0" step="1" placeholder="價格" class="b-input">' +
                '<button type="button" class="remove-dateprice b-btn b-btn-text b-btn-text-danger b-btn-sm">移除</button>';
            dpList.appendChild(row);
        });
        dpList.addEventListener('click', function (e) {
            if (e.target.classList.contains('remove-dateprice')) {
                e.target.closest('.dateprice-row').remove();
            }
        });
    }

    // --- 球區列:⋯ 動作選單(改名 inline / 刪除)---
    const zoneList = root.querySelector('#zone-list');
    if (zoneList) {
        // 改名:切到編輯態、focus input;取消:切回唯讀
        function enterEdit(item) {
            zoneList.querySelectorAll('.b-zone-item.is-editing').forEach(function (el) {
                if (el !== item) exitEdit(el);
            });
            item.classList.add('is-editing');
            const form = item.querySelector('.b-zone-edit');
            if (form) {
                form.classList.remove('hidden');
                const input = form.querySelector('[data-zone-edit-input]');
                if (input) { input.focus(); input.select(); }
            }
        }
        function exitEdit(item) {
            item.classList.remove('is-editing');
            const form = item.querySelector('.b-zone-edit');
            if (form) {
                form.classList.add('hidden');
                // 還原未儲存的改動
                const input = form.querySelector('[data-zone-edit-input]');
                const name = item.querySelector('[data-zone-name]');
                if (input && name) input.value = name.textContent.trim();
            }
        }

        zoneList.addEventListener('click', function (e) {
            // 取消改名
            if (e.target.closest('.b-zone-cancel')) {
                exitEdit(e.target.closest('.b-zone-item'));
                return;
            }
            // ⋯ 選單
            const menuBtn = e.target.closest('.b-zone-menu');
            if (!menuBtn) return;
            e.stopPropagation();
            const item = menuBtn.closest('.b-zone-item');
            const rect = menuBtn.getBoundingClientRect();
            if (window.BContextMenu) {
                window.BContextMenu.open({
                    x: rect.left, y: rect.bottom + 4, anchorEl: menuBtn,
                    items: [
                        { id: 'rename', icon: 'pencil', label: '改名' },
                        { id: 'delete', icon: 'trash-2', label: '刪除' },
                    ],
                    onSelect: function (id) {
                        if (id === 'rename') enterEdit(item);
                        else if (id === 'delete') {
                            const delForm = item.querySelector('.b-zone-del');
                            // 確認框取代瀏覽器原生確認(模板的 onsubmit 已移除);
                            // 確認後用原生 submit()(不觸發 submit 事件,避免其他委派重複攔截)
                            if (delForm) {
                                BDialog.confirm({ title: '確定刪除此球區?', variant: 'danger', confirmText: '刪除' })
                                    .then(function (ok) { if (ok) delForm.submit(); });
                            }
                        }
                    },
                });
            }
        });
    }
    };
})();
