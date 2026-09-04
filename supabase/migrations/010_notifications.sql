-- Notifications structure

CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL, -- e.g., 'task_assigned', 'meeting_reminder'
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    reference_id UUID, -- Can refer to task_id, meeting_id, etc.
    reference_type VARCHAR(100), -- Identifies the table of reference_id
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);

CREATE INDEX idx_notifications_is_read ON public.notifications(is_read);

CREATE INDEX idx_notifications_created_at ON public.notifications(created_at);