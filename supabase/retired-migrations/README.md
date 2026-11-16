# Retired migrations

This folder contains migration proposals that must not be applied.

- 20261112190000_allow_users_to_unlink_own_telegram.sql was superseded by the authenticated server endpoint netlify/functions/telegram-unlink.mjs. The endpoint validates the bearer user and active session, deletes only that user's Telegram connection with the service role, verifies deletion, and clears temporary pairing data. A direct authenticated DELETE RLS policy is intentionally not granted.
