/* Layout is CSS-only. Refresh the existing AOS effects after geometry settles. */
(() => {
    if (!window.AOS) return;
    try {
        document.documentElement.classList.add('aos-ready');
        AOS.init();
    } catch (error) {
        document.documentElement.classList.remove('aos-ready');
        return;
    }
    let frame;
    const refresh = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => AOS.refresh());
    };
    window.addEventListener('load', refresh);
    window.addEventListener('resize', refresh, { passive: true });
    window.addEventListener('orientationchange', refresh, { passive: true });
    document.fonts?.ready.then(refresh);
    document.fonts?.addEventListener('loadingdone', refresh);
    document.querySelectorAll('img').forEach(image => {
        if (!image.complete) image.addEventListener('load', refresh, { once: true });
    });
    if ('ResizeObserver' in window) {
        const site = document.querySelector('.site');
        if (site) new ResizeObserver(refresh).observe(site);
    }
})();
