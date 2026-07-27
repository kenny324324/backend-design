# AI-GUIDE.md — 給 AI 的 UI Kit 套用指南 + 複檢程序

> **用法**:把這份文件整份給 AI(或叫它讀這檔),搭配指令:
> 「請照 AI-GUIDE.md 把 backend-design UI kit 套用到本專案的後台」或
> 「請照 AI-GUIDE.md 第二部分,複檢已套用的頁面並修掉漏套的地方」。

---

# 第一部分:如何套用(AI 請嚴格照做)

你要把 backend-design UI kit(typeui Dashboard 設計系統)套用到目前專案的後台。**先讀完本檔再動手**;細節查同 repo 的 `README.md`。

## 0. 鐵則(違反任何一條 = 做錯)

1. **永不寫裸 hex/rgb** — 顏色一律用 token:`var(--brand)`、`var(--text-heading)`、`var(--border-default)`…。深色模式由 token 自動解析,**絕不手動寫深色顏色**。
2. **品牌色只改 `static/css/brand.css`** 的三個變數(`--b-primary`/`--b-chrome`/`--b-on-primary`),不碰任何元件檔。
3. **元件必須掛 kit 的 class**(`.b-btn`、`.b-tbl`、`.b-card`…),不要自己發明樣式;kit 沒有的元件先找最接近的組合,真的沒有才新增(新增也只用 token)。
4. **每個互動元素要有 hover / focus / disabled 三態**(kit class 已內建,別覆寫掉)。
5. 只改呈現層(HTML/CSS/前端 JS 的呈現與互動);**不動後端邏輯、API、資料**。

## 1. 檔案接入(一次性)

1. 把 kit 的 `static/` **整包照原路徑**放進專案(`static/css/...`、`static/js/...` 路徑不可改)。
2. 後台每頁的 `<head>` 依序載入(**順序不可換**):

```html
<link rel="stylesheet" href="/static/css/cms/base.css">
<link rel="stylesheet" href="/static/css/cms/b_tokens.css">
<link rel="stylesheet" href="/static/css/brand.css">
<link rel="stylesheet" href="/static/css/cms/b_admin.css">
<link rel="stylesheet" href="/static/css/b/dropdown.css">
<script src="https://cdn.tailwindcss.com"></script>
<script>/* ← 把 tailwind.config.snippet.js 的「內容」整段內聯在這 */</script>
<style>[v-cloak]{display:none!important}</style>
```

3. `<html lang="zh-Hant" data-color-mode="light">` — `data-color-mode` 必加。
4. CSS/JS 引用**帶版本戳** `?v=YYYYMMDDa`,改檔就遞增(否則瀏覽器快取吃舊檔,改了看不到)。
5. 外殼骨架照抄 `templates/cms/b_admin/base.html`(單 Vue app 版)或 `templates/cms/base.html`(A 版雙層 app + SPA):固定 `top-header` + `sidebar`(可收合)+ **`<main class="main-content">`**。需要 CDN:Vue 3、lucide、axios。

## 2. 結構要求(漏了會「部分樣式沒套到」)

- **頁面內容必須包在 `<main class="main-content">` 裡** — b_admin.css 有一整層 retrofit 補丁(裸 table/input 自動美化)只作用於 `.main-content` 之內。這是漏套的第一大原因。
- 頁首用 `.page-header`(`.page-title` 左 + `.page-actions` 右)。
- 選單資料形狀:`{ success, menu: [{ id, title, url, sub: [{ id, title, url }] }] }`;連結前綴集中在 `menuHref()` 一個 method 改。
- icon 用 `<i data-lucide="名稱">`,渲染呼叫 `window.renderLucideIcons()`;**動態注入 markup 後要再呼叫一次**。⚠️ lucide 節點不可被 Vue `v-if` 抽換(會炸整個 app)— 要切換就兩顆都渲染、用 class 切顯示。

## 3. 各類頁面怎麼套(對照 kit 範本頁)

| 你要做的頁 | 照抄這個範本 | 要點 |
|---|---|---|
| 儀表板 | `templates/cms/b_admin/dashboard.html` 或 `cms/index.html`(bento) | `.b-kpi-grid` + `.b-card` |
| 列表/表格頁 | `cms/b_admin/bookings.html`、`cms/member_manage.html` | **三件套**:`{% block main_modifier %}is-fixed-h{% endblock %}` + `.b-tbl-scroll`(必須是 `.main-content` 直接子項)+ DataTables `dom:'rt'`+`pageLength:200`;頁首 `.a-search` 搜尋。**禁用 DataTables `scrollY`** |
| 表單 modal | `cms/b_admin/_components.html` macro | `.b-modal.is-soft`(+`.is-wide` 兩欄);**有 ✕ 不放取消鈕**;送出 `.b-btn-text` + 必填未填 disable;髒表單關閉要跳 `.b-modal.is-alert` 確認 |
| 多步驟表單 | course_manage 的 wizard | `.b-modal.is-wizard` + 膠囊 stepper(`.b-steps*`) |
| 大編輯(左右欄) | content_manage | 固定高 modal + body grid 單列 `minmax(0,1fr)` 等高(**別用 align-items:stretch 靠內容對齊**) |
| 登入頁 | `cms/b_admin/login.html` + `login.css` | 自動吃 brand 色 |

