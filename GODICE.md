# GoDice in Beyond20

Enable **Use GoDice physical dice** in Beyond20 settings. This switches off
D&D Beyond Digital Dice; enabling Digital Dice switches GoDice off.
Reload the extension and character sheet after installing a build.
Use Chrome or Edge and connect your dice through the GoDice bar.

Beyond20 builds the roll objects and calls GoDice's normal `rollResult.rollDice()`
for each roll. GoDice handles its bonus/critical choices and generates random
fallback values. Enter or physically roll any dice you want to replace; blank
fields keep their generated values. Beyond20 copies the returned formula and
dice values into the existing roll object, then applies its modifiers, critical
thresholds, totals, and normal output handling.
Advantage/disadvantage and Elven Accuracy are selected in the GoDice prompt.
The public two-argument API has no option for preselecting Beyond20's mode.
These choices use one compound dice roll;
Beyond20's separate Roll Twice/Thrice modes still produce independent rolls.
Multiple damage components remain independent and each uses the library's
normal popup sequence. The separate bonus-preparation/strict-batch adapter is
no longer used.

Primary weapon damage is read from the matching weapon's combat Damage column,
including its flat modifier. The Notes column is not used as primary damage.
Conditional item damage shown in Notes (for example Flame Tongue's fire dice)
is excluded from the weapon's GoDice damage roll. Click its Notes formula to
roll it separately, allowing the DM to apply resistance or immunity by type.
Without GoDice, Beyond20's existing additional-damage handling is unchanged.

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
Dice modifiers that require actual rerolls request another normal GoDice call,
including its bonus prompt. Keep that reroll formula unchanged, without adding
bonuses or critical damage. Beyond20 restores and applies reroll/minimum/drop
suffixes outside the library; they are not passed to its formula parser.
Fractional constants in dice formulas are rejected because the library's parser
does not support them. Fixed numeric rolls are still calculated by Beyond20.

Completed rolls also display in the local Beyond20 result window.
The native D&D Beyond dice canvas is hidden while GoDice is selected, including
without AboveVTT. Switching GoDice off restores its normal visibility.
This suppresses the visual animation; it does not change D&D Beyond's saved dice settings.
Enable **Send rolls to the D&D Beyond Game Log** to publish physical results
for AboveVTT. Whispered results are published to self.
Page ownership is controlled by **Disable Beyond20 on AboveVTT pages**.

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

The library bundle is used unchanged. Beyond20 creates a private runtime with
`GoDiceLibrary.createGoDice({instanceId: 'beyond20'})` and awaits `mount()`.
Its bar, popups, styles, settings, and devices belong to that runtime, with UI
inside its shadow root. Beyond20 does not assign or use `window.godice`.
Disabling GoDice cancels open dialogs and awaits `destroy()`; re-enabling waits
for cleanup before creating a fresh runtime. Cancelled rolls produce no result
card or game-log publication. Only plain result data crosses the page bridge;
the circular runtime context stays private. Branded cards use the runtime's
embedded `logoUrl` directly.

Saved devices use `godice:beyond20:v1:devices`. The library does not import the
old shared cookie, so previously paired dice may need to be connected again.
An inactive AboveVTT runtime may coexist on the page, but physical devices must
be owned by one active integration at a time.
Blank dice inputs accept the library's generated fallback. Beyond20 validates
returned values before publishing. While Beyond20 GoDice is selected, AboveVTT's roller on the same
character page is prevented from starting a competing automatic roll. Disabling
Beyond20 GoDice restores that roller's normal behavior.
Beyond20 does not block its isolated runtime based on AboveVTT's GoDice setting.
The AboveVTT URL activation switch controls which integration runs on a page.


Native messages first use AboveVTT's `window.mydice.data.setId` when available.
Otherwise Beyond20 requests the logged-in user's dice configuration directly
from D&D Beyond. Successful lookups are cached for 60 seconds and concurrent
lookups share one request. Failed lookups wait 30 seconds before retrying and
fall back to D&D Beyond's default pack, without preventing roll publication.
The fallback does not store or log the authentication token.

## AboveVTT page ownership

**Disable Beyond20 on AboveVTT pages** is enabled by default in extension settings.
On D&D Beyond URLs containing `abovevtt=true`, Beyond20 does not initialize its
page features, including GoDice, roll interception, UI observers, and message
broker injection. Ordinary character pages continue to work normally. Disable
this switch to use Beyond20 on those pages again. Refresh affected pages after
changing it; the switch does not unload features already running in a tab.
