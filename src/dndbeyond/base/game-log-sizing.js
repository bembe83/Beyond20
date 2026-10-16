// Fit long native game-log breakdowns in at most three 2px steps.
(function installGoDiceBreakdownSizing() {
    const selector = '[class*="-Line-Breakdown"] span';
    const originals = new WeakMap();
    const observed = new WeakSet();
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return;
    let queued = false;
    const schedule = () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(fit);
    };
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    function fit() {
        queued = false;
        const enabled = document.documentElement.dataset.beyond20GodiceEnabled === 'true';
        for (const span of document.querySelectorAll(selector)) {
            const line = span.closest('[class*="-Line-Breakdown"]');
            if (resize && !observed.has(line)) { resize.observe(line); observed.add(line); }
            if (!originals.has(span)) originals.set(span, {
                value:span.style.getPropertyValue('font-size'), priority:span.style.getPropertyPriority('font-size')
            });
            const original = originals.get(span);
            if (original.value) span.style.setProperty('font-size', original.value, original.priority);
            else span.style.removeProperty('font-size');
            if (!enabled || !span.textContent.trim()) continue;
            const rect = span.getBoundingClientRect();
            const lineRect = line.getBoundingClientRect();
            const available = Math.min(lineRect.width, lineRect.right - rect.left);
            if (available <= 0) continue;
            const style = getComputedStyle(span);
            const base = parseFloat(style.fontSize);
            if (!Number.isFinite(base)) continue;
            let size = base;
            const text = span.textContent.trim();
            for (let step = 0; step <= 3; step++) {
                size = Math.max(Math.min(base, 12), base - step * 2);
                context.font = `${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`;
                const spacing = parseFloat(style.letterSpacing) || 0;
                if (context.measureText(text).width + Math.max(0, text.length - 1) * spacing <= available) break;
            }
            if (size < base) span.style.setProperty('font-size', `${size}px`, 'important');
            // Full breakdown remains available if the three-step limit is reached.
            if (!span.hasAttribute('title')) span.setAttribute('title', text);
        }
    }
    new MutationObserver(schedule).observe(document.documentElement, {subtree:true,childList:true,characterData:true});
    new MutationObserver(schedule).observe(document.documentElement, {attributes:true,attributeFilter:['data-beyond20-godice-enabled']});
    window.addEventListener('resize', schedule);
    schedule();
})();
