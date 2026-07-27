/* [backend-design] Tailwind CDN runtime config — 貼在 <script src="https://cdn.tailwindcss.com"></script> 之後。
   typeui Dashboard:8px 圓角預設(4px 小 / full)、elevation 陰影、語意色 — 全部指向 b_tokens.css 的 CSS 變數。
   來源:golfmaster 兩個後台 base.html(A /cms 與 B /cms/<code>/)內聯的同一份 config。 */
tailwind.config = {
    theme: {
        extend: {
            borderRadius: {
                none: '0', sm: '4px', DEFAULT: '8px', md: '8px',
                lg: '8px', xl: '8px', '2xl': '8px', '3xl': '12px', full: '9999px'
            },
            boxShadow: {
                none: 'none',
                '2xs': 'var(--shadow-2xs)', xs: 'var(--shadow-xs)', sm: 'var(--shadow-sm)',
                DEFAULT: 'var(--shadow-sm)', md: 'var(--shadow-md)', lg: 'var(--shadow-lg)',
                xl: 'var(--shadow-xl)', '2xl': 'var(--shadow-2xl)'
            },
            colors: {
                brand: {
                    DEFAULT: 'var(--brand)', soft: 'var(--brand-soft)', softer: 'var(--brand-softer)',
                    medium: 'var(--brand-medium)', strong: 'var(--brand-strong)'
                },
                heading: 'var(--text-heading)',
                body: 'var(--text-body)',
                'body-subtle': 'var(--text-body-subtle)',
                'fg-brand': 'var(--fg-brand)',
                surface: 'var(--neutral-primary-soft)',
                'surface-soft': 'var(--neutral-secondary-soft)',
                'surface-muted': 'var(--neutral-tertiary)',
                'border-default': 'var(--border-default)',
                success: { DEFAULT: 'var(--success)', soft: 'var(--success-soft)' },
                danger: { DEFAULT: 'var(--danger)', soft: 'var(--danger-soft)' },
                warning: { DEFAULT: 'var(--warning)', soft: 'var(--warning-soft)' }
            }
        }
    }
};
