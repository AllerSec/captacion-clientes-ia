-- Trigger: increment variant counters from metrics events

create or replace function bump_variant_counters() returns trigger as $$
begin
  if new.variant_id is null then return new; end if;
  if new.event = 'sent' then
    update variants set sent_count = sent_count + 1 where id = new.variant_id;
  elsif new.event = 'replied' then
    update variants set reply_count = reply_count + 1 where id = new.variant_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_bump_variants on metrics;
create trigger trg_bump_variants
  after insert on metrics
  for each row execute function bump_variant_counters();
