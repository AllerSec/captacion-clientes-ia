/**
 * Queries por tier. Tier 1 = más cerca de Irún, Tier 8 = más lejos.
 * Sectores: óptica, taller mecánico, farmacia.
 * Solo contactamos negocios SIN web: el sistema descarta los que tienen.
 */
export const QUERIES_BY_TIER: Record<number, string[]> = {
  // ===== TIER 1: Irún + Hondarribia =====
  1: [
    'óptica Irún', 'taller mecánico Irún', 'farmacia Irún',
    'óptica Hondarribia', 'taller mecánico Hondarribia', 'farmacia Hondarribia',
  ],

  // ===== TIER 2: Resto Gipuzkoa =====
  2: [
    'óptica Donostia', 'taller mecánico Donostia', 'farmacia Donostia',
    'óptica Tolosa', 'taller mecánico Tolosa', 'farmacia Tolosa',
    'óptica Eibar', 'taller mecánico Eibar', 'farmacia Eibar',
    'óptica Zarautz', 'taller mecánico Zarautz', 'farmacia Zarautz',
    'óptica Hernani', 'taller mecánico Hernani', 'farmacia Hernani',
    'óptica Errenteria', 'taller mecánico Errenteria', 'farmacia Errenteria',
    'óptica Andoain', 'taller mecánico Andoain', 'farmacia Andoain',
    'óptica Lasarte', 'taller mecánico Lasarte', 'farmacia Lasarte',
  ],

  // ===== TIER 3: Bizkaia =====
  3: [
    'óptica Bilbao', 'taller mecánico Bilbao', 'farmacia Bilbao',
    'óptica Getxo', 'taller mecánico Getxo', 'farmacia Getxo',
    'óptica Barakaldo', 'taller mecánico Barakaldo', 'farmacia Barakaldo',
    'óptica Durango', 'taller mecánico Durango', 'farmacia Durango',
    'óptica Basauri', 'taller mecánico Basauri', 'farmacia Basauri',
    'óptica Leioa', 'taller mecánico Leioa', 'farmacia Leioa',
    'óptica Portugalete', 'taller mecánico Portugalete', 'farmacia Portugalete',
    'óptica Sestao', 'taller mecánico Sestao', 'farmacia Sestao',
  ],

  // ===== TIER 4: Navarra =====
  4: [
    'óptica Pamplona', 'taller mecánico Pamplona', 'farmacia Pamplona',
    'óptica Tudela', 'taller mecánico Tudela', 'farmacia Tudela',
    'óptica Estella', 'taller mecánico Estella', 'farmacia Estella',
    'óptica Tafalla', 'taller mecánico Tafalla', 'farmacia Tafalla',
    'óptica Burlada', 'taller mecánico Burlada', 'farmacia Burlada',
    'óptica Barañáin', 'taller mecánico Barañáin', 'farmacia Barañáin',
  ],

  // ===== TIER 5: Álava =====
  5: [
    'óptica Vitoria', 'taller mecánico Vitoria', 'farmacia Vitoria',
    'óptica Llodio', 'taller mecánico Llodio', 'farmacia Llodio',
    'óptica Amurrio', 'taller mecánico Amurrio', 'farmacia Amurrio',
  ],

  // ===== TIER 6: Cantabria + La Rioja + Burgos =====
  6: [
    'óptica Santander', 'taller mecánico Santander', 'farmacia Santander',
    'óptica Torrelavega', 'taller mecánico Torrelavega', 'farmacia Torrelavega',
    'óptica Castro Urdiales', 'taller mecánico Castro Urdiales', 'farmacia Castro Urdiales',
    'óptica Logroño', 'taller mecánico Logroño', 'farmacia Logroño',
    'óptica Calahorra', 'taller mecánico Calahorra', 'farmacia Calahorra',
    'óptica Burgos', 'taller mecánico Burgos', 'farmacia Burgos',
    'óptica Miranda de Ebro', 'taller mecánico Miranda de Ebro', 'farmacia Miranda de Ebro',
  ],

  // ===== TIER 7: Norte (Asturias, Galicia, León, Aragón) =====
  7: [
    'óptica Oviedo', 'taller mecánico Oviedo', 'farmacia Oviedo',
    'óptica Gijón', 'taller mecánico Gijón', 'farmacia Gijón',
    'óptica Coruña', 'taller mecánico Coruña', 'farmacia Coruña',
    'óptica Vigo', 'taller mecánico Vigo', 'farmacia Vigo',
    'óptica Santiago de Compostela', 'taller mecánico Santiago de Compostela', 'farmacia Santiago de Compostela',
    'óptica León', 'taller mecánico León', 'farmacia León',
    'óptica Zaragoza', 'taller mecánico Zaragoza', 'farmacia Zaragoza',
    'óptica Huesca', 'taller mecánico Huesca', 'farmacia Huesca',
  ],

  // ===== TIER 8: Resto España =====
  8: [
    'óptica Madrid', 'taller mecánico Madrid', 'farmacia Madrid',
    'óptica Barcelona', 'taller mecánico Barcelona', 'farmacia Barcelona',
    'óptica Valencia', 'taller mecánico Valencia', 'farmacia Valencia',
    'óptica Sevilla', 'taller mecánico Sevilla', 'farmacia Sevilla',
    'óptica Málaga', 'taller mecánico Málaga', 'farmacia Málaga',
    'óptica Bilbao', 'taller mecánico Murcia', 'farmacia Murcia',
    'óptica Palma', 'taller mecánico Palma', 'farmacia Palma',
    'óptica Alicante', 'taller mecánico Alicante', 'farmacia Alicante',
    'óptica Valladolid', 'taller mecánico Valladolid', 'farmacia Valladolid',
    'óptica Granada', 'taller mecánico Granada', 'farmacia Granada',
  ],
};

export const MAX_TIER = 8;

export const TIER_NAMES: Record<number, string> = {
  1: 'Irún + Hondarribia',
  2: 'Gipuzkoa',
  3: 'Bizkaia',
  4: 'Navarra',
  5: 'Álava',
  6: 'Cantabria + La Rioja + Burgos',
  7: 'Norte (Asturias, Galicia, León, Aragón)',
  8: 'Resto España (Madrid, Cataluña, Valencia, Andalucía...)',
};
