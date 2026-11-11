const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const header = fs.readFileSync('src/dndbeyond/content-scripts/activation-header.js', 'utf8');
const footer = fs.readFileSync('src/dndbeyond/content-scripts/activation-footer.js', 'utf8');

function check(search, local, sync, expected, expectedReads) {
    let starts = 0;
    const reads = [];
    const pending = [];
    const storage = (name, settings) => ({get(key, callback) {
        assert.equal(key, 'settings');
        reads.push(name);
        pending.push(() => callback({settings}));
    }});
    vm.runInNewContext(header + '\nstart();\n' + footer, {
        URLSearchParams, window: {location: {search}}, start: () => starts++,
        chrome: {storage: {local: storage('local', local), sync: storage('sync', sync)}}
    });
    if (new URLSearchParams(search).getAll('abovevtt').includes('true')) assert.equal(starts, 0, 'no features start before the setting is read');
    while (pending.length) pending.shift()();
    assert.equal(starts, expected, search);
    assert.deepEqual(reads, expectedReads);
}
check('', {}, {}, 1, []);
check('?abovevtt=false', {}, {}, 1, []);
check('?other=abovevtt=true', {}, {}, 1, []);
check('?abovevtt=true', undefined, undefined, 0, ['local', 'sync']);
check('?foo=1&abovevtt=true', {'migrated-sync-settings':true}, {}, 0, ['local']);
check('?abovevtt=true&foo=1', {'migrated-sync-settings':true, 'disable-on-abovevtt':false}, {}, 1, ['local']);
check('?abovevtt=true', {'disable-on-abovevtt':true}, {'disable-on-abovevtt':false}, 1, ['local', 'sync']);
check('?abovevtt=false&abovevtt=true', {'migrated-sync-settings':true}, {}, 0, ['local']);
console.log('PASS AboveVTT page activation: default block, explicit opt-in, ordinary pages, and storage migration');
