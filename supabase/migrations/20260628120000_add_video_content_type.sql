-- Feature de vídeo animado (Grok via Replicate): permite content_type = 'video' em generated_contents.
alter table generated_contents drop constraint if exists generated_contents_content_type_check;
alter table generated_contents add constraint generated_contents_content_type_check
  check (content_type = any (array['post', 'story', 'carousel', 'document', 'article', 'cron_config', 'video']));
