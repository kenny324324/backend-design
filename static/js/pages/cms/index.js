/* 後台首頁「營運總覽」bento 儀表板。
   資料全部來自預約管理既有 API(/cms/booking_manage/stats、/list),不動後端;
   無 booking_manage 權限的帳號會收到 403 → 退回歡迎卡 + 捷徑。 */
const IndexPageApp = {
    ...baseApp,
    data() {
        return {
            ...baseApp.data(),
            dash: { loaded: false, allowed: true, error: '' },
            today: '',
            statsToday: null,
            statsMonth: null,
            statsAll: null,
            todayBookings: [],
            weekBookings: []
        };
    },
    computed: {
        ...baseApp.computed,
        todayUnpaid() {
            return this.todayBookings.filter(b =>
                ['unpaid', 'failed'].includes(b.payment_status || 'unpaid')
                && !['cancelled', 'pending_cancel'].includes(b.status)
            ).length;
        },
        /* 今天起 3 天,每日有效預約組數/時數(取消、待取消不計);pct 供橫條寬度 */
        weekAhead() {
            if (!this.today) return [];
            const byDate = {};
            this.weekBookings.forEach(b => {
                if (['cancelled', 'pending_cancel'].includes(b.status)) return;
                const key = this.normalizeDate(b.play_date);
                if (!byDate[key]) byDate[key] = { count: 0, hours: 0 };
                byDate[key].count += 1;
                byDate[key].hours += Number(b.duration_hours || 0);
            });
            const dayNames = ['今天', '明天', '後天'];
            const base = new Date(`${this.today}T00:00:00`);
            const days = [];
            for (let i = 0; i < 3; i++) {
                const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
                const key = this.getLocalDateString(d);
                const agg = byDate[key] || { count: 0, hours: 0 };
                const label = `${dayNames[i]} ${d.getMonth() + 1}/${d.getDate()}`;
                days.push({ date: key, label, count: agg.count, hours: agg.hours, isToday: i === 0 });
            }
            const max = Math.max(1, ...days.map(x => x.count));
            days.forEach(x => { x.pct = Math.round(x.count / max * 100); });
            return days;
        }
    },
    methods: {
        ...baseApp.methods,

        getLocalDateString(date) {
            const d = date || new Date();
            const pad = n => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        },

        async loadDashboard() {
            const baseUrl = window.BASE_URL || '';
            const now = new Date();
            const today = this.getLocalDateString(now);
            const monthStart = this.getLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
            const monthEnd = this.getLocalDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0));
            const weekEnd = this.getLocalDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2));
            this.today = today;
            this.dash.error = '';
            try {
                const [todayRes, monthRes, allRes, listRes, weekRes] = await Promise.all([
                    axios.get(`${baseUrl}/cms/booking_manage/stats`, { params: { start_date: today, end_date: today } }),
                    axios.get(`${baseUrl}/cms/booking_manage/stats`, { params: { start_date: monthStart, end_date: monthEnd } }),
                    axios.get(`${baseUrl}/cms/booking_manage/stats`),
                    axios.get(`${baseUrl}/cms/booking_manage/list`, {
                        params: {
                            start_date: today,
                            end_date: today,
                            start: 0,
                            length: 50,
                            draw: 1,
                            'order[0][column]': 2,
                            'order[0][dir]': 'ASC'
                        }
                    }),
                    axios.get(`${baseUrl}/cms/booking_manage/list`, {
                        params: {
                            start_date: today,
                            end_date: weekEnd,
                            start: 0,
                            length: 500,
                            draw: 1,
                            'order[0][column]': 0,
                            'order[0][dir]': 'ASC'
                        }
                    })
                ]);
                this.statsToday = todayRes.data?.data || null;
                this.statsMonth = monthRes.data?.data || null;
                this.statsAll = allRes.data?.data || null;
                this.todayBookings = listRes.data?.data || [];
                this.weekBookings = weekRes.data?.data || [];
                this.dash.allowed = true;
            } catch (error) {
                if (error.response?.status === 403) {
                    this.dash.allowed = false;
                } else {
                    this.dash.error = error.response?.data?.message || '無法連線,請稍後再試。';
                }
            } finally {
                this.dash.loaded = true;
            }
        },

        kpi(source, key) {
            return source ? Number(source[key] || 0) : 0;
        },

        formatCurrency(value) {
            return `$${Number(value || 0).toLocaleString()}`;
        },

        formatHours(value) {
            return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 1 });
        },

        formatTime(value) {
            return value ? String(value).slice(0, 5) : '—';
        },

        /* play_date 可能是 'YYYY-MM-DD' 或 jsonify 的 RFC 日期字串,一律轉回本地 YYYY-MM-DD */
        normalizeDate(value) {
            if (!value) return '';
            const s = String(value);
            if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
            const d = new Date(s);
            return isNaN(d) ? '' : this.getLocalDateString(d);
        },

        /* 狀態/付款 badge 對照與 booking-manage.js 一致 */
        statusClass(status) {
            const map = { pending: 'warn', confirmed: 'ok', checked_in: 'brand', pending_cancel: 'bad', cancelled: 'bad', completed: 'neutral' };
            return map[status] || 'neutral';
        },
        statusLabel(status) {
            const map = { pending: '待確認', confirmed: '已確認', checked_in: '已報到', pending_cancel: '待取消', cancelled: '已取消', completed: '已完成' };
            return map[status] || status || '-';
        },
        payClass(status) {
            const map = { unpaid: 'neutral', onsite: 'brand', pending: 'warn', paid: 'ok', refunded: 'neutral', failed: 'bad' };
            return map[status || 'unpaid'] || 'neutral';
        },
        payLabel(status) {
            const map = { unpaid: '未付款', onsite: '現場付款', pending: '付款中', paid: '已付款', refunded: '已退款', failed: '付款失敗' };
            return map[status || 'unpaid'] || status || '-';
        }
    },
    mounted() {
        this.loadDashboard();
    }
};
