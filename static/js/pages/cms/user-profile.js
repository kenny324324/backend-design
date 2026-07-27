/**
 * 我的資料頁面 JS
 * 對應 templates/cms/user_profile.html
 */

/**
 * 使用者個人資料 Vue 頁面配置
 * 已合併 baseApp，HTML 只需 2 行初始化
 */
const UserProfilePageApp = {
    ...baseApp,
    data() {
        return {
            ...baseApp.data(),
            userData: {
                id: '',
                name: '',
                email: '',
                storename: '',
                groupname: '',
                password: '',
                password_confirm: ''
            },
            errors: {},
            isSubmitting: false,
            showPassword: false,
            showPasswordConfirm: false,
            showStoreField: false,
            BASE_URL: typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : ''
        };
    },
    methods: {
        ...baseApp.methods,
        async loadUserData() {
            const BASE_URL = typeof window.BASE_URL !== 'undefined' ? window.BASE_URL : '';

            try {
                const response = await axios.post(`${BASE_URL}/cms/user_profile/user`);
                if (response.data.success) {
                    const user = response.data.data.user;
                    this.userData = {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        storename: user.storename,
                        groupname: user.groupname,
                        password: '',
                        password_confirm: ''
                    };
                }
            } catch (error) {
                console.error('載入資料失敗:', error);
                await BDialog.alert({ variant: 'danger', title: '載入資料失敗' });
            }
        },

        validateForm() {
            this.errors = {};

            if (!this.userData.name?.trim()) {
                this.errors.name = '請輸入姓名';
            }

            if (!this.userData.email?.trim()) {
                this.errors.email = '請輸入 Email';
            } else {
                const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
                if (!emailPattern.test(this.userData.email)) {
                    this.errors.email = '請輸入有效的 Email 格式';
                }
            }

            // 密碼驗證 (選填)
            if (this.userData.password) {
                if (this.userData.password.length < 6) {
                    this.errors.password = '密碼長度至少 6 個字元';
                }
                if (this.userData.password !== this.userData.password_confirm) {
                    this.errors.password_confirm = '兩次密碼輸入不一致';
                }
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
                const response = await axios.put(`${BASE_URL}/cms/user_profile/user`, {
                    name: this.userData.name,
                    email: this.userData.email,
                    password: this.userData.password || ''
                });

                if (response.data.success) {
                    BToast.success('更新成功');
                    this.userData.password = '';
                    this.userData.password_confirm = '';
                    this.loadUserData();
                } else {
                    await BDialog.alert({ variant: 'danger', title: '更新失敗', desc: response.data.message || '' });
                }
            } catch (error) {
                console.error('更新失敗:', error);
                if (error.response?.data?.message) {
                    await BDialog.alert({ variant: 'danger', title: '更新失敗', desc: error.response.data.message });
                } else {
                    await BDialog.alert({ variant: 'danger', title: '更新失敗，請稍後再試' });
                }
            } finally {
                this.isSubmitting = false;
            }
        }
    },
    created() {
        if (baseApp.created) {
            baseApp.created.call(this);
        }
        this.loadUserData();
    }
};

// 匯出供使用
window.UserProfilePageApp = UserProfilePageApp;
