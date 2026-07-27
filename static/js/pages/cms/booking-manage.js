const BookingManagePageApp = {
    ...baseApp,
    data() {
        return {
            ...baseApp.data(),
            tableSearch: '',
            showBookingDetail: false,
            bookingDetail: null,
            filters: {
                course_id: '',
                start_date: '',
                end_date: '',
                status: '',
                payment_status: ''
            },
            stats: {
                total_bookings: 0,
                pending_count: 0,
                confirmed_count: 0,
                pending_cancel_count: 0,
                cancelled_count: 0,
                total_amount: 0,
                total_duration_hours: 0
            },
            scheduleDate: '',
            schedule: {
                loading: false,
                loaded: false,
                error: '',
                time_slots: [],
                courses: [],
                summary: {
                    booked_count: 0,
                    available_count: 0,
                    unavailable_count: 0
                }
            },
            bookedDays: {
                loading: false,
                loaded: false,
                error: '',
                days: [],
                booked_day_count: 0,
                total_booking_count: 0,
                max_daily_booking_count: 0,
                start_date: '',
                end_date: ''
            },
            confirmingId: '',
            payingId: '',
            refundingId: '',
            resendingNoticeId: '',
            resendNoticeTimer: null
        };
    },
    computed: {
        ...baseApp.computed,

        activeCourseName() {
            if (!this.filters.course_id) return '';
            const options = window.BOOKING_COURSE_OPTIONS || [];
            const activeCourse = options.find(course => course.id === this.filters.course_id);
            return activeCourse ? activeCourse.name : '';
        },

        hasCourseFilter() {
            return !!this.filters.course_id;
        },

        hasBookedDaysRange() {
            return !!(this.hasCourseFilter && (this.filters.start_date || this.filters.end_date));
        },

        bookedDaysRangeLabel() {
            const coursePrefix = this.activeCourseName ? `${this.activeCourseName} / ` : '';
            if (this.bookedDays.start_date && this.bookedDays.end_date) {
                return `${coursePrefix}${this.bookedDays.start_date} 至 ${this.bookedDays.end_date}`;
            }
            if (this.bookedDays.start_date) return `${coursePrefix}${this.bookedDays.start_date} 之後`;
            if (this.bookedDays.end_date) return `${coursePrefix}${this.bookedDays.end_date} 之前`;
            return '全部日期';
        }
    },
    methods: {
        ...baseApp.methods,

        getLocalDateString() {
            const now = new Date();
            const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
            return localDate.toISOString().slice(0, 10);
        },

        initFiltersFromQuery() {
            const params = new URLSearchParams(window.location.search);
            this.filters.course_id = params.get('course_id') || '';
            this.filters.start_date = params.get('start_date') || '';
            this.filters.end_date = params.get('end_date') || '';
            this.filters.status = params.get('status') || '';
            this.filters.payment_status = params.get('payment_status') || '';
            this.scheduleDate = params.get('schedule_date') || this.filters.start_date || this.getLocalDateString();
        },

        syncQueryString() {
            if (this.$ && this.$.isUnmounted) return;   // SPA 換頁後遲到的 async 回呼不得改寫新頁網址
            const params = new URLSearchParams();
            Object.entries(this.filters).forEach(([key, value]) => {
                if (value) params.set(key, value);
            });
            if (this.scheduleDate) params.set('schedule_date', this.scheduleDate);
            const queryString = params.toString();
            window.history.replaceState({}, '', queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname);
        },

        renderBookingStatus(status) {
            // 狀態 pill 改用共用 .b-badge(b_admin.css),色票走 token、深淺色自動
            const classMap = { pending: 'warn', confirmed: 'ok', checked_in: 'brand', pending_cancel: 'bad', cancelled: 'bad', completed: 'neutral' };
            const labelMap = { pending: '待確認', confirmed: '已確認', checked_in: '已報到', pending_cancel: '待取消', cancelled: '已取消', completed: '已完成' };
            return `<span class="b-badge ${classMap[status] || 'neutral'}">${labelMap[status] || status || '-'}</span>`;
        },

        renderPaymentStatus(status, row) {
            status = status || 'unpaid';
            const classMap = { unpaid: 'neutral', onsite: 'brand', pending: 'warn', paid: 'ok', refunded: 'neutral', failed: 'bad' };
            const labelMap = { unpaid: '未付款', onsite: '現場付款', pending: '付款中', paid: '已付款', refunded: '已退款', failed: '付款失敗' };
            const tradeNo = row.payment_trade_no
                ? `<div style="margin-top:4px;color:var(--text-body-subtle);font-size:11px;">${row.payment_trade_no}</div>`
                : '';
            return `<div><span class="b-badge ${classMap[status] || 'neutral'}">${labelMap[status] || status || '-'}</span>${tradeNo}</div>`;
        },

        formatCurrency(value) {
            return `$${Number(value || 0).toLocaleString()}`;
        },

        formatHours(value) {
            const hours = Number(value || 0);
            return `${hours.toLocaleString(undefined, { maximumFractionDigits: 2 })} 小時`;
        },

        initDataTable() {
            const baseUrl = window.BASE_URL || '';
            const self = this;

            if ($.fn.DataTable.isDataTable('#bookingTable')) return;

            window.bookingTable = $('#bookingTable').DataTable({
                processing: true,
                serverSide: true,
                ajax: {
                    url: `${baseUrl}/cms/booking_manage/list`,
                    type: 'GET',
                    data(data) {
                        data.course_id = self.filters.course_id;
                        data.start_date = self.filters.start_date;
                        data.end_date = self.filters.end_date;
                        data.status = self.filters.status;
                        data.payment_status = self.filters.payment_status;
                    }
                },
                columns: [
                    { data: 'play_date', title: '日期', width: '110px' },
                    { data: 'course_name', title: '球場' },
                    {
                        data: null,
                        title: '時段',
                        width: '140px',
                        render: row => `${String(row.start_time || '').slice(0, 5)} - ${String(row.end_time || '').slice(0, 5)}`
                    },
                    { data: 'duration_hours', title: '時數', width: '80px', className: 'text-center', render: data => `${data || 1} 小時` },
                    { data: 'member_name', title: '會員' },
                    {
                        data: 'total_price',
                        title: '金額',
                        width: '110px',
                        render: data => `$${Number(data || 0).toLocaleString()}`
                    },
                    {
                        data: 'payment_status',
                        title: '付款狀態',
                        width: '150px',
                        className: 'col-center',
                        render: (data, type, row) => this.renderPaymentStatus(data, row)
                    },
                    {
                        data: 'status',
                        title: '預約狀態',
                        width: '110px',
                        className: 'col-center',
                        render: data => this.renderBookingStatus(data)
                    },
                    {
                        data: null,
                        title: '操作',
                        orderable: false,
                        width: '200px',
                        className: 'col-actions',
                        render: row => {
                            const buttons = [];
                            // 詳細:開 modal 看完整資訊(聯絡/編號等不再放外面主表)
                            buttons.push(`
                                <button class="action-btn neutral" onclick="window.vueApp.openBookingDetail('${row.id}')">
                                    <i class="fa-solid fa-circle-info"></i> 詳細
                                </button>
                            `);
                            if (row.status === 'pending') {
                                buttons.push(`
                                    <button class="action-btn add" onclick="window.vueApp.confirmBooking('${row.id}', '${row.booking_no || ''}')">
                                        <i class="fa-solid fa-check"></i> 確認
                                    </button>
                                `);
                            }
                            if ((row.payment_status || 'unpaid') === 'onsite') {
                                buttons.push(`
                                    <button class="action-btn edit" onclick="window.vueApp.markPaymentPaid('${row.id}', '${row.booking_no || ''}')">
                                        <i class="fa-solid fa-money-bill-wave"></i> 付款完成
                                    </button>
                                `);
                            }
                            if (row.status === 'pending_cancel' && row.payment_status === 'paid') {
                                buttons.push(`
                                    <button class="action-btn disable" onclick="window.vueApp.completeRefund('${row.id}', '${row.booking_no || ''}')">
                                        <i class="fa-solid fa-rotate-left"></i> 退款完成
                                    </button>
                                `);
                            }
                            if (row.booking_notice_can_resend) {
                                const waitSeconds = Number(row.booking_notice_resend_wait_seconds || 0);
                                const disabled = waitSeconds > 0 ? 'disabled' : '';
                                const until = waitSeconds > 0 ? Date.now() + waitSeconds * 1000 : 0;
                                buttons.push(`
                                    <button class="action-btn edit resend-notice-btn" ${disabled} data-until="${until}" onclick="window.vueApp.resendBookingNotice('${row.id}', '${row.booking_no || ''}')">
                                        <i class="fa-solid fa-envelope"></i> 重寄通知
                                    </button>
                                `);
                            }
                            /* 對齊球場管理:寬螢幕平鋪(.col-actions-flat)、窄螢幕收成「操作 ▾」下拉(.b-actions-dd)。
                               兩版共用同一份 buttons;下拉開合由 handleActionsMenuClick(委派)控制。 */
                            const items = buttons.join('');
                            return `
                                <div class="col-actions-flat">${items}</div>
                                <div class="b-actions-dd">
                                    <button type="button" class="b-actions-dd-trigger" aria-haspopup="true" aria-expanded="false">操作 <i class="fa-solid fa-chevron-down"></i></button>
                                    <div class="b-actions-dd-menu" role="menu">${items}</div>
                                </div>`;
                        }
                    }
                ],
                order: [[0, 'desc'], [2, 'asc']],
                /* 對齊球場管理:只出表格本體(r=載入中 t=表格),去分頁/每頁筆數/搜尋/筆數資訊;
                   內滾交給外層 .b-tbl-scroll + is-fixed-h。
                   ⚠️ 不可用 paging:false(serverSide 送 length=-1 後端 FETCH NEXT 會炸);
                   ⚠️ 預約筆數可能很多 → 目前單頁上限 200,超過 200 筆看不到後面(球場管理球場少故無此問題);
                      若真的超過需再加回分頁或虛擬捲動。 */
                dom: 'rt',
                pageLength: 200,
                language: {
                    processing: '載入中...',
                    zeroRecords: '沒有符合條件的預約',
                    emptyTable: '目前沒有預約資料'
                },
                drawCallback: () => {
                    window.setTimeout(() => self.updateResendNoticeButtons(), 0);
                }
            });
        },

        async loadStats() {
            const baseUrl = window.BASE_URL || '';
            const params = new URLSearchParams(this.filters);
            try {
                const response = await axios.get(`${baseUrl}/cms/booking_manage/stats?${params.toString()}`);
                if (response.data.success) this.stats = response.data.data;
            } catch (error) {
                console.error('載入預約統計失敗：', error);
            }
        },

        async loadBookedDays() {
            if (!this.hasBookedDaysRange) {
                this.bookedDays = {
                    loading: false,
                    loaded: false,
                    error: '',
                    days: [],
                    booked_day_count: 0,
                    total_booking_count: 0,
                    max_daily_booking_count: 0,
                    start_date: '',
                    end_date: ''
                };
                return;
            }

            const baseUrl = window.BASE_URL || '';
            const params = new URLSearchParams(this.filters);

            this.bookedDays.loading = true;
            this.bookedDays.error = '';

            try {
                const response = await axios.get(`${baseUrl}/cms/booking_manage/booked-days?${params.toString()}`);
                if (response.data.success) {
                    this.bookedDays = {
                        loading: false,
                        loaded: true,
                        error: '',
                        ...response.data.data
                    };
                } else {
                    this.bookedDays.error = response.data.message || '載入期間預約天數失敗';
                }
            } catch (error) {
                this.bookedDays.error = error.response?.data?.message || '載入期間預約天數失敗';
            } finally {
                this.bookedDays.loading = false;
                this.bookedDays.loaded = true;
            }
        },

        async loadSchedule() {
            if (!this.hasCourseFilter) {
                this.schedule = {
                    loading: false,
                    loaded: false,
                    error: '',
                    time_slots: [],
                    courses: [],
                    summary: {
                        booked_count: 0,
                        available_count: 0,
                        unavailable_count: 0
                    }
                };
                return;
            }

            const baseUrl = window.BASE_URL || '';
            const params = new URLSearchParams();
            params.set('date', this.scheduleDate || this.getLocalDateString());
            params.set('course_id', this.filters.course_id);

            this.schedule.loading = true;
            this.schedule.error = '';

            try {
                const response = await axios.get(`${baseUrl}/cms/booking_manage/schedule?${params.toString()}`);
                if (response.data.success) {
                    this.schedule = {
                        loading: false,
                        loaded: true,
                        error: '',
                        ...response.data.data
                    };
                } else {
                    this.schedule.error = response.data.message || '載入日程失敗';
                }
            } catch (error) {
                this.schedule.error = error.response?.data?.message || '載入日程失敗';
            } finally {
                this.schedule.loading = false;
                this.schedule.loaded = true;
            }
        },

        getScheduleCell(course, label) {
            return (course.slots || []).find(slot => slot.label === label) || { status: 'empty' };
        },

        getBookedDayLevel(day) {
            if (!day.booking_count) return 'level-0';
            const maxCount = this.bookedDays.max_daily_booking_count || 1;
            const ratio = (day.booking_count || 0) / maxCount;
            if (ratio >= 0.75) return 'level-4';
            if (ratio >= 0.5) return 'level-3';
            if (ratio >= 0.25) return 'level-2';
            return 'level-1';
        },

        updateResendNoticeButtons() {
            document.querySelectorAll('.resend-notice-btn').forEach(button => {
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
                document.querySelectorAll(`.resend-notice-btn[onclick*="${bookingId}"]`).forEach(button => {
                    button.dataset.until = String(waitSeconds > 0 ? Date.now() + waitSeconds * 1000 : 0);
                });
                this.updateResendNoticeButtons();
                if (response.data.success) {
                    BToast.success(response.data.message || '預約通知已重新寄送');
                    this.reloadAll();
                } else {
                    await BDialog.alert({ variant: 'danger', title: '重新寄送失敗', desc: response.data.message || '' });
                }
            } catch (error) {
                const data = error.response?.data || {};
                const waitSeconds = Number(data.wait_seconds || 0);
                if (waitSeconds > 0) {
                    document.querySelectorAll(`.resend-notice-btn[onclick*="${bookingId}"]`).forEach(button => {
                        button.dataset.until = String(Date.now() + waitSeconds * 1000);
                    });
                    this.updateResendNoticeButtons();
                }
                await BDialog.alert({ variant: 'danger', title: '重新寄送失敗', desc: data.message || '' });
            } finally {
                this.resendingNoticeId = '';
            }
        },

        formatBookedDayDate(dateValue) {
            if (!dateValue) return '';
            const parts = String(dateValue).split('-');
            if (parts.length !== 3) return dateValue;
            return `${Number(parts[1])}/${Number(parts[2])}`;
        },

        formatBookedDayYear(dateValue) {
            if (!dateValue) return '';
            const parts = String(dateValue).split('-');
            return parts.length === 3 ? parts[0] : '';
        },

        async confirmBooking(bookingId, bookingNo) {
            if (this.confirmingId) return;
            const label = bookingNo ? `「${bookingNo}」` : '這筆預約';
            if (!(await BDialog.confirm({ title: `確定要確認 ${label} 嗎？`, confirmText: '確認' }))) return;

            const baseUrl = window.BASE_URL || '';
            this.confirmingId = bookingId;

            try {
                const response = await axios.put(`${baseUrl}/cms/booking_manage/bookings/${bookingId}/confirm`);
                if (response.data.success) {
                    BToast.success(response.data.message || '預約已確認');
                    this.reloadAll();
                } else {
                    await BDialog.alert({ variant: 'danger', title: '確認預約失敗', desc: response.data.message || '' });
                }
            } catch (error) {
                await BDialog.alert({ variant: 'danger', title: '確認預約失敗', desc: error.response?.data?.message || '' });
            } finally {
                this.confirmingId = '';
            }
        },

        async markPaymentPaid(bookingId, bookingNo) {
            if (this.payingId) return;
            const label = bookingNo ? `「${bookingNo}」` : '這筆預約';
            if (!(await BDialog.confirm({ title: `確定要將 ${label} 標記為已付款嗎？`, confirmText: '標記付款' }))) return;

            const baseUrl = window.BASE_URL || '';
            this.payingId = bookingId;

            try {
                const response = await axios.put(`${baseUrl}/cms/booking_manage/bookings/${bookingId}/mark-paid`);
                if (response.data.success) {
                    BToast.success(response.data.message || '付款狀態已更新');
                    this.reloadAll();
                } else {
                    await BDialog.alert({ variant: 'danger', title: '更新付款狀態失敗', desc: response.data.message || '' });
                }
            } catch (error) {
                await BDialog.alert({ variant: 'danger', title: '更新付款狀態失敗', desc: error.response?.data?.message || '' });
            } finally {
                this.payingId = '';
            }
        },

        async completeRefund(bookingId, bookingNo) {
            if (this.refundingId) return;
            const label = bookingNo ? `「${bookingNo}」` : '這筆預約';
            if (!(await BDialog.confirm({ title: `確定 ${label} 已完成退款，並正式取消預約嗎？`, variant: 'danger', confirmText: '完成退款' }))) return;

            const baseUrl = window.BASE_URL || '';
            this.refundingId = bookingId;

            try {
                const response = await axios.put(`${baseUrl}/cms/booking_manage/bookings/${bookingId}/refund-complete`);
                if (response.data.success) {
                    BToast.success(response.data.message || '退款完成狀態已更新');
                    this.reloadAll();
                } else {
                    await BDialog.alert({ variant: 'danger', title: '更新退款狀態失敗', desc: response.data.message || '' });
                }
            } catch (error) {
                await BDialog.alert({ variant: 'danger', title: '更新退款狀態失敗', desc: error.response?.data?.message || '' });
            } finally {
                this.refundingId = '';
            }
        },

        reloadAll() {
            this.syncQueryString();
            this.loadStats();
            if (window.bookingTable) window.bookingTable.ajax.reload(null, false);
        },

        /* 搜尋框對齊球場管理:驅動 DataTables server-side search[value],300ms 去抖 */
        onTableSearch() {
            window.clearTimeout(this._searchTimer);
            this._searchTimer = window.setTimeout(() => {
                if (window.bookingTable) window.bookingTable.search(this.tableSearch).draw();
            }, 300);
        },

        clearTableSearch() {
            this.tableSearch = '';
            window.clearTimeout(this._searchTimer);
            if (window.bookingTable) window.bookingTable.search('').draw();
        },

        /* 操作欄「操作 ▾」下拉(窄螢幕):委派點擊(DataTables 動態重繪 row,故委派)。
           點觸發器 → toggle 該列、關其他;點下拉外/選項 → 關全部。對齊球場管理。 */
        handleActionsMenuClick(e) {
            const trigger = e.target.closest('.b-actions-dd-trigger');
            const openMenus = document.querySelectorAll('.b-actions-dd.is-open');
            if (trigger) {
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
            openMenus.forEach(m => this._closeActionsDd(m));
        },
        _closeActionsDd(dd) {
            dd.classList.remove('is-open');
            const t = dd.querySelector('.b-actions-dd-trigger');
            if (t) t.setAttribute('aria-expanded', 'false');
        },

        /* 詳細 modal:主表只放重要欄位,完整資訊(聯絡/編號等)點「詳細」開 modal 看。
           從 DataTables 現有 row data 取該筆(免再打 API)。 */
        openBookingDetail(bookingId) {
            let found = null;
            if (window.bookingTable) {
                window.bookingTable.rows().every(function () {
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

        resetFilters() {
            this.filters = { course_id: '', start_date: '', end_date: '', status: '', payment_status: '' };
            this.reloadAll();
        }
    },
    mounted() {
        this.initFiltersFromQuery();
        this.initDataTable();
        this.reloadAll();
        this.resendNoticeTimer = window.setInterval(this.updateResendNoticeButtons, 1000);
        document.addEventListener('click', this.handleActionsMenuClick);   // 操作欄「操作 ▾」下拉:委派 toggle + 點外關
    },
    beforeUnmount() {
        if (this.resendNoticeTimer) {
            window.clearInterval(this.resendNoticeTimer);
            this.resendNoticeTimer = null;
        }
        document.removeEventListener('click', this.handleActionsMenuClick);
    }
};
