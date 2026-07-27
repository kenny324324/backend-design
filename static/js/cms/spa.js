// [JustGolf A] 模擬器後台 SPA 殼層:移植自 js/b/spa.js(球場後台),攔截後台連結 → fetch 整頁 → 抽換 #main-content,
// 側邊欄/header/選中狀態永不重建,URL 用 history.pushState 同步。route 不改(仍回整頁,前端抽 #main-content)。
//
// 與 B 版差異:
//   1. 前綴 = /cms/(不帶 course_code);預設頁名 'index'(/cms、/cms/ 都算首頁)。
//   2. A 頁面內容是 Vue app(base.html 的 pageInit 註冊表負責 mount/unmount),
//      pageInit 讀 location.search 初始化篩選 → pushState 提前到 applyMain 之前執行。
//   3. A 沒有 filter.js;同 path 僅 query 變的連結不接管(交給原生整頁導航)。
(function () {
  var MAIN = '#main-content';
  var EXTRA_CSS_START = 'b-spa-extra-css-start';
  var EXTRA_CSS_END = 'b-spa-extra-css-end';
  var EXTRA_CSS_ATTR = 'data-spa-extra-css';

  // spa.js 自己追蹤「目前 DOM 載入的 path」(不依賴 Vue/DOM 競態),用於 popstate 判斷是否換了 path。
  var lastPath = location.pathname;

  // 目前頁面的「頁名」(路徑尾段),決定要跑哪個 pageInit、是否同頁
  function pageNameFromPath(path) {
    var name = String(path || '')
      .split('?')[0].split('#')[0]
      .replace(/\/+$/, '')
      .split('/').pop()
      .toLowerCase();
    if (!name || name === 'cms') return 'index';   // /cms、/cms/ → 首頁
    return name;
  }
  function samePath(a, b) {
    var na = (a || '').split('?')[0].split('#')[0].replace(/\/+$/, '');
    var nb = (b || '').split('?')[0].split('#')[0].replace(/\/+$/, '');
    return na === nb;
  }

  // ---- 頁專屬 JS 生命週期 ----
  // base.html 的註冊表把每頁掛成 window.pageInit.<name> = function(){ mount page app; return cleanupFn }
  window.pageInit = window.pageInit || {};
  var currentCleanup = null;

  function runCleanup() {
    if (typeof currentCleanup === 'function') {
      try { currentCleanup(); } catch (e) { console.error('[spa] page cleanup error', e); }
    }
    currentCleanup = null;
  }

  function runPageInit(name, root) {
    var fn = window.pageInit[name];
    if (typeof fn !== 'function') return;
    try {
      var ret = fn(root || document);
      if (typeof ret === 'function') currentCleanup = ret;
    } catch (e) {
      console.error('[spa] pageInit[' + name + '] error', e);
    }
  }

  // ---- 殼層增強重綁(頁面 app mount 完成後對新內容跑一次) ----
  function reEnhance(main) {
    if (window.renderLucideIcons) window.renderLucideIcons();
    if (window.BDropdown) window.BDropdown.init(main || document);
    if (window.BRequireFill) window.BRequireFill.refreshAll(main || document);
    if (window.BModalWatch) window.BModalWatch.refresh(main || document);   // 新頁 modal 節點重新 observe
  }

  function isManagedCssNode(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.tagName === 'STYLE') return true;
    if (node.tagName === 'LINK') {
      return (node.getAttribute('rel') || '').toLowerCase() === 'stylesheet';
    }
    return false;
  }

  function extraCssNodes(head) {
    var nodes = [];
    var inBlock = false;
    Array.prototype.forEach.call((head && head.childNodes) || [], function (node) {
      if (node.nodeType === 8) {
        var marker = (node.nodeValue || '').trim();
        if (marker === EXTRA_CSS_START) { inBlock = true; return; }
        if (marker === EXTRA_CSS_END) { inBlock = false; return; }
      }
      if (inBlock && isManagedCssNode(node)) nodes.push(node);
    });
    return nodes;
  }

  function markInitialExtraCss() {
    extraCssNodes(document.head).forEach(function (node) {
      node.setAttribute(EXTRA_CSS_ATTR, 'true');
    });
  }

  function syncExtraCss(doc) {
    document.head.querySelectorAll('[' + EXTRA_CSS_ATTR + '="true"]').forEach(function (node) {
      node.remove();
    });
    extraCssNodes(doc.head).forEach(function (node) {
      var clone = node.cloneNode(true);
      clone.setAttribute(EXTRA_CSS_ATTR, 'true');
      document.head.appendChild(clone);
    });
  }

  // ---- 更新殼層側邊欄 active 高亮(不重建 DOM) ----
  function syncActive(path) {
    var app = window.__aApp;
    if (!app) return;
    app.currentPath = (path || '').split('#')[0];
    app.currentPage = pageNameFromPath(path);
  }

  // ---- 核心:抽換 #main-content ----
  function applyMain(html, url) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var fresh = doc.querySelector(MAIN);
    var current = document.querySelector(MAIN);
    if (!fresh || !current) return false;

    // 離開舊頁:先 cleanup(unmount 頁面 app → 停相機/清計時器/解監聽、銷毀 DataTables)
    runCleanup();
    syncExtraCss(doc);

    // main_modifier class 一起更新(index 的 is-index-fill 等);innerHTML 換成新頁
    current.className = fresh.className;
    current.innerHTML = fresh.innerHTML;

    // 換好淡入(克制過場):加動畫 class,結束後移除以免影響後續
    current.classList.add('is-spa-entered');
    current.addEventListener('animationend', function onEnd() {
      current.classList.remove('is-spa-entered');
      current.removeEventListener('animationend', onEnd);
    });

    // title 一起換(瀏覽器分頁標題)
    var freshTitle = doc.querySelector('title');
    if (freshTitle) document.title = freshTitle.textContent;

    // active 高亮 → 新頁 app mount → 殼層增強(BDropdown 等要等 mount 後的 DOM)
    syncActive(url);
    runPageInit(pageNameFromPath(url), current);
    current.classList.add('is-page-ready');   // 無註冊頁(manual 等)也要解除防閃隱藏;註冊頁已在 pageInit 加過,重複無妨
    reEnhance(current);

    // 捲回頂端(換頁語意)
    current.scrollTop = 0;
    try { window.scrollTo(0, 0); } catch (e) {}
    // 焦點移到主內容(無障礙):新內容已 tabindex=-1
    try { current.focus({ preventScroll: true }); } catch (e) {}
    // 一律存 pathname(點擊導航進來的 url 是絕對網址,直接存會讓 popstate 的同 path 判斷永遠不成立)
    try { lastPath = new URL(url || location.pathname, window.location.origin).pathname; }
    catch (e) { lastPath = location.pathname; }
    return true;
  }

  var navSeq = 0;   // 導航序號:慢的舊回應不得覆蓋使用者後來選的頁(點兩下/Back 競態)

  function navigate(url, push) {
    var seq = ++navSeq;
    // 延遲顯示「載入態」(變灰):fetch 多半很快,180ms 內回來就完全不變灰 → 俐落、無停頓感。
    var loadingTimer = setTimeout(function () {
      var m = document.querySelector(MAIN);
      if (m) m.classList.add('is-spa-loading');
    }, 180);
    function clearLoading() {
      clearTimeout(loadingTimer);
      var m = document.querySelector(MAIN);
      if (m) m.classList.remove('is-spa-loading');
    }
    fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' })
      .then(function (r) {
        // 被重導到登入頁等非預期回應 → 整頁導航(讓瀏覽器處理)
        if (r.redirected && !sameOrigin(r.url)) { window.location.href = url; return null; }
        return r.text();
      })
      .then(function (html) {
        if (html == null) return;
        if (seq !== navSeq) return;   // 已有更新的導航 → 丟棄這筆舊回應
        // A 版:pushState 先於 applyMain —— 頁面 app 的 pageInit 會讀 location.search 初始化篩選,
        // 必須先把 URL 換成目標網址(B 版順序相反,因 B 頁面不在 init 時讀 URL)。
        if (push) history.pushState({ spa: true }, '', url);
        if (!applyMain(html, url)) { window.location.reload(); return; }  // 抽換失敗 → 降級整頁(URL 已更新)
      })
      .catch(function () { if (seq === navSeq) window.location.href = url; })  // 網路錯 → 降級
      .finally(clearLoading);
  }

  function sameOrigin(u) {
    try { return new URL(u, window.location.origin).origin === window.location.origin; }
    catch (e) { return true; }
  }

  // ---- 判斷一個連結是否該由 SPA 接管 ----
  function shouldHandle(a, ev) {
    if (!a) return false;
    if (ev.defaultPrevented) return false;
    if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return false;
    if (a.target && a.target !== '' && a.target !== '_self') return false;       // _blank 等
    if (a.hasAttribute('download')) return false;
    if (a.dataset.noSpa !== undefined) return false;                              // 明確退出 SPA
    var href = a.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#' || href.indexOf('javascript:') === 0) return false;
    // 同源 + 模擬器後台路徑(/cms/…)才接管
    var url;
    try { url = new URL(a.href, window.location.origin); } catch (e) { return false; }
    if (url.origin !== window.location.origin) return false;
    var prefix = (window.BASE_URL || '') + '/cms';
    if (url.pathname !== prefix && url.pathname.indexOf(prefix + '/') !== 0) return false;
    // 非頁面路徑不接管:登入/登出/驗證碼、檔案下載與上傳資源(/cms/upload/*)
    if (url.pathname.indexOf(prefix + '/upload/') === 0) return false;
    var tail = pageNameFromPath(url.pathname);
    if (tail === 'login' || tail === 'logout' || tail === 'captcha') return false;
    // 同 path 僅 query 不同(篩選)→ 不接管(原生整頁導航)
    if (samePath(url.pathname, window.location.pathname) && url.search) return false;
    return true;
  }

  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('a[href]');
    if (!shouldHandle(a, ev)) return;
    ev.preventDefault();
    var url = new URL(a.href, window.location.origin);
    // 點到目前頁本身(同 path 無 query)→ 只有當前網址也沒 query 才略過;
    // 當前帶著篩選 query(例如首頁待辦連進來的 ?status=…)時,點側欄同頁 = 清除篩選,要真的導航。
    if (samePath(url.pathname, location.pathname) && !url.search && !location.search) return;
    navigate(a.href, true);
  });

  // ---- 上一頁/下一頁 ----
  // path 改變 → SPA 換整頁;path 不變(僅 query,例如頁面 replaceState 的篩選)→ 不處理。
  window.addEventListener('popstate', function (ev) {
    if (!document.querySelector(MAIN)) return;
    if (samePath(location.pathname, lastPath)) return;   // path 沒變(只 query)→ 不動作
    if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    navigate(location.pathname + location.search, false);
  }, true);

  // ---- 首次載入:把當前頁的 pageInit 跑起來 ----
  markInitialExtraCss();

  function bootCurrentPage() {
    var main = document.querySelector(MAIN);
    if (!main) return;
    runPageInit(pageNameFromPath(location.pathname), main);
    main.classList.add('is-page-ready');   // 首載 mount 完成 → 解除防閃隱藏(manual 等無註冊頁也適用)
    reEnhance(main);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootCurrentPage);
  } else {
    bootCurrentPage();
  }

  window.ASpa = { navigate: navigate };
})();
