/* One soundtrack per document lifetime. Reloading creates a fresh session. */
(() => {
    const scriptURL = document.currentScript.src;
    const trackURL = new URL('audio/kiseki.mp3', scriptURL).href;
    const introHTML = document.body.classList.contains('intro-page') ? document.body.innerHTML : null;
    const introTitle = document.title;
    let context, buffer, loading, source, button;
    let requested = false, started = false, finished = false, starting = false;
    let navigating = false, managedNavigation = false, cachedSubpage;
    let baseline = window.scrollY;
    const inSubpage = () => document.body.classList.contains('sub-page');
    const setState = state => { document.documentElement.dataset.bgmState = state; };
    setState('waiting-scroll');

    function controls() {
        if (!inSubpage()) return;
        if (!button || !button.isConnected) {
            button = document.createElement('button');
            button.type = 'button';
            button.className = 'bgm-control';
            button.addEventListener('click', () => {
                if (started) finish();
                else { unlock(); start(); }
            });
            document.body.append(button);
        }
        button.hidden = finished || !requested;
        button.textContent = started ? '음악 끄기' : '음악 재생';
        button.setAttribute('aria-label', started ? '배경음악 끄기' : '배경음악 재생');
    }

    function ensureContext() {
        if (!context) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return null;
            context = new AudioContext();
            context.addEventListener('statechange', () => {
                if (requested && !started && !finished) start();
            });
        }
        return context;
    }

    function loadTrack() {
        if (buffer) return Promise.resolve(buffer);
        if (!loading) {
            loading = fetch(trackURL)
                .then(response => {
                    if (!response.ok) throw new Error('Music download failed');
                    return response.arrayBuffer();
                })
                .then(data => ensureContext().decodeAudioData(data))
                .then(decoded => {
                    buffer = decoded;
                    document.documentElement.dataset.bgmDuration = String(decoded.duration);
                    return decoded;
                })
                .catch(error => { loading = null; throw error; });
        }
        return loading;
    }

    // Called synchronously from the existing entry tap, before fetching sub.html.
    // Keeping this document alive preserves that user activation on mobile Safari.
    function unlock() {
        if (finished) return;
        const audioContext = ensureContext();
        if (!audioContext || audioContext.state === 'closed') return;
        if (audioContext.state !== 'running') {
            audioContext.resume().then(() => { if (requested) start(); }).catch(() => {
                if (requested) { setState('blocked'); controls(); }
            });
        }
        // A silent, one-sample source unlocks older iOS audio without playing the song.
        const silence = audioContext.createBufferSource();
        silence.buffer = audioContext.createBuffer(1, 1, audioContext.sampleRate);
        silence.connect(audioContext.destination);
        silence.start();
        loadTrack().then(() => { if (requested) start(); }).catch(() => {
            if (requested) { setState('unavailable'); controls(); }
        });
    }

    async function start() {
        if (!requested || started || finished || starting || !inSubpage()) return;
        const audioContext = ensureContext();
        if (!audioContext || audioContext.state !== 'running') {
            setState('blocked'); controls(); return;
        }
        starting = true;
        setState('loading');
        try {
            const track = await loadTrack();
            if (finished || started || !inSubpage()) return;
            if (audioContext.state !== 'running') { setState('blocked'); return; }
            source = audioContext.createBufferSource();
            source.buffer = track;
            source.loop = false;
            const volume = audioContext.createGain();
            volume.gain.value = 0.5;
            source.connect(volume).connect(audioContext.destination);
            source.addEventListener('ended', finish, { once: true });
            source.start();
            started = true;
            setState('playing');
        } catch (_) {
            setState('unavailable');
        } finally {
            starting = false;
            controls();
        }
    }

    function finish() {
        if (finished) return;
        finished = true;
        const playingSource = source;
        source = null;
        if (playingSource) { try { playingSource.stop(); } catch (_) {} }
        buffer = null;
        loading = null;
        setState('ended');
        controls();
        if (context && context.state !== 'closed') context.close().catch(() => {});
    }

    function firstScroll() {
        if (!inSubpage() || requested || finished || window.scrollY === baseline) return;
        requested = true;
        controls();
        start();
    }
    window.addEventListener('scroll', firstScroll, { passive: true });
    // Also supports opening sub.html directly. A blocked scroll waits for a real tap.
    ['pointerdown', 'touchend', 'keydown'].forEach(event => {
        document.addEventListener(event, input => {
            if (input.target?.closest?.('.bgm-control')) return;
            if (!inSubpage() || finished || started) return;
            unlock();
            if (requested) start();
        }, { passive: true });
    });

    function addStyles(doc, url) {
        return Promise.all([...doc.querySelectorAll('link[rel="stylesheet"]')].map(link => {
            const href = new URL(link.getAttribute('href'), url).href;
            if ([...document.querySelectorAll('link[rel="stylesheet"]')].some(existing => existing.href === href)) return;
            return new Promise(resolve => {
                const stylesheet = document.createElement('link');
                stylesheet.rel = 'stylesheet';
                stylesheet.href = href;
                stylesheet.onload = stylesheet.onerror = resolve;
                document.head.append(stylesheet);
            });
        }));
    }
    function addScript(src) {
        if ([...document.scripts].some(existing => existing.src === src)) return Promise.resolve();
        return new Promise(resolve => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = script.onerror = resolve;
            document.head.append(script);
        });
    }

    async function showSubpage(html, url, push) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        if (!doc.querySelector('body.sub-page main.site')) throw new Error('Invalid subpage');
        const styles = addStyles(doc, url);
        doc.querySelectorAll('script').forEach(script => script.remove());
        document.querySelector('video')?.pause();
        document.documentElement.classList.remove('aos-ready');
        document.body.className = doc.body.className;
        document.body.replaceChildren(...doc.body.childNodes);
        document.title = doc.title;
        if (push) history.pushState({ musicView: 'sub' }, '', url);
        window.scrollTo(0, 0);
        baseline = 0;
        controls();
        if (requested && !finished) start();
        await styles;
        if (!window.AOS) await addScript('https://unpkg.com/aos@2.3.1/dist/aos.js');
        await addScript(new URL('responsive.js', url).href);
        if (window.AOS && !document.documentElement.classList.contains('aos-ready')) {
            document.documentElement.classList.add('aos-ready');
            AOS.init();
        }
        window.AOS?.refreshHard();
    }

    function bindEntry() {
        const entry = document.querySelector('.bt_01 a');
        if (!entry || !introHTML) return;
        entry.addEventListener('click', async event => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            if (navigating) return;
            navigating = true;
            const url = entry.href;
            unlock();
            try {
                if (!cachedSubpage) {
                    const response = await fetch(url);
                    if (!response.ok) throw new Error('Subpage download failed');
                    cachedSubpage = await response.text();
                }
                managedNavigation = true;
                await showSubpage(cachedSubpage, url, true);
            } catch (_) {
                // Native navigation still works if the enhanced transition is unavailable.
                window.location.assign(url);
            } finally { navigating = false; }
        });
    }
    window.addEventListener('popstate', () => {
        if (!managedNavigation) return;
        if (history.state?.musicView === 'sub') {
            showSubpage(cachedSubpage, location.href, false);
        } else {
            if (started && !finished) finish();
            document.documentElement.classList.remove('aos-ready');
            document.body.className = 'intro-page';
            document.body.innerHTML = introHTML;
            document.title = introTitle;
            window.scrollTo(0, 0);
            baseline = 0;
            bindEntry();
        }
    });
    bindEntry();
    if (inSubpage()) controls();
})();
