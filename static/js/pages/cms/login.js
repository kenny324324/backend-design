/**
 * 後台登入頁面 JS
 * 對應 templates/cms/login.html
 */

/**
 * 後台登入 Vue 應用程式
 */
const CmsLoginApp = {
    delimiters: ['[[', ']]'],

    data() {
        return {
            BASE_URL: typeof BASE_URL !== 'undefined' ? BASE_URL : '',
            defaultStoreId: null,
            formData: {
                store_id: '',
                email: '',
                password: '',
                captcha: ''
            },
            errors: {},
            errorMessage: '',
            isSubmitting: false,
            showPassword: false,
            showStoreField: false,
            captchaUrl: ''
        };
    },

    methods: {
        validateForm() {
            this.errors = {};

            if (this.showStoreField && !this.formData.store_id) {
                this.errors.store_id = '請選擇機關';
            }

            if (!this.formData.email) {
                this.errors.email = '請輸入電子郵件';
            } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.formData.email)) {
                this.errors.email = '請輸入有效的電子郵件格式';
            }

            if (!this.formData.password) {
                this.errors.password = '請輸入密碼';
            }

            if (!this.formData.captcha) {
                this.errors.captcha = '請輸入驗證碼';
            } else if (this.formData.captcha.length !== 5) {
                this.errors.captcha = '請輸入 5 位驗證碼';
            }

            return Object.keys(this.errors).length === 0;
        },

        refreshCaptcha() {
            this.captchaUrl = `${this.BASE_URL}/cms/captcha?` + Date.now();
            this.formData.captcha = '';
        },

        async handleSubmit() {
            if (!this.validateForm()) {
                return;
            }

            this.isSubmitting = true;
            this.errorMessage = '';

            try {
                const formData = new URLSearchParams();
                formData.append('store_id', this.formData.store_id);
                formData.append('email', this.formData.email);
                formData.append('password', this.formData.password);
                formData.append('captcha', this.formData.captcha);

                const response = await axios.post(`${this.BASE_URL}/cms/checkLogin`, formData, {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });

                if (response.data.success) {
                    window.location.href = `${this.BASE_URL}/cms/index`;
                } else {
                    this.errorMessage = response.data.message;
                    this.refreshCaptcha();
                }
            } catch (error) {
                console.error('Login error:', error);
                this.errorMessage = '系統錯誤，請稍後再試';
                this.refreshCaptcha();
            } finally {
                this.isSubmitting = false;
            }
        }
    },

    mounted() {
        // 從 data attribute 取得初始值
        const appEl = document.getElementById('app');
        if (appEl) {
            this.defaultStoreId = appEl.dataset.defaultStoreId || '';
            this.formData.store_id = this.defaultStoreId;
        }

        this.refreshCaptcha();
    }
};

// DOM Ready 後初始化
document.addEventListener('DOMContentLoaded', function() {
    const mountEl = document.getElementById('app');
    if (mountEl && typeof Vue !== 'undefined') {
        const { createApp } = Vue;
        createApp(CmsLoginApp).mount('#app');
    }
});

// 匯出供外部使用
window.CmsLoginApp = CmsLoginApp;
