UPDATE public.oe_opportunity_kinds SET
  detect_ar = '(فتح باب الترشيح|يدعو الراغبين في الترشح|استقبال طلبات الترشح|الراغبين في الترشح[\s\S]{0,120}يتقدموا)'
WHERE code = 'board_seat';
SELECT public.oe_apply_shape_state();