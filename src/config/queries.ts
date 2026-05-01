/**
 * Queries por tier. Tier 1 = más cerca de Irún, Tier 8 = más lejos.
 * El sistema usa estas en orden: cuando se agotan las del tier actual, salta al siguiente.
 * Sectores priorizados: clínicas dentales/estéticas/veterinarias/fisio, despachos,
 * inmobiliarias, asesorías, ortodoncistas, podólogos, centros médicos privados.
 */
export const QUERIES_BY_TIER: Record<number, string[]> = {
  // ===== TIER 1: Irún + Hondarribia + Hendaya (vecinos) =====
  1: [
    'clínica dental Irún', 'clínica estética Irún', 'fisioterapia Irún',
    'podólogo Irún', 'veterinaria Irún', 'ortodoncia Irún',
    'centro médico privado Irún', 'asesoría Irún', 'inmobiliaria Irún',
    'reformas Irún', 'despacho abogados Irún',
    'clínica dental Hondarribia', 'clínica estética Hondarribia',
    'fisioterapia Hondarribia', 'veterinaria Hondarribia',
    'inmobiliaria Hondarribia', 'asesoría Hondarribia',
  ],

  // ===== TIER 2: Resto Gipuzkoa =====
  2: [
    'clínica dental Donostia', 'clínica estética Donostia',
    'fisioterapia Donostia', 'podólogo Donostia', 'veterinaria Donostia',
    'ortodoncia Donostia', 'asesoría Donostia', 'inmobiliaria Donostia',
    'despacho abogados Donostia',
    'clínica dental Tolosa', 'fisioterapia Tolosa', 'veterinaria Tolosa',
    'clínica dental Eibar', 'fisioterapia Eibar',
    'clínica dental Zarautz', 'clínica estética Zarautz',
    'clínica dental Hernani', 'clínica dental Bergara',
    'clínica dental Beasain', 'clínica dental Azpeitia',
    'clínica dental Zumaia', 'clínica dental Lasarte',
    'clínica dental Andoain', 'clínica dental Errenteria',
  ],

  // ===== TIER 3: Bizkaia =====
  3: [
    'clínica dental Bilbao', 'clínica estética Bilbao',
    'fisioterapia Bilbao', 'podólogo Bilbao', 'veterinaria Bilbao',
    'ortodoncia Bilbao', 'asesoría Bilbao', 'inmobiliaria Bilbao',
    'despacho abogados Bilbao',
    'clínica dental Getxo', 'clínica estética Getxo',
    'fisioterapia Getxo', 'veterinaria Getxo',
    'clínica dental Durango', 'fisioterapia Durango',
    'clínica dental Barakaldo', 'clínica dental Portugalete',
    'clínica dental Basauri', 'clínica dental Sestao',
    'clínica dental Erandio', 'clínica dental Leioa',
    'clínica dental Mungia', 'clínica dental Bermeo',
    'clínica dental Galdakao', 'clínica dental Amorebieta',
  ],

  // ===== TIER 4: Navarra =====
  4: [
    'clínica dental Pamplona', 'clínica estética Pamplona',
    'fisioterapia Pamplona', 'podólogo Pamplona', 'veterinaria Pamplona',
    'ortodoncia Pamplona', 'asesoría Pamplona', 'inmobiliaria Pamplona',
    'despacho abogados Pamplona',
    'clínica dental Tudela', 'fisioterapia Tudela', 'veterinaria Tudela',
    'clínica dental Estella', 'clínica dental Tafalla',
    'clínica dental Sangüesa', 'clínica dental Burlada',
    'clínica dental Barañáin', 'clínica dental Zizur',
  ],

  // ===== TIER 5: Álava =====
  5: [
    'clínica dental Vitoria', 'clínica estética Vitoria',
    'fisioterapia Vitoria', 'podólogo Vitoria', 'veterinaria Vitoria',
    'ortodoncia Vitoria', 'asesoría Vitoria', 'inmobiliaria Vitoria',
    'despacho abogados Vitoria',
    'clínica dental Llodio', 'clínica dental Amurrio',
    'clínica dental Salvatierra',
  ],

  // ===== TIER 6: Cantabria + La Rioja + Burgos =====
  6: [
    'clínica dental Santander', 'clínica estética Santander',
    'fisioterapia Santander', 'veterinaria Santander',
    'ortodoncia Santander', 'asesoría Santander',
    'clínica dental Castro Urdiales', 'clínica dental Laredo',
    'clínica dental Torrelavega', 'clínica dental Reinosa',
    'clínica dental Logroño', 'clínica estética Logroño',
    'fisioterapia Logroño', 'veterinaria Logroño',
    'clínica dental Calahorra', 'clínica dental Haro',
    'clínica dental Burgos', 'fisioterapia Burgos',
    'clínica dental Miranda de Ebro', 'clínica dental Aranda de Duero',
  ],

  // ===== TIER 7: Resto Norte (Asturias, Galicia, León, Zaragoza, Huesca) =====
  7: [
    'clínica dental Oviedo', 'clínica dental Gijón', 'clínica dental Avilés',
    'clínica dental Mieres', 'clínica dental Langreo',
    'clínica dental Coruña', 'clínica dental Vigo', 'clínica dental Santiago de Compostela',
    'clínica dental Lugo', 'clínica dental Ourense', 'clínica dental Pontevedra',
    'clínica dental Ferrol',
    'clínica dental León', 'clínica dental Ponferrada', 'clínica dental Zamora',
    'clínica dental Salamanca', 'clínica dental Valladolid', 'clínica dental Palencia',
    'clínica dental Zaragoza', 'clínica dental Huesca', 'clínica dental Teruel',
    'clínica dental Jaca',
  ],

  // ===== TIER 8: Resto España (Madrid, Cataluña, Valencia, Andalucía, Levante, Baleares) =====
  8: [
    'clínica dental Madrid', 'clínica dental Alcalá de Henares',
    'clínica dental Móstoles', 'clínica dental Getafe', 'clínica dental Leganés',
    'clínica dental Alcorcón', 'clínica dental Fuenlabrada',
    'clínica dental Barcelona', 'clínica dental Hospitalet',
    'clínica dental Badalona', 'clínica dental Sabadell', 'clínica dental Terrassa',
    'clínica dental Mataró', 'clínica dental Girona', 'clínica dental Lleida',
    'clínica dental Tarragona', 'clínica dental Reus',
    'clínica dental Valencia', 'clínica dental Castellón', 'clínica dental Alicante',
    'clínica dental Elche', 'clínica dental Torrevieja', 'clínica dental Gandía',
    'clínica dental Sevilla', 'clínica dental Málaga', 'clínica dental Granada',
    'clínica dental Córdoba', 'clínica dental Cádiz', 'clínica dental Almería',
    'clínica dental Huelva', 'clínica dental Jaén', 'clínica dental Marbella',
    'clínica dental Murcia', 'clínica dental Cartagena', 'clínica dental Lorca',
    'clínica dental Palma', 'clínica dental Ibiza',
    'clínica dental Tenerife', 'clínica dental Las Palmas',
  ],
};

export const MAX_TIER = 8;

/** Mapea tier number → human-readable region name (para notificaciones). */
export const TIER_NAMES: Record<number, string> = {
  1: 'Irún + Hondarribia + Hendaya',
  2: 'Gipuzkoa',
  3: 'Bizkaia',
  4: 'Navarra',
  5: 'Álava',
  6: 'Cantabria + La Rioja + Burgos',
  7: 'Norte (Asturias, Galicia, León, Aragón)',
  8: 'Resto España (Madrid, Cataluña, Valencia, Andalucía...)',
};
