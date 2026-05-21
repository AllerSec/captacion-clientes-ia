/**
 * Queries por tier. Tier 1 = más cerca de Irún, Tier 8 = más lejos.
 * Sectores: óptica, taller mecánico, farmacia.
 * Solo contactamos negocios SIN web: el sistema descarta los que tienen.
 */
export const QUERIES_BY_TIER: Record<number, string[]> = {
  // ===== TIER 1: Irún + comarca + Bera + Bidasoa (alrededor de Tecmac/Unax) =====
  1: [
    // Gipuzkoa Oriental (Bidasoa + Donostialdea Este)
    'óptica Irún', 'taller mecánico Irún', 'farmacia Irún',
    'óptica Hondarribia', 'taller mecánico Hondarribia', 'farmacia Hondarribia',
    'óptica Pasaia', 'taller mecánico Pasaia', 'farmacia Pasaia',
    'óptica Lezo', 'taller mecánico Lezo', 'farmacia Lezo',
    'óptica Errenteria', 'taller mecánico Errenteria', 'farmacia Errenteria',
    'óptica Oiartzun', 'taller mecánico Oiartzun', 'farmacia Oiartzun',
    'óptica Astigarraga', 'taller mecánico Astigarraga', 'farmacia Astigarraga',
    // Navarra Norte (alrededor Bera/Tecmac)
    'óptica Bera', 'taller mecánico Bera', 'farmacia Bera',
    'óptica Lesaka', 'taller mecánico Lesaka', 'farmacia Lesaka',
    'óptica Elizondo', 'taller mecánico Elizondo', 'farmacia Elizondo',
    'óptica Baztan', 'taller mecánico Baztan', 'farmacia Baztan',
    // Industria (mecanizado) en Bidasoa + Navarra Norte
    'mecanizado Bera', 'taller de mecanizado Bera', 'caldereria Bera',
    'mecanizado Lesaka', 'taller de mecanizado Lesaka',
    'mecanizado Irún', 'caldereria Irún', 'ingeniería industrial Irún',
    'mecanizado Oiartzun', 'mecanizado Errenteria',
  ],

  // ===== TIER 2: Resto Gipuzkoa =====
  2: [
    'óptica Donostia', 'taller mecánico Donostia', 'farmacia Donostia',
    'óptica Tolosa', 'taller mecánico Tolosa', 'farmacia Tolosa',
    'óptica Eibar', 'taller mecánico Eibar', 'farmacia Eibar',
    'óptica Zarautz', 'taller mecánico Zarautz', 'farmacia Zarautz',
    'óptica Hernani', 'taller mecánico Hernani', 'farmacia Hernani',
    'óptica Andoain', 'taller mecánico Andoain', 'farmacia Andoain',
    'óptica Lasarte', 'taller mecánico Lasarte', 'farmacia Lasarte',
    'óptica Urnieta', 'taller mecánico Urnieta', 'farmacia Urnieta',
    'óptica Usurbil', 'taller mecánico Usurbil', 'farmacia Usurbil',
    'óptica Beasain', 'taller mecánico Beasain', 'farmacia Beasain',
    'óptica Azpeitia', 'taller mecánico Azpeitia', 'farmacia Azpeitia',
    'óptica Azkoitia', 'taller mecánico Azkoitia', 'farmacia Azkoitia',
    'óptica Zumarraga', 'taller mecánico Zumarraga', 'farmacia Zumarraga',
    'óptica Hondarribia', 'taller mecánico Hondarribia', 'farmacia Hondarribia',
    'mecanizado Eibar', 'caldereria Eibar', 'ingeniería industrial Eibar',
    'mecanizado Bergara', 'mecanizado Mondragón', 'mecanizado Arrasate',
    'mecanizado Tolosa', 'tornería industrial Gipuzkoa',
    'mecanizado Beasain', 'mecanizado Azpeitia',
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
    'óptica Altsasu', 'taller mecánico Altsasu', 'farmacia Altsasu',
    'óptica Alsasua', 'taller mecánico Alsasua', 'farmacia Alsasua',
    'óptica Zizur Mayor', 'taller mecánico Zizur Mayor', 'farmacia Zizur Mayor',
    'óptica Villava', 'taller mecánico Villava', 'farmacia Villava',
    'óptica Ansoáin', 'taller mecánico Ansoáin', 'farmacia Ansoáin',
    'óptica Berriozar', 'taller mecánico Berriozar', 'farmacia Berriozar',
    'óptica Huarte', 'taller mecánico Huarte', 'farmacia Huarte',
    'óptica Sangüesa', 'taller mecánico Sangüesa', 'farmacia Sangüesa',
    'óptica Cintruénigo', 'taller mecánico Cintruénigo', 'farmacia Cintruénigo',
    'óptica Corella', 'taller mecánico Corella', 'farmacia Corella',
    'óptica Peralta', 'taller mecánico Peralta', 'farmacia Peralta',
    'mecanizado Pamplona', 'caldereria Pamplona', 'ingeniería industrial Pamplona',
    'mecanizado Tudela', 'fabricación metálica Navarra',
    'mecanizado Altsasu', 'mecanizado Tafalla', 'mecanizado Estella',
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
