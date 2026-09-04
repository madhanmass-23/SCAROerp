-- Company Settings structure

CREATE TABLE public.company_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1), -- Enforce single row
    company_name VARCHAR(255) NOT NULL DEFAULT 'SCARO',
    timezone VARCHAR(100) NOT NULL DEFAULT 'Asia/Kolkata',
    working_days JSONB NOT NULL DEFAULT '["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]'::jsonb,
    work_start_time TIME NOT NULL DEFAULT '09:00:00',
    work_end_time TIME NOT NULL DEFAULT '17:00:00',
    daily_report_reminder_time TIME NOT NULL DEFAULT '16:30:00',
    late_threshold_minutes INTEGER NOT NULL DEFAULT 15,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);