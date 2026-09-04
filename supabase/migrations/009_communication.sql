-- Direct Communication structure (Simplified V1)

CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE, -- Null if sending to a generic task/channel
    task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE, -- Optional task context
    content TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT messages_target_check CHECK (recipient_id IS NOT NULL OR task_id IS NOT NULL)
);

-- Note: In V1, we use direct DMs (sender -> recipient) or Task Discussions (task_comments table from 006).
-- The current messages table is primarily for 1-1 DMs and task-based messages.

-- Indexes
CREATE INDEX idx_messages_sender_id ON public.messages(sender_id);

CREATE INDEX idx_messages_recipient_id ON public.messages(recipient_id);

CREATE INDEX idx_messages_created_at ON public.messages(created_at);