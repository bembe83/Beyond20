function buildGoDiceChatCard(rollInfo, rolls, logo) {
    const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const image = logo ? `<img width="36" height="36" alt="GoDice" src="${escape('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(logo))}" style="display:block!important;width:36px!important;height:36px!important;object-fit:contain;padding:3px;background:#fff;border-radius:6px;flex-shrink:0">` : '';
    const rows = rolls.map(roll => `<div style="display:block!important;padding:12px 0;border-bottom:1px solid #354b58">
        <div style="font-size:11px!important;font-weight:700!important;line-height:1.4!important;letter-spacing:.07em;text-transform:uppercase;color:#8edcf0;margin-bottom:5px">${escape(roll.rollType)}</div>
        <div style="display:flex!important;align-items:center;justify-content:space-between;gap:8px;width:100%;min-width:0">
            <span style="flex:1;min-width:0;overflow-wrap:anywhere;font-size:20px!important;font-weight:700!important;line-height:1.3!important;color:#f4f8fa">${escape(roll.result?.text)}</span>
            <span style="flex-shrink:0;font-size:18px!important;line-height:1!important;color:#90a9b9">=</span>
            <strong style="flex-shrink:0;font-size:34px!important;font-weight:800!important;line-height:1.1!important;color:#fff">${escape(roll.result?.total)}</strong>
        </div>
        <div style="font-size:13px!important;line-height:1.4!important;color:#a4bccb;margin-top:5px">${escape(roll.diceNotationStr)}</div>
    </div>`).join('');
    // Explicit inline sizes travel with the HTML to peers and take precedence
    // over the host game log's small-text rules. No fork-specific CSS needed.
    return `<div class="beyond20-godice-chat-card" style="display:block!important;width:100%;min-width:0;box-sizing:border-box;padding:12px;background:#101c24;color:#f4f8fa;border:1px solid #00a6d6;border-radius:10px;text-align:left;font-family:Arial,sans-serif;font-size:14px!important;line-height:1.4!important;white-space:normal">
        <div style="font-size:14px!important;font-weight:700!important;line-height:1.4!important;overflow-wrap:anywhere;color:#fff;padding-bottom:8px;border-bottom:2px solid #00a6d6">${escape(rollInfo.name || rollInfo.request?.name || 'Roll')}</div>
        ${rows}<div style="display:flex!important;align-items:center;gap:10px;margin-top:10px">${image}<span style="font-size:12px!important;font-weight:600!important;line-height:1.4!important;color:#c4d9e5">Rolled with GoDice</span></div>
    </div>`;
}

async function publishGoDiceChatCard(rollInfo, rolls) {
    if (!rollInfo.request?.godiceBrandedChat || typeof window.MB?.inject_chat !== 'function') return false;
    if (rollInfo.request.whisper === 1 && !window.PLAYER_NAME) return false; // Preserve private native delivery.
    const character = rollInfo.request.character || {};
    const logo = window.godice?.godiceext?.godicelogo || '';
    const damage = rolls.length > 0 && (rollInfo.rolls || []).every(roll => ['damage','critical-damage'].includes(roll.type));
    const data = {
        player: character.name || window.PLAYER_NAME || 'Character',
        img: character.avatar || window.PLAYER_IMG || '',
        playerId: character.id || window.PLAYER_ID,
        text: buildGoDiceChatCard(rollInfo, rolls, logo),
        whisper: rollInfo.request.whisper === 1 ? window.PLAYER_NAME : '',
        beyond20GoDice: true,
        rollTitle: rollInfo.name || rollInfo.request.name || 'Roll',
        ...(damage && rolls.length === 1 ? {rollType:'damage', result:rolls[0].result.total} : {})
    };
    // AboveVTT carries the HTML and embedded image in injected_data to peers.
    await window.MB.inject_chat(data);
    return true;
}
