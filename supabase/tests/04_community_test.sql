-- Helpful votes, bookmarks, views and comments.
begin;
\ir helpers.psql
select no_plan();

create temp table ids (k text primary key, v uuid);
grant select, insert on ids to authenticated, anon;
insert into ids values
  ('alice', pg_temp.make_user('27z001@psgtech.ac.in', 'Alice A')),
  ('bob',   pg_temp.make_user('27z002@psgtech.ac.in', 'Bob B'));

select pg_temp.login((select v from ids where k = 'alice'));
insert into ids select 'e1', (save_draft(pg_temp.payload()) ->> 'id')::uuid;
select publish_experience((select v from ids where k = 'e1'));
insert into ids select 'anon', (save_draft(pg_temp.payload('zoho-corporation', 'Member Technical Staff', '{"is_anonymous": true}')) ->> 'id')::uuid;
select publish_experience((select v from ids where k = 'anon'));
insert into ids select 'draft', (save_draft(pg_temp.payload('microsoft', 'Software Engineer Intern')) ->> 'id')::uuid;

-- ---- votes
select is(pg_temp.err($$insert into helpful_votes (experience_id) values ((select v from ids where k = 'e1'))$$), '42501', 'you cannot vote on your own experience');
select pg_temp.logout();

select pg_temp.login((select v from ids where k = 'bob'));
select is(pg_temp.err($$insert into helpful_votes (experience_id) values ((select v from ids where k = 'e1'))$$), 'ok', 'a student can vote on someone else’s experience');
select is((select helpful_count from experience_feed where id = (select v from ids where k = 'e1')), 1, 'the helpful count goes up');
select ok((select has_voted from experience_feed where id = (select v from ids where k = 'e1')), 'the feed shows the student has voted');
select is(pg_temp.err($$insert into helpful_votes (experience_id) values ((select v from ids where k = 'e1'))$$), '23505', 'you cannot vote twice');
select is(pg_temp.err($$insert into helpful_votes (user_id, experience_id) values ((select v from ids where k = 'alice'), (select v from ids where k = 'anon'))$$), '42501', 'you cannot vote as someone else');
select is(pg_temp.err($$insert into helpful_votes (experience_id) values ((select v from ids where k = 'draft'))$$), '42501', 'you cannot vote on a draft');
select is(pg_temp.err($$delete from helpful_votes where experience_id = (select v from ids where k = 'e1')$$), 'ok', 'you can remove your vote');
select is((select helpful_count from experience_feed where id = (select v from ids where k = 'e1')), 0, 'the helpful count goes back down');

-- ---- bookmarks
select is(pg_temp.err($$insert into bookmarks (experience_id) values ((select v from ids where k = 'e1'))$$), 'ok', 'a student can save an experience');
select is(pg_temp.err($$insert into bookmarks (experience_id) values ((select v from ids where k = 'draft'))$$), '42501', 'you cannot save someone else’s draft');
select pg_temp.logout();
select pg_temp.login((select v from ids where k = 'alice'));
select is(pg_temp.n('select 1 from bookmarks'), 0::bigint, 'saved lists are private');
select is(pg_temp.n('select 1 from helpful_votes'), 0::bigint, 'votes of others are private');
select pg_temp.logout();

-- ---- views
select pg_temp.login((select v from ids where k = 'bob'));
select record_view((select v from ids where k = 'e1'));
select record_view((select v from ids where k = 'e1'));
select is((select view_count from experience_feed where id = (select v from ids where k = 'e1')), 1, 'repeat views within a day count once');
select is(pg_temp.n('select 1 from experience_views'), 1::bigint, 'a student sees their own recently viewed list');
select is(pg_temp.err($$insert into experience_views (experience_id) values ((select v from ids where k = 'e1'))$$), '42501', 'views can only be recorded through the RPC');

-- ---- comments
select is(pg_temp.err($$insert into comments (experience_id, body) values ((select v from ids where k = 'e1'), 'Great write-up, thanks!')$$), 'ok', 'a student can comment on a published experience');
select is((select comment_count from experience_feed where id = (select v from ids where k = 'e1')), 1, 'the comment count goes up');
select ok(pg_temp.err($$insert into comments (experience_id, body) values ((select v from ids where k = 'draft'), 'Sneaky comment')$$) in ('not_found', '42501'), 'you cannot comment on a draft');
select is(pg_temp.err($$insert into comments (experience_id, body, author_id) values ((select v from ids where k = 'e1'), 'Impersonation', (select v from ids where k = 'alice'))$$), '42501', 'you cannot comment as someone else');
select pg_temp.logout();

