# backend-design — 後台 UI Kit(typeui Dashboard)

從 JustGolf golfmaster 抽出來的**後台設計系統整包**:CSS token、元件樣式、動畫、共用 JS 行為、外殼模板。
兩個後台(模擬器後台 `/cms`、球場後台 `/cms/<code>/`)共用的就是這一套,可直接搬去其他 Flask/Jinja 類似專案。

**先看效果**:直接用瀏覽器開 [`demo/demo.html`](demo/demo.html)(免 server),所有元件 + 動畫 + 深色模式一頁看完。

---

## 內容物

```
backend-design/
├── demo/demo.html                  ← 元件展示頁(雙擊即開,含深色切換/換主色)
├── tailwind.config.snippet.js      ← Tailwind CDN runtime config(貼進 <head>)
├── static/
│   ├── css/
│   │   ├── brand.css               ← ★★ 品牌色設定檔(每個專案只改這一檔,詳見下節)
│   │   ├── cms/b_tokens.css        ← ★ typeui design token(light+dark 全部 CSS 變數)
│   │   ├── cms/base.css            ← 外殼版面(header / sidebar / main-content)
│   │   ├── cms/b_admin.css         ← ★ 全部元件 + 動畫(.b-* 家族、toast、modal、flyout…)
│   │   ├── cms/components.css      ← A 後台頁面層元件(DataTables 皮、樹狀選單、wizard、bento…)
│   │   ├── cms/login.css           ← 登入頁樣式
│   │   └── b/dropdown.css          ← 自訂下拉(.b-dd,參數化 --dd-*)
│   └── js/
│       ├── tinymce-helper.js       ← TinyMCE 整合(content 編輯 modal 用)
│       ├── b/dropdown.js           ← 下拉增強:自動把所有 <select> 包成 .b-dd(window.BDropdown)
│       ├── b/spa.js                ← B 後台 SPA 換頁(攔連結 → fetch → 換 main + 淡入)
│       ├── b/context-menu.js       ← 右鍵/長按 context menu(.b-ctxmenu)
│       ├── b/filter.js             ← 篩選彈窗(.b-pop / .b-btn-filter)
│       ├── cms/spa.js              ← A 後台 SPA 換頁(雙層 Vue app 版)
│       ├── cms/dialogs.js          ← confirm/alert 對話框(動態 .b-modal-overlay,含淡入淡出)
│       ├── cms/scroll-fade.js      ← 捲動漸層淡出(.is-scroll-faded)
│       └── pages/                  ← ★ 全部後台頁面 JS(UI 渲染/互動範本)
│           ├── b/  admin-bookings / admin-billing / admin-slots / admin-theme / checkin / manual
│           └── cms/ index(bento 儀表板)/ booking / course / member / email-log / user /
│                    groups / store / menu / content / course-blackout / user-profile / login
└── templates/                      ← ★ 全部後台 Jinja 模板(各頁排版 markup + 頁內 <style> 都在)
    ├── cms/                        ← A 模擬器後台:base(外殼)+ login + 13 頁
    │   (index=bento 儀表板、booking/course/member/email_log/user/groups/
    │    store/menu/content/course_blackout_manage、user_profile、manual)
    ├── cms/b_admin/                ← B 球場後台:base(外殼)+ _components macro + login
    │   + dashboard/bookings/billing/slots/theme/i18n/checkin/profile/manual
    └── cms/c_admin/                ← 桿弟三頁:caddies / assignments / reviews
```

★ = 核心。最小可用組合:`brand.css + b_tokens.css + b_admin.css`(+ 想要自訂下拉就加 `dropdown.css/js`)。
頁面模板/頁面 JS 是**完整外觀範本**:各頁版型、內聯 `<style>`、DataTables 設定、wizard、操作欄下拉等互動都在裡面,新專案照抄改資料來源即可。

## ★ 品牌色:每個專案可調(static/css/brand.css)

