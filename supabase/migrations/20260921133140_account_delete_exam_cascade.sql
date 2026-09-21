alter table exam_private.attempts
  drop constraint if exists attempts_user_id_fkey;

alter table exam_private.attempts
  add constraint attempts_user_id_fkey
  foreign key (user_id)
  references auth.users(id)
  on delete cascade;
