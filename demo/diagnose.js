/* ═══════════════════════════════════════════════════════════════════
   [backend-design] 接入自我診斷 — 檢查「為什麼有些樣式沒套到」
   ═══════════════════════════════════════════════════════════════════
   用法:在你的專案「出問題的後台頁面」按 F12 開 Console,
        整檔複製貼上按 Enter,看報告的 ❌ 項照提示修。
   (也可從 GitHub 直接複製:demo/diagnose.js) */
(function () {
  var out = [];
  function ok(msg) { out.push('✅ ' + msg); }
  function bad(msg, fix) { out.push('❌ ' + msg + (fix ? '\n   → 修法:' + fix : '')); }
  function warn(msg, fix) { out.push('⚠️ ' + msg + (fix ? '\n   → ' + fix : '')); }

  /* 1. 五支 kit CSS 是否都載入、順序是否正確 */
  var need = ['base.css', 'b_tokens.css', 'brand.css', 'b_admin.css', 'dropdown.css'];
  var links = Array.prototype.map.call(
    document.querySelectorAll('link[rel="stylesheet"]'),
    function (l) { return l.getAttribute('href') || ''; }
  );
  var pos = {};
  need.forEach(function (name) {
    var idx = -1;
    links.forEach(function (href, i) { if (idx === -1 && href.indexOf(name) !== -1) idx = i; });
    pos[name] = idx;
    if (idx === -1) {
      if (name === 'brand.css') warn('brand.css 沒載(若你是用內聯 :root 定義 --b-chrome 則可忽略)', '<link rel="stylesheet" href="/static/css/brand.css">');
      else bad('缺 ' + name, '補 <link>;五支順序 = base → b_tokens → brand → b_admin → dropdown');
    } else ok('已載入 ' + name);
  });
  var order = need.filter(function (n) { return pos[n] !== -1; });
  var sorted = order.slice().sort(function (a, b) { return pos[a] - pos[b]; });
  if (order.join() !== sorted.join()) bad('CSS 載入順序錯:目前 ' + sorted.join(' → '), '改成 base → b_tokens → brand → b_admin → dropdown');
  else if (order.length > 1) ok('CSS 載入順序正確');

  /* 2. token 變數有沒有解析出來 */
  var cs = getComputedStyle(document.documentElement);
  function v(name) { return (cs.getPropertyValue(name) || '').trim(); }
  if (!v('--neutral-primary-soft')) bad('token 沒生效(--neutral-primary-soft 空值)', 'b_tokens.css 沒載到或路徑 404,看 Network 分頁');
  else ok('b_tokens token 有值(--neutral-primary-soft = ' + v('--neutral-primary-soft') + ')');
  if (!v('--b-chrome')) bad('--b-chrome 未定義 → 整個 brand 色家族算不出來(按鈕/active/focus 會壞)', '載 brand.css 或在 :root 內聯 --b-primary/--b-chrome/--b-on-primary');
  else ok('--b-chrome = ' + v('--b-chrome'));
  if (!v('--brand')) bad('--brand 沒被衍生出來', 'b_admin.css 沒載到(它負責從 --b-chrome color-mix 出 brand 家族)');
  else ok('--brand = ' + v('--brand'));
  if (!v('--shadow-md')) bad('陰影 token 空值', 'b_tokens.css 沒載到');

  /* 3. Tailwind CDN + config 片段 */
  if (!window.tailwind) warn('Tailwind CDN 沒載(只用 .b-* 元件 class 可忽略)', '<script src="https://cdn.tailwindcss.com"></script>');
  else {
    var tw = window.tailwind.config || {};
    var br = tw.theme && tw.theme.extend && tw.theme.extend.borderRadius;
    if (!br || br.DEFAULT !== '8px') bad('Tailwind config 片段沒內聯 → rounded/shadow-*/bg-brand 全是預設值不是 token', '在 CDN <script> 之後內聯 tailwind.config.snippet.js 的內容');
    else ok('Tailwind config 片段已套(圓角預設 8px)');
  }

  /* 4. 外殼結構:.main-content(retrofit 補丁層的作用域) */
  var main = document.querySelector('main.main-content, .main-content');
  if (!main) bad('頁面沒有 .main-content 容器 → b_admin.css 的裸表格/輸入框補丁層整層失效(「部分沒套到」最常見原因)', '內容包進 <main class="main-content">(照 templates/cms/b_admin/base.html 的骨架)');
  else ok('.main-content 存在(retrofit 補丁層有作用域)');

  /* 5. html 屬性 */
  var mode = document.documentElement.getAttribute('data-color-mode');
  if (!mode) warn('<html> 沒有 data-color-mode', '加 data-color-mode="light"(否則深色 OS 的瀏覽器可能吃到半套 dark 值)');
  else ok('data-color-mode = ' + mode);

  /* 6. 下拉:dropdown.js 有沒有載、有沒有被藏住的 select */
  if (!window.BDropdown) {
    var sel = document.querySelectorAll('.main-content select').length;
    if (sel) bad('dropdown.js 沒載,但頁上有 ' + sel + ' 個 <select> — dropdown.css 會把它們藏住(看起來憑空消失)', '載 static/js/b/dropdown.js,或不載 dropdown.css');
    else warn('dropdown.js 沒載(此頁沒 select,暫無影響)');
  } else {
    var hidden = document.querySelectorAll('.main-content select:not([data-bdd])').length;
    if (hidden) bad(hidden + ' 個 select 未被增強(動態注入後沒重跑)', '注入 HTML 後呼叫 window.BDropdown.init(容器)');
    else ok('BDropdown 已載且全部 select 已增強');
  }

  /* 7. icon:lucide 有沒有渲染 */
  var rawIcons = document.querySelectorAll('i[data-lucide]').length;
  if (rawIcons && !window.lucide) bad(rawIcons + ' 個 <i data-lucide> 沒變成 SVG(lucide 沒載)', '<script src="https://unpkg.com/lucide@latest"></script> + 呼叫 renderLucideIcons()');
  else if (rawIcons) warn(rawIcons + ' 個 data-lucide 未渲染', '呼叫 window.renderLucideIcons()(動態注入後都要再呼叫)');
  else ok('沒有未渲染的 lucide icon');

  /* 8. 快取提示 */
  var stamped = links.filter(function (h) { return /b_admin\.css\?v=/.test(h); }).length;
  if (!stamped && pos['b_admin.css'] !== -1) warn('kit CSS 沒帶 ?v= 版本戳', '改檔後瀏覽器可能吃舊快取;引用加 ?v=日期 並 Ctrl+Shift+R 驗證');

  console.log('══ backend-design 接入診斷 ══\n\n' + out.join('\n') +
    '\n\n(❌ 全修完還漏 → 把此報告 + 沒套到區塊的 HTML 貼給 Claude)');
})();
