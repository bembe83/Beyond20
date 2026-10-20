// Retrieve the selected native dice pack without depending on AboveVTT.
const resolveGoDiceSetId = (() => {
    let cached;
    let expires = 0;
    let pending;
    const normalize = value => typeof value === 'string' && value.trim() ? value.trim() : typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined;
    return async function () {
        const above = normalize(window.mydice?.data?.setId);
        if (above) return above;
        if (pending) return pending;
        if (Date.now() < expires) return cached;
        pending = (async () => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            try {
                const auth = await fetch('https://auth-service.dndbeyond.com/v1/cobalt-token', {
                    method:'POST', credentials:'include', signal:controller.signal
                });
                if (!auth.ok) throw new Error(`Dice authentication failed (HTTP ${auth.status}).`);
                const {token} = await auth.json();
                if (typeof token !== 'string' || !token) throw new Error('Dice authentication returned no token.');
                const response = await fetch('https://dice-service.dndbeyond.com/diceuserconfig/v1/get', {
                    headers:{Authorization:'Bearer ' + token}, signal:controller.signal
                });
                if (!response.ok) throw new Error(`Dice settings retrieval failed (HTTP ${response.status}).`);
                const body = await response.json();
                cached = normalize(body?.data?.setId);
                if (!cached) throw new Error('Dice settings returned no setId.');
                expires = Date.now() + 60000;
                return cached;
            } catch (_) {
                // Never log the authentication response or token. Publication
                // can proceed without setId; DDB then uses its default pack.
                cached = undefined;
                expires = Date.now() + 30000;
                console.warn('Beyond20 GoDice: selected dice set could not be retrieved; using D&D Beyond default.');
                return undefined;
            } finally { clearTimeout(timeout); }
        })();
        try { return await pending; }
        finally { pending = undefined; }
    };
})();
