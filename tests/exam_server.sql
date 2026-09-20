-- Run after exam.sql inside a transaction and ROLLBACK. Synthetic account/data only.
do $$
declare uid uuid:=gen_random_uuid(); a jsonb; b jsonb; ident uuid; v int; i int; rejected boolean:=false;
begin
 insert into auth.users(id) values(uid);
 perform set_config('request.jwt.claim.sub',uid::text,true);
 -- Temporarily isolate a synthetic bank. Outer transaction rolls back everything.
 update exam_private.bank set enabled=false;
 for i in 1..180 loop
  insert into exam_private.bank(id,fingerprint,content,source_revision) values('test-'||i,'test-'||i,
   jsonb_build_object('id','test-'||i,'stem','Synthetic test '||i,'subject','Subject '||(i%19),'system','System '||(i%8),'difficulty',i%3+1,'exam_type','Direct Recall','correct','A','options','[{"label":"A","text":"One"},{"label":"B","text":"Two"},{"label":"C","text":"Three"},{"label":"D","text":"Four"}]'::jsonb),'test');
 end loop;
 a:=exam_private.gateway('start',null,null,'{"presetVersion":"neetpg-180-v1"}')->'attempt'; ident:=(a->>'id')::uuid;
 assert jsonb_array_length(a->'questions')=36,'section size';
 assert not ((a->'questions'->0) ? 'correct'),'answer leakage';
 assert (a->'preset'->>'maximumMarks')::int=720,'max marks';
 b:=exam_private.gateway('start',null,null,'{"presetVersion":"neetpg-180-v1"}')->'attempt';
 assert b->>'id'=a->>'id','duplicate start';
 b:=exam_private.gateway('mutate',ident,0,'{"position":0,"selected":"A","review":true,"navigate":35}');
 assert b->'attempt'->>'currentPosition'='35','navigation';
 b:=exam_private.gateway('mutate',ident,0,'{"position":0,"selected":"B"}');
 assert b->>'error'='STALE_VERSION','stale write accepted';
 b:=exam_private.gateway('mutate',ident,1,'{"position":36,"selected":"A"}');
 assert b->>'error'='SECTION_LOCKED','future section write';
 begin perform exam_private.gateway('submit',ident,null,'{}'); exception when others then rejected:=true; end;
 assert rejected,'early submit accepted';
 update exam_private.attempts set started_at=clock_timestamp()-interval '85 minutes',expires_at=clock_timestamp()+interval '125 minutes' where id=ident;
 a:=exam_private.gateway('get',ident,null,'{}')->'attempt';
 assert a->>'activeSection'='2','multi-boundary reconciliation';
 b:=exam_private.gateway('mutate',ident,(a->>'version')::int,'{"position":0,"selected":"B"}');
 assert b->>'error'='SECTION_LOCKED','previous section write';
 -- All four required scoring vectors plus answered/unanswered review.
 for i in 1..4 loop
  update exam_private.attempts set status='active',started_at=clock_timestamp()-interval '211 minutes',expires_at=clock_timestamp()-interval '1 minute',result=null,
   responses=(select jsonb_agg(jsonb_build_object('selected',case
    when i=1 then 'A' when i=2 then 'B' when x<=100 then 'A' when i=3 and x<=150 then 'B' else null end,
    'review',true,'visited',true,'timeSpent',0,'changes','[]'::jsonb)) from generate_series(1,180) x)
   where id=ident;
  a:=exam_private.gateway('get',ident,null,'{}')->'attempt';
  assert (a->'result'->>'score')::int=case i when 1 then 720 when 2 then -180 when 3 then 350 else 400 end,'score vector failed';
  b:=exam_private.gateway('get',ident,null,'{}')->'attempt';
  assert a=b,'non-idempotent completion';
  b:=exam_private.gateway('mutate',ident,(a->>'version')::int,'{"position":179,"selected":"B"}');
  assert b->>'error'='ATTEMPT_COMPLETED','completed write';
 end loop;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);rejected:=false;
 begin perform exam_private.gateway('get',ident,null,'{}'); exception when insufficient_privilege then rejected:=true; end;
 assert rejected,'ownership bypass';
 perform set_config('request.jwt.claim.sub','',true);rejected:=false;
 begin perform exam_private.gateway('history',null,null,'{}'); exception when insufficient_privilege then rejected:=true; end;
 assert rejected,'anonymous access';
end $$;
select 'PASS: sizes, answer secrecy, duplicate start, stale writes, early exit, multi-boundary expiry, locks, score vectors, idempotency, ownership, authentication' as exam_tests;
