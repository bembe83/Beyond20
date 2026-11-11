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
    let runtime = null;
    let lifecycle = Promise.resolve();
    let enabled = false;
    let generation = 0;
    let busy = null;
    const cancelled = () => Object.assign(new Error('GoDice roll cancelled.'), {code: 'GODICE_CANCELLED'});
    const configure = value => {
        enabled = value;
        if (!value) {
            generation++;
            busy = null;
            // destroy() aborts dialogs synchronously, even while mount() is pending.
            const current = runtime;
            runtime = null;
            const cleanup = current ? current.destroy() : Promise.resolve();
            lifecycle = Promise.all([lifecycle.catch(() => {}), cleanup]).then(() => {});
            return lifecycle;
        }
        const session = generation;
        lifecycle = lifecycle.catch(() => {}).then(async () => {
            if (!enabled || session !== generation) throw cancelled();
            if (!runtime) runtime = GoDiceLibrary.createGoDice({instanceId: 'beyond20'});
            await runtime.mount();
            if (!enabled || session !== generation) throw cancelled();
        });
        return lifecycle;
    };
    document.addEventListener('Beyond20_GoDiceRequest', async event => {
        let request;
        try { request = JSON.parse(event.detail); } catch (_) { return; }
        if (!request || typeof request.id !== 'string') return;
        const reply = {id: request.id};
        const token = {};
        try {
            guardAboveVttGoDiceRoller();
            if (request.action === 'configure') {
                await configure(!!request.enabled);
            } else {
                const session = generation;
                await lifecycle;
                if (!enabled || !runtime || session !== generation) throw cancelled();
                if (request.session !== undefined && request.session !== generation) throw cancelled();
                if (busy) throw new Error('Finish the current GoDice popup first.');
                busy = token;
                const current = runtime;
                if (request.action === 'publish') {
                    if (request.session === undefined)
                        throw new Error('GoDice integration was updated. Reload the Beyond20 extension and this character page before rolling again.');
                    if (request.session !== generation) throw cancelled();
                    if (!window.__beyond20PublishGoDice) throw new Error('D&D Beyond game log is not ready. Reload the character sheet.');
                    await window.__beyond20PublishGoDice({...request.rollInfo, godiceLogoUrl: current.logoUrl}, () => {
                        if (!enabled || session !== generation) throw cancelled();
                    });
                } else if (request.action === 'roll') {
                    if (typeof request.formula !== 'string' || request.formula.length > 2000 || ![0,1].includes(request.critType))
                        throw new Error('Invalid GoDice roll request.');
                    const result = await current.rollResult.rollDice(request.formula, request.critType);
                    if (!enabled || session !== generation) throw cancelled();
                    // Public result data only: result.context contains circular runtime references.
                    reply.value = {
                        notation: result.notation,
                        rolls: result.rolls.map(part => part && Array.isArray(part.rolls) ? {
                            type: part.type, value: part.value,
                            rolls: part.rolls.map(die => ({initialValue: die.initialValue, value: die.value}))
                        } : part),
                        total: result.total, output: result.output,
                        averageTotal: result.averageTotal, minTotal: result.minTotal, maxTotal: result.maxTotal
                    };
                } else if (request.action !== 'session') throw new Error('Unknown GoDice request.');
                reply.session = session;
            }
        } catch (error) { reply.error = error.message; reply.code = error.code; }
        finally { if (busy === token) busy = null; }
        document.dispatchEvent(new CustomEvent('Beyond20_GoDiceReply', {detail: JSON.stringify(reply)}));
    });
}

document.documentElement.dataset.beyond20GodiceReady = 'true';
