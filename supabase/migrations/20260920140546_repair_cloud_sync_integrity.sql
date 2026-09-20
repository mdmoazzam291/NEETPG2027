-- Keep cloud study state aligned with practice-only SRS semantics.
-- Mock exam attempts remain in public.attempts/study_sessions for analytics,
-- but must not inflate question_state counters or streaks.

alter table public.study_sessions
  alter column accuracy type double precision
  using accuracy::double precision;

with mock_sessions as (
  select user_id, session_id
  from public.study_sessions
  where coalesce(mode,'') like 'Mock · %'
),
affected_qids as (
  select distinct a.user_id,a.qid
  from public.attempts a
  join mock_sessions m using(user_id,session_id)
),
practice_ranked as (
  select a.user_id,a.qid,a.correct,
         row_number() over(partition by a.user_id,a.qid order by a.happened_at desc,a.client_key desc) as rn
  from public.attempts a
  left join mock_sessions m using(user_id,session_id)
  where m.session_id is null
),
practice_windowed as (
  select *,
         min(rn) filter(where not correct) over(partition by user_id,qid) as first_bad_rn
  from practice_ranked
),
practice_agg as (
  select user_id,qid,
         count(*)::int as attempts,
         count(*) filter(where correct)::int as correct,
         count(*) filter(where not correct)::int as incorrect,
         count(*) filter(where correct and (first_bad_rn is null or rn<first_bad_rn))::int as streak
  from practice_windowed
  group by user_id,qid
),
practice_last as (
  select distinct on(user_id,qid) user_id,qid,correct as last_correct
  from practice_ranked
  order by user_id,qid,rn
),
repair as (
  select aq.user_id,aq.qid,
         coalesce(pa.attempts,0) as attempts,
         coalesce(pa.correct,0) as correct,
         coalesce(pa.incorrect,0) as incorrect,
         pl.last_correct,
         coalesce(pa.streak,0) as streak
  from affected_qids aq
  left join practice_agg pa using(user_id,qid)
  left join practice_last pl using(user_id,qid)
)
update public.question_state qs
set attempts=r.attempts,
    correct=r.correct,
    incorrect=r.incorrect,
    last_correct=r.last_correct,
    streak=r.streak,
    updated_at=now()
from repair r
where qs.user_id=r.user_id and qs.qid=r.qid
  and (qs.attempts,qs.correct,qs.incorrect,qs.last_correct,qs.streak)
      is distinct from
      (r.attempts,r.correct,r.incorrect,r.last_correct,r.streak);
