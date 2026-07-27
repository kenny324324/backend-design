/**
 * 內容管理頁面 JS
 * 對應 templates/cms/content_manage.html
 */
const ContentManagePageApp = {
    ...baseApp,
    data() {
        return {
            ...baseApp.data(),
            tableSearch: '',
            showForm: false,
            isEdit: false,
            isSubmitting: false,
            isDragging: false,
            uploadingFiles: [],
            attachedFiles: [],
            newFileIds: [],
            formSaved: false,
            showCloseConfirm: false,
            formData: {
                id: '',
                title: '',
                content: '',
                sort: 0
            },
            errors: {}
        };
    },
    computed: {
        ...baseApp.computed,
        /* 必填未填 → 送出鈕 disable:標題(TinyMCE 內容非必填) */
        formIncomplete() {
            return !this.formData.title || !String(this.formData.title).trim();
        },
        /* 附件顯示順序:最新上傳的排最上面(新檔 push 到陣列尾 → 反轉後在頭) */
        attachedFilesView() {
            return this.attachedFiles.slice().reverse();
        }
    },
    methods: {
        ...baseApp.methods,

        /* 搜尋框對齊球場管理/預約管理/會員管理:驅動 DataTables server-side search[value],300ms 去抖 */
        onTableSearch() {
            window.clearTimeout(this._searchTimer);
            this._searchTimer = window.setTimeout(() => {
                if (window.contentTable) window.contentTable.search(this.tableSearch).draw();
            }, 300);
        },

        clearTableSearch() {
            this.tableSearch = '';
            window.clearTimeout(this._searchTimer);
            if (window.contentTable) window.contentTable.search('').draw();
        },

        /* SPA 雙層 app $refs 取不到 → 用 class 定位隱藏 file input(取代 $refs.fileInput) */
        openFilePicker() {
            const inp = document.querySelector('.js-content-file-input');
            if (inp) inp.click();
        },

        // ── 關閉確認:有輸入/修改(標題、排序、TinyMCE 內文、或已上傳附件)才跳「放棄」警告,否則直接關 ──
        snapshotForm() {
            this._formSnapshot = JSON.stringify({ title: this.formData.title, sort: this.formData.sort });
        },
        isFormDirty() {
            if (!this._formSnapshot) return false;
            if (JSON.stringify({ title: this.formData.title, sort: this.formData.sort }) !== this._formSnapshot) return true;
            if (this.newFileIds.length > 0) return true;                 // 本次已上傳新附件
            const ed = window.tinymce && tinymce.get('editor');
            if (ed && ed.isDirty()) return true;                          // TinyMCE 內文被改過
            return false;
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

        // ========================================
        // DataTable
        // ========================================
        initDataTable() {
            const self = this;
            const BASE_URL = typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : '';

            if ($.fn.DataTable.isDataTable('#contentTable')) {
                return;
            }

            window.contentTable = $('#contentTable').DataTable({
                processing: true,
                serverSide: true,
                ajax: {
                    url: `${BASE_URL}/cms/content_manage/list`,
                    type: 'GET'
                },
                columns: [
                    { data: 'title', title: '標題' },
                    {
                        data: 'sort',
                        title: '排序',
                        width: '80px',
                        className: 'text-center'
                    },
                    {
                        data: 'created_at',
                        title: '建立時間',
                        width: '160px',
                        render: function(data) {
                            if (!data) return '-';
                            return data.substring(0, 16);
                        }
                    },
                    {
                        data: null,
                        title: '操作',
                        orderable: false,
                        width: '140px',
                        render: function(data) {
                            const id = data.id;
                            const title = (data.title || '').replace(/'/g, "\\'");
                            return `
                                <button class="action-btn edit" onclick="window.vueApp.openEditForm('${id}')">
                                    <i class="fa-solid fa-pen"></i> 編輯
                                </button>
                                <button class="action-btn disable" onclick="window.vueApp.deleteContent('${id}', '${title}')">
                                    <i class="fa-solid fa-trash"></i> 刪除
                                </button>
                            `;
                        }
                    }
                ],
                order: [[1, 'asc']],
                /* 去 DataTables chrome:只留 table(r) + tbody(t),對齊球場管理/預約管理/會員管理。
                   ⚠️ serverSide 不可 paging:false(送 length=-1 後端 FETCH NEXT 會炸);
                   ⚠️ 內容筆數可能很多 → 目前單頁上限 200,超過看不到後面;
                      若真的超過需再加回分頁或虛擬捲動。 */
                dom: 'rt',
                pageLength: 200,
                language: {
                    processing: "處理中...",
                    zeroRecords: "沒有找到資料",
                    info: "第 _START_ 至 _END_ 筆，共 _TOTAL_ 筆",
                    infoEmpty: "沒有資料",
                    infoFiltered: "(從 _MAX_ 筆中篩選)",
                    search: "搜尋：",
                    paginate: {
                        first: "第一頁",
                        previous: "上一頁",
                        next: "下一頁",
                        last: "最末頁"
                    }
                }
            });
        },

        // ========================================
        // 表單操作
        // ========================================
        openAddForm() {
            this.isEdit = false;
            this.resetForm();
            this.showForm = true;
            this.registerBeforeUnload();
            // 2 欄版面:編輯器一直可見 → 開表單即 init TinyMCE(不再 lazy);snapshot 供關閉 dirty 判斷
            this.$nextTick(() => {
                // 右欄填滿:固定高度(內文超過就編輯器內滾),modal 不長高、不捲動
                TinyMCEHelper.init('#editor', { height: '100%', resize: false, statusbar: false, plugins: 'image media link table lists code fullscreen preview charmap searchreplace autolink' });
                this.snapshotForm();
            });
        },

        async openEditForm(contentId) {
            this.isEdit = true;
            this.resetForm();
            const BASE_URL = typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : '';

            try {
                const response = await axios.post(`${BASE_URL}/cms/content_manage/content/${contentId}`);
                if (response.data.success) {
                    const data = response.data.data;
                    this.formData = {
                        id: data.content.id,
                        title: data.content.title || '',
                        content: data.content.content || '',
                        sort: data.content.sort || 0
                    };
                    this.attachedFiles = data.files || [];
                    this.showForm = true;
                    this.registerBeforeUnload();
                    this.$nextTick(() => {
                        this.snapshotForm();
                        TinyMCEHelper.init('#editor', { height: '100%', resize: false, statusbar: false, plugins: 'image media link table lists code fullscreen preview charmap searchreplace autolink' }).then(() => {
                            TinyMCEHelper.setContent('#editor', this.formData.content);
                        });
                    });
                } else {
                    await BDialog.alert({ variant: 'danger', title: '載入失敗', desc: response.data.message || '' });
                }
            } catch (error) {
                await BDialog.alert({ variant: 'danger', title: '載入資料失敗' });
            }
        },

        closeForm() {
            this.unregisterBeforeUnload();
            if (!this.formSaved) {
                this.cleanupOrphans();
            }
            TinyMCEHelper.destroy('#editor');
            this._formSnapshot = null;
            this.showCloseConfirm = false;
            this.showForm = false;
            this.resetForm();
        },

        resetForm() {
            this.formData = { id: '', title: '', content: '', sort: 0 };
            this.errors = {};
            this.attachedFiles = [];
            this.uploadingFiles = [];
            this.newFileIds = [];
            this.formSaved = false;
            this.isDragging = false;
            // 清 TinyMCE 圖片追蹤(init 也會重置,這裡多一層保險:關閉未送出時 resetForm 先清)
            if (window.TinyMCEHelper) TinyMCEHelper.clearUploadedImages();
        },

        validateForm() {
            this.errors = {};
            if (!(this.formData.title || '').trim()) {
                this.errors.title = '請輸入標題';
            }
            return Object.keys(this.errors).length === 0;
        },

        async submitForm() {
            // 從 TinyMCE 取得內容(編輯器已初始化才讀,否則保留 formData.content;不信任樂觀旗標,直接查實例)
            const ed = window.tinymce && tinymce.get('editor');
            if (ed) this.formData.content = ed.getContent();

            if (!this.validateForm()) return;
            this.isSubmitting = true;

            const BASE_URL = typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : '';
            const payload = {
                ...this.formData,
                file_ids: [
                    ...this.attachedFiles.map(f => f.id),
                    ...TinyMCEHelper.getUploadedImageIds()
                ]
            };

            try {
                let response;
                if (this.isEdit) {
                    response = await axios.put(
                        `${BASE_URL}/cms/content_manage/content/${this.formData.id}`,
                        payload
                    );
                } else {
                    response = await axios.post(
                        `${BASE_URL}/cms/content_manage/addcontent`,
                        payload
                    );
                }

                if (response.data.success) {
                    BToast.success(this.isEdit ? '更新成功' : '新增成功');
                    this.formSaved = true;
                    this.closeForm();
                    if (window.contentTable) {
                        window.contentTable.ajax.reload();
                    }
                } else {
                    await BDialog.alert({ variant: 'danger', title: '操作失敗', desc: response.data.message || '' });
                }
            } catch (error) {
                await BDialog.alert({ variant: 'danger', title: '操作失敗' });
            } finally {
                this.isSubmitting = false;
            }
        },

        async deleteContent(contentId, title) {
            if (!(await BDialog.confirm({ title: `確定要刪除「${title}」嗎？`, variant: 'danger', confirmText: '刪除' }))) return;

            const BASE_URL = typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : '';
            try {
                const response = await axios.put(`${BASE_URL}/cms/content_manage/deletecontent/${contentId}`);
                if (response.data.success) {
                    BToast.success('刪除成功');
                    if (window.contentTable) {
                        window.contentTable.ajax.reload();
                    }
                } else {
                    await BDialog.alert({ variant: 'danger', title: '刪除失敗', desc: response.data.message || '' });
                }
            } catch (error) {
                await BDialog.alert({ variant: 'danger', title: '刪除失敗' });
            }
        },

        // ========================================
        // 檔案上傳
        // ========================================
        onDrop(e) {
            this.isDragging = false;
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.uploadFiles(files);
            }
        },

        onFileSelect(e) {
            const files = e.target.files;
            if (files.length > 0) {
                this.uploadFiles(files);
            }
            e.target.value = '';
        },

        async uploadFiles(fileList) {
            const BASE_URL = typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : '';
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;

            const formData = new FormData();
            const fileNames = [];
            for (let i = 0; i < fileList.length; i++) {
                formData.append('files', fileList[i]);
                fileNames.push({ name: fileList[i].name, progress: 0 });
            }
            this.uploadingFiles = fileNames;

            // 編輯時帶 ref_table + ref_id
            if (this.isEdit && this.formData.id) {
                formData.append('ref_table', 'contents');
                formData.append('ref_id', this.formData.id);
            }

            try {
                const response = await axios.post(`${BASE_URL}/cms/upload/file`, formData, {
                    headers: { 'X-CSRFToken': csrfToken || '' },
                    onUploadProgress: (e) => {
                        if (e.total) {
                            const pct = Math.round((e.loaded / e.total) * 100);
                            this.uploadingFiles.forEach(f => f.progress = pct);
                        }
                    }
                });

                if (response.data.success) {
                    this.attachedFiles.push(...response.data.data);
                    // 追蹤本次 session 新上傳的檔案 ID（供取消時清理）
                    response.data.data.forEach(f => {
                        if (f.id) this.newFileIds.push(f.id);
                    });
                } else {
                    await BDialog.alert({ variant: 'danger', title: '上傳失敗', desc: response.data.message || '' });
                }
            } catch (error) {
                await BDialog.alert({ variant: 'danger', title: '上傳失敗' });
            } finally {
                this.uploadingFiles = [];
            }
        },

        async deleteFile(fileId, fileName) {
            if (!(await BDialog.confirm({ title: `確定要刪除「${fileName}」嗎？`, variant: 'danger', confirmText: '刪除' }))) return;

            const BASE_URL = typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : '';
            try {
                const response = await axios.delete(`${BASE_URL}/cms/upload/file/${fileId}`);
                if (response.data.success) {
                    this.attachedFiles = this.attachedFiles.filter(f => f.id !== fileId);
                    this.newFileIds = this.newFileIds.filter(id => id !== fileId);
                } else {
                    await BDialog.alert({ variant: 'danger', title: '刪除失敗', desc: response.data.message || '' });
                }
            } catch (error) {
                await BDialog.alert({ variant: 'danger', title: '刪除失敗' });
            }
        },

        // ========================================
        // 孤立檔案清理
        // ========================================
        getAllOrphanFileIds() {
            return [
                ...this.newFileIds,
                ...TinyMCEHelper.getUploadedImageIds()
            ];
        },

        cleanupOrphans() {
            const fileIds = this.getAllOrphanFileIds();
            if (fileIds.length === 0) return;

            const BASE_URL = typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : '';
            axios.post(`${BASE_URL}/cms/upload/cleanup`, {
                file_ids: fileIds
            }).catch(() => {});
        },

        registerBeforeUnload() {
            this._beforeUnloadHandler = () => {
                if (!this.showForm || this.formSaved) return;
                const fileIds = this.getAllOrphanFileIds();
                if (fileIds.length === 0) return;

                const BASE_URL = typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : '';
                navigator.sendBeacon(
                    `${BASE_URL}/cms/upload/cleanup`,
                    new Blob([JSON.stringify({ file_ids: fileIds })], { type: 'application/json' })
                );
            };
            window.addEventListener('beforeunload', this._beforeUnloadHandler);
        },

        unregisterBeforeUnload() {
            if (this._beforeUnloadHandler) {
                window.removeEventListener('beforeunload', this._beforeUnloadHandler);
                this._beforeUnloadHandler = null;
            }
        },

        // ========================================
        // 工具函數
        // ========================================
        formatFileSize(bytes) {
            if (!bytes) return '0 B';
            const units = ['B', 'KB', 'MB', 'GB'];
            let i = 0;
            let size = bytes;
            while (size >= 1024 && i < units.length - 1) {
                size /= 1024;
                i++;
            }
            return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
        },

        getDownloadUrl(fileId) {
            const BASE_URL = typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : '';
            return `${BASE_URL}/cms/upload/download/${fileId}`;
        },

        getFileIcon(mimeType) {
            if (!mimeType) return 'fa-solid fa-file';
            if (mimeType.startsWith('image/')) return 'fa-solid fa-file-image';
            if (mimeType === 'application/pdf') return 'fa-solid fa-file-pdf';
            if (mimeType.includes('word') || mimeType.includes('document')) return 'fa-solid fa-file-word';
            if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'fa-solid fa-file-excel';
            if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'fa-solid fa-file-powerpoint';
            if (mimeType.includes('zip') || mimeType.includes('compressed') || mimeType.includes('archive')) return 'fa-solid fa-file-zipper';
            if (mimeType.startsWith('text/')) return 'fa-solid fa-file-lines';
            return 'fa-solid fa-file';
        },

        /* 檔案類型圖示的對應色(前面 icon 依副檔類型上色) */
        getFileColor(mimeType) {
            if (!mimeType) return '#94A3B8';
            if (mimeType.startsWith('image/')) return '#7C3AED';                                    // 圖片 紫
            if (mimeType === 'application/pdf') return '#E5484D';                                    // PDF 紅
            if (mimeType.includes('word') || mimeType.includes('document')) return '#2B6CB0';        // Word 藍
            if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '#1E8E3E';    // Excel 綠
            if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '#D9730D'; // PPT 橘
            if (mimeType.includes('zip') || mimeType.includes('compressed') || mimeType.includes('archive')) return '#B45309'; // 壓縮 琥珀
            if (mimeType.startsWith('text/')) return '#64748B';                                      // 文字 灰藍
            return '#94A3B8';
        }
    },
    mounted() {
        this.$nextTick(() => {
            this.initDataTable();
        });
    },
    created() {
        if (baseApp.created) {
            baseApp.created.call(this);
        }
    },
    beforeUnmount() {
        window.clearTimeout(this._searchTimer);
        // SPA 換頁不觸發 beforeunload → 表單開著且未儲存時,離頁前主動清掉已上傳的孤兒檔
        if (this.showForm && !this.formSaved) this.cleanupOrphans();
        this.unregisterBeforeUnload();
    }
};

window.ContentManagePageApp = ContentManagePageApp;
