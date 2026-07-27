const CourseManagePageApp = {
    ...baseApp,
    data() {
        return {
            ...baseApp.data(),
            showForm: false,
            showCloseConfirm: false,
            isEdit: false,
            isSubmitting: false,
            /* 分段輸入 wizard:目前步驟 + 到過的最遠步驟(步驟列只准點回到過的) */
            formStep: 0,
            maxStepReached: 0,
            showAuditLog: false,
            auditCourseName: '',
            auditLogs: [],
            auditLoading: false,
            /* 預約狀況 modal:照抄預約管理(統計條 + 預約表 + 詳細子 modal + 操作),
               差別 = 該球場已鎖定(bookingsCourseId),modal 內篩選不給選球場。 */
            showCourseBookings: false,
            bookingsCourseId: '',
            bookingsCourseName: '',
            bookingsTableSearch: '',
            bookingsStats: {
                total_bookings: 0,
                pending_count: 0,
                confirmed_count: 0,
                pending_cancel_count: 0,
                cancelled_count: 0,
                total_amount: 0,
                total_duration_hours: 0
            },
            bookingsFilters: { status: '', payment_status: '', start_date: '', end_date: '' },
            confirmingId: '',
            payingId: '',
            refundingId: '',
            resendingNoticeId: '',
            resendNoticeTimer: null,
            showBookingDetail: false,
            bookingDetail: null,
            /* 報到掃描 modal:掃描報到 QR 綁球場,由該列「報到」鈕觸發(從預約管理搬來)*/
            showCheckinScanner: false,
            checkinCourseName: '',
            scanner: {
                supported: !!navigator.mediaDevices?.getUserMedia,
                secureContext: window.isSecureContext,
                active: false,
                processing: false,
                stream: null,
                detector: null,
                canvas: null,
                context: null,
                timer: null,
                lastValue: '',
                lastScannedAt: 0,
                result: null,
                error: ''
            },
            imageOptions: [],
            imageOptionsLoading: false,
            imageOptionsLoaded: false,
            showImageLibrary: false,
            showImageLibraryModal: false,
            /* 關閉預約窗口 modal:草稿式編輯,確認才寫回 blackout_windows */
            showBlackoutModal: false,
            blackoutEditIndex: null,
            blackoutDraft: {},
            blackoutModalError: '',
            imageMenuOpen: false,
            coverBroken: false,
            imageUploadLoading: false,
            imageUploadProgress: 0,
            quickUploadedImages: [],
            tableSearch: '',
            formData: {
                id: '',
                name: '',
                slug: '',
                location: '',
                holes: 18,
                sort: 0,
                weekday_price: 0,
                holiday_price: 0,
                cover_image: '',
                description: '',
                features: '',
                booking_notice: '',
                is_bookable: true,
                allow_onsite_payment: false,
                allow_newebpay: true,
                status: 'active',
                product_type: 'hourly',
                pricing_mode: 'hourly',
                sessions: [],
                default_hours: {
                    is_open: true,
                    open_time: '06:00',
                    close_time: '18:00'
                },
                weekly_hours: [],
                blackout_windows: []
            },
            weekdays: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'],
            slideDir: 'fwd',   // 步驟切換方向:'fwd' 前進(左滑) / 'back' 後退(右滑)
            errors: {}
        };
    },
    computed: {
        ...(baseApp.computed || {}),

        /* 分段步驟清單:小時制 5 步、tee time 只有「基本資料 + 付款」2 步
           (teetime 沒有價格/圖片介紹/營業時間/關閉窗口,對應欄位模板已 v-if 隱藏) */
        wizardSteps() {
            if (this.formData.product_type === 'teetime') {
                return [
                    { key: 'basic', label: '基本資料' },
                    { key: 'pricing', label: '付款' }
                ];
            }
            return [
                { key: 'basic', label: '基本資料' },
                { key: 'pricing', label: '價格與付款' },
                { key: 'content', label: '圖片與介紹' },
                { key: 'hours', label: '營業時間' },
                { key: 'blackout', label: '關閉窗口' }
            ];
        },

        /* formStep 可能因切換 product_type 導致越界 → clamp 後對外一律用這個 */
        currentStep() {
            const last = this.wizardSteps.length - 1;
            return Math.min(Math.max(this.formStep, 0), last);
        },

        currentStepKey() {
            return this.wizardSteps[this.currentStep]?.key || 'basic';
        },

        /* 本步是否有「必填未填」→ 讓「下一步」按鈕呈 disable 樣式。
           只擋必填空值(即時、不需按下去才知道);格式類錯誤(時間先後/日期)仍在點下一步時驗、亮紅字。 */
        currentStepBlocked() {
            if (this.currentStepKey === 'basic') {
                return !String(this.formData.name || '').trim();
            }
            return false;
        },

        /* 步驟切換過場的 transition name(依方向左/右滑) */
        slideName() {
            return this.slideDir === 'back' ? 'b-step-slide-back' : 'b-step-slide-fwd';
        },

        /* 進度填充寬度(%):目前步 / 最後一步。切步時 CSS transition 讓它平滑滑動。
           首末步中心對齊軌道兩端 → 用 currentStep/(總步數-1)。 */
        progressPct() {
            const last = this.wizardSteps.length - 1;
            if (last <= 0) return 100;
            return Math.round((this.currentStep / last) * 100);
        }
    },
    methods: {
        ...baseApp.methods,

        /* ── 分段輸入步驟控制 ─────────────────────────────────
           每步 next 前只驗「本步欄位」;跳回已到過的步驟不驗;送出前再全驗一次。 */
        stepFieldMap() {
            // 各步驟對應的 errors key,用來判斷「本步是否有錯」
            return {
                basic: ['name'],
                pricing: ['sessions'],
                content: [],
                hours: ['default_hours', 'weekly_hours'],
                blackout: ['blackout_windows']
            };
        },

        canGoToStep(i) {
            // 只准點回到過的步驟(含目前),還沒到的鎖住,避免跳過必填
            return i <= this.maxStepReached;
        },

        goToStep(i) {
            if (!this.canGoToStep(i)) return;
            this.slideDir = i >= this.currentStep ? 'fwd' : 'back';
            this.formStep = i;
            this.scrollWizardTop();
        },

        validateStep(key) {
            this.validateForm();   // 一次算好全部 errors,再挑本步的看
            const fields = this.stepFieldMap()[key] || [];
            return fields.every(f => !this.errors[f]);
        },

        nextStep() {
            const key = this.currentStepKey;
            if (!this.validateStep(key)) {
                // 有錯就停在本步(errors 已由 validateStep 填好,模板會顯示)
                return;
            }
            // 通過本步才把非本步的 errors 清掉,避免下一步預先亮紅
            this.errors = {};
            const next = Math.min(this.currentStep + 1, this.wizardSteps.length - 1);
            this.slideDir = 'fwd';
            this.formStep = next;
            this.maxStepReached = Math.max(this.maxStepReached, next);
            this.scrollWizardTop();
        },

        prevStep() {
            this.slideDir = 'back';
            this.formStep = Math.max(this.currentStep - 1, 0);
            this.scrollWizardTop();
        },

        /* ⚠️ 這頁是 SPA 雙層 app,$refs.wizardBody 取不到 → 一律用 DOM 查詢定位 modal body */
        wizardBodyEl() {
            return document.querySelector('.b-modal.is-wizard .b-modal-body');
        },

        scrollWizardTop() {
            this.$nextTick(() => {
                const body = this.wizardBodyEl();
                if (body) body.scrollTop = 0;
            });
        },

        /* 步驟內容進場後:重新增強本步的原生 <select>。
           ⚠️ 步驟用 v-if/v-else-if 切換(為滑動過場),每次切步 DOM 重建 →
              BDropdown 增強會掉(SPA reEnhance 只在換頁跑)→ 這裡補增強,否則下拉退回原生。 */
        onStepEntered() {
            const body = this.wizardBodyEl();
            if (body && window.BDropdown) {
                window.BDropdown.init(body);
            }
        },

        resetWizard() {
            this.formStep = 0;
            this.maxStepReached = 0;
        },

        /* Enter 於非最後一步 = 前進,最後一步才真的送出 */
        onFormSubmit() {
            if (this.currentStep < this.wizardSteps.length - 1) {
                this.nextStep();
            } else {
                this.submitForm();
            }
        },

        initDataTable() {
            const baseUrl = window.BASE_URL || '';

            if ($.fn.DataTable.isDataTable('#courseTable')) {
                return;
            }

            window.courseTable = $('#courseTable').DataTable({
                processing: true,
                serverSide: true,
                ajax: {
                    url: `${baseUrl}/cms/course_manage/list`,
                    type: 'GET'
                },
                columns: [
                    /* 對齊規則(同 .b-tbl):文字/狀態靠左、數字欄(含表頭)靠右 + tabular-nums */
                    { data: 'name', title: '球場名稱', className: 'col-name' },
                    { data: 'holes', title: '洞數', width: '80px', className: 'num' },
                    {
                        data: 'weekday_price',
                        title: '平日每小時',
                        width: '130px',
                        className: 'num',
                        render: data => `$${Number(data || 0).toLocaleString()}`
                    },
                    {
                        data: 'holiday_price',
                        title: '假日每小時',
                        width: '130px',
                        className: 'num',
                        render: data => `$${Number(data || 0).toLocaleString()}`
                    },
                    {
                        data: 'is_bookable',
                        title: '可預約',
                        width: '90px',
                        className: 'col-center',
                        render: data => data
                            ? '<span class="b-badge ok"><span class="dot"></span>開放</span>'
                            : '<span class="b-badge warn"><span class="dot"></span>關閉</span>'
                    },
                    {
                        data: 'allow_onsite_payment',
                        title: '現場付款',
                        width: '100px',
                        className: 'col-center',
                        render: data => data
                            ? '<span class="b-badge brand"><span class="dot"></span>開放</span>'
                            : '<span class="b-badge neutral"><span class="dot"></span>關閉</span>'
                    },
                    {
                        data: 'sort',
                        title: '排序',
                        width: '80px',
                        className: 'num col-center'
                    },
                    {
                        data: null,
                        title: '操作',
                        orderable: false,
                        width: '340px',
                        className: 'col-actions',
                        /* 兩版並存,由 CSS 斷點切換:
                           .col-actions-flat 寬螢幕平鋪四按鈕;.b-actions-dd 窄螢幕收成「操作 ▾」下拉。
                           下拉開合由 initActionsMenu()(委派事件)控制:點觸發 toggle、點外面/選完自動關,開+收都有動畫。 */
                        render: row => {
                            const nameAttr = encodeURIComponent(row.name || '').replace(/'/g, '%27');
                            const nameDel = (row.name || '').replace(/'/g, "\\'");
                            /* 報到排第一、用系統文字色(neutral);其餘操作分開,
                               以便摺疊選單在「報到」與其餘之間插一條淡分隔線(平鋪版不插) */
                            const checkinBtn = `
                                <button class="action-btn neutral" onclick="window.vueApp.openCheckinScanner('${row.id}', '${nameAttr}')">
                                    <i class="fa-solid fa-qrcode"></i> 報到
                                </button>`;
                            const restBtns = `
                                <button class="action-btn add" onclick="window.vueApp.openCourseBookings('${row.id}', '${nameAttr}')">
                                    <i class="fa-solid fa-calendar-check"></i> 預約狀況
                                </button>
                                <button class="action-btn edit" onclick="window.vueApp.openAuditLog('${row.id}', '${nameAttr}')">
                                    <i class="fa-solid fa-clock-rotate-left"></i> 紀錄
                                </button>
                                <button class="action-btn edit" onclick="window.vueApp.openEditForm('${row.id}')">
                                    <i class="fa-solid fa-pen"></i> 編輯
                                </button>
                                <button class="action-btn disable" onclick="window.vueApp.deleteCourse('${row.id}', '${nameDel}')">
                                    <i class="fa-solid fa-trash"></i> 停用
                                </button>`;
                            return `
                                <div class="col-actions-flat">${checkinBtn}${restBtns}</div>
                                <div class="b-actions-dd">
                                    <button type="button" class="b-actions-dd-trigger" aria-haspopup="true" aria-expanded="false">操作 <i class="fa-solid fa-chevron-down"></i></button>
                                    <div class="b-actions-dd-menu" role="menu">${checkinBtn}<div class="b-actions-dd-sep" role="separator"></div>${restBtns}</div>
                                </div>`;
                        }
                    }
                ],
                order: [[6, 'asc']],
                /* 對齊球場預約後台的表格:只出表格本體(r=載入中 t=表格),
                   不要分頁/每頁筆數/搜尋/筆數資訊;球場數量少,一頁全列。
                   ⚠️ 不可用 paging:false —— serverSide 會送 length=-1,後端 FETCH NEXT :length 直接炸;
                   改保留內部分頁、單頁上限 200(遠大於球場數,等同全列)。 */
                dom: 'rt',
                /* 內滾 + 表頭釘住:照球場預約後台(b_admin/bookings),交給外層 .b-tbl-scroll + is-fixed-h
                   (b_admin.css .b-tbl-scroll .b-tbl thead th sticky)。不用 DataTables scrollY —— 它會
                   把表格拆成 scrollHead/scrollBody 另一套 DOM,與 is-fixed-h 的 flex 高度鏈打架、且欄寬易歪。 */
                pageLength: 200,
                language: {
                    processing: '載入中...',
                    zeroRecords: '目前沒有球場資料',
                    emptyTable: '目前沒有球場資料'
                }
            });
        },

        /* 操作欄「操作 ▾」下拉:委派點擊處理(DataTables 動態重繪 row,故用委派而非逐一綁定)。
           點觸發器 → toggle 該列下拉、關其他;點選項或點下拉外任何處 → 關全部。
           選項自身 onclick 已執行動作(開 modal 等),這裡只負責關下拉;.is-open class 驅動 CSS 開合動畫。 */
        handleActionsMenuClick(e) {
            const trigger = e.target.closest('.b-actions-dd-trigger');
            const openMenus = document.querySelectorAll('.b-actions-dd.is-open');
            if (trigger) {
                // 點觸發器:toggle 自己、關其他
                const dd = trigger.closest('.b-actions-dd');
                const wasOpen = dd.classList.contains('is-open');
                openMenus.forEach(m => { if (m !== dd) this._closeActionsDd(m); });
                if (wasOpen) {
                    this._closeActionsDd(dd);
                } else {
                    dd.classList.add('is-open');
                    trigger.setAttribute('aria-expanded', 'true');
                }
                return;
            }
            // 點下拉以外(含選項本身)→ 關全部下拉(選項的動作由其 onclick 處理)
            openMenus.forEach(m => this._closeActionsDd(m));
        },
        _closeActionsDd(dd) {
            dd.classList.remove('is-open');
            const t = dd.querySelector('.b-actions-dd-trigger');
            if (t) t.setAttribute('aria-expanded', 'false');
        },

        /* 頁首搜尋框 → DataTables server-side search(300ms 去抖) */
        onTableSearch() {
            window.clearTimeout(this._searchTimer);
            this._searchTimer = window.setTimeout(() => {
                if (window.courseTable) window.courseTable.search(this.tableSearch).draw();
            }, 300);
        },

        clearTableSearch() {
            this.tableSearch = '';
            window.clearTimeout(this._searchTimer);
            if (window.courseTable) window.courseTable.search('').draw();
        },

        defaultFormData() {
            return {
                id: '',
                name: '',
                slug: '',
                location: '',
                holes: 18,
                sort: 0,
                weekday_price: 0,
                holiday_price: 0,
                cover_image: '',
                description: '',
                features: '',
                booking_notice: '',
                is_bookable: true,
                allow_onsite_payment: false,
                allow_newebpay: true,
                status: 'active',
                product_type: 'hourly',
                pricing_mode: 'hourly',
                sessions: [],
                default_hours: {
                    is_open: true,
                    open_time: '06:00',
                    close_time: '18:00'
                },
                weekly_hours: this.defaultWeeklyHours(),
                blackout_windows: []
            };
        },

        defaultWeeklyHours() {
            return this.weekdays.map((_, weekday) => ({
                weekday,
                is_open: true,
                open_time: '06:00',
                close_time: '18:00'
            }));
        },

        resetForm() {
            this.formData = this.defaultFormData();
            this.errors = {};
            this.showImageLibrary = false;
            this.imageUploadLoading = false;
            this.imageUploadProgress = 0;
            this.quickUploadedImages = [];
        },

        /* ══ 預約狀況 modal:照抄預約管理(球場鎖定,篩選不給選球場)══ */
        openCourseBookings(courseId, courseName) {
            this.bookingsCourseId = courseId;
            this.bookingsCourseName = decodeURIComponent(courseName || '');
            this.bookingsTableSearch = '';
            this.bookingsFilters = { status: '', payment_status: '', start_date: '', end_date: '' };
            this.showCourseBookings = true;
            this.loadBookingsStats();
            this.$nextTick(() => {
                this.initBookingsTable();   // init 後 initComplete 會 columns.adjust 補欄寬
                this.enhanceBookingsFilters();
            });
            // 重寄通知倒數 tick(modal 開著時才跑)
            window.clearInterval(this.resendNoticeTimer);
            this.resendNoticeTimer = window.setInterval(this.updateBookingResendButtons, 1000);
        },

        /* 篩選面板的原生 <select>(預約狀態/付款狀態)要手動增強成 BDropdown,
           否則 SPA 動態 modal 下不會被全域 init 掃到 → 下拉空白(踩過)。
           對齊 wizard onStepEntered 的做法;用 setTimeout 保底(transition 進場後 DOM 才穩)。 */
        enhanceBookingsFilters() {
            const run = () => {
                const panel = document.querySelector('.b-modal.cbk-modal .b-pop-panel');
                if (panel && window.BDropdown) window.BDropdown.init(panel);
            };
            run();
            window.setTimeout(run, 60);
        },

        closeCourseBookings() {
            this.showCourseBookings = false;
            this.destroyBookingsTable();
            window.clearInterval(this.resendNoticeTimer);
            this.resendNoticeTimer = null;
            this.bookingsCourseId = '';
            this.bookingsCourseName = '';
        },

        destroyBookingsTable() {
            try {
                if (window.courseBookingsTable) window.courseBookingsTable.destroy();
            } catch (e) { /* 未初始化成功時 destroy 可能拋錯,吞掉不擋關閉 */ }
            window.courseBookingsTable = null;
            const el = document.querySelector('#courseBookingsTable tbody');
            if (el) el.innerHTML = '';
        },

        renderBookingStatusBadge(status) {
            const classMap = { pending: 'warn', confirmed: 'ok', checked_in: 'brand', pending_cancel: 'bad', cancelled: 'bad', completed: 'neutral' };
            const labelMap = { pending: '待確認', confirmed: '已確認', checked_in: '已報到', pending_cancel: '待取消', cancelled: '已取消', completed: '已完成' };
            return `<span class="b-badge ${classMap[status] || 'neutral'}">${labelMap[status] || status || '-'}</span>`;
        },

        renderPaymentStatusBadge(status, row) {
            status = status || 'unpaid';
            const classMap = { unpaid: 'neutral', onsite: 'brand', pending: 'warn', paid: 'ok', refunded: 'neutral', failed: 'bad' };
            const labelMap = { unpaid: '未付款', onsite: '現場付款', pending: '付款中', paid: '已付款', refunded: '已退款', failed: '付款失敗' };
            const tradeNo = row && row.payment_trade_no
                ? `<div style="margin-top:4px;color:var(--text-body-subtle);font-size:11px;">${row.payment_trade_no}</div>`
                : '';
            return `<div><span class="b-badge ${classMap[status] || 'neutral'}">${labelMap[status] || status || '-'}</span>${tradeNo}</div>`;
        },

        formatBookingCurrency(v) { return `$${Number(v || 0).toLocaleString()}`; },
        formatBookingHours(v) { return `${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} 小時`; },

        initBookingsTable() {
            const baseUrl = window.BASE_URL || '';
            const self = this;
            this.destroyBookingsTable();

            window.courseBookingsTable = $('#courseBookingsTable').DataTable({
                processing: true,
                serverSide: true,
                ajax: {
                    url: `${baseUrl}/cms/booking_manage/list`,
                    type: 'GET',
                    data(data) {
                        data.course_id = self.bookingsCourseId;   // 球場鎖定
                        data.status = self.bookingsFilters.status;
                        data.payment_status = self.bookingsFilters.payment_status;
                        data.start_date = self.bookingsFilters.start_date;
                        data.end_date = self.bookingsFilters.end_date;
                    }
                },
                columns: [
                    { data: 'play_date', title: '日期', width: '110px' },
                    { data: null, title: '時段', width: '130px', orderable: false, render: row => `${String(row.start_time || '').slice(0, 5)} - ${String(row.end_time || '').slice(0, 5)}` },
                    { data: 'duration_hours', title: '時數', width: '72px', className: 'col-center', render: data => `${data || 1} 小時` },
                    { data: 'member_name', title: '會員' },
                    { data: 'total_price', title: '金額', width: '100px', className: 'num', render: data => `$${Number(data || 0).toLocaleString()}` },
                    { data: 'payment_status', title: '付款狀態', width: '140px', className: 'col-center', render: (data, type, row) => self.renderPaymentStatusBadge(data, row) },
                    { data: 'status', title: '預約狀態', width: '100px', className: 'col-center', render: data => self.renderBookingStatusBadge(data) },
                    {
                        data: null, title: '操作', orderable: false, width: '200px', className: 'col-actions',
                        render: row => {
                            const buttons = [];
                            buttons.push(`<button class="action-btn neutral" onclick="window.vueApp.openBookingDetail('${row.id}')"><i class="fa-solid fa-circle-info"></i> 詳細</button>`);
                            if (row.status === 'pending') {
                                buttons.push(`<button class="action-btn add" onclick="window.vueApp.confirmBooking('${row.id}', '${row.booking_no || ''}')"><i class="fa-solid fa-check"></i> 確認</button>`);
                            }
                            if ((row.payment_status || 'unpaid') === 'onsite') {
                                buttons.push(`<button class="action-btn edit" onclick="window.vueApp.markPaymentPaid('${row.id}', '${row.booking_no || ''}')"><i class="fa-solid fa-money-bill-wave"></i> 付款完成</button>`);
                            }
                            if (row.status === 'pending_cancel' && row.payment_status === 'paid') {
                                buttons.push(`<button class="action-btn disable" onclick="window.vueApp.completeRefund('${row.id}', '${row.booking_no || ''}')"><i class="fa-solid fa-rotate-left"></i> 退款完成</button>`);
                            }
                            if (row.booking_notice_can_resend) {
                                const waitSeconds = Number(row.booking_notice_resend_wait_seconds || 0);
                                const disabled = waitSeconds > 0 ? 'disabled' : '';
                                const until = waitSeconds > 0 ? Date.now() + waitSeconds * 1000 : 0;
                                buttons.push(`<button class="action-btn edit resend-notice-btn" ${disabled} data-until="${until}" onclick="window.vueApp.resendBookingNotice('${row.id}', '${row.booking_no || ''}')"><i class="fa-solid fa-envelope"></i> 重寄通知</button>`);
                            }
                            const items = buttons.join('');
                            return `<div class="col-actions-flat">${items}</div>
                                <div class="b-actions-dd">
                                    <button type="button" class="b-actions-dd-trigger" aria-haspopup="true" aria-expanded="false">操作 <i class="fa-solid fa-chevron-down"></i></button>
                                    <div class="b-actions-dd-menu" role="menu">${items}</div>
                                </div>`;
                        }
                    }
                ],
                order: [[0, 'desc'], [1, 'asc']],
                dom: 'rt',
                pageLength: 200,
                language: { processing: '載入中...', zeroRecords: '此球場目前沒有預約資料', emptyTable: '此球場目前沒有預約資料' },
                drawCallback: () => { window.setTimeout(() => self.updateBookingResendButtons(), 0); },
                initComplete: function () { this.api().columns.adjust(); }   // modal 內欄寬補正
            });
        },

        reloadBookings() {
            this.loadBookingsStats();
            if (window.courseBookingsTable) window.courseBookingsTable.ajax.reload(null, false);
        },

        async loadBookingsStats() {
            const baseUrl = window.BASE_URL || '';
            const params = new URLSearchParams({ course_id: this.bookingsCourseId, ...this.bookingsFilters });
            try {
                const response = await axios.get(`${baseUrl}/cms/booking_manage/stats?${params.toString()}`);
                if (response.data.success) this.bookingsStats = response.data.data;
            } catch (error) { /* 統計失敗不擋表格 */ }
        },

        onBookingsSearch() {
            window.clearTimeout(this._bookingsSearchTimer);
            this._bookingsSearchTimer = window.setTimeout(() => {
                if (window.courseBookingsTable) window.courseBookingsTable.search(this.bookingsTableSearch).draw();
            }, 300);
        },

        clearBookingsSearch() {
            this.bookingsTableSearch = '';
            window.clearTimeout(this._bookingsSearchTimer);
            if (window.courseBookingsTable) window.courseBookingsTable.search('').draw();
        },

        resetBookingsFilters() {
            this.bookingsFilters = { status: '', payment_status: '', start_date: '', end_date: '' };
            this.reloadBookings();
        },

        /* 詳細子 modal:從 DataTables 現有 row 取完整資料 */
        openBookingDetail(bookingId) {
            let found = null;
            if (window.courseBookingsTable) {
                window.courseBookingsTable.rows().every(function () {
                    const d = this.data();
                    if (d && String(d.id) === String(bookingId)) found = d;
                });
            }
            this.bookingDetail = found;
            this.showBookingDetail = true;
        },
        closeBookingDetail() {
            this.showBookingDetail = false;
            this.bookingDetail = null;
        },

        /* 操作:確認 / 付款完成 / 退款完成 / 重寄通知(照抄預約管理;成功後 reloadBookings)*/
        async confirmBooking(bookingId, bookingNo) {
            if (this.confirmingId) return;
            const label = bookingNo ? `「${bookingNo}」` : '這筆預約';
            if (!(await BDialog.confirm({ title: `確定要確認 ${label} 嗎？`, confirmText: '確認' }))) return;
            const baseUrl = window.BASE_URL || '';
            this.confirmingId = bookingId;
            try {
                const response = await axios.put(`${baseUrl}/cms/booking_manage/bookings/${bookingId}/confirm`);
                if (response.data.success) { BToast.success(response.data.message || '預約已確認'); this.reloadBookings(); }
                else { await BDialog.alert({ variant: 'danger', title: '確認預約失敗', desc: response.data.message || '' }); }
            } catch (error) { await BDialog.alert({ variant: 'danger', title: '確認預約失敗', desc: error.response?.data?.message || '' }); }
            finally { this.confirmingId = ''; }
        },

        async markPaymentPaid(bookingId, bookingNo) {
            if (this.payingId) return;
            const label = bookingNo ? `「${bookingNo}」` : '這筆預約';
            if (!(await BDialog.confirm({ title: `確定要將 ${label} 標記為已付款嗎？`, confirmText: '標記付款' }))) return;
            const baseUrl = window.BASE_URL || '';
            this.payingId = bookingId;
            try {
                const response = await axios.put(`${baseUrl}/cms/booking_manage/bookings/${bookingId}/mark-paid`);
                if (response.data.success) { BToast.success(response.data.message || '付款狀態已更新'); this.reloadBookings(); }
                else { await BDialog.alert({ variant: 'danger', title: '更新付款狀態失敗', desc: response.data.message || '' }); }
            } catch (error) { await BDialog.alert({ variant: 'danger', title: '更新付款狀態失敗', desc: error.response?.data?.message || '' }); }
            finally { this.payingId = ''; }
        },

        async completeRefund(bookingId, bookingNo) {
            if (this.refundingId) return;
            const label = bookingNo ? `「${bookingNo}」` : '這筆預約';
            if (!(await BDialog.confirm({ title: `確定 ${label} 已完成退款，並正式取消預約嗎？`, variant: 'danger', confirmText: '完成退款' }))) return;
            const baseUrl = window.BASE_URL || '';
            this.refundingId = bookingId;
            try {
                const response = await axios.put(`${baseUrl}/cms/booking_manage/bookings/${bookingId}/refund-complete`);
                if (response.data.success) { BToast.success(response.data.message || '退款完成狀態已更新'); this.reloadBookings(); }
                else { await BDialog.alert({ variant: 'danger', title: '更新退款狀態失敗', desc: response.data.message || '' }); }
            } catch (error) { await BDialog.alert({ variant: 'danger', title: '更新退款狀態失敗', desc: error.response?.data?.message || '' }); }
            finally { this.refundingId = ''; }
        },

        updateBookingResendButtons() {
            document.querySelectorAll('#courseBookingsTable .resend-notice-btn').forEach(button => {
                const until = Number(button.dataset.until || 0);
                const remaining = until > 0 ? Math.ceil((until - Date.now()) / 1000) : 0;
                if (remaining > 0) {
                    button.disabled = true;
                    button.innerHTML = `<i class="fa-solid fa-envelope"></i> 重寄通知（${remaining}s）`;
                } else {
                    button.disabled = false;
                    button.dataset.until = '0';
                    button.innerHTML = '<i class="fa-solid fa-envelope"></i> 重寄通知';
                }
            });
        },

        async resendBookingNotice(bookingId, bookingNo) {
            if (this.resendingNoticeId) return;
            const label = bookingNo ? `「${bookingNo}」` : '這筆預約';
            if (!(await BDialog.confirm({ title: `確定要重新寄送 ${label} 的預約資訊與報到 QR Code 嗎？`, confirmText: '重寄' }))) return;
            const baseUrl = window.BASE_URL || '';
            this.resendingNoticeId = bookingId;
            try {
                const response = await axios.post(`${baseUrl}/cms/booking_manage/bookings/${bookingId}/resend-notice`);
                const waitSeconds = Number(response.data.wait_seconds || 0);
                document.querySelectorAll(`#courseBookingsTable .resend-notice-btn[onclick*="${bookingId}"]`).forEach(b => {
                    b.dataset.until = String(waitSeconds > 0 ? Date.now() + waitSeconds * 1000 : 0);
                });
                this.updateBookingResendButtons();
                if (response.data.success) { BToast.success(response.data.message || '預約通知已重新寄送'); this.reloadBookings(); }
                else { await BDialog.alert({ variant: 'danger', title: '重新寄送失敗', desc: response.data.message || '' }); }
            } catch (error) {
                const data = error.response?.data || {};
                const waitSeconds = Number(data.wait_seconds || 0);
                if (waitSeconds > 0) {
                    document.querySelectorAll(`#courseBookingsTable .resend-notice-btn[onclick*="${bookingId}"]`).forEach(b => {
                        b.dataset.until = String(Date.now() + waitSeconds * 1000);
                    });
                    this.updateBookingResendButtons();
                }
                await BDialog.alert({ variant: 'danger', title: '重新寄送失敗', desc: data.message || '' });
            } finally { this.resendingNoticeId = ''; }
        },

        openAddForm() {
            this.isEdit = false;
            this.resetForm();
            this.resetWizard();
            this.showForm = true;
            this.$nextTick(() => {
                this._formSnapshot = JSON.stringify(this.formData);
                this.onStepEntered();   // 首次開啟 step1 無過場、不觸發 after-enter → 手動增強一次
            });
        },

        async openEditForm(courseId) {
            const baseUrl = window.BASE_URL || '';
            this.isEdit = true;
            this.resetForm();

            try {
                const response = await axios.post(`${baseUrl}/cms/course_manage/course/${courseId}`);
                if (response.data.success) {
                    this.formData = {
                        id: response.data.data.id,
                        name: response.data.data.name || '',
                        slug: response.data.data.slug || '',
                        location: response.data.data.location || '',
                        holes: Number(response.data.data.holes || 18),
                        sort: Number(response.data.data.sort || 0),
                        weekday_price: Number(response.data.data.weekday_price || 0),
                        holiday_price: Number(response.data.data.holiday_price || 0),
                        cover_image: response.data.data.cover_image || '',
                        description: response.data.data.description || '',
                        features: response.data.data.features || '',
                        booking_notice: response.data.data.booking_notice || '',
                        is_bookable: !!response.data.data.is_bookable,
                        allow_onsite_payment: !!response.data.data.allow_onsite_payment,
                        allow_newebpay: response.data.data.allow_newebpay === undefined ? true : !!response.data.data.allow_newebpay,
                        status: response.data.data.status || 'active',
                        product_type: response.data.data.product_type || 'hourly',
                        pricing_mode: response.data.data.pricing_mode || 'hourly',
                        sessions: (response.data.data.sessions || []).map(s => ({
                            name: s.name || '',
                            start_time: s.start_time || '',
                            end_time: s.end_time || '',
                            weekday_price: Number(s.weekday_price || 0),
                            holiday_price: Number(s.holiday_price || 0)
                        })),
                        default_hours: response.data.data.default_hours || {
                            is_open: true,
                            open_time: '06:00',
                            close_time: '18:00'
                        },
                        weekly_hours: response.data.data.weekly_hours?.length
                            ? response.data.data.weekly_hours
                            : this.defaultWeeklyHours(),
                        blackout_windows: (response.data.data.blackout_windows || []).map(item => ({
                            ...item,
                            is_all_day: !!item.is_all_day
                        }))
                    };
                    // 編輯:資料已完整,開放自由切換全部步驟
                    this.formStep = 0;
                    this.maxStepReached = this.wizardSteps.length - 1;
                    this.showForm = true;
                    this.$nextTick(() => {
                        this._formSnapshot = JSON.stringify(this.formData);
                        this.onStepEntered();
                    });
                } else {
                    await BDialog.alert({ variant: 'danger', title: '載入球場資料失敗。', desc: response.data.message || '' });
                }
            } catch (error) {
                await BDialog.alert({ variant: 'danger', title: '載入球場資料失敗。' });
            }
        },

        /* 表單是否被動過(相對於開啟時的快照)→ 決定關閉要不要跳確認 */
        isFormDirty() {
            if (!this._formSnapshot) return false;
            return JSON.stringify(this.formData) !== this._formSnapshot;
        },

        /* 點 ✕ / overlay:有未儲存進度 → 跳自訂確認 modal;否則直接關 */
        requestClose() {
            if (this.isFormDirty()) {
                this.showCloseConfirm = true;
            } else {
                this.closeForm();
            }
        },

        confirmClose() {
            this.showCloseConfirm = false;
            this.closeForm();
        },

        cancelClose() {
            this.showCloseConfirm = false;
        },

        async closeForm() {
            await this.cleanupQuickUploadedImages();
            this.showForm = false;
            this.resetForm();
        },

        /* 「圖片來源」下拉菜單 */
        toggleImageMenu() {
            this.imageMenuOpen = !this.imageMenuOpen;
        },
        closeImageMenu() {
            this.imageMenuOpen = false;
        },
        pickUpload() {
            this.imageMenuOpen = false;
            // ⚠️ 這頁是 SPA 雙層 app,$refs 取不到 → 用 DOM 查詢定位隱藏的 file input
            const input = document.querySelector('.js-course-cover-input');
            if (input) input.click();
        },
        pickLibrary() {
            this.imageMenuOpen = false;
            this.openImageLibraryModal();
        },
        pickClear() {
            this.imageMenuOpen = false;
            this.clearCoverImage();
        },

        /* 檔案庫選圖 modal */
        openImageLibraryModal() {
            this.showImageLibraryModal = true;
            this.loadImageOptions();
        },
        closeImageLibraryModal() {
            this.showImageLibraryModal = false;
        },
        selectCoverImageAndClose(image) {
            this.selectCoverImage(image);
            this.showImageLibraryModal = false;
        },

        /* 縮圖載入失敗 → 加 .is-broken 露出佔位符;成功 → 移除 */
        onThumbError(event) {
            const thumb = event.target.closest('.course-image-thumb');
            if (thumb) thumb.classList.add('is-broken');
        },
        onThumbLoad(event) {
            const thumb = event.target.closest('.course-image-thumb');
            if (thumb) thumb.classList.remove('is-broken');
        },

        toggleImageLibrary() {
            this.showImageLibrary = !this.showImageLibrary;
            if (this.showImageLibrary) {
                this.loadImageOptions();
            }
        },

        onCourseCoverSelect(event) {
            const files = event.target.files;
            if (files && files.length > 0) {
                this.uploadCourseCover(files[0]);
            }
            event.target.value = '';
        },

        async uploadCourseCover(file) {
            if (!file || !file.type.startsWith('image/')) {
                await BDialog.alert({ variant: 'warn', title: '請選擇圖片檔案' });
                return;
            }

            const baseUrl = window.BASE_URL || '';
            const formData = new FormData();
            formData.append('file', file);

            this.imageUploadLoading = true;
            this.imageUploadProgress = 0;

            try {
                const response = await axios.post(`${baseUrl}/cms/course_manage/upload_image`, formData, {
                    onUploadProgress: (event) => {
                        if (event.total) {
                            this.imageUploadProgress = Math.round((event.loaded / event.total) * 100);
                        }
                    }
                });

                if (response.data.success) {
                    const image = response.data.data || {};
                    this.formData.cover_image = image.url || '';
                    if (image.id) {
                        this.quickUploadedImages.push(image.id);
                        this.imageOptions = [
                            image,
                            ...this.imageOptions.filter(item => item.id !== image.id)
                        ];
                    }
                } else {
                    await BDialog.alert({ variant: 'danger', title: '圖片上傳失敗', desc: response.data.message || '' });
                }
            } catch (error) {
                await BDialog.alert({ variant: 'danger', title: '圖片上傳失敗', desc: error.response?.data?.message || '' });
            } finally {
                this.imageUploadLoading = false;
                this.imageUploadProgress = 0;
            }
        },

        async loadImageOptions(forceReload = false) {
            if (!forceReload && (this.imageOptionsLoaded || this.imageOptionsLoading)) {
                return;
            }

            const baseUrl = window.BASE_URL || '';
            this.imageOptionsLoading = true;

            try {
                const response = await axios.get(`${baseUrl}/cms/course_manage/image_options`);
                if (response.data.success) {
                    this.imageOptions = response.data.data || [];
                    this.imageOptionsLoaded = true;
                } else {
                    await BDialog.alert({ variant: 'danger', title: '載入圖片庫失敗。', desc: response.data.message || '' });
                }
            } catch (error) {
                await BDialog.alert({ variant: 'danger', title: '載入圖片庫失敗。', desc: error.response?.data?.message || '' });
            } finally {
                this.imageOptionsLoading = false;
            }
        },

        selectCoverImage(image) {
            this.formData.cover_image = image.url || '';
        },

        async deleteCourseImage(image) {
            if (!image || !image.id) {
                return;
            }
            if (!(await BDialog.confirm({ title: '確定要刪除這張圖片？', variant: 'danger', confirmText: '刪除' }))) {
                return;
            }

            const baseUrl = window.BASE_URL || '';
            try {
                const response = await axios.delete(`${baseUrl}/cms/course_manage/image/${image.id}`);
                if (response.data.success) {
                    this.imageOptions = this.imageOptions.filter(item => item.id !== image.id);
                    if (this.formData.cover_image === image.url) {
                        this.formData.cover_image = '';
                    }
                } else {
                    await BDialog.alert({ variant: 'danger', title: '圖片刪除失敗', desc: response.data.message || '' });
                }
            } catch (error) {
                await BDialog.alert({ variant: 'danger', title: '圖片刪除失敗', desc: error.response?.data?.message || '' });
            }
        },

        clearCoverImage() {
            this.formData.cover_image = '';
        },

        getPendingQuickUploadIds() {
            return [...new Set(this.quickUploadedImages.filter(Boolean).map(id => String(id)))];
        },

        async cleanupQuickUploadedImages(keepCoverImage = '') {
            const ids = this.getPendingQuickUploadIds();
            if (!ids.length) {
                return;
            }

            const baseUrl = window.BASE_URL || '';
            try {
                const response = await axios.post(`${baseUrl}/cms/course_manage/cleanup_images`, {
                    file_ids: ids,
                    keep_cover_image: keepCoverImage || ''
                });
                const requestedIds = new Set(ids.map(id => String(id)));
                const deletedIds = new Set((response.data.deleted_file_ids || []).map(id => String(id)));
                const removeIds = new Set([...requestedIds, ...deletedIds]);
                if (keepCoverImage) {
                    this.imageOptions.forEach(item => {
                        if ((item.url === keepCoverImage || item.file_path === keepCoverImage) && item.id) {
                            removeIds.delete(String(item.id));
                        }
                    });
                }

                if (removeIds.size) {
                    const removedSelected = this.imageOptions.some(item =>
                        removeIds.has(String(item.id)) && item.url === this.formData.cover_image
                    );
                    this.imageOptions = this.imageOptions.filter(item => !removeIds.has(String(item.id)));
                    this.quickUploadedImages = this.quickUploadedImages.filter(id => !removeIds.has(String(id)));
                    if (removedSelected && !keepCoverImage) {
                        this.formData.cover_image = '';
                    }
                }
            } catch (error) {
                console.warn('Course quick upload cleanup failed', error);
            }
        },

        sendQuickUploadCleanupBeacon() {
            const ids = this.getPendingQuickUploadIds();
            if (!ids.length) {
                return;
            }

            const baseUrl = window.BASE_URL || '';
            const payload = JSON.stringify({
                file_ids: ids,
                keep_cover_image: ''
            });
            const url = `${baseUrl}/cms/course_manage/cleanup_images`;
            const blob = new Blob([payload], { type: 'application/json' });

            if (navigator.sendBeacon && navigator.sendBeacon(url, blob)) {
                return;
            }

            if (window.fetch) {
                fetch(url, {
                    method: 'POST',
                    body: payload,
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    keepalive: true
                }).catch(() => {});
            }
        },

        isPlainNavigationClick(event, link) {
            return (
                event.button === 0 &&
                !event.defaultPrevented &&
                !event.metaKey &&
                !event.ctrlKey &&
                !event.shiftKey &&
                !event.altKey &&
                link &&
                link.href &&
                !link.target &&
                !link.hasAttribute('download') &&
                link.origin === window.location.origin &&
                link.href !== window.location.href
            );
        },

        async handleDocumentLinkClick(event) {
            const link = event.target.closest ? event.target.closest('a[href]') : null;
            if (!this.isPlainNavigationClick(event, link) || !this.getPendingQuickUploadIds().length) {
                return;
            }

            event.preventDefault();
            const nextUrl = link.href;
            try {
                await this.cleanupQuickUploadedImages();
            } finally {
                window.location.assign(nextUrl);
            }
        },

        operationLabel(operation) {
            return {
                add: '新增',
                update: '修改',
                delete: '停用'
            }[operation] || operation || '';
        },

        async openAuditLog(courseId, courseName) {
            const baseUrl = window.BASE_URL || '';
            this.auditCourseName = decodeURIComponent(courseName || '');
            this.auditLogs = [];
            this.auditLoading = true;
            this.showAuditLog = true;

            try {
                const response = await axios.get(`${baseUrl}/cms/course_manage/audit_log/${courseId}`);
                if (response.data.success) {
                    this.auditLogs = response.data.data || [];
                } else {
                    await BDialog.alert({ variant: 'danger', title: '載入異動紀錄失敗。', desc: response.data.message || '' });
                }
            } catch (error) {
                await BDialog.alert({ variant: 'danger', title: '載入異動紀錄失敗。', desc: error.response?.data?.message || '' });
            } finally {
                this.auditLoading = false;
            }
        },

        closeAuditLog() {
            this.showAuditLog = false;
            this.auditCourseName = '';
            this.auditLogs = [];
        },

        /* ── 報到掃描 modal(從預約管理搬來;掃描報到 QR = 綁球場的動作)──
           ⚠️ SPA 雙層 app 的 this.$refs 取不到 video → 一律 document.querySelector('.js-checkin-video') */
        openCheckinScanner(courseId, courseName) {
            this.checkinCourseName = decodeURIComponent(courseName || '');
            this.scanner.result = null;
            this.scanner.error = '';
            this.showCheckinScanner = true;
        },

        closeCheckinScanner() {
            this.stopCheckinScanner();
            this.showCheckinScanner = false;
            this.scanner.result = null;
            this.scanner.error = '';
        },

        renderCheckinStatus(status) {
            const classMap = { pending: 'warn', confirmed: 'ok', checked_in: 'brand', pending_cancel: 'bad', cancelled: 'bad', completed: 'neutral' };
            const labelMap = { pending: '待確認', confirmed: '已確認', checked_in: '已報到', pending_cancel: '待取消', cancelled: '已取消', completed: '已完成' };
            return `<span class="b-badge ${classMap[status] || 'neutral'}">${labelMap[status] || status || '-'}</span>`;
        },

        async startCheckinScanner() {
            this.scanner.error = '';
            this.scanner.result = null;

            if (!this.scanner.supported) {
                this.scanner.error = '此瀏覽器不支援相機存取,請使用新版 Chrome 或 Edge。';
                return;
            }
            if (!this.scanner.secureContext) {
                this.scanner.error = 'Chrome 只允許 HTTPS 或 localhost 使用相機,請改用 https:// 網址開啟後台。';
                return;
            }

            try {
                if ('BarcodeDetector' in window) {
                    this.scanner.detector = this.scanner.detector || new BarcodeDetector({ formats: ['qr_code'] });
                } else if (!window.jsQR) {
                    this.scanner.error = 'QR 解碼器尚未載入,請重新整理頁面後再試。';
                    return;
                }
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: 'environment' } },
                    audio: false
                });
                this.scanner.stream = stream;
                this.scanner.active = true;
                await this.$nextTick();
                const video = document.querySelector('.js-checkin-video');
                if (!video) { this.stopCheckinScanner(); return; }
                video.srcObject = stream;
                await video.play();
                this.scanner.timer = window.setInterval(this.scanCheckinFrame, 600);
            } catch (error) {
                this.scanner.error = this.describeCameraError(error);
                this.stopCheckinScanner();
            }
        },

        stopCheckinScanner() {
            if (this.scanner.timer) {
                window.clearInterval(this.scanner.timer);
                this.scanner.timer = null;
            }
            if (this.scanner.stream) {
                this.scanner.stream.getTracks().forEach(track => track.stop());
                this.scanner.stream = null;
            }
            const video = document.querySelector('.js-checkin-video');
            if (video) video.srcObject = null;
            this.scanner.active = false;
        },

        async scanCheckinFrame() {
            if (!this.scanner.active || this.scanner.processing) return;
            const video = document.querySelector('.js-checkin-video');
            if (!video || video.readyState < 2) return;

            try {
                const value = this.scanner.detector
                    ? await this.detectWithBarcodeDetector(video)
                    : this.detectWithJsQr(video);
                const now = Date.now();
                if (!value || (value === this.scanner.lastValue && now - this.scanner.lastScannedAt < 3000)) return;
                this.scanner.lastValue = value;
                this.scanner.lastScannedAt = now;
                await this.submitCheckinValue(value);
            } catch (error) {
                this.scanner.error = '掃描 QR Code 時發生錯誤。';
            }
        },

        async detectWithBarcodeDetector(video) {
            const codes = await this.scanner.detector.detect(video);
            return codes.length ? (codes[0].rawValue || '') : '';
        },

        detectWithJsQr(video) {
            const width = video.videoWidth;
            const height = video.videoHeight;
            if (!width || !height || !window.jsQR) return '';

            if (!this.scanner.canvas) {
                this.scanner.canvas = document.createElement('canvas');
                this.scanner.context = this.scanner.canvas.getContext('2d', { willReadFrequently: true });
            }
            this.scanner.canvas.width = width;
            this.scanner.canvas.height = height;
            this.scanner.context.drawImage(video, 0, 0, width, height);
            const imageData = this.scanner.context.getImageData(0, 0, width, height);
            const code = window.jsQR(imageData.data, width, height, { inversionAttempts: 'dontInvert' });
            return code ? code.data : '';
        },

        describeCameraError(error) {
            if (!window.isSecureContext) {
                return 'Chrome 只允許 HTTPS 或 localhost 使用相機,請改用 https:// 網址開啟後台。';
            }
            if (error && ['NotAllowedError', 'PermissionDeniedError'].includes(error.name)) {
                return '相機權限被拒絕,請點網址列左側圖示允許相機後再試。';
            }
            if (error && ['NotFoundError', 'DevicesNotFoundError'].includes(error.name)) {
                return '找不到可用相機,請確認攝影機已連接且未被其他程式佔用。';
            }
            if (error && ['NotReadableError', 'TrackStartError'].includes(error.name)) {
                return '相機目前無法使用,請關閉其他使用相機的程式後再試。';
            }
            return '無法開啟相機,請確認瀏覽器權限與系統相機設定。';
        },

        async submitCheckinValue(value) {
            if (this.scanner.processing) return;
            const baseUrl = window.BASE_URL || '';
            this.scanner.processing = true;
            this.scanner.error = '';

            try {
                const response = await axios.post(`${baseUrl}/cms/booking_manage/checkin-scan`, {
                    scanned_value: value
                }, {
                    headers: { 'X-Checkin-Scanner': 'booking-manage' }
                });
                this.scanner.result = response.data;
            } catch (error) {
                this.scanner.result = error.response?.data || {
                    success: false,
                    message: '報到失敗。'
                };
            } finally {
                this.scanner.processing = false;
            }
        },

        validateForm() {
            this.errors = {};
            if (!this.formData.name.trim()) {
                this.errors.name = '請輸入球場名稱。';
            }
            if (Number(this.formData.holes) <= 0) {
                this.errors.name = this.errors.name || '洞數必須大於 0。';
            }
            if (this.formData.default_hours.is_open && this.formData.default_hours.open_time >= this.formData.default_hours.close_time) {
                this.errors.default_hours = '預設關門時間必須晚於開門時間。';
            }
            (this.formData.weekly_hours || []).forEach((item, index) => {
                if (item.is_open && item.open_time >= item.close_time) {
                    this.errors.weekly_hours = `${this.weekdays[index]} 的關門時間必須晚於開門時間。`;
                }
            });
            (this.formData.blackout_windows || []).forEach((item, index) => {
                if (!item.start_date || !item.end_date) {
                    this.errors.blackout_windows = `第 ${index + 1} 筆關閉窗口需設定日期。`;
                } else if (item.end_date < item.start_date) {
                    this.errors.blackout_windows = `第 ${index + 1} 筆關閉窗口的結束日期不可早於開始日期。`;
                } else if (!item.is_all_day && (!item.start_time || !item.end_time || item.start_time >= item.end_time)) {
                    this.errors.blackout_windows = `第 ${index + 1} 筆部分時段關閉需設定正確時間。`;
                }
            });
            return Object.keys(this.errors).length === 0;
        },

        applyDefaultHours() {
            this.formData.weekly_hours = this.formData.weekly_hours.map(item => ({
                ...item,
                is_open: this.formData.default_hours.is_open,
                open_time: this.formData.default_hours.open_time,
                close_time: this.formData.default_hours.close_time
            }));
        },

        /* 開啟 modal:index=null 為新增(帶預設草稿),否則載入既有窗口副本供編輯 */
        openBlackoutModal(index = null) {
            this.blackoutModalError = '';
            this.blackoutEditIndex = index;
            if (index === null) {
                const today = new Date().toISOString().slice(0, 10);
                this.blackoutDraft = {
                    start_date: today,
                    end_date: today,
                    is_all_day: true,
                    start_time: '09:00',
                    end_time: '18:00',
                    reason: '公休日',
                    status: 'active'
                };
            } else {
                // 深拷貝一份,取消時不影響原資料
                this.blackoutDraft = { ...this.formData.blackout_windows[index] };
            }
            this.showBlackoutModal = true;
        },

        closeBlackoutModal() {
            this.showBlackoutModal = false;
            this.blackoutEditIndex = null;
            this.blackoutModalError = '';
        },

        /* 確認:就地驗證草稿後,新增 push 或編輯寫回;欄位結構與送出 payload 不變 */
        saveBlackoutModal() {
            const d = this.blackoutDraft;
            if (!d.start_date || !d.end_date) {
                this.blackoutModalError = '請設定開始與結束日期。';
                return;
            }
            if (d.end_date < d.start_date) {
                this.blackoutModalError = '結束日期不可早於開始日期。';
                return;
            }
            if (!d.is_all_day && (!d.start_time || !d.end_time || d.start_time >= d.end_time)) {
                this.blackoutModalError = '部分時段關閉需設定正確的開始/結束時間。';
                return;
            }
            const payload = { ...d };
            if (this.blackoutEditIndex === null) {
                this.formData.blackout_windows.push(payload);
            } else {
                this.formData.blackout_windows.splice(this.blackoutEditIndex, 1, payload);
            }
            this.closeBlackoutModal();
        },

        removeBlackoutWindow(index) {
            this.formData.blackout_windows.splice(index, 1);
        },

        addSession() {
            if (!this.formData.sessions) this.formData.sessions = [];
            this.formData.sessions.push({
                name: '', start_time: '', end_time: '', weekday_price: 0, holiday_price: 0
            });
        },

        removeSession(index) {
            this.formData.sessions.splice(index, 1);
        },

        /* 全驗失敗 → 跳到第一個含錯誤的步驟,讓使用者看得到紅字 */
        jumpToFirstErrorStep() {
            const map = this.stepFieldMap();
            for (let i = 0; i < this.wizardSteps.length; i++) {
                const key = this.wizardSteps[i].key;
                const hasErr = (map[key] || []).some(f => this.errors[f]);
                if (hasErr) {
                    this.formStep = i;
                    this.maxStepReached = Math.max(this.maxStepReached, i);
                    this.scrollWizardTop();
                    return;
                }
            }
        },

        async submitForm() {
            if (!this.validateForm()) {
                this.jumpToFirstErrorStep();
                return;
            }

            const baseUrl = window.BASE_URL || '';
            this.isSubmitting = true;

            const payload = {
                ...this.formData,
                quick_upload_file_ids: [...new Set(this.quickUploadedImages.filter(Boolean))],
                is_bookable: !!this.formData.is_bookable,
                allow_onsite_payment: !!this.formData.allow_onsite_payment,
                allow_newebpay: !!this.formData.allow_newebpay,
                weekly_hours: (this.formData.weekly_hours || []).map(item => ({
                    ...item,
                    is_open: !!item.is_open
                })),
                blackout_windows: (this.formData.blackout_windows || []).map(item => ({
                    ...item,
                    is_all_day: !!item.is_all_day
                }))
            };

            try {
                let response;
                if (this.isEdit) {
                    response = await axios.put(`${baseUrl}/cms/course_manage/course/${this.formData.id}`, payload);
                } else {
                    response = await axios.post(`${baseUrl}/cms/course_manage/addcourse`, payload);
                }

                if (response.data.success) {
                    BToast.success(this.isEdit ? '球場已更新。' : '球場已建立。');
                    await this.cleanupQuickUploadedImages(payload.cover_image || '');
                    this.quickUploadedImages = [];
                    await this.closeForm();
                    if (window.courseTable) {
                        window.courseTable.ajax.reload(null, false);
                    }
                } else {
                    await BDialog.alert({ variant: 'danger', title: '儲存失敗。', desc: response.data.message || '' });
                }
            } catch (error) {
                const message = error.response?.data?.message || '儲存失敗。';
                await BDialog.alert({ variant: 'danger', title: '儲存失敗。', desc: message });
            } finally {
                this.isSubmitting = false;
            }
        },

        async deleteCourse(courseId, courseName) {
            if (!(await BDialog.confirm({ title: `確定要停用球場「${courseName}」嗎？`, variant: 'danger', confirmText: '停用' }))) {
                return;
            }

            const baseUrl = window.BASE_URL || '';
            try {
                const response = await axios.put(`${baseUrl}/cms/course_manage/deletecourse/${courseId}`);
                if (response.data.success) {
                    BToast.success('球場已停用。');
                    if (window.courseTable) {
                        window.courseTable.ajax.reload(null, false);
                    }
                } else {
                    await BDialog.alert({ variant: 'danger', title: '停用失敗。', desc: response.data.message || '' });
                }
            } catch (error) {
                await BDialog.alert({ variant: 'danger', title: '停用失敗。', desc: error.response?.data?.message || '' });
            }
        },

        /* 點「圖片來源」下拉以外的地方 → 關閉菜單 */
        handleImageMenuOutside(event) {
            if (!this.imageMenuOpen) return;
            if (!event.target.closest || !event.target.closest('.course-cover-row .b-pop')) {
                this.imageMenuOpen = false;
            }
        }
    },
    mounted() {
        this.initDataTable();
        document.addEventListener('click', this.handleDocumentLinkClick, true);
        document.addEventListener('click', this.handleImageMenuOutside);
        document.addEventListener('click', this.handleActionsMenuClick);   // 操作欄「操作 ▾」下拉:委派 toggle + 點外關
        window.addEventListener('beforeunload', this.sendQuickUploadCleanupBeacon);
        window.addEventListener('pagehide', this.sendQuickUploadCleanupBeacon);
    },
    beforeUnmount() {
        // SPA 換頁(尤其上一頁/下一頁)不觸發 beforeunload/pagehide → 離頁前主動清未儲存的快速上傳圖
        this.sendQuickUploadCleanupBeacon();
        this.stopCheckinScanner();   // SPA 換頁務必關相機,否則相機一直佔用/燈亮
        this.destroyBookingsTable();   // SPA 換頁銷毀預約 modal 的 DataTables,避免殘留
        window.clearInterval(this.resendNoticeTimer);
        window.clearTimeout(this._searchTimer);
        window.clearTimeout(this._bookingsSearchTimer);
        document.removeEventListener('click', this.handleDocumentLinkClick, true);
        document.removeEventListener('click', this.handleImageMenuOutside);
        document.removeEventListener('click', this.handleActionsMenuClick);
        window.removeEventListener('beforeunload', this.sendQuickUploadCleanupBeacon);
        window.removeEventListener('pagehide', this.sendQuickUploadCleanupBeacon);
    }
};
