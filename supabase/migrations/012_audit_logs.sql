-- Audit Logs structure

CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Nullable if system action
    action VARCHAR(100) NOT NULL, -- e.g., 'INSERT', 'UPDATE', 'DELETE', or custom domain event 'ROLE_CHANGED'
    table_name VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL, -- The ID of the mutated record
    old_value JSONB,
    new_value JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Note: We store record_id as UUID since most of our tables use UUID primary keys.

-- Indexes
CREATE INDEX idx_audit_logs_actor_id ON public.audit_logs(actor_id);

CREATE INDEX idx_audit_logs_table_name ON public.audit_logs(table_name);

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at);

CREATE INDEX idx_audit_logs_record_id ON public.audit_logs(record_id);