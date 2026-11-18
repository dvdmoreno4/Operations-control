-- Migration 005: station IA-11 (the former SUB-IA corner) belongs to Nuevo y Acciones.
-- The station id stays the same, so an assigned member keeps their place. Safe to run more than once.

update stations set department_key = 'nuevo_acciones' where id = 'IA-11';
