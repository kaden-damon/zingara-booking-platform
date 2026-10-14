-- Correct the exact reviewed R0 COMP placeholder identity before the recovery
-- function is invoked. Fresh databases already receive the corrected function
-- from the preceding migration; Production receives this fail-closed patch.

do $$
declare
  v_definition text;
  v_function regprocedure :=
    'public.restore_kelly_dineplan_booking_atomic(timestamptz,uuid,text)'::regprocedure;
  v_reviewed_payment constant text := 'c51640dd-caeb-4b5a-b3a5-00f08fd547df';
  v_superseded_payment constant text := 'c516a63f-953b-41e8-8a29-e13c75f247e3';
begin
  select pg_get_functiondef(v_function::oid) into v_definition;

  if position(v_reviewed_payment in v_definition) > 0 then
    return;
  end if;
  if position(v_superseded_payment in v_definition) = 0 then
    raise exception 'KELLY_PAYMENT_IDENTITY_GUARD_UNEXPECTED';
  end if;

  execute replace(v_definition, v_superseded_payment, v_reviewed_payment);
end;
$$;
