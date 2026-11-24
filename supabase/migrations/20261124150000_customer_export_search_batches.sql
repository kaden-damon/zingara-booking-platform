-- Reuse historical-name/company customer matching for on-demand exports.
-- Existing Customers UI still requests ten rows; no rows/schema are modified.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.search_customer_crm_page(text,text,integer,integer)'::regprocedure) into definition;
  if position('least(coalesce(p_page_size, 10), 25)' in definition)=0 or position('p_page_size = 500' in definition)>0 then
    raise exception 'Customer search batch limit differs; review before applying';
  end if;
  execute replace(definition, 'least(coalesce(p_page_size, 10), 25)',
    'case when p_page_size = 500 then 500 else least(coalesce(p_page_size, 10), 25) end');
end $$;
