/**
 * 使用者維護頁面 JS
 * 對應 templates/cms/user_manage.html
 */

/**
 * 使用者維護 Vue 頁面配置
 * 已合併 baseApp，HTML 只需 2 行初始化
 *
 * 需要在 HTML 中設定 data-current-user-id="{{ session.get('cms_user_id', '') }}"
 */
const UserManagePageApp = {
    ...baseApp,
    data() {
        return {
            ...baseApp.data(),
            tableSearch: '',
            showForm: false,
            showCloseConfirm: false,
            isEdit: false,
            isSubmitting: false,
            showPassword: false,
            showStoreField: true,  // 顯示機關欄位（建立帳號時選擇 store / 球場）
            currentUserId: '',      // 當前登入使用者 ID
            stores: [],
            groups: [],
            courses: [],
            formData: {
                id: '',
                store_id: '',
                email: '',
                name: '',
                pswd: '',
                group_id: '',
                course_ids: [],
                disable: '0'
            },
            errors: {}
        };
    },
    computed: {
        ...baseApp.computed,
        /* 必填未填 → 送出鈕 disable(對齊 wizard 必填守門):機關(顯示時)/Email/姓名/密碼(新增時)/權限群組 */
        formIncomplete() {
            const f = this.formData;
            if (this.showStoreField && !f.store_id) return true;
            if (!f.email || !String(f.email).trim()) return true;
            if (!f.name || !String(f.name).trim()) return true;
            if (!this.isEdit && !f.pswd) return true;
            if (!f.group_id) return true;
            return false;
        }
    },
    methods: {
        ...baseApp.methods,

        /* 搜尋框對齊球場管理/預約管理/會員管理:驅動 DataTables server-side search[value],300ms 去抖 */
        onTableSearch() {
            window.clearTimeout(this._searchTimer);
            this._searchTimer = window.setTimeout(() => {
                if (window.userTable) window.userTable.search(this.tableSearch).draw();
            }, 300);
        },

        clearTableSearch() {
            this.tableSearch = '';
            window.clearTimeout(this._searchTimer);
            if (window.userTable) window.userTable.search('').draw();
        },

        /* 確保 modal 內原生 <select> 被 BDropdown 增強成 .b-dd(→ 開啟時有 bddIn 展開動畫;
           未增強會被 dropdown.css `.main-content select:not([data-bdd]){visibility:hidden}` 藏住)。
           SPA 雙層 app $refs 取不到 → 用 document.querySelector 定位當前頁 modal。init 對已增強者靠 [data-bdd] 防重。 */
        enhanceModalDropdowns() {
            const modal = document.querySelector('.b-modal-overlay[data-modal-vue]');
            if (!modal || !window.BDropdown) return;
            window.BDropdown.init(modal);
            if (window.BDropdown.syncAll) window.BDropdown.syncAll(modal);
        },

        initDataTable() {
            const self = this;
            const BASE_URL = typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : '';
            const currentUserId = this.currentUserId;

            if ($.fn.DataTable.isDataTable('#userTable')) {
                return;
            }

            // 根據 showStoreField 動態設定欄位
            const columns = [];
            if (this.showStoreField) {
                columns.push({ data: 'storename', title: '機關' });
            }
            columns.push(
                { data: 'username', title: '姓名' },
                { data: 'email', title: 'Email' },
                { data: 'groupname', title: '權限群組' },
                { data: 'course_scope', title: '管理球場' },
                {
                    data: 'status',
                    title: '狀態',
                    className: 'col-center',
                    render: function(data) {
                        // 共用 .b-badge(token 色票、深淺色自動):啟用=ok、停用=neutral(灰,非錯誤態)
                        const isActive = data === '啟用';
                        return `<span class="b-badge ${isActive ? 'ok' : 'neutral'}">${data}</span>`;
                    }
                },
                {
                    data: null,
                    title: '操作',
                    orderable: false,
                    render: function(data, type, row) {
                        const protectedEmails = ['admin', 'admin@admin.com'];
                        const protectedNames = ['admin', 'Admin', 'ADMIN', '系統管理員'];
                        const isProtected = protectedEmails.includes(row.email?.toLowerCase()) || protectedNames.includes(row.username);
                        const isSelf = row.id?.toLowerCase() === currentUserId;
                        const isDisabled = row.status === '停用';
                        let html = `<button onclick="window.vueApp.openEditForm('${row.id}')"
                                        class="action-btn edit">
                            <i class="fa-solid fa-pen"></i> 編輯
                        </button>`;
                        if (!isProtected && !isSelf) {
                            if (isDisabled) {
                                html += `<button onclick="window.vueApp.toggleUserStatus('${row.id}', '${row.username}', true)"
                                                class="action-btn enable">
                                    <i class="fa-solid fa-circle-check"></i> 啟用
                                </button>`;
                            } else {
                                html += `<button onclick="window.vueApp.toggleUserStatus('${row.id}', '${row.username}', false)"
                                                class="action-btn disable">
                                    <i class="fa-solid fa-ban"></i> 停用
                                </button>`;
                            }
                        }
                        return html;
                    }
                }
            );

            window.userTable = $('#userTable').DataTable({
                processing: true,
                serverSide: true,
                ajax: {
                    url: `${BASE_URL}/cms/user_manage/userlist`,
                    type: 'GET'
                },
                columns: columns,
                /* 去 DataTables chrome:只留 table(r) + tbody(t),對齊球場管理/預約管理/會員管理。
                   ⚠️ serverSide 不可 paging:false(送 length=-1 後端 FETCH NEXT 會炸);
                   ⚠️ 使用者筆數可能很多 → 目前單頁上限 200,超過看不到後面;
                      若真的超過需再加回分頁或虛擬捲動。 */
                dom: 'rt',
                pageLength: 200,
                language: {
                    processing: '處理中...',
                    zeroRecords: '沒有符合的資料',
                    info: '顯示第 _START_ 至 _END_ 筆，共 _TOTAL_ 筆',
                    infoEmpty: '沒有資料',
                    infoFiltered: '(從 _MAX_ 筆資料中篩選)',
                    search: '搜尋：',
                    paginate: {
                        first: '首頁',
                        previous: '上一頁',
                        next: '下一頁',
                        last: '末頁'
                    }
                },
                order: [[0, 'asc']]
            });
        },

        async openAddForm() {
            this.isEdit = false;
            this.resetForm();

            const BASE_URL = typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : '';

            try {
                const response = await axios.post(`${BASE_URL}/cms/user_manage/store`);
                if (response.data.success) {
                    this.stores = response.data.data.stores;
                    this.groups = response.data.data.groups;
                    this.courses = response.data.data.courses || [];
                    // 預設選擇第一筆機關
                    if (this.stores.length > 0) {
                        this.formData.store_id = this.stores[0].id;
                    }
                }
            } catch (error) {
                console.error('載入選項失敗:', error);
                await BDialog.alert({ variant: 'danger', title: '載入資料失敗' });
                return;
            }

            this.showForm = true;
            this.$nextTick(() => { this.enhanceModalDropdowns(); this.snapshotForm(); });
        },

        async openEditForm(userId) {
            this.isEdit = true;
            this.resetForm();

            const BASE_URL = typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : '';

            try {
                const response = await axios.post(`${BASE_URL}/cms/user_manage/user/${userId}`);
                if (response.data.success) {
                    const data = response.data.data;
                    this.stores = data.stores;
                    this.groups = data.groups;
                    this.courses = data.courses || [];
                    this.formData = {
                        id: data.user.id,
                        store_id: data.user.store_id,
                        email: data.user.email,
                        name: data.user.name,
                        pswd: '',
                        group_id: data.user.group_id,
                        course_ids: data.user.course_ids || [],
                        disable: data.user.disable
                    };
                } else {
                    await BDialog.alert({ variant: 'danger', title: '載入資料失敗', desc: response.data.message || '' });
                    return;
                }
            } catch (error) {
                console.error('載入使用者資料失敗:', error);
                await BDialog.alert({ variant: 'danger', title: '載入資料失敗' });
                return;
            }

            this.showForm = true;
            this.$nextTick(() => { this.enhanceModalDropdowns(); this.snapshotForm(); });
        },

        closeForm() {
            this.showForm = false;
            this.showCloseConfirm = false;
            this._formSnapshot = null;
            this.resetForm();
        },

        /* 關閉確認:有輸入/修改才跳「放棄」警告(對齊球場管理);snapshot 於開啟時存 */
        snapshotForm() {
            this._formSnapshot = JSON.stringify(this.formData);
        },
        isFormDirty() {
            return !!this._formSnapshot && JSON.stringify(this.formData) !== this._formSnapshot;
        },
        requestClose() {
            if (this.isFormDirty()) this.showCloseConfirm = true;
            else this.closeForm();
        },
        confirmClose() {
            this.showCloseConfirm = false;
            this.closeForm();
        },
        cancelClose() {
            this.showCloseConfirm = false;
        },

        resetForm() {
            this.formData = {
                id: '',
                store_id: '',
                email: '',
                name: '',
                pswd: '',
                group_id: '',
                course_ids: [],
                disable: '0'
            };
            this.errors = {};
            this.showPassword = false;
        },

        validateForm() {
            this.errors = {};

            // 機關欄位隱藏時不驗證（已預設第一筆）
            if (this.showStoreField && !this.formData.store_id) {
                this.errors.store_id = '請選擇機關';
            }

            if (!this.formData.email) {
                this.errors.email = '請輸入電子郵件';
            } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.formData.email)) {
                this.errors.email = '請輸入有效的電子郵件格式';
            }

            if (!this.formData.name) {
                this.errors.name = '請輸入姓名';
            }

            // 密碼驗證：新增時必填，編輯時選填
            if (!this.isEdit) {
                if (!this.formData.pswd) {
                    this.errors.pswd = '請輸入密碼';
                } else if (this.formData.pswd.length < 6) {
                    this.errors.pswd = '密碼長度至少6個字元';
                }
            } else {
                if (this.formData.pswd && this.formData.pswd.length < 6) {
                    this.errors.pswd = '密碼長度至少6個字元';
                }
            }

            if (!this.formData.group_id) {
                this.errors.group_id = '請選擇權限群組';
            }

            return Object.keys(this.errors).length === 0;
        },

        async submitForm() {
            if (!this.validateForm()) {
                return;
            }

            this.isSubmitting = true;

            const BASE_URL = typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : '';

            try {
                let response;
                if (this.isEdit) {
                    response = await axios.put(`${BASE_URL}/cms/user_manage/user/${this.formData.id}`, this.formData);
                } else {
                    response = await axios.post(`${BASE_URL}/cms/user_manage/adduser`, this.formData);
                }

                if (response.data.success) {
                    BToast.success(this.isEdit ? '更新成功' : '新增成功');
                    this.closeForm();
                    if (window.userTable) {
                        window.userTable.ajax.reload();
                    }
                } else {
                    await BDialog.alert({ variant: 'danger', title: '操作失敗', desc: response.data.message || '' });
                }
            } catch (error) {
                console.error('操作失敗:', error);
                await BDialog.alert({ variant: 'danger', title: '操作失敗，請稍後再試' });
            } finally {
                this.isSubmitting = false;
            }
        },

        async toggleUserStatus(userId, userName, isCurrentlyDisabled) {
            const action = isCurrentlyDisabled ? '啟用' : '停用';
            if (!(await BDialog.confirm({ title: `確定要${action}使用者「${userName}」嗎？`, variant: isCurrentlyDisabled ? 'warn' : 'danger', confirmText: action }))) {
                return;
            }

            const BASE_URL = typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : '';

            try {
                const response = await axios.put(`${BASE_URL}/cms/user_manage/togglestatus/${userId}`, {
                    disable: isCurrentlyDisabled ? 0 : 1
                });
                if (response.data.success) {
                    BToast.success(`${action}成功`);
                    if (window.userTable) {
                        window.userTable.ajax.reload();
                    }
                } else {
                    await BDialog.alert({ variant: 'danger', title: `${action}失敗`, desc: response.data.message || '' });
                }
            } catch (error) {
                console.error(`${action}失敗:`, error);
                await BDialog.alert({ variant: 'danger', title: `${action}失敗，請稍後再試` });
            }
        }
    },
    created() {
        if (baseApp.created) {
            baseApp.created.call(this);
        }
    },
    mounted() {
        // 從 data attribute 取得當前使用者 ID
        const appEl = document.getElementById('app');
        if (appEl && appEl.dataset.currentUserId) {
            this.currentUserId = appEl.dataset.currentUserId.toLowerCase();
        }

        this.$nextTick(() => {
            this.initDataTable();
        });
    },
    beforeUnmount() {
        window.clearTimeout(this._searchTimer);
    }
};

// 匯出供使用
window.UserManagePageApp = UserManagePageApp;
