(() => {
    const body = document.body;
    const header = document.querySelector('[data-site-header]');
    const progress = document.querySelector('[data-reading-progress]');
    const backToTop = document.querySelector('[data-back-to-top]');
    const drawer = document.querySelector('[data-mobile-drawer]');
    const backdrop = document.querySelector('.drawer-backdrop');
    const menuButton = document.querySelector('[data-menu-open]');

    const updateScrollUi = () => {
        const top = window.scrollY;
        const maximum = document.documentElement.scrollHeight - window.innerHeight;
        header?.classList.toggle('is-scrolled', top > 12);
        backToTop?.classList.toggle('is-visible', top > 500);
        if (progress) progress.style.transform = `scaleX(${maximum > 0 ? top / maximum : 0})`;
    };
    updateScrollUi();
    window.addEventListener('scroll', updateScrollUi, { passive: true });
    backToTop?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    const setMenu = (open) => {
        drawer?.classList.toggle('is-open', open);
        backdrop?.classList.toggle('is-open', open);
        drawer?.setAttribute('aria-hidden', open ? 'false' : 'true');
        menuButton?.setAttribute('aria-expanded', open ? 'true' : 'false');
        body.style.overflow = open ? 'hidden' : '';
    };
    menuButton?.addEventListener('click', () => setMenu(true));
    document.querySelectorAll('[data-menu-close]').forEach((element) => element.addEventListener('click', () => setMenu(false)));
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setMenu(false); });

    const quickDialog = document.querySelector('[data-quick-dialog]');
    const quickInput = document.querySelector('[data-quick-search]');
    document.querySelector('[data-quick-open]')?.addEventListener('click', () => {
        quickDialog?.showModal();
        window.setTimeout(() => quickInput?.focus(), 50);
    });
    quickInput?.addEventListener('input', () => {
        const query = quickInput.value.toLowerCase();
        document.querySelectorAll('[data-quick-item]').forEach((item) => {
            item.hidden = !item.textContent.toLowerCase().includes(query);
        });
    });

    const storedMode = localStorage.getItem('eyivo-color-mode');
    if (storedMode === 'dark') body.classList.add('mode-dark');
    document.querySelector('[data-color-mode]')?.addEventListener('click', () => {
        body.classList.toggle('mode-dark');
        localStorage.setItem('eyivo-color-mode', body.classList.contains('mode-dark') ? 'dark' : 'light');
    });

    document.querySelectorAll('[data-slider]').forEach((slider) => {
        const track = slider.querySelector('[data-slider-track]');
        slider.querySelector('[data-slider-prev]')?.addEventListener('click', () => track?.scrollBy({ left: -(track.clientWidth * .8), behavior: 'smooth' }));
        slider.querySelector('[data-slider-next]')?.addEventListener('click', () => track?.scrollBy({ left: track.clientWidth * .8, behavior: 'smooth' }));
    });

    document.querySelectorAll('[data-tabs]').forEach((tabs) => {
        const buttons = [...tabs.querySelectorAll('[data-tab-button]')];
        const panels = [...tabs.querySelectorAll('[data-tab-panel]')];
        const select = (id) => {
            buttons.forEach((button) => button.setAttribute('aria-selected', button.dataset.tabButton === id ? 'true' : 'false'));
            panels.forEach((panel) => { panel.hidden = panel.dataset.tabPanel !== id; });
        };
        buttons.forEach((button) => button.addEventListener('click', () => select(button.dataset.tabButton)));
        if (buttons[0]) select(buttons[0].dataset.tabButton);
    });

    document.querySelectorAll('[data-card-filter]').forEach((input) => input.addEventListener('input', () => {
        const query = input.value.toLowerCase();
        document.querySelectorAll('[data-filter-card]').forEach((card) => {
            card.hidden = !(card.dataset.filterText || card.textContent).toLowerCase().includes(query);
        });
    }));

    const consentKey = 'fp_consent_analytics';
    const consentBanner = document.querySelector('[data-consent-banner]');
    const accepted = localStorage.getItem(consentKey) === '1';
    const declined = localStorage.getItem(consentKey) === '0';
    const loadAnalytics = () => document.querySelectorAll('script[data-consent="analytics"]').forEach((element) => {
        if (element.dataset.loaded) return;
        element.dataset.loaded = 'true';
        if (element.dataset.analytics === 'ga4') {
            const script = document.createElement('script');
            script.async = true;
            script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(element.dataset.measurementId)}`;
            document.head.appendChild(script);
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push(['js', new Date()]);
            window.dataLayer.push(['config', element.dataset.measurementId]);
        }
        if (element.dataset.analytics === 'plausible') {
            const script = document.createElement('script');
            script.defer = true;
            script.dataset.domain = element.dataset.domain;
            script.src = 'https://plausible.io/js/script.js';
            document.head.appendChild(script);
        }
    });
    if (accepted) loadAnalytics();
    if (consentBanner && !accepted && !declined) consentBanner.hidden = false;
    consentBanner?.querySelector('[data-consent-accept]')?.addEventListener('click', () => { localStorage.setItem(consentKey, '1'); consentBanner.hidden = true; loadAnalytics(); });
    consentBanner?.querySelector('[data-consent-decline]')?.addEventListener('click', () => { localStorage.setItem(consentKey, '0'); consentBanner.hidden = true; });
})();
