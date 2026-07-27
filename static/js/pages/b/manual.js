// [JustGolf B] 後台操作手冊:側邊頁內導覽 scrollspy + 平滑捲動。
// 版型 = 固定高、左框內捲(.b-manual-scroll,同排程設定 tab),頁面本身不捲 → 監聽框的捲動。
// SPA:註冊為 window.pageInit.manual(root),回傳 cleanup(解除捲動監聽)。
// 另註冊 admin-manual 別名:離線預覽路徑 /dev/b-preview/admin-manual 的頁名不同,共用同一個 init。
(function () {
    window.pageInit = window.pageInit || {};

    function initManual(root) {
        root = root || document;
        const wrap = root.querySelector('#b-manual');
        if (!wrap) return;
        const scroller = wrap.querySelector('.b-manual-scroll');
        if (!scroller) return;

        const links = Array.prototype.slice.call(wrap.querySelectorAll('.b-manual-toc a[href^="#"]'));
        const sections = links
            .map(a => wrap.querySelector(a.getAttribute('href')))
            .filter(Boolean);
        if (!sections.length) return;

        function setActive(id) {
            links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + id));
        }

        // 點擊 → 框內平滑捲到該段
        function onLinkClick(e) {
            const target = wrap.querySelector(this.getAttribute('href'));
            if (!target) return;
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            history.replaceState(null, '', this.getAttribute('href'));
        }
        links.forEach(a => a.addEventListener('click', onLinkClick));

        // scrollspy:以框頂為基準的判定線,取「頂端已越過判定線」的最後一段;捲到框底時強制亮最後一段
        let ticking = false;
        function update() {
            ticking = false;
            const line = scroller.getBoundingClientRect().top + 60;
            let current = sections[0];
            sections.forEach(sec => {
                if (sec.getBoundingClientRect().top <= line) current = sec;
            });
            if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) {
                current = sections[sections.length - 1];
            }
            setActive(current.id);
        }
        function onScroll() {
            if (!ticking) {
                ticking = true;
                requestAnimationFrame(update);
            }
        }

        scroller.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll, { passive: true });
        update();

        return function cleanup() {
            scroller.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);
        };
    }

    window.pageInit.manual = initManual;
    window.pageInit['admin-manual'] = initManual;   // 離線預覽頁名
})();
