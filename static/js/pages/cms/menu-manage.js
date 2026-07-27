/**
 * 選單管理頁面 JS
 * 對應 templates/cms/menu_manage.html
 */

/**
 * 樹狀節點組件定義
 * SPA 化:模板改為字串(原本放模板 extra_js 的 <template id="menu-tree-node-template">,
 * 但殼層 Vue 編譯 #app 時會剝掉 <template> 元素,SPA 抽換 main 也帶不進來 → 移進 JS)
 */
const MenuTreeNode = {
    name: 'MenuTreeNode',
    props: ['node'],
    emits: ['edit', 'add-child', 'delete'],
    delimiters: ['[[', ']]'],
    template: `
    <div class="tree-node">
        <div class="tree-item">
            <span v-if="node.children && node.children.length > 0"
                  @click="expanded = !expanded"
                  class="tree-toggle">
                <i :class="expanded ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right'" style="font-size: 0.7rem;"></i>
            </span>
            <span v-else class="tree-toggle">
                <i class="fa-solid fa-minus" style="font-size: 0.6rem; color: var(--fg-disabled);"></i>
            </span>

            <i :class="node.levels === 1 ? 'fa-solid fa-folder tree-icon' : 'fa-solid fa-file tree-icon'"></i>
            <span class="tree-name">[[ node.title ]]</span>
            <span class="tree-meta">
                <span v-if="node.url" style="margin-right: 6px;">([[ node.url ]])</span>
                第[[ node.levels ]]級
            </span>

            <div v-if="node.code !== 'OUT'" class="tree-actions">
                <button @click="$emit('edit', node.id)" class="action-btn edit">
                    <i class="fa-solid fa-pen"></i> 編輯
                </button>
                <button v-if="node.levels < 2"
                        @click="$emit('add-child', node.id, 2)"
                        class="action-btn add">
                    <i class="fa-solid fa-plus"></i> 新增子選單
                </button>
                <button @click="$emit('delete', node.id, node.title)" class="action-btn delete">
                    <i class="fa-solid fa-trash"></i> 刪除
                </button>
            </div>
            <span v-else class="tree-meta"><i class="fa-solid fa-lock"></i> 系統選單</span>
        </div>
        <div v-if="expanded && node.children && node.children.length > 0" class="tree-children">
            <menu-tree-node v-for="child in node.children"
                       :key="child.id"
                       :node="child"
                       @edit="$emit('edit', $event)"
                       @add-child="(id, level) => $emit('add-child', id, level)"
                       @delete="(id, name) => $emit('delete', id, name)">
            </menu-tree-node>
        </div>
    </div>`,
    data() {
        return {
            expanded: true
        };
    }
};

/**
 * 選單管理 Vue 頁面配置
 * 已合併 baseApp，HTML 只需 2 行初始化
 */
