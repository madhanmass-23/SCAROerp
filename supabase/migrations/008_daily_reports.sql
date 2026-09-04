-- Daily Reports structure

CREATE TABLE public.daily_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'Draft',
    tomorrow_plan TEXT,
    blockers TEXT,
    company_requirements TEXT,
    notes TEXT,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, report_date)
);

CREATE TABLE public.daily_report_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
    task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL, -- Task might be deleted but report should remain
    time_spent_minutes INTEGER CHECK (time_spent_minutes >= 0),
    completion_percentage INTEGER CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
    task_status public.task_status_type,
    custom_task_title VARCHAR(255) -- In case they worked on something not in tasks table
);

-- Indexes
CREATE INDEX idx_daily_reports_user_id ON public.daily_reports(user_id);

CREATE INDEX idx_daily_reports_report_date ON public.daily_reports(report_date);

CREATE INDEX idx_daily_report_tasks_report_id ON public.daily_report_tasks(report_id);