- **內滾機制**與 **modal 架構**的完整原理見 README 對應兩節 — 動這兩類版型前先讀。
- 狀態一律 `.b-badge`(`.ok/.warn/.bad/.neutral` + 內 `.dot`);提示 `.b-alert`;空狀態 `.b-empty`;toast 丟 `.b-toast-wrap`(CSS 動畫自播自移除)。

## 4. 已知坑(踩過的,別再踩)

- `<select>` 會被 dropdown.css 藏住等 `dropdown.js` 增強 → **dropdown.css 和 dropdown.js 必須成對載**;動態注入後呼叫 `window.BDropdown.init(容器)`,程式改值後 `BDropdown.syncAll()`。
- SPA(選配):A 版 **spa.js 必須先於 dropdown.js 載入**;頁面 JS 註冊 `window.pageInit.<頁名>`,cleanup 記得停相機/銷毀 DataTables/TinyMCE。
- SPA/雙層 Vue 環境 **`$refs` 取不到** — modal 內 file input/video 一律 `document.querySelector('.js-xxx')`。
- Vue 編譯的頁面內容會**剝掉 `<template>` 標籤** — `v-for`/`v-if` 直接掛在實體元素上。
- 同一元件不混 1px+2px 邊框;不疊兩個 shadow token;brand/accent 不當大面積背景。

---

# 第二部分:複檢程序(對「已套用」的專案查漏)

> 指令範例:「照 AI-GUIDE.md 第二部分複檢本專案後台,輸出報告後把 ❌ 修掉」。

## 步驟 A:全域檢查(整個專案跑一次)

逐項驗證,記錄 ✅/❌:

1. `static/css`、`static/js` 的 kit 檔案齊全且路徑未改(對照 README 結構樹)。
2. 每個後台頁的 `<head>`:五支 CSS 齊、**順序 = base → b_tokens → brand → b_admin → dropdown**、Tailwind CDN 之後有內聯 config 片段、有 `[v-cloak]` 規則、引用帶 `?v=` 版本戳。
3. `<html>` 有 `data-color-mode`。
4. `brand.css` 的三個變數已改成本專案的色;**全專案 grep 不到寫死的品牌色 hex**(搜舊主色的 hex 值,應為 0 筆,brand.css 除外)。
5. dropdown.css / dropdown.js 成對;lucide + `renderLucideIcons()` 有載有呼叫。
6. (可選)開任一頁跑 `demo/diagnose.js`(貼 Console),應全 ✅。

## 步驟 B:逐頁檢查(每個後台頁面一輪)

對每一頁回答以下 10 題,**任一「否」= 該頁漏套**:

| # | 檢查項 | 判準 |
|---|---|---|
| 1 | 內容包在 `<main class="main-content">`? | 沒有 → retrofit 層整層失效 |
| 2 | 頁首是 `.page-header` + `.page-title`(+`.page-actions`)? | |
| 3 | 按鈕全部是 `.b-btn` 家族? | grep 頁內 `<button`/`<a class` 逐顆對 |
| 4 | 表格是 `.b-tbl`(裸表格要在 `.b-tbl-scroll`/`.b-tbl-wrap` 內)? | |
| 5 | 列表頁有套 `is-fixed-h` + `.b-tbl-scroll` 內滾(且 `.b-tbl-scroll` 是 `.main-content` 直接子項)? | 整頁滾 + thead 沒釘住 = 沒套 |
| 6 | 狀態顯示用 `.b-badge`、提示用 `.b-alert`、空資料用 `.b-empty`? | |
| 7 | `<select>` 都被增強成 `.b-dd`(頁上 `select:not([data-bdd])` = 0)? | 有殘留 → 補 `BDropdown.init` |
| 8 | modal 是 `.b-modal-overlay` + `.b-modal`(is-soft/is-wide/is-alert 按用途),有淡入淡出、無「取消」鈕、必填 disable、髒表單關閉確認? | |
| 9 | 頁內沒有裸 hex/rgb(style 屬性與 `<style>` 區塊都查)? | 有 → 換 token |
| 10 | icon 都是 lucide(或本專案統一的那套),沒有未渲染的 `data-lucide`? | |

## 步驟 C:輸出與修復

1. 先輸出報告:**頁 × 檢查項的表格**(✅/❌ + 一句話說明),按 ❌ 數量排序。
2. 經使用者確認後(或使用者已授權直接修),**從 ❌ 最多的頁開始修**;每修一頁重跑該頁的步驟 B 確認歸零。
3. 修復時遵守第一部分鐵則;改 CSS/JS 記得 bump 版本戳;完成後提醒使用者 **Ctrl+Shift+R 硬重整**驗收(快取是「改了沒變化」的頭號原因)。
