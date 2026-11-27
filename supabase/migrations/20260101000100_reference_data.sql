-- ============================================================================
-- Data Science SFE — reference data (badges + points defaults)
-- File: supabase/migrations/20260101000100_reference_data.sql
-- Run after 20260101000000_init.sql.
-- ============================================================================

insert into public.points_config (id)
values (1)
on conflict (id) do nothing;

update public.points_config
   set homework_weight   = coalesce(homework_weight, 1.00),
       attendance_points = coalesce(attendance_points, 10),
       on_time_bonus     = coalesce(on_time_bonus, 5),
       streak_bonus      = coalesce(streak_bonus, 15)
 where id = 1;

insert into public.badges (code, name_en, name_ar, description_en, description_ar, icon)
values
  ('first_submission',
   'First Steps',
   'الخطوة الأولى',
   'Submitted your first assignment.',
   'سلّمت أول واجب لك.',
   '🚀'),
  ('first_to_submit',
   'Fast Starter',
   'الأسرع',
   'First student to submit an assignment.',
   'أول طالب يسلّم الواجب.',
   '⚡'),
  ('attendance_streak_5',
   'Five in a Row',
   'خمسة على التوالي',
   'Attended five sessions in a row.',
   'حضرت خمس جلسات متتالية.',
   '🔥'),
  ('perfect_score',
   'Perfect Score',
   'الدرجة الكاملة',
   'Earned full marks on an assignment.',
   'حصلت على الدرجة الكاملة في واجب.',
   '💯'),
  ('comeback',
   'Comeback',
   'العودة القوية',
   'Improved your score with a resubmission.',
   'حسّنت درجتك بإعادة التسليم.',
   '📈')
on conflict (code) do update
  set name_en        = excluded.name_en,
      name_ar        = excluded.name_ar,
      description_en = excluded.description_en,
      description_ar = excluded.description_ar,
      icon           = excluded.icon;

notify pgrst, 'reload schema';
