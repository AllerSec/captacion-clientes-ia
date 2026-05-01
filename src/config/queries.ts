// Una query por día de la semana (1=lun, 5=vie). Domingo y sábado: nada.
// Edita libremente. Se rota usando el día de la semana actual.
export const DAILY_QUERIES: Record<number, string[]> = {
  1: ['clínica dental Bilbao', 'clínica dental Donostia'],
  2: ['fisioterapia Bilbao', 'fisioterapia Vitoria'],
  3: ['centro estético Donostia', 'centro estético Bilbao'],
  4: ['clínica veterinaria Bizkaia', 'clínica veterinaria Gipuzkoa'],
  5: ['podólogo País Vasco', 'óptica País Vasco'],
};

export function getQueriesForToday(date = new Date()): string[] {
  const day = date.getDay();
  return DAILY_QUERIES[day] ?? [];
}
