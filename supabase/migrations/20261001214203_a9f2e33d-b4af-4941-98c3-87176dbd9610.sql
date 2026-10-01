CREATE OR REPLACE FUNCTION public.detect_seniority_band(headline text)
 RETURNS seniority_band
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when headline is null or btrim(headline)='' then null
    -- academic: room
    when headline ~* '(\m(dean|vice[- ]?dean|provost|rector|full professor)\M|(?<!assistant |associate |adjunct )\mprofessor\M)'
      or headline ~ '(عميد|وكيل الكلية|بروفيسور|بروفسور|[أا]ستاذ(?!\s+(مساعد|مشارك)))' then 'room'::seniority_band
    -- academic: table
    when headline ~* '(assistant professor|associate professor|head of department|department chair)'
      or headline ~ '([أا]ستاذ\s+مساعد|[أا]ستاذ\s+مشارك|رئيس قسم)' then 'table'::seniority_band
    -- academic: work
    when headline ~* '(\mlecturer\M|teaching assistant|\mresearcher\M|research fellow|\mpostdoc)'
      or headline ~ '(محاضر|معيد|باحث)' then 'work'::seniority_band
    -- existing rules, unchanged
    when headline ~* '\mchief (specialist|engineer|accountant|analyst|architect|nurse|pharmacist)\M' then 'table'::seniority_band
    when headline ~* '(\mchief \w+ officer\M|\mc[efiotmdhr]o\M|\mfounder\M|co-founder|\mpresident\M|managing partner|managing director|\mowner\M|group (head|ceo)|\mchairman\M|board member|\mboard\M|\msvp\M|\mevp\M|\mvp\M|vice president)' then 'room'::seniority_band
    when headline ~* '(\mdirector\M|\mpartner\M|head of|general manager|\mgm\M|senior manager|associate director|\mprincipal\M|\mfellow\M|\madvisor\M|\madviser\M)' then 'table'::seniority_band
    when headline ~* '(\mmanager\M|\mlead\M|\msenior\M|\mconsultant\M|\mspecialist\M|\mengineer\M|\manalyst\M|\massociate\M)' then 'work'::seniority_band
    else null end;
$function$;

INSERT INTO public.seniority_titles (title, band, position, active) VALUES
 ('Professor','room',100,true),('Dean','room',101,true),
 ('Assistant Professor','table',102,true),('Associate Professor','table',103,true),('Head of Department','table',104,true),
 ('Lecturer / Researcher','work',105,true);

UPDATE public.seniority_titles s SET position = v.p FROM (VALUES
 ('Founder',1),('C-Suite',2),('Board Member',3),('SVP / EVP',4),('VP',5),('Dean',6),('Professor',7),
 ('Partner',8),('Senior Director',9),('Director',10),('Senior Manager',11),('Principal / Fellow',12),('Advisor',13),
 ('Head of Department',14),('Associate Professor',15),('Assistant Professor',16),
 ('Manager',17),('Senior Consultant',18),('Consultant',19),('Analyst / Associate',20),('Specialist / Engineer',21),
 ('Lecturer / Researcher',22),('Other',23)
) v(t,p) WHERE s.title = v.t;