整套後台 chrome 的顏色**只有一個來源:`--b-chrome`**(在 `brand.css`)。`b_admin.css` 用 `color-mix()` 從它衍生整個 typeui brand token 家族(`--brand`/`--brand-softer`/`--brand-strong`/`--fg-brand`/`--border-brand`…),所有元件只吃 token → **換專案時改 `brand.css` 一個值,全站自動換色**,不用碰任何元件/頁面。

```css
/* static/css/brand.css — 新專案只改這三個值 */
:root {
  --b-primary: #173226;      /* 品牌原色(logo/前台沿用,可與 chrome 不同) */
  --b-chrome:  #173226;      /* ★ 後台實際用色 — brand token 家族唯一來源 */
  --b-on-primary: #ffffff;   /* brand 底上的文字色(淺主色請改深字) */
}
```

也可以不用這檔、改成動態注入(golfmaster 真環境就是在 base.html 內聯 `<style>` 從 DB 主題設定吐值)— 只要這三個變數有定義在 `:root` 即可。demo 頁右上「換主色」就是現場改這兩個變數驗證全站跟著變。

## 快速接入(新專案)

1. 整個 `static/` 照原路徑丟進專案(路徑不動,模板引用就跟 golfmaster 一致)。
2. `<head>` 依序載入(**順序重要**:base → tokens → 元件;brand.css 放 tokens 後即可):

```html
<link rel="stylesheet" href="/static/css/cms/base.css">
<link rel="stylesheet" href="/static/css/cms/b_tokens.css">
<link rel="stylesheet" href="/static/css/brand.css">      <!-- ★ 每專案改這檔換色 -->
<link rel="stylesheet" href="/static/css/cms/b_admin.css">
<link rel="stylesheet" href="/static/css/b/dropdown.css">
<script src="https://cdn.tailwindcss.com"></script>
<script>/* tailwind.config.snippet.js 的內容(內聯) */</script>
<style>[v-cloak] { display: none !important; }</style>
```

3. `<html>` 加 `data-color-mode="light"`(切 `dark` 即深色;token 兩值都已備齊)。字級三段:`data-fs="sm|lg"`(不設 = 中)。
4. 外殼(header/sidebar/flyout/toast)直接抄 `templates/cms/b_admin/base.html`(B 版,單 Vue app)或 `templates/cms/base.html`(A 版,雙層 app + SPA),需要 Vue 3 + lucide(CDN)。只用元件不用外殼的話,Vue/lucide 都可不裝(icon 換成任何 SVG 皆可)。
5. 頁面照 `templates/` 對應頁當範本抄(內頁 `{% block main_modifier %}` / `page_title` / `page_actions` 的用法都在裡面),資料邏輯換成自己專案的。

## 慣例與注意

