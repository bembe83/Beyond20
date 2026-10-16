// Supplies physical dice values without replacing Beyond20 request/output handling.
class GoDice {
    static queue = Promise.resolve();
    static loading = null;
    constructor(name, rolls, request = {}) {
        this.name = name;
        this.rolls = rolls;
        this.request = request;
    }
    // Advantage must be chosen before Beyond20 creates its d20 branches.
    static async prepareD20Request(original) {
        if (original.godiceBonusPrepared) return original;
        const types = ['skill', 'ability', 'saving-throw', 'initiative', 'death-save'];
        const attack = ['attack', 'spell-attack'].includes(original.type) && original.rollAttack !== false && original['to-hit'] !== undefined;
        if (!attack && !types.includes(original.type)) return original;
        const request = {...original};
        const key = attack ? 'to-hit' : request.type === 'initiative' ? 'initiative' : 'modifier';
        const modifier = String(request[key] || '0');
        const choice = await this.request('bonus', {formula: '1d20' + (/^[+-]/.test(modifier) ? modifier : '+' + modifier), d20:true, advantage:request.advantage});
        const bonus = String(choice.bonus || '').replace(/\s+/g, '');
        if (bonus && !/^[+-]?(?:\d*d(?:4|6|8|10|12|20|100)|\d+)(?:[+-](?:\d*d(?:4|6|8|10|12|20|100)|\d+))*$/i.test(bonus)) throw new Error('Invalid bonus. Use +2 or +1d4.');
        request[key] = modifier + (bonus ? (/^[+-]/.test(bonus) ? bonus : '+' + bonus) : '');
        request.advantage = Number(choice.advdis) > 0 ? (choice.elven ? RollType.SUPER_ADVANTAGE : RollType.ADVANTAGE) : Number(choice.advdis) < 0 ? RollType.DISADVANTAGE : RollType.NORMAL;
        request.godiceBonusPrepared = true;
        return request;
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
    static async collect(dice) {
        const groups = dice.map(d => ({amount: d.amount, faces: d.faces}));
        if (!groups.length) return [];
        if (groups.some(g => ![4,6,8,10,12,20,100].includes(g.faces))) throw new Error('Unsupported GoDice die type.');
        const batches = await this.request('batch', {groups});
        if (!Array.isArray(batches) || batches.length !== groups.length) throw new Error('Incomplete GoDice results.');
        return batches.map((values, i) => {
            const {amount, faces} = groups[i];
            if (!Array.isArray(values) || values.length !== amount || values.some(v => !Number.isInteger(v) || v < 1 || v > faces))
                throw new Error('Invalid GoDice results.');
            return values.map(roll => ({roll}));
        });
    }
    roll() {
        const result = GoDice.queue.then(() => this.resolve());
        GoDice.queue = result.catch(() => {});
        return result;
    }
    async resolve() {
        if (!this.rolls.length) return;
        if (this.rolls.every(roll => roll.dice.length === 0)) {
            // Fixed damage needs neither a GoDice choice nor physical values.
            this.rolls.forEach(roll => roll.calculateTotal());
            if (this.rolls.some(roll => roll._roll_type === 'damage')) this.request.godiceDamageHandled = true;
            return;
        }
        const damageCustom = this.request.type === 'custom' && this.rolls.some(r => r.dice.length) && !this.rolls.some(r => r.dice.some(d => d.faces === 20));
        if (damageCustom && this.request.godiceNoteDamageType) this.rolls.forEach(roll => roll.setRollType('damage'));
        const damages = this.rolls.filter(r => r._roll_type === 'damage' || damageCustom);
        if (damages.length) {
            const rule = Number(dndbeyondDiceRoller._settings['critical-homebrew'] || 0);
            if (![CriticalRules.PHB, CriticalRules.HOMEBREW_MAX].includes(rule))
                throw new Error('GoDice supports Standard PHB and Perfect rolls critical rules. Reroll all damages is not supported.');
            const prepared = await GoDice.request('damage', {formulas: damages.map(r => r.formula), critType: rule === CriticalRules.HOMEBREW_MAX ? 1 : 0});
            if (!Array.isArray(prepared.formulas) || prepared.formulas.length !== damages.length) throw new Error('Invalid GoDice damage formulas.');
            this.request.godiceDamageHandled = true;
            damages.forEach((roll, i) => {
                const replacement = new DNDBRoll(prepared.formulas[i]);
                roll._parts = replacement.parts;
                roll._formula = replacement.formula;
            });
        }
        const otherRolls = this.rolls.filter(r => !damages.includes(r) && r.dice.length);
        if (otherRolls.length && !this.request.godiceBonusPrepared) {
            const choice = await GoDice.request('bonus', {
                formula: otherRolls[0].formula,
                d20: otherRolls.some(r => r.dice.some(d => d.faces === 20)),
                advantage: this.request.advantage,
                lockAdvantage: true
            });
            const bonus = String(choice.bonus || '').replace(/\s+/g, '');
            if (bonus && !/^[+-]?(?:\d*d(?:4|6|8|10|12|20|100)|\d+)(?:[+-](?:\d*d(?:4|6|8|10|12|20|100)|\d+))*$/i.test(bonus))
                throw new Error('Invalid bonus. Use +2 or +1d4.');
            if (bonus) for (const roll of otherRolls) {
                const replacement = new DNDBRoll(roll.formula + (/^[+-]/.test(bonus) ? bonus : '+' + bonus));
                roll._parts = replacement.parts;
                roll._formula = replacement.formula;
            }
        }
        const dice = this.rolls.flatMap(r => r.dice);
        const batches = await GoDice.collect(dice);
        for (let i = 0; i < dice.length; i++) {
            const die = dice[i];
            const reroll = die.rerollDice;
            die._rolls = batches[i];
            try {
                die.rerollDice = async amount => {
                    const [values] = await GoDice.collect([{amount, faces: die.faces}]);
                    die._rolls.push(...values);
                };
                await die.handleModifiers();
            } finally { die.rerollDice = reroll; }
        }
        this.rolls.forEach(r => r.calculateTotal());
    }
}
