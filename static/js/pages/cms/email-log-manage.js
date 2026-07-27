const EmailLogManagePageApp = {
    ...baseApp,
    data() {
        return {
            ...baseApp.data(),
            tableSearch: '',
            filters: {
                status: '',
                notification_type: '',
                start_date: '',
                end_date: ''
            },
            stats: {
                total_count: 0,
                success_count: 0,
                failed_count: 0
            }
        };
    },
    methods: {
        ...baseApp.methods,

        /* 搜尋框對齊球場管理/預約管理/會員管理:驅動 DataTables server-side search[value],300ms 去抖 */
        onTableSearch() {
            window.clearTimeout(this._searchTimer);
            this._searchTimer = window.setTimeout(() => {
                if (window.emailLogTable) window.emailLogTable.search(this.tableSearch).draw();
            }, 300);
        },

        clearTableSearch() {
            this.tableSearch = '';
            window.clearTimeout(this._searchTimer);
            if (window.emailLogTable) window.emailLogTable.search('').draw();
        },

        escapeHtml(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        },

        getStatusBadge(status) {
            // 共用 .b-badge(token 色票、深淺色自動)
            const labels = { success: '成功', failed: '失敗' };
            const classMap = { success: 'ok', failed: 'bad' };
            return `<span class="b-badge ${classMap[status] || 'neutral'}">${labels[status] || status || '-'}</span>`;
        },

        getTypeLabel(type) {
            return {
                member_registered: '會員註冊完成',
                booking_pending: '預約待確認',
                booking_cancelled: '預約取消',
                booking_reminder: '明日提醒',
                booking_notification: '預約通知',
                general: '一般通知'
            }[type] || type || '-';
        },

        initFiltersFromQuery() {
            const params = new URLSearchParams(window.location.search);
            this.filters.status = params.get('status') || '';
            this.filters.notification_type = params.get('notification_type') || '';
            this.filters.start_date = params.get('start_date') || '';
            this.filters.end_date = params.get('end_date') || '';
        },

        syncQueryString() {
            if (this.$ && this.$.isUnmounted) return;   // SPA 換頁後遲到的 async 回呼不得改寫新頁網址
            const params = new URLSearchParams();
            Object.entries(this.filters).forEach(([key, value]) => {
                if (value) params.set(key, value);
            });
            const queryString = params.toString();
            window.history.replaceState({}, '', queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname);
        },

        initDataTable() {
            const baseUrl = window.BASE_URL || '';
            const self = this;

            if ($.fn.DataTable.isDataTable('#emailLogTable')) return;

            window.emailLogTable = $('#emailLogTable').DataTable({
                processing: true,
                serverSide: true,
                ajax: {
                    url: `${baseUrl}/cms/email_log_manage/list`,
                    type: 'GET',
                    data(data) {
                        data.status = self.filters.status;
                        data.notification_type = self.filters.notification_type;
                        data.start_date = self.filters.start_date;
                        data.end_date = self.filters.end_date;
                    }
                },
                columns: [
                    { data: 'sent_at', title: '寄送時間', width: '160px' },
                    {
                        data: 'status',
                        title: '狀態',
                        width: '90px',
                        className: 'col-center',
                        render: data => self.getStatusBadge(data)
                    },
                    {
                        data: 'notification_type',
                        title: '通知類型',
                        width: '130px',
                        render: data => self.escapeHtml(self.getTypeLabel(data))
                    },
                    {
                        data: 'recipient_email',
                        title: '收件人',
                        render: data => self.escapeHtml(data || '-')
                    },
                    {
                        data: 'subject',
                        title: '主旨',
                        render: data => self.escapeHtml(data || '-')
                    },
                    {
                        data: 'booking_no',
                        title: '預約編號',
                        width: '140px',
                        render: data => self.escapeHtml(data || '-')
                    },
                    {
                        data: 'error_message',
                        title: '錯誤訊息',
                        orderable: false,
                        render: data => data ? `<div class="email-error-text">${self.escapeHtml(data)}</div>` : '<span style="color:var(--fg-disabled);">-</span>'
                    }
                ],
                order: [[0, 'desc']],
                /* 去 DataTables chrome:只留 table(r) + tbody(t),對齊球場管理/預約管理/會員管理。
                   ⚠️ serverSide 不可 paging:false(送 length=-1 後端 FETCH NEXT 會炸);
                   ⚠️ 紀錄可能很多 → 目前單頁上限 200,超過看不到後面;
                      若真的超過需再加回分頁或虛擬捲動。 */
                dom: 'rt',
                pageLength: 200,
                language: {
                    processing: '讀取中...',
                    zeroRecords: '沒有符合條件的寄送紀錄',
                    info: '顯示第 _START_ 到 _END_ 筆，共 _TOTAL_ 筆',
                    infoEmpty: '目前沒有寄送紀錄',
                    infoFiltered: '(從 _MAX_ 筆資料篩選)',
                    search: '搜尋：',
                    paginate: { first: '第一頁', previous: '上一頁', next: '下一頁', last: '最後一頁' }
                }
            });
        },

        async loadStats() {
            const baseUrl = window.BASE_URL || '';
            const params = new URLSearchParams(this.filters);
            try {
                const response = await axios.get(`${baseUrl}/cms/email_log_manage/stats?${params.toString()}`);
                if (response.data.success) this.stats = response.data.data;
            } catch (error) {
                console.error('讀取 Email 統計失敗：', error);
            }
        },

        reloadAll() {
            this.syncQueryString();
            this.loadStats();
            if (window.emailLogTable) window.emailLogTable.ajax.reload(null, false);
        },

        resetFilters() {
            this.filters = {
                status: '',
                notification_type: '',
                start_date: '',
                end_date: ''
            };
            this.reloadAll();
        }
    },
    mounted() {
        this.initFiltersFromQuery();
        this.initDataTable();
        this.reloadAll();
    },
    beforeUnmount() {
        window.clearTimeout(this._searchTimer);
    }
};
