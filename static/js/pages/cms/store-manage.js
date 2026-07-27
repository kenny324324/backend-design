/**
 * 機關管理頁面 JS
 * 對應 templates/cms/store_manage.html
 */

/**
 * 樹狀節點組件定義
 * SPA 化:模板改為字串(原本放模板 extra_js 的 <template id="tree-node-template">,
 * 但殼層 Vue 編譯 #app 時會剝掉 <template> 元素,SPA 抽換 main 也帶不進來 → 移進 JS)
 */
const TreeNode = {
    name: 'TreeNode',
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

            <i class="fa-solid fa-building tree-icon"></i>
            <span class="tree-name">[[ node.name ]]</span>
            <span class="tree-level">第[[ node.level ]]級</span>

            <div class="tree-actions">
                <button @click="$emit('edit', node.id)" class="action-btn edit">
                    <i class="fa-solid fa-pen"></i> 編輯
                </button>
                <button v-if="node.level < 3"
                        @click="$emit('add-child', node.id, node.level + 1)"
                        class="action-btn add">
                    <i class="fa-solid fa-plus"></i> 新增子機關
                </button>
                <button @click="$emit('delete', node.id, node.name)" class="action-btn delete">
                    <i class="fa-solid fa-trash"></i> 刪除
                </button>
            </div>
        </div>
        <div v-if="expanded && node.children && node.children.length > 0" class="tree-children">
            <tree-node v-for="child in node.children"
                       :key="child.id"
                       :node="child"
                       @edit="$emit('edit', $event)"
                       @add-child="(id, level) => $emit('add-child', id, level)"
                       @delete="(id, name) => $emit('delete', id, name)">
            </tree-node>
        </div>
    </div>`,
    data() {
        return {
            expanded: true
        };
    }
};

/**
 * 機關管理 Vue 頁面配置
 * 已合併 baseApp，HTML 只需 2 行初始化
 */
const StoreManagePageApp = {
    ...baseApp,
    components: {
        'tree-node': TreeNode
    },
    data() {
        return {
            ...baseApp.data(),
            showForm: false,
            showCloseConfirm: false,
            isEdit: false,
            isSubmitting: false,
            storeTree: [],
            parentOptions: [],
            formData: {
                id: '',
                name: '',
                phone: '',
                address: '',
                idcode: '',
                sort: 255,
                levels: '',
                parent_id: ''
            },
            errors: {}
        };
    },
    computed: {
        ...baseApp.computed,
        /* 必填未填 → 送出鈕 disable:層級 / 上級機關(層級>1 時)/ 機關名稱 */
        formIncomplete() {
            const f = this.formData;
            if (!f.levels) return true;
            if (f.levels > 1 && !f.parent_id) return true;
            if (!f.name || !String(f.name).trim()) return true;
            return false;
        }
    },
    methods: {
        ...baseApp.methods,
        async loadStoreTree() {
            const BASE_URL = typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : '';

            try {
                const response = await axios.get(`${BASE_URL}/cms/store_manage/storelist`);
                if (response.data.success) {
                    this.storeTree = response.data.data || [];
                }
            } catch (error) {
                console.error('載入機關列表失敗:', error);
            }
        },

        async loadParentOptions(level) {
            if (level <= 1) {
                this.parentOptions = [];
                return;
            }

            const BASE_URL = typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : '';

            try {
                const response = await axios.get(`${BASE_URL}/cms/store_manage/getparentoptions/${level}`);
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
           尤其「上級機關」是 v-if 動態新增的 select,更需要在它出現後重新增強)。
           SPA 雙層 app $refs 取不到 → 用 document.querySelector 定位當前頁 modal;init 靠 [data-bdd] 防重。 */
        enhanceModalDropdowns() {
            const modal = document.querySelector('.b-modal-overlay[data-modal-vue]');
            if (!modal || !window.BDropdown) return;
            window.BDropdown.init(modal);   // 增強新出現的 select(如 v-if 的「上級機關」)
            // 已增強的 select 值被程式改動(如切層級 reset parent_id)不會發 change → syncAll 重讀選單+標籤,修殘留舊標籤
            if (window.BDropdown.syncAll) window.BDropdown.syncAll(modal);
        },

        openAddForm(parentId, level) {
            this.isEdit = false;
            this.resetForm();
            this.formData.levels = level || 1;
            this.formData.parent_id = parentId || '';
            this.loadParentOptions(this.formData.levels);
            this.showForm = true;
            this.$nextTick(() => { this.enhanceModalDropdowns(); this.snapshotForm(); });
        },

        openAddChildForm(parentId, level) {
            this.openAddForm(parentId, level);
        },

        async openEditForm(storeId) {
            this.isEdit = true;
            this.resetForm();

            const BASE_URL = typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : '';

            try {
                const response = await axios.post(`${BASE_URL}/cms/store_manage/store/${storeId}`);
                if (response.data.success) {
                    const data = response.data.data;
                    this.formData = {
                        id: data.store.id,
                        name: data.store.name,
                        phone: data.store.phone || '',
                        address: data.store.address || '',
                        idcode: data.store.idcode || '',
                        sort: data.store.sort,
                        levels: data.store.levels,
                        parent_id: data.store.parent_id
                    };
                    this.parentOptions = data.parent_options || [];
                } else {
                    await BDialog.alert({ variant: 'danger', title: '載入資料失敗', desc: response.data.message || '' });
                    return;
                }
            } catch (error) {
                console.error('載入機關資料失敗:', error);
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
                name: '',
                phone: '',
                address: '',
                idcode: '',
                sort: 255,
                levels: '',
                parent_id: ''
            };
            this.parentOptions = [];
            this.errors = {};
        },

        onLevelChange() {
            this.formData.parent_id = '';
            this.loadParentOptions(this.formData.levels);
            // 層級改變會 v-if 顯示/隱藏「上級機關」select → 出現後要重新增強才可見 + 有展開動畫
            this.$nextTick(() => this.enhanceModalDropdowns());
        },

        validateForm() {
            this.errors = {};

            if (!this.formData.levels) {
                this.errors.levels = '請選擇層級';
            }

            if (!this.formData.name || !this.formData.name.trim()) {
                this.errors.name = '請輸入機關名稱';
            }

            if (this.formData.levels > 1 && !this.formData.parent_id) {
                this.errors.parent_id = '請選擇上級機關';
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
                    response = await axios.put(`${BASE_URL}/cms/store_manage/store/${this.formData.id}`, this.formData);
                } else {
                    response = await axios.post(`${BASE_URL}/cms/store_manage/addstore`, this.formData);
                }

                if (response.data.success) {
                    BToast.success(this.isEdit ? '更新成功' : '新增成功');
                    this.closeForm();
                    this.loadStoreTree();
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

        async deleteStore(storeId, storeName) {
            if (!(await BDialog.confirm({ title: `確定要刪除「${storeName}」嗎？`, variant: 'danger', confirmText: '刪除' }))) {
                return;
            }

            const BASE_URL = typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : '';

            try {
                const response = await axios.put(`${BASE_URL}/cms/store_manage/deletestore/${storeId}`);
                if (response.data.success) {
                    BToast.success('刪除成功');
                    this.loadStoreTree();
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
        if (baseApp.created) {
            baseApp.created.call(this);
        }
    },
    mounted() {
        this.loadStoreTree();
    }
};

// 匯出供使用
window.TreeNode = TreeNode;
window.StoreManagePageApp = StoreManagePageApp;
