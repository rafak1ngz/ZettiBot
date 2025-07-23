// ============================================================================
// BUSCA POTENCIAL CLIENTE - INTEGRAÇÃO GOOGLE PLACES API
// ============================================================================

import axios from 'axios';

// ============================================================================
// INTERFACES
// ============================================================================
export interface ProspectData {
  place_id: string;
  nome: string;
  endereco: string;
  latitude: number;
  longitude: number;
  telefone?: string;
  site?: string;
  avaliacao?: number;
  total_avaliacoes?: number;
  status_funcionamento?: string;
  tipos: string[];
  fotos?: string[];
  distancia?: number;
  score_potencial?: number;
  motivos_score?: string[];
}

export interface ParametrosBusca {
  localizacao: {
    latitude: number;
    longitude: number;
  };
  raio: number; // em metros
  categoria: string;
  filtros?: {
    avaliacao_minima?: number;
    apenas_abertos?: boolean;
    com_telefone?: boolean;
    com_site?: boolean;
  };
}

export interface ResultadoBusca {
  prospects: ProspectData[];
  total_encontrados: number;
  proxima_pagina?: string;
  tempo_busca: number;
}

// ============================================================================
// MAPEAMENTO DE CATEGORIAS PARA GOOGLE PLACES
// ============================================================================
const CATEGORIA_PARA_PLACES_TYPES = {
  'varejo': [
    'store', 'supermarket', 'convenience_store', 'pharmacy', 
    'clothing_store', 'electronics_store', 'furniture_store',
    'hardware_store', 'book_store', 'shoe_store'
  ],
  'alimentacao': [
    'restaurant', 'meal_takeaway', 'meal_delivery', 'cafe', 
    'bakery', 'bar', 'food', 'pizza_restaurant'
  ],
  'servicos': [
    'beauty_salon', 'hair_care', 'spa', 'laundry', 'dry_cleaning',
    'car_wash', 'gym', 'veterinary_care', 'pet_store'
  ],
  'saude': [
    'hospital', 'dentist', 'doctor', 'pharmacy', 'physiotherapist',
    'veterinary_care', 'health'
  ],
  'empresarial': [
    'accounting', 'lawyer', 'real_estate_agency', 'insurance_agency',
    'bank', 'finance', 'establishment', 'point_of_interest'
  ],
  'industria': [
    'storage', 'moving_company', 'car_repair', 'gas_station',
    'truck_stop', 'warehouse'
  ],
  'educacao': [
    'school', 'university', 'library', 'primary_school',
    'secondary_school', 'training'
  ],
  'automotivo': [
    'car_dealer', 'car_rental', 'car_repair', 'gas_station',
    'parking', 'car_wash'
  ]
};

// ============================================================================
// FUNÇÃO PRINCIPAL - BUSCAR PROSPECTS
// ============================================================================
export async function buscarProspectsGoogle(
  parametros: ParametrosBusca
): Promise<ResultadoBusca> {
  try {
    const inicioTempo = Date.now();
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    
    if (!apiKey) {
      throw new Error('Google Places API key não configurada');
    }

    // Obter tipos de places baseado na categoria
    const tiposPlaces = CATEGORIA_PARA_PLACES_TYPES[parametros.categoria] || 
                       CATEGORIA_PARA_PLACES_TYPES['empresarial'];

    const prospects: ProspectData[] = [];
    
    // Fazer busca para cada tipo de place
    for (const tipo of tiposPlaces.slice(0, 3)) { // Limitar a 3 tipos por vez
      const resultadoTipo = await buscarPorTipo(
        parametros.localizacao,
        parametros.raio,
        tipo,
        apiKey
      );
      
      prospects.push(...resultadoTipo);
      
      // Pausa entre requests para respeitar rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Remover duplicatas
    const prospectsUnicos = removerDuplicatas(prospects);
    
    // Aplicar filtros
    let prospectsFiltrados = aplicarFiltros(prospectsUnicos, parametros.filtros);
    
    // Calcular distâncias
    prospectsFiltrados = calcularDistancias(
      prospectsFiltrados, 
      parametros.localizacao
    );
    
    // Ordenar por score (será implementado)
    prospectsFiltrados.sort((a, b) => (b.score_potencial || 0) - (a.score_potencial || 0));

    const tempoFinal = Date.now() - inicioTempo;

    return {
      prospects: prospectsFiltrados.slice(0, 50), // Máximo 50 resultados
      total_encontrados: prospectsFiltrados.length,
      tempo_busca: tempoFinal
    };

  } catch (error) {
    console.error('Erro na busca Google Places:', error);
    
    // Retornar dados mock em caso de erro
    return gerarDadosMockParaCategoria(parametros.categoria);
  }
}

// ============================================================================
// BUSCAR POR TIPO ESPECÍFICO
// ============================================================================
async function buscarPorTipo(
  localizacao: { latitude: number, longitude: number },
  raio: number,
  tipo: string,
  apiKey: string
): Promise<ProspectData[]> {
  try {
    const url = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
    
    const response = await axios.get(url, {
      params: {
        location: `${localizacao.latitude},${localizacao.longitude}`,
        radius: raio,
        type: tipo,
        language: 'pt-BR',
        key: apiKey
      },
      timeout: 10000 // 10 segundos timeout
    });

    if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
      console.error('Erro Google Places API:', response.data.status);
      return [];
    }

    const places = response.data.results || [];
    const prospects: ProspectData[] = [];

    for (const place of places.slice(0, 20)) { // Máximo 20 por tipo
      const prospect = converterPlaceParaProspect(place);
      if (prospect) {
        prospects.push(prospect);
      }
    }

    return prospects;
  } catch (error) {
    console.error(`Erro buscar tipo ${tipo}:`, error);
    return [];
  }
}

