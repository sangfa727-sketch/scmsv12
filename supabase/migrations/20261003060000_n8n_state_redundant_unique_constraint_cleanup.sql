-- n8n_state.telegram_id is already the primary key; remove the redundant UNIQUE constraint.
ALTER TABLE public.n8n_state DROP CONSTRAINT IF EXISTS n8n_state_telegram_id_key;
