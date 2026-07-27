// [JustGolf B] 帳務頁:視圖切換膠囊滑塊(量測寬度、點擊先滑再換頁)
// SPA:註冊為 window.pageInit.billing(root),首次載入與 SPA 換頁皆由 spa.js 呼叫(可重入,DOM 查詢限定 root)。
(function () {
    window.pageInit = window.pageInit || {};

    function positionThumb(seg, activeEl, animate) {
        var thumb = seg.querySelector('.b-seg-thumb');
        if (!thumb || !activeEl) return;
        if (!animate) seg.classList.add('no-anim');
        seg.style.setProperty('--thumb-w', activeEl.offsetWidth + 'px');
        seg.style.setProperty('--thumb-x', activeEl.offsetLeft - seg.clientLeft + 'px');
        if (!animate) {
            // 強制 reflow 後再開啟過渡,避免首次定位被當成滑動
            void thumb.offsetWidth;
            requestAnimationFrame(function () { seg.classList.remove('no-anim'); });
        }
    }

    window.pageInit.billing = function (root) {
        root = root || document;
        var seg = root.querySelector('[data-seg-toggle]');
        if (!seg) return;
        var items = Array.prototype.slice.call(seg.querySelectorAll('a'));
        var switching = false;

        // 初始定位(不滑進來)
        positionThumb(seg, seg.querySelector('a.active') || items[0], false);
        // 視窗縮放時重量(維持對齊)
        var onResize = function () { positionThumb(seg, seg.querySelector('a.active') || items[0], false); };
        window.addEventListener('resize', onResize);

        // 只抽換資料區 + 篩選槽(膠囊 DOM 不動 → 滑塊能真的滑),不重整整頁
        function switchView(a) {
            if (switching) return;
            switching = true;
            var url = a.getAttribute('href');

            // 1) 立即滑塊 + 切字色(膠囊列不動)
            items.forEach(function (x) { x.classList.remove('active'); });
            a.classList.add('active');
            positionThumb(seg, a, true);

            // 2) 資料區淡出 → fetch → 抽換 → 淡入
            var body = root.querySelector('[data-view-body]');
            var filterSlot = root.querySelector('[data-view-filter]');
            if (body) body.classList.add('is-swapping');

            fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' })
                .then(function (r) { return r.text(); })
                .then(function (html) {
                    var doc = new DOMParser().parseFromString(html, 'text/html');
                    var newBody = doc.querySelector('[data-view-body]');
                    var newFilter = doc.querySelector('[data-view-filter]');
                    if (!newBody) { window.location.href = url; return; }   // 抽換失敗 → 降級
                    if (body) body.innerHTML = newBody.innerHTML;
                    if (filterSlot && newFilter) filterSlot.innerHTML = newFilter.innerHTML;
                    // 換入內容的殼層增強(icon / 自訂下拉 / 篩選 / 必填守門)
                    if (window.renderLucideIcons) window.renderLucideIcons();
                    if (window.BDropdown) window.BDropdown.init(root);
                    if (window.BRequireFill) window.BRequireFill.refreshAll(root);
                    history.pushState({ spa: true }, '', url);
                })
                .catch(function () { window.location.href = url; })
                .finally(function () {
                    if (body) body.classList.remove('is-swapping');
                    switching = false;
                });
        }

        items.forEach(function (a) {
            a.addEventListener('click', function (e) {
                e.preventDefault();
                if (a.classList.contains('active')) return;
                switchView(a);
            });
        });

        // 上一頁/下一頁:若回到 billing 的另一個 view,對齊 active 並抽換(popstate 只在 query 變時輪到這裡)
        function onPop() {
            var want = new URLSearchParams(location.search).get('view') === 'orders' ? 'orders' : 'records';
            var target = items.filter(function (a) { return (a.getAttribute('href') || '').indexOf('view=' + want) !== -1; })[0];
            if (target && !target.classList.contains('active')) switchView(target);
        }
        window.addEventListener('popstate', onPop);

        // cleanup:離開頁面時解除監聽
        return function () {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('popstate', onPop);
        };
    };

    document.addEventListener('submit', function (e) {
        const f = e.target;
        if (!f.classList || !f.classList.contains('b-bk-form')) return;
        const statusEl = f.querySelector('[name="status"]');
        const status = statusEl ? statusEl.value : '';
        const payment = f.dataset.payment || '';
        // 現場付款(尚未收款)+ 狀態改為已確認/已報到 → 詢問收到金額
        // 自訂輸入框(BDialog.prompt)是非同步:先擋下這次送出,問完再用原生 submit()
        // 續送(原生 submit() 不再觸發 submit 事件 → 不會重複詢問)。
        // 語意對齊原生 prompt:取消(null)或留空仍照舊送出、只是不帶金額。
        if ((status === 'confirmed' || status === 'checked_in') && payment === 'onsite') {
            e.preventDefault();
            const def = f.dataset.total || '';
            BDialog.prompt({
                title: '現場收款',
                desc: '請輸入收到的金額',
                value: def,
                inputMode: 'decimal'
            }).then(function (amt) {
                if (amt !== null && amt !== '') {
                    let inp = f.querySelector('[name="collect_amount"]');
                    if (!inp) {
                        inp = document.createElement('input');
                        inp.type = 'hidden';
                        inp.name = 'collect_amount';
                        f.appendChild(inp);
                    }
                    inp.value = amt;
                }
                f.submit();
            });
        }
    });
})();
