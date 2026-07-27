# backend-design — 後台 UI Kit(typeui Dashboard)

從 JustGolf golfmaster 抽出來的**後台設計系統整包**:CSS token、元件樣式、動畫、共用 JS 行為、外殼模板。
兩個後台(模擬器後台 `/cms`、球場後台 `/cms/<code>/`)共用的就是這一套,可直接搬去其他 Flask/Jinja 類似專案。

**先看效果**:直接用瀏覽器開 [`demo/demo.html`](demo/demo.html)(免 server),所有元件 + 動畫 + 深色模式一頁看完。

---

## 內容物

```
backend-design/
├── demo/demo.html                  ← 元件展示頁(雙擊即開,含深色切換)
├── tailwind.config.snippet.js      ← Tailwind CDN runtime config(貼進 <head>)
├── static/
│   ├── css/
│   │   ├── cms/b_tokens.css        ← ★ typeui design token(light+dark 全部 CSS 變數)
│   │   ├── cms/base.css            ← 外殼版面(header / sidebar / main-content)
│   │   ├── cms/b_admin.css         ← ★ 全部元件 + 動畫(.b-* 家族、toast、modal、flyout…)
│   │   ├── cms/components.css      ← A 後台頁面層元件(DataTables 皮、樹狀選單、SPA modal…)
│   │   ├── cms/login.css           ← 登入頁樣式
│   │   └── b/dropdown.css          ← 自訂下拉(.b-dd,參數化 --dd-*)
│   └── js/
│       ├── b/dropdown.js           ← 下拉增強:自動把所有 <select> 包成 .b-dd(window.BDropdown)
│       ├── b/spa.js                ← B 後台 SPA 換頁(攔連結 → fetch → 換 main + 淡入)
│       ├── b/context-menu.js       ← 右鍵/長按 context menu(.b-ctxmenu)
│       ├── b/filter.js             ← 篩選彈窗(.b-pop / .b-btn-filter)
│       ├── cms/spa.js              ← A 後台 SPA 換頁(雙層 Vue app 版)
│       ├── cms/dialogs.js          ← confirm/alert 對話框(動態 .b-modal-overlay,含淡入淡出)
│       └── cms/scroll-fade.js      ← 捲動漸現
└── templates/                      ← Jinja 外殼參考(含 Vue 殼層、選單、toast、深淺色/字級切換)
    ├── cms/base.html               ← A 後台外殼(雙層 Vue app + SPA)
    ├── cms/login.html
    └── cms/b_admin/
        ├── base.html               ← B 後台外殼(單 Vue app,選單帶 course_code)
        ├── _components.html        ← Jinja macro:action_button / form_modal
        └── login.html
```

★ = 核心兩檔。最小可用組合:`b_tokens.css + b_admin.css`(+ 想要自訂下拉就加 `dropdown.css/js`)。

## 快速接入(新專案)

1. 整個 `static/` 照原路徑丟進專案(路徑不動,模板引用就跟 golfmaster 一致)。
2. `<head>` 依序載入(**順序重要**:base → tokens → 元件):

```html
<link rel="stylesheet" href="/static/css/cms/base.css">
<link rel="stylesheet" href="/static/css/cms/b_tokens.css">
<link rel="stylesheet" href="/static/css/cms/b_admin.css">
<link rel="stylesheet" href="/static/css/b/dropdown.css">
<script src="https://cdn.tailwindcss.com"></script>
<script src="/tailwind.config.snippet.js 的內容(內聯)"></script>
```

3. 給主色(全站 brand token 家族由這裡衍生,**只改這一個值就換色**):

```html
<style>
:root {
  --b-primary: #173226;      /* 品牌原色(logo 等沿用) */
  --b-chrome:  #173226;      /* 後台 chrome 實際用色(brand token 指向這個) */
  --b-on-primary: #ffffff;   /* brand 底上的文字色 */
  --primary-color: var(--brand);
  --primary-dark: var(--brand-strong);
}
[v-cloak] { display: none !important; }
</style>
```

4. `<html>` 加 `data-color-mode="light"`(切 `dark` 即深色;token 兩值都已備齊)。字級三段:`data-fs="sm|lg"`(不設 = 中)。
5. 外殼(header/sidebar/flyout/toast)直接抄 `templates/cms/b_admin/base.html`,需要 Vue 3 + lucide(CDN)。只用元件不用外殼的話,Vue/lucide 都可不裝(icon 換成任何 SVG 皆可)。

## 慣例與注意

- **永不寫裸 hex** — 一律用 token(`var(--brand)`、`var(--text-heading)`、`var(--border-default)`…)。深色模式靠 token 自動解析,絕不手動換色。
- **元件 class 速查**:`.b-btn`(-primary/-success/-danger/-danger-soft/-dark/-ghost/-quiet/-filter、-xs/-sm/-lg/-block/-icon)、`.b-badge`(.ok/.warn/.bad/.brand/.neutral/.dark/.square/.lg + 內 `.dot`)、`.b-input/.b-select/.b-textarea/.b-label`、`.b-tbl`(+`.b-tbl-wrap`/`.b-tbl-scroll`)、`.b-kpi*`、`.b-card*`、`.b-seg`(+`.is-pill`)、`.b-tabs/.b-tab/.b-panel`、`.b-alert(.brand/.success/.danger/.warning)`、`.b-alert-pill/.b-status-stack`、`.b-empty*`、`.b-ish*`、`.b-avatar*`、`.b-pagination`、`.b-modal*`、`.b-toast*`、`.b-pop*`、`.b-ctxmenu*`、`.cms-flyout*`、`.num`(tabular-nums)。
- **Modal**:`.b-modal-overlay` 加 `is-visible`(display)+ 下一 frame 加 `is-open` → 淡入;關閉反向。變體 `.b-modal.is-soft`(圓潤)`.is-wide`(寬扁兩欄)。
- **Toast**:markup 丟進 `.b-toast-wrap`,CSS `@keyframes b-toast-life` 自動滑入→停留→滑出;多則用 `animation-delay` 錯開,`animationend` 移除節點。
- **下拉**:`dropdown.js` 載入即自動增強全部 `<select>`;**動態注入的 HTML** 要呼叫 `window.BDropdown.init(container)`;程式改值後 `BDropdown.syncAll(root)`。
- **動畫一覽**:按鈕 hover glint、`b-toast-life`/`b-toast-fade`、modal 淡入淡出(`b-cell-*`)、SPA 換頁 `b-spa-fade-in`、header 下拉 `hdrUserIn`、側欄 flyout transition、下拉展開 `bddIn`(A 版 `bddInBack` 帶回彈)、loading `b-spin`。
- **桌機 only**:這套後台不做手機版(內部工具)。
- 版本戳習慣:引用時帶 `?v=YYYYMMDDx` query(改檔後遞增,避免瀏覽器快取吃舊檔)。

## 依賴(全 CDN,無 build step)

Tailwind CDN(runtime config)· Vue 3(僅外殼/部分頁面)· lucide(icon)· axios(外殼 CSRF 附掛)· Inter 字體(系統 fallback 亦可)。元件 CSS 本身**零外部資產**(無圖片/字型引用)。

---

來源:golfmaster `feature/b-admin-spa`(2026-07);設計依據 typeui「Dashboard Design System」。
