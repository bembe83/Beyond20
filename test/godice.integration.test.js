const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const bundle = fs.readFileSync('libs/godice-roller.bundle.js', 'utf8');
let choice = {bonus:'', rolltype:0, advdis:0, elven:false};
let entered = [];
let dicePrompts = [];
const math = Object.create(Math);
math.random = () => 0.5;
const context = vm.createContext({console:{...console,debug(){}}, Math:math, window:{godice:{}},
    TestRollBonusPrompt:class {async showRollBonusPrompt() { return choice; }},
    TestDiceRollPrompt:class {async showDicePrompt(formula, prompts) {
        dicePrompts.push({formula,prompts});
        return prompts.map(prompt=>({name:prompt.name+'-'+prompt.index,
            valueAsNumber:entered.length ? entered.shift() : NaN, placeholder:String(prompt.diePlaceholder)}));
    }}
});
// Keep the public factory and roll engine; replace only interactive dialogs in this VM.
Object.assign(context, {AbortController, structuredClone, setTimeout, clearTimeout});
vm.runInContext(bundle.replaceAll('new RollBonusPrompt(', 'new TestRollBonusPrompt(')
    .replaceAll('new DiceRollPrompt(', 'new TestDiceRollPrompt('), context);
vm.runInContext(fs.readFileSync('src/common/dice.js','utf8') + '\n' + fs.readFileSync('src/dndbeyond/base/godice.js','utf8') + '\nthis.GoDiceAdapter = GoDice; this.Roll = DNDBRoll;', context);
context.CriticalRules = {PHB:0, HOMEBREW_MAX:1};
context.dndbeyondDiceRoller = {_settings:{'critical-homebrew':0}};
const library=context.GoDiceLibrary.createGoDice({instanceId:'test',storage:{getItem:()=>null,setItem(){}}}).rollResult;
const Adapter=context.GoDiceAdapter;
const normalRequest=async (action,payload)=> {
    assert.equal(action,'roll');
    assert.deepEqual(Object.keys(payload).sort(),['critType','formula']);
    return JSON.parse(JSON.stringify(await library.rollDice(payload.formula,payload.critType), (key,value)=>key === 'context' ? undefined : value));
};
(async () => {
    const utilsSource=fs.readFileSync('src/dndbeyond/base/utils.js','utf8');
    const propertiesContext=vm.createContext({});
    vm.runInContext(utilsSource.slice(utilsSource.indexOf('function propertyListToDict('),
        utilsSource.indexOf('function descriptionToString(')),propertiesContext);
    for (const [text,aria,expected] of [
        ['Slashing Slashing','slashing damage','Slashing'],
        ['Piercing Piercing',undefined,'Piercing'],
        ['SlashingSlashing','slashing damage','Slashing'],
        ['Custom damage',undefined,'Custom damage']
    ]) {
        const label={length:1,text:()=> 'Damage Type:'};
        const value={length:1,text:()=>text,find:()=>({first:()=>({attr:()=>aria})})};
        const prop={find:selector=>selector.includes('property-label') ? label : value};
        const result=propertiesContext.propertyListToDict({length:1,eq:()=>prop});
        assert.equal(result['Damage Type'],expected);
    }
    Adapter.request=normalRequest;
    choice={bonus:'',rolltype:1,advdis:0,elven:false};
    const damage=new context.Roll('2d6+4');
    damage.setRollType('damage');
    const damageRequest={};
    const originalDamage=damage;
    await new Adapter('Damage',[damage],damageRequest).roll();
    assert.equal(damage,originalDamage);
    assert.equal(damage.dice[0].amount,4);
    assert.equal(damage.total,20); // Four generated fallback values of 4, plus 4.
    assert.equal(damageRequest.godiceDamageHandled,true);
    context.dndbeyondDiceRoller._settings['critical-homebrew']=1;
    const perfect=new context.Roll('2d6+4'); perfect.setRollType('damage');
    await new Adapter('Damage',[perfect],{}).roll();
    assert.equal(perfect.total,24);
    assert.equal(perfect.dice[0].amount,2);
    context.dndbeyondDiceRoller._settings['critical-homebrew']=4;
    await assert.rejects(()=>new Adapter('Damage',[perfect],{}).roll(),/not supported/);
    context.dndbeyondDiceRoller._settings['critical-homebrew']=0;
    choice={bonus:'+1d4',rolltype:0,advdis:1,elven:false};
    entered=[20,3,2];
    const attack=new context.Roll('1d20+5'); attack.setRollType('to-hit');
    attack.setCriticalLimit(19);
    const attackRequest={advantage:0};
    await new Adapter('Attack',[attack],attackRequest).roll();
    assert.equal(attack.total,27);
    assert.equal(attackRequest.advantage,3);
    assert.equal(attack.dice[0].amount,2);
    assert.equal(attack.dice[0].rolls.filter(value=>!value.discarded).length,1);
    assert.equal(attack.isCriticalHit(),true);
    choice={bonus:'',rolltype:0,advdis:1,elven:true};
    entered=[2,17,8];
    const elven=new context.Roll('1d20+6'); elven.setRollType('to-hit');
    await new Adapter('Elven accuracy',[elven],{}).roll();
    assert.equal(elven.total,23);
    assert.equal(elven.dice[0].amount,3);
    choice={bonus:'',rolltype:0,advdis:-1,elven:false};
    entered=[18,4];
    const disadvantage=new context.Roll('1d20+6'); disadvantage.setRollType('to-hit');
    await new Adapter('Disadvantage',[disadvantage],{advantage:4}).roll();
    assert.equal(disadvantage.total,10);
    choice={bonus:'',rolltype:0,advdis:1,elven:false};
    entered=[3,4];
    const minimum=new context.Roll('1d20min10+6'); minimum.setRollType('skill-check');
    await new Adapter('Minimum',[minimum],{}).roll();
    assert.equal(minimum.total,16,'retain minimum modifiers when adding advantage');
    choice={bonus:'',rolltype:0,advdis:0,elven:false};
    entered=[1,4,5];
    const reroll=new context.Roll('2d6r<2min3'); reroll.setRollType('damage');
    await new Adapter('Reroll',[reroll],{}).roll();
    assert.equal(reroll.total,9);
    assert.equal(reroll.dice[0].rolls[0].discarded,true);
    const repeated=new context.Roll('1d6+1d6+4'); repeated.setRollType('damage');
    entered=[2,5];
    await new Adapter('Repeated terms',[repeated],{}).roll();
    assert.equal(repeated.total,11);
    assert.equal(repeated.dice[0].rolls[0].roll,2);
    assert.equal(repeated.dice[1].rolls[0].roll,5);
    entered=[NaN,1];
    const partial=new context.Roll('2d6-2'); partial.setRollType('damage');
    await new Adapter('Partial values',[partial],{}).roll();
    assert.equal(partial.total,3,'generated 4 plus supplied 1 minus 2');
    vm.runInContext(fs.readFileSync('src/common/roll_renderer.js','utf8') + '\nthis.Renderer=Beyond20RollRenderer;',context);
    context.RollType={NORMAL:0,DOUBLE:1,THRICE:2,ADVANTAGE:3,DISADVANTAGE:4,SUPER_ADVANTAGE:6,SUPER_DISADVANTAGE:7};
    const coreRoller={handlesAdvantage:true,roll:formula=>new context.Roll(formula)};
    const coreRenderer=new context.Renderer(coreRoller,{},{});
    const one=coreRenderer.getToHit({advantage:3},'+6').rolls;
    assert.equal(one.length,1);
    coreRenderer.processToHitAdvantage(3,one);
    assert.equal(coreRenderer.getToHit({advantage:1},'+6').rolls.length,2);
    coreRoller.handlesAdvantage=false;
    assert.equal(coreRenderer.getToHit({advantage:3},'+6').rolls.length,2,'non-GoDice backends retain advantage branches');
    let finishRoll;
    Adapter.request=async()=>new Promise(resolve=>{finishRoll=resolve;});
    const waiting=new context.Roll('1d20+5');
    let completed=false;
    const pending=new Adapter('Attack',[waiting],{}).roll().then(()=>{completed=true;});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(completed,false);
    finishRoll({notation:'1d20+5',rolls:[{rolls:[{initialValue:12,value:12}]}]});
    await pending;
    assert.equal(waiting.total,17);
    assert.throws(()=>Adapter.fromResult({notation:'1d6',rolls:[{rolls:[{value:0}]}]}),/Invalid/);
    assert.equal(Adapter.fromResult({notation:'1d6',rolls:[{rolls:[{value:4}]}]}).dice[0].rolls[0].roll,4,
        'accept the public value field when initialValue is absent');
    assert.equal(Adapter.libraryFormula(new context.Roll('2d6r<2min3+4')),'2d6+4');
    assert.throws(()=>Adapter.libraryFormula(new context.Roll('1d6+0.5')),/fractional/);
    const dropped=new context.Roll('3d6dl1'); dropped.setRollType('damage');
    Adapter.request=normalRequest;
    entered=[1,3,5];
    await new Adapter('Drop lowest',[dropped],{}).roll();
    assert.equal(dropped.total,8,'Beyond20 restores drop modifiers outside the unchanged library');
    Adapter.request=normalRequest;
    choice={bonus:'',rolltype:0,advdis:0,elven:false};
    coreRoller.handlesAdvantage=true;
    coreRoller.resolveRolls=(name,rolls,request)=>new Adapter(name,rolls,request).roll();
    coreRenderer.setSettings({'use-godice':true,'critical-homebrew':0});
    choice={bonus:'',rolltype:0,advdis:1,elven:false};
    entered=[19,2];
    const [coreHits]=await coreRenderer.buildAttackRolls({name:'Sword',rollAttack:true,
        'to-hit':'+6',advantage:3,'critical-limit':19},'');
    assert.equal(coreHits.length,1);
    assert.equal(coreHits[0].total,25);
    assert.equal(coreHits[0].isCriticalHit(),true);
    choice={bonus:'',rolltype:1,advdis:0,elven:false};
    entered=[];
    const beforeDamagePrompts=dicePrompts.length;
    const [,coreDamages]=await coreRenderer.buildAttackRolls({name:'Sword',rollAttack:false,rollDamage:true,
        rollCritical:true,advantage:0,damages:['2d6+4'],'damage-types':['Slashing'],
        'critical-damages':['2d6'],'critical-damage-types':['Slashing']},'');
    assert.equal(coreDamages.length,1,'critical dice stay in the existing normal damage result');
    assert.equal(coreDamages[0][1].total,20);
    assert.equal(dicePrompts.length-beforeDamagePrompts,1,'core renderer must not request a second critical roll');
    choice={bonus:'',rolltype:0,advdis:0,elven:false};
    // Verify settings normalization without needing a browser DOM.
    const settings = fs.readFileSync('src/common/settings.js','utf8');
    const normalize = settings.slice(settings.indexOf('function normalizeDiceSettings'), settings.indexOf('function setSettings'));
    vm.runInContext(normalize, context);
    const conflicting = {'use-godice':true,'use-digital-dice':true};
    context.normalizeDiceSettings(conflicting);
    assert.equal(conflicting['use-digital-dice'],false);
    const character = fs.readFileSync('src/dndbeyond/content-scripts/character.js','utf8');
    const extraStart=character.indexOf('                const additional_damages =');
    const extraEnd=character.indexOf('                break;',extraStart);
    const noteDamage={text:()=> '2d6',find:()=>({attr:()=> 'Fire',text:()=> ''})};
    for (const useGoDice of [true,false]) {
        const itemContext=vm.createContext({settings:{'use-godice':useGoDice},$:()=>[],
            value:{find:()=>({length:1,eq:()=>noteDamage})},
            damages:['2d6+4'],damage_types:['Slashing'],item_name:'Flame Tongue Greatsword',properties:{},
            applyGWFIfRequired:(name,properties,formula)=>formula});
        vm.runInContext(character.slice(extraStart,extraEnd),itemContext);
        assert.deepEqual(Array.from(itemContext.damages),useGoDice ? ['2d6+4'] : ['2d6+4','2d6']);
        assert.deepEqual(Array.from(itemContext.damage_types),useGoDice ? ['Slashing'] : ['Slashing','Fire']);
    }
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
    let automaticRolls=0;
    pageContext.window.diceRoller={roll:async()=>{automaticRolls++;return true;}};
    pageDoc.documentElement.dataset.beyond20GodiceEnabled='true';
    pageContext.guardAboveVttGoDiceRoller();
    assert.equal(await pageContext.window.diceRoller.roll(),false);
    assert.equal(automaticRolls,0,'AboveVTT must not auto-roll while Beyond20 GoDice owns this page');
    pageDoc.documentElement.dataset.beyond20GodiceEnabled='false';
    assert.equal(await pageContext.window.diceRoller.roll(),true);
    assert.equal(automaticRolls,1,'restore AboveVTT behavior when Beyond20 GoDice is disabled');

    pageDoc.documentElement.dataset.beyond20GodiceEnabled='false';
    const native = {button:0,target:pageTarget,preventDefault(){throw new Error('Must allow native controls when disabled');}};
    pageHandlers.click(native);
    assert.equal(intents.length,2);
    context.dndbeyondDiceRoller._settings['critical-homebrew']=0;
    choice={bonus:'',rolltype:1,advdis:0,elven:false};
    entered=[3,3,3,3];
    Adapter.request=normalRequest;
    const note=new context.Roll('2d6');
    await new Adapter('Notes',[note],{type:'custom'}).roll();
    assert.equal(note.dice[0].amount,4);
    assert.equal(note.total,12);
    // Exercise the unchanged browser bundle's public mount/destroy API with a minimal DOM.
    function element() {
        return {dataset:{},style:{},children:[],querySelectorAll:()=>[],
            appendChild(child){this.children.push(child);child.parentNode=this;return child;},
            attachShadow(){return this.shadowRoot=element();},
            remove(){if(this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this),1);}};
    }
    context.document={readyState:'complete',body:element(),createElement:element};
    context.jQuery={fn:{}};
    const first=context.GoDiceLibrary.createGoDice({instanceId:'beyond20',storage:{getItem:()=>null,setItem(){}}});
    const second=context.GoDiceLibrary.createGoDice({instanceId:'abovevtt',storage:{getItem:()=>null,setItem(){}}});
    for(const runtime of [first,second]) {
        runtime.dicebar.init=()=>{};
        runtime.utils.reconnectLoadedDice=()=>{};
        await runtime.mount();
    }
    assert.notEqual(first.root,second.root);
    assert.notEqual(first.connectedDice,second.connectedDice);
    assert.match(first.logoUrl,/^data:image\/svg\+xml;base64,/);
    assert.equal(context.window.godice !== first,true);
    await first.destroy();
    assert.equal(context.document.body.children.length,1,'destroy removes only its own shadow host');
    await assert.rejects(first.mount(),error=>error.code==='GODICE_CANCELLED');
    await second.destroy();
    const replies = [];
    let requestListener;
    let published = 0;
    let mounts = 0, destroys = 0, publicCalls = 0;
    let finishDialog;
    let cleanup;
    let waitForCleanup = false;
    const bridgeContext = vm.createContext({console,
        GoDiceLibrary:{createGoDice(options) {
            assert.equal(options.instanceId,'beyond20');
            return {logoUrl:'data:image/png;base64,logo',mount:async()=>{mounts++;},
                destroy:()=>{destroys++; if(finishDialog) finishDialog.reject(Object.assign(new Error('cancelled'),{code:'GODICE_CANCELLED'}));
                    return waitForCleanup ? new Promise(resolve=>{cleanup=resolve;}) : Promise.resolve();},
                rollResult:{rollDice:async function(formula,critType) {
                    assert.equal(arguments.length,2);
                    publicCalls++;
                    if(formula==='2d6') return new Promise((resolve,reject)=>{finishDialog={resolve,reject};});
                    const result={notation:'1d20+2',rolls:[{rolls:[{initialValue:12,value:12}]}]};
                    result.context={result};
                    return result;
                }}};
        }},
        window:{__beyond20GoDiceCapture:true,__beyond20PublishGoDice:async info => {
            published++;assert.equal(info.name,'Hit');assert.equal(info.godiceLogoUrl,'data:image/png;base64,logo');}},
        document:{documentElement:{dataset:{}}, addEventListener:(name,listener)=>{requestListener=listener;},dispatchEvent:event=>replies.push(JSON.parse(event.detail))},
        CustomEvent:class {constructor(type,init) {this.type=type;this.detail=init.detail;}}
    });
    vm.runInContext(bridge,bridgeContext);
    const send=async payload=>{await requestListener({detail:JSON.stringify({id:'test',...payload})});return replies.at(-1);};
    const conflictPrompts=[];
    bridgeContext.window.alert=message=>conflictPrompts.push(message);
    bridgeContext.window.EXPERIMENTAL_SETTINGS={godiceRoller:true};
    assert.equal((await send({action:'configure',enabled:true})).error,undefined,
        'AboveVTT GoDice settings do not block the isolated Beyond20 runtime');
    bridgeContext.window.godice={ownedByAboveVTT:true};
    assert.equal((await send({action:'configure',enabled:true})).error,undefined);
    await send({action:'configure',enabled:true});
    // Factory mount is idempotent; adapter keeps the same runtime.
    const result=await send({action:'roll',formula:'1d20',critType:0});
    assert.equal(result.value.notation,'1d20+2');
    assert.equal('context' in result.value,false,'circular runtime is excluded from replies');
    assert.equal(publicCalls,1);
    const missingSession=await send({action:'publish',rollInfo:{name:'Hit'}});
    assert.match(missingSession.error,/Reload the Beyond20 extension and this character page/);
    assert.equal(missingSession.code,undefined,'outdated clients are not reported as cancelled rolls');
    const session=result.session;
    await send({action:'publish',session,rollInfo:{name:'Hit'}});
    assert.equal(published,1);
    assert.equal(bridgeContext.window.godice.ownedByAboveVTT,true);
    const pendingDialog=send({action:'roll',formula:'2d6',critType:0,session});
    await new Promise(resolve=>setImmediate(resolve));
    waitForCleanup=true;
    const disabling=send({action:'configure',enabled:false});
    const remounting=send({action:'configure',enabled:true});
    const before=mounts;
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(mounts,before,'re-enable waits for destroy storage cleanup');
    cleanup();
    await Promise.all([pendingDialog,disabling,remounting]);
    assert.ok(replies.some(reply=>reply.code==='GODICE_CANCELLED'));
    assert.equal(destroys,1);
    assert.equal((await send({action:'publish',session,rollInfo:{name:'Hit'}})).code,'GODICE_CANCELLED');
    assert.equal(published,1,'cancelled session cannot publish after re-enable');
    assert.equal(conflictPrompts.length,0,'no obsolete disable-and-reload prompt');
    // Use the real content/page transport together, including session acquisition.
    const transportListeners=new Map();
    bridgeContext.document.addEventListener=(type,listener)=>{
        if(!transportListeners.has(type)) transportListeners.set(type,new Set());
        transportListeners.get(type).add(listener);
    };
    bridgeContext.document.removeEventListener=(type,listener)=>transportListeners.get(type)?.delete(listener);
    bridgeContext.document.dispatchEvent=event=>{
        for(const listener of [...(transportListeners.get(event.type)||[])]) listener(event);
    };
    transportListeners.set('Beyond20_GoDiceRequest',new Set([requestListener]));
    bridgeContext.crypto=require('crypto');
    vm.runInContext(fs.readFileSync('src/common/dice.js','utf8')+'\n'+
        fs.readFileSync('src/dndbeyond/base/godice.js','utf8')+'\nthis.TransportGoDice=GoDice;this.TransportRoll=DNDBRoll;',bridgeContext);
    bridgeContext.TransportGoDice.loading=Promise.resolve();
    bridgeContext.CriticalRules={PHB:0,HOMEBREW_MAX:1};
    bridgeContext.dndbeyondDiceRoller={_settings:{'use-godice':true,'roll-to-game-log':true}};
    const resolverSource=fs.readFileSync('src/dndbeyond/base/dice.js','utf8');
    vm.runInContext(resolverSource.slice(resolverSource.indexOf('class DNDBRoller'),resolverSource.indexOf('class DNDBPrompter'))+
        '\nthis.TransportRoller=DNDBRoller;',bridgeContext);
    const transportedRoll=new bridgeContext.TransportRoll('1d20+2');
    await new bridgeContext.TransportRoller().resolveRolls('Hit',[transportedRoll],{});
    assert.equal(transportedRoll.total,14);
    assert.equal(published,2,'normal submission publishes across the real request/reply bridge');
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
    // AboveVTT can instantiate DiceRoller twice after Beyond20 registers.
    const transportMessages=[];
    const transport={gameId:'campaign',userId:'user',subscribe(){},dispatch:message=>transportMessages.push(message)};
    brokerContext.window[Symbol.for('@dndbeyond/message-broker-lib')]=transport;
    const earlyBroker=new brokerContext.Broker();
    earlyBroker.register();
    const firstSaved=transport.dispatch;
    transport.dispatch=()=>{throw new Error('First AboveVTT roll queue must not receive physical values');};
    const secondSaved=transport.dispatch;
    brokerContext.window.diceRoller={ddbDispatch:secondSaved,ddbonmessage(){}};
    transport.dispatch=()=>{throw new Error('Second AboveVTT roll queue must not receive physical values');};
    for (const eventType of ['dice/roll/pending','dice/roll/fulfilled'])
        earlyBroker.postMessage({eventType,data:{__b20Override__:true}},{physical:true});
    assert.deepEqual(transportMessages.map(message=>message.eventType),['dice/roll/pending','dice/roll/fulfilled']);
    // Registration after the first wrapper uses its saved transport, too.
    brokerContext.window.diceRoller.ddbDispatch=firstSaved;
    const lateBroker=new brokerContext.Broker();
    lateBroker.register();
    lateBroker.postMessage({eventType:'dice/roll/fulfilled',data:{__b20Override__:true}},{physical:true});
    assert.equal(transportMessages.length,3);
    delete brokerContext.window.diceRoller;
    // DDB-only/mobile pages have the native broker, without AboveVTT's diceRoller.
    const nativeOnlyMessages=[];
    transport.dispatch=message=>nativeOnlyMessages.push(message);
    const nativeOnlyBroker=new brokerContext.Broker();
    nativeOnlyBroker.register();
    for (const eventType of ['dice/roll/pending','dice/roll/fulfilled'])
        nativeOnlyBroker.postMessage({eventType,data:{__b20Override__:true}},{physical:true});
    assert.deepEqual(nativeOnlyMessages.map(message=>message.eventType),['dice/roll/pending','dice/roll/fulfilled']);
    // A partially initialized AboveVTT roller may also lack the local echo handler.
    brokerContext.window.diceRoller={};
    nativeOnlyBroker.postMessage({eventType:'dice/roll/fulfilled',data:{__b20Override__:true}},{physical:true});
    assert.equal(nativeOnlyMessages.length,3);
    delete brokerContext.window.diceRoller;
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
    const brandedInfo = {godiceLogoUrl:'data:image/png;base64,logo',name:'Sword <script>',rolls:[{type:'damage'}],request:{godice:true,godiceBrandedChat:true,character:{name:'Geralt'},whisper:0}};
    const brandedRolls = [{rollType:'Slashing',diceNotationStr:'2d6+4',result:{text:'3+2+4',total:9}}];
    assert.equal(await chatContext.publishGoDiceChatCard(brandedInfo,brandedRolls),true);
    assert.match(sharedCards[0].text,/Rolled with GoDice/);
    assert.match(sharedCards[0].text,/data:image\/png;base64,logo/);
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
    chatContext.messageBroker={register(){},_mb:{},postMessage(){throw new Error('Do not duplicate an HTML card with a native dice message');}};
    const brokerPage = fs.readFileSync('src/dndbeyond/page-scripts/message-broker.js','utf8');
    const labelsContext=vm.createContext({});
    vm.runInContext(brokerPage.slice(brokerPage.indexOf('    function rollToDDBRoll('),
        brokerPage.indexOf('    function combineD20Rolls(')),labelsContext);
    const labelRoll={type:'damage',formula:'2d6+4',parts:[4],total:11};
    const labelInfo={name:'Flame Tongue Greatsword',rolls:[labelRoll],request:{godice:true,type:'attack','damage-types':['Slashing']}};
    const labelRolls=labelsContext.b20BuildDdbRollsForGameLog([labelRoll],labelInfo.request);
    assert.equal(labelRolls[0].rollType,'damage');
    const nativeAdvantage=labelsContext.b20BuildDdbRollsForGameLog([attack.toJSON()],{godice:true,advantage:3})[0];
    assert.equal(nativeAdvantage.rollKind,'advantage');
    assert.equal(nativeAdvantage.result.total,27);
    assert.equal(nativeAdvantage.diceNotation.set[0].count,2);
    assert.equal(nativeAdvantage.result.values.length,3,'include both d20s and bonus die in the breakdown');
    const labelCard=chatContext.buildGoDiceChatCard(labelInfo,labelRolls,'');
    assert.match(labelCard,/>Slashing damage<\/div>/);
    assert.match(labelCard,/color:#f16b6b/);
    assert.match(labelCard,/>Flame Tongue Greatsword<\/div>/);
    assert.equal(chatContext.getGoDiceRollTitle({...labelInfo,rolls:[{type:'to-hit'}]}),'Flame Tongue Greatsword');
    assert.doesNotMatch(labelCard,/Slashing Slashing/i);
    labelInfo.request['damage-types']=['Piercing Piercing'];
    assert.equal(labelsContext.b20BuildDdbRollsForGameLog([labelRoll],labelInfo.request)[0].rollType,'damage');
    vm.runInContext(brokerPage.slice(brokerPage.indexOf('    async function fulfilledRoll'),brokerPage.indexOf('    window.__beyond20PublishGoDice')),chatContext);
    await chatContext.fulfilledRoll(brandedInfo);
    assert.equal(sharedCards.length,3);
    const chatTransports=[];
    const injectedCards=[];
    chatContext.uuidv4=()=>'chat-id';
    chatContext.window.MB={userid:'user',gameid:'campaign',
        inject_chat(){throw new Error('Do not use AboveVTT wrapped dispatch');},
        handle_injected_data:message=>injectedCards.push(message)};
    chatContext.messageBroker.postMessage=(message,options)=>{
        chatTransports.push({message,options});
        return {...message,id:'envelope-id'};
    };
    await chatContext.fulfilledRoll(brandedInfo);
    assert.equal(chatTransports.length,1,'one shared placeholder, without a duplicate native roll');
    assert.equal(chatTransports[0].options.physical,true);
    assert.equal(chatTransports[0].message.data.injected_data.beyond20GoDice,true);
    assert.match(chatTransports[0].message.data.rolls[0].rollType,/^beyond20-godice-/);
    assert.equal(injectedCards[0].id,'envelope-id');
    assert.match(injectedCards[0].data.injected_data.text,/Rolled with GoDice/);
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
    assert.equal(nativeMessages.length,2);
    assert.equal(nativeMessages[0].eventType,'dice/roll/pending');
    assert.equal(nativeMessages[1].eventType,'dice/roll/fulfilled');
    assert.equal(nativeMessages[0].persist,false);
    assert.equal(nativeMessages[1].persist,true);
    assert.equal(nativeMessages[0].data.rollId,nativeMessages[1].data.rollId);
    assert.equal('result' in nativeMessages[0].data.rolls[0],false);
    assert.equal(nativeMessages[1].data.rolls[0].result.total,9);
    delete chatContext.window.mydice;
    await chatContext.fulfilledRoll(brandedInfo);
    assert.equal('setId' in nativeMessages[2].data,false);
    assert.equal('setId' in nativeMessages[3].data,false);
    brandedInfo.request.type='attack';
    brandedInfo.name='Slashing';
    await chatContext.fulfilledRoll(brandedInfo);
    assert.equal(nativeMessages[5].data.rolls[0].rollType,'Slashing');
    assert.equal(nativeMessages[5].data.action,'Slashing');
    brandedInfo.name='Flame Tongue Greatsword';
    await chatContext.fulfilledRoll(brandedInfo);
    assert.equal(nativeMessages[7].data.rolls[0].rollType,'Slashing');
    brandedInfo.request['damage-types']=['Slashing'];
    await chatContext.fulfilledRoll(brandedInfo);
    assert.equal(nativeMessages[9].data.action,'Flame Tongue Greatsword\nSlashing');
    const beforeCancelledPublish=nativeMessages.length;
    let lookupDone;
    chatContext.resolveGoDiceSetId=()=>new Promise(resolve=>{lookupDone=resolve;});
    const cancelledPublication=chatContext.fulfilledRoll(brandedInfo,()=>{
        throw Object.assign(new Error('cancelled'),{code:'GODICE_CANCELLED'});
    });
    await new Promise(resolve=>setImmediate(resolve));
    lookupDone('06002');
    await assert.rejects(cancelledPublication,error=>error.code==='GODICE_CANCELLED');
    assert.equal(nativeMessages.length,beforeCancelledPublish,'disable during pack lookup prevents pending and fulfilled messages');
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
    console.log('PASS GoDice critical formulas, bonus dice, normal resolver fallback, roll objects, advantage, unsupported rule, validation, settings');
})().catch(error => { console.error(error); process.exitCode = 1; });
