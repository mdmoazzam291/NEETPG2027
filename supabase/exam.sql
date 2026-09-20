-- Additive simulator schema. Apply transactionally. Existing study tables are untouched.
-- Bank is a generated deployment cache of data/pyq, not a second authoring source.
create schema if not exists exam_private;
revoke all on schema exam_private from public, anon;
grant usage on schema exam_private to authenticated;
create table if not exists exam_private.bank (
 id text primary key, fingerprint text unique not null, content jsonb not null,
 source_revision text not null, enabled boolean not null default true
);
create table if not exists exam_private.presets (version text primary key, config jsonb not null);
insert into exam_private.presets values
 ('neetpg-180-v1', '{"version":"neetpg-180-v1","mode":"full","title":"NEET-PG Real Exam Simulation","totalQuestions":180,"maximumMarks":720,"numberOfSections":5,"questionsPerSection":36,"sectionDurationSeconds":2520,"totalDurationSeconds":12600,"correctMarks":4,"incorrectMarks":-1,"unattemptedMarks":0,"optionsPerQuestion":4,"language":"English","allowPause":false,"allowPreviousSection":false,"allowFutureSectionAccess":false,"allowEarlySectionExit":false,"allowTimeCarryForward":false,"autoAdvanceSection":true,"scoreAnsweredReviewQuestions":true,"ruleVerification":"UNVERIFIED_PRIMARY_SOURCE","assemblyVersion":"balanced-v1"}'),
 ('neetpg-drill-v1', '{"version":"neetpg-drill-v1","mode":"drill","title":"Section Drill","totalQuestions":36,"maximumMarks":144,"numberOfSections":1,"questionsPerSection":36,"sectionDurationSeconds":2520,"totalDurationSeconds":2520,"correctMarks":4,"incorrectMarks":-1,"unattemptedMarks":0,"optionsPerQuestion":4,"language":"English","allowPause":false,"allowPreviousSection":false,"allowFutureSectionAccess":false,"allowEarlySectionExit":false,"allowTimeCarryForward":false,"autoAdvanceSection":true,"scoreAnsweredReviewQuestions":true,"ruleVerification":"SIMULATION_DESIGN","assemblyVersion":"balanced-v1"}')
on conflict do nothing;
create table if not exists exam_private.attempts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 preset jsonb not null, seed text not null, blueprint jsonb not null,
 paper jsonb not null, responses jsonb not null,
 started_at timestamptz not null, expires_at timestamptz not null,
 status text not null default 'active' check(status in ('active','completed')),
 version integer not null default 0, active_section integer not null default 0,
 current_position integer not null default 0, last_seen timestamptz not null,
 result jsonb, completed_at timestamptz,
 check(jsonb_array_length(paper)=(preset->>'totalQuestions')::int),
 check(jsonb_array_length(responses)=jsonb_array_length(paper))
);
create unique index if not exists exam_one_active_user on exam_private.attempts(user_id) where status='active';
create index if not exists exam_user_history on exam_private.attempts(user_id,started_at desc);
alter table exam_private.bank enable row level security;
alter table exam_private.presets enable row level security;
alter table exam_private.attempts enable row level security;
revoke all on all tables in schema exam_private from public, anon, authenticated;

-- Only gateway can mutate private rows. No client clock, score, answer key or paper is trusted.
create or replace function exam_private.gateway(action text, attempt_id uuid, expected_version int, payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); a exam_private.attempts%rowtype; cfg jsonb; t timestamptz:=clock_timestamp();
 n int; k int; sec int; oldsec int; pos int; dest int; i int; c int; w int; u int;
 q jsonb; r jsonb; response jsonb; visible jsonb; rows jsonb; p jsonb; b jsonb;
 selected text; oldselected text; seed text; duration int; size int; delta numeric; error_text text;
