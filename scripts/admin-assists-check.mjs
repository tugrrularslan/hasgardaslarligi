import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import { createAssistDraft, mergeMatchPlayerOptions, normalizeManualAssistTotals } from "../lib/admin-assists.ts";
import { getMatchAssistTotals, parseEspnMatchDetails } from "../lib/match-details.ts";
import { getPlayerIdentityKey } from "../lib/player-identity.ts";
const require = createRequire(import.meta.url);
const { Timestamp } = require("firebase-admin/firestore");
const context = { sourceEventId: "401888259", homeTeam: "Konyaspor", awayTeam: "Galatasaray", homeScore: 0, awayScore: 4 };
const details = parseEspnMatchDetails(JSON.parse(readFileSync(new URL("./fixtures/espn-super-lig-summary.json", import.meta.url), "utf8")), context);
let stored = { ...context, week: 10, seasonId: "2026-2027", result: "2", status: "finished", pointsCalculated: true, scoreRevision: 7,
  kickoff: Timestamp.fromDate(new Date("2026-10-30T17:00Z")), predictionDeadline: Timestamp.fromDate(new Date("2026-10-30T16:55Z")),
  goalDetailsSource: "espn", goalDetailsStatus: "complete", assistDetailsStatus: "complete", assistTotals: details.assistTotals,
  goalEvents: details.goalEvents.map(event => ({ team: "Galatasaray", scorer: event.scorer, scorerKey: getPlayerIdentityKey(event.scorer), assister: null, assisterKey: null, ownGoal: false })),
};
const choices = mergeMatchPlayerOptions([], stored);
assert.ok(choices.some(player => player.name === "Gabriel Gomes"));
assert.ok(choices.some(player => player.name === "Alexey Batrakov"));
assert.ok(mergeMatchPlayerOptions([{name:"Yunus Akgun",team:"Galatasaray"}],stored).some(player=>player.name==="Yunus Akgün"), "Saved player spelling must remain a selectable value when the roster uses a different accent");
for (const rows of [ [{team:"Other",player:"A",count:1}], [{team:"Galatasaray",player:"A",count:5}], [{team:"Galatasaray",player:"A",count:0}], [{team:"Galatasaray",player:"A",count:1},{team:"Galatasaray",player:"A",count:1}] ]) {
  assert.throws(() => normalizeManualAssistTotals(rows, { ...context, goalEvents: details.goalEvents }));
}

// Execute the real administrator page, API route and result saver together.
const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const deleted = Symbol("deleted");
let matchesListener;
function emitMatches() {
  matchesListener?.({ docs: [{ id: "match", data: () => ({ ...stored }) }] });
}
const db = { collection(collection) { return { doc(id) { return {
  get: async () => ({ exists: true, data: () => collection === "users" ? {isAdmin:id==="admin"} : stored }),
  update: async patch => {
    for (const [key,value] of Object.entries(patch)) { if(value === deleted) delete stored[key]; else stored[key] = value; }
    emitMatches();
  },
}; } }; } };
const firebase = { Timestamp, FieldValue: { serverTimestamp: () => Timestamp.now(), delete: () => deleted } };
const season = { DEFAULT_SEASON_ID: "2026-2027", DEFAULT_SEASON_NAME: "2026-2027 Sezonu" };
const scoringExports = {};
const scoringMocks = { "firebase-admin/firestore": firebase, "@/lib/firebase-admin": {adminDb:db},
  "@/lib/admin-assists": {normalizeManualAssistTotals}, "@/lib/match-details": {getMatchAssistTotals},
  "@/lib/player-identity": {getPlayerIdentityKey}, "@/lib/season":season };
vm.runInNewContext(compile("../lib/match-scoring.ts"), { exports:scoringExports, require:name=>scoringMocks[name]??require(name), Date,Map,Promise,Array });
const apiExports = {};
const apiMocks = { "next/server":{NextResponse:{json:(body,init)=>({body,status:init?.status??200})}},
  "@/lib/match-scoring":scoringExports,
  "@/lib/firebase-admin":{adminDb:db,adminAuth:{verifyIdToken:async token=>({uid:token==="admin-token"?"admin":"other"})}} };
