/**
 * 權限群組管理頁面 JS
 * 對應 templates/cms/groups_manage.html
 */

/**
 * 權限群組管理 Vue 頁面配置
 * 已合併 baseApp，HTML 只需 2 行初始化
 */
const GroupsManagePageApp = {
    ...baseApp,
    data() {
        return {
            ...baseApp.data(),
            tableSearch: '',
            showForm: false,
            showCloseConfirm: false,
            isEdit: false,
            isSubmitting: false,
            allroles: [],
            formData: {
                id: '',
                name: '',
                sort: 0
            },
            errors: {}
        };
    },
    computed: {
        ...baseApp.computed,
        /* 必填未填 → 送出鈕 disable:群組名稱 */
        formIncomplete() {
            return !this.formData.name || !String(this.formData.name).trim();
        }
    },
    methods: {
        ...baseApp.methods,

        /* 搜尋框對齊球場管理/預約管理/會員管理:驅動 DataTables server-side search[value],300ms 去抖 */
        onTableSearch() {
            window.clearTimeout(this._searchTimer);
            this._searchTimer = window.setTimeout(() => {
                if (window.groupTable) window.groupTable.search(this.tableSearch).draw();
            }, 300);
        },

        clearTableSearch() {
            this.tableSearch = '';
            window.clearTimeout(this._searchTimer);
            if (window.groupTable) window.groupTable.search('').draw();
        },

        initDataTable() {
            if ($.fn.DataTable.isDataTable('#groupTable')) {
                return;
            }

            const BASE_URL = typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : '';

            window.groupTable = $('#groupTable').DataTable({
                processing: true,
                serverSide: true,
                ajax: {
                    url: `${BASE_URL}/cms/groups_manage/grouplist`,
                    type: 'GET'
                },
                columns: [
                    { data: 'name', title: '群組名稱' },
                    { data: 'sort', title: '排序' },
                    {
                        data: null,
                        title: '操作',
                        orderable: false,
                        render: function(data, type, row) {
                            const protectedNames = ['系統管理群組', '系統管理', '系統管理者', 'admin', 'Admin', 'ADMIN'];
                            const isProtected = protectedNames.includes(row.name);
                            if (isProtected) {
                                return `<span class="text-muted"><i class="fa-solid fa-lock"></i> 系統群組</span>`;
                            }
                            let html = `<button onclick="window.vueApp.openEditForm('${row.id}')"
                                            class="action-btn edit">
                                <i class="fa-solid fa-pen"></i> 編輯
                            </button>`;
                            html += `<button onclick="window.vueApp.deleteGroup('${row.id}', '${row.name}')"
                                            class="action-btn delete">
                                <i class="fa-solid fa-trash"></i> 刪除
                            </button>`;
                            return html;
                        }
                    }
                ],
                /* 去 DataTables chrome:只留 table(r) + tbody(t),對齊球場管理/預約管理/會員管理。
                   ⚠️ serverSide 不可 paging:false(送 length=-1 後端 FETCH NEXT 會炸);
                   ⚠️ 群組筆數可能很多 → 目前單頁上限 200,超過看不到後面;
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
                order: [[1, 'asc']]
            });
        },

        async openAddForm() {
            this.isEdit = false;
            this.resetForm();

            const BASE_URL = typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : '';

            try {
                const response = await axios.post(`${BASE_URL}/cms/groups_manage/groups`);
                if (response.data.success) {
                    this.allroles = response.data.data.allroles || [];
                    // 初始化選取狀態
                    this.allroles.forEach(menu => {
                        menu.allSelected = false;
                        menu.selected = false;
                        if (menu.sub) {
                            menu.sub.forEach(sub => sub.selected = false);
                        }
                    });
                }
            } catch (error) {
                console.error('載入選項失敗:', error);
                await BDialog.alert({ variant: 'danger', title: '載入資料失敗' });
                return;
            }

            this.showForm = true;
            this.$nextTick(() => this.snapshotForm());
        },

        async openEditForm(groupId) {
            this.isEdit = true;
            this.resetForm();

            const BASE_URL = typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : '';

            try {
                const response = await axios.post(`${BASE_URL}/cms/groups_manage/group/${groupId}`);
                if (response.data.success) {
                    const data = response.data.data;
                    this.formData = {
                        id: data.group.id,
                        name: data.group.name,
                        sort: data.group.sort
                    };
                    this.allroles = data.allroles || [];

                    // 根據 myroles 設定選取狀態
                    const myRoleIds = (data.myroles || []).map(r => r.menu_id);
                    this.allroles.forEach(menu => {
                        if (menu.sub && menu.sub.length > 0) {
                            menu.sub.forEach(sub => {
                                sub.selected = myRoleIds.includes(sub.id);
                            });
                            // 更新父層狀態
                            this.updateParentState(menu);
                        } else {
                            menu.selected = myRoleIds.includes(menu.id);
                            menu.allSelected = menu.selected;
                        }
                    });
                } else {
                    await BDialog.alert({ variant: 'danger', title: '載入資料失敗', desc: response.data.message || '' });
                    return;
                }
            } catch (error) {
                console.error('載入群組資料失敗:', error);
                await BDialog.alert({ variant: 'danger', title: '載入資料失敗' });
                return;
            }

            this.showForm = true;
            this.$nextTick(() => this.snapshotForm());
        },

        closeForm() {
            this.showForm = false;
            this.showCloseConfirm = false;
            this._formSnapshot = null;
            this.resetForm();
        },

        /* 關閉確認:有輸入/改動(含權限勾選)才跳「放棄」警告;snapshot 於開啟時存(含 getSelectedRoles) */
        snapshotForm() {
            this._formSnapshot = JSON.stringify({ f: this.formData, r: this.getSelectedRoles() });
        },
        isFormDirty() {
            return !!this._formSnapshot &&
                JSON.stringify({ f: this.formData, r: this.getSelectedRoles() }) !== this._formSnapshot;
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
                name: '',
                sort: 0
            };
            this.allroles = [];
            this.errors = {};
        },

        toggleAll(menu) {
            if (menu.sub && menu.sub.length > 0) {
                menu.sub.forEach(sub => {
                    sub.selected = menu.allSelected;
                });
            } else {
                menu.selected = menu.allSelected;
            }
        },

        updateParentState(menu) {
            if (menu.sub && menu.sub.length > 0) {
                const allSelected = menu.sub.every(sub => sub.selected);
                menu.allSelected = allSelected;
            }
        },

        getSelectedRoles() {
            const roles = [];
            this.allroles.forEach(menu => {
                if (menu.sub && menu.sub.length > 0) {
                    menu.sub.forEach(sub => {
                        if (sub.selected) {
                            roles.push(sub.id);
                        }
                    });
                } else if (menu.selected || menu.allSelected) {
                    roles.push(menu.id);
                }
            });
            return roles;
        },

        validateForm() {
            this.errors = {};

            if (!this.formData.name || !this.formData.name.trim()) {
                this.errors.name = '請輸入群組名稱';
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
                const payload = {
                    name: this.formData.name,
                    sort: this.formData.sort,
                    roles: this.getSelectedRoles()
                };

                let response;
                if (this.isEdit) {
                    response = await axios.put(`${BASE_URL}/cms/groups_manage/group/${this.formData.id}`, payload);
                } else {
                    response = await axios.post(`${BASE_URL}/cms/groups_manage/addgroup`, payload);
                }

                if (response.data.success) {
                    BToast.success(this.isEdit ? '更新成功' : '新增成功');
                    this.closeForm();
                    if (window.groupTable) {
                        window.groupTable.ajax.reload();
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

        async deleteGroup(groupId, groupName) {
            if (!(await BDialog.confirm({ title: `確定要刪除群組「${groupName}」嗎？`, variant: 'danger', confirmText: '刪除' }))) {
                return;
            }

            const BASE_URL = typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : '';

            try {
                const response = await axios.put(`${BASE_URL}/cms/groups_manage/deletegroup/${groupId}`);
                if (response.data.success) {
                    BToast.success('刪除成功');
                    if (window.groupTable) {
                        window.groupTable.ajax.reload();
                    }
                } else {
                    await BDialog.alert({ variant: 'danger', title: '刪除失敗', desc: response.data.message || '' });
                }
            } catch (error) {
                console.error('刪除失敗:', error);
                await BDialog.alert({ variant: 'danger', title: '刪除失敗，請稍後再試' });
            }
        }
    },
    created() {
        // 調用 baseApp 的 created（載入選單）
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

// 匯出供使用
window.GroupsManagePageApp = GroupsManagePageApp;
