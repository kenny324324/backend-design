const MemberManagePageApp = {
    ...baseApp,
    data() {
        return {
            ...baseApp.data(),
            tableSearch: ''
        };
    },
    computed: {
        ...baseApp.computed
    },
    methods: {
        ...baseApp.methods,

        renderMemberStatus(status) {
            // 共用 .b-badge(token 色票、深淺色自動)
            const labelMap = {
                active: '啟用',
                pending_verification: '待驗證',
                suspended: '停用'
            };
            const classMap = {
                active: 'ok',
                pending_verification: 'warn',
                suspended: 'bad'
            };
            const label = labelMap[status] || status || '-';
            return `<span class="b-badge ${classMap[status] || 'neutral'}">${label}</span>`;
        },

        renderDisableStatus(disable) {
            const disabled = Number(disable || 0) === 1;
            return `<span class="status-tag ${disabled ? 'status-inactive' : 'status-active'}">${disabled ? '已停用' : '正常'}</span>`;
        },

        formatDate(value) {
            if (!value) return '-';
            return String(value).replace('T', ' ').slice(0, 19);
        },

        /* 搜尋框對齊球場管理/預約管理:驅動 DataTables server-side search[value],300ms 去抖 */
        onTableSearch() {
            window.clearTimeout(this._searchTimer);
            this._searchTimer = window.setTimeout(() => {
                if (window.memberTable) window.memberTable.search(this.tableSearch).draw();
            }, 300);
        },

        clearTableSearch() {
            this.tableSearch = '';
            window.clearTimeout(this._searchTimer);
            if (window.memberTable) window.memberTable.search('').draw();
        },

        initDataTable() {
            const baseUrl = window.BASE_URL || '';
            if ($.fn.DataTable.isDataTable('#memberTable')) return;

            window.memberTable = $('#memberTable').DataTable({
                processing: true,
                serverSide: true,
                ajax: {
                    url: `${baseUrl}/cms/member_manage/list`,
                    type: 'GET'
                },
                columns: [
                    {
                        data: 'created_at',
                        title: '註冊時間',
                        width: '160px',
                        render: data => this.formatDate(data)
                    },
                    { data: 'name', title: '姓名' },
                    { data: 'email', title: 'Email' },
                    { data: 'phone', title: '手機', width: '130px' },
                    { data: 'company_tax_id', title: '公司統編', width: '110px' },
                    {
                        data: 'status',
                        title: '會員狀態',
                        width: '110px',
                        render: data => this.renderMemberStatus(data)
                    },
                    {
                        data: 'disable',
                        title: '帳號狀態',
                        width: '100px',
                        render: data => this.renderDisableStatus(data)
                    },
                    {
                        data: 'booking_count',
                        title: '預約數',
                        width: '90px',
                        className: 'col-center',
                        render: data => Number(data || 0).toLocaleString()
                    },
                    {
                        data: 'updated_at',
                        title: '最後更新',
                        width: '160px',
                        render: data => this.formatDate(data)
                    }
                ],
                order: [[0, 'desc']],
                /* 去 DataTables chrome:只留 table(r) + tbody(t),對齊球場管理/預約管理。
                   ⚠️ serverSide 不可 paging:false(送 length=-1 後端 FETCH NEXT 會炸);
                   ⚠️ 會員筆數可能很多 → 目前單頁上限 200,超過看不到後面;
                      若真的超過需再加回分頁或虛擬捲動。 */
                dom: 'rt',
                pageLength: 200,
                language: {
                    processing: '載入中...',
                    zeroRecords: '沒有符合條件的會員',
                    info: '顯示第 _START_ 到 _END_ 筆，共 _TOTAL_ 筆',
                    infoEmpty: '沒有會員資料',
                    infoFiltered: '(從 _MAX_ 筆資料篩選)',
                    search: '搜尋：',
                    paginate: {
                        first: '第一頁',
                        previous: '上一頁',
                        next: '下一頁',
                        last: '最後頁'
                    }
                }
            });
        }
    },
    created() {
        if (baseApp.created) {
            baseApp.created.call(this);
        }
    },
    mounted() {
        this.$nextTick(() => {
            this.initDataTable();
        });
    },
    beforeUnmount() {
        window.clearTimeout(this._searchTimer);
    }
};

window.MemberManagePageApp = MemberManagePageApp;
