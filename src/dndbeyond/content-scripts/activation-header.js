// Read only the activation setting before any Beyond20 page hooks are installed.
// Normal D&D Beyond pages keep their synchronous startup.
(function (startBeyond20) {
    if (!new URLSearchParams(window.location.search).getAll('abovevtt').includes('true')) {
        startBeyond20();
        return;
    }
    const startIfAllowed = settings => {
        if (settings?.['disable-on-abovevtt'] === false) startBeyond20();
    };
    chrome.storage.local.get('settings', items => {
        const settings = items?.settings || {};
        if (settings['migrated-sync-settings']) startIfAllowed(settings);
        else {
            // Match the existing local/sync migration order without writing storage.
            chrome.storage.sync.get('settings', synced => {
                startIfAllowed({...settings, ...synced?.settings});
            });
        }
    });
})(function () {
