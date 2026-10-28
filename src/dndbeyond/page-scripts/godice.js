// Capture native sheet controls in the same JavaScript world as React.
// Send one intent to the content script; never invoke the native dice handler.
function guardAboveVttGoDiceRoller() {
    const roller = window.diceRoller;
    if (typeof roller?.roll !== 'function' || roller.roll.__beyond20GoDiceGuard) return;
    const original = roller.roll;
    const guarded = function (...args) {
        if (document.documentElement.dataset.beyond20GodiceEnabled === 'true') return Promise.resolve(false);
        return original.apply(this, args);
    };
    guarded.__beyond20GoDiceGuard = true;
    roller.roll = guarded;
}

if (!window.__beyond20GoDiceCapture) {
    window.__beyond20GoDiceCapture = true;
    let handledTarget = null;
    const selector = '.integrated-dice__container, .ct-beyond20-custom-roll, .ddb-note-roll, .avtt-roll-button, .avtt-roll-formula-button';
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'keydown']) {
        window.addEventListener(type, event => {
            if (document.documentElement.dataset.beyond20GodiceEnabled !== 'true') return;
            guardAboveVttGoDiceRoller();
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
            guardAboveVttGoDiceRoller();
            // Recheck on each request in case AboveVTT was enabled after load.
            if (window.EXPERIMENTAL_SETTINGS?.godiceRoller === true || window.__beyond20GoDiceConflict) {
                const message = 'GoDice is enabled in AboveVTT. Disable the GoDice option in AboveVTT, then reload this character page to use Beyond20 GoDice.';
                if (!window.__beyond20GoDiceConflictPrompted && typeof window.alert === 'function') {
                    window.__beyond20GoDiceConflictPrompted = true;
                    window.alert(message);
                }
                throw new Error(message);
            }
            if (busy) throw new Error('Finish the current GoDice popup first.');
            busy = true;
            acquired = true;
            if (request.action === 'configure') {
                window.godice?.dicebar?.enable(!!request.enabled);
                const bar = document.getElementById('dicebar');
                if (bar) bar.style.display = request.enabled ? '' : 'none';
            } else if (request.action === 'publish') {
                if (!window.__beyond20PublishGoDice) throw new Error('D&D Beyond game log is not ready. Reload the character sheet.');
                await window.__beyond20PublishGoDice(request.rollInfo);
            } else if (request.action === 'roll') {
                if (typeof request.formula !== 'string' || request.formula.length > 2000 || ![0,1].includes(request.critType))
                    throw new Error('Invalid GoDice roll request.');
                if (typeof window.godice?.rollResult?.rollDice !== 'function')
                    throw new Error('GoDice library is not ready. Reload the character page.');
                reply.value = await window.godice.rollResult.rollDice(request.formula, request.critType);
            } else throw new Error('Unknown GoDice request.');
        } catch (error) { reply.error = error.message; }
        finally { if (acquired) busy = false; }
        document.dispatchEvent(new CustomEvent('Beyond20_GoDiceReply', {detail: JSON.stringify(reply)}));
    });
}
document.documentElement.dataset.beyond20GodiceReady = 'true';
