// Floor plan of the HQ (see Esquema.png). Coordinates are in the SVG viewBox units used by FloorPlan.tsx.

export type DepartmentKey =
  | 'ia_cfd'
  | 'operadores_externos'
  | 'nuevo_acciones'
  | 'materias_primas'
  | 'mercados_internacionales'
  | 'gerencia';

export const DEPARTMENTS: Record<DepartmentKey, { label: string; short: string; color: string }> = {
  ia_cfd: { label: "Departamento IA y CFD's", short: "IA y CFD's", color: '#84cc16' },
  operadores_externos: { label: 'Operadores externos', short: 'Op. externos', color: '#8b5cf6' },
  // Key kept for existing data; the department is now "Acciones y Portafolios".
  nuevo_acciones: { label: 'Departamento de Acciones y Portafolios', short: 'Acciones y Portafolios', color: '#14b8a6' },
  materias_primas: { label: 'Departamento de Materias primas y coberturas', short: 'Materias primas', color: '#f97316' },
  mercados_internacionales: { label: 'Departamento de Mercados Internacionales', short: 'Mercados Int.', color: '#eab308' },
  gerencia: { label: 'Gerencia', short: 'Gerencia', color: '#6b7280' },
};

export const DEPARTMENT_KEYS = Object.keys(DEPARTMENTS) as DepartmentKey[];

export type Zone = {
  id: string;
  department: DepartmentKey;
  points: string;
  label: string;
  labelX: number;
  labelY: number;
  /** Labels drawn outside the zone use the department color instead of white. */
  labelOutside?: boolean;
  labelAnchor?: 'start' | 'middle' | 'end';
  /** Rotation of the label in degrees around its anchor, e.g. -90 for a vertical strip. */
  labelRotate?: number;
};

export const ZONES: Zone[] = [
  { id: 'ia', department: 'ia_cfd', points: '0,0 340,0 340,28 0,28', label: "IA y CFD's", labelX: 167.5, labelY: 16 },
  // Left column (IA-7 to IA-10): the label runs vertically beside the computers.
  {
    id: 'externos',
    department: 'operadores_externos',
    points: '0,28 28,28 28,190 0,190',
    label: 'OPERADORES EXTERNOS',
    labelX: 25.5,
    labelY: 110,
    labelRotate: -90,
  },
  {
    // Includes the former SUB-IA corner (station IA-11), which belongs to Acciones y Portafolios.
    id: 'nuevo',
    department: 'nuevo_acciones',
    points: '68,92 122,92 250,90 276,132 272,170 160,170 84,152 76,120',
    label: 'ACCIONES Y PORTAFOLIOS',
    labelX: 192,
    labelY: 124,
  },
  {
    id: 'materias',
    department: 'materias_primas',
    points: '304,100 330,100 330,176 304,176',
    label: 'MATERIAS PRIMAS Y COBERTURAS',
    labelX: 338,
    labelY: 80,
    labelOutside: true,
    labelAnchor: 'end',
  },
  {
    id: 'mercados',
    department: 'mercados_internacionales',
    points: '95,228 248,228 248,252 95,252',
    label: 'MERCADOS INTERNACIONALES',
    labelX: 171,
    labelY: 221,
    labelOutside: true,
  },
  { id: 'gerencia', department: 'gerencia', points: '0,196 50,196 63,209 63,268 0,268', label: 'GERENCIA', labelX: 30, labelY: 214 },
];

export type Station = { id: string; department: DepartmentKey; x: number; y: number };

const station = (id: string, department: DepartmentKey, x: number, y: number): Station => ({ id, department, x, y });

export const STATIONS: Station[] = [
  ...[40, 85, 130, 205, 250, 295].map((x, i) => station(`IA-${i + 1}`, 'ia_cfd', x, 14)),
  // Ids kept as IA-7..IA-10 so members already assigned there stay in place.
  ...[56, 92, 128, 164].map((y, i) => station(`IA-${i + 7}`, 'operadores_externos', 14, y)),
  // Id kept as IA-11 so a member already assigned there stays in place.
  station('IA-11', 'nuevo_acciones', 99, 108),
  station('NA-1', 'nuevo_acciones', 208, 106),
  station('NA-2', 'nuevo_acciones', 113, 138),
  station('NA-3', 'nuevo_acciones', 234, 144),
  station('MP-1', 'materias_primas', 317, 138),
  station('MI-1', 'mercados_internacionales', 133, 240),
  station('MI-2', 'mercados_internacionales', 210, 240),
  station('GER-1', 'gerencia', 32, 236),
];

const STATION_BY_ID = new Map(STATIONS.map((s) => [s.id, s]));

export const findStation = (id: string) => STATION_BY_ID.get(id);
