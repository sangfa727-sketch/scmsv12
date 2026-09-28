ALTER TABLE public.fee_items ADD CONSTRAINT fee_items_default_amount_nonnegative CHECK (default_amount >= 0);
ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_amount_nonnegative CHECK (amount >= 0);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_total_amount_positive CHECK (total_amount > 0);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_paid_amount_nonnegative CHECK (paid_amount >= 0);
ALTER TABLE public.payments ADD CONSTRAINT payments_amount_positive CHECK (amount > 0);