const CourseBlackoutManagePageApp = {
    ...baseApp,
    data() {
        const today = new Date().toISOString().slice(0, 10);
        return {
            ...baseApp.data(),
            tableSearch: '',
            tableEmpty: false,
            showTodayAlert: false,
            showScheduleModal: false,
            filters: {
                course_id: '',
                status: ''
            },
            showForm: false,
            isEdit: false,
            isSubmitting: false,
            selectedCourseId: '',
            calendarMonth: '',
            calendar: {
                loading: false,
                error: '',
                days: [],
                leadingBlanks: 0
            },
            schedule: {
                loading: false,
                loaded: false,
                error: '',
                date: '',
                course: {},
                slots: [],
                summary: {
                    booked_count: 0,
                    available_count: 0,
                    unavailable_count: 0
                }
            },
            formData: {
                id: '',
                course_id: '',
                start_date: today,
                end_date: today,
                is_all_day: true,
                start_time: '09:00',
                end_time: '18:00',
                reason: '公休日',
                status: 'active'
            },
            errors: {},
            quickReasons: ['公休日', '場地維護', '設備保養', '包場活動', '天候暫停']
        };
    },
    computed: {
        ...baseApp.computed,

        isScopedManager() {
            return (window.BLACKOUT_ASSIGNED_COURSE_IDS || []).length > 0;
        },

        // 月份大標:calendarMonth 形如 '2026-07' → 「2026年7月」(去前導零)
        calendarMonthLabel() {
            const parts = String(this.calendarMonth || '').split('-');
            if (parts.length < 2) return this.calendarMonth || '';
            return `${parts[0]}年${parseInt(parts[1], 10)}月`;
        },

        // 月底沒滿一週:尾端補空白格數(前導空白 + 日數 補到 7 的倍數),像一般月曆自然收尾
        trailingBlanks() {
            const total = (this.calendar.leadingBlanks || 0) + (this.calendar.days ? this.calendar.days.length : 0);
            return (7 - (total % 7)) % 7;
        },

        selectedCourseName() {
            const course = (window.BLACKOUT_COURSE_OPTIONS || []).find(item => String(item.id) === String(this.formData.course_id || this.selectedCourseId));
            return course ? course.name : '';
        }
    },
    methods: {
        ...baseApp.methods,

        /* 搜尋框對齊其他列表頁:驅動 DataTables server-side search[value],300ms 去抖 */
        onTableSearch() {
            window.clearTimeout(this._searchTimer);
            this._searchTimer = window.setTimeout(() => {
                if (window.blackoutTable) window.blackoutTable.search(this.tableSearch).draw();
            }, 300);
        },

        clearTableSearch() {
            this.tableSearch = '';
            window.clearTimeout(this._searchTimer);
            if (window.blackoutTable) window.blackoutTable.search('').draw();
        },

        getLocalDateString() {
            const now = new Date();
            const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
            return localDate.toISOString().slice(0, 10);
        },

        isLockedDateRange(startDate, endDate) {
            const today = this.getLocalDateString();
            return !!startDate && (startDate <= today || (endDate || startDate) <= today);
        },

        defaultFormData() {
            const today = this.getNextEditableDate();
            return {
                id: '',
                course_id: '',
                start_date: today,
                end_date: today,
                is_all_day: true,
                start_time: '09:00',
                end_time: '18:00',
                reason: '公休日',
                status: 'active'
            };
        },

        formatHours(value) {
            const hours = Number(value || 0);
            return `${hours.toLocaleString(undefined, { maximumFractionDigits: 2 })} 小時`;
        },

        getCurrentMonth() {
            return this.getLocalDateString().slice(0, 7);
        },

        getNextEditableDate() {
            const now = new Date();
            const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
            const localDate = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000);
            return localDate.toISOString().slice(0, 10);
        },

        initCourseScope() {
            const assigned = window.BLACKOUT_ASSIGNED_COURSE_IDS || [];
            const courses = window.BLACKOUT_COURSE_OPTIONS || [];
            // 日曆球場:預設第一個(或被指派的球場)。日曆一次只看一個球場。
            this.selectedCourseId = assigned[0] || (courses[0] ? String(courses[0].id) : '');
            // 表格篩選與日曆獨立:被指派單一球場者鎖該球場,否則預設「全部球場」(空)。
            this.filters.course_id = this.isScopedManager ? this.selectedCourseId : '';
            this.calendarMonth = this.getCurrentMonth();
        },

        async loadCalendar() {
            if (!this.selectedCourseId) return;
            const baseUrl = window.BASE_URL || '';
            const params = new URLSearchParams();
            params.set('course_id', this.selectedCourseId);
            params.set('month', this.calendarMonth || this.getCurrentMonth());

            this.calendar.loading = true;
            this.calendar.error = '';
            try {
                const response = await axios.get(`${baseUrl}/cms/course_blackout_manage/calendar?${params.toString()}`);
                if (response.data.success) {
                    const days = response.data.data.days || [];
                    const first = days[0];
                    const leadingBlanks = first ? first.weekday : 0;
                    this.calendar = {
                        loading: false,
                        error: '',
                        days,
                        leadingBlanks
                    };
                    this.calendarMonth = response.data.data.month || this.calendarMonth;
                } else {
                    this.calendar.error = response.data.message || '讀取月曆失敗。';
                }
            } catch (error) {
                this.calendar.error = error.response?.data?.message || '讀取月曆失敗。';
            } finally {
                this.calendar.loading = false;
            }
        },

        moveMonth(offset) {
            const [year, month] = (this.calendarMonth || this.getCurrentMonth()).split('-').map(Number);
            const next = new Date(year, month - 1 + offset, 1);
            this.calendarMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
            this.loadCalendar();
        },

        goCurrentMonth() {
            this.calendarMonth = this.getCurrentMonth();
            this.loadCalendar();
        },

        initDataTable() {
            const baseUrl = window.BASE_URL || '';
            const self = this;

            if ($.fn.DataTable.isDataTable('#blackoutTable')) return;

            window.blackoutTable = $('#blackoutTable').DataTable({
                processing: true,
                serverSide: true,
                ajax: {
                    url: `${baseUrl}/cms/course_blackout_manage/list`,
                    type: 'GET',
                    data(data) {
                        data.course_id = self.filters.course_id;
                        data.status = self.filters.status;
                    }
                },
                columns: [
                    { data: 'course_name', title: '球場名稱' },
                    { data: 'start_date', title: '開始日期', width: '110px' },
                    { data: 'end_date', title: '結束日期', width: '110px' },
                    {
                        data: null,
                        title: '暫停時段',
                        width: '140px',
                        render: row => row.is_all_day ? '全天' : `${String(row.start_time || '').slice(0, 5)} - ${String(row.end_time || '').slice(0, 5)}`
                    },
                    { data: 'reason', title: '原因' },
                    {
                        data: 'status',
                        title: '狀態',
                        width: '80px',
                        className: 'col-center',
                        render: data => data === 'active'
                            ? '<span class="b-badge ok">啟用</span>'
                            : '<span class="b-badge neutral">停用</span>'
                    },
                    {
                        data: null,
                        title: '操作',
                        orderable: false,
                        width: '150px',
                        render: row => {
                            if (self.isLockedDateRange(row.start_date, row.end_date)) {
                                return '<span style="color:var(--fg-disabled); font-weight:500;">已鎖定</span>';
                            }
                            return `
                            <button class="action-btn edit" onclick="window.vueApp.openEditForm('${row.id}')">
                                <i class="fa-solid fa-pen"></i> 編輯
                            </button>
                            <button class="action-btn disable" onclick="window.vueApp.deleteWindow('${row.id}', '${(row.reason || '').replace(/'/g, "\\'")}')">
                                <i class="fa-solid fa-trash"></i> 刪除
                            </button>
                        `;
                        }
                    }
                ],
                order: [[1, 'asc']],
                /* 去 DataTables chrome:只留 table(r) + tbody(t),對齊球場管理/預約管理/會員管理。
                   ⚠️ serverSide 不可 paging:false(送 length=-1 後端 FETCH NEXT 會炸);
                   ⚠️ 窗口筆數多時單頁上限 200,超過看不到後面;若真超過需再加回分頁。 */
                dom: 'rt',
                pageLength: 200,
                /* 空狀態改用頁面 .b-empty(置中、無框線):0 筆時切 tableEmpty→隱藏表格顯示 b-empty。
                   zeroRecords 留空字串 → DataTables 不畫那條有框線的「沒有符合」列。 */
                drawCallback: () => {
                    const info = window.blackoutTable ? window.blackoutTable.page.info() : null;
                    self.tableEmpty = !!info && info.recordsDisplay === 0;
                },
                language: {
                    processing: '載入中...',
                    zeroRecords: '',
                    info: '顯示第 _START_ 到 _END_ 筆，共 _TOTAL_ 筆',
                    infoEmpty: '沒有暫停營業窗口',
                    infoFiltered: '(從 _MAX_ 筆資料篩選)',
                    search: '搜尋：',
                    paginate: { first: '第一頁', previous: '上一頁', next: '下一頁', last: '最後頁' }
                }
            });
        },

        /* 表格篩選與日曆各自獨立:reloadTable 只重載表格,不動 selectedCourseId / 日曆
           (日曆球場由日曆上方的專屬下拉 @change=loadCalendar 控制)。 */
        reloadTable() {
            if (window.blackoutTable) {
                window.blackoutTable.ajax.reload(null, false);
            }
        },

        resetFilters() {
            this.filters = {
                course_id: this.isScopedManager ? this.selectedCourseId : '',
                status: ''
            };
            this.reloadTable();
        },

        resetForm() {
            this.formData = this.defaultFormData();
            this.errors = {};
            this.isSubmitting = false;
            this.showScheduleModal = false;
            this.resetSchedule();
        },

        emptyScheduleState(courseId = '', dateValue = '') {
            const course = (window.BLACKOUT_COURSE_OPTIONS || []).find(item => String(item.id) === String(courseId || ''));
            return {
                loading: false,
                loaded: false,
                error: '',
                date: dateValue || '',
                course: course ? { id: String(course.id), name: course.name || '' } : {},
                slots: [],
                summary: {
                    booked_count: 0,
                    available_count: 0,
                    unavailable_count: 0
                }
            };
        },

        resetSchedule() {
            this.schedule = this.emptyScheduleState();
        },

        scheduleMatchesForm() {
            return !!(
                this.schedule.loaded &&
                !this.schedule.loading &&
                String(this.schedule.course?.id || '') === String(this.formData.course_id || '') &&
                String(this.schedule.date || '') === String(this.formData.start_date || '')
            );
        },

        closeScheduleModal() {
            this.showScheduleModal = false;
        },

        async openScheduleModal() {
            if (!this.formData.course_id || !this.formData.start_date) {
                this.resetSchedule();
                return;
            }
            this.showScheduleModal = true;
            if (!this.scheduleMatchesForm()) {
                await this.loadDaySchedule(this.formData.course_id, this.formData.start_date);
            }
        },

        async loadDaySchedule(courseId, dateValue) {
            if (!courseId || !dateValue) {
                this.resetSchedule();
                this.showScheduleModal = false;
                return;
            }
            const baseUrl = window.BASE_URL || '';
            const params = new URLSearchParams();
            params.set('course_id', courseId);
            params.set('date', dateValue);

            this.schedule = {
                ...this.emptyScheduleState(courseId, dateValue),
                loading: true
            };

            try {
                const response = await axios.get(`${baseUrl}/cms/course_blackout_manage/day-schedule?${params.toString()}`);
                if (response.data.success) {
                    this.schedule = {
                        loading: false,
                        loaded: true,
                        error: '',
                        ...response.data.data
                    };
                } else {
                    this.schedule = {
                        ...this.emptyScheduleState(courseId, dateValue),
                        loaded: true,
                        error: response.data.message || '載入當日時刻表失敗'
                    };
                }
            } catch (error) {
                this.schedule = {
                    ...this.emptyScheduleState(courseId, dateValue),
                    loaded: true,
                    error: error.response?.data?.message || '載入當日時刻表失敗'
                };
            } finally {
                this.schedule.loading = false;
                this.schedule.loaded = true;
            }
        },

        openAddForm() {
            this.isEdit = false;
            this.resetForm();
            if (this.filters.course_id) {
                this.formData.course_id = this.filters.course_id;
            }
            this.showForm = true;
        },

        async openDayForm(day) {
            // 今天:亮起可點,但點下去跳自訂提示(當日不可設暫停,後端強制 <= today 擋)
            if (day.is_today) {
                this.showTodayAlert = true;
                return;
            }
            // 今天以前(真正過去日期):維持不可點,不做任何事
            if (day.is_locked || this.isLockedDateRange(day.date, day.date)) {
                return;
            }
            this.isEdit = false;
            this.resetForm();
            this.formData.course_id = this.selectedCourseId;
            this.formData.start_date = day.date;
            this.formData.end_date = day.date;
            this.formData.reason = day.blackout_windows?.[0]?.reason || '公休日';
            this.formData.status = 'active';

            const activeWindow = (day.blackout_windows || []).find(item => item.status === 'active');
            if (activeWindow) {
                this.isEdit = true;
                this.formData = {
                    id: activeWindow.id || '',
                    course_id: activeWindow.course_id || this.selectedCourseId,
                    start_date: activeWindow.start_date || day.date,
                    end_date: activeWindow.end_date || day.date,
                    is_all_day: !!activeWindow.is_all_day,
                    start_time: activeWindow.start_time || '09:00',
                    end_time: activeWindow.end_time || '18:00',
                    reason: activeWindow.reason || '公休日',
                    status: activeWindow.status || 'active'
                };
            }
            if (day.booking_count > 0) {
                this.loadDaySchedule(this.formData.course_id, day.date);
            }
            this.showForm = true;
        },

        async openEditForm(windowId) {
            const baseUrl = window.BASE_URL || '';
            this.isEdit = true;
            this.resetForm();

            try {
                const response = await axios.get(`${baseUrl}/cms/course_blackout_manage/window/${windowId}`);
                if (response.data.success) {
                    const data = response.data.data || {};
                    if (this.isLockedDateRange(data.start_date, data.end_date)) {
                        await BDialog.alert({ variant: 'warn', title: '今天以前的暫停營業不可修改。' });
                        return;
                    }
                    this.formData = {
                        id: data.id || '',
                        course_id: data.course_id || '',
                        start_date: data.start_date || this.getLocalDateString(),
                        end_date: data.end_date || data.start_date || this.getLocalDateString(),
                        is_all_day: !!data.is_all_day,
                        start_time: data.start_time || '09:00',
                        end_time: data.end_time || '18:00',
                        reason: data.reason || '公休日',
                        status: data.status || 'active'
                    };
                    this.loadDaySchedule(this.formData.course_id, this.formData.start_date);
                    this.showForm = true;
                } else {
                    await BDialog.alert({ variant: 'danger', title: '讀取暫停營業窗口失敗。', desc: response.data.message || '' });
                }
            } catch (error) {
                await BDialog.alert({ variant: 'danger', title: '讀取暫停營業窗口失敗。', desc: error.response?.data?.message || '' });
            }
        },

        closeForm() {
            this.showForm = false;
            this.resetForm();
        },

        validateForm() {
            this.errors = {};
            if (!this.formData.course_id) {
                this.errors.course_id = '請選擇球場。';
            }
            if (!this.formData.start_date || !this.formData.end_date) {
                this.errors.date = '請設定開始日期與結束日期。';
            } else if (this.formData.end_date < this.formData.start_date) {
                this.errors.date = '結束日期不可早於開始日期。';
            }
            if (!this.errors.date && this.isLockedDateRange(this.formData.start_date, this.formData.end_date)) {
                this.errors.date = '今天以前的日期不可新增或修改暫停營業。';
            }
            if (!this.formData.is_all_day) {
                if (!this.formData.start_time || !this.formData.end_time) {
                    this.errors.time = '請設定開始時間與結束時間。';
                } else if (this.formData.end_time <= this.formData.start_time) {
                    this.errors.time = '結束時間不可早於或等於開始時間。';
                }
            }
            return Object.keys(this.errors).length === 0;
        },

        buildPayload() {
            return {
                course_id: this.formData.course_id,
                start_date: this.formData.start_date,
                end_date: this.formData.end_date,
                is_all_day: !!this.formData.is_all_day,
                start_time: this.formData.is_all_day ? '' : this.formData.start_time,
                end_time: this.formData.is_all_day ? '' : this.formData.end_time,
                reason: (this.formData.reason || '').trim() || '暫停營業',
                status: this.formData.status || 'active'
            };
        },

        async submitForm() {
            if (!this.validateForm()) return;

            const baseUrl = window.BASE_URL || '';
            this.isSubmitting = true;

            try {
                const payload = this.buildPayload();
                const response = this.isEdit
                    ? await axios.put(`${baseUrl}/cms/course_blackout_manage/window/${this.formData.id}`, payload)
                    : await axios.post(`${baseUrl}/cms/course_blackout_manage/window`, payload);

                if (response.data.success) {
                    BToast.success(response.data.message || '已儲存。');
                    this.closeForm();
                    this.loadCalendar();
                    this.reloadTable();
                } else {
                    await BDialog.alert({ variant: 'danger', title: '儲存失敗。', desc: response.data.message || '' });
                }
            } catch (error) {
                await BDialog.alert({ variant: 'danger', title: '儲存失敗。', desc: error.response?.data?.message || '' });
            } finally {
                this.isSubmitting = false;
            }
        },

        async deleteWindow(windowId, reason) {
            const row = window.blackoutTable
                ? window.blackoutTable.rows().data().toArray().find(item => String(item.id) === String(windowId))
                : null;
            if (row && this.isLockedDateRange(row.start_date, row.end_date)) {
                await BDialog.alert({ variant: 'warn', title: '今天以前的暫停營業不可刪除。' });
                return;
            }
            if (!(await BDialog.confirm({ title: `確定刪除「${reason || '暫停營業'}」？`, variant: 'danger', confirmText: '刪除' }))) return;

            const baseUrl = window.BASE_URL || '';
            try {
                const response = await axios.delete(`${baseUrl}/cms/course_blackout_manage/window/${windowId}`);
                if (response.data.success) {
                    BToast.success(response.data.message || '已刪除。');
                    this.loadCalendar();
                    this.reloadTable();
                } else {
                    await BDialog.alert({ variant: 'danger', title: '刪除失敗。', desc: response.data.message || '' });
                }
            } catch (error) {
                await BDialog.alert({ variant: 'danger', title: '刪除失敗。', desc: error.response?.data?.message || '' });
            }
        }
    },
    mounted() {
        this.initCourseScope();
        if (!this.isScopedManager) {
            this.initDataTable();
        }
        this.loadCalendar();
    },
    beforeUnmount() {
        window.clearTimeout(this._searchTimer);
    }
};
