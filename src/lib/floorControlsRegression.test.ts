import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { canEditFloorCapacitySession, canEditSeatingBookingLimits, floorCapacityAccessMessage, validateSeatingBookingLimit } from "./seatingBookingLimits";
import { getPhysicalTableDefinition } from "./physicalTables";
import { isValidSeatingZoneId } from "./zingaraDemo";

const editors = ["e8598359-54a0-4e1f-a635-1ec8ae02cb78", "3ac09b59-fc3f-4c6d-9bb3-8dd47a077188"];
function handler(path: string, name: string, bindings: Record<string, unknown>) {
  const source = readFileSync(path,"utf8");
  const ast = ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);
  const declaration = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name)!;
  assert.ok(declaration, `${name} exists`);
  const context = { exports: {} as { handler?: (...args: unknown[]) => unknown }, Request, Response, console, ...bindings };
  runInNewContext(ts.transpileModule(`${declaration.getText(ast)}\nexports.handler=${name};`, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
  return context.exports.handler!;
}

test("real session serializer preserves auth identity and exposes the correct profile for both editors", () => {
  const serialize=handler("src/lib/supabase/serverAdmin.ts","staffProfileToSession",{
    getAdminRoleFromName:()=>"super-admin",getRolePermissions:()=>["tables:manage"],hasPlatformOwnerBinding:()=>false,
  });
  for(const id of editors) {
    const session=serialize({id,full_name:"Staff",email:"staff@example.invalid",venue_scope:["all"],roles:{name:"Super Admin"}},{id:"different-auth-id"}) as {id:string;staffProfileId:string};
    assert.equal(session.id,"different-auth-id");assert.equal(session.staffProfileId,id);
    assert.equal(canEditFloorCapacitySession(session),true);
  }
  assert.equal(canEditFloorCapacitySession({staffProfileId:"other-staff"}),false);
  assert.equal(canEditFloorCapacitySession(null),false);
  assert.equal(canEditFloorCapacitySession({}),false);
});

function limitsFixture(id: string, active=true) {
  const calls: Array<Record<string, unknown>>=[];
  const settings: Record<string, Record<string, unknown>>={};
  const put=handler("src/app/api/admin/venue-settings/route.ts","PUT",{
    requireActiveStaff:async()=>({error:null,staffProfile:{id,active},user:{id:"auth-identity"},serviceClient:{rpc:async(name:string,args:Record<string,unknown>)=>{
      calls.push({name,...args}); const venue=String(args.p_venue),zone=String(args.p_zone);
      settings[venue]??={};settings[venue][zone]={minGuests:args.p_minimum,maxGuests:args.p_maximum};return {error:null};
    }}}),canEditSeatingBookingLimits,validateSeatingBookingLimit,loadVenueSettings:async()=>({bookingLimits:settings}),
  });
  return {calls,settings,put:async(venue:string,zone:string,minGuests=6,maxGuests=8)=>await put(new Request("http://local/api/admin/venue-settings",{method:"PUT",body:JSON.stringify({bookingLimit:{venue,zone,limit:{minGuests,maxGuests}}})})) as Response};
}

test("actual settings PUT saves all four zones at both venues for Kaden and Fatima", async()=>{
  for(const id of editors) {
    const fixture=limitsFixture(id);
    for(const venue of ["cape-town","johannesburg"])for(const zone of ["golden-circle","middle-ring","royal-booths","royal-balcony"]) {
      const response=await fixture.put(venue,zone);assert.equal(response.status,200);
      assert.equal(fixture.calls.at(-1)?.p_actor_staff_profile_id,id);
      assert.equal(fixture.calls.at(-1)?.p_actor_auth_user_id,"auth-identity");
      assert.deepEqual(fixture.settings[venue][zone],{minGuests:6,maxGuests:8});
    }
    assert.equal(fixture.calls.length,8);
  }
});

test("actual settings PUT rejects other staff, inactive editors and invalid limits before any save", async()=>{
  for(const [id,active] of [["other-staff",true],[editors[0],false]] as const) {
    const fixture=limitsFixture(id,active);assert.equal((await fixture.put("cape-town","royal-booths")).status,403);assert.equal(fixture.calls.length,0);
  }
  const fixture=limitsFixture(editors[0]);
  assert.equal((await fixture.put("cape-town","royal-booths",6,9)).status,400);assert.equal(fixture.calls.length,0);
});

function tableFixture(id: string, venue="cape-town", temporary=false, assignedGuests=0) {
  const writes: Record<string,unknown>[]=[];
  const audits: unknown[]=[];
  const table={id:"table",table_code:temporary?"TEMP-1":"1",section:"royal-booths",capacity:6,is_physical:!temporary,is_override:temporary,capacity_configured:true,
    availability_scope:"operational",status:assignedGuests?"booked":"available",booking_id:assignedGuests?"booking":null,updated_at:"2026-11-24T10:00:00Z",merged_from:[],merged_parent_id:null,custom_price_per_person:null};
  const client={from:(relation:string)=>{
    let update:Record<string,unknown>|null=null;
    const query={select:()=>query,eq:()=>query,update:(value:Record<string,unknown>)=>{update=value;return query;},
      maybeSingle:async()=>{
        if(relation==="bookings")return {data:{guest_count:assignedGuests},error:null};
        if(update)writes.push(update);
        return {data:{...table,...update},error:null};
      }};return query;
  }};
  const post=handler("src/app/api/admin/show-tables/route.ts","POST",{
    requireActiveStaff:async()=>({error:null,staffProfile:{id,active:true,venue_scope:["all"]},user:{id:"auth-identity"},serviceClient:client}),
    getStaffRolePermissions:()=>["tables:manage"],isValidSeatingZoneId,resolveShow:async()=>({id:"show",venue}),canAccessShow:()=>true,
    loadZoneTables:async()=>[table],canEditSeatingBookingLimits,floorCapacityAccessMessage,getPhysicalTableDefinition,
    tryRecordAuditEvent:async(...args:unknown[])=>{audits.push(args);},isTemporaryOperationalTable:()=>temporary,
    normalizeTemporaryTableCustomPrice:()=>null,temporaryTableCodePattern:/^TEMP-1$/,hasShowTableCodeConflict:async()=>false,
  });
  return {writes,audits,post:async(action:string,capacity=6,status=table.status)=>await post(new Request("http://local/api/admin/show-tables",{method:"POST",body:JSON.stringify({action,showReference:"show",zoneId:"royal-booths",tableId:"table",capacity,status})})) as Response};
}

test("restored physical-seat POST saves normally for both authorised staff at both venues",async()=>{
  for(const id of editors)for(const venue of ["cape-town","johannesburg"]) {
    const fixture=tableFixture(id,venue);assert.equal((await fixture.post("set-capacity")).status,200);
    assert.equal(fixture.writes.length,1);assert.equal(fixture.writes[0].capacity,6);assert.equal(fixture.audits.length,1);
  }
});

test("unauthorised capacity writes fail but unchanged-capacity temporary notes still work",async()=>{
  for(const action of ["set-capacity","create"]) {
    const fixture=tableFixture("other-staff");assert.equal((await fixture.post(action)).status,403);assert.equal(fixture.writes.length,0);
  }
  for(const [capacity,status] of [[7,"available"],[6,"disabled"]] as const) {
    const fixture=tableFixture("other-staff","cape-town",true);assert.equal((await fixture.post("update",capacity,status)).status,403);assert.equal(fixture.writes.length,0);
  }
  const fixture=tableFixture("other-staff","cape-town",true);
  assert.equal((await fixture.post("update")).status,200);assert.equal(fixture.writes.length,1);
});

test("restored editor preserves physical bounds and assigned-booking safeguards",async()=>{
  const invalid=tableFixture(editors[0]);assert.equal((await invalid.post("set-capacity",9)).status,400);assert.equal(invalid.writes.length,0);
  const assigned=tableFixture(editors[0],"cape-town",false,7);assert.equal((await assigned.post("set-capacity",6)).status,409);assert.equal(assigned.writes.length,0);
});

test("Floor renders both controls and capacity-plan APIs enforce the same restriction",()=>{
  const page=readFileSync("src/app/admin/page.tsx","utf8");
  assert.match(page,/canEditFloorCapacitySession\(currentStaff\)/);
  assert.match(page,/canEditFloorCapacity && selectedShow/);
  assert.match(page,/\{table\.physicalTable && physicalDefinition \? \(/);
  assert.doesNotMatch(page,/\{boothBookingLimit \? \(\s*<p/);
  for(const path of ["src/app/api/admin/floor-plan/route.ts","src/app/api/admin/floor-capacity-plan/route.ts"])assert.match(readFileSync(path,"utf8"),/!canEditSeatingBookingLimits\(auth\.staffProfile\)/);
});