- **永不寫裸 hex** — 一律用 token(`var(--brand)`、`var(--text-heading)`、`var(--border-default)`…)。深色模式靠 token 自動解析,絕不手動換色。
- **元件 class 速查**:`.b-btn`(-primary/-success/-danger/-danger-soft/-dark/-ghost/-quiet/-filter、-xs/-sm/-lg/-block/-icon)、`.b-badge`(.ok/.warn/.bad/.brand/.neutral/.dark/.square/.lg + 內 `.dot`)、`.b-input/.b-select/.b-textarea/.b-label`、`.b-tbl`(+`.b-tbl-wrap`/`.b-tbl-scroll`)、`.b-kpi*`、`.b-card*`、`.b-seg`(+`.is-pill`)、`.b-tabs/.b-tab/.b-panel`、`.b-alert(.brand/.success/.danger/.warning)`、`.b-alert-pill/.b-status-stack`、`.b-empty*`、`.b-ish*`、`.b-avatar*`、`.b-pagination`、`.b-modal*`、`.b-toast*`、`.b-pop*`、`.b-ctxmenu*`、`.cms-flyout*`、`.num`(tabular-nums)。
- **Modal**:`.b-modal-overlay` 加 `is-visible`(display)+ 下一 frame 加 `is-open` → 淡入;關閉反向。變體 `.b-modal.is-soft`(圓潤)`.is-wide`(寬扁兩欄)。
- **Toast**:markup 丟進 `.b-toast-wrap`,CSS `@keyframes b-toast-life` 自動滑入→停留→滑出;多則用 `animation-delay` 錯開,`animationend` 移除節點。
- **下拉**:`dropdown.js` 載入即自動增強全部 `<select>`;**動態注入的 HTML** 要呼叫 `window.BDropdown.init(container)`;程式改值後 `BDropdown.syncAll(root)`。
- **動畫一覽**:按鈕 hover glint、`b-toast-life`/`b-toast-fade`、modal 淡入淡出(`b-cell-*`)、SPA 換頁 `b-spa-fade-in`、header 下拉 `hdrUserIn`、側欄 flyout transition、下拉展開 `bddIn`(A 版 `bddInBack` 帶回彈)、loading `b-spin`。
- **桌機 only**:這套後台不做手機版(內部工具)。
- 版本戳習慣:引用時帶 `?v=YYYYMMDDx` query(改檔後遞增,避免瀏覽器快取吃舊檔)。

## Icon / 導覽(nav)/ 登入頁

