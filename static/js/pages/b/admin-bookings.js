// [JustGolf B] 後台預約管理:篩選收合 + 卡片輪播(左右滑動切換、第N筆)
// SPA:註冊為 window.pageInit.bookings(root),首次載入與 SPA 換頁皆由 spa.js 呼叫(可重入)。
(function () {
    window.pageInit = window.pageInit || {};
    window.pageInit.bookings = function (root) {
        root = root || document;
        // 篩選收合
        const toggle = root.querySelector('#bm-filter-toggle');
        const filter = root.querySelector('#bm-filter');
        if (toggle && filter) {
            toggle.addEventListener('click', function () { filter.classList.toggle('hidden'); });
        }

        // 卡片輪播
        const cards = root.querySelector('#bm-cards');
        const idxEl = root.querySelector('#bm-idx');
        if (!cards || !idxEl) return;
        const items = Array.from(cards.querySelectorAll('.bm-card'));
        if (!items.length) return;

        function base() { return items[0].offsetLeft; }
        function current() {
            const sl = cards.scrollLeft, b = base();
            let best = 0, bestD = Infinity;
            items.forEach(function (it, i) {
                const d = Math.abs((it.offsetLeft - b) - sl);
                if (d < bestD) { bestD = d; best = i; }
            });
            return best;
        }
        function refresh() { idxEl.textContent = current() + 1; }
        function go(delta) {
            const n = Math.max(0, Math.min(items.length - 1, current() + delta));
            cards.scrollTo({ left: items[n].offsetLeft - base(), behavior: 'smooth' });
        }

        let raf = null;
        cards.addEventListener('scroll', function () {
            if (raf) return;
            raf = window.requestAnimationFrame(function () { refresh(); raf = null; });
        });
        const prev = root.querySelector('#bm-prev');
        const next = root.querySelector('#bm-next');
        if (prev) prev.addEventListener('click', function () { go(-1); });
        if (next) next.addEventListener('click', function () { go(1); });
        refresh();
    };
})();
