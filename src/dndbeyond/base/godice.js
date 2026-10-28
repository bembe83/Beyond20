// Supplies physical dice values without replacing Beyond20 request/output handling.
class GoDice {
    static queue = Promise.resolve();
    static loading = null;
    constructor(name, rolls, request = {}) {
        this.name = name;
        this.rolls = rolls;
        this.request = request;
    }
    static load() {
        if (!this.loading) this.loading = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = chrome.runtime.getURL('dist/godice_page.js');
            script.onload = () => {
                script.remove();
                if (document.documentElement.dataset.beyond20GodiceReady === 'true') resolve();
                else { this.loading = null; reject(new Error('GoDice initialization failed. Reload the character sheet.')); }
            };
            script.onerror = () => { script.remove(); this.loading = null; reject(new Error('Could not load GoDice.')); };
            (document.head || document.documentElement).appendChild(script);
        });
        return this.loading;
    }
    static async request(action, payload) {
        await this.load();
        const id = crypto.randomUUID();
        return new Promise((resolve, reject) => {
            const listener = event => {
                let reply;
                try { reply = JSON.parse(event.detail); } catch (_) { return; }
                if (reply.id !== id) return;
                document.removeEventListener('Beyond20_GoDiceReply', listener);
                reply.error ? reject(new Error(reply.error)) : resolve(reply.value);
            };
            document.addEventListener('Beyond20_GoDiceReply', listener);
            document.dispatchEvent(new CustomEvent('Beyond20_GoDiceRequest', {detail: JSON.stringify({id, action, ...payload})}));
        });
    }
    roll() {
        const result = GoDice.queue.then(() => this.resolve());
        GoDice.queue = result.catch(() => {});
        return result;
    }
    static libraryModifier(die) {
        const keep = die._modifiers.match(/k[hl](\d*)/);
        return keep && Number(keep[1] || 1) <= 9 ? keep[0] : '';
    }
    static libraryFormula(roll) {
        return roll.parts.map(part => {
            if (typeof part === 'number' && !Number.isInteger(part))
                throw new Error('The GoDice library does not support fractional constants in dice formulas.');
            if (!(part instanceof DNDBDice)) return String(part);
            if (part.amount > 100 || ![4,6,8,10,12,20,100].includes(part.faces))
                throw new Error('Unsupported GoDice dice request.');
            return part.amount + 'd' + part.faces + GoDice.libraryModifier(part);
        }).join('').replace(/\s+/g, '');
    }
    static fromResult(result, original = null) {
        if (!result || typeof result.notation !== 'string' || !Array.isArray(result.rolls))
            throw new Error('Invalid GoDice roll result.');
        const parsed = new DNDBRoll(result.notation);
        const groups = result.rolls.filter(part => part && Array.isArray(part.rolls));
        // The library has already handled its bonus, advantage and critical
        // choices. Restore only suffixes its parser cannot understand.
        let index = 0;
        const formula = parsed.parts.map(part => {
            if (!(part instanceof DNDBDice)) return String(part);
            const source = original?.dice[index++];
            if (source && source.faces !== part.faces) throw new Error('GoDice changed the original dice order.');
            const extra = source ? source._modifiers.replace(GoDice.libraryModifier(source), '') : '';
            return part.formula + extra;
        }).join(' ');
        const replacement = new DNDBRoll(formula);
        if (replacement.dice.length !== groups.length || original && replacement.dice.length < original.dice.length)
            throw new Error('Incomplete GoDice results.');
        replacement.dice.forEach((die, position) => {
            const values = groups[position].rolls.map(value => value.initialValue ?? value.value);
            if (values.length !== die.amount || die.amount > 100 || values.some(value =>
                !Number.isInteger(value) || value < 1 || value > die.faces)) throw new Error('Invalid GoDice results.');
            // Apply Beyond20's modifier flags once, using the original values.
            die._rolls = values.map(roll => ({roll}));
        });
        return replacement;
    }
    async resolve() {
        const damageCustom = this.request.type === 'custom' && !this.rolls.some(roll => roll.dice.some(die => die.faces === 20));
        const d20Rolls = this.rolls.filter(roll => roll._roll_type !== 'damage' && roll.dice.some(die => die.faces === 20));
        for (const roll of this.rolls) {
            const damage = roll._roll_type === 'damage' || damageCustom;
            if (damageCustom && this.request.godiceNoteDamageType) roll.setRollType('damage');
            if (damage) this.request.godiceDamageHandled = true;
            if (!roll.dice.length) { roll.calculateTotal(); continue; }
            const rule = Number(dndbeyondDiceRoller._settings['critical-homebrew'] || 0);
            if (damage && ![CriticalRules.PHB, CriticalRules.HOMEBREW_MAX].includes(rule))
                throw new Error('GoDice supports Standard PHB and Perfect rolls critical rules. Reroll all damages is not supported.');
            const result = await GoDice.request('roll', {
                formula:GoDice.libraryFormula(roll), critType:damage && rule === CriticalRules.HOMEBREW_MAX ? 1 : 0
            });
            const replacement = GoDice.fromResult(result, roll);
            // Keep Beyond20's modifier semantics, including one-time rerolls.
            // Reroll values use the same public API and its normal prompts.
            for (const die of replacement.dice) {
                const reroll = die.rerollDice;
                try {
                    die.rerollDice = async amount => {
                        const extra = GoDice.fromResult(await GoDice.request('roll', {
                            formula:amount + 'd' + die.faces, critType:0
                        }));
                        if (extra.formula.replace(/\s+/g, '') !== amount + 'd' + die.faces)
                            throw new Error('Keep the original formula in the GoDice reroll prompt, without bonuses or critical damage.');
                        die._rolls.push(...extra.dice[0].rolls);
                    };
                    await die.handleModifiers();
                } finally { die.rerollDice = reroll; }
            }
            roll._parts = replacement.parts;
            roll._formula = replacement.formula;
            roll.calculateTotal();
            if (d20Rolls.length === 1 && d20Rolls[0] === roll) {
                const d20 = roll.dice.find(die => die.faces === 20);
                this.request.advantage = /kh/.test(d20._modifiers) ? (d20.amount === 3 ? 6 : 3)
                    : /kl/.test(d20._modifiers) ? (d20.amount === 3 ? 7 : 4) : 0;
            }
        }
    }
}