### Icon(lucide 為主,CDN 載入、無 vendor 檔)
- **殼層 + B 後台頁面 = [lucide](https://lucide.dev)**:`<i data-lucide="calendar-check">` 寫法,由 base.html 的 `window.renderLucideIcons()` 統一渲染(`createIcons({ attrs: { 'stroke-width': 2.2 } })` — 全站線寬一致)。**動態注入的 markup 要再呼叫一次 `renderLucideIcons()`** 才會變成 SVG(toast、SPA 換頁後皆同)。
- **A 後台頁面內容 = Font Awesome**(CDN;12 支頁面 JS 產的是 FA markup),與殼層 lucide 並存。新專案可統一挑一套。
- **側欄圖示自動對應**:`getMenuIcon(menu)`(base.html)用選單標題/URL 關鍵字比對出 lucide icon 名(dashboard→gauge、桿弟→users、帳務→circle-dollar-sign…),**規則順序有意義**(易混淆的放前面);新專案加選單只要在規則表補一行。
- ⚠️ **lucide 節點不可被 Vue `v-if` 抽換**(createIcons 會把 `<i>` 換成 SVG,Vue 卸載原節點時會爆掉整個 app)— 深淺色那類切換要兩顆 icon 都先渲染、用 class 切顯示。下拉 caret 這種 JS 動態注入的元素用**內嵌 SVG**(dropdown.js 的做法),不經 lucide。

### 導覽 / Nav 架構(整套在 base.html + b_admin.css/base.css)
- 結構:固定 `top-header` + 左側 `sidebar`(選單)+ `main-content`。
- **top-header 上的項目**(markup/樣式/行為全在 base.html + b_admin.css):
  - 左:漢堡鈕(窄視窗)、logo(`.logo-icon`,無 logo 時 `is-empty` 不佔位)、站名、「後台」小標籤(`.logo-env`)。
  - 右(`.header-right`,共用 `.header-icon-btn` 樣式):**字級 Aa 鈕**(浮出三段滑桿面板 中/大/特大,`data-fs`+localStorage,**首繪前套用防閃字級**)→ **深淺色切換**(月/日兩顆 icon 先渲染、class 切顯示 — 避開 lucide v-if 坑;`data-color-mode`+localStorage 防閃色)→ 分隔線 `.header-sep` → **操作手冊**、**前往前台**(新分頁)→ **帳號下拉**(頭像+名字+caret,`hdr-user` transition 展開:帳號名/email 抬頭 + 登出 POST form 帶 CSRF)。
  - 面板類(字級/帳號)都有「點外面自動關」,注意要 `@click.stop`(lucide 重繪坑,見側邊欄一節)。
- **選單資料來自 API**:`GET /cms/<code>/usermenu`(B)/ A 版同構,回 `{ success, menu: [{ id, title, url, sub: [{ id, title, url }] }] }` — 靜態專案給一份同形狀的 JSON 即可(demo/預覽就是走 `window.__B_PREVIEW_MENU` 注入)。
- 行為(Vue 殼層已實作):手風琴 **single-open**;active 判斷 `isCurrentMenuItem` / `isGroupActive`;連結由 `menuHref(url)` 組(前綴集中一處,新專案改這個 method 就好);儀表板獨立置頂、登出住右上帳號下拉(側欄不重複放)。
- **可伸縮側邊欄(收合軌)** — 完整實作都在:
  - 側欄左下 `.sidebar-toggle` 按鈕切換 `sidebarCollapsed`(**存 localStorage**,重整/換頁記住);展開⇄收合有寬度過渡,收合後只剩 icon 軌、`.menu-text` 隱藏。
  - **收合時點有子選單的群組 → 不展開手風琴,改在旁邊開 `.cms-flyout` 浮窗**(JS 算 top/left 定位、`<transition name="flyout">` 展開動畫,浮窗內含群組標題 + 子項、active 同步)。
  - ⚠️ 收合軌的選單項要用 `flex-start` 對齊(b_admin.css 已寫)— 否則文字子節點會把 icon 推出去被裁掉。
  - ⚠️ flyout / 帳號下拉的「點外面關閉」要 `@click.stop`:lucide 重繪會把點到的 svg 換成新節點,冒泡到 document 時 `closest()` 回 null → 面板剛開就被誤關(base.html 註解有記)。
  - 窄視窗另有 `sidebarOpen` 抽屜模式(漢堡鈕開、`.sidebar-overlay` 遮罩點擊關)。
- 樣式:active = brand 色淡底 pill + brand 色字、hover 只變文字色;`.menu-caret` 旋轉;`.submenu` 高度過渡。全部吃 token → 跟著 brand.css 換色。

### 登入頁
- `templates/cms/b_admin/login.html`(B,吃球場主色)/ `templates/cms/login.html`(A)+ `static/css/login.css`。置中卡片、`.b-input`/`.b-btn` 元件、brand token 配色 — 換專案只要 brand.css 換色,登入頁自動跟。

## ★ SPA 頁面轉場(spa.js — 換頁不閃、側欄選中平滑切換)

外殼(header/側邊欄)**永不重建**,換頁只抽換 `#main-content`:攔截後台內部連結 → fetch 整頁 → DOMParser 抽出新的 `#main-content` 塞回 → `history.pushState` 同步 URL。route 完全不用改(後端仍回整頁,前端自己抽)。

- **轉場動畫**:換好內容後加 `is-spa-entered` → 播 `b-spa-fade-in` 淡入(animationend 自動移除);**載入態延遲 180ms** 才變灰(`is-spa-loading`)— fetch 快就完全不閃,真的慢才給回饋。
- **側欄 active 同步**:`syncActive()` 只更新 Vue 的 `currentPath/currentPage`(`isCurrentMenuItem` 吃這兩個值)→ active pill 平滑跳到新頁,**手風琴開合/收合狀態全保留**。
- **頁面 JS 生命週期**:各頁註冊 `window.pageInit.<頁名> = (root) => { …; return cleanupFn }`;換頁時先跑上一頁 cleanup(停相機、銷毀 DataTables/TinyMCE)再 init 新頁。頁名 = path 尾段。
- **頁面專屬 CSS 同步**:base.html 的 `{% block extra_css %}` 外包 `<!-- b-spa-extra-css-start/end -->` 註解標記,spa.js 換頁時把標記區間的 style/link 一併換掉。
- **換頁後重增強**:`reEnhance()` 自動跑 `renderLucideIcons` + `BDropdown.init` + `BRequireFill.refreshAll`。
- **接管規則**(`shouldHandle`):只接同源、後台前綴內的左鍵點擊;`target=_blank`/`download`/修飾鍵/`data-no-spa` 屬性都放行原生;同 path 僅 query 變(篩選)讓 `filter.js` 只換表格區,popstate 用 capture + `stopImmediatePropagation` 分工不互踩。任何失敗(網路錯/抽換失敗/被重導登入頁)→ **降級成整頁導航**,永不白屏。
- **兩版差異**:B 版 `js/b/spa.js`(單 Vue app);A 版 `js/cms/spa.js`(雙層 app:殼層常駐、`<main v-pre>`、頁面 app 由 pageInit 註冊表 mount,**pushState 先於 applyMain**)。⚠️ A 版 **spa.js 必須先於 dropdown.js 載入**,否則 Vue 把增強殼當模板複製 → 死下拉。

## ★ 內滾機制(固定高頁面,整頁不捲、只捲內容區)

列表/表格頁的核心版型:**外層不滾,捲動只發生在內容框內、thead 釘住**。CSS 全在 `b_admin.css`。

```html
{# 1) 內頁開啟固定高(opt-in) #}
{% block main_modifier %}is-fixed-h{% endblock %}

{# 2) 內滾框「必須是 .main-content 的直接子項」(不能埋在巢狀 div;modal 留在後面當 sibling) #}
<main class="main-content is-fixed-h">
  <div class="page-header">…</div>          <!-- 固定區:不縮 -->
  <div class="b-tbl-scroll">                <!-- 唯一吃剩餘高的子項:內滾 + thead sticky -->
    <table class="b-tbl">…</table>
  </div>
</main>
```

運作原理:
- `.main-content.is-fixed-h` = `height: calc(100vh - var(--header-height))` + flex column + `overflow: hidden`(外層不滾)。
- `.is-fixed-h > :not(.b-tbl-scroll) { flex: 0 0 auto }` — page-header / 篩選列等固定區不被壓縮;只有 `.b-tbl-scroll` 吃剩餘高。
- `.b-tbl-scroll` = `flex: 0 1 auto; min-height: 0; overflow: auto` — **可縮不可長**:資料少 → 框貼合內容高(不留空白);資料多 → 被 flex 收縮觸發內滾、thead sticky 釘住;寬表同框橫向捲。
- 表格包在 `<form>` 裡要一起送出時:form 加 `.is-fixed-h-form`(form 變伸展 flex 欄,表格內滾、儲存鈕固定)。
- 自訂雙欄/非表格版面要內滾:自己的容器需**高特異度**壓過 `>:not(.b-tbl-scroll){flex:0 0 auto}`(寫成 `.main-content.is-fixed-h > .你的容器 { flex:1 1 auto; min-height:0 }`),欄內再 `min-height:0 + overflow-y:auto`。⚠️ 欄容器**不可 `overflow:hidden`**(會裁掉 `.b-pop-panel` 篩選下拉)。
- 頁面特化變體(同模型):`is-billing-fixed`、`is-slots-fixed`(tab 頁只有當前 panel 吃高)、`is-checkin-fixed`。
- 搭 DataTables =「**列表頁三件套**」:`is-fixed-h` + `.b-tbl-scroll` + `dom:'rt'`(去原生 chrome)+ 頁首 `.a-search`。⚠️ serverSide **不可 `paging:false`**(後端 FETCH 吃到 -1 會炸),用 `pageLength: 200`。**⚠️ 不要用 DataTables `scrollY`** — 它自拆 scrollHead/scrollBody 另一套 DOM,跟 is-fixed-h 高度鏈打架、欄寬會歪;內滾一律交給 `.b-tbl-scroll`。
- 捲動漸層淡出(選配):容器加 `.is-scroll-faded`(`scroll-fade.js` 自動掃 + MutationObserver;`window.ScrollFade.scan`)。

## ★ Modal 架構

### 顯示機制與動畫
- 基本三態:`.b-modal-overlay`(預設 `display:none`)→ 加 `is-visible`(display:flex)→ **下一 frame** 加 `is-open`(opacity 0→1 淡入);關閉反向(先拔 `is-open` 等過場再拔 `is-visible`)。
- Vue 頁面版:包 `<transition name="b-modal-fade">` + overlay 加 `data-modal-anim="vue"`(告訴外殼觀察器別搶動畫;`v-show` 開關,關閉等 leave 結束)。⚠️ 用 `v-show` 不用 `v-if` — 外殼 MutationObserver 監聽的是 style 變化,v-if 建新節點不會被 observe(下拉不會自動增強);且 v-if 會摧毀 TinyMCE 這類編輯器。
- z-index 層級:header 1000 → 下拉/`.b-pop` 1200 → modal 1300 → **疊加 modal**(modal 上再開圖庫/確認)1400。

### 變體
| class | 用途 |
|---|---|
| `.b-modal` | 基本(max-width 520) |
| `.is-soft` | 標準表單 modal(圓潤 24px、白底欄位) |
| `.is-wide` | 寬扁(640,配桌機螢幕,body 兩欄 grid) |
| `.is-wizard` | 分段輸入:**固定高** `min(660px, calc(100vh - 32px))` + flex column、body flex:1 內滾當保險;搭膠囊 stepper `.b-steps` + `.b-steps-track`/`.b-steps-fill`(progressPct 滑動進度) |
| `.is-alert` | 小確認框(340、無頭尾分隔線;`.b-alert-body/.b-alert-title/.b-alert-desc/.b-alert-foot`,頂部 `.b-alert-icon(-danger/-warn)` 純色 icon) |
| 大編輯 modal | **固定高 modal + body grid 單列 `minmax(0,1fr)`** 左右兩欄徹底等高(等高**不要**靠 `align-items:stretch` 內容驅動 — 內容高度不可控會對不齊);內部各欄 `flex:1; min-height:0; overflow-y:auto` 內滾 |

### 行為規範(全後台一致)
- **有 ✕ 就不放「取消」鈕**;送出鈕用 `.b-btn.b-btn-text`(純文字),modal 內次要動作也走文字鈕。
- **必填未填 → 送出鈕 disable**:Vue 頁用 computed(如 `formIncomplete`)綁 `:disabled`;非 Vue 頁用 `data-require-fill`(外殼共用 JS)。⚠️ 兩者**不可混用**(data-require-fill 會跟 Vue 的 `:disabled` 打架)。
- **有輸入才跳「放棄編輯」確認**:開啟時 `_formSnapshot = JSON.stringify(formData)`,✕/遮罩點擊走 `requestClose` → dirty(JSON 比對;含編輯器 `isDirty()`、已上傳附件、勾選清單)才開 `.b-modal.is-alert` 確認,否則直接關;送出成功直接關不問。
- **modal 內的 `<select>`**:動態出現(v-if/換步驟)的內容 BDropdown 掃不到 → 開啟/切步的 `$nextTick` 呼叫 `window.BDropdown.init(modalEl)`(`data-bdd` 防重)+ 程式改值後 `BDropdown.syncAll(modalEl)`。
- **modal body 要內滾**時加 `.is-scroll-faded` 取得捲動漸層(header/footer 保持固定,別讓標題跟內容一起捲)。
- SPA/雙層 Vue app 環境 **`$refs` 取不到** — modal 內定位節點一律 `document.querySelector('.js-xxx')`,file input、video 同理。

## 依賴(全 CDN,無 build step)

Tailwind CDN(runtime config)· Vue 3(僅外殼/部分頁面)· lucide(icon)· axios(外殼 CSRF 附掛)· Inter 字體(系統 fallback 亦可)。元件 CSS 本身**零外部資產**(無圖片/字型引用)。

---

來源:golfmaster `feature/b-admin-spa`(2026-07);設計依據 typeui「Dashboard Design System」。
