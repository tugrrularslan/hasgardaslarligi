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
assert.equal(createAssistDraft(stored).mode, "totals");
assert.equal(createAssistDraft(stored).rows[1].player, "Gabriel Gomes");
const choices = mergeMatchPlayerOptions([], stored);
assert.ok(choices.some(player => player.name === "Gabriel Gomes"));
assert.ok(choices.some(player => player.name === "Alexey Batrakov"));
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
const formExports = {};
vm.runInNewContext(compile("../components/AdminMatchAssists.tsx"), {exports:formExports,require});
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
  "@/components/AdminMatchAssists":formExports,
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
assert.equal(byLabel(tree,"Asist girişi").props.value,"totals");
assert.equal(byLabel(tree,"Asist oyuncusu 1").props.value,"Alexey Batrakov");
assert.equal(byLabel(tree,"Asist oyuncusu 2").props.value,"Gabriel Gomes");
assert.equal(byLabel(tree,"Asist sayısı 2").props.value,"2");
assert.ok(nodes(byLabel(tree,"Asist oyuncusu 2")).some(node=>node.type==="option"&&node.props.value==="Gabriel Gomes"),"Imported assistant must remain selectable with an empty roster");
byLabel(tree,"Asist girişi").props.onChange({target:{value:"goals"}});
tree=await render();
const goalSelect=byLabel(tree,"Asist 1 Galatasaray");
assert.ok(goalSelect);
assert.ok(nodes(goalSelect).some(node=>node.type==="option"&&node.props.value==="Gabriel Gomes"));
byLabel(tree,"Asist girişi").props.onChange({target:{value:"totals"}});
tree=await render();assert.equal(byLabel(tree,"Asist oyuncusu 2").props.value,"Gabriel Gomes");

// Update an actual populated control, save through the actual handler and API, then reload.
byLabel(tree,"Asist oyuncusu 2").props.onChange({target:{value:"Yunus Akgün"}});
tree=await render();
byLabel(tree,"Asist sayısı 2").props.onChange({target:{value:"1"}});
tree=await render();
// A remote snapshot must not overwrite the unsaved administrator draft.
emitMatches();tree=await render();assert.equal(byLabel(tree,"Asist oyuncusu 2").props.value,"Yunus Akgün");
const save=nodes(tree).find(node=>node.type==="button"&&node.props.children==="Sonucu Güncelle");
assert.ok(save);await save.props.onClick();
assert.equal(requests.length,1);
assert.equal(requests[0].assistMode,"totals");
assert.equal(requests[0].assistTotals[1].player,"Yunus Akgün");
assert.equal(stored.assistTotals[1].player,"Yunus Akgün");
assert.equal(stored.assistTotals[1].count,1);
assert.equal(stored.pointsCalculated,true);assert.equal(stored.scoreRevision,7);
assert.equal(getMatchAssistTotals(stored).reduce((sum,row)=>sum+row.count,0),2);
tree=await render(true);
assert.equal(byLabel(tree,"Asist oyuncusu 2").props.value,"Yunus Akgün");
assert.equal(byLabel(tree,"Asist sayısı 2").props.value,"1");
// Non-dirty forms must follow later source data rather than keeping stale values forever.
stored.assistTotals[1].count=2;emitMatches();tree=await render();
assert.equal(byLabel(tree,"Asist sayısı 2").props.value,"2");
const bad=await apiExports.POST({headers:new Headers({authorization:"Bearer admin-token"}),json:async()=>({...requests[0],assistTotals:[{team:"Other",player:"A",count:1}]})});
assert.equal(bad.status,400);
console.log("Yönetici formu: dolu asist oyuncuları, kadro eksikken seçenekler, giriş türü, düzenleme, gerçek API ile kayıt, yeniden açılış ve puan koruması başarılı.");
