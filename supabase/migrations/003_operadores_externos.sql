-- Migration 003: the left column of IA stations (IA-7 to IA-10) becomes its own area,
-- "Operadores externos". Station ids stay the same, so assigned members keep their place.
-- Safe to run more than once.

insert into departments (key, label, short, color)
values ('operadores_externos', 'Operadores externos', 'Op. externos', '#8b5cf6')
on conflict (key) do update set label = excluded.label, short = excluded.short, color = excluded.color;

update stations set department_key = 'operadores_externos' where id in ('IA-7', 'IA-8', 'IA-9', 'IA-10');
