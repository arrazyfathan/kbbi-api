-- Run only during production activation, after the backend, Android, and Studio
-- integrations have been verified. Never commit the real URL or secret.
-- First store the full dispatch URL and NOTIFICATION_CRON_SECRET in Vault:
-- select vault.create_secret('<https://api.example.com/api/v1/internal/notifications/dispatch>', 'notification_dispatch_url');
-- select vault.create_secret('<same secret as backend environment>', 'notification_cron_secret');

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule('notification-dispatch', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'notification_dispatch_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'notification_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
$$);

-- Rollback of scheduler activation: select cron.unschedule('notification-dispatch');