vm.runInNewContext(compile("../app/api/admin/save-match-result/route.ts"), {exports:apiExports,require:name=>apiMocks[name]??require(name), console:{error(){}}});
let slots=[],effects=[],pending=[],cursor=0,requests=[];
const router={replace(){}};
const hooks={
  useState(initial){const index=cursor++;if(!(index in slots))slots[index]=initial;return[slots[index],value=>{slots[index]=typeof value==="function"?value(slots[index]):value;}];},
  useRef(initial){const index=cursor++;if(!(index in slots))slots[index]={current:initial};return slots[index];},
  useEffect(callback,deps){const index=cursor++;if(!effects[index]||deps.some((value,n)=>value!==effects[index][n])){effects[index]=deps;pending.push(callback);}},
};
const pageMocks={ react:hooks,"next/navigation":{useRouter:()=>router},"@/lib/firebase":{},
  "firebase/auth":{onAuthStateChanged(_auth,callback){callback({uid:"admin",getIdToken:async()=>"admin-token"});return()=>{};}},
  "firebase/firestore":{Timestamp,collection:(_db,name)=>({collection:name}),doc:(_db,collection,id)=>({collection,id}),
    query:value=>value,orderBy(){},getDoc:async()=>({exists:()=>true,data:()=>({isAdmin:true})}),
    onSnapshot(ref,callback){if(ref.collection==="matches"){matchesListener=callback;emitMatches();}else{callback({exists:()=>true,data:()=>({seasonId:"2026-2027",name:"2026-2027 Sezonu"})});}return()=>{};},
  },
  "@/lib/admin-assists":{createAssistDraft,mergeMatchPlayerOptions,normalizeManualAssistTotals},
  "@/lib/match-details":{getMatchAssistTotals},"@/lib/season":season,
  "@/lib/admin-reset":{getSeasonResetConfirmation:()=>"RESET"},"@/lib/kahin":{resolveKahinTeamName:value=>value},
};
const pageExports={};
vm.runInNewContext(compile("../app/admin/page.tsx"), {exports:pageExports,
  require:name=>pageMocks[name]??(name.startsWith("@/components/")?{__esModule:true,default:"stub"}:require(name)),
  window:{confirm:()=>true},crypto:{randomUUID},console,Set,Map,Date,
  fetch:async(url,init)=>{
    if(url==="/api/players")return{ok:true,json:async()=>({success:true,players:[]})};
    if(url==="/api/admin/save-match-result"){
      const body=JSON.parse(init.body);requests.push(body);
      const res=await apiExports.POST({headers:new Headers(init.headers),json:async()=>body});
      return{ok:res.status===200,json:async()=>res.body};
    }
    throw Error("Unexpected request: "+url);
  },
});
async function render(fresh=false){
  if(fresh){slots=[];effects=[];matchesListener=undefined;}
  let tree;
  for(let iteration=0;iteration<7;iteration++){
    cursor=0;pending=[];tree=pageExports.default();
    for(const effect of pending)effect();
    await Promise.resolve();await Promise.resolve();
  }
  return tree;
}
function nodes(node){
  if(Array.isArray(node))return node.flatMap(nodes);
  if(!node||typeof node!=="object"||!node.props)return[];
  if(typeof node.type==="function")return[node,...nodes(node.type(node.props))];
  return[node,...nodes(node.props.children)];
}
const byLabel=(tree,label)=>nodes(tree).find(node=>node.props["aria-label"]===label);
let tree=await render(true);
assert.equal(byLabel(tree,"Asist girişi"),undefined,"No assist entry mode or extra stage may be shown");
assert.equal(byLabel(tree,"Asist sayısı 1"),undefined);
const first=byLabel(tree,"Asist 1 Galatasaray");
assert.ok(first);
assert.ok(nodes(first).some(node=>node.type==="option"&&node.props.value==="Gabriel Gomes"),"Recorded assistants must be in each goal's player list even with an empty roster");
assert.ok(nodes(first).some(node=>node.type==="option"&&node.props.value==="Alexey Batrakov"));
for(const [number,player] of [[1,"Gabriel Gomes"],[2,"Gabriel Gomes"],[3,"Alexey Batrakov"]]) {
  byLabel(tree,`Asist ${number} Galatasaray`).props.onChange({target:{value:player}});
  tree=await render();
}
emitMatches();tree=await render();
assert.equal(byLabel(tree,"Asist 1 Galatasaray").props.value,"Gabriel Gomes","A source update must not erase unsaved per-goal choices");
const save=nodes(tree).find(node=>node.type==="button"&&node.props.children==="Sonucu Güncelle");
assert.ok(save);await save.props.onClick();
assert.equal(requests.length,1);
assert.equal(requests[0].assistMode,undefined,"The single-step form sends the per-goal record directly");
assert.equal(requests[0].goalEvents[0].assister,"Gabriel Gomes");
assert.equal(stored.goalEvents[0].assister,"Gabriel Gomes");
assert.equal(stored.goalEvents[1].assister,"Gabriel Gomes");
assert.equal(stored.goalEvents[2].assister,"Alexey Batrakov");
assert.equal(stored.pointsCalculated,true);assert.equal(stored.scoreRevision,7);
assert.equal(getMatchAssistTotals(stored).reduce((sum,row)=>sum+row.count,0),3);
tree=await render(true);
assert.equal(byLabel(tree,"Asist 1 Galatasaray").props.value,"Gabriel Gomes");
assert.equal(byLabel(tree,"Asist 3 Galatasaray").props.value,"Alexey Batrakov");
stored.goalEvents[0].assister="Yunus Akgün";emitMatches();tree=await render();
assert.equal(byLabel(tree,"Asist 1 Galatasaray").props.value,"Yunus Akgün");
const bad=await apiExports.POST({headers:new Headers({authorization:"Bearer admin-token"}),json:async()=>({...requests[0],assistMode:"totals",assistTotals:[{team:"Other",player:"A",count:1}]})});
assert.equal(bad.status,400);
console.log("Yönetici formu: tek adımda her gole asist seçimi, oyuncu seçenekleri, gerçek API ile kayıt, yeniden açılış ve puan koruması başarılı.");
