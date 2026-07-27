/**
 * TinyMCE 共用初始化模組
 * 提供統一的 TinyMCE 編輯器配置與操作方法
 */
const TinyMCEHelper = {

    /** 追蹤本次 session 上傳的圖片路徑（供取消時清理） */
    _uploadedImages: [],

    /** 追蹤本次 session 上傳的圖片 file_id（供 DB 清理） */
    _uploadedImageIds: [],

    /**
     * 預設配置
     */
    getDefaultOptions() {
        const baseUrl = window.BASE_URL || '';
        return {
            base_url: `${baseUrl}/static/assets/vendor/tinymce`,
            suffix: '.min',
            language: 'zh-Hant',
            language_url: `${baseUrl}/static/assets/vendor/tinymce/langs/zh-Hant.js`,
            skin: 'oxide',
            plugins: 'image media link table lists code fullscreen preview charmap searchreplace autolink autoresize',
            toolbar: [
                'undo redo | bold italic underline strikethrough | blocks',
                'alignleft aligncenter alignright alignjustify | bullist numlist outdent indent',
                'table image media link | charmap | code fullscreen preview'
            ].join(' | '),
            toolbar_mode: 'sliding',
            min_height: 400,
            max_height: 800,
            resize: true,
            automatic_uploads: true,
            images_reuse_filename: false,
            relative_urls: false,
            remove_script_host: false,
            image_advtab: true,
            image_caption: true,
            content_style: 'body { font-family: "Noto Sans TC", "Microsoft JhengHei", sans-serif; font-size: 16px; line-height: 1.6; }',
            branding: false,
            promotion: false,
            license_key: 'gpl'
        };
    },

    /**
     * 初始化 TinyMCE 編輯器
     * @param {string} selector - CSS 選擇器 (如 '#editor')
     * @param {object} customOptions - 自訂選項（覆蓋預設）
     * @returns {Promise}
     */
    init(selector, customOptions = {}) {
        const self = this;
        const baseUrl = window.BASE_URL || '';
        const uploadUrl = `${baseUrl}/cms/upload/image`;

        // 重置上傳追蹤
        self._uploadedImages = [];
        self._uploadedImageIds = [];

        const options = {
            ...this.getDefaultOptions(),
            selector,
            images_upload_url: uploadUrl,
            images_upload_handler: (blobInfo, progress) => {
                return new Promise((resolve, reject) => {
                    const formData = new FormData();
                    formData.append('file', blobInfo.blob(), blobInfo.filename());

                    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;

                    axios.post(uploadUrl, formData, {
                        headers: {
                            'X-CSRFToken': csrfToken || ''
                        },
                        onUploadProgress: (e) => {
                            if (e.total) {
                                progress(Math.round((e.loaded / e.total) * 100));
                            }
                        }
                    }).then(response => {
                        if (response.data.location) {
                            // 追蹤上傳的圖片（供取消時清理）
                            if (response.data.file_path) {
                                self._uploadedImages.push(response.data.file_path);
                            }
                            if (response.data.file_id) {
                                self._uploadedImageIds.push(response.data.file_id);
                            }
                            resolve(response.data.location);
                        } else {
                            reject(response.data.error || '上傳失敗');
                        }
                    }).catch(() => {
                        reject('圖片上傳失敗，請稍後再試');
                    });
                });
            },
            ...customOptions
        };

        return tinymce.init(options);
    },

    /**
     * 取得編輯器 HTML 內容
     * @param {string} selector - CSS 選擇器
     * @returns {string}
     */
    getContent(selector) {
        const id = selector.replace('#', '');
        const editor = tinymce.get(id);
        return editor ? editor.getContent() : '';
    },

    /**
     * 設定編輯器 HTML 內容
     * @param {string} selector - CSS 選擇器
     * @param {string} html - HTML 內容
     */
    setContent(selector, html) {
        const id = selector.replace('#', '');
        const editor = tinymce.get(id);
        if (editor) {
            editor.setContent(html || '');
        }
    },

    /**
     * 取得本次 session 上傳的圖片路徑列表
     * @returns {string[]}
     */
    getUploadedImages() {
        return [...this._uploadedImages];
    },

    /**
     * 取得本次 session 上傳的圖片 file_id 列表
     * @returns {string[]}
     */
    getUploadedImageIds() {
        return [...this._uploadedImageIds];
    },

    /**
     * 清空上傳追蹤
     */
    clearUploadedImages() {
        this._uploadedImages = [];
        this._uploadedImageIds = [];
    },

    /**
     * 銷毀編輯器實例
     * @param {string} selector - CSS 選擇器
     */
    destroy(selector) {
        const id = selector.replace('#', '');
        const editor = tinymce.get(id);
        if (editor) {
            editor.destroy();
        }
    }
};

window.TinyMCEHelper = TinyMCEHelper;
