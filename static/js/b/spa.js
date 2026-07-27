// [JustGolf B] 球場後台 SPA 殼層:攔截側邊欄/header 點擊 → fetch 整頁 → 抽換 #main-content,
// 側邊欄/header/flyout/選中狀態永不重建,URL 用 history.pushState 同步。route 不改(仍回整頁,前端抽 #main-content)。
//
// 殼層只載一次(base.html),綁在 document/window 上。各頁專屬 JS 改成 window.pageInit.<name>(root) 可重入函式,
// spa.js 換頁後依當前頁呼叫;離開頁前呼叫上一頁的 cleanup(相機等資源)。
//
// 與 filter.js 共存:filter.js 只換 [data-filter-target](表格區、同 path 僅 query 變);
// spa.js 換整個 #main-content(path 變)。popstate 依「path 是否改變」分工,避免互踩。
(function () {
  var MAIN = '#main-content';
  var EXTRA_CSS_START = 'b-spa-extra-css-start';
  var EXTRA_CSS_END = 'b-spa-extra-css-end';
  var EXTRA_CSS_ATTR = 'data-spa-extra-css';

  // spa.js 自己追蹤「目前 DOM 載入的 path」(不依賴 Vue/DOM 競態),用於 popstate 判斷是否換了 path。
  var lastPath = location.pathname;

  // 目前頁面的「頁名」(endpoint 尾段 / 路徑尾段),決定要跑哪個 pageInit、是否同頁
  function pageNameFromPath(path) {
    return String(path || '')
      .split('?')[0].split('#')[0]
      .replace(/\/+$/, '')
      .split('/').pop()
      .toLowerCase() || 'dashboard';
  }
  function samePath(a, b) {
    var na = (a || '').split('?')[0].split('#')[0].replace(/\/+$/, '');
    var nb = (b || '').split('?')[0].split('#')[0].replace(/\/+$/, '');
    return na === nb;
  }

  // ---- 頁專屬 JS 生命週期 ----
  // 各頁把初始化掛 window.pageInit.<name> = function(root){ ... return cleanupFn|undefined }
  // 回傳值若是函式 → 視為該頁 cleanup(離開頁時呼叫,例如停相機)。
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

  // ---- 殼層增強重綁(換頁後對新內容跑一次) ----
  function reEnhance(main) {
    if (window.renderLucideIcons) window.renderLucideIcons();
    if (window.BDropdown) window.BDropdown.init(main || document);
    if (window.BRequireFill) window.BRequireFill.refreshAll(main || document);
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

  // ---- 更新 Vue 側邊欄 active 高亮(不重建 DOM) ----
  function syncActive(path) {
    var app = window.__bApp;
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

    // 離開舊頁:先 cleanup(停相機等)
    runCleanup();
    syncExtraCss(doc);

    // main_modifier class 一起更新(reviews 的 is-fixed-h 等);保留 main-content 基底 class
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

    // 殼層增強 + active 高亮 + 新頁 JS
    reEnhance(current);
    syncActive(url);
    runPageInit(pageNameFromPath(url), current);

    // 捲回頂端(換頁語意)
    current.scrollTop = 0;
    try { window.scrollTo(0, 0); } catch (e) {}
    // 焦點移到主內容(無障礙):新內容已 tabindex=-1
    try { current.focus({ preventScroll: true }); } catch (e) {}
    lastPath = (url || location.pathname).split('?')[0].split('#')[0];
    return true;
  }

  function navigate(url, push) {
    var current = document.querySelector(MAIN);
    // 延遲顯示「載入態」(變灰):fetch 多半很快(本機 + 已登入),180ms 內回來就完全不變灰 → 俐落、無停頓感。
    // 只有 fetch 真的慢(>180ms)才加載入態,避免長等待時畫面像當掉(又不會「閃一下載入又消失」)。
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
        if (r.redirected && !samePathHost(r.url)) { window.location.href = url; return null; }
        return r.text();
      })
      .then(function (html) {
        if (html == null) return;
        if (!applyMain(html, url)) { window.location.href = url; return; }  // 抽換失敗 → 降級整頁
        if (push) history.pushState({ spa: true }, '', url);
      })
      .catch(function () { window.location.href = url; })                    // 網路錯 → 降級
      .finally(clearLoading);
  }

  function samePathHost(u) {
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
    // 同源 + 同 course 的後台路徑才接管
    var url;
    try { url = new URL(a.href, window.location.origin); } catch (e) { return false; }
    if (url.origin !== window.location.origin) return false;
    var prefix = (window.BASE_URL || '') + '/cms/' + (window.COURSE_CODE || '') + '/';
    if (url.pathname.indexOf(prefix) !== 0) return false;
    // 篩選面板的重置連結交給 filter.js(它只換表格區)
    if (a.closest && a.closest('.b-pop-foot')) return false;
    // 同 path 僅 query 不同(篩選) → 不由 SPA 接管(讓 filter.js / 原生處理)
    if (samePath(url.pathname, window.location.pathname) && url.search) return false;
    return true;
  }

  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('a[href]');
    if (!shouldHandle(a, ev)) return;
    ev.preventDefault();
    var url = new URL(a.href, window.location.origin);
    // 點到目前頁本身(同 path 無 query) → 不動作,避免無謂重載
    if (samePath(url.pathname, location.pathname) && !url.search) return;
    navigate(a.href, true);
  });

  // ---- 上一頁/下一頁 ----
  // filter.js 也有 popstate(只在同 path 僅 query 變時換表格區)。兩者協調:
  //   - path 改變    → SPA 換整頁(這裡處理),並 stopImmediatePropagation 阻止 filter.js 同輪誤觸發整頁導航
  //   - path 不變(僅 query/篩選) → 不處理,讓 filter.js 接管
  // 用 capture 階段搶先於 filter.js(bubble)執行;lastPath 為 spa.js 自己追蹤的當前 DOM path。
  window.addEventListener('popstate', function (ev) {
    if (!document.querySelector(MAIN)) return;
    if (samePath(location.pathname, lastPath)) return;   // path 沒變(只 query)→ filter.js 處理
    if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();  // 阻止 filter.js 對換 path 的 entry 動作
    navigate(location.pathname + location.search, false);
  }, true);

  // ---- 首次載入:把當前頁的 pageInit 跑起來 ----
  markInitialExtraCss();

  function bootCurrentPage() {
    var main = document.querySelector(MAIN);
    if (!main) return;
    runPageInit(pageNameFromPath(location.pathname), main);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootCurrentPage);
  } else {
    bootCurrentPage();
  }

  window.BSpa = { navigate: navigate };
})();