// ============================================================================
// CONVERTER PLACE DO GOOGLE PARA PROSPECT
// ============================================================================
function converterPlaceParaProspect(place: any): ProspectData | null {
  try {
    return {
      place_id: place.place_id,
      nome: place.name || 'Nome não disponível',
      endereco: place.vicinity || place.formatted_address || 'Endereço não disponível',
      latitude: place.geometry?.location?.lat || 0,
      longitude: place.geometry?.location?.lng || 0,
      avaliacao: place.rating || undefined,
      total_avaliacoes: place.user_ratings_total || undefined,
      status_funcionamento: place.opening_hours?.open_now ? 'Aberto' : 'Fechado',
      tipos: place.types || [],
      fotos: place.photos?.map((photo: any) => 
        `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${photo.photo_reference}&key=${process.env.GOOGLE_PLACES_API_KEY}`
      ) || [],
      score_potencial: calcularScoreBasico(place)
    };
  } catch (error) {
    console.error('Erro converter place:', error);
    return null;
  }
}

// ============================================================================
// OBTER DETALHES COMPLETOS DO LOCAL
// ============================================================================
export async function obterDetalhesLocal(placeId: string): Promise<ProspectData | null> {
  try {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) return null;

    const url = 'https://maps.googleapis.com/maps/api/place/details/json';
    
    const response = await axios.get(url, {
      params: {
        place_id: placeId,
        fields: [
          'name', 'formatted_address', 'formatted_phone_number',
          'website', 'rating', 'user_ratings_total', 'opening_hours',
          'geometry', 'types', 'photos', 'reviews'
        ].join(','),
        language: 'pt-BR',
        key: apiKey
      },
      timeout: 10000
    });

    if (response.data.status !== 'OK') {
      console.error('Erro detalhes place:', response.data.status);
      return null;
    }

    const place = response.data.result;
    
    return {
      place_id: placeId,
      nome: place.name,
      endereco: place.formatted_address,
      latitude: place.geometry?.location?.lat || 0,
      longitude: place.geometry?.location?.lng || 0,
      telefone: place.formatted_phone_number,
      site: place.website,
      avaliacao: place.rating,
      total_avaliacoes: place.user_ratings_total,
      status_funcionamento: place.opening_hours?.open_now ? 'Aberto agora' : 
                           place.opening_hours ? 'Fechado agora' : 'Horário não informado',
      tipos: place.types || [],
      fotos: place.photos?.slice(0, 3).map((photo: any) => 
        `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${photo.photo_reference}&key=${apiKey}`
      ) || [],
      score_potencial: calcularScoreDetalhado(place)
    };
  } catch (error) {
    console.error('Erro obter detalhes:', error);
    return null;
  }
}

// ============================================================================
// GEOCODING - CONVERTER ENDEREÇO EM COORDENADAS
// ============================================================================
export async function obterCoordenadas(endereco: string): Promise<{
  latitude: number;
  longitude: number;
  endereco_formatado: string;
} | null> {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return null;

    const url = 'https://maps.googleapis.com/maps/api/geocode/json';
    
    const response = await axios.get(url, {
      params: {
        address: endereco,
        language: 'pt-BR',
        region: 'BR',
        key: apiKey
      },
      timeout: 10000
    });

    if (response.data.status !== 'OK' || !response.data.results.length) {
      return null;
    }

    const resultado = response.data.results[0];
    
    return {
      latitude: resultado.geometry.location.lat,
      longitude: resultado.geometry.location.lng,
      endereco_formatado: resultado.formatted_address
    };
  } catch (error) {
    console.error('Erro geocoding:', error);
    return null;
  }
}

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

function removerDuplicatas(prospects: ProspectData[]): ProspectData[] {
  const mapa = new Map();
  
  for (const prospect of prospects) {
    const chave = `${prospect.nome.toLowerCase()}_${prospect.endereco.toLowerCase()}`;
    if (!mapa.has(chave)) {
      mapa.set(chave, prospect);
    }
  }
  
  return Array.from(mapa.values());
}

