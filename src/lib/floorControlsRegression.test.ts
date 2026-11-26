import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { canEditFloorCapacitySession, canEditSeatingBookingLimits, floorCapacityAccessMessage } from "./seatingBookingLimits";
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

test("retired zone-wide saves reject all staff without accessing settings or writing", async()=>{
  for(const id of [...editors,"other-staff"]) {
    const put=handler("src/app/api/admin/venue-settings/route.ts","PUT",{
      requireActiveStaff:async()=>({error:null,staffProfile:{id,active:true},serviceClient:{}}),
    });
    for(const venue of ["cape-town","johannesburg"])for(const zone of ["golden-circle","middle-ring","royal-booths","royal-balcony"]) {
      const response=await put(new Request("http://local/api/admin/venue-settings",{method:"PUT",body:JSON.stringify({bookingLimit:{venue,zone,limit:{minGuests:6,maxGuests:8}}})})) as Response;
      assert.equal(response.status,400);
    }
  }
  const source=readFileSync("src/app/api/admin/venue-settings/route.ts","utf8");
  assert.doesNotMatch(source,/set_seating_booking_limits/);
  assert.match(source,/settings\.bookingLimits = previousSettings\?\.bookingLimits/);
});

function tableFixture(id: string, venue="cape-town", temporary=false, assignedGuests=0, merged=false) {
  const writes: Record<string,unknown>[]=[];
  const audits: unknown[]=[];
  const table={id:"table",table_code:temporary?"TEMP-1":"1",section:"royal-booths",capacity:6,is_physical:!temporary,is_override:temporary,capacity_configured:true,
    availability_scope:"operational",status:assignedGuests?"booked":"available",booking_id:assignedGuests?"booking":null,updated_at:"2026-11-24T10:00:00Z",merged_from:[],merged_parent_id:null,custom_price_per_person:null};
  const client={from:(relation:string)=>{
    let update:Record<string,unknown>|null=null;
    const query={select:()=>query,eq:()=>query,update:(value:Record<string,unknown>)=>{update=value;return query;},
      insert:(value:Record<string,unknown>)=>{update=value;return query;},
      single:async()=>{if(update)writes.push(update);return {data:{...table,...update},error:null};},
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
    tryRecordAuditEvent:async(...args:unknown[])=>{audits.push(args);},isTemporaryOperationalTable:()=>temporary&&!merged,
    normalizeTemporaryTableCustomPrice:()=>null,temporaryTableCodePattern:/^TEMP-1$/,hasShowTableCodeConflict:async()=>false,
  });
  return {writes,audits,post:async(action:string,capacity=6,status=table.status)=>await post(new Request("http://local/api/admin/show-tables",{method:"POST",body:JSON.stringify({action,showReference:"show",zoneId:"royal-booths",tableId:"table",tableCode:"TEMP-1",capacity,status})})) as Response};
}

test("restored physical-seat POST saves normally for both authorised staff at both venues",async()=>{
  for(const id of editors)for(const venue of ["cape-town","johannesburg"]) {
    const fixture=tableFixture(id,venue);assert.equal((await fixture.post("set-capacity")).status,200);
    assert.equal(fixture.writes.length,1);assert.equal(fixture.writes[0].capacity,6);assert.equal(fixture.audits.length,1);
  }
});

test("table managers regain temporary create/edit/block at both venues, not permanent or merged capacity",async()=>{
  const permanent=tableFixture("other-staff");assert.equal((await permanent.post("set-capacity")).status,403);assert.equal(permanent.writes.length,0);
  for(const venue of ["cape-town","johannesburg"]) {
    const created=tableFixture("other-staff",venue,true);assert.equal((await created.post("create")).status,200);assert.equal(created.writes.length,1);
    for(const [capacity,status] of [[7,"available"],[6,"disabled"]] as const) {
      const fixture=tableFixture("other-staff",venue,true);assert.equal((await fixture.post("update",capacity,status)).status,200);assert.equal(fixture.writes.length,1);
    }
    const merged=tableFixture("other-staff",venue,true,0,true);assert.equal((await merged.post("update",7)).status,403);assert.equal(merged.writes.length,0);
    const assigned=tableFixture("other-staff",venue,true,5);assert.equal((await assigned.post("update",6,"disabled")).status,409);assert.equal(assigned.writes.length,0);
  }
  const fixture=tableFixture("other-staff","cape-town",true);
  assert.equal((await fixture.post("update")).status,200);assert.equal(fixture.writes.length,1);
});

test("restored editor preserves physical bounds and assigned-booking safeguards",async()=>{
  const invalid=tableFixture(editors[0]);assert.equal((await invalid.post("set-capacity",9)).status,400);assert.equal(invalid.writes.length,0);
  const assigned=tableFixture(editors[0],"cape-town",false,7);assert.equal((await assigned.post("set-capacity",6)).status,409);assert.equal(assigned.writes.length,0);
});

test("Floor retains table controls without the zone-wide editor; capacity permissions remain",()=>{
  const page=readFileSync("src/app/admin/page.tsx","utf8");
  assert.match(page,/canEditFloorCapacitySession\(currentStaff\)/);
  assert.doesNotMatch(page,/FloorBookingLimits|Seating Limits|Booking sizes/);
  assert.match(page,/Save table seats/);
  assert.match(page,/\{table\.physicalTable && physicalDefinition \? \(/);
  assert.doesNotMatch(page,/\{boothBookingLimit \? \(\s*<p/);
  assert.match(readFileSync("src/app/api/admin/floor-plan/route.ts","utf8"),/!canEditSeatingBookingLimits\(auth\.staffProfile\)/);
  const plan=readFileSync("src/app/api/admin/floor-capacity-plan/route.ts","utf8");
  assert.doesNotMatch(plan,/canEditSeatingBookingLimits/);
  assert.match(plan,/permissions\.includes\("tables:manage"\)/);
  assert.match(page,/disabled=\{!canManageTables \|\| \(!isTemporaryOperationalTable\(table\) && !canEditFloorCapacity\)\}/);
});
