// [JustGolf B] 後台報到:video + jsQR(比照 cms/booking_manage 的掃描方式)
// SPA:註冊為 window.pageInit.checkin(root),回傳 cleanup → 離開頁時 spa.js 呼叫(務必停相機 stream,否則鏡頭一直開)。
(function () {
    window.pageInit = window.pageInit || {};
    window.pageInit.checkin = function (root) {
        root = root || document;
        const el = root.querySelector('#b-checkin');
        if (!el) return;
        const lookupUrl = el.dataset.lookupUrl;
        const confirmUrl = el.dataset.confirmUrl;
        const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
        const video = root.querySelector('#b-video');
        const camMsg = root.querySelector('#b-cam-msg');
        const camIdle = root.querySelector('#b-cam-idle');
        const startBtn = root.querySelector('#b-scan-start');
        const stopBtn = root.querySelector('#b-scan-stop');
        const resultBox = root.querySelector('#b-result');

        const stLabel = { pending: '待確認', confirmed: '已確認', cancelled: '已取消', checked_in: '已報到', no_show: '未到' };
        const payLabel = { unpaid: '未付款', paid: '已付款', onsite: '現場付款', failed: '付款失敗' };
        // 狀態/付款 → .b-badge 色調(對齊 dashboard 的配色語意)
        const stTone = { pending: 'warn', confirmed: 'ok', cancelled: 'neutral', checked_in: 'ok', no_show: 'neutral' };
        const payTone = { unpaid: 'warn', paid: 'ok', onsite: 'warn', failed: 'bad' };
        const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const badge = (label, tone) => '<span class="b-badge ' + tone + '"><span class="dot"></span>' + esc(label) + '</span>';

        let stream = null, timer = null, detector = null, canvas = null, ctx = null;
        let lastVal = '', lastAt = 0, processing = false;

        function camSupported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }

        function startScan() {
            // 不預先清空提示,避免「請將 QR 對準畫面」在相機權限解析前先消失再出現(閃爍)。
            if (!window.isSecureContext) {
                camMsg.textContent = '相機只允許 HTTPS 或 localhost,請改用 https:// 網址開啟後台。';
                return;
            }
            if (!camSupported()) {
                camMsg.textContent = '此瀏覽器不支援相機,請用新版 Chrome / Edge。';
                return;
            }
            if ('BarcodeDetector' in window) {
                try { detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { detector = null; }
            }
            if (!detector && !window.jsQR) {
                camMsg.textContent = 'QR 解碼器尚未載入,請重新整理頁面。';
                return;
            }
            navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
                .then(function (s) {
                    stream = s;
                    video.srcObject = s;
                    video.play();
                    startBtn.classList.add('hidden');
                    stopBtn.classList.remove('hidden');
                    if (camIdle) camIdle.classList.add('hidden');
                    camMsg.textContent = '請將 QR Code 對準畫面。';
                    timer = window.setInterval(scanFrame, 500);
                })
                .catch(function (err) {
                    camMsg.textContent = '無法開啟相機(' + (err && err.name ? err.name : '錯誤') + '):請允許相機權限,或改用 HTTPS。';
                });
        }

        function stopScan() {
            if (timer) { window.clearInterval(timer); timer = null; }
            if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
            if (video) video.srcObject = null;
            if (startBtn) startBtn.classList.remove('hidden');
            if (stopBtn) stopBtn.classList.add('hidden');
            if (camIdle) camIdle.classList.remove('hidden');
        }

        function decodeJsQR() {
            const w = video.videoWidth, h = video.videoHeight;
            if (!w || !h || !window.jsQR) return '';
            if (!canvas) { canvas = document.createElement('canvas'); ctx = canvas.getContext('2d', { willReadFrequently: true }); }
            canvas.width = w; canvas.height = h;
            ctx.drawImage(video, 0, 0, w, h);
            const img = ctx.getImageData(0, 0, w, h);
            const code = window.jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
            return code ? code.data : '';
        }

        async function scanFrame() {
            if (!stream || processing) return;
            let value = '';
            try {
                if (detector) {
                    const codes = await detector.detect(video);
                    value = codes && codes.length ? codes[0].rawValue : '';
                } else {
                    value = decodeJsQR();
                }
            } catch (e) { value = ''; }
            const now = Date.now();
            if (!value || (value === lastVal && now - lastAt < 3000)) return;
            lastVal = value; lastAt = now;
            stopScan();
            lookup(value.trim());
        }

        function lookup(code) {
            if (!code) return;
            resultBox.innerHTML = '<div class="b-checkin-loading"><i data-lucide="loader-circle" class="b-spin" aria-hidden="true"></i><span>查詢中…</span></div>';
            if (window.lucide) window.lucide.createIcons({ root: resultBox });
            fetch(lookupUrl + '?code=' + encodeURIComponent(code), { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
                .then(r => r.json())
                .then(function (data) {
                    if (!data.success) {
                        resultBox.innerHTML =
                            '<div class="b-alert danger"><i data-lucide="search-x" aria-hidden="true"></i>' +
                            '<div><p class="b-alert-title">查無預約</p><p>' + esc(data.message || '找不到符合的預約，請確認編號或 QR。') + '</p></div></div>';
                        if (window.lucide) window.lucide.createIcons({ root: resultBox });
                        return;
                    }
                    const b = data.booking;
                    const already = b.status === 'checked_in';
                    const meta = [b.play_date, b.tee_time, b.zone].filter(Boolean).map(esc).join(' · ');
                    resultBox.innerHTML =
                        '<div class="b-checkin-detail">' +
                        '<div class="b-checkin-code num">' + esc(b.code) + '</div>' +
                        '<div class="b-checkin-guest">' + esc(b.guest_name) + '<span>' + esc(b.guest_phone) + '</span></div>' +
                        '<dl class="b-checkin-meta">' +
                        '<div><dt>開球</dt><dd>' + meta + ' · ' + esc(b.players) + ' 人</dd></div>' +
                        '<div><dt>預約狀態</dt><dd>' + badge(stLabel[b.status] || b.status, stTone[b.status] || 'neutral') + '</dd></div>' +
                        '<div><dt>付款</dt><dd>' + badge(payLabel[b.payment_status] || b.payment_status, payTone[b.payment_status] || 'neutral') + '</dd></div>' +
                        '</dl>' +
                        (already
                            ? '<div class="b-alert success"><i data-lucide="check-circle-2" aria-hidden="true"></i><div><p class="b-alert-title">已完成報到</p><p>此組已於稍早完成報到。</p></div></div>'
                            : (b.status === 'cancelled'
                                ? '<div class="b-alert warning"><i data-lucide="ban" aria-hidden="true"></i><div><p class="b-alert-title">此預約已取消</p><p>已取消的預約無法報到。</p></div></div>'
                                : '<button type="button" id="b-confirm" data-code="' + esc(b.code) + '" class="b-btn b-btn-primary b-btn-lg b-btn-block b-checkin-confirm">' +
                                  '<i data-lucide="user-check" aria-hidden="true"></i><span>確認報到</span></button>')) +
                        '</div>';
                    const cbtn = resultBox.querySelector('#b-confirm');
                    if (cbtn) cbtn.addEventListener('click', function () { doConfirm(cbtn.dataset.code); });
                    if (window.lucide) window.lucide.createIcons({ root: resultBox });
                })
                .catch(() => {
                    resultBox.innerHTML = '<div class="b-alert danger"><i data-lucide="triangle-alert" aria-hidden="true"></i><div><p class="b-alert-title">查詢失敗</p><p>連線發生問題，請稍後再試。</p></div></div>';
                    if (window.lucide) window.lucide.createIcons({ root: resultBox });
                });
        }

        function doConfirm(code) {
            processing = true;
            const fd = new FormData();
            fd.append('code', code);
            fetch(confirmUrl, { method: 'POST', headers: { 'X-CSRFToken': csrf }, body: fd })
                .then(r => r.json())
                .then(function (data) {
                    processing = false;
                    resultBox.innerHTML = data.success
                        ? '<div class="b-checkin-done"><span class="b-checkin-done-icon"><i data-lucide="check" aria-hidden="true"></i></span>' +
                          '<p class="b-checkin-done-title">報到成功</p><p class="b-checkin-done-code num">' + esc(code) + '</p></div>'
                        : '<div class="b-alert danger"><i data-lucide="x-circle" aria-hidden="true"></i><div><p class="b-alert-title">報到失敗</p><p>' + esc(data.message || '請重試或改用手動查詢。') + '</p></div></div>';
                    if (window.lucide) window.lucide.createIcons({ root: resultBox });
                })
                .catch(() => {
                    processing = false;
                    resultBox.innerHTML = '<div class="b-alert danger"><i data-lucide="triangle-alert" aria-hidden="true"></i><div><p class="b-alert-title">報到失敗</p><p>連線發生問題，請稍後再試。</p></div></div>';
                    if (window.lucide) window.lucide.createIcons({ root: resultBox });
                });
        }

        startBtn.addEventListener('click', startScan);
        stopBtn.addEventListener('click', stopScan);
        const manualBtn = root.querySelector('#b-manual-btn');
        if (manualBtn) manualBtn.addEventListener('click', function () {
            lookup(root.querySelector('#b-manual').value.trim());
        });

        // 離開此頁(SPA 換頁)→ 務必停相機 stream,否則鏡頭一直開著
        return function cleanup() { stopScan(); };
    };
})();
