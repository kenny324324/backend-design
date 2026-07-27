// [JustGolf B] 後台主題:Logo / 首頁大圖 上傳 + 前台版型骨架即時預覽(仿真,非真前台)
// SPA:註冊為 window.pageInit.theme(root),首次載入與 SPA 換頁皆由 spa.js 呼叫(可重入)。
(function () {
    window.pageInit = window.pageInit || {};
    window.pageInit.theme = function (root) {
        root = root || document;
        const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
        const frame = root.querySelector('#b-theme-frame');

        function val(sel) { const el = root.querySelector(sel); return el ? el.value : ''; }

        // 把表單「當前(含未存)」值注入 iframe 內的真前台:
        // 前台 b/base.html 把主色/點綴色寫進 :root、字型寫進 body、大圖是 hero <section> 的 inline background。
        // 同源 → 直接改 iframe 的 documentElement / body / 節點即可即時反映,不需重新整理、不動後端。
        function syncPreview() {
            if (!frame) return;
            let doc;
            try { doc = frame.contentDocument || frame.contentWindow.document; } catch (e) { return; }
            if (!doc || !doc.documentElement) return;

            const primary = val('[name="primary_color"]') || '#173226';
            const accent = val('[name="accent_color"]') || '#b8975a';
            const font = val('[name="font_family"]') || "'Noto Sans TC', system-ui, sans-serif";
            const copy = val('[name="hero_copy"]');
            const heroImg = val('[name="hero_image"]');
            const logo = val('[name="logo_url"]');

            const rootEl = doc.documentElement;
            rootEl.style.setProperty('--b-primary', primary);
            rootEl.style.setProperty('--b-accent', accent);
            if (doc.body) doc.body.style.fontFamily = font;

            // hero 大圖:前台首頁第一個 section(.b-bg-primary)用 inline background 疊暗色漸層
            const hero = doc.querySelector('section.b-bg-primary, section.relative');
            if (hero) {
                if (heroImg) {
                    hero.style.backgroundImage = "linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)),url('" + heroImg + "')";
                    hero.style.backgroundSize = 'cover';
                    hero.style.backgroundPosition = 'center';
                    hero.classList.add('text-white');
                } else {
                    hero.style.backgroundImage = '';
                }
                const copyEl = hero.querySelector('p.leading-8, p.text-white\\/85');
                if (copyEl) { copyEl.textContent = copy; copyEl.style.display = copy ? '' : 'none'; }
            }

            // header logo:有值就設 src、沒值就藏;原本無 logo 時前台不渲染 <img> → 動態補一個(僅預覽用)
            const header = doc.querySelector('header');
            if (header) {
                let logoImg = header.querySelector('img');
                if (logo) {
                    if (!logoImg) {
                        const nameLink = header.querySelector('a.flex.items-center');
                        if (nameLink) {
                            logoImg = doc.createElement('img');
                            logoImg.className = 'h-9 w-auto max-w-[100px] object-contain';
                            logoImg.alt = '';
                            nameLink.insertBefore(logoImg, nameLink.firstChild);
                        }
                    }
                    if (logoImg) { logoImg.src = logo; logoImg.style.display = ''; }
                } else if (logoImg) {
                    logoImg.style.display = 'none';
                }
            }
        }

        // iframe 載入完成才能注入;之後每次表單改動即時再注入
        if (frame) {
            frame.addEventListener('load', syncPreview);
            try { if (frame.contentDocument && frame.contentDocument.readyState === 'complete') syncPreview(); } catch (e) { /* cross-origin? 略過 */ }
        }
        root.querySelectorAll('.b-theme-fields [name]').forEach(function (el) {
            el.addEventListener('input', syncPreview);
            el.addEventListener('change', syncPreview);
        });

        // ── 圖片上傳(logo / hero):選完檔案「即刻自動上傳」;按鈕文字暫顯狀態後復原 ──
        root.querySelectorAll('.b-img-upload').forEach(function (box) {
            const url = box.dataset.url;
            const fileInput = box.querySelector('.b-img-file');
            const valInput = box.querySelector('.b-img-val');
            const previewImg = box.querySelector('.b-img-preview');
            const btnLabel = box.querySelector('[data-file-name]');
            if (!fileInput) return;
            const DEFAULT_LABEL = '選擇並上傳';

            function setLabel(text, state) {
                if (!btnLabel) return;
                btnLabel.textContent = text;
                btnLabel.classList.remove('is-uploading', 'is-error');
                if (state) btnLabel.classList.add(state);
            }

            fileInput.addEventListener('change', function () {
                const f = fileInput.files && fileInput.files[0];
                if (!f) return;
                setLabel('上傳中…', 'is-uploading');
                box.classList.add('is-uploading');
                const fd = new FormData();
                fd.append('file', f);
                fetch(url, { method: 'POST', headers: { 'X-CSRFToken': csrf }, body: fd })
                    .then(r => r.json())
                    .then(function (data) {
                        if (data.success && data.url) {
                            valInput.value = data.url;
                            previewImg.src = data.url;
                            previewImg.style.display = '';
                            box.classList.remove('is-empty');
                            setLabel('已更新');
                            setTimeout(() => setLabel(DEFAULT_LABEL), 1600);
                            syncPreview();
                        } else {
                            setLabel('上傳失敗', 'is-error');
                            setTimeout(() => setLabel(DEFAULT_LABEL), 2200);
                        }
                    })
                    .catch(function () { setLabel('上傳失敗', 'is-error'); setTimeout(() => setLabel(DEFAULT_LABEL), 2200); })
                    .finally(function () { box.classList.remove('is-uploading'); fileInput.value = ''; });
            });
        });

        syncPreview();
    };
})();