begin
 if uid is null then raise exception 'Sign in to use the exam simulator' using errcode='42501'; end if;
 if action='history' then
  -- Reconcile abandoned expired attempts before listing history.
  select * into a from exam_private.attempts where user_id=uid and status='active';
  if found and a.expires_at<=t then perform exam_private.gateway('get',a.id,null,'{}'); end if;
  select coalesce(jsonb_agg(x),'[]') into rows from (
    select id,preset,started_at,completed_at,result,status from exam_private.attempts
    where user_id=uid order by started_at desc limit 100
  ) x;
  return jsonb_build_object('history',rows,'serverNow',t);
 end if;
 if action='start' then
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  select * into a from exam_private.attempts where user_id=uid and status='active' for update;
  if found then return exam_private.gateway('get',a.id,null,'{}'); end if;
  select config into cfg from exam_private.presets where version=payload->>'presetVersion';
  if cfg is null then raise exception 'Unknown exam preset'; end if;
  n:=(cfg->>'totalQuestions')::int; seed:=gen_random_uuid()::text;
  -- Deterministic seeded diversity: interleave subject strata; diversify systems,
  -- difficulty and question type within each stratum. No claimed official quotas.
  with candidates as (
   select bank.*, row_number() over(partition by content->>'subject',content->>'system',content->>'difficulty',content->>'exam_type'
    order by md5(seed||id)) detail_rank from exam_private.bank bank where enabled
  ), ranked as (
   select *,row_number() over(partition by content->>'subject' order by detail_rank,md5(seed||id)) subject_rank from candidates
  ), chosen as (
   select * from ranked order by subject_rank,md5(seed||coalesce(content->>'subject','')) limit n
  ), mixed as (
   select *,row_number() over(order by subject_rank,md5(seed||coalesce(content->>'subject',''))) - 1 seq from chosen
  )
  select jsonb_agg(content||jsonb_build_object('options',(
    select jsonb_agg(opt order by md5(seed||id||(opt->>'label')))
    from jsonb_array_elements(content->'options') opt
   )) order by (seq % (cfg->>'numberOfSections')::int), (seq / (cfg->>'numberOfSections')::int)) into p from mixed;
  if coalesce(jsonb_array_length(p),0)<>n then raise exception 'Insufficient unique suitable questions: % required',n; end if;
  select jsonb_object_agg(subject,cnt) into b from (select x->>'subject' subject,count(*) cnt from jsonb_array_elements(p) x group by 1) s;
  select jsonb_agg(jsonb_build_object('selected',null,'review',false,'visited',false,'timeSpent',0,'changes','[]'::jsonb)) into rows from generate_series(1,n);
  rows:=jsonb_set(rows,'{0,visited}','true');
  insert into exam_private.attempts(user_id,preset,seed,blueprint,paper,responses,started_at,expires_at,last_seen)
   values(uid,cfg,seed,jsonb_build_object('subjects',b,'algorithm',cfg->>'assemblyVersion','seed',seed),p,rows,t,t+make_interval(secs=>(cfg->>'totalDurationSeconds')::int),t) returning * into a;
 elsif action='active' then
  select * into a from exam_private.attempts where user_id=uid and status='active' for update;
  if not found then return jsonb_build_object('attempt',null,'serverNow',t); end if;
 else
  select * into a from exam_private.attempts where id=attempt_id and user_id=uid for update;
  if not found then raise exception 'Attempt unavailable' using errcode='42501'; end if;
 end if;
 t:=clock_timestamp(); -- use clock after lock acquisition, not transaction start
 cfg:=a.preset; n:=(cfg->>'totalQuestions')::int; size:=(cfg->>'questionsPerSection')::int;
 duration:=(cfg->>'sectionDurationSeconds')::int; k:=(cfg->>'numberOfSections')::int;
 sec:=least(k,floor(extract(epoch from (t-a.started_at))/duration)::int); oldsec:=a.active_section;
 if a.status='active' then
  -- Bounded visible dwell telemetry. Offline/background time is intentionally unknown.
  delta:=greatest(0,least(30,extract(epoch from (least(t,a.started_at+make_interval(secs=>(oldsec+1)*duration))-a.last_seen))));
  if action in ('mutate','heartbeat') and expected_version=a.version and coalesce((payload->>'visible')::boolean,false) and oldsec=sec then
   r:=a.responses->a.current_position;
   r:=jsonb_set(r,'{timeSpent}',to_jsonb(round(coalesce((r->>'timeSpent')::numeric,0)+delta,1)));
   a.responses:=jsonb_set(a.responses,array[a.current_position::text],r);
  end if;
  if sec<>oldsec then
   a.active_section:=sec; a.current_position:=least(n-1,sec*size); a.version:=a.version+1;
   if sec<k then a.responses:=jsonb_set(a.responses,array[a.current_position::text,'visited'],'true'); end if;
  end if;
  if sec>=k then
   select count(*) filter(where rr.r->>'selected'=pp.q->>'correct'),
          count(*) filter(where rr.r->>'selected' is not null and rr.r->>'selected'<>pp.q->>'correct'),
          count(*) filter(where rr.r->>'selected' is null)
    into c,w,u from jsonb_array_elements(a.paper) with ordinality pp(q,idx)
    join jsonb_array_elements(a.responses) with ordinality rr(r,idx) using(idx);
   if c+w+u<>n then raise exception 'Result validation failed'; end if;
   a.result:=jsonb_build_object('correct',c,'incorrect',w,'unattempted',u,
    'score',c*(cfg->>'correctMarks')::int+w*(cfg->>'incorrectMarks')::int,
    'maximumMarks',cfg->'maximumMarks','accuracy',case when c+w=0 then 0 else round(100.0*c/(c+w),1) end,
    'attemptRate',round(100.0*(c+w)/n,1));
   a.status:='completed'; a.completed_at:=a.expires_at; a.version:=a.version+1;
  elsif action='mutate' then
   pos:=(payload->>'position')::int;
   if expected_version is distinct from a.version then error_text:='STALE_VERSION';
   elsif pos is null or pos<sec*size or pos>=(sec+1)*size then error_text:='SECTION_LOCKED';
   else
    q:=a.paper->pos; r:=a.responses->pos;
    if payload ? 'selected' then
     selected:=payload->>'selected'; oldselected:=r->>'selected';
     if selected is not null and not exists(select 1 from jsonb_array_elements(q->'options') o where o->>'label'=selected) then
      raise exception 'Invalid option';
     end if;
     if selected is distinct from oldselected then
      r:=jsonb_set(r,'{changes}',(r->'changes')||jsonb_build_array(jsonb_build_object('from',oldselected,'to',selected,'at',t)));
      r:=r||jsonb_build_object('selected',selected,'lastChangedAt',t,'answeredAt',case when selected is not null then t else null end);
     end if;
    end if;
    if payload ? 'review' then r:=jsonb_set(r,'{review}',to_jsonb((payload->>'review')::boolean)); end if;
    r:=jsonb_set(r,'{visited}','true');
    a.responses:=jsonb_set(a.responses,array[pos::text],r);
    dest:=coalesce((payload->>'navigate')::int,pos);
    if dest<sec*size or dest>=(sec+1)*size then raise exception 'Cannot navigate outside active section'; end if;
    a.current_position:=dest; a.responses:=jsonb_set(a.responses,array[dest::text,'visited'],'true');
    a.version:=a.version+1;
   end if;
  elsif action not in ('get','active','start','heartbeat') then raise exception 'Illegal exam transition';
  end if;
  a.last_seen:=t;
  update exam_private.attempts set responses=a.responses,status=a.status,version=a.version,
   active_section=a.active_section,current_position=a.current_position,last_seen=a.last_seen,
   result=a.result,completed_at=a.completed_at where id=a.id;
 elsif action='mutate' then error_text:='ATTEMPT_COMPLETED';
 end if;
 if a.status='completed' then
  visible:=a.paper; rows:=a.responses;
 else
  -- Never return answer keys, explanations, metadata or future/locked questions while active.
  select jsonb_agg(jsonb_build_object('id',z.q->>'id','stem',z.q->>'stem','image',z.q->'image','table',z.q->'table',
   'options',z.q->'options','position',idx-1) order by idx) into visible
   from jsonb_array_elements(a.paper) with ordinality z(q,idx) where idx>sec*size and idx<=(sec+1)*size;
  select jsonb_agg(z.r order by idx) into rows from jsonb_array_elements(a.responses) with ordinality z(r,idx)
   where idx>sec*size and idx<=(sec+1)*size;
 end if;
 response:=jsonb_build_object('id',a.id,'preset',cfg,'status',a.status,'version',a.version,'activeSection',a.active_section,
  'currentPosition',a.current_position,'examStartedAt',a.started_at,'examExpiresAt',a.expires_at,
  'sectionStartedAt',a.started_at+make_interval(secs=>least(k-1,sec)*duration),
  'sectionExpiresAt',a.started_at+make_interval(secs=>least(k,sec+1)*duration),
  'questions',visible,'responses',rows,'result',a.result,'completedAt',a.completed_at);
 if a.status='completed' then response:=response||jsonb_build_object('blueprint',a.blueprint); end if;
 return jsonb_build_object('attempt',response,'serverNow',t,'error',error_text);
end $$;
revoke all on function exam_private.gateway(text,uuid,int,jsonb) from public,anon,authenticated;
grant execute on function exam_private.gateway(text,uuid,int,jsonb) to authenticated;
create or replace function public.exam_call(action text, attempt_id uuid default null, expected_version int default null, payload jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$
 select exam_private.gateway(action,attempt_id,expected_version,payload);
$$;
revoke all on function public.exam_call(text,uuid,int,jsonb) from public,anon,authenticated;
grant execute on function public.exam_call(text,uuid,int,jsonb) to authenticated;
