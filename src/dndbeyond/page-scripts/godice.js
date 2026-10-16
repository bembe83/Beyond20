// Capture native sheet controls in the same JavaScript world as React.
// Send one intent to the content script; never invoke the native dice handler.
if (!window.__beyond20GoDiceCapture) {
    window.__beyond20GoDiceCapture = true;
    let handledTarget = null;
    const selector = '.integrated-dice__container, .ct-beyond20-custom-roll, .ddb-note-roll, .avtt-roll-button, .avtt-roll-formula-button';
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'keydown']) {
        window.addEventListener(type, event => {
            if (document.documentElement.dataset.beyond20GodiceEnabled !== 'true') return;
            if (type === 'keydown' ? !['Enter',' '].includes(event.key) : event.button !== 0) return;
            let target = event.target.closest?.(selector);
            if (!target) {
                const fixed = event.target.closest?.('.ddbc-damage, .ct-damage');
                if (fixed && /^\d+(?:\.\d+)?$/.test(fixed.textContent.trim())) target = fixed;
            }
            if (!target) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            const dispatch = () => {
                const id = target.dataset.beyond20GodiceTarget || (target.dataset.beyond20GodiceTarget = crypto.randomUUID());
                document.dispatchEvent(new CustomEvent('Beyond20_GoDiceIntent', {detail: JSON.stringify({id})}));
            };
            if (type === 'pointerdown') { handledTarget = target; dispatch(); }
            else if (type === 'click') {
                if (handledTarget !== target) dispatch();
                handledTarget = null;
            } else if (type === 'keydown' && !event.repeat) dispatch();
        }, true);
    }
    document.documentElement.dataset.beyond20GodiceCaptureReady = 'true';
}

if (!window.__beyond20GoDiceBridge) {
    window.__beyond20GoDiceBridge = true;
    let busy = false;
    document.addEventListener('Beyond20_GoDiceRequest', async event => {
        let request;
        try { request = JSON.parse(event.detail); } catch (_) { return; }
        if (!request || typeof request.id !== 'string') return;
        const reply = {id: request.id};
        let acquired = false;
        try {
            if (window.__beyond20GoDiceConflict) throw new Error('Another GoDice integration is loaded. Disable it on this page and reload.');
            if (busy) throw new Error('Finish the current GoDice popup first.');
            busy = true;
            acquired = true;
            if (request.action === 'configure') {
                const bar = document.getElementById('dicebar');
                if (bar) bar.style.display = request.enabled ? '' : 'none';
            } else if (request.action === 'publish') {
                if (!window.__beyond20PublishGoDice) throw new Error('D&D Beyond game log is not ready. Reload the character sheet.');
                await window.__beyond20PublishGoDice(request.rollInfo);
            } else if (request.action === 'bonus') {
                reply.value = await window.godice.beyond20Bonus(request);
            } else if (request.action === 'damage') {
                reply.value = await window.godice.prepareBeyond20Damage(request.formulas, request.critType);
            } else if (request.action === 'batch') {
                if (!navigator.bluetooth) throw new Error('GoDice requires Chrome or Edge with Web Bluetooth.');
                const groups = request.groups;
                if (!Array.isArray(groups) || !groups.length || groups.length > 100 ||
                    groups.some(g => !Number.isInteger(g.amount) || g.amount < 1 || g.amount > 100 || ![4,6,8,10,12,20,100].includes(g.faces)) ||
                    groups.reduce((n,g) => n + g.amount, 0) > 100) throw new Error('Invalid GoDice batch.');
                reply.value = await window.godice.beyond20Batch(groups);
            } else throw new Error('Unknown GoDice request.');
        } catch (error) { reply.error = error.message; }
        finally { if (acquired) busy = false; }
        document.dispatchEvent(new CustomEvent('Beyond20_GoDiceReply', {detail: JSON.stringify(reply)}));
    });
}
document.documentElement.dataset.beyond20GodiceReady = 'true';