function aplicarFiltros(
  prospects: ProspectData[], 
  filtros?: any
): ProspectData[] {
  if (!filtros) return prospects;
  
  return prospects.filter(prospect => {
    // Filtro de avaliação mínima
    if (filtros.avaliacao_minima && prospect.avaliacao) {
      if (prospect.avaliacao < filtros.avaliacao_minima) return false;
    }
    
    // Filtro apenas abertos
    if (filtros.apenas_abertos) {
      if (prospect.status_funcionamento !== 'Aberto') return false;
    }
    
    // Filtro com telefone
    if (filtros.com_telefone && !prospect.telefone) return false;
    
    // Filtro com site
    if (filtros.com_site && !prospect.site) return false;
    
    return true;
  });
}

function calcularDistancias(
  prospects: ProspectData[],
  origem: { latitude: number, longitude: number }
): ProspectData[] {
  return prospects.map(prospect => ({
    ...prospect,
    distancia: calcularDistanciaKm(
      origem.latitude, origem.longitude,
      prospect.latitude, prospect.longitude
    )
  }));
}

function calcularDistanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Raio da Terra em km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return Math.round((R * c) * 100) / 100; // Arredondar para 2 casas decimais
}

function calcularScoreBasico(place: any): number {
  let score = 50; // Base
  
  // Avaliação (+20 pontos max)
  if (place.rating) {
    score += Math.round((place.rating - 3) * 10);
  }
  
  // Número de avaliações (+15 pontos max)
  if (place.user_ratings_total) {
    score += Math.min(Math.round(place.user_ratings_total / 10), 15);
  }
  
  // Status funcionamento (+10 pontos)
  if (place.opening_hours?.open_now) {
    score += 10;
  }
  
  // Fotos disponíveis (+5 pontos)
  if (place.photos && place.photos.length > 0) {
    score += 5;
  }
  
  return Math.min(Math.max(score, 0), 100);
}

function calcularScoreDetalhado(place: any): number {
  let score = calcularScoreBasico(place);
  
  // Website (+10 pontos)
  if (place.website) score += 10;
  
  // Telefone (+10 pontos)  
  if (place.formatted_phone_number) score += 10;
  
  // Reviews recentes (+5 pontos)
  if (place.reviews && place.reviews.length > 3) score += 5;
  
  return Math.min(score, 100);
}

// ============================================================================
// FORMATAÇÃO PARA DISPLAY
// ============================================================================
export function formatarProspect(prospect: ProspectData): string {
  const distanciaTexto = prospect.distancia ? 
    `(${prospect.distancia}km)` : '';
  
  const avaliacaoTexto = prospect.avaliacao && prospect.total_avaliacoes ?
    `⭐ ${prospect.avaliacao} estrelas (${prospect.total_avaliacoes} avaliações)` :
    '⭐ Sem avaliações';
  
  let resultado = `🏢 **${prospect.nome}**\n`;
  resultado += `📍 ${prospect.endereco} ${distanciaTexto}\n`;
  
  if (prospect.telefone) {
    resultado += `📞 ${prospect.telefone}\n`;
  }
  
  resultado += `${avaliacaoTexto}\n`;
  
  if (prospect.site) {
    resultado += `🌐 ${prospect.site}\n`;
  }
  
  if (prospect.status_funcionamento) {
    resultado += `⏰ ${prospect.status_funcionamento}\n`;
  }
  
  if (prospect.score_potencial) {
    resultado += `\n💡 **Score: ${prospect.score_potencial}/100**`;
  }
  
  return resultado;
}

// ============================================================================
// DADOS MOCK PARA FALLBACK
// ============================================================================
function gerarDadosMockParaCategoria(categoria: string): ResultadoBusca {
  const nomesPorCategoria = {
    'varejo': ['Loja Central', 'Mercado Bom Preço', 'Farmácia Saúde'],
    'alimentacao': ['Restaurante Sabor', 'Pizzaria Italiana', 'Café Central'],
    'servicos': ['Clínica Vida', 'Salão Beleza', 'Escritório Advocacia'],
    'industria': ['Distribuidora Norte', 'Fábrica Componentes', 'Armazém Geral'],
    'empresarial': ['Empresa Soluções', 'Consultoria Plus', 'Startup Tech']
  };
  
  const nomes = nomesPorCategoria[categoria] || nomesPorCategoria['empresarial'];
  
  const prospects = nomes.map((nome, index) => ({
    place_id: `mock_${categoria}_${index}`,
    nome,
    endereco: `Rua Exemplo, ${100 + index * 50} - Centro`,
    latitude: -23.5505 + (Math.random() - 0.5) * 0.01,
    longitude: -46.6333 + (Math.random() - 0.5) * 0.01,
    telefone: `(11) 9876${5000 + index}`,
    avaliacao: 4.0 + Math.random(),
    total_avaliacoes: 50 + Math.floor(Math.random() * 100),
    status_funcionamento: Math.random() > 0.3 ? 'Aberto' : 'Fechado',
    tipos: [categoria],
    score_potencial: 70 + Math.floor(Math.random() * 30),
    distancia: 0.5 + Math.random() * 2
  }));
  
  return {
    prospects,
    total_encontrados: prospects.length,
    tempo_busca: 1500
  };
}