const MenuManagePageApp = {
    ...baseApp,
    components: {
        'menu-tree-node': MenuTreeNode
    },
    data() {
        return {
            ...baseApp.data(),
            showForm: false,
            showCloseConfirm: false,
            isEdit: false,
            isSubmitting: false,
            menuTree: [],
            parentOptions: [],
            formData: {
                id: '',
                title: '',
                url: '',
                code: '',
                sort: 255,
                levels: '',
                parent_id: ''
            },
            errors: {}
        };
    },
    computed: {
        ...baseApp.computed,
        /* 必填未填 → 送出鈕 disable:層級 / 上級選單(層級=2 時)/ 選單名稱 */
        formIncomplete() {
            const f = this.formData;
            if (!f.levels) return true;
            if (f.levels === 2 && !f.parent_id) return true;
            if (!f.title || !String(f.title).trim()) return true;
            return false;
        }
    },
    methods: {
        ...baseApp.methods,
        async loadMenuTree() {
            const BASE_URL = typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : '';

            try {
                const response = await axios.get(`${BASE_URL}/cms/menu_manage/menulist`);
                if (response.data.success) {
                    this.menuTree = response.data.data || [];
                }
            } catch (error) {
                console.error('載入選單列表失敗:', error);
            }
        },

        async loadParentOptions() {
            const BASE_URL = typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : '';

            try {
                const response = await axios.get(`${BASE_URL}/cms/menu_manage/getparentoptions`);
                if (response.data.success) {
                    this.parentOptions = response.data.data || [];
                }
            } catch (error) {
                console.error('載入上級選項失敗:', error);
                this.parentOptions = [];
            }
        },

        /* 確保 modal 內原生 <select> 被 BDropdown 增強成 .b-dd(→ 開啟時有 bddIn 展開動畫;
           未增強會被 dropdown.css `.main-content select:not([data-bdd]){visibility:hidden}` 藏住,
           尤其「上級選單」是 v-if 動態新增的 select,更需要在它出現後重新增強)。
           SPA 雙層 app $refs 取不到 → 用 document.querySelector 定位當前頁 modal;init 靠 [data-bdd] 防重。 */
        enhanceModalDropdowns() {
            const modal = document.querySelector('.b-modal-overlay[data-modal-vue]');
            if (!modal || !window.BDropdown) return;
            window.BDropdown.init(modal);   // 增強新出現的 select(如 v-if 的「上級選單」)
            // 已增強的 select 值被程式改動不會發 change → syncAll 重讀選單+標籤
            if (window.BDropdown.syncAll) window.BDropdown.syncAll(modal);
        },

        openAddForm(parentId, level) {
            this.isEdit = false;
            this.resetForm();
            this.formData.levels = level || 1;
            this.formData.parent_id = parentId || '';
            if (level === 2) {
                this.loadParentOptions();
            }
            this.showForm = true;
            this.$nextTick(() => { this.enhanceModalDropdowns(); this.snapshotForm(); });
        },

        openAddChildForm(parentId, level) {
            this.openAddForm(parentId, level);
        },

        async openEditForm(menuId) {
            this.isEdit = true;
            this.resetForm();

            const BASE_URL = typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : '';

            try {
                const response = await axios.post(`${BASE_URL}/cms/menu_manage/menu/${menuId}`);
                if (response.data.success) {
                    const data = response.data.data;
                    this.formData = {
                        id: data.menu.id,
                        title: data.menu.title,
                        url: data.menu.url || '',
                        code: data.menu.code || '',
                        sort: data.menu.sort,
                        levels: data.menu.levels,
                        parent_id: data.menu.parent_id
                    };
                    this.parentOptions = data.parent_options || [];
                } else {
                    await BDialog.alert({ variant: 'danger', title: '操作失敗', desc: response.data.message });
                    return;
                }
            } catch (error) {
                console.error('載入選單資料失敗:', error);
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
                title: '',
                url: '',
                code: '',
                sort: 255,
                levels: '',
                parent_id: ''
            };
            this.parentOptions = [];
            this.errors = {};
        },

        onLevelChange() {
            this.formData.parent_id = '';
            if (this.formData.levels === 2) {
                this.loadParentOptions();
            } else {
                this.parentOptions = [];
            }
            // 層級改變會 v-if 顯示/隱藏「上級選單」select → 出現後要重新增強才可見 + 有展開動畫
            this.$nextTick(() => this.enhanceModalDropdowns());
        },

        validateForm() {
            this.errors = {};

            if (!this.formData.levels) {
                this.errors.levels = '請選擇層級';
            }

            if (!this.formData.title || !this.formData.title.trim()) {
                this.errors.title = '請輸入選單名稱';
            }

            if (this.formData.levels === 2 && !this.formData.parent_id) {
                this.errors.parent_id = '請選擇上級選單';
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
                    response = await axios.put(`${BASE_URL}/cms/menu_manage/menu/${this.formData.id}`, this.formData);
                } else {
                    response = await axios.post(`${BASE_URL}/cms/menu_manage/addmenu`, this.formData);
                }

                if (response.data.success) {
                    BToast.success(this.isEdit ? '更新成功' : '新增成功');
                    this.closeForm();
                    this.loadMenuTree();
                } else {
                    await BDialog.alert({ variant: 'danger', title: '操作失敗', desc: response.data.message });
                }
            } catch (error) {
                console.error('操作失敗:', error);
                await BDialog.alert({ variant: 'danger', title: '操作失敗，請稍後再試' });
            } finally {
                this.isSubmitting = false;
            }
        },

        async deleteMenu(menuId, menuTitle) {
            if (!(await BDialog.confirm({ title: `確定要刪除「${menuTitle}」嗎？`, variant: 'danger', confirmText: '刪除' }))) {
                return;
            }

            const BASE_URL = typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : '';

            try {
                const response = await axios.put(`${BASE_URL}/cms/menu_manage/deletemenu/${menuId}`);
                if (response.data.success) {
                    BToast.success('刪除成功');
                    this.loadMenuTree();
                } else {
                    await BDialog.alert({ variant: 'danger', title: '操作失敗', desc: response.data.message });
                }
            } catch (error) {
                console.error('刪除失敗:', error);
                await BDialog.alert({ variant: 'danger', title: '刪除失敗，請稍後再試' });
            }
        }
    },
    created() {
        if (baseApp.created) {
            baseApp.created.call(this);
        }
    },
    mounted() {
        this.loadMenuTree();
    }
};

// 匯出供使用
window.MenuTreeNode = MenuTreeNode;
window.MenuManagePageApp = MenuManagePageApp;