select pg_temp.login((select v from ids where k = 'alice'));
select is(pg_temp.err($$insert into comments (experience_id, parent_id, body)
  values ((select v from ids where k = 'e1'), (select id from comment_feed where experience_id = (select v from ids where k = 'e1') and parent_id is null limit 1), 'Thanks Bob!')$$),
  'ok', 'the author can reply to someone else’s comment');
select is(pg_temp.err($$update comments set body = 'edited by alice' where author_id = (select v from ids where k = 'bob')$$), 'ok', 'editing someone else’s comment is a silent no-op…');
select pg_temp.logout();
select is((select body from comments where author_id = (select v from ids where k = 'bob')), 'Great write-up, thanks!', '…and their comment is unchanged');

select pg_temp.login((select v from ids where k = 'bob'));
select is(pg_temp.err($$insert into comments (experience_id, parent_id, body)
  values ((select v from ids where k = 'e1'), (select id from comment_feed where parent_id is not null limit 1), 'Reply to a reply')$$),
  'invalid_parent', 'replies are one level deep');
select is(pg_temp.err($$update comments set body = 'Great write-up, thank you!' where author_id = auth.uid()$$), 'ok', 'you can edit your comment within 15 minutes');
select isnt((select edited_at from comments where author_id = auth.uid()), null, 'the edit is timestamped');
select is(pg_temp.err($$update comments set status = 'hidden' where author_id = auth.uid()$$), 'forbidden', 'you cannot apply moderation states to your own comment');
select is(pg_temp.err($$update comments set author_id = null where author_id = auth.uid()$$), '42501', 'you cannot reassign a comment');

-- anonymous author's reply stays anonymous
insert into comments (experience_id, body) values ((select v from ids where k = 'anon'), 'Was there a GD round?');
select pg_temp.logout();
select pg_temp.login((select v from ids where k = 'alice'));
insert into comments (experience_id, parent_id, body)
  select (select v from ids where k = 'anon'), id, 'No GD this year.' from comment_feed where experience_id = (select v from ids where k = 'anon') limit 1;
select pg_temp.logout();
select pg_temp.login((select v from ids where k = 'bob'));
select ok((select author_name is null and is_experience_author from comment_feed where body = 'No GD this year.'), 'an anonymous author’s reply shows as “Author” without a name');
select is((select author_name from comment_feed where body = 'Was there a GD round?'), 'Bob B', 'other commenters are named');
select is(pg_temp.n('select 1 from comments'), 2::bigint, 'the base comments table shows only your own comments');

-- delete and undo
select is(pg_temp.err($$update comments set status = 'deleted' where body = 'Was there a GD round?'$$), 'ok', 'you can delete your comment');
select is((select body from comment_feed where status = 'deleted' limit 1), null, 'a deleted comment’s text is hidden in the feed');
select is(pg_temp.err($$update comments set status = 'visible' where body = 'Was there a GD round?'$$), 'ok', 'you can undo your own delete');
select pg_temp.logout();

-- edit window, flags, rate limit
update comments set created_at = now() - interval '1 hour' where author_id = (select v from ids where k = 'bob');
select pg_temp.login((select v from ids where k = 'bob'));
select is(pg_temp.err($$update comments set body = 'Too late to edit' where author_id = auth.uid() and parent_id is null and experience_id = (select v from ids where k = 'e1')$$), 'edit_window', 'comments can’t be edited after 15 minutes');
select pg_temp.logout();
update platform_settings set flags = flags || '{"comments": false}';
select pg_temp.login((select v from ids where k = 'bob'));
select is(pg_temp.err($$insert into comments (experience_id, body) values ((select v from ids where k = 'e1'), 'Comments are off')$$), 'comments_disabled', 'the comments flag turns commenting off');
select pg_temp.logout();
update platform_settings set flags = flags || '{"comments": true}', limits = limits || '{"comments_per_hour": 1}';
update comments set created_at = now() where author_id = (select v from ids where k = 'bob');
select pg_temp.login((select v from ids where k = 'bob'));
select is(pg_temp.err($$insert into comments (experience_id, body) values ((select v from ids where k = 'e1'), 'One too many')$$), 'rate_limited', 'the hourly comment limit applies');
select pg_temp.logout();

select * from finish();
rollback;
