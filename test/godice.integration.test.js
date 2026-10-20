const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const bundle = fs.readFileSync('libs/godice-roller.bundle.js', 'utf8');
const start = bundle.indexOf('window.godice.prepareBeyond20Damage =');
const end = bundle.indexOf('window.godice.utils =', start);
let choice = {bonus:'', rolltype:0};
const context = vm.createContext({console, window:{godice:{}}, RollBonusPrompt: class {
    async showRollBonusPrompt() { return choice; }
}});
vm.runInContext(bundle.slice(start, end), context);
vm.runInContext(fs.readFileSync('src/common/dice.js','utf8') + '\n' + fs.readFileSync('src/dndbeyond/base/godice.js','utf8') + '\nthis.GoDiceAdapter = GoDice; this.Roll = DNDBRoll;', context);
context.CriticalRules = {PHB:0, HOMEBREW_MAX:1};
context.dndbeyondDiceRoller = {_settings:{'critical-homebrew':0}};
const prepare = context.window.godice.prepareBeyond20Damage;
const formulas = async (rule, options) => {
    choice = options;
    return Array.from((await prepare(['2d6+4'],rule)).formulas);
};
(async () => {
    assert.deepEqual(await formulas(0,{bonus:'',rolltype:0}), ['2d6+4']);
    assert.deepEqual(await formulas(0,{bonus:'',rolltype:1}), ['4d6+4']);
    assert.deepEqual(await formulas(1,{bonus:'',rolltype:1}), ['2d6+12+4']);
    assert.deepEqual(await formulas(0,{bonus:'+1d4',rolltype:1}), ['4d6+4+2d4']);
    await assert.rejects(() => formulas(0,{bonus:'invalid',rolltype:0}));
    const Adapter = context.GoDiceAdapter;
    let batches = 0;
    const actions = [];
    Adapter.request = async (action, payload) => {
        actions.push(action);
        if (action === 'damage') return prepare(payload.formulas, payload.critType);
        if (action === 'bonus') return {bonus:'+1d4'};
        batches++;
        return payload.groups.map(g => Array(g.amount).fill(g.faces));
    };
    choice = {bonus:'',rolltype:1};
    const damage = new context.Roll('2d6+4');
    damage.setRollType('damage');
    await new Adapter('Damage',[damage],{}).roll();
    assert.equal(damage.total,28);
    assert.equal(damage.dice[0].amount,4);
    assert.equal(batches,1);
    context.dndbeyondDiceRoller._settings['critical-homebrew'] = 1;
    const perfect = new context.Roll('2d6+4'); perfect.setRollType('damage');
    await new Adapter('Damage',[perfect],{}).roll();
    assert.equal(perfect.total,28);
    assert.equal(perfect.dice[0].amount,2);
    context.dndbeyondDiceRoller._settings['critical-homebrew'] = 4;
    await assert.rejects(() => new Adapter('Damage',[perfect],{}).roll(), /not supported/);
    const attack = new context.Roll('2d20kh1+5');
    attack.setRollType('to-hit');
    await new Adapter('Attack',[attack],{}).roll();
    assert.equal(attack.total,29);
    assert.deepEqual(actions.slice(-2), ['bonus','batch']);
    let finishBatch;
    Adapter.request = async action => action === 'bonus' ? {bonus:''} : new Promise(resolve => {finishBatch = resolve;});
    const waiting = new context.Roll('1d20+5');
    let completed = false;
    const pending = new Adapter('Attack',[waiting],{}).roll().then(() => {completed = true;});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(completed,false);
    finishBatch([[12]]);
    await pending;
    assert.equal(waiting.total,17);
    assert.equal(attack.dice[0].rolls.filter(r => !r.discarded).length,1);
    Adapter.request = async () => [[0]];
    await assert.rejects(() => Adapter.collect([{amount:1,faces:6}]), /Invalid/);
    // Verify settings normalization without needing a browser DOM.
    const settings = fs.readFileSync('src/common/settings.js','utf8');
    const normalize = settings.slice(settings.indexOf('function normalizeDiceSettings'), settings.indexOf('function setSettings'));
    vm.runInContext(normalize, context);
    const conflicting = {'use-godice':true,'use-digital-dice':true};
    context.normalizeDiceSettings(conflicting);
    assert.equal(conflicting['use-digital-dice'],false);
    const character = fs.readFileSync('src/dndbeyond/content-scripts/character.js','utf8');
    const handlers = {};
    const documentHandlers = {};
    const calls = [];
    const pane = {classList:{contains: name => name === 'b20-item-pane'}};
    const target = {textContent:'2d6+4', closest(selector) {
        if (selector.startsWith('.ct-combat-attack,')) return null;
        if (selector.startsWith('.b20-item-pane,')) return pane;
        if (selector.includes('.integrated-dice__container')) return this;
        return null;
    }};
    const routing = vm.createContext({console, settings:{'use-godice':true},
        ddbRollHijackInstalled:false, ddbHijackPointerHandled:null,
        window:{addEventListener:(name,fn) => {handlers[name] = fn;}},
        document:{documentElement:{dataset:{}},addEventListener:(name,fn)=>{documentHandlers[name]=fn;}},
        resetHijackQuickRollState() {}, execute:(pane,options) => calls.push({pane,options}),
        swallowRollEvent:event => {event.blocked = true;},
        handleCombatAttackIntegratedDie:()=>false, handleSpellIntegratedDie:()=>false,
        handleInitiativeIntegratedDie:()=>false, handleAbilityIntegratedDie:()=>false,
        handleSavingThrowIntegratedDie:()=>false, handleSkillIntegratedDie:()=>false
    });
    vm.runInContext(character.slice(character.indexOf('function getGoDiceNoteRollArgs'),character.indexOf('var settings = getDefaultSettings();')),routing);
    routing.installDDBRollHijack();
    for (const name of ['pointerdown','mousedown','pointerup','mouseup','click']) {
        const event = {button:0,target};
        handlers[name](event);
        assert.equal(event.blocked,true,name + ' must block native handlers');
    }
    assert.equal(calls.length,1);
    assert.equal(calls[0].pane,'b20-item-pane');
    assert.equal(calls[0].options.force_damages_only,true);
    const notesSent = [];
    const nativeNote = {closest:selector=>selector.startsWith('.ddb-note-roll') ? nativeNote : null,
        getAttribute:name=>({'data-exp':'2d6','data-mod':'+2','data-actiontype':'Fire','data-damage-type':'Fire'}[name] || null)};
    routing.document.querySelector = () => nativeNote;
    routing.character = {};
    routing.sendRoll = (...args)=>notesSent.push(args);
    documentHandlers.Beyond20_GoDiceIntent({detail:JSON.stringify({id:'note-test'})});
    assert.equal(notesSent.length,1);
    assert.equal(notesSent[0][1],'custom');
    assert.equal(notesSent[0][2],'2d6+2');
    assert.equal(notesSent[0][3].name,'2d6+2');
    assert.equal(notesSent[0][3].godiceNoteTitle,'2d6+2');
    assert.equal(notesSent[0][3].godiceNoteDamageType,'Fire');
    const constantControl = {textContent:'5',getAttribute:()=>null,querySelector:()=>null,
        closest:selector=>selector.startsWith('.ct-combat-attack__damage') ? constantControl : null};
    routing.document.querySelector=()=>constantControl;
    documentHandlers.Beyond20_GoDiceIntent({detail:JSON.stringify({id:'fixed-damage'})});
    assert.equal(notesSent[1][1],'attack');
    assert.equal(notesSent[1][2],'5');
    assert.equal(notesSent[1][3].rollAttack,false);
    assert.equal(notesSent[1][3].rollDamage,true);
    assert.equal(notesSent[1][3].damages[0],'5');


    assert.equal(routing.normalizeDDBDamageFormula('2d6+42d6+4'),'2d6+4');
    assert.equal(routing.normalizeDDBDamageFormula('2d6+4+2d6'),'2d6+4+2d6');
    context.RollType = {NORMAL:0, ADVANTAGE:3, DISADVANTAGE:4, SUPER_ADVANTAGE:6};
    Adapter.request = async () => ({bonus:'+1d4',advdis:1,elven:true});
    const original = {type:'attack',rollAttack:true,'to-hit':'+6',advantage:0};
    const preparedHit = await Adapter.prepareD20Request(original);
    assert.equal(preparedHit['to-hit'],'+6+1d4');
    assert.equal(preparedHit.advantage,6);
    assert.equal(original['to-hit'],'+6');
    assert.equal(await Adapter.prepareD20Request(preparedHit),preparedHit);
    const damageOnly = {type:'attack',rollAttack:false,rollDamage:true};
    assert.equal(await Adapter.prepareD20Request(damageOnly),damageOnly);
    // Exercise the actual outgoing broker boundary: no native publication,
    // completed physical results allowed, native behavior restored when off.
    const sent = [];
    const brokerContext = vm.createContext({console,
        window:{location:{pathname:'/characters/123'}},
        document:{documentElement:{dataset:{beyond20GodiceEnabled:'true'}}}
    });
    vm.runInContext(fs.readFileSync('src/dndbeyond/base/message-broker.js','utf8') + '\nthis.Broker = DDBMessageBroker;',brokerContext);
    const broker = new brokerContext.Broker();
    broker._mbDispatch = message => sent.push(message);
    for (const eventType of ['dice/roll/deferred','dice/roll/pending','dice/roll/fulfilled']) {
        broker._onDispatchMessage({eventType,data:{}});
    }
    assert.equal(sent.length,0);
    broker._onDispatchMessage({eventType:'dice/roll/fulfilled',data:{__b20Override__:true}});
    assert.equal(sent.length,1);
    broker._onDispatchMessage({eventType:'custom/beyond20/roll',data:{}});
    assert.equal(sent.length,2);
    brokerContext.document.documentElement.dataset.beyond20GodiceEnabled = 'false';
    broker._onDispatchMessage({eventType:'dice/roll/fulfilled',data:{}});
    assert.equal(sent.length,3);
    const pageHandlers = {};
    const intents = [];
    const pageDoc = {documentElement:{dataset:{beyond20GodiceEnabled:'true'}}, dispatchEvent:event => intents.push(event)};
    const pageContext = vm.createContext({console, document:pageDoc,
        crypto:{randomUUID:()=>'test-id'}, CustomEvent:class {constructor(type,init) {this.type=type;this.detail=init.detail;}},
        window:{addEventListener:(name,handler)=>{pageHandlers[name]=handler;}}
    });
    const bridge = fs.readFileSync('src/dndbeyond/page-scripts/godice.js','utf8');
    vm.runInContext(bridge.slice(0,bridge.indexOf('if (!window.__beyond20GoDiceBridge)')),pageContext);
    const pageTarget = {dataset:{},closest:()=>pageTarget};
    for (const type of ['pointerdown','mousedown','pointerup','mouseup','click']) {
        const event = {button:0,target:pageTarget, preventDefault(){this.prevented=true;},stopPropagation(){},stopImmediatePropagation(){this.blocked=true;}};
        pageHandlers[type](event);
        assert.equal(event.blocked,true,type + ' must not reach native page handlers');
    }
    assert.equal(intents.length,1,'one content-script intent per physical click');
    // An enclosing damage cell/whitespace must not initiate an extra roll.
    const background = {closest:selector => selector.includes('.ct-combat-attack__damage') ? {textContent:'2d6+4',dataset:{}} : null};
    pageHandlers.pointerdown({button:0,target:background,preventDefault(){throw new Error('Do not capture damage-cell whitespace');}});
    assert.equal(intents.length,1);
    const fixedTarget = {dataset:{},textContent:'5'};
    const fixedEventTarget = {closest:selector=>selector === '.ddbc-damage, .ct-damage' ? fixedTarget : null};
    for (const type of ['pointerdown','click']) pageHandlers[type]({button:0,target:fixedEventTarget,preventDefault(){},stopPropagation(){},stopImmediatePropagation(){}});
    assert.equal(intents.length,2);

    pageDoc.documentElement.dataset.beyond20GodiceEnabled='false';
    const native = {button:0,target:pageTarget,preventDefault(){throw new Error('Must allow native controls when disabled');}};
    pageHandlers.click(native);
    assert.equal(intents.length,2);
    context.dndbeyondDiceRoller._settings['critical-homebrew']=0;
    choice = {bonus:'',rolltype:1};
    const noteActions=[];
    Adapter.request = async (action,payload) => {
        noteActions.push(action);
        if (action === 'damage') return prepare(payload.formulas,payload.critType);
        return payload.groups.map(g => Array(g.amount).fill(3));
    };
    const note = new context.Roll('2d6');
    await new Adapter('Notes',[note],{type:'custom'}).roll();
    assert.deepEqual(noteActions,['damage','batch']);
    assert.equal(note.dice[0].amount,4);
    assert.equal(note.total,12);
    const replies = [];
    let requestListener;
    let published = 0;
    const bridgeContext = vm.createContext({console,
        window:{__beyond20GoDiceCapture:true,__beyond20PublishGoDice:async info => {published++;assert.equal(info.name,'Hit');}},
        document:{documentElement:{dataset:{}}, addEventListener:(name,listener)=>{requestListener=listener;},dispatchEvent:event=>replies.push(JSON.parse(event.detail))},
        CustomEvent:class {constructor(type,init) {this.type=type;this.detail=init.detail;}}
    });
    vm.runInContext(bridge,bridgeContext);
    await requestListener({detail:JSON.stringify({id:'publication',action:'publish',rollInfo:{name:'Hit'}})});
    assert.equal(published,1);
    assert.equal(replies[0].id,'publication');
    assert.equal(replies[0].error,undefined);
    delete bridgeContext.window.__beyond20PublishGoDice;
    await requestListener({detail:JSON.stringify({id:'missing',action:'publish',rollInfo:{name:'Hit'}})});
    assert.match(replies[1].error,/not ready/);
    const output = [];
    const displayContext = vm.createContext({console,
        dndbeyondDiceRoller:{_settings:{'use-godice':true}},
        chrome:{runtime:{sendMessage:()=>output.push('extension')}}
    });
    const diceSource = fs.readFileSync('src/dndbeyond/base/dice.js','utf8');
    vm.runInContext(diceSource.slice(0,diceSource.indexOf('class DNDBRoller')) + '\nthis.Displayer = DNDBDisplayer;',displayContext);
    const displayer = new displayContext.Displayer();
    displayer.postHTML = () => output.push('local');
    displayer.sendMessageToDOM = async () => {output.push('DOM');return {};};
    await displayer.sendMessage({},'Hit','result');
    assert.deepEqual(output,['local','DOM','extension']);
    // Reopen the result dialog without destroying Alertify's shared internals.
    const dialogCalls = [];
    const fakeDialog = {elements:{content:{firstElementChild:{}}},set(){throw new Error('GoDice must not install a destructive close callback');}};
    displayContext.DigitalDiceManager = {clearResults(){}};
    displayContext.alertify = {dialog(name) {
        assert.equal(name,'Beyond20GoDiceResult');
        this[name] = () => {dialogCalls.push(name);return fakeDialog;};
    }};
    displayContext.$ = () => ({find(){return this;},attr(){return this;},on(){return this;}});
    displayContext.chrome.runtime.getURL = path => path;
    const actualDisplayer = new displayContext.Displayer();
    actualDisplayer.postHTML({},'Hit','26',null,0,false,null,{},'',[],[],[],{},false);
    actualDisplayer.postHTML({},'Damage','12',null,0,false,null,{},'',[],[],[],{},false);
    assert.equal(dialogCalls.length,2);
    let fallbackCalled=false;
    displayContext.beyond20SendMessageFailure = () => {fallbackCalled=true;};
    displayContext.chrome.runtime.sendMessage = (request,callback)=>callback({error:'No VTT found that matches your settings.'});
    actualDisplayer.sendMessageToDOM = async () => ({});
    await actualDisplayer.sendMessage({},'Hit','26',null,0,false,null,{},'',[],[],[],{},false);
    assert.equal(fallbackCalled,false);
    const physicalDispatches=[];
    const localReceives=[];
    const physicalBroker = new brokerContext.Broker();
    physicalBroker._registered=true;
    physicalBroker._mb={gameId:'campaign',userId:'user',dispatch:()=>{throw new Error('Must bypass native pending-roll wrapper');}};
    brokerContext.uuidv4 = () => 'message-id';
    brokerContext.window.diceRoller={ddbDispatch:message=>physicalDispatches.push(message),ddbonmessage:event=>localReceives.push(JSON.parse(event.data))};
    const publishedMessage=physicalBroker.postMessage({eventType:'dice/roll/fulfilled',data:{__b20Override__:true},persist:true},{physical:true});
    assert.equal(physicalDispatches.length,1);
    assert.equal(localReceives.length,1);
    assert.equal(publishedMessage.id,localReceives[0].id);
    assert.equal(publishedMessage.messageTarget,'campaign');
    delete brokerContext.window.diceRoller;
    physicalBroker._mb.dispatch=message=>physicalDispatches.push(message);
    physicalBroker.postMessage({eventType:'dice/roll/fulfilled',data:{__b20Override__:true}},{physical:true});
    assert.equal(physicalDispatches.length,2,'standalone DDB still works without AboveVTT');
    let fixedRequests=0;
    Adapter.request = async () => {fixedRequests++;throw new Error('Fixed damage must not open a popup');};
    const fixed = new context.Roll('5');
    fixed.setRollType('damage');
    const fixedRequest = {type:'attack',rollAttack:false,rollDamage:true};
    await new Adapter('Unarmed Strike',[fixed],fixedRequest).roll();
    assert.equal(fixed.total,5);
    assert.equal(fixedRequests,0);
    assert.equal(fixedRequest.godiceDamageHandled,true);
    const adjustedFixed = new context.Roll('1+4');
    adjustedFixed.setRollType('damage');
    await new Adapter('Fixed damage',[adjustedFixed],{}).roll();
    assert.equal(adjustedFixed.total,5);
    assert.equal(fixedRequests,0);
    vm.runInContext(character.slice(character.indexOf('function getGoDiceWeaponDamage'),character.indexOf('function normalizeDDBDamageFormula')),routing);
    const primaryWeapon = {textContent:'2d6+4'};
    const rowWithNotes = {querySelector:selector => selector.includes('__label') ? {textContent:'Flame Tongue Greatsword'} : selector.includes('__damage .integrated-dice') ? primaryWeapon : {textContent:'2d6'}};
    const unusedSidebar = {find(){throw new Error('Do not select sidebar notes when the primary formula is displayed');}};
    routing.document.querySelectorAll = () => [rowWithNotes];
    assert.equal(routing.getGoDiceWeaponDamage('Flame Tongue Greatsword',unusedSidebar),'2d6+4');
    const rowWithoutNotes = {querySelector:selector => selector.includes('__label') ? {textContent:'Greatsword'} : selector.includes('__damage .integrated-dice') ? primaryWeapon : null};
    routing.document.querySelectorAll = () => [rowWithoutNotes];
    assert.equal(routing.getGoDiceWeaponDamage('Greatsword',unusedSidebar),'2d6+4');
    const sharedCards=[];
    const chatContext = vm.createContext({console,window:{
        PLAYER_NAME:'Geralt', PLAYER_ID:'123',
        godice:{godiceext:{godicelogo:'<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'}},
        MB:{inject_chat:async data=>sharedCards.push(data)}
    }});
    vm.runInContext(fs.readFileSync('src/dndbeyond/page-scripts/godice-chat.js','utf8'),chatContext);
    const brandedInfo = {name:'Sword <script>',rolls:[{type:'damage'}],request:{godice:true,godiceBrandedChat:true,character:{name:'Geralt'},whisper:0}};
    const brandedRolls = [{rollType:'Slashing',diceNotationStr:'2d6+4',result:{text:'3+2+4',total:9}}];
    assert.equal(await chatContext.publishGoDiceChatCard(brandedInfo,brandedRolls),true);
    assert.match(sharedCards[0].text,/Rolled with GoDice/);
    assert.match(sharedCards[0].text,/data:image\/svg\+xml/);
    assert.match(sharedCards[0].text,/Sword &lt;script&gt;/);
    assert.equal(sharedCards[0].result,9);
    assert.equal(sharedCards[0].whisper,'');
    brandedInfo.request.whisper=1;
    await chatContext.publishGoDiceChatCard(brandedInfo,brandedRolls);
    assert.equal(sharedCards[1].whisper,'Geralt');
    delete chatContext.window.PLAYER_NAME;
    assert.equal(await chatContext.publishGoDiceChatCard(brandedInfo,brandedRolls),false);
    brandedInfo.request.whisper=0;
    brandedInfo.request.godiceBrandedChat=false;
    assert.equal(await chatContext.publishGoDiceChatCard(brandedInfo,brandedRolls),false);
    brandedInfo.request.godiceBrandedChat=true;
    delete chatContext.window.MB;
    assert.equal(await chatContext.publishGoDiceChatCard(brandedInfo,brandedRolls),false);
    chatContext.window.MB={inject_chat:async data=>sharedCards.push(data)};
    chatContext.b20BuildDdbRollsForGameLog = ()=>brandedRolls;
    chatContext.messageBroker={register(){throw new Error('Do not duplicate an HTML card with a native dice message');}};
    const brokerPage = fs.readFileSync('src/dndbeyond/page-scripts/message-broker.js','utf8');
    vm.runInContext(brokerPage.slice(brokerPage.indexOf('    async function fulfilledRoll'),brokerPage.indexOf('    window.__beyond20PublishGoDice')),chatContext);
    await chatContext.fulfilledRoll(brandedInfo);
    assert.equal(sharedCards.length,3);
    brokerContext.document.documentElement.dataset.beyond20GodiceEnabled='true';
    const beforeInjected=sent.length;
    broker._onDispatchMessage({eventType:'dice/roll/pending',data:{injected_data:{beyond20GoDice:true}}});
    assert.equal(sent.length,beforeInjected+1,'allow only marked GoDice HTML-chat injection through native suppression');
    chatContext.resolveGoDiceSetId = async () => chatContext.window.mydice?.data?.setId;
    const nativeMessages=[];
    chatContext.messageBroker={register(){},_mb:{userId:'user'},getContext:()=>({messageScope:'gameId',messageTarget:'campaign'}),postMessage:message=>nativeMessages.push(message)};
    chatContext.normalizeActionName=name=>name;
    chatContext.uuidv4=()=>'native-message';
    chatContext.B20_OVERRIDE_MARKER='__b20Override__';
    chatContext.window.mydice={data:{setId:'06002'}};
    brandedInfo.request.godiceBrandedChat=false;
    await chatContext.fulfilledRoll(brandedInfo);
    assert.equal(nativeMessages[0].data.setId,'06002');
    assert.equal('imageUrl' in nativeMessages[0].data,false);
    delete chatContext.window.mydice;
    await chatContext.fulfilledRoll(brandedInfo);
    assert.equal('setId' in nativeMessages[1].data,false);
    let configCalls=0;
    let settingsNow=1000;
    const settingsWarnings=[];
    const settingsContext=vm.createContext({window:{mydice:{data:{setId:'06002'}}},
        console:{warn:message=>settingsWarnings.push(message)},
        Date:{now:()=>settingsNow},AbortController,setTimeout,clearTimeout,
        fetch:async (url,options)=>{
            configCalls++;
            if (url.includes('cobalt-token')) {
                assert.equal(options.method,'POST');assert.equal(options.credentials,'include');
                return {ok:true,json:async()=>({token:'test-session-token'})};
            }
            assert.equal(url,'https://dice-service.dndbeyond.com/diceuserconfig/v1/get');
            assert.equal(options.headers.Authorization,'Bearer test-session-token');
            return {ok:true,json:async()=>({data:{setId:'05001'}})};
        }
    });
    vm.runInContext(fs.readFileSync('src/dndbeyond/page-scripts/godice-dice-settings.js','utf8')+'\nthis.resolveSetId = resolveGoDiceSetId;',settingsContext);
    assert.equal(await settingsContext.resolveSetId(),'06002');
    assert.equal(configCalls,0);
    delete settingsContext.window.mydice;
    assert.deepEqual(await Promise.all([settingsContext.resolveSetId(),settingsContext.resolveSetId()]),['05001','05001']);
    assert.equal(configCalls,2,'one shared auth/config request for concurrent rolls');
    assert.equal(await settingsContext.resolveSetId(),'05001');
    assert.equal(configCalls,2,'cache avoids fetching on each roll');
    settingsContext.window.mydice={data:{setId:'07001'}};
    assert.equal(await settingsContext.resolveSetId(),'07001');
    delete settingsContext.window.mydice;
    settingsNow+=61000;
    settingsContext.fetch=async()=>{configCalls++;return {ok:false,status:403};};
    assert.equal(await settingsContext.resolveSetId(),undefined);
    assert.equal(configCalls,3);
    assert.equal(await settingsContext.resolveSetId(),undefined);
    assert.equal(configCalls,3,'failed requests have a short retry cooldown');
    assert.equal(settingsWarnings.length,1);
    assert.equal(settingsWarnings[0].includes('test-session-token'),false);
    console.log('PASS GoDice critical formulas, bonus dice, one damage batch, roll objects, advantage, unsupported rule, validation, settings');
})().catch(error => { console.error(error); process.exitCode = 1; });
