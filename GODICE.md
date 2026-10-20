# GoDice in Beyond20

Enable **Use GoDice physical dice** in Beyond20 settings. This switches off
D&D Beyond Digital Dice; enabling Digital Dice switches GoDice off.
Reload the extension and character sheet after installing a build.
Use Chrome or Edge and connect your dice through the GoDice bar.

Beyond20 still builds requests, handles advantage and hit critical thresholds,
calculates dice modifiers, and renders/sends the results. GoDice supplies values.
Attack rolls show GoDice's bonus, advantage/disadvantage, and Elven Accuracy choices before Beyond20 creates its dice rolls. The choice starts from Beyond20's configured advantage mode.

Primary weapon damage is read from the matching weapon's combat Damage column,
including its flat modifier. The Notes column is not used as primary damage.
Sidebar additional damage retains Beyond20's existing handling, and notes
formulas can also be rolled independently.

For damage, including clickable non-d20 formulas in notes, choose **Roll** or **Critical Hit** in the GoDice bonus popup.
The next dice popup collects normal damage and critical additions together.
The hit result does not force this selection. Bonus dice entered in this popup
are part of the damage formula before the critical rule is applied.

Fixed damage such as Unarmed Strike is calculated and published directly, without
a GoDice popup. It does not acquire additional critical dice.

Supported Beyond20 critical rules:
- Standard PHB: double the number of damage dice, keeping flat modifiers once.
- Perfect rolls: roll normal damage dice and add their maximum value.

**Reroll all damages** is unsupported and produces an error. Doubling the final
damage can be performed manually by the master in AboveVTT.
Dice modifiers that require actual rerolls can request another dice popup.

Completed rolls also display in the local Beyond20 result window.
The native D&D Beyond dice canvas is hidden while GoDice is selected, including
without AboveVTT. Switching GoDice off restores its normal visibility.
This suppresses the visual animation; it does not change D&D Beyond's saved dice settings.
Enable **Send rolls to the D&D Beyond Game Log** to publish physical results
for AboveVTT. Whispered results are published to self.
An existing GoDice integration in the page must be disabled before using this one.

## Validation

Run `npm test` and `npm run build`.
For browser validation, try a hit (including advantage and a critical threshold),
then normal and critical `2d6+4` damage with each supported critical rule.
Verify one damage dice popup, the displayed breakdown, and one native damage
entry in the game log/AboveVTT. Also verify both settings switches and a whisper.
Native outgoing D&D Beyond dice messages are suppressed while GoDice is selected; incoming rolls from other players are unaffected. Bluetooth and live D&D Beyond/AboveVTT delivery require this browser check.

## Experimental shared GoDice branding

Enable **Use GoDice branded AboveVTT chat cards** next to the GoDice toggle in Beyond20's settings.
When AboveVTT's HTML chat is available, results use a custom card containing an
embedded GoDice logo and **Rolled with GoDice**. Receiving players need AboveVTT
but do not need this Beyond20 fork. The native dice-pack preview is replaced by
this card. Without AboveVTT, native D&D Beyond publication remains in use.
AboveVTT replaces the live game-log entry with the HTML card. Refreshing the
page can restore D&D Beyond's underlying placeholder/default entry; custom-card
persistence is not provided by this integration.
Disable the setting to return to native cards. Verify delivery with another
player's AboveVTT client; embedded-image rendering has not been browser-tested.

## Native dice-pack selection

Native messages first use AboveVTT's `window.mydice.data.setId` when available.
Otherwise Beyond20 requests the logged-in user's dice configuration directly
from D&D Beyond. Successful lookups are cached for 60 seconds and concurrent
lookups share one request. Failed lookups wait 30 seconds before retrying and
fall back to D&D Beyond's default pack, without preventing roll publication.
The fallback does not store or log the authentication token.
